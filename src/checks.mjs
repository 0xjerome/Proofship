function expectedStatuses(check) {
  if (Array.isArray(check.expectStatus)) return check.expectStatus.map(Number);
  return [Number(check.expectStatus || 200)];
}

function bodyFor(check, headers) {
  if (check.body == null) return undefined;
  if (typeof check.body === 'string') return check.body;
  if (!Object.keys(headers).some((key) => key.toLowerCase() === 'content-type')) {
    headers['content-type'] = 'application/json';
  }
  return JSON.stringify(check.body);
}

export async function runAcceptanceChecks(targetUrl, checks = []) {
  const results = [];
  let base;
  try {
    base = new URL(targetUrl);
    if (!['http:', 'https:'].includes(base.protocol)) throw new Error('Unsupported protocol');
  } catch {
    return checks.map((check) => ({
      ...check,
      passed: false,
      detail: 'No valid production target URL was available.'
    }));
  }

  for (const check of checks) {
    const startedAt = new Date().toISOString();
    const started = Date.now();
    try {
      const url = new URL(check.path || '/', base);
      if (!check.allowExternal && url.origin !== base.origin) {
        throw new Error(`Cross-origin check blocked: ${url.origin} does not match ${base.origin}`);
      }

      const method = String(check.method || 'GET').toUpperCase();
      const headers = { ...(check.headers || {}) };
      const body = ['GET', 'HEAD'].includes(method) ? undefined : bodyFor(check, headers);
      const timeoutMs = Math.max(250, Math.min(Number(check.timeoutMs || 8000), 30000));
      const res = await fetch(url, {
        method,
        headers,
        body,
        redirect: 'follow',
        signal: AbortSignal.timeout(timeoutMs)
      });
      const text = method === 'HEAD' ? '' : await res.text();
      const statuses = expectedStatuses(check);
      let passed = statuses.includes(res.status);
      if (check.contains != null) passed = passed && text.includes(String(check.contains));
      if (check.notContains != null) passed = passed && !text.includes(String(check.notContains));

      const expectations = [`status ${statuses.join(' or ')}`];
      if (check.contains != null) expectations.push(`text ${JSON.stringify(String(check.contains))}`);
      if (check.notContains != null) expectations.push(`without ${JSON.stringify(String(check.notContains))}`);

      results.push({
        ...check,
        url: url.toString(),
        passed,
        status: res.status,
        detail: passed ? 'Acceptance criteria satisfied' : `Expected ${expectations.join(', ')}`,
        responseExcerpt: text.slice(0, 400),
        startedAt,
        durationMs: Date.now() - started
      });
    } catch (error) {
      results.push({
        ...check,
        passed: false,
        detail: error.name === 'TimeoutError' ? 'Acceptance check timed out.' : error.message,
        startedAt,
        durationMs: Date.now() - started
      });
    }
  }
  return results;
}
