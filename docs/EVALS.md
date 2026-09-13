# ProofShip evaluation matrix

ProofShip's core safety claim is intentionally narrow and testable:

> A release must never become `VERIFIED` while deployment evidence is not ready, required production checks are missing, or any authoritative production check is failing.

## Required scenarios

| Scenario | Expected result |
| --- | --- |
| READY deployment + all required checks pass | `VERIFIED` |
| Deployment is not READY | `BLOCKED` / investigate |
| READY deployment + checkout regression | `FAILED` + incident workflow |
| READY deployment + zero checks | `BLOCKED`, never verified |
| LLM suggests approval while a check failed | deterministic policy still blocks |
| LLM endpoint is unavailable/malformed | deterministic diagnosis fallback; checks remain authoritative |
| Duplicate delivery for the same deployment | existing completed run returned; actions are not repeated |
| Invalid or tampered generic webhook signature | rejected |
| Invalid or tampered Vercel webhook signature | rejected |
| Non-production Vercel deployment event | ignored |
| One incident integration fails | remaining incident actions are still attempted |
| Auto rollback disabled | rollback is recommended, not executed |
| Rollback accepted | production checks are rerun; recovery is only reported if they pass |
| Seeded bad release | release remains failed even when the previous production version is restored |

## What CI verifies

`npm test` covers policy, validation, acceptance checks, webhook verification/adaptation, idempotency, LLM fallback, and end-to-end simulated release behavior.

`npm run check` syntax-checks every source module, browser JavaScript file, and test.

The bundled regression scenario is deterministic and deliberately creates a semantic release failure: deployment state is `READY`, but checkout does not satisfy its acceptance criterion. ProofShip must block that release.
