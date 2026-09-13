const jsonHeaders = { 'content-type': 'application/json' };

function teamQuery(teamId) {
  return teamId ? `?teamId=${encodeURIComponent(teamId)}` : '';
}

async function request(url, options = {}) {
  const res = await fetch(url, { ...options, signal: options.signal || AbortSignal.timeout(12000) });
  const text = await res.text();
  let body;
  try { body = text ? JSON.parse(text) : {}; }
  catch { body = { raw: text }; }
  if (!res.ok) throw new Error(`${res.status} ${url}: ${text.slice(0, 500)}`);
  return body;
}

export async function githubCommit({ repo, sha, simulate = false }) {
  const token = process.env.GITHUB_TOKEN;
  if (simulate) return { sha, repo, message: 'Release commit inspected', author: 'demo', simulated: true };
  if (!token) throw new Error('GITHUB_TOKEN is not configured.');
  return request(`https://api.github.com/repos/${repo}/commits/${sha}`, {
    headers: { authorization: `Bearer ${token}`, accept: 'application/vnd.github+json', 'user-agent': 'proofship' }
  });
}

export async function githubComment({ repo, issueNumber, body, simulate = false }) {
  const token = process.env.GITHUB_TOKEN;
  if (simulate) return { simulated: true, app: 'github', body };
  if (!token) return { skipped: true, app: 'github', reason: 'GITHUB_TOKEN is not configured.' };
  if (!issueNumber) return { skipped: true, app: 'github', reason: 'No pull request or issue number was supplied.' };
  return request(`https://api.github.com/repos/${repo}/issues/${issueNumber}/comments`, {
    method: 'POST',
    headers: { ...jsonHeaders, authorization: `Bearer ${token}`, accept: 'application/vnd.github+json', 'user-agent': 'proofship' },
    body: JSON.stringify({ body })
  });
}

export async function vercelDeployment({ deploymentId, teamId, simulate = false }) {
  const token = process.env.VERCEL_TOKEN;
  if (simulate) {
    return {
      id: deploymentId || 'dpl_demo',
      readyState: 'READY',
      url: process.env.DEMO_TARGET_URL || 'http://localhost:8787/demo-app',
      simulated: true
    };
  }
  if (!token) throw new Error('VERCEL_TOKEN is not configured.');
  return request(`https://api.vercel.com/v13/deployments/${encodeURIComponent(deploymentId)}${teamQuery(teamId || process.env.VERCEL_TEAM_ID)}`, {
    headers: { authorization: `Bearer ${token}` }
  });
}

async function previousProductionDeployment({ projectId, badDeploymentId, teamId }) {
  const token = process.env.VERCEL_TOKEN;
  const query = new URLSearchParams({ projectId, target: 'production', limit: '10' });
  if (teamId || process.env.VERCEL_TEAM_ID) query.set('teamId', teamId || process.env.VERCEL_TEAM_ID);
  const body = await request(`https://api.vercel.com/v6/deployments?${query.toString()}`, {
    headers: { authorization: `Bearer ${token}` }
  });
  const deployments = Array.isArray(body.deployments) ? body.deployments : [];
  return deployments.find((deployment) => {
    const id = deployment.uid || deployment.id;
    const ready = ['READY', 'ready'].includes(deployment.readyState || deployment.state);
    return id && id !== badDeploymentId && ready;
  }) || null;
}

export async function vercelRollback({ projectId, badDeploymentId, rollbackDeploymentId, teamId, simulate = false }) {
  const token = process.env.VERCEL_TOKEN;
  if (simulate) {
    return {
      simulated: true,
      app: 'vercel',
      fromDeploymentId: badDeploymentId,
      toDeploymentId: rollbackDeploymentId || 'previous-production-deployment',
      action: 'rollback'
    };
  }
  if (!token) return { skipped: true, app: 'vercel', reason: 'VERCEL_TOKEN is not configured.' };
  if (!projectId) return { skipped: true, app: 'vercel', reason: 'No Vercel project ID was supplied.' };

  let targetDeploymentId = rollbackDeploymentId || process.env.VERCEL_ROLLBACK_DEPLOYMENT_ID;
  if (!targetDeploymentId) {
    const previous = await previousProductionDeployment({ projectId, badDeploymentId, teamId });
    targetDeploymentId = previous?.uid || previous?.id;
  }
  if (!targetDeploymentId) {
    return {
      skipped: true,
      app: 'vercel',
      reason: 'No known-good previous production deployment could be resolved.'
    };
  }

  const result = await request(
    `https://api.vercel.com/v1/projects/${encodeURIComponent(projectId)}/rollback/${encodeURIComponent(targetDeploymentId)}${teamQuery(teamId || process.env.VERCEL_TEAM_ID)}`,
    { method: 'POST', headers: { authorization: `Bearer ${token}` } }
  );
  return { ...result, fromDeploymentId: badDeploymentId, toDeploymentId: targetDeploymentId };
}

export async function slackNotify(text, { simulate = false } = {}) {
  const webhook = process.env.SLACK_WEBHOOK_URL;
  if (simulate) return { simulated: true, app: 'slack', text };
  if (!webhook) return { skipped: true, app: 'slack', reason: 'SLACK_WEBHOOK_URL is not configured.' };
  const res = await fetch(webhook, {
    method: 'POST',
    headers: jsonHeaders,
    body: JSON.stringify({ text }),
    signal: AbortSignal.timeout(12000)
  });
  if (!res.ok) throw new Error(`Slack ${res.status}: ${(await res.text()).slice(0, 500)}`);
  return { ok: true };
}

export async function linearCreateIssue({ title, description, simulate = false }) {
  const token = process.env.LINEAR_API_KEY;
  const teamId = process.env.LINEAR_TEAM_ID;
  if (simulate) return { simulated: true, app: 'linear', identifier: 'ENG-142', title };
  if (!token || !teamId) return { skipped: true, app: 'linear', reason: 'LINEAR_API_KEY and LINEAR_TEAM_ID are required.' };
  const query = `mutation IssueCreate($input: IssueCreateInput!) { issueCreate(input: $input) { success issue { id identifier url title } } }`;
  const result = await request('https://api.linear.app/graphql', {
    method: 'POST',
    headers: { ...jsonHeaders, authorization: token },
    body: JSON.stringify({ query, variables: { input: { teamId, title, description } } })
  });
  if (result.errors?.length) throw new Error(JSON.stringify(result.errors));
  if (!result.data?.issueCreate?.success || !result.data?.issueCreate?.issue) {
    throw new Error('Linear issueCreate did not return a successful issue.');
  }
  return result.data.issueCreate.issue;
}
