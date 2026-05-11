# Contributing

Thanks for your interest in contributing to the DeployGate Agent Plugin.

## Project status

This project is open-source software published by DeployGate and
maintained on a best-effort basis. The code is provided **as-is**,
without warranty. Issues and pull requests are reviewed when
maintainers have time and are not guaranteed to be acted on or merged.
See [SUPPORT.md](./SUPPORT.md) for details.

## Reporting issues

Please use one of the issue templates in
[`.github/ISSUE_TEMPLATE/`](./.github/ISSUE_TEMPLATE):

- **Bug report** — a defect in this plugin
- **Feature request** — a proposal for new behavior in this plugin
- **Documentation issue** — an error in documentation hosted in this repo

Questions about the DeployGate service itself (accounts, billing, the
web app, the public API) are out of scope for this tracker. Please use
https://intercom.help/deploygate instead.

To report a security vulnerability privately, email help@deploygate.com.
Do not open a public issue.

## Development setup

```bash
npm install        # Install dependencies
npm run build      # Compile TypeScript and bundle with esbuild
npm test           # Run the vitest suite
npm run test:watch # Re-run tests on file changes
npm run dev        # TypeScript watch mode (no esbuild)
npm start          # Run the MCP server directly via stdio
```

CI runs `npm run build && npm test` on every PR and on pushes to
`main`. Please make sure both pass locally before requesting review.

## Branch and PR flow

- Work on a feature branch and open a pull request against `main`.
- Every pull request **must reference an issue** using `Closes #`,
  `Fixes #`, or `Refs #`. If no issue exists yet, please open one first
  so the change can be discussed before review.
- Follow the [pull request template](./.github/PULL_REQUEST_TEMPLATE.md)
  and complete the checklist.
- Keep changes focused. Unrelated refactors should land in their own
  pull request with their own issue.

## Tests

Tests live alongside the source under `src/__tests__/` and use
[vitest](https://vitest.dev/) with `globals: true`. Several tests
validate structural invariants — for example, the version in
`package.json` must match `plugin/.codex-plugin/plugin.json` and
`plugin/.claude-plugin/plugin.json`. When you bump the version, update
all three together or the test suite will fail.

## Code of Conduct

All participation in this repository — issues, pull requests, comments,
and any other interaction — is governed by the
[Code of Conduct](./CODE_OF_CONDUCT.md). By contributing, you agree to
abide by it.

## License

By contributing to this repository, you agree that your contributions
will be licensed under the [MIT License](./LICENSE), the same license
as the rest of the project.
