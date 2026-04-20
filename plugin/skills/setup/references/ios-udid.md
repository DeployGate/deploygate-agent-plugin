# iOS UDID Registration (Step 5b)

If a tester's device UDID is not in the provisioning profile, they'll see an error message asking to contact the developer.

**Claude Code can automate the entire UDID registration process.** When the user says "add UDIDs" or "a tester can't install", execute the following steps automatically.

> Steps 2-3 use fastlane for Apple Developer Portal interaction. If fastlane was not installed in Step 2, install it now (`brew install fastlane`).

## Authentication for Apple Developer Portal

Before running `register_devices` or `sigh`, fastlane needs Apple Developer credentials. Check if an `Appfile` exists with `apple_id` and `team_id`. If not, ask the user for their Apple ID (email) and team ID / team name (if they belong to multiple teams). Pass these as parameters:

```bash
fastlane run register_devices username:"user@example.com" team_id:"XXXXXXXXXX" devices:'...'
```

If the user has only one team, `team_id` can be omitted. The first run will prompt for 2FA and cache the session locally.

## Steps

1. **Get unregistered devices** — use the `get_udids` tool with `unprovisioned_only: true`.

2. **Register UDIDs with Apple Developer Portal** — use device names in `"$device_name ($user_name)"` format:
   ```bash
   fastlane run register_devices username:"user@example.com" team_id:"XXXXXXXXXX" devices:'{"iPhone 15 Pro (tester1)" => "00008030-001234567890001E", "iPad Air 5th generation (tester2)" => "00008101-001234567890002E"}'
   ```

   > **Note:** After device registration, the status may show "Processing" and the device may not be immediately reflected in provisioning profiles. This occurs under these conditions:
   >
   > - **New Apple Developer Program memberships**, or **memberships renewed after being expired for more than 1 month** (does not affect existing active memberships)
   > - 1–10 registered devices: reflected immediately upon registration
   > - 11–100 registered devices: reflected within 24–72 hours
   >
   > While in Processing status, the device will not be included in provisioning profiles even though it is registered. Wait until the status becomes active. Inform the user if this situation occurs.
   >
   > Reference: https://developer.apple.com/help/account/reference/device-registration-updates/

3. **Update the provisioning profile** (use the same `username` and `team_id`):
   ```bash
   fastlane sigh --adhoc --force --username "user@example.com" --team_id "XXXXXXXXXX"
   ```

4. **Rebuild the app:**
   ```bash
   xcodebuild -scheme "MyApp" -sdk iphoneos -configuration Debug -archivePath /tmp/MyApp.xcarchive archive
   ```
   Then create the IPA (same as Step 2 of the upload flow).

5. **Re-upload** using the `upload_app` tool with the same `distribution_key` to update the existing distribution page.

6. **Confirm** that testers can now install the app from the distribution page.
