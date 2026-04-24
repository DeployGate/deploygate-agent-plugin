# Device Auth Code Login Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the paste-an-API-token onboarding with an RFC 8628-style device authorization flow; the plugin gets a CLI-origin bearer token (`deploygate_cacc_…`) via browser approval, persists it at `~/.config/deploygate/token` (0600), and exposes `login_start` / `login_wait` / `logout` tools.

**Architecture:** Three layers — a pure `TokenStore` for disk persistence, three new methods on `DeployGateClient` (`createDeviceCode`, `pollDeviceCode`, `revokeCurrentToken`) backed by a new low-level `requestRaw` helper, and a rewritten `src/tools/auth.ts` exposing four MCP tools. Startup wires `TokenStore.load()` into the client; `DEPLOYGATE_API_TOKEN` runtime env var support is deleted.

**Tech Stack:** TypeScript (strict, ESM, ES2022 target), Node.js ≥ 20, `@modelcontextprotocol/sdk`, zod, vitest, esbuild. No new runtime dependencies.

**Spec:** `docs/superpowers/specs/2026-04-24-device-auth-login-design.md`

---

## File Structure

### New files

- `src/token-store.ts` — `TokenStore` class (file-based token persistence).
- `src/__tests__/token-store.test.ts` — tests with real temp directory I/O.

### Modified files

- `src/client.ts` — add `requestRaw` internal helper and three auth methods.
- `src/__tests__/client.test.ts` — tests for the three new methods.
- `src/tools/auth.ts` — full rewrite (4 tools, `registerAuthTools` signature change).
- `src/__tests__/tools.test.ts` — rewrite auth block.
- `src/index.ts` — load `TokenStore`, drop env var read.
- `plugin/.mcp.json` — remove `env.DEPLOYGATE_API_TOKEN`.
- `plugin/skills/setup/SKILL.md` — Step 1 rewrite.
- `README.md` — setup section rewrite.
- `CLAUDE.md` — Key Conventions rewrite.
- `package.json` + `plugin/.claude-plugin/plugin.json` — version bump.

### Unchanged (despite mentioning `DEPLOYGATE_API_TOKEN`)

CI templates, `plugin/skills/ci-setup/**`, `plugin/skills/sdk-setup/SKILL.md`, `plugin/templates/*.yml` — these reference `DEPLOYGATE_API_TOKEN` as a CI/SDK convention for a **project** API key, unrelated to the plugin's runtime auth.

---

## Task 1: TokenStore — save / load / clear / path

**Files:**
- Create: `src/token-store.ts`
- Test: `src/__tests__/token-store.test.ts`

- [ ] **Step 1: Write failing tests**

Create `src/__tests__/token-store.test.ts`:

```typescript
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtempSync, rmSync, statSync, writeFileSync, mkdirSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { tmpdir, platform } from "node:os";
import { join } from "node:path";
import { TokenStore } from "../token-store.js";

describe("TokenStore", () => {
  let tmp: string;
  let store: TokenStore;

  beforeEach(() => {
    tmp = mkdtempSync(join(tmpdir(), "tokenstore-"));
    store = new TokenStore(join(tmp, "deploygate", "token"));
  });

  afterEach(() => {
    rmSync(tmp, { recursive: true, force: true });
  });

  it("path() returns the configured path", () => {
    expect(store.path()).toBe(join(tmp, "deploygate", "token"));
  });

  it("load() returns null when the file is missing", async () => {
    expect(await store.load()).toBeNull();
  });

  it("load() returns null when the file is empty", async () => {
    mkdirSync(join(tmp, "deploygate"));
    writeFileSync(store.path(), "");
    expect(await store.load()).toBeNull();
  });

  it("load() returns null on invalid JSON", async () => {
    mkdirSync(join(tmp, "deploygate"));
    writeFileSync(store.path(), "not json");
    expect(await store.load()).toBeNull();
  });

  it("load() returns null when JSON has no token field", async () => {
    mkdirSync(join(tmp, "deploygate"));
    writeFileSync(store.path(), JSON.stringify({ saved_at: 1 }));
    expect(await store.load()).toBeNull();
  });

  it("save() then load() round-trips the token", async () => {
    await store.save("deploygate_cacc_abc");
    expect(await store.load()).toEqual({ token: "deploygate_cacc_abc" });
  });

  it("save() creates the parent directory if missing", async () => {
    await store.save("t");
    const dirStat = statSync(join(tmp, "deploygate"));
    expect(dirStat.isDirectory()).toBe(true);
    if (platform() !== "win32") {
      expect(dirStat.mode & 0o777).toBe(0o700);
    }
  });

  it("save() writes the token file with 0600 permissions", async () => {
    if (platform() === "win32") return;
    await store.save("t");
    const fileStat = statSync(store.path());
    expect(fileStat.mode & 0o777).toBe(0o600);
  });

  it("save() overwrites an existing token atomically", async () => {
    await store.save("first");
    await store.save("second");
    const raw = await readFile(store.path(), "utf8");
    const parsed = JSON.parse(raw);
    expect(parsed.token).toBe("second");
  });

  it("clear() deletes the file", async () => {
    await store.save("t");
    await store.clear();
    expect(await store.load()).toBeNull();
  });

  it("clear() is a no-op when the file does not exist", async () => {
    await expect(store.clear()).resolves.toBeUndefined();
  });
});

describe("TokenStore.defaultPath", () => {
  it("uses XDG_CONFIG_HOME when set (non-Windows)", () => {
    if (platform() === "win32") return;
    const orig = process.env.XDG_CONFIG_HOME;
    process.env.XDG_CONFIG_HOME = "/xdg";
    try {
      expect(TokenStore.defaultPath()).toBe("/xdg/deploygate/token");
    } finally {
      if (orig === undefined) delete process.env.XDG_CONFIG_HOME;
      else process.env.XDG_CONFIG_HOME = orig;
    }
  });

  it("falls back to $HOME/.config when XDG is unset (non-Windows)", () => {
    if (platform() === "win32") return;
    const origXdg = process.env.XDG_CONFIG_HOME;
    const origHome = process.env.HOME;
    delete process.env.XDG_CONFIG_HOME;
    process.env.HOME = "/home/u";
    try {
      expect(TokenStore.defaultPath()).toBe("/home/u/.config/deploygate/token");
    } finally {
      if (origXdg !== undefined) process.env.XDG_CONFIG_HOME = origXdg;
      if (origHome === undefined) delete process.env.HOME;
      else process.env.HOME = origHome;
    }
  });
});
```

- [ ] **Step 2: Run the tests to confirm they fail**

Run: `npx vitest run src/__tests__/token-store.test.ts`
Expected: FAIL — `Cannot find module '../token-store.js'`.

- [ ] **Step 3: Implement TokenStore**

Create `src/token-store.ts`:

```typescript
import { mkdir, rename, rm, writeFile, readFile, chmod } from "node:fs/promises";
import { randomBytes } from "node:crypto";
import { homedir, platform } from "node:os";
import { dirname, join } from "node:path";

interface StoredToken {
  token: string;
  saved_at: number;
}

export class TokenStore {
  private readonly filePath: string;

  constructor(filePath: string = TokenStore.defaultPath()) {
    this.filePath = filePath;
  }

  static defaultPath(): string {
    if (platform() === "win32") {
      const appData = process.env.APPDATA ?? join(homedir(), "AppData", "Roaming");
      return join(appData, "deploygate", "token");
    }
    const base = process.env.XDG_CONFIG_HOME ?? join(homedir(), ".config");
    return join(base, "deploygate", "token");
  }

  path(): string {
    return this.filePath;
  }

  async load(): Promise<{ token: string } | null> {
    let raw: string;
    try {
      raw = await readFile(this.filePath, "utf8");
    } catch {
      return null;
    }
    if (raw.trim() === "") return null;
    try {
      const parsed = JSON.parse(raw) as Partial<StoredToken>;
      if (typeof parsed.token !== "string" || parsed.token === "") return null;
      return { token: parsed.token };
    } catch {
      return null;
    }
  }

  async save(token: string): Promise<void> {
    const dir = dirname(this.filePath);
    await mkdir(dir, { recursive: true, mode: 0o700 });
    if (platform() !== "win32") {
      try {
        await chmod(dir, 0o700);
      } catch {
        // ignore; directory may be owned by someone else
      }
    }
    const payload: StoredToken = { token, saved_at: Date.now() };
    const tmpPath = `${this.filePath}.${randomBytes(6).toString("hex")}.tmp`;
    await writeFile(tmpPath, JSON.stringify(payload), { mode: 0o600 });
    if (platform() !== "win32") {
      await chmod(tmpPath, 0o600);
    }
    await rename(tmpPath, this.filePath);
  }

  async clear(): Promise<void> {
    try {
      await rm(this.filePath);
    } catch (e) {
      const err = e as NodeJS.ErrnoException;
      if (err.code !== "ENOENT") throw err;
    }
  }
}
```

