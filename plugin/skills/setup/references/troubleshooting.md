# Troubleshooting (Phase 1)

| Issue | Solution |
|---|---|
| `unauthorized` error | Check API token at https://deploygate.com/settings |
| `num_of_member_seats_exceeded` | Upgrade plan at https://deploygate.com/settings/plan |
| iOS install fails | Check UDID registration with `get_udids` (unprovisioned_only: true) |
| Build not appearing | Verify upload response has `error: false`; check distribution page URL |
| Notification not arriving | Re-check notification settings URL; ensure webhook is correctly configured |
