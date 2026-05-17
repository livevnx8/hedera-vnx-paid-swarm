# Security Policy

## Supported Versions

The `main` branch and the latest published package version receive security fixes.

## Reporting a Vulnerability

Please do not open a public issue for private keys, payment failures, or exploitable vulnerabilities. Email the maintainer listed in `package.json`, or open a private GitHub security advisory if available.

Include:

- A short description of the issue
- Steps to reproduce
- Affected package version or commit
- Whether real HBAR, account credentials, or HCS topic access are involved

## Secret Handling

Never commit Hedera private keys, `.env` files, seed phrases, or funded account credentials. This repo loads live credentials from environment variables only:

- `HEDERA_ACCOUNT_ID`
- `HEDERA_PRIVATE_KEY`
- `HEDERA_NETWORK=mainnet`

If a private key is pasted into chat, terminal history, logs, screenshots, or a public repository, rotate the key before keeping funds in that account.

## Live Mainnet Safety

Live scripts can transfer real HBAR. Keep `--max-hbar` low, verify the recipient account, and run dry-run or plan-only commands before mainnet execution.

CI does not require live Hedera credentials. Mainnet payment tests should remain opt-in and must be guarded by explicit environment variables.
