# DeployGate MCP フェーズ① 実装計画: アプリ / バイナリ / 配布ページ管理

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** DeployGate 公開 API のうち API トークンで駆動できる「アプリ / バイナリ(リビジョン) / アプリメンバー / 配布ページ追補 / keystore / ユーザー照会」操作を、既存パターンに沿った MCP ツールとして追加する。

**Architecture:** 既存の `DeployGateClient` にエンドポイントごとのメソッドを追加し、新規ツールモジュール（`apps.ts`, `app-members.ts`, `keystores.ts`, `users.ts`）と既存 `distributions.ts` の拡張で MCP ツールを登録する。各ツールは `JSON.stringify(results, null, 2)` のテキストを返す。一部の v2 専用エンドポイント（リビジョン更新・検索）は `X-DEPLOYGATE-API-VERSION: 2` ヘッダを送る。

**Tech Stack:** TypeScript (ESM, strict), `@modelcontextprotocol/sdk` (`McpServer.tool`), Zod, Vitest。

**親 spec:** `docs/superpowers/specs/2026-05-22-deploygate-mcp-phase1-apps-binaries-distributions-design.md`

---

## ファイル構成

- 変更: `src/client.ts` — `request()` に `headers` オプション追加、Phase 1 のメソッド群を追加
- 新規: `src/tools/apps.ts` — `registerAppTools`
- 新規: `src/tools/app-members.ts` — `registerAppMemberTools`
- 新規: `src/tools/keystores.ts` — `registerKeystoreTools`
- 新規: `src/tools/users.ts` — `registerUserTools`
- 変更: `src/tools/distributions.ts` — `delete_distribution_by_name`, `update_distribution_revision` 追加、`update_distribution` に IP 制限パラメータ追加
- 変更: `src/index.ts` — 新モジュールの import と登録
- 変更: `src/__tests__/client.test.ts` — 追加メソッドの fetch 検証
- 変更: `src/__tests__/tools.test.ts` — 新ツールの登録・パラメータ検証

## エンドポイント早見表（裏取り済み）

`BASE = /api/users/:owner/platforms/:platform/apps/:app_id`

| ツール | メソッド・パス | 備考 |
|---|---|---|
| get_app | GET `BASE` (`?revision=&key=`) | v1 |
| list_app_revisions | GET `BASE/binaries` (`?page=`) | v1, 50/page |
| get_app_revision | GET `BASE/binaries/:revision` | v1 |
| update_app_revision | PATCH `BASE/binaries/:revision` body `message` | **v2 必須** |
| delete_app_revision | DELETE `BASE/binaries/:revision` | 最新/保護中は 400。配布適用中は自動保護のため削除不可（配布を差し替え/削除してから） |
| protect_app_revision | POST `BASE/binaries/:revision/protect` | 手動保護を付与。上限超過 403 |
| unprotect_app_revision | DELETE `BASE/binaries/:revision/protect` | 手動保護のみ解除。配布由来の保護は外れない |
| search_app_revisions | GET `BASE/binaries/search?q=` | **v2 必須** |
| list_app_members | GET `BASE/members` | |
| invite_app_members | POST `BASE/members` body `users`,`role` | users はカンマ区切り |
| remove_app_members | DELETE `BASE/members` body `users` | |
| delete_distribution_by_name | DELETE `BASE/distributions?distribution_name=` | 同名複数 400 / 不在 404 |
| update_distribution_revision | POST `/api/distributions/:access_key/packages` body `revision`,`release_note` | |
| get_keystore | GET `BASE/keystores/show` | Android, platform=android 固定 |
| create_keystore | POST `BASE/keystores/create` | デバッグ鍵生成 |
| update_keystore | PUT `BASE/keystores/update` multipart | file,alias_name,keystore_password,key_password |
| delete_keystore | DELETE `BASE/keystores/destroy` | |
| download_keystore | GET `BASE/keystores/download` | `{url,checksum}` |
| get_user | GET `/api/users/:id` | |

`ApplicationMember::Role`: Member=1, ReadOnly=2, DownloadOnly=3。

> **重要（アプリメンバーの適用範囲）**: `invite_app_members` / `remove_app_members` は **owner が個人ユーザーのアプリにのみ有効**。`application_policy.rb` の `member_addable?`/`tester_addable?` は owner が User でない場合 `false` を返すため、ワークスペースのプロジェクト配下（owner が Group）のアプリへ直接 invite すると 403 になる。ワークスペースアプリへのアクセス付与は「ワークスペースに招待 → プロジェクトに追加 → アプリに attach 済みのいずれかのチームに追加（または team を作成し user を追加して app に attach）」という team 経由のフロー（フェーズ②・③のツール）で行う。`list_app_members` は users と teams の両方を返すため両ケースで有効。

---

## Task 1: client `request()` に headers オプションを追加（v2 ヘッダ用の前提整備）

このオプションは追加的で、呼び出し側が使うまで観測可能な挙動変化はない。動作検証は Task 2 の `searchAppRevisions`/`updateAppRevision` テスト（v2 ヘッダを assert）で行う。本 Task は型整備とビルド確認のみ。

**Files:**
- Modify: `src/client.ts:83-125`（`request` メソッド）

- [ ] **Step 1: Add `headers` option to `request()`**

`src/client.ts` の private `request` のシグネチャとヘッダ構築を変更:

```typescript
  private async request<T = unknown>(
    method: string,
    path: string,
    options?: {
      body?: Record<string, unknown>;
      formData?: FormData;
      headers?: Record<string, string>;
    },
  ): Promise<T> {
    if (!this.token) {
      throw new Error(
        "API token is not set. Run the `login_start` tool to obtain one.",
      );
    }
    const url = `${BASE_URL}${path}`;
    const headers: Record<string, string> = {
      "User-Agent": USER_AGENT,
      Authorization: `Bearer ${this.token}`,
      ...(options?.headers ?? {}),
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

（差分は型に `headers?` を足し、`headers` 初期化に `...(options?.headers ?? {})` を加える2点のみ。）

- [ ] **Step 2: Type-check**

Run: `npm run build`
Expected: tsc がエラーなく通る（既存テストも壊れない）。挙動検証は Task 2 の v2 ヘッダ assert で行う。

- [ ] **Step 3: Commit**

```bash
git add src/client.ts
git commit -m "feat(client): support extra request headers for API v2"
```

---

## Task 2: `apps.ts` — アプリ詳細とバイナリ(リビジョン)操作

**Files:**
- Modify: `src/client.ts`（`// --- App upload ---` セクションの直前あたりに「App detail / binaries」メソッド群を追加）
- Create: `src/tools/apps.ts`
- Test: `src/__tests__/client.test.ts`, `src/__tests__/tools.test.ts`

