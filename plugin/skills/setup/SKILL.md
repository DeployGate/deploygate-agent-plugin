---
name: setup
description: Start DeployGate onboarding — set up app distribution from first upload to team-wide deployment
---

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

## User Input Collection

Throughout this onboarding, use the `AskUserQuestion` tool to collect information from the user at key decision points. This provides a structured, interactive experience instead of free-form text. Each section below specifies when to use `AskUserQuestion` and what questions to ask.

## Initial Assessment

Before starting, detect the platform automatically, then use `AskUserQuestion` to confirm the user's situation:

1. **Platform auto-detection:**
   - Check for `build.gradle` / `build.gradle.kts` → Android
   - Check for `*.xcodeproj` / `*.xcworkspace` → iOS
   - Both may exist (multi-platform project)

2. **Use `AskUserQuestion` to ask:**

   If only one platform is detected:
   - Question 1: "DeployGate のアカウントはお持ちですか？" (header: "アカウント")
     - "はい、持っています" — API トークンを入力してセットアップを続けます
     - "いいえ、まだです" — アカウント作成から始めます

   If both platforms are detected, add a second question:
   - Question 2: "どのプラットフォームからセットアップしますか？" (header: "プラットフォーム")
     - "Android" — Android アプリの配布をセットアップします
     - "iOS" — iOS アプリの配布をセットアップします
     - "両方" — Android と iOS の両方をセットアップします

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

**Enabling Instant Device (Beta):**

Instant Device (browser-based app preview) is currently a beta feature and must be enabled per workspace. Before uploading, direct the user to open the following URL in their browser to enable it:

    https://deploygate.com/app/enterprises/{ENTERPRISE_NAME}/instant-device

Replace `{ENTERPRISE_NAME}` with the workspace name from `get_user_info`. Do not guess or modify this URL — only replace the workspace name portion.

**Android:**

```bash
./gradlew assembleDebug
```

Output: `app/build/outputs/apk/debug/app-debug.apk`

> IMPORTANT: Do NOT use APKs from Android Studio's Instant Run / Apply Changes — these are incomplete. Always use a full Gradle build.

**iOS:**

For iOS, build BOTH an IPA and a simulator zip. The IPA is **required** — the DeployGate upload API does not accept a simulator zip alone. The simulator zip is an optional addition that enables Instant Device (browser-based app preview). If the IPA build fails (e.g. due to code signing issues), you must resolve the issue before uploading. Do NOT suggest uploading only the simulator zip as a workaround.

**0. Check for fastlane and ask build method (iOS only):**

Check if fastlane is installed (`which fastlane`). Then use `AskUserQuestion` to ask:

- Question: "iOS アプリのビルド方法を選択してください" (header: "ビルド方法")
  - If fastlane is installed:
    - "fastlane を使う (推奨)" — fastlane gym でビルドします。UDID 登録にも使えるため推奨です
    - "xcodebuild を使う" — Xcode のコマンドラインツールで直接ビルドします
  - If fastlane is NOT installed:
    - "fastlane をインストールして使う (推奨)" — brew install fastlane を実行してからビルドします。UDID 登録にも使えるため推奨です
    - "xcodebuild を使う" — Xcode のコマンドラインツールで直接ビルドします

fastlane is used for IPA builds in this step and will also be needed later for UDID registration and provisioning profile management (Step 5b). Installing it now saves setup time later.

**Pre-flight: Verify code signing (iOS only):**

Before building the IPA, check the code signing team configuration. Detect the scheme name first, then run:

```bash
xcodebuild -showBuildSettings -scheme "MyApp" 2>/dev/null | grep 'DEVELOPMENT_TEAM'
```

- If `DEVELOPMENT_TEAM` is empty, the user needs to set a team in Xcode → Target → Signing & Capabilities.
- If a team is set, check whether the user has multiple teams available (e.g. both a Personal Team and an organization team):

```bash
security find-identity -v -p codesigning 2>/dev/null
```

**Common pitfall:** When a user belongs to an organization AND has a Personal Team (free Apple ID, not enrolled in Apple Developer Program), they may accidentally select the wrong team in Xcode. If a non-enrolled Personal Team is selected, the IPA export will fail with `"Team ... (Personal Team) is not enrolled in the Apple Developer Program."` This also causes `fastlane produce` and `fastlane sigh` to fail because non-enrolled teams cannot create App IDs.

