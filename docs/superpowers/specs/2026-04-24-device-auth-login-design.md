# Device Auth Code Login — Design Spec

**Date:** 2026-04-24
**Status:** Approved, ready for implementation planning
**Reference:** `../../../../deploygate/webfront/docs/cli-device-auth-code.md`

## Goal

Replace the current "paste an API token into `set_api_token`" onboarding with
an RFC 8628–style device authorization flow. The user logs in by opening a
DeployGate approval URL in their browser; the plugin receives a CLI-origin
bearer token (`deploygate_cacc_…`), persists it to disk, and reuses it across
MCP sessions. Logout revokes the token server-side.

No one is using the plugin yet (pre-release), so there is no backward
compatibility requirement. The existing `set_api_token` tool and the plugin's
runtime read of `DEPLOYGATE_API_TOKEN` are deleted outright.

## Out of scope

- **OS keychain integration.** Requires native deps (e.g. `keytar`) that break
  the zero-dep esbuild bundle. `0600` file storage is sufficient.
- **Token refresh / rotation.** The CLI token is long-lived; the user re-logs
  in if it is revoked externally.
- **Multiple accounts / token switching.**
- **QR code display.** The server returns `qr_code_url`; we surface
  `verification_uri_complete` only. Can be added later if needed.
- **CI / SDK usage of `DEPLOYGATE_API_TOKEN`.** That environment variable name
  is also the DeployGate convention for CI secrets (GitHub Actions workflow
  templates, Gradle plugin upload task, external-CI examples). Those are
  separate from the MCP plugin's runtime auth and stay untouched.

## Architecture

Three layers, each independently testable:

### 1. `TokenStore` (new — `src/token-store.ts`)

Pure class responsible for reading/writing the token file. Knows nothing
about MCP or the DeployGate API.

- **Path:**
  - Unix/macOS: `${XDG_CONFIG_HOME:-$HOME/.config}/deploygate/token`
  - Windows: `%APPDATA%\deploygate\token`
- **Format:** JSON `{ "token": "deploygate_cacc_…", "saved_at": <unix_ms> }`.
- **File permissions:** `0o600` on write (Unix; Windows ignores).
- **Directory permissions:** `0o700` when creating parent directory.
- **Methods:**
  - `load(): Promise<{ token: string } | null>` — returns `null` if missing,
    empty, or unparseable (no throw).
  - `save(token: string): Promise<void>` — creates parent dir if needed,
    writes atomically (write-temp-then-rename), `chmod 0o600`.
  - `clear(): Promise<void>` — deletes file; missing file is not an error.
  - `path(): string` — exposes the resolved path (useful for error messages
    and tests).
- **Dependencies:** `node:fs/promises`, `node:os`, `node:path` only.

### 2. `DeployGateClient` additions (`src/client.ts`)

Three new methods for the device auth endpoints. Existing methods unchanged.

- `createDeviceCode(clientLabel: string, nonce: string)` →
  `POST /api/sessions/codes` with `X-Client-Nonce: <nonce>` and body
  `{ client_label }`. Does **not** require a bearer token — request path
  must support an "unauthenticated" mode.
  - Returns: `{ code, verification_uri_complete, expires_in, interval }`
    (we ignore `verification_url`, `qr_code_url` for now).
- `pollDeviceCode(code: string, nonce: string)` →
  `GET /api/sessions/codes/<code>` with `X-Client-Nonce: <nonce>`. Also
  unauthenticated. Returns a discriminated union:
  - `{ status: 'pending' }`
  - `{ status: 'authorized', api_token, user }`
  - `{ status: 'rejected' }`                 — HTTP 401
  - `{ status: 'nonce_mismatch' }`           — HTTP 400 "Client nonce mismatch."
  - `{ status: 'rate_limited' }`             — HTTP 429
  - Any other error throws `DeployGateApiError` / network error as usual.
- `revokeCurrentToken()` →
  `DELETE /api/sessions/current_token` with the current bearer token.
  Returns `void` on 204. Throws `DeployGateApiError` on 401/403 — caller
  decides what to do.

**Request helper change:** the three new methods need behavior the current
`request()` does not provide:

