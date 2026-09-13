# ProofShip Evaluation Plan

| Scenario | Expected result |
| --- | --- |
| Healthy deployment | VERIFIED |
| Vercel READY + checkout broken | BLOCK + incident + rollback |
| Deployment not READY | BLOCK, no false verification |
| LLM recommends approve but check failed | BLOCK (deterministic policy wins) |
| LLM unavailable | deterministic diagnosis fallback, checks still authoritative |
| Slack/Linear credential missing | transparent simulated action, never fabricated as live |
| Healthy release after fix | VERIFIED only after rerun |

The key evaluation claim is simple: **no seeded acceptance-check failure may end in VERIFIED.**
