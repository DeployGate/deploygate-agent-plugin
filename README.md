# DeployGate Agent Plugin

DeployGate agent integration for Claude Code and Codex: upload mobile apps, manage distribution pages, set up CI/CD, and onboard your team. Supports iOS (IPA) and Android (APK/AAB).

## Installation

This repository includes plugin metadata for both Claude Code and Codex:

- Claude Code: `plugin/.claude-plugin/plugin.json` and `.claude-plugin/marketplace.json`
- Codex: `plugin/.codex-plugin/plugin.json` and `.agents/plugins/marketplace.json`

### Claude Code

Add the marketplace and install the plugin from within Claude Code:

```text
/plugin marketplace add DeployGate/deploygate-agent-plugin
/plugin install deploygate@deploygate-marketplace
```

### Codex

Add the marketplace from your shell:

```bash
codex plugin marketplace add DeployGate/deploygate-agent-plugin
```

Then enable or install the `deploygate` plugin from the configured DeployGate marketplace in Codex.

## Getting Started

After installation, start the guided onboarding flow:

- Claude Code: run `/deploygate:setup`
- Codex: mention `$deploygate:setup`

1. **Account creation** — sign in via browser-based device authorization (`login_start` → approve in browser → `login_wait`)
2. **App upload** — build and upload your IPA/APK/AAB
3. **Distribution page** — create a distribution page with an install link
4. **Notifications** — connect Slack/Teams/Chatwork
5. **iOS device setup** — UDID registration for Ad Hoc builds (if applicable)

## Authentication

The plugin signs you in to DeployGate via a browser-based device authorization code:

1. Ask your agent to set up DeployGate. Under the hood it calls the `login_start` tool, which returns a URL and a short code.
2. Open the URL in a browser where you are signed in to DeployGate and click approve.
3. The agent calls `login_wait`, which returns your workspace information once you approve.

The issued token is stored at `~/.config/deploygate/token` (on Windows, `%APPDATA%\deploygate\token`) with `0600` permissions and reused across sessions. Run the `logout` tool to revoke it server-side and delete the local file.

## Skills

Claude Code invokes plugin skills as slash commands. Codex invokes plugin skills by mentioning the skill name with `$`.

| Skill | Claude Code | Codex | Description |
|---|---|---|---|
| `setup` | `/deploygate:setup` | `$deploygate:setup` | Full onboarding flow with step-by-step progress display |
| `deploy` | `/deploygate:deploy` | `$deploygate:deploy` | Build and upload the current project to DeployGate |
| `ci-setup` | `/deploygate:ci-setup` | `$deploygate:ci-setup` | CI/CD integration — GitHub Actions, Bitrise, CircleCI (see [external CI guide](docs/external-ci-integration.md)) |
| `sdk-setup` | `/deploygate:sdk-setup` | `$deploygate:sdk-setup` | Android SDK integration (crash reporting, screen capture). iOS SDK is currently not recommended. |

## MCP Tools

### Authentication

| Tool | Description |
|---|---|
| `login_start` | Begin a browser-based device authorization login. Returns a URL for the user to open and approve. |
| `login_wait` | Poll until the user approves `login_start`. On success, persists the token to `~/.config/deploygate/token` (0600). |
| `logout` | Revoke the stored token on the server and delete the local token file. |
| `get_user_info` | Get current user information (workspace names, projects). Auto-clears the local token on a 401 response. |

### App Upload

| Tool | Description |
|---|---|
| `upload_app` | Upload an app binary (IPA/APK/AAB) to DeployGate. |

**Parameters:**
- `owner_name` (required): Owner name (user or project)
- `file_path` (required): Absolute path to the app binary
- `message`: Build description (max 32,766 bytes; auto-truncated if exceeded)
- `distribution_key`: Distribution page key to update. **Takes priority over `distribution_name`.**
- `distribution_name`: Distribution page name. Creates a new page if not found. Ignored if `distribution_key` is also specified.
- `release_note`: Release note for the distribution page
- `disable_notify`: Disable push notification to testers (iOS only)
- `ios_simulator_zip`: Path to iOS simulator build zip for Instant Device (browser-based preview). Must be uploaded together with an IPA.

