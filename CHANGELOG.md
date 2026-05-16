# Changelog

All notable changes to this project are documented in this file.

## [1.0.0] — 2026-05-16

### Added
- Core deterministic agent swarm with 4 pre-configured VNX workers
- Hedera mainnet payment rail with enforced mainnet validation
- SHA-256 cryptographic receipt builder with HashScan + mirror-node URLs
- Hiero-compatible proof verifier with live mirror-node transaction confirmation
- CLI scripts: demo, end-to-end validation, proof verification, standalone HBAR transfer
- 18 comprehensive Jest tests covering all core logic paths
- Professional visual assets: architecture diagram, workflow diagram, badges
- Full documentation: README, HIERO compatibility guide, CONTRIBUTING guide
- Example mainnet receipt with verified hashes

### Security
- Default max-hbar cap at 0.01 HBAR
- Private key loaded exclusively from environment variables
- `--plan-only` mode clearly separated from mainnet runs
- `assertMainnetProofReceipt` guards prevent mock receipt submission

## [Unreleased]

- HCS topic anchoring for immutable audit trails
- Multi-signature threshold support
- Additional worker specialties
