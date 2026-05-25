# DeployGate MCP Phase 2 (Projects/Organizations) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add 9 MCP tools for DeployGate project (organizations) management — project get/update/delete, list project apps/members, and app team/shared-team list/remove — plus extend `list_members` to arbitrary team names and fix the `sharedteams`→`shared_teams` path bug.

**Architecture:** Follow the established pattern: add typed methods to `DeployGateClient` (`src/client.ts`) that build the URL and delegate to the shared `request()` helper, then expose them as MCP tools via `register*Tools(server, client)` modules registered in `src/index.ts`. Project-level tools go in a new `src/tools/projects.ts`; app team/shared-team tools extend `src/tools/app-members.ts`. The client passes values through without pre-validation; API-enforced constraints surface as `DeployGateApiError`. Tool descriptions pre-announce preconditions and error semantics.

**Tech Stack:** TypeScript ESM (strict, Node16, `.js` import extensions), Zod schemas, Vitest (`vi.fn()` fetch mock), `@modelcontextprotocol/sdk`.

---

## File Structure

- `src/client.ts` (modify) — fix 2 buggy paths; make `request()` tolerate empty-body responses; add `orgAppBase()` helper + 9 new methods.
- `src/tools/projects.ts` (create) — `registerProjectTools` with 5 project-level tools.
- `src/tools/app-members.ts` (modify) — add 4 app team/shared-team tools.
- `src/tools/members.ts` (modify) — widen `list_members` `team` param from enum to string.
- `src/index.ts` (modify) — import + register `registerProjectTools`.
- `src/__tests__/client.test.ts` (modify) — fix 2 path assertions; add empty-body test; add tests for 9 new methods.
- `src/__tests__/tools.test.ts` (modify) — add 9 method mocks to `createMockClient`; add `registerProjectTools` registration test; extend app-members registration test; add `list_members` custom-team test.

---

## Task 1: Fix the `sharedteams` → `shared_teams` path bug

**Files:**
- Modify: `src/client.ts` (`createSharedTeam`, `assignSharedTeamToApp`)
- Test: `src/__tests__/client.test.ts` (existing assertions ~line 783, ~line 817)

- [ ] **Step 1: Update the failing-path assertions in the tests**

In `src/__tests__/client.test.ts`, change the two URL assertions from `sharedteams` to `shared_teams`:

The `createSharedTeam` test currently asserts:
```ts
expect(url).toBe(
  "https://deploygate.com/api/enterprises/my-workspace/sharedteams",
);
```
Change to:
```ts
expect(url).toBe(
  "https://deploygate.com/api/enterprises/my-workspace/shared_teams",
);
```

The `assignSharedTeamToApp` test currently asserts:
```ts
expect(url).toBe(
  "https://deploygate.com/api/organizations/my-project/platforms/android/apps/com.example.app/sharedteams",
);
```
Change to:
```ts
expect(url).toBe(
  "https://deploygate.com/api/organizations/my-project/platforms/android/apps/com.example.app/shared_teams",
);
```

- [ ] **Step 2: Run the tests to verify they now fail**

Run: `npm test -- client.test.ts`
Expected: FAIL — the two shared-team tests fail because the client still produces `sharedteams`.

- [ ] **Step 3: Fix the client paths**

In `src/client.ts`, `createSharedTeam`:
```ts
  async createSharedTeam(workspace: string, name: string): Promise<unknown> {
    return this.request("POST", `/api/enterprises/${workspace}/shared_teams`, {
      body: { name },
    });
  }
```

In `src/client.ts`, `assignSharedTeamToApp` (change the path segment only):
```ts
    return this.request(
      "POST",
      `/api/organizations/${project}/platforms/${platform}/apps/${appId}/shared_teams`,
      { body: { team } },
    );
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npm test -- client.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/client.ts src/__tests__/client.test.ts
git -c user.email=yuki@deploygate.com commit -m "$(cat <<'EOF'
fix(client): correct shared_teams API path (was sharedteams)

createSharedTeam and assignSharedTeamToApp used `sharedteams` (no
underscore). The API uses `shared_teams` consistently. Live-verify in the
final task.

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
EOF
)"
```

---

## Task 2: Make `request()` tolerate empty-body responses

The app-team DELETE endpoints (`Api::Organizations::Apps::TeamsBase#destroy`/`#create`) return empty bodies (`head :created` / no explicit render). `request()` currently calls `await response.json()` unconditionally, which throws on an empty body. Guard it.

