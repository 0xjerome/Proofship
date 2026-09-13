# ProofShip

**Your deploy isn't done when CI turns green. It's done when production proves it.**

ProofShip is an AI release verification agent. It watches a deployment, verifies the production behavior users actually depend on, diagnoses failures, coordinates incident response across GitHub, Vercel, Linear, and Slack, and refuses to mark a release verified until authoritative checks pass.

## Demo video

Watch the ProofShip demo: [Google Drive](https://drive.google.com/file/d/1Z0Wv-8REfJJz44jWSZYRzlAw4LwAFHDB/view?usp=sharing)

## The problem

CI and deployment platforms answer an important question: **did the software build and deploy?** They do not necessarily answer: **does the released user journey actually work?**

A deployment can be `READY` while checkout, login, onboarding, or another production path is broken. ProofShip treats deployment readiness as evidence, not proof.

## What ProofShip does

A release can enter ProofShip manually through the API or automatically from a signed Vercel deployment webhook. ProofShip then:

1. inspects the GitHub commit behind the release;
2. reads Vercel deployment evidence;
3. runs configured production acceptance checks against the deployed application;
4. uses an LLM for diagnosis when available, with a deterministic fallback when it is not;
5. applies deterministic release policy that the LLM cannot override;
6. creates a Linear incident for a confirmed regression;
7. attaches evidence to GitHub;
8. alerts Slack;
9. recommends rollback by default, or performs an opt-in Vercel rollback;
10. reruns recovery checks after rollback and reports recovery only if production passes again.

Every run keeps an evidence trail of checks, reasoning, actions, failures, and recovery.

## Safety properties

ProofShip is deliberately strict around release authority:

- `READY` is never enough to produce `VERIFIED`.
- A release with no authoritative production checks is never verified.
- Any failed authoritative check prevents verification.
- LLM output cannot override the deterministic release policy.
- An unavailable or malformed LLM response falls back safely instead of taking the verifier down.
- Duplicate release deliveries are deduplicated before consequential actions repeat.
- A failure in Linear, Slack, GitHub, or Vercel is recorded and does not silently become success.
- Automatic live rollback is disabled unless explicitly enabled.
- A rollback is not called recovered until the production checks pass again.

## Quick start

ProofShip requires Node.js 20+ and has no runtime npm dependencies.

```bash
cp .env.example .env
npm test
npm start
```

Open:

```text
http://localhost:8787
```

The dashboard includes two deterministic flows:

- **Run healthy release** → all checks pass → `VERIFIED IN PRODUCTION`.
- **Run seeded regression** → deployment is `READY`, checkout fails → release blocked → incident actions → rollback → recovery checks prove the previous production state is restored.

The bundled demo simulates external writes by default, so it is safe to run repeatedly.

## Dashboard

The dashboard shows:

- release verdict and service state;
- integration connection state;
- every authoritative production check;
- AI/deterministic diagnosis;
- incident and rollback actions;
- recovery verification;
- complete agent trajectory;
- recent release runs.

No third-party JavaScript or CSS is required.

## Live integrations

Copy `.env.example` to `.env` and configure only the services you want ProofShip to use.

### GitHub

```text
GITHUB_TOKEN=
```

The token needs read access to the release repository. To attach release evidence to a PR or issue, it also needs permission to create comments.

### Vercel

```text
VERCEL_TOKEN=
VERCEL_PROJECT_ID=
VERCEL_TEAM_ID=
VERCEL_WEBHOOK_SECRET=
```

ProofShip reads deployment state through the Vercel API. For a failed release it can locate the previous READY production deployment and use Vercel's project rollback endpoint. Live rollback is opt-in:

```text
PROOFSHIP_AUTO_ROLLBACK=true
```

Without that flag, ProofShip records that rollback is recommended and waits for human approval.

### Linear

```text
LINEAR_API_KEY=
LINEAR_TEAM_ID=
```

A confirmed regression creates a structured incident containing commit, deployment, target, policy reason, diagnosis, and failed checks.

### Slack

```text
SLACK_WEBHOOK_URL=
```

ProofShip posts a concise release-blocked notification with the incident reference.

### LLM diagnosis

```text
LLM_API_KEY=
LLM_BASE_URL=https://api.openai.com/v1
LLM_MODEL=gpt-5-mini
```

The endpoint must be OpenAI chat-completions compatible. The LLM is optional. When it is absent, unavailable, or returns malformed output, ProofShip uses a deterministic diagnosis fallback. Release authority always stays with deterministic policy.

## Configure production acceptance checks

Automatic Vercel runs read checks from `PROOFSHIP_CHECKS_JSON`:

```text
PROOFSHIP_CHECKS_JSON=[{"name":"Homepage loads","path":"/","expectStatus":200},{"name":"Checkout health","path":"/api/checkout/health","expectStatus":200,"contains":"healthy","critical":true}]
```

Supported check fields include:

```json
{
  "name": "Checkout health",
  "path": "/api/checkout/health",
  "method": "GET",
  "expectStatus": 200,
  "contains": "healthy",
  "notContains": "error",
  "critical": true,
  "timeoutMs": 8000
}
```

Checks stay on the same production origin by default. Cross-origin checks require `"allowExternal": true` explicitly.

## Automatic Vercel trigger

Create a Vercel webhook pointing to:

```text
POST https://YOUR-PROOFSHIP-HOST/api/webhooks/vercel
```

Set its signing secret as:

```text
VERCEL_WEBHOOK_SECRET=
```

ProofShip verifies the raw webhook body before processing it, ignores non-production deployment events, translates supported production deployment events into a release verification, and uses the deployment ID as the idempotency key so repeat deliveries do not repeat incident actions.

For rollback recovery verification, set `PROOFSHIP_RECOVERY_TARGET_URL` (or `PROOFSHIP_TARGET_URL`) to the stable production/custom-domain URL. ProofShip will not claim recovery from a Vercel webhook unless it has a production URL to re-check.

For repositories where deployment metadata does not expose the GitHub source cleanly, set:

```text
PROOFSHIP_REPO=owner/repository
```

## Generic signed release webhook

Other deployment systems can use:

```text
POST /api/webhooks/release
x-proofship-signature: sha256=<HMAC-SHA256 of raw request body>
```

Configure:

```text
PROOFSHIP_WEBHOOK_SECRET=
```

## Manual API

### Health

```text
GET /api/health
```

### Runtime/integration state

```text
GET /api/config
```

### Run history

```text
GET /api/runs
GET /api/runs/:id
```

### Verify a release

```text
POST /api/run
```

Example:

```json
{
  "repo": "owner/repo",
  "sha": "commit-sha",
  "prNumber": 12,
  "deploymentId": "dpl_...",
  "vercelProjectId": "prj_...",
  "targetUrl": "https://production.example.com",
  "goal": "Prove checkout works after deployment",
  "checks": [
    {
      "name": "Checkout completes",
      "path": "/api/checkout/health",
      "expectStatus": 200,
      "contains": "healthy",
      "critical": true
    }
  ]
}
```

Optionally protect the manual run endpoint:

```text
PROOFSHIP_API_KEY=...
```

Then send either `x-proofship-api-key` or `Authorization: Bearer ...`.

## Status model

A release verdict and a service state are deliberately separate.

- `verified` — the release itself passed all authoritative checks.
- `failed` — the release failed one or more checks.
- `blocked` — ProofShip lacks safe evidence to verify it.
- `recovered` service state — a bad release remained failed, but rollback was accepted and recovery checks proved the previous production state is healthy.

This distinction prevents a successful rollback from rewriting history and pretending the failed release was good.

## Reliability and evaluations

```bash
npm test
npm run check
# or
npm run verify
```

The test suite covers policy, release-input validation, real HTTP acceptance behavior, idempotency, generic and native Vercel webhook verification, Vercel payload adaptation, deterministic LLM fallback, and end-to-end simulated healthy/regression flows.

See [`docs/EVALS.md`](docs/EVALS.md) for the evaluation matrix and [`docs/DEMO.md`](docs/DEMO.md) for the demo flow.

## Deploy

ProofShip is a normal long-running Node HTTP service. It can run on Replit, Render, Fly.io, a VPS, or another container host.

Docker:

```bash
docker build -t proofship .
docker run --rm -p 8787:8787 --env-file .env proofship
```

Run history is stored in `.proofship/runs.json` by default. Set `PROOFSHIP_DATA_FILE` to another writable path if needed. For horizontally scaled production use, replace the local store with a shared durable database.

## Architecture

```text
Release event / Vercel webhook
            ↓
      signature + validation
            ↓
       idempotency guard
            ↓
 GitHub + Vercel release evidence
            ↓
 production acceptance checks
            ↓
       diagnosis layer
       LLM or safe fallback
            ↓
 deterministic release policy
            ↓
 Linear · GitHub · Slack · Vercel
            ↓
      recovery verification
            ↓
 VERIFIED / FAILED / BLOCKED
```

## Project principle

> A deployment is not successful because the deployment system says it is. It is successful when the production behavior users depend on has been verified.
