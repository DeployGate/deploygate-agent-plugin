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

Use the following template as a base for the workflow:

```yaml
# DeployGate Upload Workflow
# Uploads the app to DeployGate on push to the main branch.
#
# Required secrets:
#   DEPLOYGATE_API_TOKEN  — Group API key from https://deploygate.com/organizations/{PROJECT}/settings/api_key
#   DEPLOYGATE_OWNER_NAME — Your DeployGate project (organization) name
#
# For iOS, also required:
#   BUILD_CERTIFICATE_BASE64     — .p12 certificate (base64 encoded)
#   P12_PASSWORD                 — .p12 password
#   KEYCHAIN_PASSWORD            — Arbitrary password for CI keychain
#   ASC_KEY_ID                   — App Store Connect API Key ID
#   ASC_ISSUER_ID                — App Store Connect Issuer ID
#   ASC_KEY_BASE64               — App Store Connect API Key .p8 file (base64 encoded)
#
# Customize:
#   - Replace the "Build" steps with your actual build commands
#   - Update the upload step file paths
#   - Adjust the branch trigger as needed

name: DeployGate Upload

on:
  push:
    branches: [main]

jobs:
  upload:
    runs-on: ubuntu-latest
    # For iOS builds, use: runs-on: macos-latest
    steps:
      - uses: actions/checkout@v4

      # --- Android build example ---
      # - name: Set up JDK
      #   uses: actions/setup-java@v4
      #   with:
      #     java-version: '17'
      #     distribution: 'temurin'
      #
      # - name: Build APK
      #   run: ./gradlew assembleDebug
      #
      # - name: Upload to DeployGate
      #   uses: DeployGate/deploygate-upload-github-action@v1.1.1
      #   with:
      #     api_token: ${{ secrets.DEPLOYGATE_API_TOKEN }}
      #     owner_name: ${{ secrets.DEPLOYGATE_OWNER_NAME }}
      #     file_path: app/build/outputs/apk/debug/app-debug.apk
      #     message: "${{ github.ref_name }} (${{ github.sha }})"
      #     distribution_name: "Development"

      # --- iOS build example ---
      # Requires macos-latest runner and code signing secrets
      #
      # - name: Install Apple certificate
      #   env:
      #     BUILD_CERTIFICATE_BASE64: ${{ secrets.BUILD_CERTIFICATE_BASE64 }}
      #     P12_PASSWORD: ${{ secrets.P12_PASSWORD }}
      #     KEYCHAIN_PASSWORD: ${{ secrets.KEYCHAIN_PASSWORD }}
      #   run: |
      #     CERTIFICATE_PATH=$RUNNER_TEMP/build_certificate.p12
      #     KEYCHAIN_PATH=$RUNNER_TEMP/app-signing.keychain-db
      #     echo -n "$BUILD_CERTIFICATE_BASE64" | base64 --decode -o $CERTIFICATE_PATH
      #     security create-keychain -p "$KEYCHAIN_PASSWORD" $KEYCHAIN_PATH
      #     security set-keychain-settings -lut 21600 $KEYCHAIN_PATH
      #     security unlock-keychain -p "$KEYCHAIN_PASSWORD" $KEYCHAIN_PATH
      #     security import $CERTIFICATE_PATH -P "$P12_PASSWORD" -A -t cert -f pkcs12 -k $KEYCHAIN_PATH
      #     security set-key-partition-list -S apple-tool:,apple: -k "$KEYCHAIN_PASSWORD" $KEYCHAIN_PATH
      #     security list-keychain -d user -s $KEYCHAIN_PATH
      #
      # - name: Install App Store Connect API key
      #   run: |
      #     mkdir -p $RUNNER_TEMP/asc-key
      #     echo -n "${{ secrets.ASC_KEY_BASE64 }}" | base64 --decode -o $RUNNER_TEMP/asc-key/AuthKey.p8
      #
      # - name: Build IPA
      #   run: |
      #     xcodebuild -scheme MyApp -sdk iphoneos -configuration Debug \
      #       -archivePath $RUNNER_TEMP/MyApp.xcarchive archive \
      #       -allowProvisioningUpdates \
      #       -authenticationKeyPath $RUNNER_TEMP/asc-key/AuthKey.p8 \
      #       -authenticationKeyID ${{ secrets.ASC_KEY_ID }} \
      #       -authenticationKeyIssuerID ${{ secrets.ASC_ISSUER_ID }} \
      #       DEVELOPMENT_TEAM=YOUR_TEAM_ID
      #     mkdir -p $RUNNER_TEMP/Payload
      #     cp -r $RUNNER_TEMP/MyApp.xcarchive/Products/Applications/MyApp.app $RUNNER_TEMP/Payload/
      #     cd $RUNNER_TEMP && zip -r $RUNNER_TEMP/MyApp.ipa Payload
      #
      # - name: Build simulator zip for Instant Device
      #   run: |
      #     xcodebuild -scheme MyApp -sdk iphonesimulator -configuration Debug \
      #       -derivedDataPath $RUNNER_TEMP/sim-build
      #     cd $RUNNER_TEMP/sim-build/Build/Products/Debug-iphonesimulator
      #     zip -r $RUNNER_TEMP/MyApp-simulator.zip MyApp.app
      #
      # - name: Upload to DeployGate (iOS with simulator zip)
      #   # The GitHub Action does not support ios_simulator_zip input,
      #   # so use curl to upload both IPA and simulator zip.
      #   run: |
      #     curl -s -X POST \
      #       -H "Authorization: Bearer ${{ secrets.DEPLOYGATE_API_TOKEN }}" \
      #       -F "file=@$RUNNER_TEMP/MyApp.ipa" \
      #       -F "ios_simulator_zip=@$RUNNER_TEMP/MyApp-simulator.zip" \
      #       -F "message=${{ github.ref_name }} (${{ github.sha }})" \
      #       -F "distribution_name=Development" \
      #       -F "release_note=${{ github.event.head_commit.message }}" \
      #       "https://deploygate.com/api/users/${{ secrets.DEPLOYGATE_OWNER_NAME }}/apps"
      #
      # - name: Clean up keychain
      #   if: always()
      #   run: security delete-keychain $RUNNER_TEMP/app-signing.keychain-db

      # TODO: Uncomment the Android or iOS section above and customize for your project
      - name: Build app
        run: |
          echo "Replace this with your build command"
          echo "  Android: uncomment the Android section above"
          echo "  iOS: uncomment the iOS section above"

      - name: Upload to DeployGate
        uses: DeployGate/deploygate-upload-github-action@v1.1.1
        with:
          api_token: ${{ secrets.DEPLOYGATE_API_TOKEN }}
          owner_name: ${{ secrets.DEPLOYGATE_OWNER_NAME }}
          # TODO: Update the file path to your built binary
          file_path: app/build/outputs/apk/debug/app-debug.apk
          message: "${{ github.ref_name }} (${{ github.sha }})"
          distribution_name: "Development"
          release_note: "${{ github.event.head_commit.message }}"
```

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
Refer to the iOS section in the upload template shown above.

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

