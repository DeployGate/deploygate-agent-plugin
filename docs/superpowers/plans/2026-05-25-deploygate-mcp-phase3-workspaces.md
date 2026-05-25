# DeployGate MCP Phase 3 (Workspaces/Enterprises) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add 17 MCP tools for DeployGate workspace (enterprises) management — workspace members + member invitation requests, projects + project members, shared-team list/delete/members, and SAML certificate update.

**Architecture:** Follow the established pattern: add typed methods to `DeployGateClient` (`src/client.ts`) that build the URL and delegate to the shared `request()` helper (multipart goes through the `formData` path like `updateKeystore`), then expose them as MCP tools via `register*Tools(server, client)` modules registered in `src/index.ts`. The client passes values through without pre-validation; API-enforced constraints surface as `DeployGateApiError`. Tool descriptions pre-announce token-type/admin/plan constraints and error semantics.

**Tech Stack:** TypeScript ESM (strict, Node16, `.js` import extensions), Zod schemas, Vitest (`vi.fn()` fetch mock), `@modelcontextprotocol/sdk`.

---

## File Structure

- `src/client.ts` (modify) — extend `addWorkspaceMember`; add 11 new methods (workspace members read, projects, shared-team list/delete, invitation requests, SAML).
- `src/tools/workspace-members.ts` (create) — `registerWorkspaceMemberTools`, 7 tools.
- `src/tools/workspace-projects.ts` (create) — `registerWorkspaceProjectTools`, 5 tools.
- `src/tools/shared-teams.ts` (modify) — add 4 tools to existing `registerSharedTeamTools`.
- `src/tools/workspace-saml.ts` (create) — `registerWorkspaceSamlTools`, 1 tool.
- `src/index.ts` (modify) — import + register the 3 new modules.
- `src/__tests__/client.test.ts` (modify) — tests for new/extended methods.
- `src/__tests__/tools.test.ts` (modify) — mocks + registration/pass-through tests.

**Notes for all tasks:** commit email is `yuki@deploygate.com`; every commit ends with the `Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>` trailer (use the `git -c user.email=yuki@deploygate.com commit` heredoc form shown). Do NOT run `npm run bundle` or modify/commit `plugin/scripts/bundle.js` (pre-commit hook blocks it). Leave the untracked `.claude/` directory alone. `readFile` and `basename` are already imported at the top of `src/client.ts`.

---

## Task 1: Client — workspace member methods

**Files:**
- Modify: `src/client.ts` (`// --- Workspace member management ---` section, ~line 535)
- Test: `src/__tests__/client.test.ts`

- [ ] **Step 1: Write the failing tests**

Add this describe block inside `describe("DeployGateClient", ...)` in `src/__tests__/client.test.ts`:

```ts
  describe("workspace members", () => {
    beforeEach(() => {
      mockFetch.mockResolvedValue(mockResponse({ error: false, results: {} }));
    });

    it("listWorkspaceMembers GETs the users path", async () => {
      await client.listWorkspaceMembers("ws1");
      const [url, options] = mockFetch.mock.calls[0];
      expect(url).toBe("https://deploygate.com/api/enterprises/ws1/users");
      expect(options.method).toBe("GET");
    });

    it("getWorkspaceMember GETs and encodes the id", async () => {
      await client.getWorkspaceMember("ws1", "a@b.com");
      const [url, options] = mockFetch.mock.calls[0];
      expect(url).toBe("https://deploygate.com/api/enterprises/ws1/users/a%40b.com");
      expect(options.method).toBe("GET");
    });

    it("addWorkspaceMember POSTs just the user when no options", async () => {
      await client.addWorkspaceMember("ws1", "alice");
      const [url, options] = mockFetch.mock.calls[0];
      expect(url).toBe("https://deploygate.com/api/enterprises/ws1/users");
      expect(options.method).toBe("POST");
      expect(options.body).toBe("user=alice");
    });

    it("addWorkspaceMember POSTs full_name and role when provided", async () => {
      await client.addWorkspaceMember("ws1", "a@b.com", { full_name: "A B", role: "guest" });
      const [, options] = mockFetch.mock.calls[0];
      expect(options.body).toContain("user=a%40b.com");
      expect(options.body).toContain("full_name=A+B");
      expect(options.body).toContain("role=guest");
    });
  });
```

- [ ] **Step 2: Run to verify it fails**

Run: `npm test -- client.test.ts`
Expected: FAIL — `listWorkspaceMembers`/`getWorkspaceMember` do not exist; `addWorkspaceMember` does not accept options.

- [ ] **Step 3: Implement**

In `src/client.ts`, replace the existing `addWorkspaceMember` method and add the two read methods. The current method is:

```ts
  async addWorkspaceMember(workspace: string, user: string): Promise<unknown> {
    return this.request("POST", `/api/enterprises/${workspace}/users`, {
      body: { user },
    });
  }
```

Replace it with:

```ts
  async listWorkspaceMembers(workspace: string): Promise<unknown> {
    return this.request("GET", `/api/enterprises/${workspace}/users`);
  }

  async getWorkspaceMember(workspace: string, id: string): Promise<unknown> {
    return this.request(
      "GET",
      `/api/enterprises/${workspace}/users/${encodeURIComponent(id)}`,
    );
  }

  async addWorkspaceMember(
    workspace: string,
    user: string,
    options?: { full_name?: string; role?: string },
  ): Promise<unknown> {
    return this.request("POST", `/api/enterprises/${workspace}/users`, {
      body: { user, ...options },
    });
  }
```

