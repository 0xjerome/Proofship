import crypto from 'node:crypto';
import { githubCommit, githubComment, linearCreateIssue, slackNotify, vercelDeployment, vercelRollback } from './integrations.mjs';
import { runAcceptanceChecks } from './checks.mjs';
import { diagnoseWithLLM } from './llm.mjs';
import { decidePolicy } from './policy.mjs';
import { releaseFingerprint } from './idempotency.mjs';
import { findRunByFingerprint, saveRun } from './store.mjs';

function event(app, kind, message, data = {}) {
  return { at: new Date().toISOString(), app, kind, message, data };
}

async function executeAction(run, { app, action, successMessage, fn }) {
  try {
    const result = await fn();
    run.actions.push({ app, action, ok: true, result });
    run.events.push(event(app, 'action', successMessage, { ok: true }));
    return result;
  } catch (error) {
    const result = { error: error.message };
    run.actions.push({ app, action, ok: false, result });
    run.events.push(event(app, 'action_error', `${action} failed: ${error.message}`, { ok: false }));
    return result;
  }
}

export async function runReleaseAgent(input) {
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
    goal: input.goal || 'Verify the release works in production',
    input,
    events: [],
    checks: [],
    actions: []
  };
  await saveRun(run);

  try {
    const commit = await githubCommit({ repo: input.repo, sha: input.sha });
    run.events.push(event('github', 'evidence', `Commit ${input.sha.slice(0, 7)} inspected`, { message: commit.commit?.message || commit.message }));

    const deployment = await vercelDeployment({ deploymentId: input.deploymentId });
    const deploymentReady = ['READY', 'ready'].includes(deployment.readyState || deployment.state);
    const targetUrl = input.targetUrl || (deployment.url?.startsWith('http') ? deployment.url : deployment.url ? `https://${deployment.url}` : null);
    run.events.push(event('vercel', deploymentReady ? 'pass' : 'fail', `Deployment is ${deployment.readyState || deployment.state || 'unknown'}`, { targetUrl }));

    run.checks = targetUrl
      ? await runAcceptanceChecks(targetUrl, input.checks)
      : (input.checks || []).map((check) => ({ ...check, passed: false, detail: 'No production target URL was available.' }));

    for (const c of run.checks) {
      run.events.push(event('proofship', c.passed ? 'pass' : 'fail', `${c.name}: ${c.passed ? 'PASS' : 'FAIL'}`, { detail: c.detail, url: c.url }));
    }

    const failedChecks = run.checks.filter((c) => !c.passed);
    const diagnosis = await diagnoseWithLLM({ repo: input.repo, sha: input.sha, deployment: { ready: deploymentReady, targetUrl }, failedChecks, checks: run.checks });
    run.diagnosis = diagnosis;
    run.events.push(event('ai', 'reasoning', diagnosis.summary, { cause: diagnosis.cause, confidence: diagnosis.confidence, source: diagnosis.source }));

    const policy = decidePolicy({ deploymentReady, checks: run.checks, diagnosis });
    run.policy = policy;

    if (policy.status === 'failed') {
      const incidentDescription = `ProofShip detected a release regression.\n\nCommit: ${input.sha}\nDeployment: ${input.deploymentId}\nReason: ${policy.reason}\nDiagnosis: ${diagnosis.summary}\n\nFailed checks:\n${failedChecks.map((c) => `- ${c.name}: ${c.detail}`).join('\n')}`;

      const linear = await executeAction(run, {
        app: 'linear',
        action: 'create_issue',
        successMessage: 'Regression incident created',
        fn: () => linearCreateIssue({
          title: `Release regression: ${failedChecks[0]?.name || input.sha.slice(0, 7)}`,
          description: incidentDescription
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
          body: `⚠️ **ProofShip blocked this release.**\n\n${policy.reason}\n\n${failedChecks.map((c) => `- ❌ ${c.name}: ${c.detail}`).join('\n')}\n\nDiagnosis: ${diagnosis.summary}\n\nIncident: ${incidentRef}`
        })
      });

      await executeAction(run, {
        app: 'slack',
        action: 'notify',
        successMessage: 'Slack incident notification sent',
        fn: () => slackNotify(`🚨 ProofShip blocked release ${input.sha.slice(0, 7)}: ${policy.reason} Incident: ${incidentRef}.`)
      });

      if (policy.action === 'rollback') {
        await executeAction(run, {
          app: 'vercel',
          action: 'rollback',
          successMessage: 'Rollback initiated',
          fn: () => vercelRollback({ projectId: input.vercelProjectId, deploymentId: input.deploymentId })
        });
      }
    }

    run.status = policy.status;
    run.completedAt = new Date().toISOString();
    run.integrationFailures = run.actions.filter((action) => !action.ok).length;
    run.events.push(event(
      'proofship',
      policy.status === 'verified' ? 'verified' : 'complete',
      policy.status === 'verified'
        ? 'VERIFIED IN PRODUCTION'
        : `Release blocked with evidence${run.integrationFailures ? `; ${run.integrationFailures} external action(s) need attention` : ''}`
    ));
    await saveRun(run);
    return run;
  } catch (error) {
    run.status = 'error';
    run.error = error.message;
    run.completedAt = new Date().toISOString();
    run.events.push(event('proofship', 'error', error.message));
    await saveRun(run);
    return run;
  }
}