1. Skip the "token missing" guard (device code create/poll have no bearer).
2. Skip the `Authorization` header for create/poll; include it for revoke.
3. Accept extra headers (`X-Client-Nonce`).
4. Handle `204 No Content` on revoke (the current `request()` calls
   `response.json()` unconditionally, which throws on empty body).
5. Dispatch on HTTP status code rather than only on `data.error` — the poll
   endpoint needs to distinguish 400/401/429 at the status level to map to
   the discriminated union.

Introduce a lower-level `requestRaw(method, path, { headers?, body?,
expectJson? })` that returns `{ status, data | null }` and leave the
existing `request()` in place as the sugar wrapper for authenticated JSON
endpoints. The three new methods use `requestRaw` directly; existing
methods continue to use `request()` unchanged.

### 3. `auth.ts` MCP tools (full rewrite)

Register four tools.

- `login_start`
  - No parameters.
  - Generates a fresh nonce with
    `crypto.randomBytes(48).toString('base64url')` (64 chars, matches
    `^[A-Za-z0-9_-]{32,128}$`).
  - Calls `client.createDeviceCode("Claude Code DeployGate plugin", nonce)`.
  - Stores a single pending session in a module-scoped variable
    `let pendingLogin: { nonce, code, intervalMs, deadlineMs } | null`.
    A second `login_start` overwrites the first (previous session discarded).
  - Returns text that includes the verification URL and the short code, plus
    an instruction to call `login_wait` next.

- `login_wait`
  - No parameters.
  - Reads `pendingLogin` and sets it to `null` immediately (the session is
    single-use; failures do not auto-retry).
  - Error: `pendingLogin === null` →
    "Call `login_start` first." (`isError: true`).
  - Loops:
    1. `await sleep(intervalMs)`.
    2. `client.pollDeviceCode(code, nonce)`.
    3. Dispatch on status:
       - `pending` → continue.
       - `authorized` → break with the result.
       - `rejected` → throw "Not approved or code expired. Run `login_start`
         again." (`isError: true`).
       - `nonce_mismatch` → throw "Login aborted for security reasons. Run
         `login_start` again." (`isError: true`). No retry.
       - `rate_limited` → sleep `intervalMs` again (without incrementing the
         network-failure counter); give up after 3 consecutive rate-limits.
    4. If `Date.now() > deadlineMs` → throw "Code expired after 5 minutes.
       Run `login_start` again." (`isError: true`).
    5. Individual network errors: up to 3 consecutive failures tolerated,
       then throw.
  - On `authorized`:
    - `await tokenStore.save(result.api_token)`.
    - `client.setToken(result.api_token)`.
    - `const orgs = await client.getOrganizations()` — re-validates the token
      and fetches user/workspace info for the response (mirrors the old
      `set_api_token` UX).
    - Return text: "Logged in as <user.name>" plus the organizations JSON.
  - The poll loop takes `sleep` as an injected parameter so tests can swap
    it for a fake timer without `vi.useFakeTimers()` gymnastics.

- `logout`
  - No parameters.
  - If `!client.hasToken()`: return "Already logged out." (not an error).
  - `try { await client.revokeCurrentToken(); } catch { /* swallow */ }` —
    401/403/network all fall through.
  - `await tokenStore.clear()`.
  - `client.setToken("")`.
  - Returns text: "Logged out." If revoke failed, include a note that the
    server-side revoke may not have succeeded but the local token was
    deleted.

- `get_user_info`
  - No parameters.
  - Wrapped with a 401 handler: if `getOrganizations()` throws
    `DeployGateApiError` with `errorType === 'unauthorized'`, call
    `tokenStore.clear()`, `client.setToken("")`, and return an `isError`
    response telling the user to run `login_start`.
  - This is the **only** tool with the 401-auto-clear wrapper. Other tools
    surface raw 401 errors with a standard "run `login_start`" suffix
    message; the first invocation of `get_user_info` at the top of the
    setup skill is where stale tokens get culled.

### Startup wiring (`src/index.ts`)

1. `const tokenStore = new TokenStore()`.
2. `const stored = await tokenStore.load()`.
3. `const client = new DeployGateClient(stored?.token)`.
4. Register tools, passing `tokenStore` into `registerAuthTools`.
5. No `process.env.DEPLOYGATE_API_TOKEN` reference anywhere.

