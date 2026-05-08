---
name: setup
description: Start DeployGate onboarding — set up app distribution from first upload to team-wide deployment
allowed-tools: mcp__deploygate__* Bash(./gradlew:*) Bash(xcodebuild:*) Bash(fastlane:*) Bash(security find-identity:*) Bash(git rev-parse:*) Bash(which:*) Bash(mkdir:*) Bash(cp:*) Bash(zip:*) Bash(cd:*) Bash(ls:*) Read Glob AskUserQuestion request_user_input
---

## Response Language

Detect the user's language from their first message in the conversation.
If they wrote in Japanese, use the `(ja)` block at every user-facing
location below. Otherwise (English or any other language), use the
`(en)` block. If unsure, default to `(en)`.

User-facing locations are written as paired blocks marked `(en)` and
`(ja)`. **Use only one — never both.** This applies to user-question
tool text, progress-display labels, and any prose you quote to the user.
Internal instructions, code blocks, file paths, tool names, and JSON
examples stay English regardless of language.

## User Questions

At key decision points, use the host client's structured user-question tool:

- Claude Code: use `AskUserQuestion`.
- Codex: use `request_user_input` when that tool is available. If it is not available in the current mode, ask one concise plain-text question and wait for the user's answer.

When this skill says `AskUserQuestion`, treat that as `request_user_input` on Codex.

# DeployGate Onboarding

Guide users through setting up DeployGate for app distribution — from first upload to team-wide deployment.

## When to use

When the user wants to:
- Set up DeployGate for the first time
- Upload and distribute an app
- Get started with DeployGate

## Reference files

Load these on demand when the flow reaches the matching step. Do NOT preload them — each file is substantial and wastes context if unused.

- `references/terminology.md` — **Read this first**, before writing any user-facing response. Defines the user-facing terms (Workspace / Project / Team / Shared Team) and their Japanese equivalents.
- `references/ios-build.md` — iOS build detail: fastlane vs xcodebuild, code signing pre-flight, Personal Team pitfall. Read when handling iOS in Step 2.
- `references/ios-udid.md` — Step 5b UDID registration flow (fastlane register_devices / sigh). Read when a tester cannot install an Ad Hoc build.
- `references/next-steps.md` — Phase 2+ guidance (CI/CD, SDK, team expansion). Read after Phase 1 completes.
- `references/troubleshooting.md` — troubleshooting table. Read on error.

## Progress Display

At the beginning of each step, display a progress indicator. Use ✅ for completed, ▶ for current, and ○ for upcoming. Android skips Step 5.

**Android example (at Step 3) — (en):**
```
📋 Phase 1: DeployGate Setup [3/4]
  Step 1 ✅ Account creation
  Step 2 ✅ App upload
  Step 3 ▶  Distribution page        ← now
  Step 4 ○  Notification setup
```

**Android example (at Step 3) — (ja):**
```
📋 Phase 1: DeployGate セットアップ [3/4]
  Step 1 ✅ アカウント作成
  Step 2 ✅ アプリのアップロード
  Step 3 ▶  配布ページの作成        ← now
  Step 4 ○  通知連携の設定
```

**iOS example (at Step 3) — (en):**
```
📋 Phase 1: DeployGate Setup [3/5]
  Step 1 ✅ Account creation
  Step 2 ✅ App upload
  Step 3 ▶  Distribution page        ← now
  Step 4 ○  Notification setup
  Step 5 ○  iOS device setup
```

**iOS example (at Step 3) — (ja):**
```
📋 Phase 1: DeployGate セットアップ [3/5]
  Step 1 ✅ アカウント作成
  Step 2 ✅ アプリのアップロード
  Step 3 ▶  配布ページの作成        ← now
  Step 4 ○  通知連携の設定
  Step 5 ○  iOS端末セットアップ
```

Show this every time you begin or return to a step. When Phase 1 completes, keep the `[5/5]` (iOS) or `[4/4]` (Android) header and mark every step ✅ — do NOT replace the numeric ratio with `[完了]` or similar.

## User Input Collection

Use the structured user-question tool at key decision points — each section below specifies when.

## Initial Assessment

Before starting, detect the platform automatically, then use the structured user-question tool to confirm the user's situation:

1. **Platform auto-detection.** Run `ls` in the project root (do NOT use `Glob` for iOS — `*.xcodeproj` and `*.xcworkspace` are macOS bundle directories and Glob will return zero matches). Inspect the output:
   - Contains `build.gradle` or `build.gradle.kts` → Android candidate
   - Contains any name ending in `.xcodeproj` or `.xcworkspace` → iOS candidate
   - If neither is visible at the root, also `ls` any likely platform subdirectories that appear in the root listing (e.g. `app-ios/`, `ios/`, `iosApp/`, `app-android/`, `android/`). KMP / Kotlin Multiplatform and many multi-module repos nest platform projects one level deep — the `.xcodeproj` is often inside `app-ios/`, the Android module inside `app-android/`
   - Both platforms detected (at root or in subdirs) → multi-platform project

2. **Use the structured user-question tool to ask:**

   - Question 1 (en): "Do you have a DeployGate account?" (header: "Account")
     - "Yes, I have one" — Continue with browser-based login
     - "No, not yet" — Start with account creation
   - Question 1 (ja): "DeployGate のアカウントはお持ちですか？" (header: "アカウント")
     - "はい、持っています" — ブラウザ認証でログインしてセットアップを続けます
     - "いいえ、まだです" — アカウント作成から始めます

   If both platforms are detected, add a second question:
   - Question 2 (en): "Which platform should we set up first?" (header: "Platform")
     - "Android" / "iOS" / "Both"
   - Question 2 (ja): "どのプラットフォームからセットアップしますか？" (header: "プラットフォーム")
     - "Android" / "iOS" / "両方"

3. **Is there source code available?** If no, the user must provide a pre-built binary.

## API Identifiers (used throughout Phase 1)

DeployGate has two identifier slugs you will reuse across tool calls. Both come from the `get_user_info` / `login_wait` response. Read terminology.md first for the user-facing names; this section is just the API-side mapping.

Response shape (simplified):

```json
[
  {
    "name": "example-workspace",        // workspace slug (legacy: "enterprise")
    "groups": [
      { "name": "shaker-app", ... }      // project slug (legacy: "organization")
    ]
  }
]
```

Mapping — use these consistently:

| Skill placeholder | Source field | Used in |
|---|---|---|
| `owner_name` | project slug (`groups[i].name`) — or the user's own login name for a personal account | `upload_app`, `create_distribution`, `get_notification_settings_url`, member tools |
| `{ENTERPRISE_NAME}` | workspace slug (top-level `name`) | Instant Device enable URL only |
| `app_id` | `package_name` from the `upload_app` response | `create_distribution` |

If the user belongs to multiple projects (more than one entry in `groups`), ask **once** at Step 1 which project to use and reuse that choice for every subsequent tool call — do not re-prompt at Step 2.

## Phase 1: Distribution Setup

### Step 1: Account Creation

Login is browser-based via a device authorization code. The user never pastes a token.

**If the user already has an account:**

1. Call `login_start`. It returns a URL (format: `https://deploygate.com/app/sessions/codes?code=XXXXXXXX`) and a short code. Present the URL to the user and ask them to open it in a browser where they are signed in to DeployGate, then approve the login.
2. Call `login_wait` immediately after — it blocks until the user approves (or the code expires in 5 minutes). On success it returns workspace/project info and saves the token to `~/.config/deploygate/token` (0600).
3. If `login_wait` returns an error (rejected, expired, nonce mismatch), call `login_start` again and retry.

**If the user doesn't have a DeployGate account:**

1. Direct them to sign up: https://deploygate.com/app/register/signup?via=deploygate-plugin
2. After signup, run the same `login_start` → `login_wait` flow described above.

The saved token persists across future agent sessions — the user does not need to log in again unless they run `logout` or the token is revoked server-side.

If `login_wait` or any later tool returns "stored token is invalid," the local token file has already been cleared; the user just needs to call `login_start` again.

### Step 2: Build and Upload

Use the `owner_name` (project slug) chosen at Step 1. If it was not captured, call `get_user_info` now. See the API Identifiers section for the mapping.

**Enable Instant Device (Beta):** Instant Device (browser-based app preview) is beta and must be enabled per workspace. Present this URL **as the first thing in Step 2**, before reading `ios-build.md` or asking the build-method question — the user clicks it once and you proceed in parallel without waiting:

    https://deploygate.com/app/enterprises/{ENTERPRISE_NAME}/instant-device

Substitute `{ENTERPRISE_NAME}` per the API Identifiers section (workspace slug). The action is idempotent; do not block on confirmation.

**Android:**
```bash
./gradlew assembleDebug
```