> `request()` form-encodes the body and skips `undefined`/`null`, so `{ user, ...undefined }` (no options) sends only `user=...`.

- [ ] **Step 4: Run to verify it passes**

Run: `npm test -- client.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/client.ts src/__tests__/client.test.ts
git -c user.email=yuki@deploygate.com commit -m "$(cat <<'EOF'
feat(client): add workspace member read methods, extend addWorkspaceMember

listWorkspaceMembers, getWorkspaceMember (id URL-encoded), and
addWorkspaceMember now accepts optional full_name/role (backward
compatible — add_member orchestration still calls it with user only).

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
EOF
)"
```

---

## Task 2: Client — workspace project methods

**Files:**
- Modify: `src/client.ts` (`// --- Project member management ---` section, ~line 553)
- Test: `src/__tests__/client.test.ts`

- [ ] **Step 1: Write the failing tests**

Add this describe block inside `describe("DeployGateClient", ...)`:

```ts
  describe("workspace projects", () => {
    beforeEach(() => {
      mockFetch.mockResolvedValue(mockResponse({ error: false, results: {} }));
    });

    it("listWorkspaceProjects GETs the organizations path", async () => {
      await client.listWorkspaceProjects("ws1");
      const [url, options] = mockFetch.mock.calls[0];
      expect(url).toBe("https://deploygate.com/api/enterprises/ws1/organizations");
      expect(options.method).toBe("GET");
    });

    it("createProject POSTs name and owner", async () => {
      await client.createProject("ws1", {
        owner_name_or_email: "alice",
        name: "new-proj",
        display_name: "New Proj",
        description: "hi",
      });
      const [url, options] = mockFetch.mock.calls[0];
      expect(url).toBe("https://deploygate.com/api/enterprises/ws1/organizations");
      expect(options.method).toBe("POST");
      expect(options.body).toContain("owner_name_or_email=alice");
      expect(options.body).toContain("name=new-proj");
      expect(options.body).toContain("display_name=New+Proj");
      expect(options.body).toContain("description=hi");
    });

    it("createProject omits undefined optional fields", async () => {
      await client.createProject("ws1", { owner_name_or_email: "alice", name: "p" });
      const [, options] = mockFetch.mock.calls[0];
      expect(options.body).toBe("owner_name_or_email=alice&name=p");
    });

    it("listWorkspaceProjectMembers GETs the nested users path", async () => {
      await client.listWorkspaceProjectMembers("ws1", "proj1");
      const [url, options] = mockFetch.mock.calls[0];
      expect(url).toBe(
        "https://deploygate.com/api/enterprises/ws1/organizations/proj1/users",
      );
      expect(options.method).toBe("GET");
    });
  });
```

- [ ] **Step 2: Run to verify it fails**

Run: `npm test -- client.test.ts`
Expected: FAIL — the three methods do not exist.

- [ ] **Step 3: Implement**

In `src/client.ts`, in the `// --- Project member management ---` section (right after the existing `removeProjectMember` method), add:

```ts
  async listWorkspaceProjects(workspace: string): Promise<unknown> {
    return this.request("GET", `/api/enterprises/${workspace}/organizations`);
  }

  async createProject(
    workspace: string,
    params: {
      owner_name_or_email: string;
      name: string;
      display_name?: string;
      description?: string;
    },
  ): Promise<unknown> {
    return this.request("POST", `/api/enterprises/${workspace}/organizations`, {
      body: params as Record<string, unknown>,
    });
  }

  async listWorkspaceProjectMembers(
    workspace: string,
    project: string,
  ): Promise<unknown> {
    return this.request(
      "GET",
      `/api/enterprises/${workspace}/organizations/${project}/users`,
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
feat(client): add workspace project methods

listWorkspaceProjects, createProject (owner_name_or_email/name +
optional display_name/description), listWorkspaceProjectMembers.

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
EOF
)"
```

---

## Task 3: Client — workspace shared-team list/delete

**Files:**
- Modify: `src/client.ts` (`// --- Shared teams ---` section, near `createSharedTeam`)
- Test: `src/__tests__/client.test.ts`

- [ ] **Step 1: Write the failing tests**

Add this describe block inside `describe("DeployGateClient", ...)`:

```ts
  describe("workspace shared teams", () => {
    beforeEach(() => {
      mockFetch.mockResolvedValue(mockResponse({ error: false, results: {} }));
    });

    it("listSharedTeams GETs the shared_teams path", async () => {
      await client.listSharedTeams("ws1");
      const [url, options] = mockFetch.mock.calls[0];
      expect(url).toBe("https://deploygate.com/api/enterprises/ws1/shared_teams");
      expect(options.method).toBe("GET");
    });

    it("deleteSharedTeam DELETEs and encodes the team name", async () => {
      await client.deleteSharedTeam("ws1", "all staff");
      const [url, options] = mockFetch.mock.calls[0];
      expect(url).toBe(
        "https://deploygate.com/api/enterprises/ws1/shared_teams/all%20staff",
      );
      expect(options.method).toBe("DELETE");
    });
  });
```