Note: A Personal Team that IS enrolled in the Apple Developer Program (paid individual membership) works fine. This issue only occurs when the Personal Team is a free account.

If multiple teams are available and the selected team appears to be a free Personal Team, guide the user to: Xcode → Target → Signing & Capabilities → Team → select the correct enrolled team.

**1. Build the IPA:**

If the user chose fastlane:
```bash
fastlane gym --scheme "MyApp" --export_method "development"
```

If the user chose xcodebuild:
```bash
xcodebuild -scheme "MyApp" -sdk iphoneos -configuration Debug -archivePath /tmp/MyApp.xcarchive archive
mkdir -p /tmp/MyApp-ipa/Payload
cp -r /tmp/MyApp.xcarchive/Products/Applications/MyApp.app /tmp/MyApp-ipa/Payload/
cd /tmp/MyApp-ipa && zip -r /tmp/MyApp.ipa Payload
```

**2. Build the simulator zip for Instant Device:**

```bash
xcodebuild -scheme "MyApp" -sdk iphonesimulator -configuration Debug -derivedDataPath /tmp/sim-build
cd /tmp/sim-build/Build/Products/Debug-iphonesimulator
zip -r /tmp/MyApp-simulator.zip MyApp.app
```

**3. Upload both files:**

Upload using the `upload_app` tool with BOTH `file_path` (IPA) and `ios_simulator_zip` (simulator zip):
- `owner_name`: from `get_user_info`
- `file_path`: path to the IPA file
- `ios_simulator_zip`: path to the simulator .zip file
- `message`: include Git info — e.g. `"feature/login (abc1234)"` or `"PR #42: Login redesign (abc1234)"`

The `message` field greatly improves build searchability. Auto-detect Git branch and commit hash if available:

```bash
git rev-parse --short HEAD       # commit hash
git rev-parse --abbrev-ref HEAD  # branch name
```

### Step 3: Create Distribution Page

First, use `AskUserQuestion` to determine the distribution purpose:

- Question: "配布ページの用途を選択してください" (header: "配布用途")
  - "開発チーム向け (Development)" — 開発メンバーが最新ビルドを確認するための配布ページ
  - "QA テスト向け (QA Build)" — テスターがテストするための配布ページ
  - "ベータ版 (Beta)" — 社内・外部ベータテスター向けの配布ページ

Then use the `create_distribution` tool:
- `owner_name`: same as upload
- `platform`: `"ios"` or `"android"`
- `app_id`: package name / bundle identifier (from upload response)
- `title`: the title based on the user's choice (e.g. `"Development"`, `"QA Build"`, `"Beta"`, or custom input)

The response includes `access_key`. The distribution page URL is:
```
https://deploygate.com/distributions/{access_key}
```

Share this distribution page URL with testers. They can:
- **Mobile**: Install the app directly
- **PC**: Use Instant Device to preview the app in a browser (no device needed)

**Instant Device requires login.** To let other users try the app via Instant Device, they must first be invited as DeployGate members. Use the `add_member` tool to add members before sharing the distribution page URL.

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

Skip this step for Android. For iOS, use `AskUserQuestion` to confirm whether device setup is needed:

- Question: "テスターの iOS 実機にアプリをインストールする必要がありますか？" (header: "実機テスト")
  - "はい、実機にインストールしたい" — UDID 登録と Provisioning Profile の更新を行います
  - "いいえ、Instant Device（ブラウザプレビュー）で十分" — Step 5 をスキップして Phase 1 完了チェックに進みます

If the user chooses Instant Device only, skip to Phase 1 Completion Check.

#### 5a: Tester Profile Installation (iOS)

Share the distribution page link with testers and guide them through these steps:

1. Open the distribution page link in **Safari** (other browsers are not supported)
2. They will be prompted to install the DeployGate configuration profile
3. Go to Settings → General → VPN & Device Management → Downloaded Profile → Install
4. Enter the device passcode (not the DeployGate password)

When a tester installs the profile, a notification like "xxx joined 'yyy'" will appear in the chat channel configured in Step 4. This notification signals that the tester is ready.

#### 5b: UDID Registration (Ad Hoc only)

