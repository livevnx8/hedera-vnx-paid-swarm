# Contributing to Hedera VNX Paid Micro-Swarm

Thank you for your interest in improving this project.

## Development Setup

```bash
git clone <repo-url>
cd hedera-vnx-paid-swarm
npm install
```

## Scripts

| Command                | Purpose                           |
| ---------------------- | --------------------------------- |
| `npm test`             | Run Jest test suite               |
| `npm run test:watch`   | Run tests in watch mode           |
| `npm run demo:plan`    | Preview swarm without credentials |
| `npm run e2e`          | Dry-run end-to-end validation     |
| `npm run verify`       | CLI proof verification            |
| `npm run send`         | Standalone HBAR transfer          |
| `npm run lint`         | Run ESLint                        |
| `npm run lint:fix`     | Auto-fix ESLint issues            |
| `npm run format`       | Run Prettier                      |
| `npm run format:check` | Check Prettier formatting         |
| `npm run typecheck`    | TypeScript strict check           |
| `npm run clean`        | Remove dist/ and coverage/        |

## Style Guide

- **TypeScript**: Strict mode enabled. Prefer explicit types over `any`.
- **Imports**: Use `.js` extension for relative imports (NodeNext resolution).
- **Formatting**: 2-space indentation, single quotes, trailing commas.
- **Max line length**: 100 characters.

## Submitting Changes

1. Create a feature branch: `git checkout -b feat/description`
2. Make your changes with tests
3. Ensure `npm test` and `npm run lint` pass
4. Commit with a descriptive message
5. Open a pull request

## Security

- Never commit `.env` files or private keys
- All mainnet interactions require explicit opt-in

## License

By contributing, you agree that your contributions will be licensed under the MIT License.
