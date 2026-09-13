function extractJson(text) {
  const match = text.match(/\{[\s\S]*\}/);
  if (!match) throw new Error('LLM did not return JSON');
  return JSON.parse(match[0]);
}

export async function diagnoseWithLLM(input) {
  const apiKey = process.env.LLM_API_KEY;
  const baseUrl = (process.env.LLM_BASE_URL || 'https://api.openai.com/v1').replace(/\/$/, '');
  const model = process.env.LLM_MODEL || 'gpt-5-mini';

  if (!apiKey) {
    return {
      cause: input.failedChecks?.[0]?.detail || 'Acceptance check failed after deployment',
      confidence: 0.76,
      summary: 'The new deployment passed infrastructure readiness but failed a production acceptance check.',
      recommendedAction: 'rollback',
      source: 'deterministic-fallback'
    };
  }

  const system = `You are ProofShip's release diagnosis agent. Infrastructure readiness is NOT proof of a successful release.\nReturn strict JSON with keys cause, confidence (0..1), summary, recommendedAction. recommendedAction must be one of rollback, investigate, approve.\nNever approve when any authoritative acceptance check failed.`;
  const user = JSON.stringify(input, null, 2);

  const res = await fetch(`${baseUrl}/chat/completions`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: `Bearer ${apiKey}` },
    body: JSON.stringify({ model, temperature: 0.1, messages: [{ role: 'system', content: system }, { role: 'user', content: user }] })
  });
  if (!res.ok) throw new Error(`LLM ${res.status}: ${await res.text()}`);
  const body = await res.json();
  const parsed = extractJson(body.choices?.[0]?.message?.content || '');
  return { ...parsed, source: 'llm' };
}
