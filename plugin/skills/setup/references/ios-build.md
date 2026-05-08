# iOS Build (Step 2 Detail)

For iOS, build BOTH an IPA and a simulator zip. The IPA is **required** — the DeployGate upload API does not accept a simulator zip alone. The simulator zip is optional but enables Instant Device (browser-based app preview).

If the IPA build fails (e.g. code signing issues), resolve the issue before uploading. Do NOT suggest uploading only the simulator zip as a workaround.

## Step 0: Choose build method

Check if fastlane is installed (`which fastlane`). Then use `AskUserQuestion`:

- Question (en): "Which build method do you want to use for the iOS app?" (header: "Build method")
  - If fastlane is installed:
    - "Use fastlane (recommended)" — Build via `fastlane gym`. Also works for UDID registration later, so recommended
    - "Use xcodebuild" — Build directly with Xcode's command-line tools
  - If fastlane is NOT installed:
    - "Install fastlane and use it (recommended)" — Run `brew install fastlane`, then build. Also works for UDID registration later, so recommended
    - "Use xcodebuild" — Build directly with Xcode's command-line tools
- Question (ja): "iOS アプリのビルド方法を選択してください" (header: "ビルド方法")
  - If fastlane is installed:
    - "fastlane を使う (推奨)" — fastlane gym でビルド。UDID 登録にも使えるため推奨です
    - "xcodebuild を使う" — Xcode のコマンドラインツールで直接ビルドします
  - If fastlane is NOT installed:
    - "fastlane をインストールして使う (推奨)" — `brew install fastlane` を実行してからビルドします。UDID 登録にも使えるため推奨です
    - "xcodebuild を使う" — Xcode のコマンドラインツールで直接ビルドします

fastlane is used for IPA builds here and later for UDID registration / provisioning profile management (Step 5b). Installing it now saves time later.

## Detect the scheme name

Before building, find the Xcode scheme:

```bash
# Project-only (no workspace):
xcodebuild -list -project <name>.xcodeproj 2>/dev/null
# Or when a workspace exists (CocoaPods / SwiftPM workspace):
xcodebuild -list -workspace <name>.xcworkspace 2>/dev/null
```

Use the first name listed under `Schemes:` (typically the main app scheme). Use this name for every `-scheme` argument below.

## Pre-flight: Verify code signing

Before building the IPA, check the code signing team:

```bash
xcodebuild -showBuildSettings -scheme "MyApp" 2>/dev/null | grep 'DEVELOPMENT_TEAM'
```

- If `DEVELOPMENT_TEAM` is empty → the user needs to set a team in Xcode → Target → Signing & Capabilities.
- If a team is set, check whether multiple teams are available:

```bash
security find-identity -v -p codesigning 2>/dev/null
```

### Common pitfall: Personal Team

When a user belongs to an organization AND has a Personal Team (free Apple ID, not enrolled in Apple Developer Program), they may accidentally select the wrong team in Xcode. If a non-enrolled Personal Team is selected, the IPA export will fail with:

    Team ... (Personal Team) is not enrolled in the Apple Developer Program.

This also causes `fastlane produce` and `fastlane sigh` to fail because non-enrolled teams cannot create App IDs.

Note: A Personal Team that IS enrolled in the Apple Developer Program (paid individual membership) works fine. This issue only occurs with free Personal Teams.

If multiple teams are available and the selected team appears to be a free Personal Team, guide the user to: Xcode → Target → Signing & Capabilities → Team → select the correct enrolled team.

## Step 1: Build the IPA

**fastlane:**
```bash
fastlane gym --scheme "MyApp" --export_method "development"
```

**xcodebuild:**
```bash
xcodebuild -scheme "MyApp" -sdk iphoneos -configuration Debug -archivePath /tmp/MyApp.xcarchive archive
mkdir -p /tmp/MyApp-ipa/Payload
cp -r /tmp/MyApp.xcarchive/Products/Applications/MyApp.app /tmp/MyApp-ipa/Payload/
cd /tmp/MyApp-ipa && zip -r /tmp/MyApp.ipa Payload
```

## Step 2: Build the simulator zip for Instant Device

```bash
xcodebuild -scheme "MyApp" -sdk iphonesimulator -configuration Debug -derivedDataPath /tmp/sim-build
cd /tmp/sim-build/Build/Products/Debug-iphonesimulator
zip -r /tmp/MyApp-simulator.zip MyApp.app
```

## Step 3: Upload both files

Use the `upload_app` tool with BOTH `file_path` (IPA) and `ios_simulator_zip`:
- `owner_name`: from `get_user_info`
- `file_path`: path to the IPA file
- `ios_simulator_zip`: path to the simulator .zip file
- `message`: Git info (e.g. `"feature/login (abc1234)"`)