- [ ] **Step 1: Write failing client tests**

`src/__tests__/client.test.ts` に追加:

```typescript
describe("app detail & binaries", () => {
  beforeEach(() => {
    mockFetch.mockResolvedValue(mockResponse({ error: false, results: {} }));
  });

  it("getApp builds the app path with optional revision query", async () => {
    await client.getApp("alice", "android", "com.example.app", { revision: 5 });
    const [url, options] = mockFetch.mock.calls[0];
    expect(url).toBe(
      "https://deploygate.com/api/users/alice/platforms/android/apps/com.example.app?revision=5",
    );
    expect(options.method).toBe("GET");
  });

  it("listAppRevisions builds the binaries path with page", async () => {
    await client.listAppRevisions("alice", "ios", "com.example.app", { page: 2 });
    const [url] = mockFetch.mock.calls[0];
    expect(url).toBe(
      "https://deploygate.com/api/users/alice/platforms/ios/apps/com.example.app/binaries?page=2",
    );
  });

  it("getAppRevision targets a revision", async () => {
    await client.getAppRevision("alice", "android", "com.example.app", 7);
    const [url] = mockFetch.mock.calls[0];
    expect(url).toBe(
      "https://deploygate.com/api/users/alice/platforms/android/apps/com.example.app/binaries/7",
    );
  });

  it("updateAppRevision sends PATCH with message and v2 header", async () => {
    await client.updateAppRevision("alice", "android", "com.example.app", 7, "note");
    const [url, options] = mockFetch.mock.calls[0];
    expect(url).toBe(
      "https://deploygate.com/api/users/alice/platforms/android/apps/com.example.app/binaries/7",
    );
    expect(options.method).toBe("PATCH");
    expect(options.body).toContain("message=note");
    expect(options.headers["X-DEPLOYGATE-API-VERSION"]).toBe("2");
  });

  it("deleteAppRevision sends DELETE", async () => {
    await client.deleteAppRevision("alice", "android", "com.example.app", 7);
    const [url, options] = mockFetch.mock.calls[0];
    expect(url).toBe(
      "https://deploygate.com/api/users/alice/platforms/android/apps/com.example.app/binaries/7",
    );
    expect(options.method).toBe("DELETE");
  });

  it("protectAppRevision posts to /protect", async () => {
    await client.protectAppRevision("alice", "android", "com.example.app", 7);
    const [url, options] = mockFetch.mock.calls[0];
    expect(url).toBe(
      "https://deploygate.com/api/users/alice/platforms/android/apps/com.example.app/binaries/7/protect",
    );
    expect(options.method).toBe("POST");
  });

  it("unprotectAppRevision deletes /protect", async () => {
    await client.unprotectAppRevision("alice", "android", "com.example.app", 7);
    const [url, options] = mockFetch.mock.calls[0];
    expect(url).toBe(
      "https://deploygate.com/api/users/alice/platforms/android/apps/com.example.app/binaries/7/protect",
    );
    expect(options.method).toBe("DELETE");
  });

  it("searchAppRevisions sends q and v2 header", async () => {
    await client.searchAppRevisions("alice", "android", "com.example.app", { q: "v1.2" });
    const [url, options] = mockFetch.mock.calls[0];
    expect(url).toBe(
      "https://deploygate.com/api/users/alice/platforms/android/apps/com.example.app/binaries/search?q=v1.2",
    );
    expect(options.method).toBe("GET");
    expect(options.headers["X-DEPLOYGATE-API-VERSION"]).toBe("2");
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test -- client.test.ts -t "app detail & binaries"`
Expected: FAIL（`client.getApp is not a function` 等）。

- [ ] **Step 3: Implement client methods**

`src/client.ts` の `// --- App upload ---` の直前に追加:

```typescript
  // --- App detail & binaries (revisions) ---

  private appBase(owner: string, platform: string, appId: string): string {
    return `/api/users/${owner}/platforms/${platform}/apps/${appId}`;
  }

  async getApp(
    owner: string,
    platform: string,
    appId: string,
    options?: { revision?: number; key?: string },
  ): Promise<unknown> {
    const params = new URLSearchParams();
    if (options?.revision !== undefined)
      params.set("revision", String(options.revision));
    if (options?.key !== undefined) params.set("key", options.key);
    const qs = params.toString();
    return this.request(
      "GET",
      `${this.appBase(owner, platform, appId)}${qs ? `?${qs}` : ""}`,
    );
  }

  async listAppRevisions(
    owner: string,
    platform: string,
    appId: string,
    options?: { page?: number },
  ): Promise<unknown> {
    const params = new URLSearchParams();
    if (options?.page !== undefined) params.set("page", String(options.page));
    const qs = params.toString();
    return this.request(
      "GET",
      `${this.appBase(owner, platform, appId)}/binaries${qs ? `?${qs}` : ""}`,
    );
  }

  async getAppRevision(
    owner: string,
    platform: string,
    appId: string,
    revision: number,
  ): Promise<unknown> {
    return this.request(
      "GET",
      `${this.appBase(owner, platform, appId)}/binaries/${revision}`,
    );
  }

  async updateAppRevision(
    owner: string,
    platform: string,
    appId: string,
    revision: number,
    message: string,
  ): Promise<unknown> {
    return this.request(
      "PATCH",
      `${this.appBase(owner, platform, appId)}/binaries/${revision}`,
      {
        body: { message },
        headers: { "X-DEPLOYGATE-API-VERSION": "2" },
      },
    );
  }

  async deleteAppRevision(
    owner: string,
    platform: string,
    appId: string,
    revision: number,
  ): Promise<unknown> {
    return this.request(
      "DELETE",
      `${this.appBase(owner, platform, appId)}/binaries/${revision}`,
    );
  }

  async protectAppRevision(
    owner: string,
    platform: string,
    appId: string,
    revision: number,
  ): Promise<unknown> {
    return this.request(
      "POST",
      `${this.appBase(owner, platform, appId)}/binaries/${revision}/protect`,
    );
  }

  async unprotectAppRevision(
    owner: string,
    platform: string,
    appId: string,
    revision: number,
  ): Promise<unknown> {
    return this.request(
      "DELETE",
      `${this.appBase(owner, platform, appId)}/binaries/${revision}/protect`,
    );
  }

  async searchAppRevisions(
    owner: string,
    platform: string,
    appId: string,
    options: { q: string; page?: number; perPage?: number },
  ): Promise<unknown> {
    const params = new URLSearchParams();
    params.set("q", options.q);
    if (options.page !== undefined) params.set("paging[page]", String(options.page));
    if (options.perPage !== undefined)
      params.set("paging[per_page]", String(options.perPage));
    return this.request(
      "GET",
      `${this.appBase(owner, platform, appId)}/binaries/search?${params.toString()}`,
      { headers: { "X-DEPLOYGATE-API-VERSION": "2" } },
    );
  }
```