- [ ] **Step 4: Run the tests to confirm they pass**

Run: `npx vitest run src/__tests__/token-store.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/token-store.ts src/__tests__/token-store.test.ts
git commit -m "$(cat <<'EOF'
Add TokenStore for persisting CLI-origin tokens

File-based token persistence at ~/.config/deploygate/token (0600) with
atomic writes. Will back the device-auth login flow replacing the
set_api_token paste path.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 2: DeployGateClient — requestRaw helper

**Files:**
- Modify: `src/client.ts`
- Test: `src/__tests__/client.test.ts`

Purpose: a lower-level HTTP helper that supports requests without a bearer token, custom headers, and responses with no body (HTTP 204). The existing `request()` stays as the sugar wrapper for authenticated JSON endpoints — no existing callers change.

- [ ] **Step 1: Write failing tests**

Append to `src/__tests__/client.test.ts` (inside the top-level `describe("DeployGateClient", …)`, after `describe("request basics", …)`):

```typescript
  describe("requestRaw", () => {
    it("omits Authorization header when authenticated: false", async () => {
      mockFetch.mockResolvedValueOnce(
        mockResponse({ error: false, results: {} }),
      );
      await client.requestRaw("POST", "/api/x", {
        authenticated: false,
        body: { a: 1 },
      });
      const [, options] = mockFetch.mock.calls[0];
      expect(options.headers.Authorization).toBeUndefined();
    });

    it("sends extra headers", async () => {
      mockFetch.mockResolvedValueOnce(
        mockResponse({ error: false, results: {} }),
      );
      await client.requestRaw("POST", "/api/x", {
        authenticated: false,
        headers: { "X-Client-Nonce": "n0nce" },
      });
      const [, options] = mockFetch.mock.calls[0];
      expect(options.headers["X-Client-Nonce"]).toBe("n0nce");
    });

    it("returns { status, data } tuple", async () => {
      mockFetch.mockResolvedValueOnce(
        mockResponse({ hello: "world" }, 200),
      );
      const res = await client.requestRaw("GET", "/api/x", {
        authenticated: false,
      });
      expect(res.status).toBe(200);
      expect(res.data).toEqual({ hello: "world" });
    });

    it("returns data: null on 204 without calling .json()", async () => {
      const jsonSpy = vi.fn();
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 204,
        json: jsonSpy,
      });
      const res = await client.requestRaw("DELETE", "/api/x", {
        authenticated: true,
      });
      expect(res.status).toBe(204);
      expect(res.data).toBeNull();
      expect(jsonSpy).not.toHaveBeenCalled();
    });

    it("does NOT throw on non-2xx; caller inspects status", async () => {
      mockFetch.mockResolvedValueOnce(
        mockResponse({ error: true, message: "bad" }, 400),
      );
      const res = await client.requestRaw("GET", "/api/x", {
        authenticated: false,
      });
      expect(res.status).toBe(400);
      expect(res.data).toEqual({ error: true, message: "bad" });
    });

    it("serializes JSON body with Content-Type: application/json", async () => {
      mockFetch.mockResolvedValueOnce(
        mockResponse({ error: false, results: {} }),
      );
      await client.requestRaw("POST", "/api/x", {
        authenticated: false,
        body: { client_label: "test" },
      });
      const [, options] = mockFetch.mock.calls[0];
      expect(options.headers["Content-Type"]).toBe("application/json");
      expect(options.body).toBe(JSON.stringify({ client_label: "test" }));
    });
  });
```

- [ ] **Step 2: Run the tests to confirm they fail**

Run: `npx vitest run src/__tests__/client.test.ts -t requestRaw`
Expected: FAIL — `client.requestRaw is not a function`.

- [ ] **Step 3: Implement requestRaw**

Modify `src/client.ts`. Replace the `private async request` block and add `requestRaw` above it. Final shape:

```typescript
  async requestRaw(
    method: string,
    path: string,
    options: {
      authenticated: boolean;
      headers?: Record<string, string>;
      body?: Record<string, unknown>;
    },
  ): Promise<{ status: number; data: unknown }> {
    const url = `${BASE_URL}${path}`;
    const headers: Record<string, string> = { ...(options.headers ?? {}) };

    if (options.authenticated) {
      if (!this.token) {
        throw new Error(
          "API token is not set. Run the `login_start` tool to obtain one.",
        );
      }
      headers.Authorization = `Bearer ${this.token}`;
    }

    const fetchOptions: RequestInit = { method, headers };
    if (options.body !== undefined) {
      headers["Content-Type"] = "application/json";
      fetchOptions.body = JSON.stringify(options.body);
    }

    const response = await fetch(url, fetchOptions);
    if (response.status === 204) {
      return { status: 204, data: null };
    }
    const data = (await response.json()) as unknown;
    return { status: response.status, data };
  }

  private async request<T = unknown>(
    method: string,
    path: string,
    options?: {
      body?: Record<string, unknown>;
      formData?: FormData;
    },
  ): Promise<T> {
    if (!this.token) {
      throw new Error(
        "API token is not set. Run the `login_start` tool to obtain one.",
      );
    }
    const url = `${BASE_URL}${path}`;
    const headers: Record<string, string> = {
      Authorization: `Bearer ${this.token}`,
    };

    const fetchOptions: RequestInit = { method, headers };

    if (options?.formData) {
      fetchOptions.body = options.formData;
    } else if (options?.body) {
      headers["Content-Type"] = "application/x-www-form-urlencoded";
      const params = new URLSearchParams();
      for (const [key, value] of Object.entries(options.body)) {
        if (value !== undefined && value !== null) {
          params.set(key, String(value));
        }
      }
      fetchOptions.body = params.toString();
    }

    const response = await fetch(url, fetchOptions);
    const data = (await response.json()) as Record<string, unknown>;

    if (data.error) {
      throw new DeployGateApiError(data as unknown as DeployGateErrorDetail);
    }

    return (data.results ?? data) as T;
  }
```

Also update the existing error message in `request()` to mention `login_start` instead of `set_api_token` (shown above).

Update the existing "throws error when making request without token" test to match the new error message:

```typescript
    it("throws error when making request without token", async () => {
      const noTokenClient = new DeployGateClient();
      await expect(noTokenClient.getOrganizations()).rejects.toThrow(
        "API token is not set",
      );
      expect(mockFetch).not.toHaveBeenCalled();
    });
```

The existing assertion `rejects.toThrow("API token is not set")` is a substring match and still passes. No change needed.

- [ ] **Step 4: Run tests to confirm they pass**

Run: `npx vitest run src/__tests__/client.test.ts`
Expected: PASS (existing tests + 6 new).

- [ ] **Step 5: Commit**

```bash
git add src/client.ts src/__tests__/client.test.ts
git commit -m "$(cat <<'EOF'
Add DeployGateClient.requestRaw for unauthenticated / 204 endpoints

Lower-level HTTP helper that supports skipping the bearer token,
passing extra headers (X-Client-Nonce), and handling 204 No Content.
Needed for the upcoming device-auth code endpoints.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 3: DeployGateClient — createDeviceCode

**Files:**
- Modify: `src/client.ts`
- Test: `src/__tests__/client.test.ts`

- [ ] **Step 1: Write failing tests**

Append to `src/__tests__/client.test.ts` (inside the top-level describe):

