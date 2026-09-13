import crypto from 'node:crypto';
import { githubCommit, githubComment, linearCreateIssue, slackNotify, vercelDeployment, vercelRollback } from './integrations.mjs';
import { runAcceptanceChecks } from './checks.mjs';
import { diagnoseWithLLM } from './llm.mjs';
import { decidePolicy } from './policy.mjs';
import { saveRun } from './store.mjs';

function event(app, kind, message, data = {}) {
  return { at: new Date().toISOString(), app, kind, message, data };
}

export async function runReleaseAgent(input) {
  const run = {
    id: crypto.randomUUID(),
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

    run.checks = await runAcceptanceChecks(targetUrl, input.checks);
    for (const c of run.checks) run.events.push(event('proofship', c.passed ? 'pass' : 'fail', `${c.name}: ${c.passed ? 'PASS' : 'FAIL'}`, { detail: c.detail, url: c.url }));

    const failedChecks = run.checks.filter((c) => !c.passed);
    const diagnosis = await diagnoseWithLLM({ repo: input.repo, sha: input.sha, deployment: { ready: deploymentReady, targetUrl }, failedChecks, checks: run.checks });
    run.diagnosis = diagnosis;
    run.events.push(event('ai', 'reasoning', diagnosis.summary, { cause: diagnosis.cause, confidence: diagnosis.confidence, source: diagnosis.source }));

    const policy = decidePolicy({ deploymentReady, checks: run.checks, diagnosis });
    run.policy = policy;

    if (policy.status === 'failed') {
      const incidentDescription = `ProofShip detected a release regression.\n\nCommit: ${input.sha}\nDeployment: ${input.deploymentId}\nReason: ${policy.reason}\nDiagnosis: ${diagnosis.summary}\n\nFailed checks:\n${failedChecks.map((c) => `- ${c.name}: ${c.detail}`).join('\n')}`;
      const linear = await linearCreateIssue({ title: `Release regression: ${failedChecks[0]?.name || input.sha.slice(0, 7)}`, description: incidentDescription });
      run.actions.push({ app: 'linear', action: 'create_issue', result: linear });
      run.events.push(event('linear', 'action', `Incident ${linear.identifier || linear.id || 'created'} created`));

      const gh = await githubComment({ repo: input.repo, issueNumber: input.prNumber, body: `⚠️ **ProofShip blocked this release.**\n\n${policy.reason}\n\n${failedChecks.map((c) => `- ❌ ${c.name}: ${c.detail}`).join('\n')}\n\nDiagnosis: ${diagnosis.summary}` });
      run.actions.push({ app: 'github', action: 'comment', result: gh });
      run.events.push(event('github', 'action', 'PR notified with production evidence'));

      const slack = await slackNotify(`🚨 ProofShip blocked release ${input.sha.slice(0, 7)}: ${policy.reason} Incident: ${linear.identifier || 'created'}.`);
      run.actions.push({ app: 'slack', action: 'notify', result: slack });
      run.events.push(event('slack', 'action', 'Incident notification sent'));

      if (policy.action === 'rollback') {
        const rollback = await vercelRollback({ projectId: input.vercelProjectId, deploymentId: input.deploymentId });
        run.actions.push({ app: 'vercel', action: 'rollback', result: rollback });
        run.events.push(event('vercel', 'action', 'Rollback initiated'));
      }
    }

    run.status = policy.status;
    run.completedAt = new Date().toISOString();
    run.events.push(event('proofship', policy.status === 'verified' ? 'verified' : 'complete', policy.status === 'verified' ? 'VERIFIED IN PRODUCTION' : 'Release blocked with evidence'));
    await saveRun(run);
    return run;
  } catch (error) {
    run.status = 'error';
    run.error = error.message;
    run.events.push(event('proofship', 'error', error.message));
    await saveRun(run);
    return run;
  }
}