> 注: `appBase` は本 Task で導入し、以降の Task（app-members, keystores）でも再利用する。

- [ ] **Step 4: Run client tests to verify they pass**

Run: `npm test -- client.test.ts -t "app detail & binaries"` および Task 1 の `-t "merges extra headers"`
Expected: PASS（両方）。

- [ ] **Step 5: Create the tool module `src/tools/apps.ts`**

```typescript
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { DeployGateClient } from "../client.js";

const ownerArg = z.string().describe("Owner name (user or project)");
const platformArg = z.enum(["ios", "android"]).describe("App platform");
const appIdArg = z.string().describe("App ID (package name or bundle identifier)");

export function registerAppTools(
  server: McpServer,
  client: DeployGateClient,
): void {
  server.tool(
    "get_app",
    "Get details of an app, optionally for a specific revision.",
    {
      owner_name: ownerArg,
      platform: platformArg,
      app_id: appIdArg,
      revision: z.number().optional().describe("Specific revision to inspect"),
    },
    async (args) => {
      const results = await client.getApp(
        args.owner_name,
        args.platform,
        args.app_id,
        { revision: args.revision },
      );
      return { content: [{ type: "text", text: JSON.stringify(results, null, 2) }] };
    },
  );

  server.tool(
    "list_app_revisions",
    "List uploaded build revisions (binaries) of an app, newest first (50 per page). Only revisions within the storage retention period are returned; older auto-pruned builds are not listed.",
    {
      owner_name: ownerArg,
      platform: platformArg,
      app_id: appIdArg,
      page: z.number().optional().describe("Page number (default 1)"),
    },
    async (args) => {
      const results = await client.listAppRevisions(
        args.owner_name,
        args.platform,
        args.app_id,
        { page: args.page },
      );
      return { content: [{ type: "text", text: JSON.stringify(results, null, 2) }] };
    },
  );

  server.tool(
    "get_app_revision",
    "Get details of a specific build revision (binary) of an app. Returns 404 if the revision number does not exist.",
    {
      owner_name: ownerArg,
      platform: platformArg,
      app_id: appIdArg,
      revision: z.number().describe("Revision number"),
    },
    async (args) => {
      const results = await client.getAppRevision(
        args.owner_name,
        args.platform,
        args.app_id,
        args.revision,
      );
      return { content: [{ type: "text", text: JSON.stringify(results, null, 2) }] };
    },
  );

  server.tool(
    "update_app_revision",
    "Update the message (memo) of a build revision. Only the message can be changed.",
    {
      owner_name: ownerArg,
      platform: platformArg,
      app_id: appIdArg,
      revision: z.number().describe("Revision number"),
      message: z.string().describe("New message/memo for the revision"),
    },
    async (args) => {
      const results = await client.updateAppRevision(
        args.owner_name,
        args.platform,
        args.app_id,
        args.revision,
        args.message,
      );
      return { content: [{ type: "text", text: JSON.stringify(results, null, 2) }] };
    },
  );

  server.tool(
    "delete_app_revision",
    "Delete a build revision (binary). The API rejects deletion (HTTP 400) of: (1) the latest revision ('cannot delete the latest binary'), and (2) any protected revision ('cannot delete a protected binary'). A revision currently served by a distribution page is automatically protected and therefore cannot be deleted while in use — first repoint that distribution to another revision (update_distribution_revision) or delete the distribution page (delete_distribution / delete_distribution_by_name). Note: unprotect_app_revision only removes MANUAL protection, not a distribution's protection.",
    {
      owner_name: ownerArg,
      platform: platformArg,
      app_id: appIdArg,
      revision: z.number().describe("Revision number to delete"),
    },
    async (args) => {
      const results = await client.deleteAppRevision(
        args.owner_name,
        args.platform,
        args.app_id,
        args.revision,
      );
      return { content: [{ type: "text", text: JSON.stringify(results, null, 2) }] };
    },
  );

  server.tool(
    "protect_app_revision",
    "Add manual protection to a build revision so it is excluded from automatic deletion (retention pruning). Fails (403) if the app has reached its maximum number of protected revisions.",
    {
      owner_name: ownerArg,
      platform: platformArg,
      app_id: appIdArg,
      revision: z.number().describe("Revision number to protect"),
    },
    async (args) => {
      const results = await client.protectAppRevision(
        args.owner_name,
        args.platform,
        args.app_id,
        args.revision,
      );
      return { content: [{ type: "text", text: JSON.stringify(results, null, 2) }] };
    },
  );

  server.tool(
    "unprotect_app_revision",
    "Remove MANUAL deletion protection from a build revision (the protection added by protect_app_revision). This does NOT remove the automatic protection a revision gets while it is served by a distribution page — for that, repoint or delete the distribution.",
    {
      owner_name: ownerArg,
      platform: platformArg,
      app_id: appIdArg,
      revision: z.number().describe("Revision number to unprotect"),
    },
    async (args) => {
      const results = await client.unprotectAppRevision(
        args.owner_name,
        args.platform,
        args.app_id,
        args.revision,
      );
      return { content: [{ type: "text", text: JSON.stringify(results, null, 2) }] };
    },
  );

  server.tool(
    "search_app_revisions",
    "Search build revisions of an app by a query string. Only revisions within the storage retention period are searched.",
    {
      owner_name: ownerArg,
      platform: platformArg,
      app_id: appIdArg,
      q: z.string().describe("Search query"),
      page: z.number().optional().describe("Page number"),
      per_page: z.number().optional().describe("Items per page"),
    },
    async (args) => {
      const results = await client.searchAppRevisions(
        args.owner_name,
        args.platform,
        args.app_id,
        { q: args.q, page: args.page, perPage: args.per_page },
      );
      return { content: [{ type: "text", text: JSON.stringify(results, null, 2) }] };
    },
  );
}
```