```typescript
  describe("createDeviceCode", () => {
    it("POSTs to /api/sessions/codes with X-Client-Nonce and client_label", async () => {
      mockFetch.mockResolvedValueOnce(
        mockResponse(
          {
            error: false,
            results: {
              code: "ABCD1234",
              verification_url: "https://deploygate.com/app/sessions/codes",
              verification_uri_complete: "https://deploygate.com/app/sessions/codes?code=ABCD1234",
              expires_in: 300,
              interval: 5,
            },
          },
          200,
        ),
      );
      const noTokenClient = new DeployGateClient();
      const res = await noTokenClient.createDeviceCode("my-cli", "nonce-xyz");

      const [url, options] = mockFetch.mock.calls[0];
      expect(url).toBe("https://deploygate.com/api/sessions/codes");
      expect(options.method).toBe("POST");
      expect(options.headers["X-Client-Nonce"]).toBe("nonce-xyz");
      expect(options.headers.Authorization).toBeUndefined();
      expect(options.headers["Content-Type"]).toBe("application/json");
      expect(options.body).toBe(JSON.stringify({ client_label: "my-cli" }));

      expect(res).toEqual({
        code: "ABCD1234",
        verification_uri_complete:
          "https://deploygate.com/app/sessions/codes?code=ABCD1234",
        expires_in: 300,
        interval: 5,
      });
    });

    it("throws DeployGateApiError on error response", async () => {
      mockFetch.mockResolvedValueOnce(
        mockResponse(
          { error: true, message: "Invalid X-Client-Nonce format." },
          400,
        ),
      );
      const noTokenClient = new DeployGateClient();
      await expect(
        noTokenClient.createDeviceCode("x", "bad"),
      ).rejects.toThrow(DeployGateApiError);
    });
  });
```

- [ ] **Step 2: Run tests to confirm they fail**

Run: `npx vitest run src/__tests__/client.test.ts -t createDeviceCode`
Expected: FAIL — `client.createDeviceCode is not a function`.

- [ ] **Step 3: Implement createDeviceCode**

Add to `src/client.ts`, placed after `getOrganizations()`:

```typescript
  // --- Device auth code flow ---

  async createDeviceCode(
    clientLabel: string,
    nonce: string,
  ): Promise<{
    code: string;
    verification_uri_complete: string;
    expires_in: number;
    interval: number;
  }> {
    const res = await this.requestRaw("POST", "/api/sessions/codes", {
      authenticated: false,
      headers: { "X-Client-Nonce": nonce },
      body: { client_label: clientLabel },
    });
    const data = res.data as { error?: boolean; results?: Record<string, unknown> } | null;
    if (!data || data.error) {
      throw new DeployGateApiError(
        (data as unknown as DeployGateErrorDetail) ?? {
          error: true,
          message: `Unexpected status ${res.status}`,
        },
      );
    }
    const r = data.results as {
      code: string;
      verification_uri_complete: string;
      expires_in: number;
      interval: number;
    };
    return {
      code: r.code,
      verification_uri_complete: r.verification_uri_complete,
      expires_in: r.expires_in,
      interval: r.interval,
    };
  }
```

- [ ] **Step 4: Run tests to confirm they pass**

Run: `npx vitest run src/__tests__/client.test.ts -t createDeviceCode`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/client.ts src/__tests__/client.test.ts
git commit -m "$(cat <<'EOF'
Add DeployGateClient.createDeviceCode

Wraps POST /api/sessions/codes with X-Client-Nonce header. First piece
of the device-auth code flow.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 4: DeployGateClient — pollDeviceCode

**Files:**
- Modify: `src/client.ts`
- Test: `src/__tests__/client.test.ts`

- [ ] **Step 1: Write failing tests**

Append to `src/__tests__/client.test.ts`:

```typescript
  describe("pollDeviceCode", () => {
    it("GETs /api/sessions/codes/<code> with X-Client-Nonce", async () => {
      mockFetch.mockResolvedValueOnce(
        mockResponse(
          { error: false, results: { status: "pending" } },
          200,
        ),
      );
      const noTokenClient = new DeployGateClient();
      const res = await noTokenClient.pollDeviceCode("ABCD1234", "n0nce");

      const [url, options] = mockFetch.mock.calls[0];
      expect(url).toBe("https://deploygate.com/api/sessions/codes/ABCD1234");
      expect(options.method).toBe("GET");
      expect(options.headers["X-Client-Nonce"]).toBe("n0nce");
      expect(options.headers.Authorization).toBeUndefined();
      expect(res).toEqual({ status: "pending" });
    });

    it("returns authorized with token and user on success", async () => {
      mockFetch.mockResolvedValueOnce(
        mockResponse(
          {
            error: false,
            results: {
              status: "authorized",
              api_token: "deploygate_cacc_xxx",
              user: { name: "kitakore", email: "k@example.com" },
            },
          },
          200,
        ),
      );
      const res = await new DeployGateClient().pollDeviceCode("C", "n");
      expect(res).toEqual({
        status: "authorized",
        api_token: "deploygate_cacc_xxx",
        user: { name: "kitakore", email: "k@example.com" },
      });
    });

    it("returns rejected on 401", async () => {
      mockFetch.mockResolvedValueOnce(
        mockResponse({ error: true, message: "unauthorized" }, 401),
      );
      const res = await new DeployGateClient().pollDeviceCode("C", "n");
      expect(res).toEqual({ status: "rejected" });
    });

    it("returns nonce_mismatch on 400 Client nonce mismatch.", async () => {
      mockFetch.mockResolvedValueOnce(
        mockResponse(
          { error: true, message: "Client nonce mismatch." },
          400,
        ),
      );
      const res = await new DeployGateClient().pollDeviceCode("C", "n");
      expect(res).toEqual({ status: "nonce_mismatch" });
    });

    it("returns rate_limited on 429", async () => {
      mockFetch.mockResolvedValueOnce(
        mockResponse({ error: true, message: "too many requests" }, 429),
      );
      const res = await new DeployGateClient().pollDeviceCode("C", "n");
      expect(res).toEqual({ status: "rate_limited" });
    });

    it("throws DeployGateApiError on other 4xx", async () => {
      mockFetch.mockResolvedValueOnce(
        mockResponse({ error: true, message: "bad" }, 422),
      );
      await expect(
        new DeployGateClient().pollDeviceCode("C", "n"),
      ).rejects.toThrow(DeployGateApiError);
    });

    it("does not wrap authorized response in DeployGateApiError", async () => {
      mockFetch.mockResolvedValueOnce(
        mockResponse(
          {
            error: false,
            results: {
              status: "authorized",
              api_token: "t",
              user: { name: "u" },
            },
          },
          200,
        ),
      );
      await expect(
        new DeployGateClient().pollDeviceCode("C", "n"),
      ).resolves.toEqual(expect.objectContaining({ status: "authorized" }));
    });
  });
```

- [ ] **Step 2: Run tests to confirm they fail**

Run: `npx vitest run src/__tests__/client.test.ts -t pollDeviceCode`
Expected: FAIL — `client.pollDeviceCode is not a function`.

- [ ] **Step 3: Implement pollDeviceCode**

Add to `src/client.ts` after `createDeviceCode`:

```typescript
  async pollDeviceCode(
    code: string,
    nonce: string,
  ): Promise<
    | { status: "pending" }
    | {
        status: "authorized";
        api_token: string;
        user: Record<string, unknown>;
      }
    | { status: "rejected" }
    | { status: "nonce_mismatch" }
    | { status: "rate_limited" }
  > {
    const res = await this.requestRaw("GET", `/api/sessions/codes/${code}`, {
      authenticated: false,
      headers: { "X-Client-Nonce": nonce },
    });

    if (res.status === 401) return { status: "rejected" };
    if (res.status === 429) return { status: "rate_limited" };
    if (res.status === 400) {
      const d = res.data as { message?: string } | null;
      if (d?.message === "Client nonce mismatch.") {
        return { status: "nonce_mismatch" };
      }
      throw new DeployGateApiError(d as DeployGateErrorDetail);
    }
    if (res.status < 200 || res.status >= 300) {
      throw new DeployGateApiError(
        (res.data as DeployGateErrorDetail) ?? {
          error: true,
          message: `Unexpected status ${res.status}`,
        },
      );
    }

    const data = res.data as { error?: boolean; results?: Record<string, unknown> };
    if (data.error) {
      throw new DeployGateApiError(data as unknown as DeployGateErrorDetail);
    }
    const r = data.results as Record<string, unknown>;
    if (r.status === "pending") return { status: "pending" };
    if (r.status === "authorized") {
      return {
        status: "authorized",
        api_token: r.api_token as string,
        user: r.user as Record<string, unknown>,
      };
    }
    throw new DeployGateApiError({
      error: true,
      message: `Unexpected poll status: ${String(r.status)}`,
    });
  }
```

