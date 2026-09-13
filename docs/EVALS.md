# ProofShip Evaluation Plan

ProofShip is evaluated against failure modes that commonly make release automation look successful when the real user outcome is wrong.

| Scenario | Expected result |
| --- | --- |
| Healthy deployment | `VERIFIED` |
| Vercel `READY` + checkout broken | `FAILED` + incident workflow + rollback attempt |
| Deployment not `READY` | `BLOCKED`; never falsely verified |
| LLM recommends approval while an authoritative check failed | `FAILED`; deterministic policy wins |
| LLM unavailable | deterministic diagnosis fallback; production checks remain authoritative |
| Slack or Linear credentials missing | transparent `simulated: true` action; never represented as live |
| One external action fails | remaining external actions are still attempted and the release stays blocked |
| Duplicate webhook / repeated release event | previous completed result returned; consequential actions are not repeated |
| Same commit with a different deployment ID | treated as a new release verification |
| Healthy release after a fix | `VERIFIED` only after a fresh successful run |
| No target URL available | checks fail safely; release cannot be verified |

## Invariants

1. No failed authoritative acceptance check may end in `VERIFIED`.
2. Infrastructure `READY` is never sufficient by itself to approve a release.
3. An LLM recommendation cannot override deterministic release policy.
4. A tool failure must be visible in the trajectory and cannot be silently converted into success.
5. Duplicate delivery of the same release event must not cause duplicate incidents, notifications, or rollbacks.
6. Verification after a fix requires a fresh run against the production target.

## Automated coverage

The repository currently includes automated tests for:

- blocking deployments that are not ready;
- blocking `READY` deployments with failed production checks;
- verifying only when deployment and checks pass;
- stable idempotency fingerprints for repeated events;
- distinct fingerprints for distinct deployments;
- explicit idempotency keys across differently shaped webhook retries.

Run:

```bash
npm test
npm run check
```

The evaluation suite will continue expanding toward end-to-end live integration scenarios.
