# /setup — Start DeployGate onboarding

Start the DeployGate onboarding flow to set up app distribution from scratch.

## What this does

Follow the onboarding skill at `skills/onboarding/SKILL.md` to guide the user through:

1. **Account creation** — sign up at https://deploygate.com/app/register/signup and get an API token
2. **First app upload** — build and upload their app to DeployGate
3. **Distribution page** — create a distribution page with an install link and QR code
4. **Notifications** — set up Slack/Teams/Chatwork notifications for build updates
5. **iOS device setup** — (if applicable) UDID registration and provisioning profile management

## How to proceed

Begin by asking:
- Do you already have a DeployGate account?
- What platform is your app? (Android / iOS / both)

Then follow the onboarding skill step by step, using the DeployGate MCP tools (`get_user_info`, `upload_app`, `create_distribution`, `get_notification_settings_url`, `get_udids`) as directed.

After Phase 1 is complete, suggest CI/CD setup (`skills/ci-setup/SKILL.md`) and SDK integration (`skills/sdk-setup/SKILL.md`).