- [ ] **Step 4: Run tests to confirm they pass**

Run: `npx vitest run src/__tests__/client.test.ts -t pollDeviceCode`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/client.ts src/__tests__/client.test.ts
git commit -m "$(cat <<'EOF'
Add DeployGateClient.pollDeviceCode

Returns a discriminated union for pending/authorized/rejected/
nonce_mismatch/rate_limited so the caller can branch on HTTP status
without peeking at error messages.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 5: DeployGateClient — revokeCurrentToken

**Files:**
- Modify: `src/client.ts`
- Test: `src/__tests__/client.test.ts`

- [ ] **Step 1: Write failing tests**

Append to `src/__tests__/client.test.ts`:

```typescript
  describe("revokeCurrentToken", () => {
    it("DELETEs /api/sessions/current_token with bearer token", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 204,
        json: () => {
          throw new Error("should not be called");
        },
      });
      await client.revokeCurrentToken();
      const [url, options] = mockFetch.mock.calls[0];
      expect(url).toBe("https://deploygate.com/api/sessions/current_token");
      expect(options.method).toBe("DELETE");
      expect(options.headers.Authorization).toBe("Bearer test-token");
    });

    it("throws DeployGateApiError on 401", async () => {
      mockFetch.mockResolvedValueOnce(
        mockResponse(
          { error: true, message: "unauthorized", error_type: "unauthorized" },
          401,
        ),
      );
      await expect(client.revokeCurrentToken()).rejects.toThrow(
        DeployGateApiError,
      );
    });

    it("throws when no token is set", async () => {
      const noTokenClient = new DeployGateClient();
      await expect(noTokenClient.revokeCurrentToken()).rejects.toThrow(
        "API token is not set",
      );
    });
  });
```

- [ ] **Step 2: Run tests to confirm they fail**

Run: `npx vitest run src/__tests__/client.test.ts -t revokeCurrentToken`
Expected: FAIL — method missing.

- [ ] **Step 3: Implement revokeCurrentToken**

Add to `src/client.ts` after `pollDeviceCode`:

```typescript
  async revokeCurrentToken(): Promise<void> {
    const res = await this.requestRaw("DELETE", "/api/sessions/current_token", {
      authenticated: true,
    });
    if (res.status === 204) return;
    if (res.status < 200 || res.status >= 300) {
      throw new DeployGateApiError(
        (res.data as DeployGateErrorDetail) ?? {
          error: true,
          message: `Unexpected status ${res.status}`,
        },
      );
    }
  }
```

- [ ] **Step 4: Run tests to confirm they pass**

Run: `npx vitest run src/__tests__/client.test.ts -t revokeCurrentToken`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/client.ts src/__tests__/client.test.ts
git commit -m "$(cat <<'EOF'
Add DeployGateClient.revokeCurrentToken

DELETE /api/sessions/current_token for the logout flow. Handles 204
No Content responses without the existing request() helper's implicit
JSON parse.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 6: auth.ts — login_start

**Files:**
- Modify: `src/tools/auth.ts` (full rewrite starts here)
- Test: `src/__tests__/tools.test.ts` (auth block rewrite starts here)

From here on we rebuild `auth.ts` around the four new tools. Each task adds one tool and its tests; the file compiles after each task because the later tools are not yet registered.

- [ ] **Step 1: Write the failing test (and remove the old auth tests)**

Open `src/__tests__/tools.test.ts`. Delete the three existing tests inside `describe("auth tools", …)`:

- `registers get_user_info and set_api_token tools`
- `get_user_info calls getOrganizations and returns results`
- `set_api_token sets token and validates by calling getOrganizations`
- `set_api_token clears token and returns error on invalid token`

Replace that whole `describe("auth tools", …)` block with the following (tests will be added incrementally across Tasks 6–9; for this task, add only the block skeleton and the `login_start` tests):

```typescript
import { TokenStore } from "../token-store.js";

function createMockTokenStore(): TokenStore {
  return {
    path: vi.fn(() => "/tmp/test/deploygate/token"),
    load: vi.fn(async () => null),
    save: vi.fn(async () => undefined),
    clear: vi.fn(async () => undefined),
  } as unknown as TokenStore;
}

describe("auth tools", () => {
  it("registers login_start, login_wait, logout, get_user_info", () => {
    const { server, tools } = createToolCapture();
    const client = createMockClient();
    const tokenStore = createMockTokenStore();
    registerAuthTools(server, client, tokenStore);
    expect(tools.has("login_start")).toBe(true);
    expect(tools.has("login_wait")).toBe(true);
    expect(tools.has("logout")).toBe(true);
    expect(tools.has("get_user_info")).toBe(true);
  });

  it("login_start calls createDeviceCode and returns URL + code in text", async () => {
    const { server, tools } = createToolCapture();
    const client = createMockClient();
    (client.createDeviceCode as ReturnType<typeof vi.fn>).mockResolvedValue({
      code: "ABCD1234",
      verification_uri_complete: "https://deploygate.com/app/sessions/codes?code=ABCD1234",
      expires_in: 300,
      interval: 5,
    });
    registerAuthTools(server, client, createMockTokenStore());

    const handler = tools.get("login_start")!.handler;
    const result = await handler({});

    expect(client.createDeviceCode).toHaveBeenCalledTimes(1);
    const [label, nonce] = (client.createDeviceCode as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(label).toBe("Claude Code DeployGate plugin");
    expect(nonce).toMatch(/^[A-Za-z0-9_-]{32,128}$/);

    const text = result.content[0].text;
    expect(text).toContain("https://deploygate.com/app/sessions/codes?code=ABCD1234");
    expect(text).toContain("ABCD1234");
    expect(text).toContain("login_wait");
  });

  it("login_start can be called twice (second call calls createDeviceCode again)", async () => {
    const { server, tools } = createToolCapture();
    const client = createMockClient();
    (client.createDeviceCode as ReturnType<typeof vi.fn>)
      .mockResolvedValueOnce({
        code: "FIRST",
        verification_uri_complete: "https://x/?code=FIRST",
        expires_in: 300,
        interval: 5,
      })
      .mockResolvedValueOnce({
        code: "SECOND",
        verification_uri_complete: "https://x/?code=SECOND",
        expires_in: 300,
        interval: 5,
      });
    registerAuthTools(server, client, createMockTokenStore(), {
      sleep: async () => {},
    });
    const handler = tools.get("login_start")!.handler;

    const first = await handler({});
    const second = await handler({});
    expect(first.content[0].text).toContain("FIRST");
    expect(second.content[0].text).toContain("SECOND");
    expect(client.createDeviceCode).toHaveBeenCalledTimes(2);
  });

  // The "overwrites a previous pending session" invariant — that a second
  // login_start discards the first session so a subsequent login_wait uses
  // the second nonce — is tested in Task 7 (login_wait), where we can
  // actually drive the wait handler to inspect the pollDeviceCode args.
});
```

Add the mock methods to `createMockClient()` in the same file (tools.test.ts). Find the existing `createMockClient` function and add:

```typescript
    createDeviceCode: vi.fn(),
    pollDeviceCode: vi.fn(),
    revokeCurrentToken: vi.fn(),
```

next to `getOrganizations: vi.fn(),`.

- [ ] **Step 2: Run tests to confirm they fail**

Run: `npx vitest run src/__tests__/tools.test.ts -t "auth tools"`
Expected: FAIL — `registerAuthTools` signature mismatch (expects 2 args, got 3), `login_start` not registered.

- [ ] **Step 3: Rewrite src/tools/auth.ts with login_start only**

Replace the entire contents of `src/tools/auth.ts` with:

```typescript
import { randomBytes } from "node:crypto";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { DeployGateApiError, DeployGateClient } from "../client.js";
import { TokenStore } from "../token-store.js";

const CLIENT_LABEL = "Claude Code DeployGate plugin";

interface PendingLogin {
  nonce: string;
  code: string;
  intervalMs: number;
  deadlineMs: number;
}

let pendingLogin: PendingLogin | null = null;

function generateNonce(): string {
  return randomBytes(48).toString("base64url");
}

// Exposed for tests.
export function _resetPendingLoginForTests(): void {
  pendingLogin = null;
}

export function registerAuthTools(
  server: McpServer,
  client: DeployGateClient,
  tokenStore: TokenStore,
  opts: { sleep?: (ms: number) => Promise<void>; now?: () => number } = {},
): void {
  const sleep = opts.sleep ?? ((ms) => new Promise((r) => setTimeout(r, ms)));
  const now = opts.now ?? (() => Date.now());

  server.tool(
    "login_start",
    "Start DeployGate login via the device authorization code flow. Returns a URL for the user to open in their browser and approve. After the user approves, call `login_wait` to receive and store the token.",
    {},
    async () => {
      const nonce = generateNonce();
      const res = await client.createDeviceCode(CLIENT_LABEL, nonce);
      pendingLogin = {
        nonce,
        code: res.code,
        intervalMs: res.interval * 1000,
        deadlineMs: now() + res.expires_in * 1000,
      };
      return {
        content: [
          {
            type: "text",
            text:
              `Open this URL in your browser and approve the login:\n\n` +
              `  ${res.verification_uri_complete}\n\n` +
              `Short code: ${res.code} (expires in ${res.expires_in}s)\n\n` +
              `Then call the \`login_wait\` tool to receive the token.`,
          },
        ],
      };
    },
  );

  // login_wait, logout, get_user_info are added in later tasks.
  void pendingLogin;
  void sleep;
  void DeployGateApiError;
  void tokenStore;
}
```

The `void` lines silence "unused" warnings for identifiers we'll use in later tasks. Delete them as each one becomes used.

- [ ] **Step 4: Run the tests to confirm they pass**

Run: `npx vitest run src/__tests__/tools.test.ts -t "auth tools"`
Expected: PASS — the three `login_start` tests (registration, URL/code in response, two-call behavior) pass. Tools `login_wait`, `logout`, `get_user_info` are still absent from registration; the assertion `tools.has("login_wait")` in the first test fails.

**Fix:** temporarily register stub tools for the three not-yet-implemented ones so the registration test passes. Add them inside `registerAuthTools` after `login_start`:

```typescript
  server.tool("login_wait", "placeholder — implemented in Task 7", {}, async () => ({
    content: [{ type: "text", text: "not yet implemented" }],
    isError: true,
  }));
  server.tool("logout", "placeholder — implemented in Task 8", {}, async () => ({
    content: [{ type: "text", text: "not yet implemented" }],
    isError: true,
  }));
  server.tool("get_user_info", "placeholder — implemented in Task 9", {}, async () => ({
    content: [{ type: "text", text: "not yet implemented" }],
    isError: true,
  }));
```

Re-run. Expected: PASS.

Run the full suite: `npm test`
Expected: PASS. The `set_api_token` tests were already deleted in Step 1; if `npm test` surfaces any other failures pointing back to old `set_api_token` / `DEPLOYGATE_API_TOKEN` behavior, delete those tests too (they were listed in Step 1).

- [ ] **Step 5: Commit**

```bash
git add src/tools/auth.ts src/__tests__/tools.test.ts
git commit -m "$(cat <<'EOF'
Rewrite auth.ts for device code flow: login_start

First of four tools. Generates a nonce, creates a device code via the
API, and tells the user which URL to open. Subsequent tasks add
login_wait, logout, and get_user_info.

registerAuthTools() now takes a TokenStore argument.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 7: auth.ts — login_wait

**Files:**
- Modify: `src/tools/auth.ts`
- Test: `src/__tests__/tools.test.ts`

- [ ] **Step 1: Write failing tests**

Append to the `describe("auth tools", …)` block in `src/__tests__/tools.test.ts`:

```typescript
  describe("login_wait", () => {
    async function runLoginStart(
      client: ReturnType<typeof createMockClient>,
      tokenStore = createMockTokenStore(),
    ) {
      const { server, tools } = createToolCapture();
      (client.createDeviceCode as ReturnType<typeof vi.fn>).mockResolvedValue({
        code: "CODE",
        verification_uri_complete: "https://x/?code=CODE",
        expires_in: 300,
        interval: 5,
      });
      let currentTime = 1_000_000;
      registerAuthTools(server, client, tokenStore, {
        sleep: async () => {},
        now: () => currentTime,
      });
      const startHandler = tools.get("login_start")!.handler;
      const waitHandler = tools.get("login_wait")!.handler;
      await startHandler({});
      return { waitHandler, tokenStore, tools, advanceTime: (ms: number) => { currentTime += ms; } };
    }

    it("returns an error when no session is pending", async () => {
      const { server, tools } = createToolCapture();
      const client = createMockClient();
      registerAuthTools(server, client, createMockTokenStore(), {
        sleep: async () => {},
      });
      const handler = tools.get("login_wait")!.handler;
      const result = await handler({});
      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain("login_start");
    });

    it("polls until authorized, saves token, returns user info", async () => {
      const client = createMockClient();
      (client.pollDeviceCode as ReturnType<typeof vi.fn>)
        .mockResolvedValueOnce({ status: "pending" })
        .mockResolvedValueOnce({ status: "pending" })
        .mockResolvedValueOnce({
          status: "authorized",
          api_token: "deploygate_cacc_good",
          user: { name: "kitakore" },
        });
      (client.getOrganizations as ReturnType<typeof vi.fn>).mockResolvedValue([
        { name: "my-workspace" },
      ]);

      const { waitHandler, tokenStore } = await runLoginStart(client);
      const result = await waitHandler({});

      expect(result.isError).toBeUndefined();
      expect(tokenStore.save).toHaveBeenCalledWith("deploygate_cacc_good");
      expect(client.setToken).toHaveBeenCalledWith("deploygate_cacc_good");
      expect(result.content[0].text).toContain("kitakore");
      expect(result.content[0].text).toContain("my-workspace");
    });

    it("returns an error on rejected and does not retry", async () => {
      const client = createMockClient();
      (client.pollDeviceCode as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
        status: "rejected",
      });
      const { waitHandler, tokenStore } = await runLoginStart(client);
      const result = await waitHandler({});
      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain("login_start");
      expect(client.pollDeviceCode).toHaveBeenCalledTimes(1);
      expect(tokenStore.save).not.toHaveBeenCalled();
    });

    it("returns an error on nonce_mismatch and does not retry", async () => {
      const client = createMockClient();
      (client.pollDeviceCode as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
        status: "nonce_mismatch",
      });
      const { waitHandler } = await runLoginStart(client);
      const result = await waitHandler({});
      expect(result.isError).toBe(true);
      expect(result.content[0].text.toLowerCase()).toContain("security");
      expect(client.pollDeviceCode).toHaveBeenCalledTimes(1);
    });

    it("retries on rate_limited up to 3 times then fails", async () => {
      const client = createMockClient();
      (client.pollDeviceCode as ReturnType<typeof vi.fn>)
        .mockResolvedValueOnce({ status: "rate_limited" })
        .mockResolvedValueOnce({ status: "rate_limited" })
        .mockResolvedValueOnce({ status: "rate_limited" });
      const { waitHandler } = await runLoginStart(client);
      const result = await waitHandler({});
      expect(result.isError).toBe(true);
      expect(client.pollDeviceCode).toHaveBeenCalledTimes(3);
    });

    it("times out when the deadline is exceeded", async () => {
      const client = createMockClient();
      (client.pollDeviceCode as ReturnType<typeof vi.fn>).mockResolvedValue({
        status: "pending",
      });
      const { waitHandler, advanceTime } = await runLoginStart(client);

      // Each sleep() call advances virtual time past interval.
      // Use a wrapping sleep that moves the clock forward.
      // Replace the registered handler's sleep by re-registering with a time-advancing sleep:
      // Simplest: push the clock past the 300s expiry immediately.
      advanceTime(301_000);

      const result = await waitHandler({});
      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain("expired");
    });

    it("clears the pending session after success (second wait fails)", async () => {
      const client = createMockClient();
      (client.pollDeviceCode as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
        status: "authorized",
        api_token: "t",
        user: { name: "u" },
      });
      (client.getOrganizations as ReturnType<typeof vi.fn>).mockResolvedValue([]);
      const { waitHandler } = await runLoginStart(client);
      await waitHandler({});
      const second = await waitHandler({});
      expect(second.isError).toBe(true);
    });

    it("a second login_start discards the first session (wait uses the newer code)", async () => {
      const client = createMockClient();
      (client.createDeviceCode as ReturnType<typeof vi.fn>)
        .mockResolvedValueOnce({
          code: "FIRST",
          verification_uri_complete: "https://x/?code=FIRST",
          expires_in: 300,
          interval: 5,
        })
        .mockResolvedValueOnce({
          code: "SECOND",
          verification_uri_complete: "https://x/?code=SECOND",
          expires_in: 300,
          interval: 5,
        });
      (client.pollDeviceCode as ReturnType<typeof vi.fn>).mockResolvedValue({
        status: "authorized",
        api_token: "t",
        user: { name: "u" },
      });
      (client.getOrganizations as ReturnType<typeof vi.fn>).mockResolvedValue([]);

      const { server, tools } = createToolCapture();
      registerAuthTools(server, client, createMockTokenStore(), {
        sleep: async () => {},
      });
      const startHandler = tools.get("login_start")!.handler;
      const waitHandler = tools.get("login_wait")!.handler;

      await startHandler({});
      await startHandler({});
      await waitHandler({});

      const pollArgs = (client.pollDeviceCode as ReturnType<typeof vi.fn>).mock.calls[0];
      expect(pollArgs[0]).toBe("SECOND");
    });

    it("tolerates up to 3 consecutive network errors, then fails", async () => {
      const client = createMockClient();
      const netErr = new Error("network down");
      (client.pollDeviceCode as ReturnType<typeof vi.fn>)
        .mockRejectedValueOnce(netErr)
        .mockRejectedValueOnce(netErr)
        .mockRejectedValueOnce(netErr);
      const { waitHandler } = await runLoginStart(client);
      const result = await waitHandler({});
      expect(result.isError).toBe(true);
      expect(client.pollDeviceCode).toHaveBeenCalledTimes(3);
    });
  });
```