- [ ] **Step 6: Add registration test**

`src/__tests__/tools.test.ts` の import に追加:

```typescript
import { registerAppTools } from "../tools/apps.js";
```

そして新しい `describe` を追加（`createToolCapture`, `createMockClient` は既存ヘルパ）:

```typescript
describe("registerAppTools", () => {
  it("registers all app/binary tools", () => {
    const { server, tools } = createToolCapture();
    registerAppTools(server, createMockClient() as unknown as DeployGateClient);
    for (const name of [
      "get_app",
      "list_app_revisions",
      "get_app_revision",
      "update_app_revision",
      "delete_app_revision",
      "protect_app_revision",
      "unprotect_app_revision",
      "search_app_revisions",
    ]) {
      expect(tools.has(name)).toBe(true);
    }
  });
});
```

`createMockClient()` に Task 2 のメソッドを追加（mock）。`createMockClient` の返却オブジェクトに以下を足す:

```typescript
    getApp: vi.fn(async () => ({})),
    listAppRevisions: vi.fn(async () => ([])),
    getAppRevision: vi.fn(async () => ({})),
    updateAppRevision: vi.fn(async () => ({})),
    deleteAppRevision: vi.fn(async () => ({})),
    protectAppRevision: vi.fn(async () => ({})),
    unprotectAppRevision: vi.fn(async () => ({})),
    searchAppRevisions: vi.fn(async () => ([])),
```

- [ ] **Step 7: Run the tool test**

Run: `npm test -- tools.test.ts -t "registerAppTools"`
Expected: PASS。

- [ ] **Step 8: Commit**

```bash
git add src/client.ts src/tools/apps.ts src/__tests__/client.test.ts src/__tests__/tools.test.ts
git commit -m "feat(tools): add app detail and revision management tools"
```

---

## Task 3: `app-members.ts` — アプリメンバー一覧 / 招待 / 削除

**Files:**
- Modify: `src/client.ts`
- Create: `src/tools/app-members.ts`
- Test: `src/__tests__/client.test.ts`, `src/__tests__/tools.test.ts`

- [ ] **Step 1: Write failing client tests**

```typescript
describe("app members", () => {
  beforeEach(() => {
    mockFetch.mockResolvedValue(mockResponse({ error: false, results: {} }));
  });

  it("listAppMembers GETs the members path", async () => {
    await client.listAppMembers("alice", "android", "com.example.app");
    const [url, options] = mockFetch.mock.calls[0];
    expect(url).toBe(
      "https://deploygate.com/api/users/alice/platforms/android/apps/com.example.app/members",
    );
    expect(options.method).toBe("GET");
  });

  it("inviteAppMembers POSTs users and role", async () => {
    await client.inviteAppMembers("alice", "android", "com.example.app", {
      users: "bob@example.com,carol",
      role: 1,
    });
    const [url, options] = mockFetch.mock.calls[0];
    expect(url).toBe(
      "https://deploygate.com/api/users/alice/platforms/android/apps/com.example.app/members",
    );
    expect(options.method).toBe("POST");
    expect(options.body).toContain("role=1");
    expect(options.body).toContain("users=bob%40example.com%2Ccarol");
  });

  it("removeAppMembers DELETEs with users body", async () => {
    await client.removeAppMembers("alice", "android", "com.example.app", "bob");
    const [url, options] = mockFetch.mock.calls[0];
    expect(url).toBe(
      "https://deploygate.com/api/users/alice/platforms/android/apps/com.example.app/members",
    );
    expect(options.method).toBe("DELETE");
    expect(options.body).toContain("users=bob");
  });
});
```

- [ ] **Step 2: Run to verify fail**

Run: `npm test -- client.test.ts -t "app members"`
Expected: FAIL（メソッド未定義）。

- [ ] **Step 3: Implement client methods**

`src/client.ts` の app detail メソッド群の後に追加:

```typescript
  // --- App members ---

  async listAppMembers(
    owner: string,
    platform: string,
    appId: string,
  ): Promise<unknown> {
    return this.request("GET", `${this.appBase(owner, platform, appId)}/members`);
  }

  async inviteAppMembers(
    owner: string,
    platform: string,
    appId: string,
    params: { users: string; role?: number },
  ): Promise<unknown> {
    return this.request("POST", `${this.appBase(owner, platform, appId)}/members`, {
      body: params as Record<string, unknown>,
    });
  }

  async removeAppMembers(
    owner: string,
    platform: string,
    appId: string,
    users: string,
  ): Promise<unknown> {
    return this.request("DELETE", `${this.appBase(owner, platform, appId)}/members`, {
      body: { users },
    });
  }
```

- [ ] **Step 4: Run client tests**

Run: `npm test -- client.test.ts -t "app members"`
Expected: PASS。

- [ ] **Step 5: Create `src/tools/app-members.ts`**