- [ ] **Step 2: Run to verify it fails**

Run: `npm test -- client.test.ts`
Expected: FAIL — `listSharedTeams`/`deleteSharedTeam` do not exist.

- [ ] **Step 3: Implement**

In `src/client.ts`, in the `// --- Shared teams ---` section (right after the existing `createSharedTeam` method), add:

```ts
  async listSharedTeams(workspace: string): Promise<unknown> {
    return this.request("GET", `/api/enterprises/${workspace}/shared_teams`);
  }

  async deleteSharedTeam(workspace: string, team: string): Promise<unknown> {
    return this.request(
      "DELETE",
      `/api/enterprises/${workspace}/shared_teams/${encodeURIComponent(team)}`,
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
feat(client): add listSharedTeams and deleteSharedTeam

GET/DELETE /api/enterprises/:ws/shared_teams; team name URL-encoded.

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
EOF
)"
```

---

## Task 4: Client — member invitation request methods

**Files:**
- Modify: `src/client.ts` (add a `// --- Member invitation requests ---` section after the shared-teams methods)
- Test: `src/__tests__/client.test.ts`

- [ ] **Step 1: Write the failing tests**

Add this describe block inside `describe("DeployGateClient", ...)`:

```ts
  describe("member invitation requests", () => {
    beforeEach(() => {
      mockFetch.mockResolvedValue(mockResponse({ error: false, results: {} }));
    });

    it("getMemberInvitationRequest GETs the request", async () => {
      await client.getMemberInvitationRequest("ws1", "req-7");
      const [url, options] = mockFetch.mock.calls[0];
      expect(url).toBe(
        "https://deploygate.com/api/enterprises/ws1/member_invitation_requests/req-7",
      );
      expect(options.method).toBe("GET");
    });

    it("approveMemberInvitationRequest POSTs to approve", async () => {
      await client.approveMemberInvitationRequest("ws1", "req-7");
      const [url, options] = mockFetch.mock.calls[0];
      expect(url).toBe(
        "https://deploygate.com/api/enterprises/ws1/member_invitation_requests/req-7/approve",
      );
      expect(options.method).toBe("POST");
    });

    it("rejectMemberInvitationRequest POSTs reason to reject", async () => {
      await client.rejectMemberInvitationRequest("ws1", "req-7", "not allowed");
      const [url, options] = mockFetch.mock.calls[0];
      expect(url).toBe(
        "https://deploygate.com/api/enterprises/ws1/member_invitation_requests/req-7/reject",
      );
      expect(options.method).toBe("POST");
      expect(options.body).toBe("reason=not+allowed");
    });

    it("rejectMemberInvitationRequest omits reason when not given", async () => {
      await client.rejectMemberInvitationRequest("ws1", "req-7");
      const [, options] = mockFetch.mock.calls[0];
      expect(options.body).toBe("");
    });
  });
```

- [ ] **Step 2: Run to verify it fails**

Run: `npm test -- client.test.ts`
Expected: FAIL — the three methods do not exist.

- [ ] **Step 3: Implement**

In `src/client.ts`, add a new section after the shared-teams methods (after `deleteSharedTeam` from Task 3, before `// --- App teams (organizations) ---`):

```ts
  // --- Member invitation requests ---

  async getMemberInvitationRequest(
    workspace: string,
    id: string,
  ): Promise<unknown> {
    return this.request(
      "GET",
      `/api/enterprises/${workspace}/member_invitation_requests/${encodeURIComponent(id)}`,
    );
  }

  async approveMemberInvitationRequest(
    workspace: string,
    id: string,
  ): Promise<unknown> {
    return this.request(
      "POST",
      `/api/enterprises/${workspace}/member_invitation_requests/${encodeURIComponent(id)}/approve`,
    );
  }

  async rejectMemberInvitationRequest(
    workspace: string,
    id: string,
    reason?: string,
  ): Promise<unknown> {
    return this.request(
      "POST",
      `/api/enterprises/${workspace}/member_invitation_requests/${encodeURIComponent(id)}/reject`,
      { body: { reason } },
    );
  }
```

> `reject` always passes `{ body: { reason } }`; when `reason` is undefined, `request()` skips it and the form body is empty (`""`). `approve` passes no body.

- [ ] **Step 4: Run to verify it passes**

Run: `npm test -- client.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/client.ts src/__tests__/client.test.ts
git -c user.email=yuki@deploygate.com commit -m "$(cat <<'EOF'
feat(client): add member invitation request methods

getMemberInvitationRequest, approveMemberInvitationRequest,
rejectMemberInvitationRequest (optional reason).

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
EOF
)"
```

---

## Task 5: Client — updateSamlCertificate (multipart)

**Files:**
- Modify: `src/client.ts` (add after the member invitation request methods)
- Test: `src/__tests__/client.test.ts`

- [ ] **Step 1: Write the failing test**

Add this describe block inside `describe("DeployGateClient", ...)`. It writes a real temp file and passes its path — the same approach the existing `updateKeystore` test uses (no `readFile` mocking):

