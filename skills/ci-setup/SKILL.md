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

### GitHub Actions

Guide the user to add repository secrets:

1. Go to the repository → Settings → Secrets and variables → Actions
2. Add these secrets:
   - `DEPLOYGATE_API_TOKEN`: API token from https://deploygate.com/settings
   - `DEPLOYGATE_OWNER_NAME`: DeployGate user or organization name

### Bitrise

Add environment variables in Bitrise:
- App Settings → Env Vars or Secrets
- `DEPLOYGATE_API_TOKEN` and `DEPLOYGATE_OWNER_NAME`

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
```yaml
# runs-on: macos-latest
- name: Build IPA
  run: |
    xcodebuild -workspace MyApp.xcworkspace \
      -scheme MyApp \
      -configuration Debug \
      -archivePath build/MyApp.xcarchive \
      archive
    xcodebuild -exportArchive \
      -archivePath build/MyApp.xcarchive \
      -exportOptionsPlist ExportOptions.plist \
      -exportPath build/

# file_path: build/MyApp.ipa
```

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