- [ ] **Step 2: Run tests to confirm they fail**

Run: `npx vitest run src/__tests__/tools.test.ts -t login_wait`
Expected: FAIL — `tools.get("login_wait")` returns undefined.

- [ ] **Step 3: Implement login_wait**

In `src/tools/auth.ts`, replace the `server.tool("login_wait", "placeholder — implemented in Task 7", …)` stub added in Task 6 Step 4 with the real registration below. Leave the `logout` and `get_user_info` stubs in place for now (they are replaced in Tasks 8 and 9). Also delete any remaining `void pendingLogin;` / `void sleep;` / `void tokenStore;` guard lines — those identifiers become used now.

```typescript
  server.tool(
    "login_wait",
    "Wait for the user to approve the login started by `login_start`. Polls the server on the server-specified interval until the code is authorized, rejected, or expired (~5 minutes). On success, stores the token locally and returns workspace info.",
    {},
    async () => {
      const session = pendingLogin;
      pendingLogin = null;
      if (!session) {
        return {
          content: [
            {
              type: "text",
              text: "No login in progress. Call `login_start` first.",
            },
          ],
          isError: true,
        };
      }

      let rateLimited = 0;
      let networkErrors = 0;
      const MAX_RATE_LIMITED = 3;
      const MAX_NETWORK_ERRORS = 3;

      while (true) {
        if (now() > session.deadlineMs) {
          return {
            content: [
              {
                type: "text",
                text: "The code expired after 5 minutes. Run `login_start` again.",
              },
            ],
            isError: true,
          };
        }

        await sleep(session.intervalMs);

        let res:
          | Awaited<ReturnType<DeployGateClient["pollDeviceCode"]>>
          | null = null;
        try {
          res = await client.pollDeviceCode(session.code, session.nonce);
          networkErrors = 0;
        } catch {
          networkErrors += 1;
          if (networkErrors >= MAX_NETWORK_ERRORS) {
            return {
              content: [
                {
                  type: "text",
                  text: "Repeated network errors while polling. Check your connection and run `login_start` again.",
                },
              ],
              isError: true,
            };
          }
          continue;
        }

        if (res.status === "pending") continue;

        if (res.status === "rate_limited") {
          rateLimited += 1;
          if (rateLimited >= MAX_RATE_LIMITED) {
            return {
              content: [
                {
                  type: "text",
                  text: "Hit the server's rate limit repeatedly. Wait a minute and run `login_start` again.",
                },
              ],
              isError: true,
            };
          }
          continue;
        }

        if (res.status === "rejected") {
          return {
            content: [
              {
                type: "text",
                text: "Login was not approved, or the code expired. Run `login_start` again.",
              },
            ],
            isError: true,
          };
        }

        if (res.status === "nonce_mismatch") {
          return {
            content: [
              {
                type: "text",
                text: "Login aborted for security reasons (nonce mismatch). Run `login_start` again.",
              },
            ],
            isError: true,
          };
        }

        // authorized
        await tokenStore.save(res.api_token);
        client.setToken(res.api_token);
        const orgs = await client.getOrganizations();
        const userName = (res.user as { name?: string }).name ?? "(unknown)";
        return {
          content: [
            {
              type: "text",
              text:
                `Logged in as ${userName}.\n\n` +
                JSON.stringify(orgs, null, 2) +
                `\n\nToken saved to ${tokenStore.path()}.`,
            },
          ],
        };
      }
    },
  );
```

Remove the `void pendingLogin;`, `void sleep;`, `void tokenStore;` guard lines — those identifiers are now used.

- [ ] **Step 4: Run tests to confirm they pass**

Run: `npx vitest run src/__tests__/tools.test.ts -t login_wait`
Expected: PASS (all login_wait tests).

Run the full auth block: `npx vitest run src/__tests__/tools.test.ts -t "auth tools"`
Expected: PASS.

Note: the "times out when the deadline is exceeded" test advances time **before** calling `waitHandler`. The loop checks `now() > deadlineMs` at the top of each iteration, which will trip immediately. If it hangs instead, the implementation is checking deadline after the first sleep — fix by putting the deadline check first (as shown above).

- [ ] **Step 5: Commit**

```bash
git add src/tools/auth.ts src/__tests__/tools.test.ts
git commit -m "$(cat <<'EOF'
Add login_wait tool to complete the device-auth poll loop

Polls pollDeviceCode on the server-specified interval, saves the token
via TokenStore on success, handles rejected / nonce_mismatch / rate
limited / network error / expiry paths.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 8: auth.ts — logout

**Files:**
- Modify: `src/tools/auth.ts`
- Test: `src/__tests__/tools.test.ts`

- [ ] **Step 1: Write failing tests**

Append to `describe("auth tools", …)`:

```typescript
  describe("logout", () => {
    it("is a no-op when not logged in", async () => {
      const { server, tools } = createToolCapture();
      const client = createMockClient();
      (client.hasToken as ReturnType<typeof vi.fn>).mockReturnValue(false);
      const tokenStore = createMockTokenStore();
      registerAuthTools(server, client, tokenStore, { sleep: async () => {} });

      const result = await tools.get("logout")!.handler({});
      expect(result.isError).toBeUndefined();
      expect(result.content[0].text).toContain("Already logged out");
      expect(client.revokeCurrentToken).not.toHaveBeenCalled();
      expect(tokenStore.clear).not.toHaveBeenCalled();
    });

    it("revokes, clears the store, clears in-memory token", async () => {
      const { server, tools } = createToolCapture();
      const client = createMockClient();
      (client.hasToken as ReturnType<typeof vi.fn>).mockReturnValue(true);
      const tokenStore = createMockTokenStore();
      registerAuthTools(server, client, tokenStore, { sleep: async () => {} });

      const result = await tools.get("logout")!.handler({});
      expect(result.isError).toBeUndefined();
      expect(client.revokeCurrentToken).toHaveBeenCalledTimes(1);
      expect(tokenStore.clear).toHaveBeenCalledTimes(1);
      expect(client.setToken).toHaveBeenCalledWith("");
    });

    it("swallows revoke 401 and still clears local state", async () => {
      const { server, tools } = createToolCapture();
      const client = createMockClient();
      (client.hasToken as ReturnType<typeof vi.fn>).mockReturnValue(true);
      (client.revokeCurrentToken as ReturnType<typeof vi.fn>).mockRejectedValue(
        new DeployGateApiError({
          error: true,
          message: "unauthorized",
          error_type: "unauthorized",
        }),
      );
      const tokenStore = createMockTokenStore();
      registerAuthTools(server, client, tokenStore, { sleep: async () => {} });

      const result = await tools.get("logout")!.handler({});
      expect(result.isError).toBeUndefined();
      expect(tokenStore.clear).toHaveBeenCalled();
      expect(client.setToken).toHaveBeenCalledWith("");
    });

    it("swallows network error on revoke and still clears local state", async () => {
      const { server, tools } = createToolCapture();
      const client = createMockClient();
      (client.hasToken as ReturnType<typeof vi.fn>).mockReturnValue(true);
      (client.revokeCurrentToken as ReturnType<typeof vi.fn>).mockRejectedValue(
        new Error("ENETUNREACH"),
      );
      const tokenStore = createMockTokenStore();
      registerAuthTools(server, client, tokenStore, { sleep: async () => {} });

      const result = await tools.get("logout")!.handler({});
      expect(result.isError).toBeUndefined();
      expect(tokenStore.clear).toHaveBeenCalled();
      expect(result.content[0].text).toContain("server-side revoke");
    });
  });
