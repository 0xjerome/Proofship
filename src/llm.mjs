function extractJson(text) {
  const match = text.match(/\{[\s\S]*\}/);
  if (!match) throw new Error('LLM did not return JSON');
  return JSON.parse(match[0]);
}

function fallbackDiagnosis(input, fallbackReason = null) {
  const firstFailure = input.failedChecks?.[0];
  const failedCount = input.failedChecks?.length || 0;
  const deploymentReady = input.deployment?.ready;

  let cause;
  let summary;
  let recommendedAction;
  let confidence;

  if (failedCount > 0) {
    cause = firstFailure?.detail || 'A production acceptance check failed.';
    summary = `Infrastructure may be ready, but ${failedCount} production acceptance check(s) failed.`;
    recommendedAction = 'rollback';
    confidence = 0.76;
  } else if (deploymentReady === false) {
    cause = 'The deployment is not ready for production verification.';
    summary = 'ProofShip cannot verify the release because deployment readiness has not been established.';
    recommendedAction = 'investigate';
    confidence = 0.9;
  } else {
    cause = 'No production regression was detected by the configured acceptance checks.';
    summary = 'All configured production acceptance checks passed; deterministic diagnosis found no release regression.';
    recommendedAction = 'approve';
    confidence = 0.9;
  }

  return {
    cause,
    confidence,
    summary,
    recommendedAction,
    source: 'deterministic-fallback',
    ...(fallbackReason ? { fallbackReason } : {})
  };
}

export async function diagnoseWithLLM(input) {
  const apiKey = process.env.LLM_API_KEY;
  const baseUrl = (process.env.LLM_BASE_URL || 'https://api.openai.com/v1').replace(/\/$/, '');
  const model = process.env.LLM_MODEL || 'gpt-5-mini';

  if (!apiKey) return fallbackDiagnosis(input, 'No LLM API key configured.');

  try {
    const system = `You are ProofShip's release diagnosis agent. Infrastructure readiness is NOT proof of a successful release.\nReturn strict JSON with keys cause, confidence (0..1), summary, recommendedAction. recommendedAction must be one of rollback, investigate, approve.\nNever approve when any authoritative acceptance check failed.`;
    const user = JSON.stringify(input, null, 2);

    const res = await fetch(`${baseUrl}/chat/completions`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({
        model,
        temperature: 0.1,
        messages: [{ role: 'system', content: system }, { role: 'user', content: user }]
      }),
      signal: AbortSignal.timeout(12000)
    });
    if (!res.ok) throw new Error(`LLM ${res.status}: ${(await res.text()).slice(0, 400)}`);
    const body = await res.json();
    const parsed = extractJson(body.choices?.[0]?.message?.content || '');
    if (!['rollback', 'investigate', 'approve'].includes(parsed.recommendedAction)) {
      throw new Error('LLM returned an unsupported recommendedAction.');
    }
    const confidence = Number(parsed.confidence);
    return {
      cause: String(parsed.cause || 'Unknown'),
      confidence: Number.isFinite(confidence) ? Math.max(0, Math.min(confidence, 1)) : 0.5,
      summary: String(parsed.summary || parsed.cause || 'No summary returned.'),
      recommendedAction: parsed.recommendedAction,
      source: 'llm'
    };
  } catch (error) {
    return fallbackDiagnosis(input, error.message);
  }
}
