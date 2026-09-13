export function envBoolean(name, fallback = false, env = process.env) {
  const value = env[name];
  if (value == null || value === '') return fallback;
  return ['1', 'true', 'yes', 'on'].includes(String(value).toLowerCase());
}

export function parseChecksJson(raw) {
  if (!raw) return { checks: [], error: null };
  try {
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) {
      return { checks: [], error: 'PROOFSHIP_CHECKS_JSON must be a JSON array.' };
    }
    return { checks: parsed, error: null };
  } catch (error) {
    return { checks: [], error: `Invalid PROOFSHIP_CHECKS_JSON: ${error.message}` };
  }
}

export function getRuntimeConfig(env = process.env) {
  const checkConfig = parseChecksJson(env.PROOFSHIP_CHECKS_JSON);
  const mode = (value) => value ? 'live' : 'unconfigured';
  return {
    version: '1.0.0',
    integrations: {
      github: { mode: mode(env.GITHUB_TOKEN) },
      vercel: {
        mode: mode(env.VERCEL_TOKEN),
        webhook: env.VERCEL_WEBHOOK_SECRET ? 'ready' : 'unconfigured'
      },
      linear: { mode: mode(env.LINEAR_API_KEY && env.LINEAR_TEAM_ID) },
      slack: { mode: mode(env.SLACK_WEBHOOK_URL) },
      llm: { mode: env.LLM_API_KEY ? 'live' : 'deterministic-fallback' }
    },
    automation: {
      releaseWebhook: env.PROOFSHIP_WEBHOOK_SECRET ? 'ready' : 'unconfigured',
      apiProtected: Boolean(env.PROOFSHIP_API_KEY),
      autoRollback: envBoolean('PROOFSHIP_AUTO_ROLLBACK', false, env),
      checksConfigured: checkConfig.checks.length,
      checksError: checkConfig.error
    }
  };
}
