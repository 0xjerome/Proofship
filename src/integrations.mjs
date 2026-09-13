const jsonHeaders = { 'content-type': 'application/json' };

async function request(url, options = {}) {
  const res = await fetch(url, options);
  const text = await res.text();
  let body;
  try { body = text ? JSON.parse(text) : {}; } catch { body = { raw: text }; }
  if (!res.ok) throw new Error(`${res.status} ${url}: ${text.slice(0, 500)}`);
  return body;
}

export async function githubCommit({ repo, sha }) {
  const token = process.env.GITHUB_TOKEN;
  if (!token) return { sha, repo, message: 'Demo checkout regression', author: 'demo', simulated: true };
  return request(`https://api.github.com/repos/${repo}/commits/${sha}`, {
    headers: { authorization: `Bearer ${token}`, accept: 'application/vnd.github+json', 'user-agent': 'proofship' }
  });
}

export async function githubComment({ repo, issueNumber, body }) {
  const token = process.env.GITHUB_TOKEN;
  if (!token || !issueNumber) return { simulated: true, app: 'github', body };
  return request(`https://api.github.com/repos/${repo}/issues/${issueNumber}/comments`, {
    method: 'POST', headers: { ...jsonHeaders, authorization: `Bearer ${token}`, accept: 'application/vnd.github+json', 'user-agent': 'proofship' }, body: JSON.stringify({ body })
  });
}

export async function vercelDeployment({ deploymentId }) {
  const token = process.env.VERCEL_TOKEN;
  if (!token) return { id: deploymentId || 'dpl_demo', readyState: 'READY', url: process.env.DEMO_TARGET_URL || 'http://localhost:8787/demo-app', simulated: true };
  return request(`https://api.vercel.com/v13/deployments/${deploymentId}`, { headers: { authorization: `Bearer ${token}` } });
}

export async function vercelRollback({ projectId, deploymentId }) {
  const token = process.env.VERCEL_TOKEN;
  if (!token || !projectId) return { simulated: true, app: 'vercel', deploymentId, action: 'rollback' };
  return request(`https://api.vercel.com/v9/projects/${projectId}/rollback/${deploymentId}`, {
    method: 'POST', headers: { ...jsonHeaders, authorization: `Bearer ${token}` }
  });
}

export async function slackNotify(text) {
  const webhook = process.env.SLACK_WEBHOOK_URL;
  if (!webhook) return { simulated: true, app: 'slack', text };
  const res = await fetch(webhook, { method: 'POST', headers: jsonHeaders, body: JSON.stringify({ text }) });
  if (!res.ok) throw new Error(`Slack ${res.status}: ${await res.text()}`);
  return { ok: true };
}

export async function linearCreateIssue({ title, description }) {
  const token = process.env.LINEAR_API_KEY;
  const teamId = process.env.LINEAR_TEAM_ID;
  if (!token || !teamId) return { simulated: true, app: 'linear', identifier: 'ENG-142', title };
  const query = `mutation IssueCreate($input: IssueCreateInput!) { issueCreate(input: $input) { success issue { id identifier url title } } }`;
  const result = await request('https://api.linear.app/graphql', {
    method: 'POST', headers: { ...jsonHeaders, authorization: token }, body: JSON.stringify({ query, variables: { input: { teamId, title, description } } })
  });
  if (result.errors) throw new Error(JSON.stringify(result.errors));
  return result.data.issueCreate.issue;
}
