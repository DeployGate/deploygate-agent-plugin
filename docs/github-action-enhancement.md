# deploygate-upload-github-action Enhancement Proposal

## Summary

Enhance `DeployGate/deploygate-upload-github-action` to support PR-based distribution page lifecycle management by embedding metadata in PR comments.

## Current Behavior

The action creates a PR comment with upload information in a table format (`## DeployGate Upload Information`), but does not include machine-readable metadata for distribution page tracking.

## Proposed Changes

### 1. Embed `access_key` metadata in PR comments

Add an HTML comment at the end of the PR comment body containing the distribution page's `access_key`:

```markdown
## DeployGate Upload Information

| Key | Value |
|---|---|
| App Name | MyApp |
| ... | ... |

<!-- deploygate:access_key=abc123def456 -->
```

The HTML comment is not rendered in the GitHub UI, so it does not affect the user-facing content.

### 2. Comment update behavior

- **First upload in a PR:** Create a new comment with metadata
- **Subsequent uploads:** Find the existing comment by searching for `<!-- deploygate:access_key=` prefix, then update it via `PATCH`

### 3. New output

Add `distribution_access_key` as a dedicated output for downstream steps:

```yaml
outputs:
  results:
    description: 'Full API response JSON'
  distribution_access_key:
    description: 'Distribution page access_key (if distribution was specified)'
```

## Why This Is Needed

The PR distribution workflow (`deploygate-pr.yml`) needs to:

1. **Track** which distribution page belongs to which PR across multiple pushes
2. **Update** the same distribution page on subsequent pushes (using `distribution_key`)
3. **Delete** the distribution page when the PR is closed/merged

Without the embedded `access_key`, the workflow has to implement its own comment management logic, which is fragile and duplicates work.

## Interim Solution

Until the action is updated, the workflow templates in this plugin include standalone comment management logic using GitHub's REST API:

- `GET /repos/{owner}/{repo}/issues/{number}/comments` to search for existing metadata
- `POST` / `PATCH` to create/update comments with embedded `<!-- deploygate:access_key=... -->`

## Implementation Notes

- The `access_key` is available in the API response at `results.distribution.access_key`
- The existing comment format (`## DeployGate Upload Information`) should be preserved
- The metadata HTML comment should be appended at the very end of the comment body
- Consider making the QR code and distribution URL part of the standard comment format
