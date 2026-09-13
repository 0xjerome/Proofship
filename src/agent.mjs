import crypto from 'node:crypto';
import { githubCommit, githubComment, linearCreateIssue, slackNotify, vercelDeployment, vercelRollback } from './integrations.mjs';
import { runAcceptanceChecks } from './checks.mjs';
import { diagnoseWithLLM } from './llm.mjs';
import { decidePolicy } from './policy.mjs';
import { releaseFingerprint } from './idempotency.mjs';
import { findRunByFingerprint, saveRun } from './store.mjs';
import { validateReleaseInput } from './validate.mjs';

function event(app, kind, message, data = {}) {
  return { at: new Date().toISOString(), app, kind, message, data };
}

function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function executeAction(run, { app, action, successMessage, fn }) {
  try {
    const result = await fn();
    const ok = !result?.skipped;
    run.actions.push({ app, action, ok, result });
    run.events.push(event(app, ok ? 'action' : 'action_warning', ok ? successMessage : `${action} skipped: ${result.reason || 'not available'}`, { ok }));
    return result;
  } catch (error) {
    const result = { error: error.message };
    run.actions.push({ app, action, ok: false, result });
    run.events.push(event(app, 'action_error', `${action} failed: ${error.message}`, { ok: false }));
    return result;
  }
}

async function reverifyRecovery(run, input, targetUrl) {
  const checks = input.recoveryChecks || input.checks;
  const recoveryUrl = input.recoveryTargetUrl || (String(input.source || '').startsWith('vercel-webhook:') ? null : targetUrl);
  if (!recoveryUrl) {
    run.events.push(event('proofship', 'recovery_check', 'Rollback was accepted, but no production recovery URL is configured for reverification.'));
    return { attempted: false, verified: false, attempts: 0, checks: [], reason: 'No recovery target URL configured.' };
  }
  const retries = Math.max(1, Math.min(Number(process.env.PROOFSHIP_RECOVERY_RETRIES || 3), 5));
  const delayMs = Math.max(0, Math.min(Number(process.env.PROOFSHIP_RECOVERY_DELAY_MS || 1500), 10000));
  let results = [];

  for (let attempt = 1; attempt <= retries; attempt += 1) {
    if (attempt > 1 && delayMs) await wait(delayMs);
    results = await runAcceptanceChecks(recoveryUrl, checks);
    const verified = results.length > 0 && results.every((check) => check.passed);
    run.events.push(event(
      'proofship',
      verified ? 'recovered' : 'recovery_check',
      verified ? 'PRODUCTION RESTORED — recovery checks passed' : `Recovery verification attempt ${attempt}/${retries} did not pass`,
      { attempt, checks: results.map((check) => ({ name: check.name, passed: check.passed })) }
    ));
    if (verified) return { attempted: true, verified: true, attempts: attempt, checks: results };
  }
  return { attempted: true, verified: false, attempts: retries, checks: results };
}

