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
npm install        # Install dependencies (also installs the pre-commit hook)
npm run build      # Compile TypeScript (tsc only; no bundle)
npm test           # Run the vitest suite
npm run test:watch # Re-run tests on file changes
npm run dev        # TypeScript watch mode
npm start          # Run the MCP server from dist/index.js via stdio
npm run bundle     # tsc + esbuild into plugin/scripts/bundle.js
```

Run `npm run bundle` only when you want to test the plugin end-to-end
locally, and do **not** commit `plugin/scripts/bundle.js`. The release
workflow regenerates it, and a pre-commit hook in `.githooks/` blocks
accidental commits. See [Development](./README.md#development) in the
README for details.

CI runs `npm ci`, `npm run build`, and `npm test` on Node 24 on every
PR and on pushes to `main`. A separate `bundle-compat` job builds the
bundle on Node 24 and smoke-tests it on Node 20.0.0, the minimum in
`engines`. Please make sure the build and tests pass locally before
requesting review.

## Branch and PR flow

- Work on a feature branch and open a pull request against `main`.
- Every pull request **must reference an issue** using `Closes #`,
  `Fixes #`, or `Refs #`. If no issue exists yet, please open one first
  so the change can be discussed before review.
- Follow the [pull request template](./.github/PULL_REQUEST_TEMPLATE.md)
  and complete the checklist.
- Keep changes focused. Unrelated refactors should land in their own
  pull request with their own issue.
- PR titles must follow
  [Conventional Commits](https://www.conventionalcommits.org/) (for
  example `feat: …`, `fix: …`, `docs: …`). PRs are squash-merged, so
  the PR title becomes the commit title on `main` that release-please
  uses to decide the next version.

Releases are automated by release-please. Maintainers should see
[Releasing](./README.md#releasing) in the README for how a release
happens.

## Tests

Tests live alongside the source under `src/__tests__/` and use
[vitest](https://vitest.dev/) with `globals: true`. Several tests
validate structural invariants — for example, the version in
`package.json` must match `plugin/.codex-plugin/plugin.json`,
`plugin/.claude-plugin/plugin.json`, the `deploygate` entry in
`.claude-plugin/marketplace.json`, and `.release-please-manifest.json`.
Versions are bumped by release-please in the release PR, so do not
bump them manually; these tests catch mismatched manual edits.

## Code of Conduct

All participation in this repository — issues, pull requests, comments,
and any other interaction — is governed by the
[Code of Conduct](./CODE_OF_CONDUCT.md). By contributing, you agree to
abide by it.

## License

By contributing to this repository, you agree that your contributions
will be licensed under the [MIT License](./LICENSE), the same license
as the rest of the project.