```ts
  describe("SAML certificate", () => {
    beforeEach(() => {
      mockFetch.mockResolvedValue(mockResponse({ error: false, results: {} }));
    });

    it("updateSamlCertificate PUTs idp_cert as multipart form data", async () => {
      const { writeFile, mkdtemp } = await import("node:fs/promises");
      const { tmpdir } = await import("node:os");
      const { join } = await import("node:path");
      const dir = await mkdtemp(join(tmpdir(), "saml-"));
      const file = join(dir, "idp.pem");
      await writeFile(file, "CERTDATA");

      await client.updateSamlCertificate("ws1", file);

      const [url, options] = mockFetch.mock.calls[0];
      expect(url).toBe(
        "https://deploygate.com/api/enterprises/ws1/saml_settings/update_certificate",
      );
      expect(options.method).toBe("PUT");
      expect(options.body).toBeInstanceOf(FormData);
      expect((options.body as FormData).has("idp_cert")).toBe(true);
    });
  });
```

- [ ] **Step 2: Run to verify it fails**

Run: `npm test -- client.test.ts`
Expected: FAIL — `updateSamlCertificate` does not exist.

- [ ] **Step 3: Implement**

In `src/client.ts`, add after the member invitation request methods:

```ts
  // --- Workspace SAML settings ---

  async updateSamlCertificate(
    workspace: string,
    filePath: string,
  ): Promise<unknown> {
    const fileBuffer = await readFile(filePath);
    const fileName = basename(filePath);
    const formData = new FormData();
    formData.append("idp_cert", new Blob([fileBuffer]), fileName);
    return this.request(
      "PUT",
      `/api/enterprises/${workspace}/saml_settings/update_certificate`,
      { formData },
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
feat(client): add updateSamlCertificate (multipart idp_cert upload)

PUT /api/enterprises/:ws/saml_settings/update_certificate; reads the
cert file and uploads it as the idp_cert form field.

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
EOF
)"
```

---

## Task 6: Tool module — workspace-members.ts (7 tools)

**Files:**
- Create: `src/tools/workspace-members.ts`
- Modify: `src/index.ts`
- Test: `src/__tests__/tools.test.ts`

- [ ] **Step 1: Write the failing test**

In `src/__tests__/tools.test.ts`:

(a) Add the import after the other tool imports:
```ts
import { registerWorkspaceMemberTools } from "../tools/workspace-members.js";
```

(b) Add these mocks to `createMockClient()`:
```ts
    listWorkspaceMembers: vi.fn(async () => ([])),
    getWorkspaceMember: vi.fn(async () => ({})),
    removeWorkspaceMember: vi.fn(async () => ({})),
    getMemberInvitationRequest: vi.fn(async () => ({})),
    approveMemberInvitationRequest: vi.fn(async () => ({})),
    rejectMemberInvitationRequest: vi.fn(async () => ({})),
```
> `addWorkspaceMember` is already present in `createMockClient()` (used by add_member tests) — do not duplicate it.

(c) Add a describe block:
```ts
describe("registerWorkspaceMemberTools", () => {
  it("registers workspace member tools", () => {
    const { server, tools } = createToolCapture();
    registerWorkspaceMemberTools(server, createMockClient() as unknown as DeployGateClient);
    for (const name of [
      "list_workspace_members",
      "get_workspace_member",
      "add_workspace_member",
      "remove_workspace_member",
      "get_member_invitation_request",
      "approve_member_invitation_request",
      "reject_member_invitation_request",
    ]) {
      expect(tools.has(name)).toBe(true);
    }
  });

  it("add_workspace_member forwards full_name and role", async () => {
    const { server, tools } = createToolCapture();
    const client = createMockClient();
    registerWorkspaceMemberTools(server, client as unknown as DeployGateClient);
    const handler = tools.get("add_workspace_member")!.handler;
    await handler({ workspace: "ws", user: "a@b.com", full_name: "A B", role: "guest" });
    expect(client.addWorkspaceMember).toHaveBeenCalledWith("ws", "a@b.com", {
      full_name: "A B",
      role: "guest",
    });
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npm test -- tools.test.ts`
Expected: FAIL — cannot import `../tools/workspace-members.js`.

- [ ] **Step 3: Create `src/tools/workspace-members.ts`**

