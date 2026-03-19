# DeployGate Onboarding

Guide users through setting up DeployGate for app distribution — from first upload to team-wide deployment.

## When to use

When the user wants to:
- Set up DeployGate for the first time
- Upload and distribute an app
- Get started with DeployGate

## Initial Assessment

Before starting, determine:

1. **Does the user have a DeployGate account?**
   - If no → Start at Step 1 (Account Creation)
   - If yes → Ask for their API token and start at Step 2

2. **What platform?**
   - Check for `build.gradle` / `build.gradle.kts` → Android
   - Check for `*.xcodeproj` / `*.xcworkspace` → iOS
   - Both may exist (multi-platform project)

3. **Is there source code available?**
   - If yes → Can help with builds
   - If no → User must provide a pre-built binary

## Phase 1: Distribution Setup

### Step 1: Account Creation

If the user doesn't have a DeployGate account:

1. Direct them to sign up: https://deploygate.com/app/register/signup
2. After signup, get the API token: https://deploygate.com/settings
3. Verify the token works by using the `get_user_info` tool

If the token is invalid, the API returns `{"error": true, "error_type": "unauthorized"}`. Ask the user to double-check their token.

### Step 2: Build and Upload

First, use `get_user_info` to determine the owner name (workspace/organization).

**Android:**

```bash
./gradlew assembleDebug
```

Output: `app/build/outputs/apk/debug/app-debug.apk`

> IMPORTANT: Do NOT use APKs from Android Studio's Instant Run / Apply Changes — these are incomplete. Always use a full Gradle build.

**iOS:**

```bash
fastlane gym --scheme "MyApp" --export_method "development"
```

Or: Xcode → Product → Archive → Distribute App → Development → Export

Then upload using the `upload_app` tool:
- `owner_name`: from `get_user_info`
- `file_path`: path to the built binary
- `message`: include Git info — e.g. `"feature/login (abc1234)"` or `"PR #42: Login redesign (abc1234)"`

The `message` field greatly improves build searchability. Auto-detect Git branch and commit hash if available:

```bash
git rev-parse --short HEAD       # commit hash
git rev-parse --abbrev-ref HEAD  # branch name
```

### Step 3: Create Distribution Page

Use the `create_distribution` tool:
- `owner_name`: same as upload
- `platform`: `"ios"` or `"android"`
- `app_id`: package name / bundle identifier (from upload response)
- `title`: e.g. `"Development"`, `"QA Build"`, `"Beta"`

The response includes `access_key`. The distribution URL is:
```
https://deploygate.com/distributions/{access_key}
```

Share this URL with testers. They can:
- **Mobile**: Install the app directly
- **PC**: Use Instant Device to preview the app in a browser (no device needed)

### Step 4: Notification Setup

**Do not skip this step.** Notifications enable:
- Automatic alerts when new builds are uploaded
- Notifications when testers install the app
- Visibility into team activity

Use the `get_notification_settings_url` tool with `level: "distribution"` and the `access_key` from Step 3.

Tell the user: "Open this URL in your browser to connect Slack, Microsoft Teams, or Chatwork. The setup takes about 1-2 minutes."

After setup, verify by uploading a test build — a notification should arrive in the connected channel.

### Step 5: iOS Device Setup (if applicable)

Skip this step for Android or if Instant Device preview is sufficient.

#### 5a: Device Preparation (iOS)

Guide testers through:

1. **Developer Mode** (iOS 16+, Ad Hoc builds only):
   - Settings → Privacy & Security → Developer Mode → Toggle ON
   - Tap "Restart" on the alert → After restart, tap "Turn On" → Enter passcode
   - Not needed for In-House (Enterprise) distribution

2. **Configuration Profile**:
   - Open the distribution link **in Safari** (other browsers won't work)
   - Allow the profile download
   - Settings → General → VPN & Device Management → Downloaded Profile → Install
   - Enter the device passcode (not the DeployGate password)

3. **Enterprise App Trust** (In-House builds only):
   - Settings → General → VPN & Device Management → Enterprise App → Trust the developer

#### 5b: UDID Registration (Ad Hoc only)

If a tester's device UDID is not in the provisioning profile, they'll see an error asking to contact the developer.

1. Use the `get_udids` tool with `unprovisioned_only: true` to find unregistered devices
2. Register UDIDs with Apple Developer Portal:
   ```bash
   fastlane run register_devices devices:'{"iPhone 15 Pro (tester1)" => "00008030-001234567890001E"}'
   ```
3. Update the provisioning profile:
   ```bash
   fastlane sigh --adhoc --force
   ```
4. Rebuild and re-upload:
   ```bash
   fastlane gym --scheme "MyApp" --export_method "ad-hoc"
   ```
   Then use `upload_app` with the same `distribution_key`

5. Testers can now install the app

### Phase 1 Completion Check

Confirm with the user:
- **Instant Device only**: Can they preview the app in the browser?
- **Android real device**: Can they install and launch the app?
- **iOS In-House**: Device preparation done + app launches?
- **iOS Ad Hoc**: UDID registered + rebuilt + reinstalled + app launches?

## Next Steps

### Phase 2: CI/CD Integration

"Now that distribution is working, you can automate builds with CI/CD. This frees developers from manual uploads and lets testers always get the latest build."

→ Suggest using the `ci-setup` skill

### Phase 3: SDK Integration

"The DeployGate SDK adds crash reporting and screen capture for bug reporting — testers can report issues with a single screenshot."

→ Suggest using the `sdk-setup` skill

### Phase 5: Team Expansion

"The Free plan supports up to 2 members. To add more developers or testers, upgrade to the Flexible plan."

For teams ready to scale:
- Use `add_member` for individual additions
- Use `create_shared_team` + `assign_shared_team_to_app` for organization-wide distribution (e.g., dogfooding)

## Troubleshooting

| Issue | Solution |
|---|---|
| `unauthorized` error | Check API token at https://deploygate.com/settings |
| `num_of_member_seats_exceeded` | Upgrade plan at https://deploygate.com/settings/plan |
| iOS install fails | Check UDID registration with `get_udids` (unprovisioned_only: true) |
| Build not appearing | Verify upload response has `error: false`; check distribution page URL |
| Notification not arriving | Re-check notification settings URL; ensure webhook is correctly configured |