Output path depends on module layout:
- **Single-module (module name `app`)**: `app/build/outputs/apk/debug/app-debug.apk`
- **Multi-module / KMP (e.g. module `app-android`)**: `<module>/build/outputs/apk/debug/<module>-debug.apk`
- **With product flavors** (e.g. `dev` / `prod`): adds a flavor segment — `<module>/build/outputs/apk/<flavor>/debug/<module>-<flavor>-debug.apk`

Check `settings.gradle.kts` / `settings.gradle` for the app module name. If the project has multiple Android modules, scope the task: `./gradlew :<app-module>:assembleDebug` (e.g. `./gradlew :app-android:assembleDebug`). After the build, ask the user for the exact APK path before calling `upload_app` rather than guessing.

> IMPORTANT: Do NOT use APKs from Android Studio's Instant Run / Apply Changes — these are incomplete. Always use a full Gradle build.

**iOS:** Read `references/ios-build.md` for the full build procedure (fastlane vs xcodebuild, code signing pre-flight, simulator zip for Instant Device). The IPA is **required**; the simulator zip is an optional addition. Do NOT suggest uploading only the simulator zip as a workaround for a failing IPA build.

**Upload** using the `upload_app` tool:
- `owner_name`: from `get_user_info`
- `file_path`: path to the IPA / APK / AAB
- `ios_simulator_zip`: (iOS only) path to the simulator .zip if built
- `message`: include Git info — e.g. `"feature/login (abc1234)"` or `"PR #42: Login redesign (abc1234)"`

The response contains `package_name` (bundle identifier on iOS, package name on Android) — you will pass this as `app_id` in Step 3.

Auto-detect Git info if available:
```bash
git rev-parse --short HEAD       # commit hash
git rev-parse --abbrev-ref HEAD  # branch name
```

### Step 3: Create Distribution Page

First, use the structured user-question tool:

- Question (en): "What is the purpose of this distribution page?" (header: "Distribution purpose")
  - "Development team (Development)" — A page for developers to verify the latest builds
  - "QA testing (QA Build)" — A page for testers to run QA
  - "Beta (Beta)" — A page for internal/external beta testers
- Question (ja): "配布ページの用途を選択してください" (header: "配布用途")
  - "開発チーム向け (Development)" — 開発メンバーが最新ビルドを確認するための配布ページ
  - "QA テスト向け (QA Build)" — テスターがテストするための配布ページ
  - "ベータ版 (Beta)" — 社内・外部ベータテスター向けの配布ページ

Then use `create_distribution`:
- `owner_name`: same as upload
- `platform`: `"ios"` or `"android"`
- `app_id`: the `package_name` field from the upload response
- `title`: based on the user's choice (e.g. `"Development"`, `"QA Build"`, `"Beta"`)

The response includes `access_key`. The distribution page URL is:
```
https://deploygate.com/distributions/{access_key}
```

Share this URL with testers. They can:
- **Mobile**: install the app directly
- **PC**: preview via Instant Device in a browser (no device needed)

**Instant Device requires login.** Testers must be DeployGate members to preview. Member invitation is Phase 4 work — defer entirely. Mention it in one line — (en) "Previewing with Instant Device requires team invitations from Phase 4." / (ja) "Instant Device でのプレビューには Phase 4 のチーム招待が必要です" — and move on; do NOT call `add_member` in Phase 1 regardless of what the user says.

**If the app is an iOS Development or Ad Hoc build (not In-House/Enterprise)**, tell the user:

**(en):**

> When testers open the distribution page link in Safari, they'll be prompted to install the DeployGate configuration profile. Installing the profile registers their device's UDID with DeployGate.
>
> For Ad Hoc / Development builds, testers cannot install on a device unless their UDID is in the Provisioning Profile. Share the link first so they install the profile. If you need physical-device installs, do UDID registration in Step 5 (skip Step 5 if Instant Device browser preview is enough).

**(ja):**

> テスターが配布ページのリンクをSafariで開くと、DeployGateの構成プロファイルのインストールを求められます。プロファイルをインストールすると、そのデバイスのUDIDがDeployGateに登録されます。
>
> Ad Hoc / Development ビルドでは、テスターの UDID が Provisioning Profile に含まれていないと実機インストールできません。まずリンクを共有してプロファイルをインストールしてもらってください。実機インストールが必要な場合は Step 5 で UDID 登録を行います（テスターが Instant Device ブラウザプレビューのみで十分なら Step 5 はスキップ可）。

### Step 4: Notification Setup

