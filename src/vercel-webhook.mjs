import crypto from 'node:crypto';
import { envBoolean, parseChecksJson } from './config.mjs';

export function signVercelWebhookBody(body, secret) {
  return crypto.createHmac('sha1', secret).update(body).digest('hex');
}

export function verifyVercelWebhookSignature({ body, signature, secret }) {
  if (!secret) return { required: true, configured: false, verified: false };
  if (!signature) return { required: true, configured: true, verified: false };
  const expected = Buffer.from(signVercelWebhookBody(body, secret));
  const actual = Buffer.from(String(signature));
  if (expected.length !== actual.length) return { required: true, configured: true, verified: false };
  return { required: true, configured: true, verified: crypto.timingSafeEqual(expected, actual) };
}

function repositoryFrom(meta = {}, env = process.env) {
  if (env.PROOFSHIP_REPO) return env.PROOFSHIP_REPO;
  const owner = meta.githubOrg || meta.githubCommitOrg || meta.gitOrg;
  const repo = meta.githubRepo || meta.githubCommitRepo || meta.gitRepo;
  return owner && repo ? `${owner}/${repo}` : '';
}

export function adaptVercelWebhook(event, env = process.env) {
  if (!event || typeof event !== 'object') return { ignored: true, reason: 'Invalid Vercel webhook payload.' };
  const supported = new Set(['deployment.ready', 'deployment.succeeded', 'deployment.promoted']);
  if (!supported.has(event.type)) return { ignored: true, reason: `Ignoring Vercel event ${event.type || 'unknown'}.` };

  const payload = event.payload || {};
  const deployment = payload.deployment || {};
  const target = payload.target || deployment.target || null;
  if (event.type !== 'deployment.promoted' && target && target !== 'production') {
    return { ignored: true, reason: `Ignoring non-production deployment (${target}).` };
  }

  const meta = deployment.meta || {};
  const checkConfig = parseChecksJson(env.PROOFSHIP_CHECKS_JSON);
  const deploymentId = deployment.id || payload.deploymentId || '';
  const deploymentUrl = deployment.url || payload.url || '';
  const projectId = payload.project?.id || payload.projectId || env.VERCEL_PROJECT_ID || '';
  const sha = env.PROOFSHIP_SHA || meta.githubCommitSha || meta.gitCommitSha || meta.gitlabCommitSha || '';
  const pr = env.PROOFSHIP_PR_NUMBER || meta.githubPrId || meta.githubPrNumber;

  return {
    ignored: false,
    configError: checkConfig.error,
    input: {
      repo: repositoryFrom(meta, env),
      sha,
      prNumber: pr ? Number(pr) : undefined,
      deploymentId,
      vercelProjectId: projectId,
      vercelTeamId: payload.team?.id || env.VERCEL_TEAM_ID,
      targetUrl: env.PROOFSHIP_TARGET_URL || (deploymentUrl ? `https://${deploymentUrl.replace(/^https?:\/\//, '')}` : undefined),
      recoveryTargetUrl: env.PROOFSHIP_RECOVERY_TARGET_URL || env.PROOFSHIP_TARGET_URL || undefined,
      rollbackDeploymentId: env.VERCEL_ROLLBACK_DEPLOYMENT_ID || undefined,
      autoRollback: envBoolean('PROOFSHIP_AUTO_ROLLBACK', false, env),
      idempotencyKey: deploymentId ? `vercel:${deploymentId}` : `vercel-event:${event.id || 'unknown'}`,
      goal: env.PROOFSHIP_GOAL || 'Verify the production deployment before declaring the release successful',
      checks: checkConfig.checks,
      source: `vercel-webhook:${event.type}`
    }
  };
}
