# DeployGate Claude Plugin

DeployGate integration for Claude Code — upload apps, manage distribution pages, set up CI/CD, and onboard your team.

## Prerequisites

- Node.js >= 20.0.0
- DeployGate account with an API token ([Get your token](https://deploygate.com/settings))

## Installation

### As a Claude Code plugin

```bash
/plugin install deploygate@deploygate-marketplace
```

### Manual setup

1. Clone the repository:
   ```bash
   git clone https://github.com/DeployGate/deploygate-claude-plugin.git
   cd deploygate-claude-plugin
   npm install
   npm run build
   ```

2. Add to your Claude Code MCP configuration (`.mcp.json`):
   ```json
   {
     "mcpServers": {
       "deploygate": {
         "command": "node",
         "args": ["/path/to/deploygate-claude-plugin/dist/index.js"],
         "env": {
           "DEPLOYGATE_API_TOKEN": "your-api-token"
         }
       }
     }
   }
   ```

## MCP Tools

### Authentication

| Tool | Description |
|---|---|
| `get_user_info` | Get current user information by retrieving organizations associated with the API token. Returns workspace names and default projects. |

### App Upload

| Tool | Description |
|---|---|
| `upload_app` | Upload an app binary (IPA/APK/AAB) to DeployGate. Supports optional distribution page targeting. |

**Parameters:**
- `owner_name` (required): Owner name (user or organization)
- `file_path` (required): Absolute path to the app binary
- `message`: Build description (max 32,766 bytes; auto-truncated if exceeded)
- `distribution_key`: Distribution page key to update. **Takes priority over `distribution_name`.**
- `distribution_name`: Distribution page name. Creates a new page (with `active=false`) if not found. Ignored if `distribution_key` is also specified.
- `release_note`: Release note for the distribution page
- `disable_notify`: Disable push notification to testers (iOS only)

### Distribution Page Management

| Tool | Description |
|---|---|
| `create_distribution` | Create a new distribution page. Returns `access_key` for the URL `https://deploygate.com/distributions/{access_key}` |
| `list_distributions` | List all distribution pages for an app |
| `get_distribution` | Get details of a specific distribution page |
| `update_distribution` | Update a distribution page. **`active` and `release_scope` are always required** — use `get_distribution` first to retrieve current values when only changing the title. |
| `delete_distribution` | Delete a distribution page. Uploaded builds (binaries) are preserved. |

**Release scope options** (`release_scope` parameter):
- `public` — publicly accessible, indexable by search engines
- `unlisted` — accessible to anyone with the link (default)
- `passcode` — requires a passcode to access (`passcode` parameter required)
- `authorized_only` — only accessible to logged-in team members

### iOS UDID Management

| Tool | Description |
|---|---|
| `get_udids` | Get iOS device UDIDs for an app. Use `unprovisioned_only=true` to find devices that need to be added to the provisioning profile for Ad Hoc distribution. |

### Notification Settings

| Tool | Description |
|---|---|
| `get_notification_settings_url` | Generate the URL for configuring Slack/Teams/Chatwork notifications. Supports distribution-level and app-level settings. Note: Organization-owned and user-owned apps have different URL paths. |

### Member Management

| Tool | Description |
|---|---|
| `add_member` | Add a member with a specified role (owner/developer/tester). Orchestrates 3-4 API calls automatically. Handles duplicates gracefully. Free plan limit: 2 members. |
| `list_members` | List members of a specific team in a project |
| `remove_member` | Remove a member from a team (they remain in the workspace/project) |

**Member addition flow:**
1. Add to workspace → duplicate returns "already_joined_member" (skipped)
2. Add to project → upsert (silent success on duplicate)
3. Add to team → upsert (silent success on duplicate)
4. (Tester only) Assign tester team to app

### Shared Team Management

| Tool | Description |
|---|---|
| `create_shared_team` | Create a workspace-level shared team for cross-project use |
| `add_shared_team_member` | Add a member to a shared team. Specify `email` **or** `username`, not both. |
| `assign_shared_team_to_app` | Assign a shared team to an app (members get tester-level access) |

## API Response Format

All DeployGate API responses follow the V1 envelope format:

**Success:**
```json
{ "error": false, "results": { ... } }
```

**Error:**
```json
{ "error": true, "message": "...", "because": "...", "error_type": "..." }
```

Validation errors include an additional `invalid_params` array.

## Skills

The plugin includes onboarding skills for guided setup:

- **`skills/onboarding/`** — Full onboarding flow: account setup, app upload, distribution, notifications
- **`skills/ci-setup/`** — CI/CD integration with GitHub Actions, Bitrise, CircleCI
- **`skills/sdk-setup/`** — Android/iOS SDK integration guide

## GitHub Actions Templates

Pre-built workflow templates are available in `templates/`:

- **`deploygate-upload.yml`** — Upload to DeployGate on push to main
- **`deploygate-pr.yml`** — PR-based distribution with automatic page creation/cleanup

## License

MIT
