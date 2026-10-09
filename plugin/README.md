# DeployGate

Distribute iOS and Android test builds with [DeployGate](https://deploygate.com) without leaving your coding agent. The plugin uploads IPA, APK, and AAB builds, creates and updates distribution pages, invites testers, lists iOS device UDIDs, and generates CI/CD workflows that upload every build automatically.

## Install

In Claude Code, run:

```text
/plugin install deploygate --marketplace DeployGate/deploygate-agent-plugin
```

On Claude Code versions before 2.1.275, run `/plugin marketplace add DeployGate/deploygate-agent-plugin` first, then `/plugin install deploygate@deploygate-marketplace`. Then run `/deploygate:setup` to start.

## Skills

| Skill | What it does |
|---|---|
| `/deploygate:setup` | Guided onboarding: sign in, build and upload your first app, create a distribution page, connect notifications, and register iOS devices |
| `/deploygate:deploy` | Build the current project and upload the binary to DeployGate |
| `/deploygate:ci-setup` | Generate a GitHub Actions workflow, or set up Bitrise, CircleCI, and other CI services, to upload builds and distribute pull requests |
| `/deploygate:sdk-setup` | Add the DeployGate SDK to an Android app for crash reporting and screen capture |

The skills don't pre-approve build commands such as Gradle, `xcodebuild`, or fastlane, so Claude Code asks for your permission before it runs them, unless your own permission settings already allow them. File edits are pre-approved only for the CI configuration files and Gradle build scripts that the skills set up.

## Requirements

- Node.js 20 or later
- A DeployGate account. The setup skill links you to sign-up if you don't have one.

The plugin runs a local MCP server, so its tools work in Claude Code and Cowork but not in Claude chat on claude.ai.

## What the plugin runs, sends, and stores

**Runs locally.** The MCP server is `scripts/bundle.js`, started with `node`. It talks to Claude over stdio and opens no network ports.

**Sends data only to DeployGate.** Every request goes to `https://deploygate.com` over HTTPS: the app binaries you choose to upload, distribution page settings, member invitations, and requests for account, app, and device information. The plugin contacts no other service and sends no telemetry.

**Stores one credential.** You sign in with a browser-based device authorization flow (`login_start`, then `login_wait`). DeployGate issues a token for this plugin, and the plugin saves it to `~/.config/deploygate/token` (`%APPDATA%\deploygate\token` on Windows) with `0600` permissions. The token is sent only to `https://deploygate.com`. The `logout` tool revokes it on the server and deletes the file. The plugin reads no other credentials or environment variables that hold secrets.

**CI templates.** The workflows that `ci-setup` writes refer to secrets such as `DEPLOYGATE_API_TOKEN` that you add in your CI service. They run on your CI provider; the plugin itself never reads them.

## About `scripts/bundle.js`

`scripts/bundle.js` is the MCP server and its npm dependencies, mainly `@modelcontextprotocol/sdk` and `zod`, bundled into one unminified file with esbuild. It is built from the TypeScript source in [`src/`](https://github.com/DeployGate/deploygate-agent-plugin/tree/main/src) by `npm ci && npm run bundle`, and CI checks that the committed bundle matches a fresh build of the source before each release.

## Support

- Source and issues: https://github.com/DeployGate/deploygate-agent-plugin
- Help: help@deploygate.com

## License

MIT