### Distribution Page Management

| Tool | Description |
|---|---|
| `create_distribution` | Create a new distribution page. Returns `access_key` for the URL `https://deploygate.com/distributions/{access_key}` |
| `list_distributions` | List all distribution pages for an app |
| `get_distribution` | Get details of a specific distribution page |
| `update_distribution` | Update a distribution page. **`active` and `release_scope` are always required** — use `get_distribution` first to retrieve current values. |
| `delete_distribution` | Delete a distribution page. Uploaded builds (binaries) are preserved. |

**Release scope options** (`release_scope`):
- `public` — publicly accessible, indexable by search engines
- `unlisted` — accessible to anyone with the link (default)
- `passcode` — requires a passcode (`passcode` parameter required)
- `authorized_only` — only accessible to logged-in team members

### iOS UDID Management

| Tool | Description |
|---|---|
| `get_udids` | Get iOS device UDIDs for an app. Use `unprovisioned_only=true` to find devices not yet in the provisioning profile. |

### Notification Settings

| Tool | Description |
|---|---|
| `get_notification_settings_url` | Generate the URL for configuring Slack/Teams/Chatwork notifications. Supports distribution-level and app-level settings. |

### Member Management

| Tool | Description |
|---|---|
| `add_member` | Add a member with a specified role (owner/developer/tester). Orchestrates 3-4 API calls in one command. Free plan limit: 2 members. |
| `list_members` | List members of a specific team |
| `remove_member` | Remove a member from a team |

### Shared Team Management

| Tool | Description |
|---|---|
| `create_shared_team` | Create a workspace-level shared team for cross-project use |
| `add_shared_team_member` | Add a member to a shared team (`email` or `username`, not both) |
| `assign_shared_team_to_app` | Assign a shared team to an app (tester-level access) |

## GitHub Actions Templates

Pre-built workflow templates in `plugin/templates/`:

| Template | Description |
|---|---|
| `deploygate-upload.yml` | Upload to DeployGate on push to main |
| `deploygate-pr.yml` | PR-based distribution — auto-create distribution page with QR code, cleanup on close |

## Development

```bash
npm install        # Install dependencies
npm run build      # Compile TypeScript + bundle with esbuild
npm test           # Run tests
```

## Releasing

Releases are automated by [release-please](https://github.com/googleapis/release-please).

### Branching and commits

- All work lands on `main` via squash-merged pull requests.
- PR titles must follow [Conventional Commits](https://www.conventionalcommits.org/):
  - `feat: …` → minor version bump
  - `fix: …` → patch version bump
  - `feat!: …` or a body containing `BREAKING CHANGE: …` → major version bump
  - `chore:`, `docs:`, `refactor:`, `test:`, `build:`, `ci:` → no version bump (and, by default, do not appear in the changelog unless `changelog-sections` is configured in `.release-please-config.json`)
- Individual commits inside a PR can have any title; only the squash-merge title matters.

### How a release happens

1. Merge a `feat:` or `fix:` PR into `main`.
2. The `Release` workflow opens (or updates) a Release PR that bumps the version in `package.json`, both `plugin/.claude-plugin/plugin.json` and `plugin/.codex-plugin/plugin.json`, and `.release-please-manifest.json`, and appends to `CHANGELOG.md`.
3. Merge the Release PR.
4. The `Release` workflow runs again, creates the git tag `deploygate--vX.Y.Z`, and publishes a GitHub Release.

### Installing a specific version

End users can pin to a tag with:

```
/plugin install DeployGate/deploygate-agent-plugin@deploygate--v1.4.0
```

Without a pin, `claude plugin install` follows `main`. Users can fetch the latest published tag with `claude plugin update deploygate`.

## Support & Project Status

This plugin is open-source software provided **as-is on a best-effort
basis**. See [SUPPORT.md](./SUPPORT.md) for where to get help and what
to expect, and [CONTRIBUTING.md](./CONTRIBUTING.md) for how to
contribute. All participation in this repository is governed by our
[Code of Conduct](./CODE_OF_CONDUCT.md).

## License

MIT — DeployGate Inc.
