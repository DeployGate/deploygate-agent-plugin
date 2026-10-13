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

**The MCP server sends data only to DeployGate.** Every request goes to `https://deploygate.com` over HTTPS: the app binaries and Android signing keystores you choose to upload, distribution page settings, member invitations, and requests for account, app, and device information. The server contacts no other service and sends no telemetry.

**Skills can run your own build and signing tools.** Claude Code asks before it runs these commands, unless your own permission settings already allow them. The tools use your own accounts and configuration, and the plugin doesn't read their credentials.

- Gradle, `xcodebuild`, and fastlane (`gym`) build your app. They download dependencies, and for iOS they contact Apple to sign the build.
- For iOS Ad Hoc builds, the `setup` skill can run `fastlane register_devices` and `fastlane sigh` to register testers' devices with the Apple Developer Portal and refresh the provisioning profile. This sends the device UDIDs, the device names (which include tester names), and your Apple ID and team ID to Apple.
- For iOS CI, the `ci-setup` skill can set up `fastlane match`, which stores your signing certificates and provisioning profiles in the storage you choose: a Git repository, Google Cloud Storage, or S3.

**Stores one credential.** You sign in with a browser-based device authorization flow (`login_start`, then `login_wait`). DeployGate issues a token for this plugin, and the plugin saves it to `$XDG_CONFIG_HOME/deploygate/token`, which is `~/.config/deploygate/token` when `XDG_CONFIG_HOME` isn't set, or to `%APPDATA%\deploygate\token` on Windows. On macOS and Linux, the file has `0600` permissions, so only your user can read it. On Windows, it keeps the default access control of your `%APPDATA%` folder. The token is sent only to `https://deploygate.com`. The `logout` tool revokes it on the server and deletes the file.

**Reads other credentials only when you ask.** The `update_keystore` tool reads the Android signing keystore file at the path you give it and takes the keystore and key passwords you provide. It sends them to `https://deploygate.com` to replace the app's signing keystore, and doesn't store them locally. The plugin reads no environment variables that hold secrets.

**CI templates.** The workflows that `ci-setup` writes refer to secrets such as `DEPLOYGATE_API_TOKEN` that you add in your CI service. They run on your CI provider; the plugin itself never reads them.

## About `scripts/bundle.js`

`scripts/bundle.js` is the MCP server and its npm dependencies, mainly `@modelcontextprotocol/sdk` and `zod`, bundled into one unminified file with esbuild. The build leaves out code the server doesn't use: zod's error messages in languages other than English, and the SDK's JSON Schema validator for form elicitation. It is built from the TypeScript source in [`src/`](https://github.com/DeployGate/deploygate-agent-plugin/tree/main/src) by `npm ci && npm run bundle`, and CI checks that the committed bundle matches a fresh build of the source before each release, and that it stays under 1 MiB so it can be read as text.

## Support

- Questions about the DeployGate service: [DeployGate Help Center](https://intercom.help/deploygate)
- Bugs and feature requests for this plugin: [GitHub Issues](https://github.com/DeployGate/deploygate-agent-plugin/issues)
- Security vulnerabilities: [help@deploygate.com](mailto:help@deploygate.com) (please don't open a public issue)

See [SUPPORT.md](https://github.com/DeployGate/deploygate-agent-plugin/blob/main/SUPPORT.md) for details.

## License

MIT