Stored token is **not** re-validated at startup (would add latency to every
MCP process start). It is validated lazily on the first API call; the 401
wrapper on `get_user_info` handles cleanup.

## Security

- **Nonce lifecycle:** generated in `login_start`, kept in `pendingLogin`
  memory only, consumed (set to `null`) at the start of `login_wait`.
  Never written to disk, logs, or the tool response text.
- **Token storage:** `0o600` regular file. Parent dir `0o700`. Atomic write
  via write-to-temp + rename so a crash cannot leave a half-written token.
- **No logging of secrets:** the token value never appears in tool response
  text (only "Logged in as <user.name>" + organizations JSON).
- **Revoke on logout:** always attempt `DELETE /api/sessions/current_token`
  before clearing the local file, so a stolen local token is invalidated
  server-side.
- **Single pending session:** concurrent `login_start` calls do not leak
  old nonces into later polls — the latest call wins, previous one is
  dropped on the floor.

## Error handling summary

### `login_start`

| Condition | Behavior |
| --- | --- |
| `400 Invalid X-Client-Nonce format` | Generic `Error` (unreachable if nonce generator is correct — bug indicator) |
| `422 client_label is too long` | Generic `Error` (unreachable — label is hardcoded to 30 chars) |
| `429` | `isError: true`, "Too many login attempts. Wait a minute and try again." |
| Network | Propagates |

### `login_wait`

| Condition | Behavior |
| --- | --- |
| No pending session | `isError: true`, "Call `login_start` first." |
| Poll `400 Client nonce mismatch` | `isError: true`, "Login aborted for security reasons." No retry. Session cleared. |
| Poll `401` | `isError: true`, "Not approved or code expired." |
| Poll `429` | Retry up to 3 times with the server-specified interval, then give up |
| Network (per poll) | Up to 3 consecutive failures tolerated, then fail the whole call |
| Deadline exceeded (> `expires_in`) | `isError: true`, "Code expired after 5 minutes." |

### `logout`

| Condition | Behavior |
| --- | --- |
| Not logged in | Success, "Already logged out." |
| Revoke 401 | Swallowed; local clear succeeds |
| Revoke 403 | Swallowed (unreachable; would mean a non-CLI token was stored) |
| Revoke network error | Swallowed with a note in the response |
| Local file missing on clear | Not an error |

### `get_user_info`

| Condition | Behavior |
| --- | --- |
| `DeployGateApiError.errorType === 'unauthorized'` | Clear local file, clear in-memory token, `isError: true` with "Run `login_start`." |
| Any other error | Propagates |

## Testing

Vitest, `globals: true`, co-located in `src/__tests__/`.

### `token-store.test.ts` (new)

Uses a real temp directory (`os.tmpdir()` + `mkdtempSync`), cleaned up in
`afterEach`.

- `save()` creates the file; on Unix `fs.stat` shows mode `0o600`.
- `save()` creates the parent directory if missing, with mode `0o700`.
- `save()` is atomic: interrupting a write does not leave a corrupt file
  (demonstrated by writing, then writing again with a different token —
  read sees only one of the two, never a mix).
- `load()` returns `null` for: missing file, empty file, invalid JSON,
  JSON without `token` field.
- `load()` returns the token for a well-formed file.
- `clear()` deletes the file; calling it on a missing file is not an error.
- `path()` returns the expected path under `XDG_CONFIG_HOME` when set,
  falls back to `$HOME/.config` when unset.

### `client.test.ts` (additions)

Continues the existing `fetch`-mock pattern.

- `createDeviceCode` sends `X-Client-Nonce` + `client_label`; no
  `Authorization` header; parses `{code, verification_uri_complete,
  expires_in, interval}`.
- `createDeviceCode` works when `DeployGateClient` has no token set.
- `pollDeviceCode` sends `X-Client-Nonce`; maps each status:
  - 200 `{status: 'pending'}` → `'pending'`
  - 200 `{status: 'authorized', api_token, user}` → `'authorized'`
  - 401 → `'rejected'`
  - 400 "Client nonce mismatch." → `'nonce_mismatch'`
  - 429 → `'rate_limited'`
  - Unknown errors still throw.
