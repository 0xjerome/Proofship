export async function runAcceptanceChecks(targetUrl, checks = []) {
  const results = [];
  for (const check of checks) {
    const startedAt = new Date().toISOString();
    try {
      const url = new URL(check.path || '/', targetUrl).toString();
      const res = await fetch(url, { redirect: 'follow' });
      const text = await res.text();
      let passed = res.status === (check.expectStatus || 200);
      if (check.contains) passed = passed && text.includes(check.contains);
      if (check.notContains) passed = passed && !text.includes(check.notContains);
      results.push({ ...check, url, passed, status: res.status, detail: passed ? 'Acceptance criteria satisfied' : `Expected status ${check.expectStatus || 200}${check.contains ? ` and text ${JSON.stringify(check.contains)}` : ''}`, startedAt });
    } catch (error) {
      results.push({ ...check, passed: false, detail: error.message, startedAt });
    }
  }
  return results;
}