```typescript
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { DeployGateClient } from "../client.js";

const ownerArg = z.string().describe("Owner name (user or project)");
const platformArg = z.enum(["ios", "android"]).describe("App platform");
const appIdArg = z.string().describe("App ID (package name or bundle identifier)");

export function registerAppMemberTools(
  server: McpServer,
  client: DeployGateClient,
): void {
  server.tool(
    "list_app_members",
    "List members of an app with usage quota (used/max). For personal (user-owned) apps this lists individual collaborators; for project/workspace (Group) apps it also includes the teams attached to the app.",
    { owner_name: ownerArg, platform: platformArg, app_id: appIdArg },
    async (args) => {
      const results = await client.listAppMembers(
        args.owner_name,
        args.platform,
        args.app_id,
      );
      return { content: [{ type: "text", text: JSON.stringify(results, null, 2) }] };
    },
  );

  server.tool(
    "invite_app_members",
    "Invite one or more users directly to a PERSONAL (user-owned) app by email or username (comma-separated). role: 1=Developer (default), 2=ReadOnly, 3=DownloadOnly. NOTE: This does NOT work for apps owned by a workspace project (the API rejects it). To grant access to a workspace-project app, instead add the user to the workspace and project, then add them to a team that is attached to the app (or create a team, add the user, and attach the team to the app) — see the project/workspace tools.",
    {
      owner_name: ownerArg,
      platform: platformArg,
      app_id: appIdArg,
      users: z
        .string()
        .describe("Comma-separated emails or usernames to invite"),
      role: z
        .union([z.literal(1), z.literal(2), z.literal(3)])
        .optional()
        .describe("1=Developer (default), 2=ReadOnly, 3=DownloadOnly"),
    },
    async (args) => {
      const results = await client.inviteAppMembers(
        args.owner_name,
        args.platform,
        args.app_id,
        { users: args.users, role: args.role },
      );
      return { content: [{ type: "text", text: JSON.stringify(results, null, 2) }] };
    },
  );

  server.tool(
    "remove_app_members",
    "Remove one or more directly-invited members from a PERSONAL (user-owned) app by email or username (comma-separated). For workspace-project apps, access is managed via teams/projects, not direct app membership — remove the user from the relevant team or project instead.",
    {
      owner_name: ownerArg,
      platform: platformArg,
      app_id: appIdArg,
      users: z
        .string()
        .describe("Comma-separated emails or usernames to remove"),
    },
    async (args) => {
      const results = await client.removeAppMembers(
        args.owner_name,
        args.platform,
        args.app_id,
        args.users,
      );
      return { content: [{ type: "text", text: JSON.stringify(results, null, 2) }] };
    },
  );
}
```

- [ ] **Step 6: Add registration test + mock client methods**

`src/__tests__/tools.test.ts` の import に `import { registerAppMemberTools } from "../tools/app-members.js";` を追加。`createMockClient` に:

```typescript
    listAppMembers: vi.fn(async () => ({})),
    inviteAppMembers: vi.fn(async () => ({})),
    removeAppMembers: vi.fn(async () => ({})),
```

`describe` を追加:

```typescript
describe("registerAppMemberTools", () => {
  it("registers app member tools", () => {
    const { server, tools } = createToolCapture();
    registerAppMemberTools(server, createMockClient() as unknown as DeployGateClient);
    for (const name of ["list_app_members", "invite_app_members", "remove_app_members"]) {
      expect(tools.has(name)).toBe(true);
    }
  });
});
```

- [ ] **Step 7: Run tool test**

Run: `npm test -- tools.test.ts -t "registerAppMemberTools"`
Expected: PASS。

- [ ] **Step 8: Commit**

```bash
git add src/client.ts src/tools/app-members.ts src/__tests__/client.test.ts src/__tests__/tools.test.ts
git commit -m "feat(tools): add app member management tools"
```

---

## Task 4: `distributions.ts` 拡張 — 名前指定削除 / リビジョン差し替え / IP 制限

**Files:**
- Modify: `src/client.ts`（`updateDistribution` のシグネチャ拡張 + 2メソッド追加）
- Modify: `src/tools/distributions.ts`
- Test: `src/__tests__/client.test.ts`, `src/__tests__/tools.test.ts`

- [ ] **Step 1: Write failing client tests**

```typescript
describe("distribution extensions", () => {
  beforeEach(() => {
    mockFetch.mockResolvedValue(mockResponse({ error: false, results: {} }));
  });

  it("deleteDistributionByName DELETEs with distribution_name query", async () => {
    await client.deleteDistributionByName("alice", "android", "com.example.app", "QA build");
    const [url, options] = mockFetch.mock.calls[0];
    expect(url).toBe(
      "https://deploygate.com/api/users/alice/platforms/android/apps/com.example.app/distributions?distribution_name=QA+build",
    );
    expect(options.method).toBe("DELETE");
  });

  it("updateDistributionRevision POSTs revision to packages", async () => {
    await client.updateDistributionRevision("abcdef", { revision: 12, release_note: "hot" });
    const [url, options] = mockFetch.mock.calls[0];
    expect(url).toBe("https://deploygate.com/api/distributions/abcdef/packages");
    expect(options.method).toBe("POST");
    expect(options.body).toContain("revision=12");
    expect(options.body).toContain("release_note=hot");
  });

  it("updateDistribution forwards ip_restriction params", async () => {
    await client.updateDistribution("abcdef", {
      active: true,
      release_scope: "unlisted",
      ip_restriction_enable: true,
      ip_restriction: "10.0.0.0/24",
    });
    const [, options] = mockFetch.mock.calls[0];
    expect(options.body).toContain("ip_restriction_enable=true");
    expect(options.body).toContain("ip_restriction=10.0.0.0%2F24");
  });
});
```

- [ ] **Step 2: Run to verify fail**

Run: `npm test -- client.test.ts -t "distribution extensions"`
Expected: FAIL。

- [ ] **Step 3: Extend `updateDistribution` and add methods**

`src/client.ts` の `updateDistribution` の `params` 型を拡張（既存の型に2フィールド追加）:

```typescript
  async updateDistribution(
    accessKey: string,
    params: {
      title?: string;
      active: boolean;
      release_scope: string;
      passcode?: string;
      release_note?: string;
      ip_restriction_enable?: boolean;
      ip_restriction?: string;
    },
  ): Promise<unknown> {
    return this.request("PUT", `/api/distributions/${accessKey}`, {
      body: params as Record<string, unknown>,
    });
  }
```

`deleteDistribution` の直後に追加:

```typescript
  async deleteDistributionByName(
    owner: string,
    platform: string,
    appId: string,
    distributionName: string,
  ): Promise<unknown> {
    const qs = new URLSearchParams({ distribution_name: distributionName }).toString();
    return this.request(
      "DELETE",
      `/api/users/${owner}/platforms/${platform}/apps/${appId}/distributions?${qs}`,
    );
  }

  async updateDistributionRevision(
    accessKey: string,
    params: { revision: number; release_note?: string },
  ): Promise<unknown> {
    return this.request("POST", `/api/distributions/${accessKey}/packages`, {
      body: params as Record<string, unknown>,
    });
  }
```