- `pollDeviceCode` does not wrap the authorized response in
  `DeployGateApiError` (it never sets `data.error = true`).
- `revokeCurrentToken` sends DELETE with `Authorization: Bearer <token>`;
  204 returns without throwing; 401 throws `DeployGateApiError`.

### `tools.test.ts` (auth block rewritten)

- `login_start`:
  - Registers the tool, calls `createDeviceCode`, response text contains
    the URL and code.
  - Two consecutive `login_start` calls: first session is discarded (a
    following `login_wait` uses the second's nonce).
- `login_wait`:
  - With no pending session → `isError: true`.
  - Polling sequence `[pending, pending, authorized]` (via `sleep`
    injection) → `tokenStore.save` called with the token, `client.setToken`
    called, response includes the org info from `getOrganizations`.
  - `401` on first poll → `isError: true`, session cleared.
  - `nonce_mismatch` → `isError: true`, no retry.
  - Deadline exceeded → `isError: true`.
  - Three consecutive network errors → fail.
- `logout`:
  - Calls `revokeCurrentToken` then `tokenStore.clear` then
    `client.setToken("")`.
  - Revoke throwing 401 → `tokenStore.clear` still called.
- `get_user_info`:
  - Happy path unchanged.
  - `getOrganizations` throws `unauthorized` → `tokenStore.clear` called,
    `client.setToken("")` called, `isError: true`.

### `plugin.test.ts` / `skills.test.ts`

No structural changes expected; the existing invariants (version sync,
YAML frontmatter, skill file existence) still hold after the setup-skill
rewrite.

## File change list

### Code

| File | Change |
| --- | --- |
| `src/token-store.ts` | **New.** `TokenStore` class. |
| `src/client.ts` | Add `createDeviceCode`, `pollDeviceCode`, `revokeCurrentToken`. Add unauthenticated request path. |
| `src/tools/auth.ts` | **Full rewrite.** Remove `set_api_token`. Add `login_start`, `login_wait`, `logout`. Keep `get_user_info` but add 401 wrapper. Change `registerAuthTools` signature to accept `tokenStore`. |
| `src/index.ts` | Remove `process.env.DEPLOYGATE_API_TOKEN`. Instantiate `TokenStore`, load, pass to client + auth tools. |
| `src/__tests__/token-store.test.ts` | **New.** |
| `src/__tests__/client.test.ts` | Add tests for the three new methods. |
| `src/__tests__/tools.test.ts` | Rewrite auth block (drop `set_api_token`, add `login_start`/`login_wait`/`logout`; update `get_user_info`). |

### Plugin config

| File | Change |
| --- | --- |
| `plugin/.mcp.json` | Remove the `"env": { "DEPLOYGATE_API_TOKEN": "" }` block. |
| `plugin/.claude-plugin/plugin.json` | Version bump (minor). |
| `package.json` | Version bump to match (`plugin.test.ts` enforces equality). |

### Skill content

| File | Change |
| --- | --- |
| `plugin/skills/setup/SKILL.md` | Step 1 rewrite: remove paste-token flow and URL-rules block; add device-code flow via `login_start` + `login_wait`. Update "API Identifiers" mapping reference to name `get_user_info` as the source (drop `set_api_token`). Remove the "you can set `DEPLOYGATE_API_TOKEN` for future sessions" sentence. |

### Docs

| File | Change |
| --- | --- |
| `README.md` | Rewrite setup section: device-code flow instead of paste-token; drop `DEPLOYGATE_API_TOKEN` runtime env var. |
| `CLAUDE.md` | Update Key Conventions: token is obtained via `login_start`/`login_wait` and stored at `~/.config/deploygate/token` (0600). |

### Unchanged (despite mentioning `DEPLOYGATE_API_TOKEN`)

These reference `DEPLOYGATE_API_TOKEN` as a CI / SDK convention for a
**project** API key, independent of the MCP plugin's runtime auth:

- `plugin/templates/deploygate-upload.yml`
- `plugin/templates/deploygate-pr.yml`
- `plugin/skills/ci-setup/**`
- `plugin/skills/sdk-setup/SKILL.md` (Gradle plugin upload task env var)
- `plugin/scripts/bundle.js` (regenerated by `npm run build`)

## Open questions

None. Proceed to implementation planning.
