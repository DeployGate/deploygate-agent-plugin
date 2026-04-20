---
name: ci-setup
description: Set up CI/CD integration for automated DeployGate uploads and PR-based distribution
allowed-tools: mcp__deploygate__get_user_info Read Write Edit Glob Bash(which:*) Bash(ls:*)
---

# DeployGate CI/CD Setup

Guide users through setting up CI/CD integration for automated app uploads and PR-based distribution.

## When to use

When the user wants to:
- Automate DeployGate uploads from CI
- Set up PR-based distribution pages
- Integrate DeployGate with GitHub Actions, Bitrise, CircleCI, or other CI

## Reference files

Load only what matches the detected CI provider and project type. Each file is substantial (full YAML templates) — do NOT preload.

- `references/github-actions-upload.md` — GitHub Actions main-branch upload workflow template (full YAML with Android + iOS examples). Read when generating the main-branch workflow
- `references/github-actions-pr.md` — GitHub Actions PR distribution workflow template (full YAML with comment / deployment / cleanup logic). Read when generating the PR workflow
- `references/ios-code-signing.md` — iOS code signing setup for CI (fastlane match vs manual .p12 + ASC API key). Read when the project is iOS
- `references/bitrise.md` — Bitrise DeployGate upload step. Read for Bitrise
- `references/external-ci.md` — CircleCI / Codemagic / curl-based integration. Read for anything other than GitHub Actions or Bitrise
- `references/troubleshooting.md` — troubleshooting table. Read on error

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

**For CI, recommend using the project API key instead of a personal API key.** Project API keys are not tied to a specific user, so CI won't break when team members leave or change roles.

The project API key can be found at:

    https://deploygate.com/organizations/{PROJECT_NAME}/settings/api_key

Replace `{PROJECT_NAME}` with the project name obtained from `get_user_info`.

### GitHub Actions

Add repository secrets (Settings → Secrets and variables → Actions):

- `DEPLOYGATE_API_TOKEN`: project API key (from the URL above)
- `DEPLOYGATE_OWNER_NAME`: DeployGate project name

**For iOS projects**, also configure code signing — read `references/ios-code-signing.md` to decide between fastlane match (preferred if a `Matchfile` exists or fastlane is already set up) and manual certificate + App Store Connect API key.

### Bitrise

Add environment variables in Bitrise (App Settings → Env Vars or Secrets):
- `DEPLOYGATE_API_TOKEN` (project API key) and `DEPLOYGATE_OWNER_NAME`

### Other CI

Add the same environment variables in the CI service's settings.

## Step 3: Generate Workflow

### GitHub Actions

- **Main branch upload** → read `references/github-actions-upload.md` and use the template inside. Customize the build step for Android/iOS and update file paths.
- **PR distribution** → read `references/github-actions-pr.md` and use the template inside. The workflow creates a per-PR distribution page with a QR code comment, updates it on push, and deletes it on close.

**Android with gradle-deploygate-plugin (alternative):** if the project uses `gradle-deploygate-plugin`, build + upload can be combined:

```yaml
- name: Build and Upload
  run: ./gradlew uploadDeployGateDebug
  env:
    DEPLOYGATE_API_TOKEN: ${{ secrets.DEPLOYGATE_API_TOKEN }}
```

### Bitrise

Read `references/bitrise.md`.

### CircleCI / Codemagic / Other CI

Read `references/external-ci.md`.

## Step 4: Verification

### Main branch workflow

1. Push a commit to the main branch
2. Check the Actions tab for workflow execution
3. Verify the upload in the DeployGate dashboard
4. If notification was configured in the onboarding skill (Step 4), verify it arrives

### PR workflow

1. Open a test PR — verify the workflow runs, a PR comment appears with QR code and distribution URL, and the distribution page is accessible
2. Push another commit to the PR — verify the same distribution page is updated (not a new one) and the comment refreshes
3. Close the PR — verify the distribution page is deleted

## Troubleshooting

Read `references/troubleshooting.md`.
