# GitHub Actions — Main Branch Upload Workflow

Use the following template as a base. Customize the build step for the project's platform and update file paths.

```yaml
# DeployGate Upload Workflow
# Uploads the app to DeployGate on push to the main branch.
#
# Required secrets:
#   DEPLOYGATE_API_TOKEN  — Project API key from https://deploygate.com/organizations/{PROJECT}/settings/api_key
#   DEPLOYGATE_OWNER_NAME — Your DeployGate project name
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

## Customization snippets

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

**iOS build step — fastlane match (preferred):**
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

**iOS build step — manual certificate + ASC API key:** see the iOS example block inside the main template above.

## Common iOS pitfalls

- Use `runs-on: macos-latest`
- The `ios_simulator_zip` parameter is NOT supported by `deploygate-upload-github-action`. When uploading a simulator zip, **use curl to call the API directly**
- The multipart parameter name is `ios_simulator_zip` (not `ios_simulator_file`)