```

- [ ] **Step 2: Run tests to confirm they fail**

Run: `npx vitest run src/__tests__/tools.test.ts -t logout`
Expected: FAIL — `logout` tool not registered.

- [ ] **Step 3: Implement logout**

Add to `src/tools/auth.ts` inside `registerAuthTools`, after `login_wait`:

```typescript
  server.tool(
    "logout",
    "Revoke the stored DeployGate token on the server and delete the local token file. Use this to sign out of DeployGate on this machine.",
    {},
    async () => {
      if (!client.hasToken()) {
        return {
          content: [{ type: "text", text: "Already logged out." }],
        };
      }

      let revokeFailed = false;
      try {
        await client.revokeCurrentToken();
      } catch {
        revokeFailed = true;
      }

      await tokenStore.clear();
      client.setToken("");

      const note = revokeFailed
        ? " (Note: the server-side revoke may not have succeeded; the local token was deleted regardless.)"
        : "";
      return {
        content: [{ type: "text", text: `Logged out.${note}` }],
      };
    },
  );
```

- [ ] **Step 4: Run tests to confirm they pass**

Run: `npx vitest run src/__tests__/tools.test.ts -t logout`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/tools/auth.ts src/__tests__/tools.test.ts
git commit -m "$(cat <<'EOF'
Add logout tool

Revokes the server-side token and clears the local token file. Handles
revoke failures (401/network) by still clearing local state and
noting the server-side uncertainty in the response.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 9: auth.ts — get_user_info (with 401 wrapper)

**Files:**
- Modify: `src/tools/auth.ts`
- Test: `src/__tests__/tools.test.ts`

- [ ] **Step 1: Write failing tests**

Append to `describe("auth tools", …)`:

```typescript
  describe("get_user_info", () => {
    it("returns organizations on success", async () => {
      const { server, tools } = createToolCapture();
      const client = createMockClient();
      (client.getOrganizations as ReturnType<typeof vi.fn>).mockResolvedValue([
        { name: "ws" },
      ]);
      registerAuthTools(server, client, createMockTokenStore(), {
        sleep: async () => {},
      });
      const result = await tools.get("get_user_info")!.handler({});
      expect(result.isError).toBeUndefined();
      expect(JSON.parse(result.content[0].text)).toEqual([{ name: "ws" }]);
    });

    it("clears local token and returns an error on unauthorized", async () => {
      const { server, tools } = createToolCapture();
      const client = createMockClient();
      (client.getOrganizations as ReturnType<typeof vi.fn>).mockRejectedValue(
        new DeployGateApiError({
          error: true,
          message: "Unauthorized",
          error_type: "unauthorized",
        }),
      );
      const tokenStore = createMockTokenStore();
      registerAuthTools(server, client, tokenStore, { sleep: async () => {} });

      const result = await tools.get("get_user_info")!.handler({});
      expect(result.isError).toBe(true);
      expect(tokenStore.clear).toHaveBeenCalled();
      expect(client.setToken).toHaveBeenCalledWith("");
      expect(result.content[0].text).toContain("login_start");
    });

    it("propagates non-401 errors", async () => {
      const { server, tools } = createToolCapture();
      const client = createMockClient();
      (client.getOrganizations as ReturnType<typeof vi.fn>).mockRejectedValue(
        new DeployGateApiError({
          error: true,
          message: "Server error",
          error_type: "internal_error",
        }),
      );
      registerAuthTools(server, client, createMockTokenStore(), {
        sleep: async () => {},
      });
      await expect(
        tools.get("get_user_info")!.handler({}),
      ).rejects.toThrow("Server error");
    });
  });
```

- [ ] **Step 2: Run tests to confirm they fail**

Run: `npx vitest run src/__tests__/tools.test.ts -t get_user_info`
Expected: FAIL — `get_user_info` not registered.

- [ ] **Step 3: Implement get_user_info**

Add to `src/tools/auth.ts` inside `registerAuthTools`, after `logout`:

```typescript
  server.tool(
    "get_user_info",
    "Get current user information — workspace name and projects associated with the stored token. If the token is invalid, the local token is deleted and the tool instructs the user to run `login_start`.",
    {},
    async () => {
      try {
        const orgs = await client.getOrganizations();
        return {
          content: [{ type: "text", text: JSON.stringify(orgs, null, 2) }],
        };
      } catch (e) {
        if (
          e instanceof DeployGateApiError &&
          e.errorType === "unauthorized"
        ) {
          await tokenStore.clear();
          client.setToken("");
          return {
            content: [
              {
                type: "text",
                text: "The stored token is invalid. Run `login_start` to log in again.",
              },
            ],
            isError: true,
          };
        }
        throw e;
      }
    },
  );
```

Remove the `void DeployGateApiError;` guard if still present.

- [ ] **Step 4: Run tests to confirm they pass**

Run: `npx vitest run src/__tests__/tools.test.ts -t "auth tools"`
Expected: PASS (all auth tests — login_start, login_wait, logout, get_user_info).

Run full suite: `npm test`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/tools/auth.ts src/__tests__/tools.test.ts
git commit -m "$(cat <<'EOF'
Add get_user_info with automatic 401 cleanup

Returns workspace/project info. On an unauthorized response from the
API, clears the local token file so the next login starts clean.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 10: Wire TokenStore into index.ts, drop env var

**Files:**
- Modify: `src/index.ts`

- [ ] **Step 1: Update index.ts**

Replace the contents of `src/index.ts` with:

```typescript
#!/usr/bin/env node

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { DeployGateClient } from "./client.js";
import { TokenStore } from "./token-store.js";
import { registerAuthTools } from "./tools/auth.js";
import { registerUploadTools } from "./tools/upload.js";
import { registerDistributionTools } from "./tools/distributions.js";
import { registerUdidTools } from "./tools/udids.js";
import { registerNotificationTools } from "./tools/notifications.js";
import { registerMemberTools } from "./tools/members.js";
import { registerSharedTeamTools } from "./tools/shared-teams.js";

const tokenStore = new TokenStore();
const stored = await tokenStore.load();
const client = new DeployGateClient(stored?.token);

const server = new McpServer({
  name: "deploygate",
  version: "1.0.0",
});

registerAuthTools(server, client, tokenStore);
registerUploadTools(server, client);
registerDistributionTools(server, client);
registerUdidTools(server, client);
registerNotificationTools(server);
registerMemberTools(server, client);
registerSharedTeamTools(server, client);

const transport = new StdioServerTransport();
await server.connect(transport);
```

Note: `process.env.DEPLOYGATE_API_TOKEN` is gone.

- [ ] **Step 2: Build and run tests**

Run: `npm run build && npm test`
Expected: PASS on both build and tests. If tsc flags an unused import or type mismatch (e.g. top-level `await` against the current tsconfig), fix it — `tsconfig.json` targets ES2022 and Node16 module resolution, so top-level await works without changes. The existing file already had a top-level `await server.connect(...)`, so this is fine.

- [ ] **Step 3: Commit**

```bash
git add src/index.ts
git commit -m "$(cat <<'EOF'
Wire TokenStore into MCP server startup

