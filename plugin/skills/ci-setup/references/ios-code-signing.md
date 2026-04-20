# iOS Code Signing for CI

Look for a `Matchfile` or `match` calls in `Fastfile` to decide between Method A and Method B.

## Method A: fastlane match (recommended if Matchfile exists or fastlane is already set up)

fastlane match manages certificates and provisioning profiles centrally via a Git repository or Google Cloud Storage. Simplest approach for CI code signing.

Required secrets:
- `MATCH_PASSWORD`: encryption password for match
- `MATCH_GIT_BASIC_AUTHORIZATION`: for Git repo access (base64-encoded `username:personal_access_token`)
- `KEYCHAIN_PASSWORD`: temporary keychain password for CI (any string)

```bash
# base64 encoding
echo -n "github-username:ghp_xxxxxxxxxxxx" | base64 | pbcopy
```

If match is not yet set up:
```bash
fastlane match init          # Choose storage (git, google_cloud, s3)
fastlane match development   # Create and store certificates and profiles
```

Usage in the CI workflow:
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

## Method B: Manual certificate management (when not using fastlane)

Required secrets for code signing:
- `BUILD_CERTIFICATE_BASE64`: development certificate (.p12) base64-encoded
- `P12_PASSWORD`: password for the .p12 file
- `KEYCHAIN_PASSWORD`: temporary keychain password for CI (any string)

Required secrets for automatic provisioning profile retrieval (recommended):
- `ASC_KEY_ID`: App Store Connect API Key ID
- `ASC_ISSUER_ID`: App Store Connect Issuer ID
- `ASC_KEY_BASE64`: App Store Connect API Key .p8 file base64-encoded

Create the App Store Connect API key at https://appstoreconnect.apple.com/access/integrations/api. Select "Developer" for Access.

> Using an App Store Connect API key allows xcodebuild to automatically fetch provisioning profiles with `-allowProvisioningUpdates`. This eliminates the need to manually update profiles when adding new UDIDs.

### How to base64 encode
```bash
base64 -i certificate.p12 | pbcopy        # .p12
base64 -i AuthKey_XXXXX.p8 | pbcopy       # .p8
```

### How to create a .p12 file
In Keychain Access, expand the certificate by clicking the triangle (▶), select both the certificate and private key (Shift+click) → right-click → "Export 2 items..." → save as .p12 format.

### Workflow usage

See the iOS example block in `github-actions-upload.md` for the full `security create-keychain` / `security import` sequence and the xcodebuild invocation with `-allowProvisioningUpdates`.