```ts
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { DeployGateClient } from "../client.js";

const workspaceArg = z.string().describe("Workspace (enterprise) name");

export function registerWorkspaceMemberTools(
  server: McpServer,
  client: DeployGateClient,
): void {
  server.tool(
    "list_workspace_members",
    "List all members of a workspace (enterprise). Requires workspace management permission (403/404 otherwise).",
    { workspace: workspaceArg },
    async (args) => {
      const results = await client.listWorkspaceMembers(args.workspace);
      return { content: [{ type: "text", text: JSON.stringify(results, null, 2) }] };
    },
  );

  server.tool(
    "get_workspace_member",
    "Get a single workspace (enterprise) member by name or email (must be at least 3 characters). Returns 400 if no matching member is found.",
    { workspace: workspaceArg, id: z.string().describe("Member name or email") },
    async (args) => {
      const results = await client.getWorkspaceMember(args.workspace, args.id);
      return { content: [{ type: "text", text: JSON.stringify(results, null, 2) }] };
    },
  );

  server.tool(
    "add_workspace_member",
    "Invite/add a member to a workspace (enterprise). Requires a USER API token (not a workspace token). Set role='guest' for a guest member. Returns 400 if already a member, 403 if you lack invite permission or the plan's member seats are exceeded; SSO/flexible workspaces require an email address.",
    {
      workspace: workspaceArg,
      user: z.string().describe("User email or username to add"),
      full_name: z.string().optional().describe("Optional full name for the invitee"),
      role: z.string().optional().describe("Optional role; use 'guest' to invite a guest member"),
    },
    async (args) => {
      const results = await client.addWorkspaceMember(args.workspace, args.user, {
        full_name: args.full_name,
        role: args.role,
      });
      return { content: [{ type: "text", text: JSON.stringify(results, null, 2) }] };
    },
  );

  server.tool(
    "remove_workspace_member",
    "Remove a member from a workspace (enterprise) entirely. Requires a USER API token. DESTRUCTIVE. You cannot remove yourself (403); a non-member returns 400.",
    { workspace: workspaceArg, user: z.string().describe("Member name or email to remove") },
    async (args) => {
      const results = await client.removeWorkspaceMember(args.workspace, args.user);
      return { content: [{ type: "text", text: JSON.stringify(results, null, 2) }] };
    },
  );

  server.tool(
    "get_member_invitation_request",
    "Get the status of a workspace member invitation request by its display id. Requires a USER API token with member-management permission. Returns 404 if not found.",
    { workspace: workspaceArg, id: z.string().describe("Invitation request display id") },
    async (args) => {
      const results = await client.getMemberInvitationRequest(args.workspace, args.id);
      return { content: [{ type: "text", text: JSON.stringify(results, null, 2) }] };
    },
  );

  server.tool(
    "approve_member_invitation_request",
    "Approve a pending workspace member invitation request. Requires a USER API token with member-management permission. Only pending requests can be approved (400); returns 403 if member seats are exceeded, 422 if the requester already belongs to a workspace.",
    { workspace: workspaceArg, id: z.string().describe("Invitation request display id") },
    async (args) => {
      const results = await client.approveMemberInvitationRequest(args.workspace, args.id);
      return { content: [{ type: "text", text: JSON.stringify(results, null, 2) }] };
    },
  );

  server.tool(
    "reject_member_invitation_request",
    "Reject a pending workspace member invitation request, optionally with a reason. Requires a USER API token with member-management permission. Only pending requests can be rejected (400).",
    {
      workspace: workspaceArg,
      id: z.string().describe("Invitation request display id"),
      reason: z.string().optional().describe("Optional reason for rejection"),
    },
    async (args) => {
      const results = await client.rejectMemberInvitationRequest(
        args.workspace,
        args.id,
        args.reason,
      );
      return { content: [{ type: "text", text: JSON.stringify(results, null, 2) }] };
    },
  );
}
```

- [ ] **Step 4: Register in `src/index.ts`**

Add the import after the other `registerXTools` imports:
```ts
import { registerWorkspaceMemberTools } from "./tools/workspace-members.js";
```
Add the registration call (after `registerProjectTools(server, client);`):
```ts
registerWorkspaceMemberTools(server, client);
```

- [ ] **Step 5: Run to verify it passes**

Run: `npm test -- tools.test.ts`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add src/tools/workspace-members.ts src/index.ts src/__tests__/tools.test.ts
git -c user.email=yuki@deploygate.com commit -m "$(cat <<'EOF'
feat(tools): add workspace member + invitation request tools

list/get/add/remove workspace members and get/approve/reject member
invitation requests (workspace-members.ts). Registered in index.ts.

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
EOF
)"
```

---

## Task 7: Tool module — workspace-projects.ts (5 tools)

**Files:**
- Create: `src/tools/workspace-projects.ts`
- Modify: `src/index.ts`
- Test: `src/__tests__/tools.test.ts`

- [ ] **Step 1: Write the failing test**

In `src/__tests__/tools.test.ts`:

(a) Add the import:
```ts
import { registerWorkspaceProjectTools } from "../tools/workspace-projects.js";
```

(b) Add these mocks to `createMockClient()`:
```ts
    listWorkspaceProjects: vi.fn(async () => ([])),
    createProject: vi.fn(async () => ({})),
    listWorkspaceProjectMembers: vi.fn(async () => ([])),
