# Contributing to ProofShip

Thanks for your interest in contributing to ProofShip.

ProofShip is a release-verification system, so changes should preserve its central safety rule: a deployment is not considered verified until authoritative production checks pass. LLM output must not be allowed to override deterministic release policy.

## Development setup

ProofShip requires Node.js 20 or newer and has no runtime npm dependencies.

```bash
cp .env.example .env
npm test
npm start
```

For local development with automatic restarts:

```bash
npm run dev
```

## Before submitting a change

Run the full verification command:

```bash
npm run verify
```

This runs the test suite and syntax checks.

When changing release policy, webhook handling, idempotency, integrations, rollback behavior, or recovery verification, add or update tests that demonstrate both the success path and the relevant failure path.

## Pull requests

Keep pull requests focused and explain:

- what changed;
- why the change is needed;
- how it was tested;
- any effect on release authority, integrations, rollback, or recovery behavior.

Avoid combining unrelated refactors with behavioral changes when possible.

## Safety expectations

Contributions must not weaken these properties:

- `READY` alone cannot produce a verified release;
- missing authoritative production checks cannot produce a verified release;
- any failed authoritative check prevents verification;
- LLM responses cannot override deterministic policy;
- malformed or unavailable LLM output must fail safely;
- duplicate deliveries must not repeat consequential actions;
- integration failures must remain visible rather than silently becoming success;
- live rollback must remain explicitly opt-in;
- recovery must only be reported after production checks pass again.

## Reporting bugs

For normal bugs and feature requests, open a GitHub issue with enough detail to reproduce or understand the problem.

For security vulnerabilities, do not open a public issue containing vulnerability details. Follow [SECURITY.md](SECURITY.md) instead.

## License

By contributing to ProofShip, you agree that your contributions will be licensed under the [Apache License 2.0](LICENSE).
