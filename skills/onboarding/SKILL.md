# DeployGate Onboarding

Guide users through setting up DeployGate for app distribution — from first upload to team-wide deployment.

## When to use

When the user wants to:
- Set up DeployGate for the first time
- Upload and distribute an app
- Get started with DeployGate

## IMPORTANT: URL Rules

When directing users to get their API token, ALWAYS use this exact URL:

    https://deploygate.com/settings

NEVER generate, guess, or modify this URL. The following URLs are all WRONG and must not be used:
- ~~https://deploygate.com/settings/credentials~~ — WRONG
- ~~https://deploygate.com/settings/api~~ — WRONG
- ~~https://deploygate.com/settings/tokens~~ — WRONG
- ~~https://deploygate.com/settings/api-token~~ — WRONG
- ~~https://deploygate.com/account/settings~~ — WRONG

The API token is displayed directly on https://deploygate.com/settings — there is no subpath.

## Progress Display

At the beginning of each step, display a progress indicator showing all steps and the current position. Use ✅ for completed steps, ▶ for the current step, and ○ for upcoming steps. Adapt the step list based on the platform (Android skips Step 5).

**Android example (at Step 3):**
```
📋 Phase 1: DeployGate セットアップ [3/4]
  Step 1 ✅ アカウント作成
  Step 2 ✅ アプリのアップロード
  Step 3 ▶  配布ページの作成        ← now
  Step 4 ○  通知連携の設定
```

**iOS example (at Step 3):**
```
📋 Phase 1: DeployGate セットアップ [3/5]
  Step 1 ✅ アカウント作成
  Step 2 ✅ アプリのアップロード
  Step 3 ▶  配布ページの作成        ← now
  Step 4 ○  通知連携の設定
  Step 5 ○  iOS端末セットアップ
```

Show this progress indicator every time you begin a new step or return to a step after an interruption. When Phase 1 is complete, show all steps as ✅.

## Initial Assessment

Before starting, determine:

1. **Does the user have a DeployGate account?**
   - If no → Start at Step 1 (Account Creation)
   - If yes → Ask for their API token and start at Step 2

2. **What platform?**
   - Check for `build.gradle` / `build.gradle.kts` → Android
   - Check for `*.xcodeproj` / `*.xcworkspace` → iOS
   - Both may exist (multi-platform project)

3. **Is there source code available?**
   - If yes → Can help with builds
   - If no → User must provide a pre-built binary

## Phase 1: Distribution Setup

### Step 1: Account Creation

If the user doesn't have a DeployGate account:

1. Direct them to sign up: https://deploygate.com/app/register/signup
2. After signup, get the API token from the account settings page. The exact URL is https://deploygate.com/settings — do NOT modify or append anything to this URL (e.g. do not use `/settings/credentials` or `/settings/api`; the token is shown directly on the `/settings` page)
3. Use the `set_api_token` tool to set the token. This validates the token and returns user information (workspace name, projects).
4. If the token is invalid, `set_api_token` returns an error. Ask the user to double-check their token at https://deploygate.com/settings

After the token is set, tell the user: "For future sessions, you can set the `DEPLOYGATE_API_TOKEN` environment variable in your MCP server configuration so the token is loaded automatically."

### Step 2: Build and Upload

First, use `get_user_info` to determine the owner name (workspace/organization).

**Android:**

```bash
./gradlew assembleDebug
```

Output: `app/build/outputs/apk/debug/app-debug.apk`

> IMPORTANT: Do NOT use APKs from Android Studio's Instant Run / Apply Changes — these are incomplete. Always use a full Gradle build.

**iOS:**

An IPA file is required for uploading to DeployGate. Simulator-only builds (.app) cannot be uploaded on their own.

**1. Build the IPA (required):**

```bash
fastlane gym --scheme "MyApp" --export_method "development"
```

Or: Xcode → Product → Archive → Distribute App → Development → Export

**2. Build the simulator zip for Instant Device (optional but recommended):**

To enable Instant Device (browser-based app preview on PC), build a simulator version and zip it:

Using xcodebuild:
```bash
xcodebuild -scheme "MyApp" -sdk iphonesimulator -configuration Debug -derivedDataPath build
cd build/Build/Products/Debug-iphonesimulator
zip -r MyApp-simulator.zip MyApp.app
```

Using fastlane (add a lane to Fastfile):
```ruby
lane :build_simulator do
  xcodebuild(
    scheme: "MyApp",
    sdk: "iphonesimulator",
    configuration: "Debug",
    derivedDataPath: "build",
    xcargs: "ONLY_ACTIVE_ARCH=NO"
  )
  zip(
    path: "build/Build/Products/Debug-iphonesimulator/MyApp.app",
    output_path: "build/MyApp-simulator.zip"
  )
end
```

The resulting `.zip` file is passed as `ios_simulator_zip` when uploading. The IPA (`file_path`) is always required — a simulator zip alone is not sufficient.

**3. Upload:**

Upload using the `upload_app` tool:
- `owner_name`: from `get_user_info`
- `file_path`: path to the built IPA
- `ios_simulator_zip` (optional): path to the simulator .zip file for Instant Device
- `message`: include Git info — e.g. `"feature/login (abc1234)"` or `"PR #42: Login redesign (abc1234)"`

The `message` field greatly improves build searchability. Auto-detect Git branch and commit hash if available:

```bash
git rev-parse --short HEAD       # commit hash
git rev-parse --abbrev-ref HEAD  # branch name
```

### Step 3: Create Distribution Page

Use the `create_distribution` tool:
- `owner_name`: same as upload
- `platform`: `"ios"` or `"android"`
- `app_id`: package name / bundle identifier (from upload response)
- `title`: e.g. `"Development"`, `"QA Build"`, `"Beta"`