**Files:**
- Modify: `src/client.ts` (`request()` method, ~lines 113-120)
- Test: `src/__tests__/client.test.ts`

- [ ] **Step 1: Write the failing test**

Add this test inside the top-level `describe("DeployGateClient", ...)` block in `src/__tests__/client.test.ts` (e.g. right after the `token management` describe). It targets the existing `deleteDistribution` method so this task is self-contained:

```ts
  describe("empty-body responses", () => {
    it("returns {} when the response has no JSON body (e.g. 201 head)", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 201,
        json: () => Promise.reject(new SyntaxError("Unexpected end of JSON input")),
      });
      const result = await client.deleteDistribution("abc123");
      expect(result).toEqual({});
    });

    it("returns null for a 204 No Content response", async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 204,
        json: () => Promise.reject(new SyntaxError("Unexpected end of JSON input")),
      });
      const result = await client.deleteDistribution("abc123");
      expect(result).toBeNull();
    });
  });
```

- [ ] **Step 2: Run to verify it fails**

Run: `npm test -- client.test.ts`
Expected: FAIL — `request()` rejects with the SyntaxError instead of returning `{}`/`null`.

- [ ] **Step 3: Update `request()` to guard the JSON parse**

In `src/client.ts`, replace the body-parsing section of `request()`:

```ts
    const response = await fetch(url, fetchOptions);
    const data = (await response.json()) as Record<string, unknown>;

    if (data.error) {
      throw new DeployGateApiError(data as unknown as DeployGateErrorDetail);
    }

    return (data.results ?? data) as T;
```

with:

```ts
    const response = await fetch(url, fetchOptions);
    if (response.status === 204) {
      return null as T;
    }
    const data = (await response
      .json()
      .catch(() => ({}))) as Record<string, unknown>;

    if (data.error) {
      throw new DeployGateApiError(data as unknown as DeployGateErrorDetail);
    }

    return (data.results ?? data) as T;
```

- [ ] **Step 4: Run to verify it passes**

Run: `npm test -- client.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/client.ts src/__tests__/client.test.ts
git -c user.email=yuki@deploygate.com commit -m "$(cat <<'EOF'
fix(client): tolerate empty-body responses in request()

App-team DELETE/create endpoints return empty bodies (head :created).
request() now returns null for 204 and {} when json() fails to parse,
instead of throwing.

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
EOF
)"
```

---

## Task 3: Add project-level client methods

**Files:**
- Modify: `src/client.ts` (add 5 methods near the existing `getUser`/`getOrganizations` section)
- Test: `src/__tests__/client.test.ts`

- [ ] **Step 1: Write the failing tests**

Add this describe block inside `describe("DeployGateClient", ...)` in `src/__tests__/client.test.ts`:

```ts
  describe("projects (organizations)", () => {
    beforeEach(() => {
      mockFetch.mockResolvedValue(mockResponse({ error: false, results: {} }));
    });

    it("getProject GETs the organization", async () => {
      await client.getProject("my-project");
      const [url, options] = mockFetch.mock.calls[0];
      expect(url).toBe("https://deploygate.com/api/organizations/my-project");
      expect(options.method).toBe("GET");
    });

    it("updateProject PATCHes display_name and description", async () => {
      await client.updateProject("my-project", {
        display_name: "My Project",
        description: "hello",
      });
      const [url, options] = mockFetch.mock.calls[0];
      expect(url).toBe("https://deploygate.com/api/organizations/my-project");
      expect(options.method).toBe("PATCH");
      expect(options.body).toContain("display_name=My+Project");
      expect(options.body).toContain("description=hello");
    });

    it("updateProject omits undefined fields", async () => {
      await client.updateProject("my-project", { description: "only desc" });
      const [, options] = mockFetch.mock.calls[0];
      expect(options.body).toBe("description=only+desc");
    });

    it("deleteProject DELETEs the organization", async () => {
      await client.deleteProject("my-project");
      const [url, options] = mockFetch.mock.calls[0];
      expect(url).toBe("https://deploygate.com/api/organizations/my-project");
      expect(options.method).toBe("DELETE");
    });

    it("listProjectApps GETs the apps path", async () => {
      await client.listProjectApps("my-project");
      const [url, options] = mockFetch.mock.calls[0];
      expect(url).toBe("https://deploygate.com/api/organizations/my-project/apps");
      expect(options.method).toBe("GET");
    });

    it("listProjectMembers GETs the members path", async () => {
      await client.listProjectMembers("my-project");
      const [url, options] = mockFetch.mock.calls[0];
      expect(url).toBe("https://deploygate.com/api/organizations/my-project/members");
      expect(options.method).toBe("GET");
    });
  });
```

