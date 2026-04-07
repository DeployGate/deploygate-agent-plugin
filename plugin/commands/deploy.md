---
name: deploy
description: Build the current project and upload the app binary to DeployGate
---

# Build and upload app to DeployGate

Build the current project and upload the binary to DeployGate.

## Steps

1. **Detect project type** by checking for build files:
   - `build.gradle` / `build.gradle.kts` → Android
   - `*.xcodeproj` / `*.xcworkspace` → iOS
   - If both exist, ask the user which platform to build

2. **Get owner name** using the `get_user_info` MCP tool

3. **Build the app**:
   - Android: `./gradlew assembleDebug` → `app/build/outputs/apk/debug/app-debug.apk`
   - iOS: guide the user to build with `fastlane gym` or Xcode Archive, then provide the IPA path
   - Do NOT use APKs from Android Studio's Instant Run / Apply Changes

4. **Collect Git info** for the upload message:
   ```bash
   git rev-parse --short HEAD          # commit hash
   git rev-parse --abbrev-ref HEAD     # branch name
   ```
   Format: `"{branch} ({hash})"` — e.g. `"feature/login (abc1234)"`

5. **Upload** using the `upload_app` MCP tool:
   - `owner_name`: from step 2
   - `file_path`: path to the built binary
   - `message`: Git info from step 4
   - If the user specifies a distribution page, include `distribution_key` or `distribution_name`

6. **Show results**: display the upload response including the app URL and revision number

## Options

The user can specify:
- Distribution page name: `/deploy to "Beta"` → sets `distribution_name: "Beta"`
- Distribution page key: `/deploy to key:abc123` → sets `distribution_key: "abc123"`
- Custom message: `/deploy with message "hotfix build"` → overrides auto-generated message