- [ ] **Step 4: Run client tests**

Run: `npm test -- client.test.ts -t "distribution extensions"`
Expected: PASS。

- [ ] **Step 5: Add IP params to `update_distribution` tool + 2 new tools（既存 create_distribution の説明文も補強）**

加えて、Phase 1 で触れる distributions モジュール内の既存 `create_distribution` の `.tool(...)` 説明文末尾に「アプリの配布ページ数が上限に達している場合は 400（exceed the maximum number of distributions）。`revision` 省略時は最新ビルドを使用」を追記する（事前周知の一貫適用）。`list_distributions` / `get_distribution` / `delete_distribution` は現状の説明で十分。

`src/tools/distributions.ts` の `update_distribution` の schema に追加（`release_note` の後）:

```typescript
      ip_restriction_enable: z
        .boolean()
        .optional()
        .describe(
          "Enable IP address restriction. Only available for apps owned by a project/workspace (Group) and when the feature is enabled for that workspace; personal (user-owned) apps do not support this and the API will reject it.",
        ),
      ip_restriction: z
        .string()
        .optional()
        .describe("Comma-separated allowed IPs/CIDRs, e.g. '10.0.0.0/24,192.168.1.1'"),
```

あわせて `release_scope` の `.describe(...)` に次を追記する（owner 種別マトリクス参照）: 「`authorized_only` はプロジェクト/ワークスペース所有アプリかつプランが対応する場合のみ（個人アプリは public/unlisted/passcode のみ）。また、配布ページに既にテスターが居る状態では `authorized_only` へ変更できず 422 になる。`passcode` 選択時は `passcode` パラメータが必須。」

同ツールの `client.updateDistribution(...)` 呼び出しに2引数を追加:

```typescript
      const results = await client.updateDistribution(args.access_key, {
        title: args.title,
        active: args.active,
        release_scope: args.release_scope,
        passcode: args.passcode,
        release_note: args.release_note,
        ip_restriction_enable: args.ip_restriction_enable,
        ip_restriction: args.ip_restriction,
      });
```

`delete_distribution` ツールの後（`registerDistributionTools` の閉じ `}` の直前）に追加:

```typescript
  server.tool(
    "delete_distribution_by_name",
    "Delete a distribution page by its title (name) within an app. Returns 404 if no page matches the name, and 400 if more than one page shares the name (in that case delete by access_key with delete_distribution instead). Only the distribution page is removed; uploaded builds are preserved.",
    {
      owner_name: z.string().describe("Owner name (user or project)"),
      platform: z.enum(["ios", "android"]).describe("App platform"),
      app_id: z.string().describe("App ID (package name or bundle identifier)"),
      distribution_name: z.string().describe("Title of the distribution page to delete"),
    },
    async (args) => {
      const results = await client.deleteDistributionByName(
        args.owner_name,
        args.platform,
        args.app_id,
        args.distribution_name,
      );
      return { content: [{ type: "text", text: JSON.stringify(results, null, 2) }] };
    },
  );

  server.tool(
    "update_distribution_revision",
    "Change which build revision a distribution page serves. Returns 404 if the revision does not exist in the app. Requires app admin permission. Re-pointing moves the page's automatic protection to the new revision, which frees the previously-served revision for deletion.",
    {
      access_key: z.string().describe("Distribution page access_key (distribution_key)"),
      revision: z.number().describe("Revision number to assign to the distribution page"),
      release_note: z.string().optional().describe("Release note for this revision"),
    },
    async (args) => {
      const results = await client.updateDistributionRevision(args.access_key, {
        revision: args.revision,
        release_note: args.release_note,
      });
      return { content: [{ type: "text", text: JSON.stringify(results, null, 2) }] };
    },
  );
```

- [ ] **Step 6: Add registration test + mock client methods**

`src/__tests__/tools.test.ts` の `createMockClient` に追加:

```typescript
    deleteDistributionByName: vi.fn(async () => ({})),
    updateDistributionRevision: vi.fn(async () => ({})),
```

既存の distributions 登録テスト（`registerDistributionTools` を検証している describe）に2つの `expect(tools.has(...))` を追加するか、新規 describe を作成:

```typescript
describe("registerDistributionTools extensions", () => {
  it("registers delete-by-name and revision update tools", () => {
    const { server, tools } = createToolCapture();
    registerDistributionTools(server, createMockClient() as unknown as DeployGateClient);
    expect(tools.has("delete_distribution_by_name")).toBe(true);
    expect(tools.has("update_distribution_revision")).toBe(true);
  });
});
```

- [ ] **Step 7: Run tests**

Run: `npm test -- tools.test.ts -t "registerDistributionTools extensions"` と `npm test -- client.test.ts -t "distribution extensions"`
Expected: PASS。

- [ ] **Step 8: Commit**

```bash
git add src/client.ts src/tools/distributions.ts src/__tests__/client.test.ts src/__tests__/tools.test.ts
git commit -m "feat(tools): add distribution delete-by-name, revision swap, IP restriction"
```

---

## Task 5: `keystores.ts` — Android 署名鍵管理

**Files:**
- Modify: `src/client.ts`
- Create: `src/tools/keystores.ts`
- Test: `src/__tests__/client.test.ts`, `src/__tests__/tools.test.ts`

> パスは Android 固定（`platforms/android`）。ルートは `on: :collection` のためアクション名がパス末尾に付く。

- [ ] **Step 1: Write failing client tests**

