# Troubleshooting (CI/CD)

| Issue | Solution |
|---|---|
| Secret not found | Verify secret names match exactly: `DEPLOYGATE_API_TOKEN`, `DEPLOYGATE_OWNER_NAME` |
| Build fails on iOS | Ensure `macos-latest` runner and valid code signing |
| Distribution page not created | Check `distribution_name` spelling; verify API token has write access |
| PR comment not appearing | Check `permissions: pull-requests: write` in workflow |
| Cleanup fails on PR close | Check that `DEPLOYGATE_API_TOKEN` secret is accessible to the workflow |
| Duplicate distribution pages | Ensure `distribution_key` is correctly extracted from existing PR comments |