Removes the DEPLOYGATE_API_TOKEN environment variable read. The server
now loads a persisted token from disk (or starts empty) and passes the
TokenStore to the auth tools for save/clear.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 11: Remove DEPLOYGATE_API_TOKEN from plugin/.mcp.json

**Files:**
- Modify: `plugin/.mcp.json`

- [ ] **Step 1: Remove the env block**

Replace `plugin/.mcp.json` contents with:

```json
{
  "mcpServers": {
    "deploygate": {
      "command": "node",
      "args": ["${CLAUDE_PLUGIN_ROOT}/scripts/bundle.js"]
    }
  }
}
```

- [ ] **Step 2: Run plugin.test.ts to confirm no structural regression**

Run: `npx vitest run src/__tests__/plugin.test.ts`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add plugin/.mcp.json
git commit -m "$(cat <<'EOF'
Drop DEPLOYGATE_API_TOKEN env passthrough from .mcp.json

The plugin no longer reads this variable at runtime; auth is done via
the device-auth code flow (login_start / login_wait) with persisted
token storage.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 12: Update the setup skill (Step 1)

**Files:**
- Modify: `plugin/skills/setup/SKILL.md`

- [ ] **Step 1: Rewrite the "URL Rules" and "Step 1" sections**

Open `plugin/skills/setup/SKILL.md`. Delete the entire `## IMPORTANT: URL Rules` block (currently lines 28–41 — the block starting with `## IMPORTANT: URL Rules` and ending with `The API token is displayed directly on https://deploygate.com/settings — there is no subpath.`).

Find the `### Step 1: Account Creation` section (around line 123) and replace its body with:

```markdown
### Step 1: Account Creation

Login is browser-based via a device authorization code. The user never pastes a token.

**If the user already has an account:**

1. Call `login_start`. It returns a URL (format: `https://deploygate.com/app/sessions/codes?code=XXXXXXXX`) and a short code. Present the URL to the user and ask them to open it in a browser where they are signed in to DeployGate, then approve the login.
2. Call `login_wait` immediately after — it blocks until the user approves (or the code expires in 5 minutes). On success it returns workspace/project info and saves the token to `~/.config/deploygate/token` (0600).
3. If `login_wait` returns an error (rejected, expired, nonce mismatch), call `login_start` again and retry.

**If the user doesn't have a DeployGate account:**

1. Direct them to sign up: https://deploygate.com/app/register/signup
2. After signup, run the same `login_start` → `login_wait` flow described above.

The saved token persists across future Claude Code sessions — the user does not need to log in again unless they run `logout` or the token is revoked server-side.

If `login_wait` or any later tool returns "stored token is invalid," the local token file has already been cleared; the user just needs to call `login_start` again.
```

Also update line 96 (inside `## API Identifiers`) to drop the `/ set_api_token` phrase:

```
DeployGate has two identifier slugs you will reuse across tool calls. Both come from the `get_user_info` / `login_wait` response. Read terminology.md first for the user-facing names; this section is just the API-side mapping.
```

Update the `allowed-tools` frontmatter to ensure the new tools are covered. The existing `mcp__deploygate__*` glob already covers them, so no change needed there.

- [ ] **Step 2: Run the skill tests**

Run: `npx vitest run src/__tests__/skills.test.ts`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add plugin/skills/setup/SKILL.md
git commit -m "$(cat <<'EOF'
Update setup skill Step 1 for device-auth login

Replaces the paste-an-API-token instructions with the login_start /
login_wait flow. Drops the "URL Rules" block about deploygate.com/
settings since users no longer navigate there. Updates the API
Identifiers reference to name login_wait alongside get_user_info.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 13: Update README.md and CLAUDE.md

**Files:**
- Modify: `README.md`
- Modify: `CLAUDE.md`

- [ ] **Step 1: Update README.md**

Open `README.md`. Find any section describing authentication / token setup. There are likely references to:

- Getting an API token from `https://deploygate.com/settings`
- Setting `DEPLOYGATE_API_TOKEN` in MCP config
- The `set_api_token` tool

Replace with a description of the new flow. Example replacement block (adapt to match the existing tone and heading level):

```markdown
## Authentication

The plugin signs you in to DeployGate via a browser-based device authorization code:

1. Ask Claude to set up DeployGate. Under the hood it calls the `login_start` tool, which returns a URL and a short code.
2. Open the URL in a browser where you are signed in to DeployGate and click approve.
3. Claude calls `login_wait`, which returns your workspace information once you approve.

The issued token is stored at `~/.config/deploygate/token` (on Windows, `%APPDATA%\deploygate\token`) with `0600` permissions and reused across Claude Code sessions. Run the `logout` tool to revoke it server-side and delete the local file.
```

Remove any mention of `DEPLOYGATE_API_TOKEN` as an environment variable the MCP server reads. (If your README also documents CI secret names that happen to be `DEPLOYGATE_API_TOKEN`, leave those — they are about CI, not the plugin runtime.)

- [ ] **Step 2: Update CLAUDE.md**

Open `CLAUDE.md`. Find the bullet under **Key Conventions**:

```
- Token can come from `DEPLOYGATE_API_TOKEN` env var or be set at runtime via the `set_api_token` tool
```

Replace with:

```
- Authentication uses the device authorization code flow. `login_start` → user approves in browser → `login_wait` stores the token at `~/.config/deploygate/token` (0600). `logout` revokes server-side and deletes the file.
```

- [ ] **Step 3: Commit**

```bash
git add README.md CLAUDE.md
git commit -m "$(cat <<'EOF'
Update README and CLAUDE.md for device-auth login

Documents the login_start / login_wait / logout flow and the
~/.config/deploygate/token storage path. Removes references to
DEPLOYGATE_API_TOKEN as a plugin-runtime env var (the CI secret
convention with the same name is unrelated and stays in its own docs).

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 14: Version bump, full build + test, smoke check

**Files:**
- Modify: `package.json`
- Modify: `plugin/.claude-plugin/plugin.json`

Current version: `1.1.6`. This is a breaking change (tool surface changed, env var removed) but pre-release, so a minor bump is fine.

- [ ] **Step 1: Bump the version in both files**

Edit `package.json`: change `"version": "1.1.6"` to `"version": "1.2.0"`.

Edit `plugin/.claude-plugin/plugin.json`: change `"version": "1.1.6"` to `"version": "1.2.0"`.

- [ ] **Step 2: Run the full build and test suite**

Run: `npm run build && npm test`
Expected: PASS on both. `plugin.test.ts` enforces version equality between the two JSON files — if it fails, re-check Step 1.

- [ ] **Step 3: Manual smoke check**

Run: `node plugin/scripts/bundle.js < /dev/null`
Expected: exits cleanly (stdio transport waits for input, then exits on EOF from `/dev/null`). No exception about missing env vars or missing modules.

Alternative with token file absent: `rm -f ~/.config/deploygate/token && node plugin/scripts/bundle.js < /dev/null` — also clean exit. (The real MCP handshake can't be exercised from the shell; this just checks the bundle can be loaded.)

- [ ] **Step 4: Commit**

```bash
git add package.json plugin/.claude-plugin/plugin.json plugin/scripts/bundle.js
git commit -m "$(cat <<'EOF'
Release 1.2.0: device-auth code login

Replaces the paste-an-API-token flow with RFC 8628-style device code
auth. New tools: login_start, login_wait, logout. Removed:
set_api_token and DEPLOYGATE_API_TOKEN plugin env var.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Self-Review Checklist (for the implementer)

After completing all 14 tasks, verify:

1. `grep -rn set_api_token src plugin` returns nothing under `src/` or in `plugin/skills/setup` / `plugin/scripts/bundle.js`. (A match inside `plugin/scripts/bundle.js` means you forgot to `npm run build`.)
2. `grep -rn DEPLOYGATE_API_TOKEN src plugin/.mcp.json plugin/skills/setup` returns nothing. (Matches in `plugin/skills/ci-setup/**`, `plugin/skills/sdk-setup/**`, `plugin/templates/**` are expected and correct.)
3. `npm test` is green.
4. `npm run build` is green.
5. `node plugin/scripts/bundle.js < /dev/null` exits cleanly.
6. Manual end-to-end sanity in a real Claude Code session: call `login_start`, open URL, approve, call `login_wait`, see workspace info. Run `logout`, verify `~/.config/deploygate/token` is deleted. Call `login_start` again → success.