```typescript
describe("keystores", () => {
  beforeEach(() => {
    mockFetch.mockResolvedValue(mockResponse({ error: false, results: {} }));
  });

  it("getKeystore GETs keystores/show", async () => {
    await client.getKeystore("alice", "com.example.app");
    const [url, options] = mockFetch.mock.calls[0];
    expect(url).toBe(
      "https://deploygate.com/api/users/alice/platforms/android/apps/com.example.app/keystores/show",
    );
    expect(options.method).toBe("GET");
  });

  it("createKeystore POSTs keystores/create", async () => {
    await client.createKeystore("alice", "com.example.app");
    const [url, options] = mockFetch.mock.calls[0];
    expect(url).toBe(
      "https://deploygate.com/api/users/alice/platforms/android/apps/com.example.app/keystores/create",
    );
    expect(options.method).toBe("POST");
  });

  it("deleteKeystore DELETEs keystores/destroy", async () => {
    await client.deleteKeystore("alice", "com.example.app");
    const [url, options] = mockFetch.mock.calls[0];
    expect(url).toBe(
      "https://deploygate.com/api/users/alice/platforms/android/apps/com.example.app/keystores/destroy",
    );
    expect(options.method).toBe("DELETE");
  });

  it("downloadKeystore GETs keystores/download", async () => {
    await client.downloadKeystore("alice", "com.example.app");
    const [url, options] = mockFetch.mock.calls[0];
    expect(url).toBe(
      "https://deploygate.com/api/users/alice/platforms/android/apps/com.example.app/keystores/download",
    );
    expect(options.method).toBe("GET");
  });

  it("updateKeystore PUTs multipart form-data", async () => {
    // Use a real temp file so readFile works
    const { writeFile, mkdtemp } = await import("node:fs/promises");
    const { tmpdir } = await import("node:os");
    const { join } = await import("node:path");
    const dir = await mkdtemp(join(tmpdir(), "ks-"));
    const file = join(dir, "release.keystore");
    await writeFile(file, "dummy");

    await client.updateKeystore("alice", "com.example.app", {
      filePath: file,
      aliasName: "release",
      keystorePassword: "pw1",
      keyPassword: "pw2",
    });
    const [url, options] = mockFetch.mock.calls[0];
    expect(url).toBe(
      "https://deploygate.com/api/users/alice/platforms/android/apps/com.example.app/keystores/update",
    );
    expect(options.method).toBe("PUT");
    expect(options.body).toBeInstanceOf(FormData);
  });
});
```

- [ ] **Step 2: Run to verify fail**

Run: `npm test -- client.test.ts -t "keystores"`
Expected: FAIL。

- [ ] **Step 3: Implement client methods**

`src/client.ts` に追加（`readFile`/`basename` は既存 import 済み）:

```typescript
  // --- Android keystores ---

  private keystoreBase(owner: string, appId: string): string {
    return `/api/users/${owner}/platforms/android/apps/${appId}/keystores`;
  }

  async getKeystore(owner: string, appId: string): Promise<unknown> {
    return this.request("GET", `${this.keystoreBase(owner, appId)}/show`);
  }

  async createKeystore(owner: string, appId: string): Promise<unknown> {
    return this.request("POST", `${this.keystoreBase(owner, appId)}/create`);
  }

  async deleteKeystore(owner: string, appId: string): Promise<unknown> {
    return this.request("DELETE", `${this.keystoreBase(owner, appId)}/destroy`);
  }

  async downloadKeystore(owner: string, appId: string): Promise<unknown> {
    return this.request("GET", `${this.keystoreBase(owner, appId)}/download`);
  }

  async updateKeystore(
    owner: string,
    appId: string,
    params: {
      filePath: string;
      aliasName: string;
      keystorePassword: string;
      keyPassword: string;
    },
  ): Promise<unknown> {
    const fileBuffer = await readFile(params.filePath);
    const fileName = basename(params.filePath);
    const formData = new FormData();
    formData.append("file", new Blob([fileBuffer]), fileName);
    formData.append("alias_name", params.aliasName);
    formData.append("keystore_password", params.keystorePassword);
    formData.append("key_password", params.keyPassword);
    return this.request("PUT", `${this.keystoreBase(owner, appId)}/update`, {
      formData,
    });
  }
```

- [ ] **Step 4: Run client tests**

Run: `npm test -- client.test.ts -t "keystores"`
Expected: PASS。

- [ ] **Step 5: Create `src/tools/keystores.ts`**

```typescript
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { DeployGateClient } from "../client.js";

const ownerArg = z.string().describe("Owner name (user or project)");
const appIdArg = z.string().describe("Android app ID (package name)");

export function registerKeystoreTools(
  server: McpServer,
  client: DeployGateClient,
): void {
  server.tool(
    "get_keystore",
    "Get the certificate fingerprints (md5/sha1/sha256/checksum) of an Android app's signing keystore. Android apps only. Returns 404 if the app has no keystore.",
    { owner_name: ownerArg, app_id: appIdArg },
    async (args) => {
      const results = await client.getKeystore(args.owner_name, args.app_id);
      return { content: [{ type: "text", text: JSON.stringify(results, null, 2) }] };
    },
  );

  server.tool(
    "create_keystore",
    "Generate a debug signing keystore for an Android app (commonly-used debug config: alias 'androiddebugkey', password 'android'). Android apps only; requires write permission. If the app already has a keystore this is a no-op that returns a message saying so (use update_keystore to replace).",
    { owner_name: ownerArg, app_id: appIdArg },
    async (args) => {
      const results = await client.createKeystore(args.owner_name, args.app_id);
      return { content: [{ type: "text", text: JSON.stringify(results, null, 2) }] };
    },
  );

  server.tool(
    "update_keystore",
    "Upload/replace an Android app's signing keystore from a local keystore file. Android apps only; requires write permission. Returns 400 if the keystore file or its credentials (alias/passwords) are invalid.",
    {
      owner_name: ownerArg,
      app_id: appIdArg,
      file_path: z.string().describe("Local path to the keystore file"),
      alias_name: z.string().describe("Key alias name"),
      keystore_password: z.string().describe("Keystore password"),
      key_password: z.string().describe("Key password"),
    },
    async (args) => {
      const results = await client.updateKeystore(args.owner_name, args.app_id, {
        filePath: args.file_path,
        aliasName: args.alias_name,
        keystorePassword: args.keystore_password,
        keyPassword: args.key_password,
      });
      return { content: [{ type: "text", text: JSON.stringify(results, null, 2) }] };
    },
  );

  server.tool(
    "delete_keystore",
    "Delete an Android app's signing keystore. Android apps only; requires write permission. Returns 404 if the app has no keystore.",
    { owner_name: ownerArg, app_id: appIdArg },
    async (args) => {
      const results = await client.deleteKeystore(args.owner_name, args.app_id);
      return { content: [{ type: "text", text: JSON.stringify(results, null, 2) }] };
    },
  );

  server.tool(
    "download_keystore",
    "Get a download URL and checksum for an Android app's signing keystore. Android apps only. Returns 404 if the app has no keystore.",
    { owner_name: ownerArg, app_id: appIdArg },
    async (args) => {
      const results = await client.downloadKeystore(args.owner_name, args.app_id);
      return { content: [{ type: "text", text: JSON.stringify(results, null, 2) }] };
    },
  );
}
```

