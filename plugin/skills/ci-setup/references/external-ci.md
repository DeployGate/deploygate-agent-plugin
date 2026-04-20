# CircleCI / Codemagic / Other CI

DeployGate does not ship first-party plugins for CircleCI or Codemagic, so use `curl` to call the REST API directly.

## Minimal upload snippet (curl)

```bash
curl -s -X POST \
  -H "Authorization: Bearer $DEPLOYGATE_API_TOKEN" \
  -F "file=@path/to/app.apk" \
  -F "message=$BRANCH_NAME ($COMMIT_SHA)" \
  -F "distribution_name=Development" \
  "https://deploygate.com/api/users/$DEPLOYGATE_OWNER_NAME/apps"
```

For iOS uploads that include Instant Device support, add `-F "ios_simulator_zip=@path/to/MyApp-simulator.zip"`.

To update an existing distribution page instead of creating a new one, pass `distribution_key` instead of `distribution_name`.

## CircleCI environment variables

Add `DEPLOYGATE_API_TOKEN` and `DEPLOYGATE_OWNER_NAME` in Project Settings → Environment Variables, then reference them in `.circleci/config.yml`:

```yaml
jobs:
  upload:
    docker:
      - image: cimg/base:stable
    steps:
      - attach_workspace:
          at: .
      - run:
          name: Upload to DeployGate
          command: |
            curl -s -X POST \
              -H "Authorization: Bearer $DEPLOYGATE_API_TOKEN" \
              -F "file=@app.apk" \
              -F "message=$CIRCLE_BRANCH ($CIRCLE_SHA1)" \
              -F "distribution_name=Development" \
              "https://deploygate.com/api/users/$DEPLOYGATE_OWNER_NAME/apps"
```

## Codemagic

Add environment variables in the app settings. In `codemagic.yaml`:

```yaml
scripts:
  - name: Upload to DeployGate
    script: |
      curl -s -X POST \
        -H "Authorization: Bearer $DEPLOYGATE_API_TOKEN" \
        -F "file=@$CM_BUILD_OUTPUT_DIR/app.apk" \
        -F "message=$CM_BRANCH ($CM_COMMIT)" \
        -F "distribution_name=Development" \
        "https://deploygate.com/api/users/$DEPLOYGATE_OWNER_NAME/apps"
```

## PR-style distribution from non-GitHub-Actions CI

The PR workflow in `github-actions-pr.md` relies on `github-script` for comment management. If the build runs on Bitrise / CircleCI / Codemagic, one pragmatic option is to split responsibilities:

1. The external CI uploads the binary and prints the `access_key` from the API response
2. A small GitHub Actions workflow triggers on `pull_request` events and calls the DeployGate API only to manage the comment / cleanup, using the `access_key` stored in a PR comment marker

The API response for a successful upload includes `results.distribution.access_key` when `distribution_name` or `distribution_key` is provided.
