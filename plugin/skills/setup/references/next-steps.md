# Next Steps (After Phase 1)

## Phase 2: CI/CD Integration

"Now that distribution is working, you can automate builds with CI/CD. This frees developers from manual uploads and lets testers always get the latest build."

→ Suggest using the `ci-setup` skill.

## Phase 3: SDK Integration (Android only)

"The DeployGate SDK adds crash reporting and screen capture for bug reporting — testers can report issues with a single screenshot."

→ Suggest using the `sdk-setup` skill.

> **Note:** The iOS SDK is currently being redesigned, so new integration is not recommended. Skip this phase for iOS projects. App distribution, Instant Device, and notification features are all available without the SDK.

## Phase 4: Team Expansion

"The Free plan supports up to 2 members. To add more developers or testers, upgrade to the Flexible plan."

For teams ready to scale:
- Use `add_member` for individual additions
- Use `create_shared_team` + `assign_shared_team_to_app` for workspace-wide distribution (e.g. dogfooding)