- [ ] **Step 6: Add registration test + mock client methods**

`src/__tests__/tools.test.ts` の import に `import { registerKeystoreTools } from "../tools/keystores.js";` を追加。`createMockClient` に:

```typescript
    getKeystore: vi.fn(async () => ({})),
    createKeystore: vi.fn(async () => ({})),
    updateKeystore: vi.fn(async () => ({})),
    deleteKeystore: vi.fn(async () => ({})),
    downloadKeystore: vi.fn(async () => ({})),
```

`describe` を追加:

```typescript
describe("registerKeystoreTools", () => {
  it("registers keystore tools", () => {
    const { server, tools } = createToolCapture();
    registerKeystoreTools(server, createMockClient() as unknown as DeployGateClient);
    for (const name of [
      "get_keystore",
      "create_keystore",
      "update_keystore",
      "delete_keystore",
      "download_keystore",
    ]) {
      expect(tools.has(name)).toBe(true);
    }
  });
});
```

- [ ] **Step 7: Run tool test**

Run: `npm test -- tools.test.ts -t "registerKeystoreTools"`
Expected: PASS。

- [ ] **Step 8: Commit**

```bash
git add src/client.ts src/tools/keystores.ts src/__tests__/client.test.ts src/__tests__/tools.test.ts
git commit -m "feat(tools): add Android keystore management tools"
```

---

## Task 6: `users.ts` — ユーザー照会

**Files:**
- Modify: `src/client.ts`
- Create: `src/tools/users.ts`
- Test: `src/__tests__/client.test.ts`, `src/__tests__/tools.test.ts`

- [ ] **Step 1: Write failing client test**

```typescript
describe("user lookup", () => {
  it("getUser GETs the user path", async () => {
    mockFetch.mockResolvedValueOnce(mockResponse({ error: false, results: {} }));
    await client.getUser("alice");
    const [url, options] = mockFetch.mock.calls[0];
    expect(url).toBe("https://deploygate.com/api/users/alice");
    expect(options.method).toBe("GET");
  });
});
```

- [ ] **Step 2: Run to verify fail**

Run: `npm test -- client.test.ts -t "user lookup"`
Expected: FAIL。

- [ ] **Step 3: Implement client method**

`src/client.ts` の `getOrganizations` の近く（`// --- Auth / User info ---` セクション）に追加:

```typescript
  async getUser(id: string): Promise<unknown> {
    return this.request("GET", `/api/users/${id}`);
  }
```

- [ ] **Step 4: Run client test**

Run: `npm test -- client.test.ts -t "user lookup"`
Expected: PASS。

- [ ] **Step 5: Create `src/tools/users.ts`**

```typescript
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { DeployGateClient } from "../client.js";

export function registerUserTools(
  server: McpServer,
  client: DeployGateClient,
): void {
  server.tool(
    "get_user",
    "Look up a DeployGate user by username.",
    { username: z.string().describe("Username to look up") },
    async (args) => {
      const results = await client.getUser(args.username);
      return { content: [{ type: "text", text: JSON.stringify(results, null, 2) }] };
    },
  );
}
```

- [ ] **Step 6: Add registration test + mock method**

`src/__tests__/tools.test.ts` の import に `import { registerUserTools } from "../tools/users.js";`、`createMockClient` に `getUser: vi.fn(async () => ({})),`、describe:

```typescript
describe("registerUserTools", () => {
  it("registers get_user", () => {
    const { server, tools } = createToolCapture();
    registerUserTools(server, createMockClient() as unknown as DeployGateClient);
    expect(tools.has("get_user")).toBe(true);
  });
});
```

- [ ] **Step 7: Run tool test**

Run: `npm test -- tools.test.ts -t "registerUserTools"`
Expected: PASS。

- [ ] **Step 8: Commit**

```bash
git add src/client.ts src/tools/users.ts src/__tests__/client.test.ts src/__tests__/tools.test.ts
git commit -m "feat(tools): add user lookup tool"
```

---

## Task 7: 配線（index.ts）と最終検証

**Files:**
- Modify: `src/index.ts`
- Test: 全テスト

- [ ] **Step 1: Wire up new modules in `src/index.ts`**

import 群に追加:

```typescript
import { registerAppTools } from "./tools/apps.js";
import { registerAppMemberTools } from "./tools/app-members.js";
import { registerKeystoreTools } from "./tools/keystores.js";
import { registerUserTools } from "./tools/users.js";
```

登録呼び出し（`registerSharedTeamTools(server, client);` の後）に追加:

```typescript
registerAppTools(server, client);
registerAppMemberTools(server, client);
registerKeystoreTools(server, client);
registerUserTools(server, client);
```

- [ ] **Step 2: Type-check and full test**

Run: `npm run build && npm test`
Expected: tsc がエラーなく通り、全テスト PASS。

- [ ] **Step 3: Smoke-check the server boots**

Run: `node dist/index.js < /dev/null`
Expected: stdio MCP サーバが起動し（標準入力 EOF で）異常終了しない。エラーが出ないことを確認したら Ctrl-C 不要（即終了）。

- [ ] **Step 4: Commit**

```bash
git add src/index.ts
git commit -m "feat: register phase 1 app/distribution management tools"
```

---

## 完了条件

- 新規 19 ツール（get_app, list_app_revisions, get_app_revision, update_app_revision, delete_app_revision, protect_app_revision, unprotect_app_revision, search_app_revisions, list_app_members, invite_app_members, remove_app_members, delete_distribution_by_name, update_distribution_revision, get_keystore, create_keystore, update_keystore, delete_keystore, download_keystore, get_user）が登録される。
- `update_distribution` に IP 制限 2 パラメータが追加される。
- `npm run build && npm test` がすべて PASS。
- `plugin/scripts/bundle.js` は手動再生成しない（release-please が処理）。