- [ ] **Step 2: Run to verify it fails**

Run: `npm test -- client.test.ts`
Expected: FAIL — methods `getProject`/`updateProject`/`deleteProject`/`listProjectApps`/`listProjectMembers` do not exist (TS compile error).

- [ ] **Step 3: Implement the methods**

In `src/client.ts`, add a `// --- Projects (organizations) ---` section (place it right after the existing `getOrganizations`/`getUser` methods, before `// --- Device auth code flow ---`):

```ts
  // --- Projects (organizations) ---

  async getProject(project: string): Promise<unknown> {
    return this.request("GET", `/api/organizations/${project}`);
  }

  async updateProject(
    project: string,
    params: { display_name?: string; description?: string },
  ): Promise<unknown> {
    return this.request("PATCH", `/api/organizations/${project}`, {
      body: params as Record<string, unknown>,
    });
  }

  async deleteProject(project: string): Promise<unknown> {
    return this.request("DELETE", `/api/organizations/${project}`);
  }

  async listProjectApps(project: string): Promise<unknown> {
    return this.request("GET", `/api/organizations/${project}/apps`);
  }

  async listProjectMembers(project: string): Promise<unknown> {
    return this.request("GET", `/api/organizations/${project}/members`);
  }
```

- [ ] **Step 4: Run to verify it passes**