```
> `addProjectMember` and `removeProjectMember` are already present in `createMockClient()` — do not duplicate them.

(c) Add a describe block:
```ts
describe("registerWorkspaceProjectTools", () => {
  it("registers workspace project tools", () => {
    const { server, tools } = createToolCapture();
    registerWorkspaceProjectTools(server, createMockClient() as unknown as DeployGateClient);
    for (const name of [
      "list_workspace_projects",
      "create_project",
      "list_workspace_project_members",
      "add_project_member",
      "remove_project_member",
    ]) {
      expect(tools.has(name)).toBe(true);
    }
  });

  it("create_project forwards params", async () => {
    const { server, tools } = createToolCapture();
    const client = createMockClient();
    registerWorkspaceProjectTools(server, client as unknown as DeployGateClient);
    const handler = tools.get("create_project")!.handler;
    await handler({ workspace: "ws", owner_name_or_email: "alice", name: "p", display_name: "P", description: "d" });
    expect(client.createProject).toHaveBeenCalledWith("ws", {
      owner_name_or_email: "alice",
      name: "p",
      display_name: "P",
      description: "d",
    });
  });

  it("remove_project_member forwards args", async () => {
    const { server, tools } = createToolCapture();
    const client = createMockClient();
    registerWorkspaceProjectTools(server, client as unknown as DeployGateClient);
    const handler = tools.get("remove_project_member")!.handler;
    await handler({ workspace: "ws", project: "p", user: "bob" });
    expect(client.removeProjectMember).toHaveBeenCalledWith("ws", "p", "bob");
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npm test -- tools.test.ts`
Expected: FAIL — cannot import `../tools/workspace-projects.js`.

- [ ] **Step 3: Create `src/tools/workspace-projects.ts`**

```ts
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { DeployGateClient } from "../client.js";

const workspaceArg = z.string().describe("Workspace (enterprise) name");
const projectArg = z.string().describe("Project (organization) name");

export function registerWorkspaceProjectTools(
  server: McpServer,
  client: DeployGateClient,
): void {
  server.tool(
    "list_workspace_projects",
    "List the projects (organizations) under a workspace (enterprise). Requires workspace management permission.",
    { workspace: workspaceArg },
    async (args) => {
      const results = await client.listWorkspaceProjects(args.workspace);
      return { content: [{ type: "text", text: JSON.stringify(results, null, 2) }] };
    },
  );

  server.tool(
    "create_project",
    "Create a new project (organization) in a workspace (enterprise). Requires a USER API token. 'name' must be 3-28 chars (letters/digits/hyphens/underscores, starting and ending with a letter or digit) and GLOBALLY unique (400 if already in use). 'owner_name_or_email' must be an existing workspace member (404 otherwise). 403 if the plan's project limit is exceeded. display_name defaults to name.",
    {
      workspace: workspaceArg,
      owner_name_or_email: z.string().describe("Workspace member to set as the project owner (username or email)"),
      name: z.string().describe("Project name (3-28 chars, globally unique)"),
      display_name: z.string().optional().describe("Optional display name (defaults to name)"),
      description: z.string().optional().describe("Optional description"),
    },
    async (args) => {
      const results = await client.createProject(args.workspace, {
        owner_name_or_email: args.owner_name_or_email,
        name: args.name,
        display_name: args.display_name,
        description: args.description,
      });
      return { content: [{ type: "text", text: JSON.stringify(results, null, 2) }] };
    },
  );

  server.tool(
    "list_workspace_project_members",
    "List the members of a project (organization) within a workspace. Returns 401/403 if you lack permission.",
    { workspace: workspaceArg, project: projectArg },
    async (args) => {
      const results = await client.listWorkspaceProjectMembers(args.workspace, args.project);
      return { content: [{ type: "text", text: JSON.stringify(results, null, 2) }] };
    },
  );

  server.tool(
    "add_project_member",
    "Add a workspace member to a project (organization) as a direct project member. The user must already be a workspace member (401 otherwise); 403 if you lack permission. This is the project-level membership; to add to a specific team use add_member.",
    {
      workspace: workspaceArg,
      project: projectArg,
      user: z.string().describe("Workspace member to add (username or email)"),
    },
    async (args) => {
      const results = await client.addProjectMember(args.workspace, args.project, args.user);
      return { content: [{ type: "text", text: JSON.stringify(results, null, 2) }] };
    },
  );

  server.tool(
    "remove_project_member",
    "Remove a member from a project (organization). DESTRUCTIVE. Returns 403 if the user is not a project member or you lack permission. This removes project-level membership; to remove from a single team use remove_member.",
    {
      workspace: workspaceArg,
      project: projectArg,
      user: z.string().describe("Member to remove (username or email)"),
    },
    async (args) => {
      const results = await client.removeProjectMember(args.workspace, args.project, args.user);
      return { content: [{ type: "text", text: JSON.stringify(results, null, 2) }] };
    },
  );
}
```

- [ ] **Step 4: Register in `src/index.ts`**

Add the import:
```ts
import { registerWorkspaceProjectTools } from "./tools/workspace-projects.js";
```
Add the registration call (after `registerWorkspaceMemberTools(server, client);`):
```ts
registerWorkspaceProjectTools(server, client);
```

- [ ] **Step 5: Run to verify it passes**

Run: `npm test -- tools.test.ts`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add src/tools/workspace-projects.ts src/index.ts src/__tests__/tools.test.ts
git -c user.email=yuki@deploygate.com commit -m "$(cat <<'EOF'
feat(tools): add workspace project management tools

list_workspace_projects, create_project, list_workspace_project_members,
add_project_member, remove_project_member (workspace-projects.ts).

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
EOF
)"
```

---

## Task 8: Extend shared-teams.ts (4 tools)

**Files:**
- Modify: `src/tools/shared-teams.ts`
- Test: `src/__tests__/tools.test.ts`

- [ ] **Step 1: Write the failing test**

In `src/__tests__/tools.test.ts`:

(a) Add these mocks to `createMockClient()`:
```ts
    listSharedTeams: vi.fn(async () => ([])),
    deleteSharedTeam: vi.fn(async () => ({})),
    listSharedTeamMembers: vi.fn(async () => ([])),
    removeSharedTeamMember: vi.fn(async () => ({})),
```
> Some of these (`listSharedTeamMembers`, `removeSharedTeamMember`) may already exist in `createMockClient()` from earlier phases — if a key is already present, do not add a duplicate; ensure each is defined exactly once.

(b) Find the existing `describe("registerSharedTeamTools", ...)` (or equivalent) block and add an assertion that the new tools register. If the existing block only checks the original 3 tools, replace its name list with the full set:
```ts
describe("registerSharedTeamTools", () => {
  it("registers shared team tools", () => {
    const { server, tools } = createToolCapture();
    registerSharedTeamTools(server, createMockClient() as unknown as DeployGateClient);
    for (const name of [
      "create_shared_team",
      "add_shared_team_member",
      "assign_shared_team_to_app",
      "list_shared_teams",
      "delete_shared_team",
      "list_shared_team_members",
      "remove_shared_team_member",
    ]) {
      expect(tools.has(name)).toBe(true);
    }
  });

  it("remove_shared_team_member forwards args", async () => {
    const { server, tools } = createToolCapture();
    const client = createMockClient();
    registerSharedTeamTools(server, client as unknown as DeployGateClient);
    const handler = tools.get("remove_shared_team_member")!.handler;
    await handler({ workspace: "ws", shared_team_id: "t1", user: "bob" });
    expect(client.removeSharedTeamMember).toHaveBeenCalledWith("ws", "t1", "bob");
  });
});
```
> If `registerSharedTeamTools` is already imported at the top of the file, do not re-import it. If the existing describe block has a different exact name, edit that block rather than adding a second one.

- [ ] **Step 2: Run to verify it fails**

Run: `npm test -- tools.test.ts`
Expected: FAIL — `list_shared_teams` etc. are not registered.

- [ ] **Step 3: Add the 4 tools to `src/tools/shared-teams.ts`**

Insert these blocks inside `registerSharedTeamTools`, after the existing `assign_shared_team_to_app` tool (before the function's closing `}`). The module already defines a `workspace` arg inline in its existing tools; reuse the same `z.string().describe("Workspace (enterprise) name")` shape:

```ts
  server.tool(
    "list_shared_teams",
    "List the shared teams in a workspace (enterprise). Requires workspace management permission.",
    { workspace: z.string().describe("Workspace (enterprise) name") },
    async (args) => {
      const results = await client.listSharedTeams(args.workspace);
      return { content: [{ type: "text", text: JSON.stringify(results, null, 2) }] };
    },
  );

  server.tool(
    "delete_shared_team",
    "Delete a shared team from a workspace (enterprise). DESTRUCTIVE. Returns 400 if the team does not exist.",
    {
      workspace: z.string().describe("Workspace (enterprise) name"),
      team: z.string().describe("Shared team name to delete"),
    },
    async (args) => {
      const results = await client.deleteSharedTeam(args.workspace, args.team);
      return { content: [{ type: "text", text: JSON.stringify(results, null, 2) }] };
    },
  );

  server.tool(
    "list_shared_team_members",
    "List the members of a workspace shared team. Requires workspace management permission.",
    {
      workspace: z.string().describe("Workspace (enterprise) name"),
      shared_team_id: z.string().describe("Shared team id"),
    },
    async (args) => {
      const results = await client.listSharedTeamMembers(args.workspace, args.shared_team_id);
      return { content: [{ type: "text", text: JSON.stringify(results, null, 2) }] };
    },
  );

  server.tool(
    "remove_shared_team_member",
    "Remove a member from a workspace shared team. DESTRUCTIVE. Returns 404 if the user is not a member of the shared team.",
    {
      workspace: z.string().describe("Workspace (enterprise) name"),
      shared_team_id: z.string().describe("Shared team id"),
      user: z.string().describe("Member to remove (username or email)"),
    },
    async (args) => {
      const results = await client.removeSharedTeamMember(
        args.workspace,
        args.shared_team_id,
        args.user,
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
git add src/tools/shared-teams.ts src/__tests__/tools.test.ts
git -c user.email=yuki@deploygate.com commit -m "$(cat <<'EOF'
feat(tools): add shared-team list/delete/members management tools

list_shared_teams, delete_shared_team, list_shared_team_members,
remove_shared_team_member in shared-teams.ts.

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
EOF
)"
```

---

## Task 9: Tool module — workspace-saml.ts (1 tool)

**Files:**
- Create: `src/tools/workspace-saml.ts`
- Modify: `src/index.ts`
- Test: `src/__tests__/tools.test.ts`

- [ ] **Step 1: Write the failing test**

In `src/__tests__/tools.test.ts`:

(a) Add the import:
```ts
import { registerWorkspaceSamlTools } from "../tools/workspace-saml.js";
```

(b) Add this mock to `createMockClient()`:
```ts
    updateSamlCertificate: vi.fn(async () => ({})),
```

(c) Add a describe block:
```ts
describe("registerWorkspaceSamlTools", () => {
  it("registers update_saml_certificate", () => {
    const { server, tools } = createToolCapture();
    registerWorkspaceSamlTools(server, createMockClient() as unknown as DeployGateClient);
    expect(tools.has("update_saml_certificate")).toBe(true);
  });

  it("update_saml_certificate forwards the file path", async () => {
    const { server, tools } = createToolCapture();
    const client = createMockClient();
    registerWorkspaceSamlTools(server, client as unknown as DeployGateClient);
    const handler = tools.get("update_saml_certificate")!.handler;
    await handler({ workspace: "ws", file_path: "/tmp/idp.pem" });
    expect(client.updateSamlCertificate).toHaveBeenCalledWith("ws", "/tmp/idp.pem");
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `npm test -- tools.test.ts`
Expected: FAIL — cannot import `../tools/workspace-saml.js`.

- [ ] **Step 3: Create `src/tools/workspace-saml.ts`**

```ts
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { DeployGateClient } from "../client.js";

export function registerWorkspaceSamlTools(
  server: McpServer,
  client: DeployGateClient,
): void {
  server.tool(
    "update_saml_certificate",
    "Update a workspace's SAML IdP certificate from a local PEM file. Requires a USER API token with workspace ADMIN permission. CAUTION: uploading an incorrect certificate can break SSO login for the whole workspace. Returns 400 for an invalid certificate file, 403 if not an admin or the plan has expired, 404 if SAML is not configured.",
    {
      workspace: z.string().describe("Workspace (enterprise) name"),
      file_path: z.string().describe("Local path to the IdP X.509 certificate (PEM) file"),
    },
    async (args) => {
      const results = await client.updateSamlCertificate(args.workspace, args.file_path);
      return { content: [{ type: "text", text: JSON.stringify(results, null, 2) }] };
    },
  );
}
```

- [ ] **Step 4: Register in `src/index.ts`**

Add the import:
```ts
import { registerWorkspaceSamlTools } from "./tools/workspace-saml.js";
```
Add the registration call (after `registerWorkspaceProjectTools(server, client);`):
```ts
registerWorkspaceSamlTools(server, client);
```

- [ ] **Step 5: Run to verify it passes**

Run: `npm test -- tools.test.ts`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add src/tools/workspace-saml.ts src/index.ts src/__tests__/tools.test.ts
git -c user.email=yuki@deploygate.com commit -m "$(cat <<'EOF'
feat(tools): add update_saml_certificate tool

PUT a workspace SAML IdP certificate from a local PEM file
(workspace-saml.ts). Description warns about SSO-breakage risk.

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
EOF
)"
```

---

## Task 10: Full build + live verification

**Files:** none (verification only)

- [ ] **Step 1: Full build and test**

Run: `npm run build && npm test`
Expected: tsc clean, all tests PASS.

- [ ] **Step 2: Live-verify against the real API**

Drive the MCP server over stdio (newline-delimited JSON-RPC: `initialize` → `notifications/initialized` → `tools/call`). Live API calls require `dangerouslyDisableSandbox: true` (apex `deploygate.com` is not in the `*.deploygate.com` allowlist). Use a temporary probe script (do NOT commit it). Use workspace `workspace-3vddz` (the Enterprise of `tnj_group`).

Verify read-only tools first (non-destructive):
- `list_workspace_members` on `workspace-3vddz`
- `get_workspace_member` for a known member (e.g. `tnj`)
- `list_workspace_projects` on `workspace-3vddz`
- `list_workspace_project_members` for a known project (e.g. `tnj_group`)
- `list_shared_teams` on `workspace-3vddz`
- `list_shared_team_members` for a shared team id from the previous result (if any exist)

Safe error-path checks (resolve the route without mutating state — expect a JSON domain error, NOT an HTML 404):
- `delete_shared_team` with a non-existent team name → expect "not found" 400
- `remove_shared_team_member` with a non-existent team/user → expect domain error
- `remove_project_member` with a non-existent member → expect domain error
- `get_member_invitation_request` with a bogus id → expect 404 JSON
- `reject_member_invitation_request` / `approve_member_invitation_request` with a bogus id → expect 404 JSON

Destructive/mutating tools (`create_project`, `add_workspace_member`, `add_project_member`, `remove_workspace_member`, `update_saml_certificate`): do NOT run against the real workspace without explicit user confirmation per resource. `update_saml_certificate` MUST NOT be run live (it can break SSO). Report which were exercised vs deferred.

- [ ] **Step 3: Report results and fix any path/parameter drift**

If any endpoint path or parameter differs from what was implemented (cf. the Phase 1 keystore lesson where routes.rb differed from production), fix the client method + its test, re-run `npm test`, and commit a `fix(client): correct ... (live-verified)` commit.

- [ ] **Step 4: Update the project memory**

Update `~/.claude/projects/-Users-tnj-git-deploygate-agent-plugin/memory/deploygate-public-api-full-coverage-project.md` to mark Phase 3 done (tool count, branch state) and record any live-verification findings. Note the full project (all 3 phases) is now complete on `feat/full-api-coverage`.

---

## Completion criteria

- 17 new tools registered: list/get/add/remove workspace members; get/approve/reject member invitation requests; list_workspace_projects, create_project, list_workspace_project_members, add_project_member, remove_project_member; list_shared_teams, delete_shared_team, list_shared_team_members, remove_shared_team_member; update_saml_certificate.
- 11 new client methods + `addWorkspaceMember` extended with optional full_name/role + 6 existing methods exposed as tools.
- `npm run build && npm test` all PASS.
- Read-only and safe error-path tools live-verified; mutating tools verified only with explicit confirmation (SAML never run live).
- `plugin/scripts/bundle.js` NOT manually regenerated (release-please handles it).