If a tester's device UDID is not in the provisioning profile, they'll see an error message asking to contact the developer.

**Claude Code can automate the entire UDID registration process.** When the user says "add UDIDs" or "a tester can't install", execute the following steps automatically:

> Note: Steps 2-3 use fastlane for Apple Developer Portal interaction. If fastlane was not installed in Step 2, install it now (`brew install fastlane`).

**Authentication for Apple Developer Portal:** Before running `register_devices` or `sigh`, fastlane needs Apple Developer credentials. Check if an `Appfile` exists in the project with `apple_id` and `team_id`. If not, ask the user for their Apple ID (email) and, if they belong to multiple teams, the team ID or team name. Pass these as parameters:

```bash
fastlane run register_devices username:"user@example.com" team_id:"XXXXXXXXXX" devices:'...'
```

If the user has only one team, `team_id` can be omitted. The first run will prompt for 2FA and cache the session locally.

1. **Get unregistered devices** using the `get_udids` tool with `unprovisioned_only: true`

2. **Register UDIDs with Apple Developer Portal** — use device names in `"$device_name ($user_name)"` format:
   ```bash
   fastlane run register_devices username:"user@example.com" team_id:"XXXXXXXXXX" devices:'{"iPhone 15 Pro (tester1)" => "00008030-001234567890001E", "iPad Air 5th generation (tester2)" => "00008101-001234567890002E"}'
   ```

   > **Note:** After device registration, the status may show "Processing" and the device may not be immediately reflected in provisioning profiles. This occurs under the following conditions:
   >
   > - **New Apple Developer Program memberships**, or **memberships renewed after being expired for more than 1 month** (does not affect existing active memberships)
   > - 1–10 registered devices: Reflected immediately upon registration
   > - 11–100 registered devices: Reflected within 24–72 hours
   >
   > While in Processing status, the device will not be included in provisioning profiles even though it is registered. Wait until the status becomes active. Inform the user if this situation occurs.
   >
   > Reference: https://developer.apple.com/help/account/reference/device-registration-updates/

3. **Update the provisioning profile** (use the same `username` and `team_id` as above):
   ```bash
   fastlane sigh --adhoc --force --username "user@example.com" --team_id "XXXXXXXXXX"
   ```

4. **Rebuild the app:**
   ```bash
   xcodebuild -scheme "MyApp" -sdk iphoneos -configuration Debug -archivePath /tmp/MyApp.xcarchive archive
   ```
   Then create the IPA (same as Step 2 of the upload flow).

5. **Re-upload to DeployGate** using the `upload_app` tool with the same `distribution_key` to update the existing distribution page

6. **Confirm** that testers can now install the app from the distribution page

### Phase 1 Completion Check

Before declaring Phase 1 complete, use `AskUserQuestion` to confirm the setup:

- Question 1: "テスターはアプリにアクセスできましたか？" (header: "アプリ確認", multiSelect: false)
  - "はい、確認できました" — テスターがアプリを起動できている（Instant Device またはインストール）
  - "まだ確認できていない" — テスターに配布ページのリンクを共有して確認してもらいます
  - "問題が発生している" — トラブルシューティングを行います

- Question 2: "ビルドアップロード時に通知は届きましたか？（Step 4 で設定したチャンネル）" (header: "通知確認", multiSelect: false)
  - "はい、届きました" — 通知連携が正常に動作しています
  - "いいえ、届いていない" — 通知設定を再確認します
  - "通知設定をスキップした" — 後で設定することもできます

Only after the user confirms both items, say: "Phase 1 is complete — your app is being distributed to testers via DeployGate."

If the user reports issues, help troubleshoot using the Troubleshooting section below before re-asking.

## Next Steps

### Phase 2: CI/CD Integration

"Now that distribution is working, you can automate builds with CI/CD. This frees developers from manual uploads and lets testers always get the latest build."

→ Suggest using the `ci-setup` skill

### Phase 3: SDK Integration (Android only)

"The DeployGate SDK adds crash reporting and screen capture for bug reporting — testers can report issues with a single screenshot."

→ Suggest using the `sdk-setup` skill

> **Note:** The iOS SDK is currently being redesigned, so new integration is not recommended. Skip this phase for iOS projects. App distribution, Instant Device, and notification features are all available without the SDK.

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