Run: `npm test -- client.test.ts`
Expected: PASS (this also makes Task 2's empty-body tests pass).

- [ ] **Step 5: Commit**

```bash
git add src/client.ts src/__tests__/client.test.ts
git -c user.email=yuki@deploygate.com commit -m "$(cat <<'EOF'
feat(client): add project (organizations) methods

getProject, updateProject (display_name/description), deleteProject,
listProjectApps, listProjectMembers.

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
EOF
)"
```

---

## Task 4: Add app team / shared-team client methods

**Files:**
- Modify: `src/client.ts` (add `orgAppBase()` helper + 4 methods)
- Test: `src/__tests__/client.test.ts`

- [ ] **Step 1: Write the failing tests**

Add this describe block inside `describe("DeployGateClient", ...)`:

```ts
  describe("app teams", () => {
    beforeEach(() => {
      mockFetch.mockResolvedValue(mockResponse({ error: false, results: {} }));
    });

    it("listAppTeams GETs the teams path", async () => {
      await client.listAppTeams("my-project", "android", "com.example.app");
      const [url, options] = mockFetch.mock.calls[0];
      expect(url).toBe(
        "https://deploygate.com/api/organizations/my-project/platforms/android/apps/com.example.app/teams",
      );
      expect(options.method).toBe("GET");
    });

    it("removeAppTeam DELETEs the team", async () => {
      await client.removeAppTeam("my-project", "android", "com.example.app", "qa");
      const [url, options] = mockFetch.mock.calls[0];
      expect(url).toBe(
        "https://deploygate.com/api/organizations/my-project/platforms/android/apps/com.example.app/teams/qa",
      );
      expect(options.method).toBe("DELETE");
    });

    it("removeAppTeam URL-encodes the team name", async () => {
      await client.removeAppTeam("my-project", "android", "com.example.app", "all staff");
      const [url] = mockFetch.mock.calls[0];
      expect(url).toBe(
        "https://deploygate.com/api/organizations/my-project/platforms/android/apps/com.example.app/teams/all%20staff",
      );
    });

    it("listAppSharedTeams GETs the shared_teams path", async () => {
      await client.listAppSharedTeams("my-project", "android", "com.example.app");
      const [url, options] = mockFetch.mock.calls[0];
      expect(url).toBe(
        "https://deploygate.com/api/organizations/my-project/platforms/android/apps/com.example.app/shared_teams",
      );
      expect(options.method).toBe("GET");
    });

    it("removeAppSharedTeam DELETEs the shared team", async () => {
      await client.removeAppSharedTeam("my-project", "android", "com.example.app", "all staff");
      const [url, options] = mockFetch.mock.calls[0];
      expect(url).toBe(
        "https://deploygate.com/api/organizations/my-project/platforms/android/apps/com.example.app/shared_teams/all%20staff",
      );
      expect(options.method).toBe("DELETE");
    });
  });
```

- [ ] **Step 2: Run to verify it fails**

Run: `npm test -- client.test.ts`
Expected: FAIL — the four methods do not exist (TS compile error).

- [ ] **Step 3: Implement the helper and methods**

In `src/client.ts`, add an `// --- App teams (organizations) ---` section after the shared-teams methods (after `assignSharedTeamToApp`, before `// --- Android keystores ---`):

```ts
  // --- App teams (organizations) ---

  private orgAppBase(project: string, platform: string, appId: string): string {
    return `/api/organizations/${project}/platforms/${platform}/apps/${appId}`;
  }

  async listAppTeams(
    project: string,
    platform: string,
    appId: string,
  ): Promise<unknown> {
    return this.request("GET", `${this.orgAppBase(project, platform, appId)}/teams`);
  }

  async removeAppTeam(
    project: string,
    platform: string,
    appId: string,
    team: string,
  ): Promise<unknown> {
    return this.request(
      "DELETE",
      `${this.orgAppBase(project, platform, appId)}/teams/${encodeURIComponent(team)}`,
    );
  }

  async listAppSharedTeams(
    project: string,
    platform: string,
    appId: string,
  ): Promise<unknown> {
    return this.request(
      "GET",
      `${this.orgAppBase(project, platform, appId)}/shared_teams`,
    );
  }

  async removeAppSharedTeam(
    project: string,
    platform: string,
    appId: string,
    team: string,
  ): Promise<unknown> {
    return this.request(
      "DELETE",
      `${this.orgAppBase(project, platform, appId)}/shared_teams/${encodeURIComponent(team)}`,
    );
  }
```

- [ ] **Step 4: Run to verify it passes**

Run: `npm test -- client.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/client.ts src/__tests__/client.test.ts
git -c user.email=yuki@deploygate.com commit -m "$(cat <<'EOF'
feat(client): add app team / shared-team methods

listAppTeams, removeAppTeam, listAppSharedTeams, removeAppSharedTeam
under /api/organizations/:project/.../apps/:app_id. Team names are
URL-encoded.

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
EOF
)"
```

---

## Task 5: Create `projects.ts` tool module (5 tools)

**Files:**
- Create: `src/tools/projects.ts`
- Modify: `src/index.ts`
- Test: `src/__tests__/tools.test.ts`

- [ ] **Step 1: Write the failing registration test**

In `src/__tests__/tools.test.ts`:

(a) Add the import near the other tool imports (after line 12):
```ts
import { registerProjectTools } from "../tools/projects.js";
```

(b) Add these mocks to the object returned by `createMockClient()` (alongside the other `vi.fn` entries):
```ts
    getProject: vi.fn(async () => ({})),
    updateProject: vi.fn(async () => ({})),
    deleteProject: vi.fn(async () => ({})),
    listProjectApps: vi.fn(async () => ([])),
    listProjectMembers: vi.fn(async () => ([])),
```

(c) Add a describe block (e.g. after `describe("registerUserTools", ...)`):
```ts
describe("registerProjectTools", () => {
  it("registers project tools", () => {
    const { server, tools } = createToolCapture();
    registerProjectTools(server, createMockClient() as unknown as DeployGateClient);
    for (const name of [
      "get_project",
      "update_project",
      "delete_project",
      "list_project_apps",
      "list_project_members",
    ]) {
      expect(tools.has(name)).toBe(true);
    }
  });

  it("update_project passes display_name and description through", async () => {
    const { server, tools } = createToolCapture();
    const client = createMockClient();
    registerProjectTools(server, client as unknown as DeployGateClient);
    const handler = tools.get("update_project")!.handler;
    await handler({ project: "p", display_name: "D", description: "x" });
    expect(client.updateProject).toHaveBeenCalledWith("p", {
      display_name: "D",
      description: "x",
    });
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npm test -- tools.test.ts`
Expected: FAIL — cannot import `../tools/projects.js` (module does not exist).

- [ ] **Step 3: Create `src/tools/projects.ts`**

```ts
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { DeployGateClient } from "../client.js";

const projectArg = z.string().describe("Project (organization) name");

export function registerProjectTools(
  server: McpServer,
  client: DeployGateClient,
): void {
  server.tool(
    "get_project",
    "Get a project (organization)'s details (id, name, description). Returns 403 if your API token lacks access to the project, or 401 if the project's plan has expired.",
    { project: projectArg },
    async (args) => {
      const results = await client.getProject(args.project);
      return { content: [{ type: "text", text: JSON.stringify(results, null, 2) }] };
    },
  );

  server.tool(
    "update_project",
    "Update a project (organization)'s display name and/or description. Provide at least one of display_name or description. Returns 400 on validation failure, or 403 if you lack permission on the project.",
    {
      project: projectArg,
      display_name: z
        .string()
        .optional()
        .describe("New display name for the project"),
      description: z
        .string()
        .optional()
        .describe("New description for the project"),
    },
    async (args) => {
      const results = await client.updateProject(args.project, {
        display_name: args.display_name,
        description: args.description,
      });
      return { content: [{ type: "text", text: JSON.stringify(results, null, 2) }] };
    },
  );

  server.tool(
    "delete_project",
    "Delete a project (organization). DESTRUCTIVE and irreversible: removes the project and disables all of its pending invitations. Returns 403 if you lack permission, or 422 if deletion fails.",
    { project: projectArg },
    async (args) => {
      const results = await client.deleteProject(args.project);
      return { content: [{ type: "text", text: JSON.stringify(results, null, 2) }] };
    },
  );

  server.tool(
    "list_project_apps",
    "List the apps in a project (organization) that are visible to your API token. Returns 403 if you lack access to the project.",
    { project: projectArg },
    async (args) => {
      const results = await client.listProjectApps(args.project);
      return { content: [{ type: "text", text: JSON.stringify(results, null, 2) }] };
    },
  );

  server.tool(
    "list_project_members",
    "List all users that belong to a project (organization). Returns 403 if you lack permission on the project. (To list members of a single team, use list_members.)",
    { project: projectArg },
    async (args) => {
      const results = await client.listProjectMembers(args.project);
      return { content: [{ type: "text", text: JSON.stringify(results, null, 2) }] };
    },
  );
}
```

- [ ] **Step 4: Register in `src/index.ts`**

Add the import after the other `registerXTools` imports:
```ts
import { registerProjectTools } from "./tools/projects.js";
```
Add the registration call (e.g. after `registerUserTools(server, client);`):
```ts
registerProjectTools(server, client);
```

- [ ] **Step 5: Run to verify it passes**

Run: `npm test -- tools.test.ts`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add src/tools/projects.ts src/index.ts src/__tests__/tools.test.ts
git -c user.email=yuki@deploygate.com commit -m "$(cat <<'EOF'
feat(tools): add project (organizations) management tools

get_project, update_project, delete_project, list_project_apps,
list_project_members. Registered in index.ts.

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
EOF
)"
```

---

## Task 6: Extend `app-members.ts` with app team / shared-team tools (4 tools)

**Files:**
- Modify: `src/tools/app-members.ts`
- Test: `src/__tests__/tools.test.ts`

- [ ] **Step 1: Write the failing test**

In `src/__tests__/tools.test.ts`:

(a) Add these mocks to `createMockClient()`:
```ts
    listAppTeams: vi.fn(async () => ([])),
    removeAppTeam: vi.fn(async () => ({})),
    listAppSharedTeams: vi.fn(async () => ([])),
    removeAppSharedTeam: vi.fn(async () => ({})),
