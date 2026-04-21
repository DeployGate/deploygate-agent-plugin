# Troubleshooting (Phase 1)

| Issue | Solution |
|---|---|
| `unauthorized` error | Check API token at https://deploygate.com/settings |
| `num_of_member_seats_exceeded` | Upgrade plan at https://deploygate.com/settings/plan |
| iOS install fails | Check UDID registration with `get_udids` (unprovisioned_only: true) |
| iOS profile install blocked for ~1 hour (first-time tester) | Tester's device has Stolen Device Protection enabled (iOS 17.3+) and is not at a "familiar location" (home / work). Have them retry at a familiar location, or temporarily disable Settings → Face ID & Passcode → Stolen Device Protection. Configuration profile installation is treated as MDM enrollment and hits the 1-hour security delay. Ref: https://support.apple.com/en-us/120340 |
| Build not appearing | Verify upload response has `error: false`; check distribution page URL |
| Notification not arriving | Re-check notification settings URL; ensure webhook is correctly configured |