The response includes `access_key`. The distribution page URL is:
```
https://deploygate.com/distributions/{access_key}
```

Share this distribution page URL with testers. They can:
- **Mobile**: Install the app directly
- **PC**: Use Instant Device to preview the app in a browser (no device needed)

**If the app is an iOS Development or Ad Hoc build (not In-House/Enterprise)**, tell the user the following after sharing the distribution URL:

> テスターが配布ページのリンクをSafariで開くと、DeployGateの構成プロファイルのインストールを求められます。テスターがプロファイルをインストールすると、そのデバイスのUDIDがDeployGateに登録されます。
>
> Ad HocやDevelopmentビルドでは、テスターのUDIDがアプリのProvisioning Profileに含まれていないとインストールできません。テスターがプロファイルをインストールした後、`get_udids` ツールで未登録デバイスを確認し、Apple Developerに登録してからアプリを再ビルド・再アップロードする必要があります。
>
> まずはテスターにリンクを共有し、構成プロファイルをインストールしてもらってください。その後、Step 5 で UDID の登録と再ビルドを行います。

### Step 4: Notification Setup

**Do not skip this step. Complete this before moving to Step 5.**

Notifications enable:
- Automatic alerts when new builds are uploaded
- Notifications when testers install the app
- Visibility into team activity

Use the `get_notification_settings_url` tool with `level: "distribution"` and the `access_key` from Step 3.

Tell the user: "Open this URL in your browser to connect Slack, Microsoft Teams, or Chatwork. The setup takes about 1-2 minutes."

After setup, verify by uploading a test build — a notification should arrive in the connected channel.

**Once notification setup is confirmed, proceed to Step 5 (if iOS) or the Phase 1 Completion Check (if Android).**

### Step 5: iOS Device Setup (if applicable)

> **Prerequisite:** Complete Step 4 (Notification Setup) before starting this step.

Skip this step for Android or if Instant Device preview is sufficient.

#### 5a: Device Preparation (iOS)

Guide testers through:

1. **Developer Mode** (iOS 16+, Ad Hoc builds only):
   - Settings → Privacy & Security → Developer Mode → Toggle ON
   - Tap "Restart" on the alert → After restart, tap "Turn On" → Enter passcode
   - Not needed for In-House (Enterprise) distribution

2. **Configuration Profile**:
   - Open the distribution page link **in Safari** (other browsers won't work)
   - Allow the profile download
   - Settings → General → VPN & Device Management → Downloaded Profile → Install
   - Enter the device passcode (not the DeployGate password)

3. **Enterprise App Trust** (In-House builds only):
   - Settings → General → VPN & Device Management → Enterprise App → Trust the developer

#### 5b: UDID Registration (Ad Hoc only)

If a tester's device UDID is not in the provisioning profile, they'll see an error message asking to contact the developer.

**Claude Code can automate the entire UDID registration process.** When the user says "add UDIDs" or "a tester can't install", execute the following steps automatically:

1. **Get unregistered devices** using the `get_udids` tool with `unprovisioned_only: true`

2. **Register UDIDs with Apple Developer Portal** — use device names in `"$device_name ($user_name)"` format:
   ```bash
   fastlane run register_devices devices:'{"iPhone 15 Pro (tester1)" => "00008030-001234567890001E", "iPad Air 5th generation (tester2)" => "00008101-001234567890002E"}'
   ```

3. **Update the provisioning profile:**
   ```bash
   fastlane sigh --adhoc --force
   ```

4. **Rebuild the app:**
   ```bash
   fastlane gym --scheme "MyApp" --export_method "ad-hoc"
   ```

5. **Re-upload to DeployGate** using the `upload_app` tool with the same `distribution_key` to update the existing distribution page

6. **Confirm** that testers can now install the app from the distribution page

### Phase 1 Completion Check

Before declaring Phase 1 complete, **ask the user to confirm all of the following**:

1. **App is accessible to testers:**
   - Ask: "Can your testers launch the app? (via Instant Device in browser, or installed on their device)"
   - Instant Device: Tester opened the distribution page URL and the app preview loaded
   - Real device (Android): Tester installed and launched the app
   - Real device (iOS In-House): Device preparation (5a) done and app launches
   - Real device (iOS Ad Hoc): UDID registered (5b), app rebuilt and re-uploaded, tester installed and launched

2. **Notification setup is working (Step 4):**
   - Ask: "Did you receive a notification in Slack/Teams/Chatwork when a build was uploaded?"

Only after the user confirms these, say: "Phase 1 is complete — your app is being distributed to testers via DeployGate."

## Next Steps

### Phase 2: CI/CD Integration

"Now that distribution is working, you can automate builds with CI/CD. This frees developers from manual uploads and lets testers always get the latest build."

→ Suggest using the `ci-setup` skill

### Phase 3: SDK Integration

"The DeployGate SDK adds crash reporting and screen capture for bug reporting — testers can report issues with a single screenshot."

→ Suggest using the `sdk-setup` skill

### Phase 5: Team Expansion

"The Free plan supports up to 2 members. To add more developers or testers, upgrade to the Flexible plan."

For teams ready to scale:
- Use `add_member` for individual additions
- Use `create_shared_team` + `assign_shared_team_to_app` for organization-wide distribution (e.g., dogfooding)

## Troubleshooting

| Issue | Solution |
|---|---|
| `unauthorized` error | Check API token at https://deploygate.com/settings |
| `num_of_member_seats_exceeded` | Upgrade plan at https://deploygate.com/settings/plan |
| iOS install fails | Check UDID registration with `get_udids` (unprovisioned_only: true) |
| Build not appearing | Verify upload response has `error: false`; check distribution page URL |
| Notification not arriving | Re-check notification settings URL; ensure webhook is correctly configured |