Use the following template as a base for the PR workflow:

```yaml
# DeployGate PR Distribution Workflow
# Creates a distribution page for each PR, updates it on push, and deletes it on close.
#
# Features:
#   - Automatic distribution page per PR with QR code in PR comment
#   - Distribution page title matches PR title (auto-updated on change)
#   - Cleanup on PR close/merge
#   - GitHub Deployment status for environment tracking
#
# Required secrets:
#   DEPLOYGATE_API_TOKEN  — Group API key from https://deploygate.com/organizations/{PROJECT}/settings/api_key
#   DEPLOYGATE_OWNER_NAME — Your DeployGate project (organization) name
#
# Customize:
#   - Replace the "Build app" step with your actual build commands
#   - Update file_path to point to your built binary

name: DeployGate PR

on:
  pull_request:
    types: [opened, synchronize, closed]

permissions:
  contents: read
  pull-requests: write
  deployments: write

jobs:
  deploy:
    if: github.event.action != 'closed'
    runs-on: ubuntu-latest
    # For iOS builds, use: runs-on: macos-latest
    steps:
      - uses: actions/checkout@v4

      # TODO: Replace with your actual build step
      - name: Build app
        run: |
          echo "Replace this with your build command"

      - name: Find existing distribution key
        id: find-key
        uses: actions/github-script@v7
        with:
          script: |
            const comments = await github.rest.issues.listComments({
              owner: context.repo.owner,
              repo: context.repo.repo,
              issue_number: context.issue.number,
            });

            for (const comment of comments.data) {
              const match = comment.body?.match(/<!-- deploygate:access_key=(\S+) -->/);
              if (match) {
                core.setOutput('distribution_key', match[1]);
                core.setOutput('comment_id', comment.id);
                core.info(`Found existing distribution key: ${match[1]}`);
                return;
              }
            }
            core.info('No existing distribution key found (first deployment)');

      # For Android, you can use the GitHub Action directly:
      # - name: Upload to DeployGate
      #   id: upload
      #   uses: DeployGate/deploygate-upload-github-action@v1.1.1
      #   with:
      #     api_token: ${{ secrets.DEPLOYGATE_API_TOKEN }}
      #     owner_name: ${{ secrets.DEPLOYGATE_OWNER_NAME }}
      #     file_path: app/build/outputs/apk/debug/app-debug.apk
      #     distribution_key: ${{ steps.find-key.outputs.distribution_key }}
      #     distribution_name: "PR #${{ github.event.pull_request.number }}: ${{ github.event.pull_request.title }}"
      #     message: "PR #${{ github.event.pull_request.number }} (${{ github.sha }})"
      #     release_note: "${{ github.event.pull_request.title }}"
      #
      # Then extract access_key:
      # - name: Extract access key
      #   id: extract
      #   uses: actions/github-script@v7
      #   with:
      #     script: |
      #       const results = JSON.parse('${{ steps.upload.outputs.results }}');
      #       const accessKey = results.distribution?.access_key
      #         || '${{ steps.find-key.outputs.distribution_key }}';
      #       core.setOutput('access_key', accessKey);

      # For iOS (or when uploading ios_simulator_zip), use curl:
      - name: Upload to DeployGate
        id: upload
        run: |
          ARGS=(-s -X POST \
            -H "Authorization: Bearer ${{ secrets.DEPLOYGATE_API_TOKEN }}" \
            -F "file=@${{ runner.temp }}/MyApp.ipa" \
            -F "message=PR #${{ github.event.pull_request.number }} (${{ github.sha }})" \
            -F "release_note=${{ github.event.pull_request.title }}")

          # Add simulator zip for Instant Device (if built)
          if [ -f "${{ runner.temp }}/MyApp-simulator.zip" ]; then
            ARGS+=(-F "ios_simulator_zip=@${{ runner.temp }}/MyApp-simulator.zip")
          fi

          DIST_KEY="${{ steps.find-key.outputs.distribution_key }}"
          if [ -n "$DIST_KEY" ]; then
            ARGS+=(-F "distribution_key=$DIST_KEY")
          else
            ARGS+=(-F "distribution_name=PR #${{ github.event.pull_request.number }}: ${{ github.event.pull_request.title }}")
          fi

          RESPONSE=$(curl "${ARGS[@]}" \
            "https://deploygate.com/api/users/${{ secrets.DEPLOYGATE_OWNER_NAME }}/apps")

          ACCESS_KEY=$(echo "$RESPONSE" | jq -r '.results.distribution.access_key // empty')
          if [ -z "$ACCESS_KEY" ]; then
            ACCESS_KEY="$DIST_KEY"
          fi
          echo "access_key=$ACCESS_KEY" >> $GITHUB_OUTPUT

      - name: Create or update PR comment
        uses: actions/github-script@v7
        with:
          script: |
            const accessKey = '${{ steps.upload.outputs.access_key }}';
            const prNumber = context.issue.number;
            const prTitle = context.payload.pull_request.title;
            const distUrl = `https://deploygate.com/distributions/${accessKey}`;
            const qrUrl = `https://deploygate.com/qr?size=178&data=${encodeURIComponent(distUrl)}`;

            const body = [
              `## 🚀 DeployGate`,
              ``,
              `**PR #${prNumber}: ${prTitle}**`,
              ``,
              `| 配布ページ | QRコード |`,
              `|---|---|`,
              `| [配布ページを開く](${distUrl}) | ![QR](${qrUrl}) |`,
              ``,
              `📱 スマートフォンでQRコードを読み取るとアプリをインストールできます`,
              `🖥️ PCからはリンクをクリックしてInstant Deviceでプレビューできます`,
              ``,
              `<!-- deploygate:access_key=${accessKey} -->`,
            ].join('\n');

            const commentId = '${{ steps.find-key.outputs.comment_id }}';
            if (commentId) {
              await github.rest.issues.updateComment({
                owner: context.repo.owner,
                repo: context.repo.repo,
                comment_id: parseInt(commentId),
                body,
              });
              core.info('Updated existing PR comment');
            } else {
              await github.rest.issues.createComment({
                owner: context.repo.owner,
                repo: context.repo.repo,
                issue_number: prNumber,
                body,
              });
              core.info('Created new PR comment');
            }

      - name: Update distribution title if PR title changed
        if: steps.find-key.outputs.distribution_key != ''
        uses: actions/github-script@v7
        with:
          script: |
            const accessKey = '${{ steps.upload.outputs.access_key }}';
            const expectedTitle = `PR #${{ github.event.pull_request.number }}: ${{ github.event.pull_request.title }}`;

            // GET current distribution to check title and get required fields
            const getRes = await fetch(`https://deploygate.com/api/distributions/${accessKey}`, {
              headers: { 'Authorization': 'Bearer ${{ secrets.DEPLOYGATE_API_TOKEN }}' },
            });
            const getData = await getRes.json();
            if (getData.error) {
              core.warning(`Failed to get distribution: ${getData.message}`);
              return;
            }

            const dist = getData.results;
            if (dist.title === expectedTitle) {
              core.info('Distribution title is up to date');
              return;
            }

            // PUT update with required fields
            const params = new URLSearchParams({
              title: expectedTitle,
              active: String(dist.active ?? true),
              release_scope: dist.release_scope ?? 'unlisted',
            });
            const putRes = await fetch(`https://deploygate.com/api/distributions/${accessKey}`, {
              method: 'PUT',
              headers: {
                'Authorization': 'Bearer ${{ secrets.DEPLOYGATE_API_TOKEN }}',
                'Content-Type': 'application/x-www-form-urlencoded',
              },
              body: params.toString(),
            });
            const putData = await putRes.json();
            if (putData.error) {
              core.warning(`Failed to update distribution title: ${putData.message}`);
            } else {
              core.info(`Updated distribution title to: ${expectedTitle}`);
            }

      - name: Create GitHub Deployment
        uses: actions/github-script@v7
        with:
          script: |
            const accessKey = '${{ steps.upload.outputs.access_key }}';
            const distUrl = `https://deploygate.com/distributions/${accessKey}`;

            const deployment = await github.rest.repos.createDeployment({
              owner: context.repo.owner,
              repo: context.repo.repo,
              ref: context.payload.pull_request.head.sha,
              environment: 'deploygate',
              auto_merge: false,
              required_contexts: [],
              description: `DeployGate distribution for PR #${{ github.event.pull_request.number }}`,
            });

            if (deployment.data.id) {
              await github.rest.repos.createDeploymentStatus({
                owner: context.repo.owner,
                repo: context.repo.repo,
                deployment_id: deployment.data.id,
                state: 'success',
                environment_url: distUrl,
                description: 'App uploaded to DeployGate',
              });
              core.info(`Created deployment with environment URL: ${distUrl}`);
            }

  cleanup:
    if: github.event.action == 'closed'
    runs-on: ubuntu-latest
    steps:
      - name: Find distribution key from PR comments
        id: find-key
        uses: actions/github-script@v7
        with:
          script: |
            const comments = await github.rest.issues.listComments({
              owner: context.repo.owner,
              repo: context.repo.repo,
              issue_number: context.issue.number,
            });

            for (const comment of comments.data) {
              const match = comment.body?.match(/<!-- deploygate:access_key=(\S+) -->/);
              if (match) {
                core.setOutput('access_key', match[1]);
                core.info(`Found distribution key: ${match[1]}`);
                return;
              }
            }
            core.warning('No distribution key found in PR comments');

      - name: Delete distribution page
        if: steps.find-key.outputs.access_key != ''
        run: |
          response=$(curl -s -w "\n%{http_code}" -X DELETE \
            -H "Authorization: Bearer ${{ secrets.DEPLOYGATE_API_TOKEN }}" \
            "https://deploygate.com/api/distributions/${{ steps.find-key.outputs.access_key }}")
          http_code=$(echo "$response" | tail -1)
          body=$(echo "$response" | head -1)
          echo "HTTP $http_code: $body"
          if [ "$http_code" -ge 400 ]; then
            echo "::warning::Failed to delete distribution page (HTTP $http_code)"
          else
            echo "Distribution page deleted successfully"
          fi
```

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
