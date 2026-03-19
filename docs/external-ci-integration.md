# External CI Integration Guide

This guide covers integrating DeployGate with CI services other than GitHub Actions.

## Bitrise

### Using the Official DeployGate Upload Step

Bitrise has an official DeployGate step: [DeployGate/upload-app-bitrise-step](https://github.com/DeployGate/upload-app-bitrise-step)

Add it to your `bitrise.yml` after the build step:

```yaml
workflows:
  deploy:
    steps:
      - xcode-archive@5: {}  # or android-build, etc.
      - git::https://github.com/nicnocquee/upload-app-bitrise-step.git@master:
          title: DeployGate Upload
          inputs:
            - api_token: $DEPLOYGATE_API_TOKEN
            - owner_name: $DEPLOYGATE_OWNER_NAME
            - file_path: $BITRISE_IPA_PATH  # or $BITRISE_APK_PATH
            - message: "Build #$BITRISE_BUILD_NUMBER ($BITRISE_GIT_BRANCH)"
            - distribution_name: "Development"
```

### Combining Bitrise + GitHub Actions for PR Workflow

When Bitrise handles the build and upload, GitHub Actions can manage the PR lifecycle:

```
Bitrise:
  - Build the app
  - Upload to DeployGate (official step)
  - Trigger GitHub Actions via repository_dispatch

GitHub Actions (supplementary):
  - Create/update PR comment (QR code + distribution URL)
  - Update distribution page title if PR title changed
  - Delete distribution page on PR close
```

**Triggering GitHub Actions from Bitrise:**

Add a script step in Bitrise after the DeployGate upload:

```bash
curl -X POST \
  -H "Authorization: token $GITHUB_PAT" \
  -H "Accept: application/vnd.github+json" \
  "https://api.github.com/repos/$REPO/dispatches" \
  -d "{\"event_type\":\"deploygate-upload\",\"client_payload\":{\"access_key\":\"$DG_ACCESS_KEY\",\"pr_number\":\"$PR_NUMBER\"}}"
```

## CircleCI

### Using curl

```yaml
# .circleci/config.yml
version: 2.1

jobs:
  deploy:
    docker:
      - image: cimg/android:2024.01  # or macos executor for iOS
    steps:
      - checkout
      - run:
          name: Build
          command: ./gradlew assembleDebug
      - run:
          name: Upload to DeployGate
          command: |
            curl -X POST \
              -H "Authorization: Bearer ${DEPLOYGATE_API_TOKEN}" \
              -F "file=@app/build/outputs/apk/debug/app-debug.apk" \
              -F "message=Build ${CIRCLE_SHA1:0:7} (${CIRCLE_BRANCH})" \
              -F "distribution_name=Development" \
              "https://deploygate.com/api/users/${DEPLOYGATE_OWNER_NAME}/apps"
```

### Android with gradle-deploygate-plugin

If you use `gradle-deploygate-plugin`, the upload is integrated into the Gradle build:

```yaml
- run:
    name: Build and Upload
    command: ./gradlew uploadDeployGateDebug
```

## Codemagic

```yaml
# codemagic.yaml
workflows:
  deploy:
    scripts:
      - name: Build
        script: ./gradlew assembleDebug
      - name: Upload to DeployGate
        script: |
          curl -X POST \
            -H "Authorization: Bearer $DEPLOYGATE_API_TOKEN" \
            -F "file=@app/build/outputs/apk/debug/app-debug.apk" \
            -F "message=Build $CM_COMMIT ($CM_BRANCH)" \
            -F "distribution_name=Development" \
            "https://deploygate.com/api/users/$DEPLOYGATE_OWNER_NAME/apps"
```

## Common curl Upload Examples

### Basic upload

```bash
curl -X POST \
  -H "Authorization: Bearer ${DEPLOYGATE_API_TOKEN}" \
  -F "file=@path/to/app.apk" \
  "https://deploygate.com/api/users/${OWNER_NAME}/apps"
```

### Upload with distribution page

```bash
curl -X POST \
  -H "Authorization: Bearer ${DEPLOYGATE_API_TOKEN}" \
  -F "file=@path/to/app.apk" \
  -F "message=Build from CI" \
  -F "distribution_name=Development" \
  -F "release_note=Latest build from main branch" \
  "https://deploygate.com/api/users/${OWNER_NAME}/apps"
```

### Upload to existing distribution page (by key)

```bash
curl -X POST \
  -H "Authorization: Bearer ${DEPLOYGATE_API_TOKEN}" \
  -F "file=@path/to/app.ipa" \
  -F "distribution_key=abc123def456" \
  "https://deploygate.com/api/users/${OWNER_NAME}/apps"
```

## Required Environment Variables

| Variable | Description |
|---|---|
| `DEPLOYGATE_API_TOKEN` | API token from https://deploygate.com/settings |
| `DEPLOYGATE_OWNER_NAME` | Your DeployGate user or organization name |
