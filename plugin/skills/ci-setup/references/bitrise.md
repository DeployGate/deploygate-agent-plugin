# Bitrise — DeployGate Upload Step

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

For PR workflow with Bitrise, use a supplementary GitHub Actions workflow for comment management. See `external-ci.md`.
