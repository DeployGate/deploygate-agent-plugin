# DeployGate Claude Plugin

DeployGate integration for Claude Code — upload mobile apps, manage distribution pages, set up CI/CD, and onboard your team. Supports iOS (IPA) and Android (APK/AAB).

## Installation

Add the marketplace and install the plugin by running following commands within your Claude Code:

```
/plugin marketplace add DeployGate/deploygate-claude-plugin
/plugin install deploygate@deploygate-marketplace
```

## Getting Started

After installation, run `/deploygate:setup` to start the guided onboarding flow:

1. **Account creation** — sign up and set your API token via `set_api_token`
2. **App upload** — build and upload your IPA/APK/AAB
3. **Distribution page** — create a distribution page with an install link
4. **Notifications** — connect Slack/Teams/Chatwork
5. **iOS device setup** — UDID registration for Ad Hoc builds (if applicable)

If you already have an API token, you can set `DEPLOYGATE_API_TOKEN` as an environment variable in your MCP server configuration for automatic authentication.

## Skills (Slash Commands)

Skills are invoked as `/deploygate:<skill-name>` when used as a plugin.

| Skill | Command | Description |
|---|---|---|
| `setup` | `/deploygate:setup` | Full onboarding flow with step-by-step progress display |
| `deploy` | `/deploygate:deploy` | Build and upload the current project to DeployGate |
| `ci-setup` | `/deploygate:ci-setup` | CI/CD integration — GitHub Actions, Bitrise, CircleCI |
| `sdk-setup` | `/deploygate:sdk-setup` | Android SDK integration (crash reporting, screen capture). iOS SDK is currently not recommended. |

## MCP Tools

### Authentication

| Tool | Description |
|---|---|
| `set_api_token` | Set the API token for this session. Validates the token and returns user information. For persistent config, use the `DEPLOYGATE_API_TOKEN` environment variable. |
| `get_user_info` | Get current user information (workspace names, projects) from the API token. |

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

## License

MIT — DeployGate Inc.
