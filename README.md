# ProofShip

**Your deploy isn't done when CI turns green. It's done when production proves it.**

ProofShip is a multi-app AI release agent built for the Multi-App AI Agent Hackathon. It watches a release, inspects the GitHub commit, checks Vercel deployment state, executes production acceptance criteria, asks an LLM to diagnose failures, then takes policy-gated action across Linear, GitHub, Slack, and Vercel.

## Why it exists

A deployment platform can report `READY` while a critical user journey is broken. ProofShip treats infrastructure success as evidence—not as proof. A release is marked `VERIFIED` only after authoritative production checks pass.

## Multi-app workflow

1. **GitHub** — inspect the release commit / PR and attach production evidence.
2. **Vercel** — inspect deployment status and optionally roll back a bad deployment.
3. **Linear** — create a structured incident for a detected regression.
4. **Slack** — notify the team with the evidence and incident reference.

The agent keeps an explicit trajectory so every consequential action is inspectable.

## Fast start

Requires Node 20+ and has **zero npm dependencies**.

```bash
cp .env.example .env
npm test
npm start
```

Open `http://localhost:8787` and click **Run seeded regression**.

The demo intentionally produces this situation:

- Vercel/infrastructure: `READY` ✅
- homepage: PASS ✅
- health endpoint: PASS ✅
- checkout: FAIL ❌

ProofShip blocks the release, creates/records an incident, posts evidence, and initiates a rollback. With no external credentials configured, integrations run in transparent `simulated: true` mode so the demo is deterministic. Add real credentials to make each integration live.

## Real integration setup

### GitHub
Create a token scoped only to the demo repository with read access to contents/commits and write access to issues/PR comments. Set `GITHUB_TOKEN`, `DEMO_REPO`, and `DEMO_PR_NUMBER`.

### Vercel
Create a Vercel API token and set `VERCEL_TOKEN` and `VERCEL_PROJECT_ID`. Pass a real deployment ID to `/api/run` for live runs.

### Slack
Create an Incoming Webhook for a dedicated `#proofship-demo` channel and set `SLACK_WEBHOOK_URL`.

### Linear
Create a personal API key and get the target team UUID. Set `LINEAR_API_KEY` and `LINEAR_TEAM_ID`.

### LLM
Set an OpenAI-compatible endpoint using `LLM_API_KEY`, `LLM_BASE_URL`, and `LLM_MODEL`. LLM reasoning diagnoses the failure, while deterministic policy code decides whether the release may be approved. The LLM cannot override failed authoritative checks.

## API

`POST /api/demo?mode=broken` — deterministic regression scenario.

`POST /api/demo?mode=healthy` — deterministic successful release.

`POST /api/run` — run against supplied release data:

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
    { "name": "Checkout completes", "path": "/api/demo-checkout", "expectStatus": 200, "contains": "PAYMENT_CONFIRMED", "critical": true }
  ]
}
```

## Reliability rules

- Never mark a release verified merely because Vercel says `READY`.
- Never mark a release verified while an authoritative acceptance check is failing.
- Tool errors are evidence, never silently converted into success.
- The LLM proposes a diagnosis; deterministic policy gates consequential actions.
- Every run retains evidence, reasoning, actions, and final status.

## Hackathon demo script

1. Show Vercel/seeded release as `READY`.
2. Run **seeded regression**.
3. Point out checkout failure while infrastructure stayed green.
4. Show ProofShip's diagnosis and action trail.
5. Show Linear + Slack + GitHub effects (live if credentials are connected).
6. Run **healthy release**.
7. Show `VERIFIED IN PRODUCTION` only after all checks pass.

## Next upgrades

- GitHub/Vercel webhooks for automatic trigger on production deployment.
- Playwright browser journeys rather than HTTP/text acceptance criteria.
- Baseline comparison to avoid blaming a new release for pre-existing failures.
- Idempotency keys for external actions.
- Signed webhook verification.
- Human approval threshold for rollback in production environments.