export async function runReleaseAgent(rawInput) {
  const validation = validateReleaseInput(rawInput);
  if (!validation.ok) {
    return {
      id: crypto.randomUUID(),
      createdAt: new Date().toISOString(),
      completedAt: new Date().toISOString(),
      status: 'invalid',
      errors: validation.errors,
      events: [event('proofship', 'error', 'Release request failed validation.', { errors: validation.errors })],
      checks: [],
      actions: []
    };
  }

  const input = validation.value;
  const fingerprint = releaseFingerprint(input);
  if (!input.force) {
    const previous = await findRunByFingerprint(fingerprint);
    if (previous) {
      return {
        ...previous,
        duplicate: true,
        duplicateOf: previous.id,
        duplicateDetectedAt: new Date().toISOString()
      };
    }
  }

  const run = {
    id: crypto.randomUUID(),
    fingerprint,
    createdAt: new Date().toISOString(),
    status: 'running',
    mode: input.simulateExternal ? 'simulation' : 'live',
    source: input.source || 'manual',
    goal: input.goal || 'Verify the release works in production',
    input,
    events: [],
    checks: [],
    actions: []
  };
  await saveRun(run);

  try {
    let commit = null;
    try {
      commit = await githubCommit({ repo: input.repo, sha: input.sha, simulate: input.simulateExternal });
      run.events.push(event('github', 'evidence', `Commit ${input.sha.slice(0, 7)} inspected`, {
        message: commit.commit?.message || commit.message,
        simulated: Boolean(commit.simulated)
      }));
    } catch (error) {
      run.events.push(event('github', 'evidence_error', `Commit inspection failed: ${error.message}`));
    }

    let deployment = null;
    let deploymentReady = false;
    try {
      deployment = await vercelDeployment({
        deploymentId: input.deploymentId,
        teamId: input.vercelTeamId,
        simulate: input.simulateExternal
      });
      deploymentReady = ['READY', 'ready'].includes(deployment.readyState || deployment.state);
      run.events.push(event('vercel', deploymentReady ? 'pass' : 'fail', `Deployment is ${deployment.readyState || deployment.state || 'unknown'}`, {
        simulated: Boolean(deployment.simulated)
      }));
    } catch (error) {
      run.events.push(event('vercel', 'fail', `Deployment evidence unavailable: ${error.message}`));
    }

    const deploymentUrl = deployment?.url;
    const targetUrl = input.targetUrl || (deploymentUrl?.startsWith('http') ? deploymentUrl : deploymentUrl ? `https://${deploymentUrl}` : null);
    run.targetUrl = targetUrl;
    run.checks = await runAcceptanceChecks(targetUrl, input.checks);

    for (const check of run.checks) {
      run.events.push(event('proofship', check.passed ? 'pass' : 'fail', `${check.name}: ${check.passed ? 'PASS' : 'FAIL'}`, {
        detail: check.detail,
        url: check.url,
        durationMs: check.durationMs
      }));
    }

    const failedChecks = run.checks.filter((check) => !check.passed);
    const diagnosis = await diagnoseWithLLM({
      repo: input.repo,
      sha: input.sha,
      deployment: { ready: deploymentReady, targetUrl },
      failedChecks,
      checks: run.checks,
      commitMessage: commit?.commit?.message || commit?.message
    });
    run.diagnosis = diagnosis;
    run.events.push(event('ai', 'reasoning', diagnosis.summary, {
      cause: diagnosis.cause,
      confidence: diagnosis.confidence,
      source: diagnosis.source,
      fallbackReason: diagnosis.fallbackReason
    }));

    const policy = decidePolicy({ deploymentReady, checks: run.checks, diagnosis });
    run.policy = policy;

    if (policy.status === 'failed') {
      const incidentDescription = `ProofShip detected a release regression.\n\nCommit: ${input.sha}\nDeployment: ${input.deploymentId}\nTarget: ${targetUrl || 'unknown'}\nReason: ${policy.reason}\nDiagnosis: ${diagnosis.summary}\n\nFailed checks:\n${failedChecks.map((check) => `- ${check.name}: ${check.detail}`).join('\n')}`;

      const linear = await executeAction(run, {
        app: 'linear',
        action: 'create_issue',
        successMessage: 'Regression incident created',
        fn: () => linearCreateIssue({
          title: `Release regression: ${failedChecks[0]?.name || input.sha.slice(0, 7)}`,
          description: incidentDescription,
          simulate: input.simulateExternal
        })
      });
      const incidentRef = linear.identifier || linear.id || 'incident unavailable';

      await executeAction(run, {
        app: 'github',
        action: 'comment',
        successMessage: 'GitHub notified with production evidence',
        fn: () => githubComment({
          repo: input.repo,
          issueNumber: input.prNumber,
          simulate: input.simulateExternal,
          body: `⚠️ **ProofShip blocked this release.**\n\n${policy.reason}\n\n${failedChecks.map((check) => `- ❌ ${check.name}: ${check.detail}`).join('\n')}\n\nDiagnosis: ${diagnosis.summary}\n\nIncident: ${incidentRef}`
        })
      });

      await executeAction(run, {
        app: 'slack',
        action: 'notify',
        successMessage: 'Slack incident notification sent',
        fn: () => slackNotify(`🚨 ProofShip blocked release ${input.sha.slice(0, 7)}: ${policy.reason} Incident: ${incidentRef}.`, {
          simulate: input.simulateExternal
        })
      });

      if (policy.action === 'rollback') {
        const autoRollback = input.simulateExternal || input.autoRollback === true || process.env.PROOFSHIP_AUTO_ROLLBACK === 'true';
        if (autoRollback) {
          const rollback = await executeAction(run, {
            app: 'vercel',
            action: 'rollback',
            successMessage: 'Rollback accepted',
            fn: () => vercelRollback({
              projectId: input.vercelProjectId,
              badDeploymentId: input.deploymentId,
              rollbackDeploymentId: input.rollbackDeploymentId,
              teamId: input.vercelTeamId,
              simulate: input.simulateExternal
            })
          });
          if (!rollback?.error && !rollback?.skipped) {
            run.recovery = await reverifyRecovery(run, input, targetUrl);
          }
        } else {
          run.actions.push({ app: 'vercel', action: 'rollback_recommended', ok: true, result: { requiresApproval: true } });
          run.events.push(event('vercel', 'approval', 'Rollback recommended; automatic rollback is disabled for live releases.'));
        }
      }
    }

    run.status = policy.status;
    run.serviceStatus = run.recovery?.verified ? 'recovered' : (policy.status === 'verified' ? 'healthy' : 'at-risk');
    run.completedAt = new Date().toISOString();
    run.integrationFailures = run.actions.filter((action) => !action.ok).length;
    run.events.push(event(
      'proofship',
      policy.status === 'verified' ? 'verified' : run.recovery?.verified ? 'recovered' : 'complete',
      policy.status === 'verified'
        ? 'VERIFIED IN PRODUCTION'
        : run.recovery?.verified
          ? 'BAD RELEASE BLOCKED — PREVIOUS PRODUCTION RESTORED'
          : `Release blocked with evidence${run.integrationFailures ? `; ${run.integrationFailures} external action(s) need attention` : ''}`
    ));
    await saveRun(run);
    return run;
  } catch (error) {
    run.status = 'error';
    run.serviceStatus = 'unknown';
    run.error = error.message;
    run.completedAt = new Date().toISOString();
    run.events.push(event('proofship', 'error', error.message));
    await saveRun(run);
    return run;
  }
}
