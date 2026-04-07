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

**For CI, recommend using the organization's API key instead of a personal API key.** Organization API keys are not tied to a specific user, so CI won't break when team members leave or change roles.

The organization API key can be found at:

    https://deploygate.com/organizations/{PROJECT_NAME}/settings/api_key

Replace `{PROJECT_NAME}` with the project name obtained from `get_user_info`.

### GitHub Actions

Guide the user to add repository secrets:

1. Go to the repository → Settings → Secrets and variables → Actions
2. Add these secrets:
   - `DEPLOYGATE_API_TOKEN`: Organization API key (from the URL above)
   - `DEPLOYGATE_OWNER_NAME`: DeployGate project (organization) name

**For iOS projects, check the code signing method.** Look for a `Matchfile` or `match` calls in `Fastfile` to determine whether to use Method A or B.

**Method A: Using fastlane match (recommended if Matchfile exists or fastlane is already set up)**

fastlane match manages certificates and provisioning profiles centrally via a Git repository or Google Cloud Storage. This is the simplest approach for CI code signing.

Required secrets:
   - `MATCH_PASSWORD`: Encryption password for match
   - `MATCH_GIT_BASIC_AUTHORIZATION`: For Git repo access (base64-encoded `username:personal_access_token`)
   - `KEYCHAIN_PASSWORD`: Temporary keychain password for CI (any string)

```bash
# base64 encoding
echo -n "github-username:ghp_xxxxxxxxxxxx" | base64 | pbcopy
```

If match is not yet set up:
```bash
fastlane match init    # Choose storage (git, google_cloud, s3)
fastlane match development  # Create and store certificates and profiles
```

Usage in CI workflow:
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

**Method B: Manual certificate management (when not using fastlane)**

Required secrets:

3. For code signing:
   - `BUILD_CERTIFICATE_BASE64`: Development certificate (.p12) base64-encoded
   - `P12_PASSWORD`: Password for the .p12 file
   - `KEYCHAIN_PASSWORD`: Temporary keychain password for CI (any string)

4. Automatic provisioning profile retrieval (recommended):
   - `ASC_KEY_ID`: App Store Connect API Key ID
   - `ASC_ISSUER_ID`: App Store Connect Issuer ID
   - `ASC_KEY_BASE64`: App Store Connect API Key .p8 file base64-encoded

   Create the App Store Connect API key at https://appstoreconnect.apple.com/access/integrations/api. Select "Developer" for Access.

   > Using an App Store Connect API key allows xcodebuild to automatically fetch provisioning profiles with `-allowProvisioningUpdates`. This eliminates the need to manually update profiles when adding new UDIDs.

**How to base64 encode:**
```bash
base64 -i certificate.p12 | pbcopy        # .p12
base64 -i AuthKey_XXXXX.p8 | pbcopy       # .p8
```

**How to create a .p12 file:**
In Keychain Access, expand the certificate by clicking the triangle (▶), select both the certificate and private key (Shift+click) → right-click → "Export 2 items..." → save as .p12 format

### Bitrise

Add environment variables in Bitrise:
- App Settings → Env Vars or Secrets
- `DEPLOYGATE_API_TOKEN` (organization API key) and `DEPLOYGATE_OWNER_NAME`

### Other CI

Add the same environment variables in the CI service's settings.

## Step 3: Generate Workflow

### GitHub Actions — Main Branch Upload

Use the template from `plugin/templates/deploygate-upload.yml`.

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

Configuration depends on the code signing method chosen in Step 2.

**Method A (fastlane match):**
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

**Method B (manual certificate + ASC API key):**
Refer to the iOS section in the template `plugin/templates/deploygate-upload.yml`.

**Common important points:**
- Use `runs-on: macos-latest`
- The `ios_simulator_zip` parameter is not supported by the GitHub Action (`deploygate-upload-github-action`), so **use curl to call the API directly**
- The multipart parameter name is `ios_simulator_zip` (not `ios_simulator_file`)

**Android with gradle-deploygate-plugin (alternative):**

If the project uses `gradle-deploygate-plugin`, the build and upload can be combined:
```yaml
- name: Build and Upload
  run: ./gradlew uploadDeployGateDebug
  env:
    DEPLOYGATE_API_TOKEN: ${{ secrets.DEPLOYGATE_API_TOKEN }}
```

### GitHub Actions — PR Distribution

Use the template from `plugin/templates/deploygate-pr.yml`.

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
