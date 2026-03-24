---
name: ci-setup
description: Set up CI/CD integration for automated DeployGate uploads and PR-based distribution
---

# DeployGate CI/CD Setup

Guide users through setting up CI/CD integration for automated app uploads and PR-based distribution.

## When to use

When the user wants to:
- Automate DeployGate uploads from CI
- Set up PR-based distribution pages
- Integrate DeployGate with GitHub Actions, Bitrise, CircleCI, or other CI

## Step 1: Detect CI Environment

Check the project for existing CI configuration:

- `.github/workflows/` → **GitHub Actions** (native integration available)
- `bitrise.yml` → **Bitrise** (official DeployGate step available)
- `.circleci/config.yml` → **CircleCI** (curl-based upload)
- `codemagic.yaml` → **Codemagic** (curl-based upload)
- None found → Recommend **GitHub Actions** for new setup

Also detect the project type:
- `build.gradle` / `build.gradle.kts` → Android (runs on ubuntu-latest)
- `*.xcodeproj` / `*.xcworkspace` → iOS (requires macos-latest runner)

## Step 2: Configure Secrets

**CI では個人の API key ではなく、グループの API key を使用することを推奨します。** グループの API key は特定ユーザーに紐づかないため、メンバーの異動や退職時に CI が壊れるリスクがありません。

グループの API key は以下の URL から確認できます:

    https://deploygate.com/organizations/{PROJECT_NAME}/settings/api_key

`{PROJECT_NAME}` は `get_user_info` で取得したプロジェクト名に置き換えてください。

### GitHub Actions

Guide the user to add repository secrets:

1. Go to the repository → Settings → Secrets and variables → Actions
2. Add these secrets:
   - `DEPLOYGATE_API_TOKEN`: グループの API key（上記URLから取得）
   - `DEPLOYGATE_OWNER_NAME`: DeployGate project (organization) name

**iOS プロジェクトの場合、コード署名の方法を確認してください。** プロジェクトに `Matchfile` や `Fastfile` 内の `match` 呼び出しがあるかチェックし、方法 A か B を選択します。

**方法 A: fastlane match を使う場合（Matchfile がある、または fastlane 導入済みの場合に推奨）**

fastlane match は証明書とプロビジョニングプロファイルを Git リポジトリや Google Cloud Storage で一元管理します。CI でのコード署名が最も簡潔になります。

必要なシークレット:
   - `MATCH_PASSWORD`: match の暗号化パスワード
   - `MATCH_GIT_BASIC_AUTHORIZATION`: Git リポジトリへのアクセス用（base64 エンコードした `username:personal_access_token`）
   - `KEYCHAIN_PASSWORD`: CI用キーチェーンの一時パスワード（任意の文字列）

```bash
# base64 エンコード
echo -n "github-username:ghp_xxxxxxxxxxxx" | base64 | pbcopy
```

match 未導入の場合のセットアップ:
```bash
fastlane match init    # ストレージ（git, google_cloud, s3）を選択
fastlane match development  # 証明書とプロファイルを作成・保存
```

CI ワークフローでの使い方:
```yaml
- name: Set up code signing with match
  env:
    MATCH_PASSWORD: ${{ secrets.MATCH_PASSWORD }}
    MATCH_GIT_BASIC_AUTHORIZATION: ${{ secrets.MATCH_GIT_BASIC_AUTHORIZATION }}
    KEYCHAIN_PASSWORD: ${{ secrets.KEYCHAIN_PASSWORD }}
  run: |
    fastlane match development --readonly --keychain_name ci-keychain --keychain_password "$KEYCHAIN_PASSWORD"

- name: Build IPA
  run: fastlane gym --scheme "MyApp" --export_method "development"
```

**方法 B: 手動で証明書を管理する場合（fastlane を使わない場合）**

必要なシークレット:

3. コード署名用:
   - `BUILD_CERTIFICATE_BASE64`: 開発証明書（.p12）を base64 エンコードした値
   - `P12_PASSWORD`: .p12 ファイルのパスワード
   - `KEYCHAIN_PASSWORD`: CI用キーチェーンの一時パスワード（任意の文字列）

4. プロビジョニングプロファイルの自動取得（推奨）:
   - `ASC_KEY_ID`: App Store Connect API Key ID
   - `ASC_ISSUER_ID`: App Store Connect Issuer ID
   - `ASC_KEY_BASE64`: App Store Connect API Key .p8 ファイルを base64 エンコードした値

   App Store Connect API key は https://appstoreconnect.apple.com/access/integrations/api で作成。Access は "Developer" を選択。

   > App Store Connect API key を使うと、xcodebuild が `-allowProvisioningUpdates` でプロビジョニングプロファイルを自動取得します。UDID 追加時もプロファイルの手動更新が不要になります。

**base64 エンコードの方法:**
```bash
base64 -i certificate.p12 | pbcopy        # .p12
base64 -i AuthKey_XXXXX.p8 | pbcopy       # .p8
```

**.p12 ファイルの作成方法:**
キーチェーンアクセスで証明書の左の三角マーク（▶）をクリックして展開し、証明書と秘密鍵の両方を選択（Shift+クリック）→ 右クリック → 「2項目を書き出す...」→ .p12 形式で保存

### Bitrise

Add environment variables in Bitrise:
- App Settings → Env Vars or Secrets
- `DEPLOYGATE_API_TOKEN`（グループの API key）and `DEPLOYGATE_OWNER_NAME`