**Do not skip this step. Complete it before moving to Step 5.**

Notifications enable:
- Automatic alerts when new builds are uploaded
- Notifications when testers install the app
- Visibility into team activity

Use `get_notification_settings_url` with `level: "distribution"` and the `access_key` from Step 3. The tool returns a text message containing the URL — extract the URL verbatim and share it with the user; do not reformat or add query parameters.

Tell the user:
- (en): "Open this URL in your browser to connect Slack, Microsoft Teams, or Chatwork. The setup takes about 1-2 minutes."
- (ja): "このURLをブラウザで開いて Slack / Microsoft Teams / Chatwork と連携してください。設定は1〜2分で完了します。"

After setup, verify by uploading a test build — a notification should arrive in the connected channel.

**Once notification setup is confirmed, proceed to Step 5 (if iOS) or the Phase 1 Completion Check (if Android).**

### Step 5: iOS Device Setup (if applicable)

> **Prerequisite:** Complete Step 4 before starting this step.

Skip for Android. For iOS, use the structured user-question tool:

- Question (en): "Do you need to install the app on testers' physical iOS devices?" (header: "Physical-device test")
  - "Yes, install on devices" — Register UDIDs and update the Provisioning Profile
  - "No, Instant Device (browser preview) is enough" — Proceed to the Phase 1 completion check
- Question (ja): "テスターの iOS 実機にアプリをインストールする必要がありますか？" (header: "実機テスト")
  - "はい、実機にインストールしたい" — UDID 登録と Provisioning Profile の更新を行います
  - "いいえ、Instant Device（ブラウザプレビュー）で十分" — Phase 1 完了チェックに進みます

If the user chooses Instant Device only, skip to the completion check.

#### 5a: Tester Profile Installation

Share the distribution page link with testers and guide them through:

1. Open the distribution page link in **Safari** (other browsers are not supported)
2. Install the DeployGate configuration profile
3. Settings → General → VPN & Device Management → Downloaded Profile → Install
4. Enter the device passcode (not the DeployGate password)

When a tester installs the profile, a notification like "xxx joined 'yyy'" appears in the chat channel configured in Step 4 — this signals the tester is ready.

#### 5b: UDID Registration (Ad Hoc or Development)

If a tester's device UDID is not in the provisioning profile, they see an error asking to contact the developer. Both Ad Hoc and Development builds use device-scoped profiles, so UDID registration applies to both. (In-House / Enterprise builds bypass this — all devices are allowed.)

**Codex can automate the entire UDID registration process.** Read `references/ios-udid.md` for the full fastlane-based workflow (`get_udids` → `fastlane register_devices` → `fastlane sigh` → rebuild → re-upload with the same `distribution_key`).

### Phase 1 Completion Check

Before declaring Phase 1 complete, use the structured user-question tool:

- Question 1 (en): "Were testers able to access the app?" (header: "App check", multiSelect: false)
  - "Yes, confirmed" — Verified launch via Instant Device or installed app
  - "Not yet" — Share the distribution page link with testers and follow up
  - "Hitting a problem" — Move to troubleshooting
- Question 1 (ja): "テスターはアプリにアクセスできましたか？" (header: "アプリ確認", multiSelect: false)
  - "はい、確認できました" — Instant Device またはインストールで起動確認済み
  - "まだ確認できていない" — テスターに配布ページのリンクを共有して確認してもらいます
  - "問題が発生している" — トラブルシューティングを行います

- Question 2 (en): "Did the build-upload notification reach the channel you set up in Step 4?" (header: "Notification check", multiSelect: false)
  - "Yes, received" / "No, not received" / "Skipped notification setup"
- Question 2 (ja): "ビルドアップロード時に通知は届きましたか？（Step 4 で設定したチャンネル）" (header: "通知確認", multiSelect: false)
  - "はい、届きました" / "いいえ、届いていない" / "通知設定をスキップした"

Only after both are confirmed, say:
- (en): "Phase 1 is complete — your app is being distributed to testers via DeployGate."
- (ja): "Phase 1 が完了しました — アプリは DeployGate 経由でテスターに配布されています。"

If the user reports issues, read `references/troubleshooting.md` before re-asking.

## Next Steps

After Phase 1 completes, read `references/next-steps.md` for Phase 2 (CI/CD via the `ci-setup` skill), Phase 3 (SDK via the `sdk-setup` skill, Android only), and Phase 4 (team expansion via `add_member` / `create_shared_team` / `assign_shared_team_to_app`).