```

(b) Replace the existing `registerAppMemberTools` describe block with one that checks all five tools:
```ts
describe("registerAppMemberTools", () => {
  it("registers app member and team tools", () => {
    const { server, tools } = createToolCapture();
    registerAppMemberTools(server, createMockClient() as unknown as DeployGateClient);
    for (const name of [
      "list_app_members",
      "list_app_teams",
      "remove_app_team",
      "list_app_shared_teams",
      "remove_app_shared_team",
    ]) {
      expect(tools.has(name)).toBe(true);
    }
  });

  it("remove_app_team passes team name through", async () => {
    const { server, tools } = createToolCapture();
    const client = createMockClient();
    registerAppMemberTools(server, client as unknown as DeployGateClient);
    const handler = tools.get("remove_app_team")!.handler;
    await handler({ owner_name: "p", platform: "android", app_id: "com.example.app", team: "qa" });
    expect(client.removeAppTeam).toHaveBeenCalledWith("p", "android", "com.example.app", "qa");
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npm test -- tools.test.ts`
Expected: FAIL — `list_app_teams` etc. are not registered.

- [ ] **Step 3: Add the 4 tools to `src/tools/app-members.ts`**

Insert these `server.tool(...)` blocks inside `registerAppMemberTools`, after the existing `list_app_members` block (before the closing `}` of the function):

```ts
  server.tool(
    "list_app_teams",
    "List the regular (non-shared) teams attached to an app in a project. owner_name is the project (organization) name. Returns 403 if your API token lacks permission on the app.",
    { owner_name: ownerArg, platform: platformArg, app_id: appIdArg },
    async (args) => {
      const results = await client.listAppTeams(
        args.owner_name,
        args.platform,
        args.app_id,
      );
      return { content: [{ type: "text", text: JSON.stringify(results, null, 2) }] };
    },
  );

  server.tool(
    "remove_app_team",
    "Detach a team from an app; the team's members lose access granted via that team. owner_name is the project name, team is the team name. DESTRUCTIVE. The owner team cannot be detached (403). Returns 400 if the team is not attached to the app.",
    {
      owner_name: ownerArg,
      platform: platformArg,
      app_id: appIdArg,
      team: z.string().describe("Team name to detach from the app"),
    },
    async (args) => {
      const results = await client.removeAppTeam(
        args.owner_name,
        args.platform,
        args.app_id,
        args.team,
      );
      return { content: [{ type: "text", text: JSON.stringify(results, null, 2) }] };
    },
  );

  server.tool(
    "list_app_shared_teams",
    "List the workspace shared teams attached to an app. Only valid for apps in an Enterprise (workspace) organization — returns 400 otherwise. owner_name is the project name. Returns 403 if you lack permission.",
    { owner_name: ownerArg, platform: platformArg, app_id: appIdArg },
    async (args) => {
      const results = await client.listAppSharedTeams(
        args.owner_name,
        args.platform,
        args.app_id,
      );
      return { content: [{ type: "text", text: JSON.stringify(results, null, 2) }] };
    },
  );

  server.tool(
    "remove_app_shared_team",
    "Detach a workspace shared team from an app. Only valid for apps in an Enterprise (workspace) organization — returns 400 otherwise. DESTRUCTIVE. The owner team cannot be detached (403). Returns 400 if the shared team is not attached.",
    {
      owner_name: ownerArg,
      platform: platformArg,
      app_id: appIdArg,
      team: z.string().describe("Shared team name to detach from the app"),
    },
    async (args) => {
      const results = await client.removeAppSharedTeam(
        args.owner_name,
        args.platform,
        args.app_id,
        args.team,
      );
      return { content: [{ type: "text", text: JSON.stringify(results, null, 2) }] };
    },
  );
```

- [ ] **Step 4: Run to verify it passes**

Run: `npm test -- tools.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/tools/app-members.ts src/__tests__/tools.test.ts
git -c user.email=yuki@deploygate.com commit -m "$(cat <<'EOF'
feat(tools): add app team / shared-team management tools

list_app_teams, remove_app_team, list_app_shared_teams,
remove_app_shared_team in app-members.ts. Shared-team tools are
Enterprise-org only (pre-announced in descriptions).

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
EOF
)"
```

---

## Task 7: Widen `list_members` to accept custom team names

**Files:**
- Modify: `src/tools/members.ts` (the `list_members` tool)
- Test: `src/__tests__/tools.test.ts`

- [ ] **Step 1: Write the failing test**

Add to `src/__tests__/tools.test.ts` (in or near the existing members-tools describe block):

```ts
  it("list_members accepts a custom (non-enum) team name", async () => {
    const { server, tools } = createToolCapture();
    const client = createMockClient();
    registerMemberTools(server, client);
    const handler = tools.get("list_members")!.handler;
    await handler({ project: "my-project", team: "qa-custom" });
    expect(client.listTeamMembers).toHaveBeenCalledWith("my-project", "qa-custom");
  });
```

> The current enum schema (`owner`/`developer`/`tester`) is only enforced by the MCP runtime, not by `createToolCapture` (which ignores the schema), so this test passes against the handler even before the change. It documents the intended behavior; the real change is the schema/description in Step 3. To make the test meaningful as a guard, also assert the registered description mentions custom teams (added below).

Add a second assertion test:
```ts
  it("list_members description mentions custom team names", () => {
    const { server, tools } = createToolCapture();
    registerMemberTools(server, createMockClient());
    expect(tools.get("list_members")!.description.toLowerCase()).toContain("custom");
  });
```

- [ ] **Step 2: Run to verify the description test fails**

Run: `npm test -- tools.test.ts`
Expected: FAIL on "description mentions custom team names" (current description is "List members of a specific team in a project.").

- [ ] **Step 3: Update the `list_members` tool**

In `src/tools/members.ts`, change the `list_members` registration's description and `team` schema:

```ts
  server.tool(
    "list_members",
    "List members of a specific team in a project. Use a built-in team name ('owner', 'developer', or 'tester') or any custom team name defined in the project.",
    {
      project: z.string().describe("Project (organization) name"),
      team: z
        .string()
        .describe(
          "Team name: 'owner', 'developer', 'tester', or a custom team name",
        ),
    },
    async (args) => {
      const results = await client.listTeamMembers(args.project, args.team);
      return {
        content: [{ type: "text", text: JSON.stringify(results, null, 2) }],
      };
    },
  );
```

- [ ] **Step 4: Run to verify it passes**

Run: `npm test -- tools.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/tools/members.ts src/__tests__/tools.test.ts
git -c user.email=yuki@deploygate.com commit -m "$(cat <<'EOF'
feat(tools): allow list_members to query custom team names

Widen the team param from the owner/developer/tester enum to a free
string so custom project teams can be listed. Folds in the roadmap's
planned list_team_members tool.

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
EOF
)"
```

---

## Task 8: Full build + live verification

**Files:** none (verification only)

- [ ] **Step 1: Full build and test**

Run: `npm run build && npm test`
Expected: tsc clean, all tests PASS.

- [ ] **Step 2: Live-verify against the real API**

Use the disposable app and project. Drive the MCP server over stdio (newline-delimited JSON-RPC: `initialize` → `notifications/initialized` → `tools/call`). Live API calls require `dangerouslyDisableSandbox: true` (apex `deploygate.com` is not in the `*.deploygate.com` allowlist).

Verify the read-only/path-fix tools first (non-destructive):
- `get_project` on `tnj_group`
- `list_project_apps` on `tnj_group`
- `list_project_members` on `tnj_group`
- `list_members` with team `developer` (built-in) and any custom team if one exists
- `list_app_teams` on `tnj_group / android / sh.nothing.unitytest`
- `list_app_shared_teams` on the same app (confirm Enterprise-only 400 behavior if `tnj_group` is not Enterprise — the error message is the expected pre-announced outcome)
- Confirm the `shared_teams` path fix: `assign_shared_team_to_app` / `create_shared_team` reach the API (no HTML 404), even if they return a domain error.

Destructive tools (`update_project`, `delete_project`, `remove_app_team`, `remove_app_shared_team`) — only run against disposable resources and only with explicit user confirmation. Confirm `remove_app_team` returns cleanly given the empty-body handling from Task 2.

- [ ] **Step 3: Report results and fix any path/parameter drift**

If any endpoint path or parameter differs from what was implemented (cf. the Phase 1 keystore lesson where routes.rb differed from production), fix the client method + its test, re-run `npm test`, and commit a `fix(client): correct ... (live-verified)` commit.

- [ ] **Step 4: Update the project memory**

Update `~/.claude/projects/-Users-tnj-git-deploygate-agent-plugin/memory/deploygate-public-api-full-coverage-project.md` status line to mark Phase 2 done (tool count, branch state), and note any live-verification findings.

---

## Completion criteria

- 9 new tools registered: `get_project`, `update_project`, `delete_project`, `list_project_apps`, `list_project_members`, `list_app_teams`, `remove_app_team`, `list_app_shared_teams`, `remove_app_shared_team`.
- `list_members` accepts an arbitrary team name and its description mentions custom teams.
- `createSharedTeam` / `assignSharedTeamToApp` use `shared_teams`, live-verified.
- `request()` tolerates empty-body responses (204 → null, empty → {}).
- `npm run build && npm test` all PASS.
- `plugin/scripts/bundle.js` NOT manually regenerated (release-please handles it).
