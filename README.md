# ProofShip

**Your deploy isn't done when CI turns green. It's done when production proves it.**

ProofShip is an AI release verification agent that checks whether a deployment actually works for users before declaring it successful. It inspects the release, verifies production behavior, diagnoses failures, and takes policy-gated action across GitHub, Vercel, Linear, and Slack.

## Why ProofShip

A deployment platform can report `READY` while a critical user journey is still broken. CI can be green while checkout, login, onboarding, or another production workflow fails after release.

ProofShip treats infrastructure success as evidence—not as proof.

A release is marked `VERIFIED` only after authoritative production checks pass.

## What it does

ProofShip can:

- inspect the GitHub commit or pull request behind a release;
- read Vercel deployment state;
- execute production acceptance checks against the deployed application;
- use an LLM to diagnose likely causes of failures;
- apply deterministic release policy that the LLM cannot override;
- create a Linear incident when a regression is detected;
- attach evidence to GitHub;
- notify the team in Slack;
- initiate a Vercel rollback when configured;
- deduplicate repeated release events before consequential actions are repeated;
- continue attempting remaining incident actions when one external integration fails;
- accept signed automatic release webhooks;
- retain an explicit evidence and action trail for every run.

## Core workflow

1. **Release event** — receive a manual API request or an automatic signed webhook.
2. **GitHub** — identify the release, commit, or pull request and collect change context.
3. **Vercel** — inspect the deployment and production target.
4. **Production verification** — run acceptance checks against the live application.
5. **Diagnosis** — summarize the failure and likely cause.
6. **Policy** — decide whether the release may be verified, blocked, or escalated.
7. **Linear** — create a structured incident for confirmed regressions.
8. **GitHub** — attach release evidence to the relevant issue or pull request.
9. **Slack** — notify the team with evidence and current status.
10. **Recovery** — optionally trigger rollback or wait for a fix.
11. **Reverification** — test production again before closing the incident.

## Reliability model

ProofShip intentionally separates AI reasoning from release authority.

The LLM can help diagnose what happened, but deterministic policy controls consequential decisions.

Core rules:

- Never mark a release verified merely because Vercel says `READY`.
- Never mark a release verified while an authoritative acceptance check is failing.
- Tool errors are evidence, never silently converted into success.
- The LLM cannot override a failed critical check.
- Every consequential action is recorded in the run trajectory.
- Duplicate release events must not create duplicate incidents, notifications, or rollbacks.
- Failure of one external incident action must not prevent the remaining actions from being attempted.
- A release can move to `VERIFIED` only after the required checks pass.

## Fast start

Requires Node.js 20+ and currently has zero npm dependencies.

```bash
cp .env.example .env
npm test
npm start
```

Open:

```text
http://localhost:8787
```

The included example lets you run both a healthy release and a seeded regression.

### Seeded regression

The regression scenario intentionally produces:

- infrastructure/deployment state: `READY` ✅
- homepage: PASS ✅
- health endpoint: PASS ✅
- checkout: FAIL ❌

ProofShip should block the release rather than trusting infrastructure status alone.

When external credentials are not configured, integrations run in transparent `simulated: true` mode so the local example remains deterministic. Add real credentials to make each integration live.

## Integration setup

### GitHub

Create a token scoped only to the repository ProofShip should inspect.

Recommended permissions:

- repository contents / commits: read;
- issues or pull request comments: write, if you want ProofShip to attach evidence.

Environment variables:

```text
GITHUB_TOKEN=
DEMO_REPO=owner/repository
DEMO_PR_NUMBER=
```

### Vercel

Create a Vercel API token and provide the project identifier.

```text
VERCEL_TOKEN=
VERCEL_PROJECT_ID=
```

A real deployment ID can be passed to `/api/run` for live verification.

### Slack

Create an Incoming Webhook for the channel where release incidents should be posted.

```text
SLACK_WEBHOOK_URL=
```

### Linear

Create a Linear API key and obtain the UUID of the team that should receive incidents.

```text
LINEAR_API_KEY=
LINEAR_TEAM_ID=
```

### LLM

ProofShip supports an OpenAI-compatible endpoint.

```text
LLM_API_KEY=
LLM_BASE_URL=
LLM_MODEL=
```

AI reasoning is used for diagnosis. Deterministic policy still decides whether a release can be approved.

## API

### Run the included regression scenario

```text
POST /api/demo?mode=broken
```

### Run the included healthy scenario

```text
POST /api/demo?mode=healthy
```

### Verify a real release

```text
POST /api/run
```

Example payload:

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
      "path": "/api/demo-checkout",
      "expectStatus": 200,
      "contains": "PAYMENT_CONFIRMED",
      "critical": true
    }
  ]
}
```

### Trigger verification automatically

ProofShip exposes:

```text
POST /api/webhooks/release
```

The endpoint accepts the same normalized release payload as `/api/run`.

For duplicate protection, send a stable event identifier using either:

```text
X-ProofShip-Event-Id: deployment-event-123
```

or include:

```json
{
  "eventId": "deployment-event-123"
}
```

When `PROOFSHIP_WEBHOOK_SECRET` is configured, webhook bodies must include an HMAC-SHA256 signature:

```text
X-ProofShip-Signature: sha256=<hex-digest>
```

The digest is computed from the exact raw request body using `PROOFSHIP_WEBHOOK_SECRET`.

## Example verification flow

A deployment reports `READY`, but checkout is broken.

ProofShip:

1. records the deployment state;
2. executes the configured production checks;
3. detects the checkout regression;
4. refuses to mark the release verified;
5. records a diagnosis and evidence;
6. creates or simulates a Linear incident;
7. posts or simulates a Slack notification;
8. attaches or simulates GitHub evidence;
9. initiates or simulates recovery action;
10. requires a fresh successful verification before the release can become `VERIFIED`.

## Current architecture

```text
Release event / signed webhook
   ↓
Idempotency guard
   ↓
GitHub context
   ↓
Vercel deployment state
   ↓
Production checks
   ↓
Evidence collection
   ↓
LLM diagnosis
   ↓
Deterministic release policy
   ↓
GitHub / Linear / Slack / Vercel actions
   ↓
Reverification
   ↓
VERIFIED or BLOCKED
```

## Tests and CI

Run the local tests:

```bash
npm test
```

Run syntax checks across every source module:

```bash
npm run check
```

GitHub Actions runs both on each push to `main`.

The current automated tests cover release policy, duplicate-event fingerprints, and signed webhook verification.

See [`docs/EVALS.md`](docs/EVALS.md) for the broader evaluation matrix.

## Roadmap

- Native provider-specific webhook adapters for GitHub and deployment platforms.
- Playwright browser journeys for full user-flow verification.
- Baseline comparison to distinguish new regressions from pre-existing failures.
- Persistent idempotency storage suitable for horizontally scaled deployments.
- Human approval thresholds for production rollback.
- Configurable release policies per repository and environment.
- Persistent run history and searchable evidence backed by a production database.
- Additional deployment providers and incident-management integrations.

## Project philosophy

ProofShip is built around one principle:

> A deployment is not successful because the deployment system says it is. It is successful when the production behavior users depend on has been verified.
