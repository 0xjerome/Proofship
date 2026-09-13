const METHODS = new Set(['GET', 'HEAD', 'POST', 'PUT', 'PATCH', 'DELETE']);

function validHttpUrl(value) {
  try {
    const url = new URL(value);
    return url.protocol === 'http:' || url.protocol === 'https:';
  } catch {
    return false;
  }
}

export function validateReleaseInput(input) {
  const errors = [];
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    return { ok: false, errors: ['Release input must be a JSON object.'], value: null };
  }

  if (typeof input.repo !== 'string' || !/^[^/\s]+\/[^/\s]+$/.test(input.repo)) {
    errors.push('repo must be in owner/repository format.');
  }
  if (typeof input.sha !== 'string' || input.sha.trim().length < 7) {
    errors.push('sha must be a commit identifier with at least 7 characters.');
  }
  if (typeof input.deploymentId !== 'string' || input.deploymentId.trim().length < 3) {
    errors.push('deploymentId is required.');
  }
  if (input.targetUrl != null && !validHttpUrl(input.targetUrl)) {
    errors.push('targetUrl must be an http(s) URL when provided.');
  }
  if (input.prNumber != null && (!Number.isInteger(Number(input.prNumber)) || Number(input.prNumber) < 1)) {
    errors.push('prNumber must be a positive integer when provided.');
  }
  if (!Array.isArray(input.checks) || input.checks.length === 0) {
    errors.push('At least one production acceptance check is required.');
  }

  const checks = Array.isArray(input.checks) ? input.checks.map((check, index) => {
    const normalized = { ...check };
    const prefix = `checks[${index}]`;
    if (!check || typeof check !== 'object' || Array.isArray(check)) {
      errors.push(`${prefix} must be an object.`);
      return normalized;
    }
    if (typeof check.name !== 'string' || !check.name.trim()) errors.push(`${prefix}.name is required.`);
    if (check.path != null && typeof check.path !== 'string') errors.push(`${prefix}.path must be a string.`);
    const method = String(check.method || 'GET').toUpperCase();
    if (!METHODS.has(method)) errors.push(`${prefix}.method is not supported.`);
    normalized.method = method;
    if (check.expectStatus != null) {
      const statuses = Array.isArray(check.expectStatus) ? check.expectStatus : [check.expectStatus];
      if (!statuses.every((status) => Number.isInteger(Number(status)) && Number(status) >= 100 && Number(status) <= 599)) {
        errors.push(`${prefix}.expectStatus must be an HTTP status or array of statuses.`);
      }
    }
    return normalized;
  }) : [];

  return {
    ok: errors.length === 0,
    errors,
    value: {
      ...input,
      repo: typeof input.repo === 'string' ? input.repo.trim() : input.repo,
      sha: typeof input.sha === 'string' ? input.sha.trim() : input.sha,
      deploymentId: typeof input.deploymentId === 'string' ? input.deploymentId.trim() : input.deploymentId,
      prNumber: input.prNumber != null ? Number(input.prNumber) : undefined,
      checks
    }
  };
}
