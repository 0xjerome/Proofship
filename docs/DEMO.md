# ProofShip demo guide

The bundled demo is deterministic, safe, and does not require third-party credentials.

## Start

```bash
cp .env.example .env
npm test
npm start
```

Open `http://localhost:8787`.

## Healthy path

Click **Run healthy release**. Deployment state is `READY`, every authoritative production check passes, and ProofShip returns **VERIFIED IN PRODUCTION**.

## Regression path

Click **Run seeded regression**. Deployment state is still `READY`, but checkout fails. ProofShip:

1. blocks the bad release;
2. creates simulated Linear, GitHub, and Slack incident actions;
3. performs a simulated Vercel rollback;
4. reruns recovery checks;
5. reports that the previous production version is restored while the bad release itself remains failed.

## Live integrations

Set credentials in `.env` to make GitHub, Vercel, Linear, Slack, and the optional LLM diagnosis live. The generic demo remains simulated unless `DEMO_LIVE_INTEGRATIONS=true` is explicitly enabled.

For automatic Vercel verification, configure a Vercel webhook that posts deployment events to:

```text
https://YOUR-PROOFSHIP-HOST/api/webhooks/vercel
```

Set `VERCEL_WEBHOOK_SECRET`, `VERCEL_TOKEN`, `PROOFSHIP_REPO`, and `PROOFSHIP_CHECKS_JSON`. For rollback recovery proof, set `PROOFSHIP_RECOVERY_TARGET_URL` to the stable production/custom-domain URL. Live rollback is opt-in with `PROOFSHIP_AUTO_ROLLBACK=true`.