### Other CI

Add the same environment variables in the CI service's settings.

## Step 3: Generate Workflow

### GitHub Actions — Main Branch Upload

Use the template from `templates/deploygate-upload.yml`.

Customize for the project:

**Android build step:**
```yaml
- name: Set up JDK
  uses: actions/setup-java@v4
  with:
    java-version: '17'
    distribution: 'temurin'

- name: Build APK
  run: ./gradlew assembleDebug

# file_path: app/build/outputs/apk/debug/app-debug.apk
```

**iOS build step (GitHub Actions):**

コード署名の方法（Step 2 で選択）に応じて構成が異なります。

**方法 A（fastlane match）の場合:**
```yaml
# runs-on: macos-latest
- name: Set up code signing with match
  env:
    MATCH_PASSWORD: ${{ secrets.MATCH_PASSWORD }}
    MATCH_GIT_BASIC_AUTHORIZATION: ${{ secrets.MATCH_GIT_BASIC_AUTHORIZATION }}
    KEYCHAIN_PASSWORD: ${{ secrets.KEYCHAIN_PASSWORD }}
  run: |
    fastlane match development --readonly --keychain_name ci-keychain --keychain_password "$KEYCHAIN_PASSWORD"

- name: Build IPA
  run: fastlane gym --scheme "MyApp" --export_method "development"

- name: Build simulator zip for Instant Device
  run: |
    xcodebuild -scheme MyApp -sdk iphonesimulator -configuration Debug \
      -derivedDataPath $RUNNER_TEMP/sim-build
    cd $RUNNER_TEMP/sim-build/Build/Products/Debug-iphonesimulator
    zip -r $RUNNER_TEMP/MyApp-simulator.zip MyApp.app
```

**方法 B（手動証明書 + ASC API key）の場合:**
テンプレート `templates/deploygate-upload.yml` の iOS セクションを参照。

**共通の重要ポイント:**
- `runs-on: macos-latest` を使用
- `ios_simulator_zip` パラメータは GitHub Action（`deploygate-upload-github-action`）では未対応のため、**curl で直接 API を呼ぶ**
- API の multipart パラメータ名は `ios_simulator_zip`（`ios_simulator_file` ではない）

**Android with gradle-deploygate-plugin (alternative):**

If the project uses `gradle-deploygate-plugin`, the build and upload can be combined:
```yaml
- name: Build and Upload
  run: ./gradlew uploadDeployGateDebug
  env:
    DEPLOYGATE_API_TOKEN: ${{ secrets.DEPLOYGATE_API_TOKEN }}
```

### GitHub Actions — PR Distribution

Use the template from `templates/deploygate-pr.yml`.

This workflow:
1. **On PR open/push**: Builds the app, uploads to DeployGate, creates/updates a distribution page, posts a PR comment with QR code and install link
2. **On PR close**: Deletes the distribution page

Key customizations needed:
- Build step (same as main branch workflow)
- `file_path` pointing to the built binary

The workflow handles:
- First push: Creates distribution page named `"PR #N: title"`
- Subsequent pushes: Updates the same page via saved `distribution_key`
- PR title changes: Auto-updates distribution page title
- PR close/merge: Cleans up distribution page
- GitHub Deployment: Shows deploy status and environment URL on the PR

### Bitrise — DeployGate Upload Step

For iOS projects already using Bitrise:

```yaml
# Add after your build step in bitrise.yml
- git::https://github.com/nicnocquee/upload-app-bitrise-step.git@master:
    title: DeployGate Upload
    inputs:
      - api_token: $DEPLOYGATE_API_TOKEN
      - owner_name: $DEPLOYGATE_OWNER_NAME
      - file_path: $BITRISE_IPA_PATH
      - message: "Build #$BITRISE_BUILD_NUMBER ($BITRISE_GIT_BRANCH)"
      - distribution_name: "Development"
```

For PR workflow with Bitrise, use a supplementary GitHub Actions workflow for comment management. See `docs/external-ci-integration.md`.

### CircleCI / Codemagic / Other CI

Use curl for direct API upload. See `docs/external-ci-integration.md` for examples.

## Step 4: Verification

### Main Branch Workflow

1. Push a commit to the main branch
2. Check the Actions tab for workflow execution
3. Verify the upload in DeployGate dashboard
4. If notification is configured (Step 4 of onboarding), verify notification arrives

### PR Workflow

1. Create a test PR
2. Verify:
   - Workflow runs on PR open
   - PR comment appears with QR code and distribution URL
   - Distribution page is accessible via the URL
   - Instant Device preview works
3. Push another commit to the PR
4. Verify:
   - Same distribution page is updated (not a new one)
   - PR comment is updated
5. Close the PR
6. Verify:
   - Distribution page is deleted
   - Cleanup workflow completes

## Troubleshooting

| Issue | Solution |
|---|---|
| Secret not found | Verify secret names match exactly: `DEPLOYGATE_API_TOKEN`, `DEPLOYGATE_OWNER_NAME` |
| Build fails on iOS | Ensure `macos-latest` runner and valid code signing |
| Distribution page not created | Check `distribution_name` spelling; verify API token has write access |
| PR comment not appearing | Check `permissions: pull-requests: write` in workflow |
| Cleanup fails on PR close | Check that `DEPLOYGATE_API_TOKEN` secret is accessible to the workflow |
| Duplicate distribution pages | Ensure `distribution_key` is correctly extracted from existing PR comments |
