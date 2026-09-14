# Security Policy

ProofShip coordinates release verification and can integrate with GitHub, Vercel, Linear, Slack, and LLM providers. Security reports involving authentication, webhook verification, secrets, release authority, idempotency, rollback, or integration permissions are especially important.

## Supported versions

Security fixes are made against the current `main` branch. Until tagged release support is documented separately, older snapshots should not be assumed to receive security updates.

## Reporting a vulnerability

Please do not disclose vulnerability details in a public GitHub issue, discussion, pull request, or other public channel.

Use GitHub's private vulnerability reporting or security-advisory flow for this repository when it is available from the repository's **Security** tab.

If private vulnerability reporting is not available, open a minimal public issue asking the maintainer for a private reporting channel. Do not include exploit details, secrets, proof-of-concept payloads, or other sensitive information in that public issue.

A useful private report should include:

- the affected component or integration;
- the impact you believe is possible;
- reproduction steps or a proof of concept;
- any prerequisites or configuration required;
- suggested mitigations, if known.

Please give the maintainer a reasonable opportunity to investigate and release a fix before public disclosure.

## Secrets

Never include real API keys, webhook secrets, access tokens, customer data, or production credentials in a report, test fixture, commit, or issue. Redact sensitive values while preserving enough information to reproduce the problem.
