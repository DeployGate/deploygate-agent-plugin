import { describe, it, expect, vi, beforeEach } from "vitest";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { DeployGateClient, DeployGateApiError } from "../client.js";
import { registerAuthTools, _resetPendingLoginForTests } from "../tools/auth.js";
import { TokenStore } from "../token-store.js";
import { registerUploadTools } from "../tools/upload.js";
import { registerDistributionTools } from "../tools/distributions.js";
import { registerUdidTools } from "../tools/udids.js";
import { registerNotificationTools } from "../tools/notifications.js";
import { registerMemberTools } from "../tools/members.js";
import { registerSharedTeamTools } from "../tools/shared-teams.js";

// Helper to capture registered tools from McpServer
function createToolCapture() {
  const tools = new Map<
    string,
    { description: string; handler: (...args: any[]) => any }
  >();

  const server = {
    tool: vi.fn((...args: any[]) => {
      // McpServer.tool() can be called with different arities:
      // (name, description, schema, handler) or (name, description, handler)
      let name: string;
      let description: string;
      let handler: (...args: any[]) => any;

      if (args.length >= 4) {
        [name, description, , handler] = args;
      } else {
        [name, description, handler] = args;
      }

      tools.set(name, { description, handler });
    }),
  } as unknown as McpServer;

  return { server, tools };
}

// Create a mock client with all methods
function createMockClient() {
  return {
    setToken: vi.fn(),
    hasToken: vi.fn(() => true),
    getOrganizations: vi.fn(),
    createDeviceCode: vi.fn(),
    pollDeviceCode: vi.fn(),
    revokeCurrentToken: vi.fn(),
    uploadApp: vi.fn(),
    createDistribution: vi.fn(),
    listDistributions: vi.fn(),
    getDistribution: vi.fn(),
    updateDistribution: vi.fn(),
    deleteDistribution: vi.fn(),
    getUdids: vi.fn(),
    addWorkspaceMember: vi.fn(),
    addProjectMember: vi.fn(),
    addTeamMember: vi.fn(),
    assignTeamToApp: vi.fn(),
    listTeamMembers: vi.fn(),
    removeWorkspaceMember: vi.fn(),
    removeProjectMember: vi.fn(),
    removeTeamMember: vi.fn(),
    createSharedTeam: vi.fn(),
    addSharedTeamMember: vi.fn(),
    listSharedTeamMembers: vi.fn(),
    removeSharedTeamMember: vi.fn(),
    assignSharedTeamToApp: vi.fn(),
  } as unknown as DeployGateClient;
}

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

  describe("login_wait", () => {
    beforeEach(() => _resetPendingLoginForTests());

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
});

describe("upload tools", () => {
  it("registers upload_app tool", () => {
    const { server, tools } = createToolCapture();
    registerUploadTools(server, createMockClient());
    expect(tools.has("upload_app")).toBe(true);
  });
});

describe("distribution tools", () => {
  it("registers all distribution tools", () => {
    const { server, tools } = createToolCapture();
    registerDistributionTools(server, createMockClient());
    expect(tools.has("create_distribution")).toBe(true);
    expect(tools.has("list_distributions")).toBe(true);
    expect(tools.has("get_distribution")).toBe(true);
    expect(tools.has("update_distribution")).toBe(true);
    expect(tools.has("delete_distribution")).toBe(true);
  });
});

describe("UDID tools", () => {
  it("filters unprovisioned devices when requested", async () => {
    const { server, tools } = createToolCapture();
    const client = createMockClient();
    const udids = [
      { udid: "A", user_name: "t1", device_name: "iPhone", is_provisioned: true },
      { udid: "B", user_name: "t2", device_name: "iPad", is_provisioned: false },
    ];
    (client.getUdids as ReturnType<typeof vi.fn>).mockResolvedValue(udids);
    registerUdidTools(server, client);

    const handler = tools.get("get_udids")!.handler;

    // Without filter
    const allResult = await handler({
      owner_name: "owner",
      app_id: "com.example",
    });
    expect(JSON.parse(allResult.content[0].text)).toHaveLength(2);

    // With filter
    const filteredResult = await handler({
      owner_name: "owner",
      app_id: "com.example",
      unprovisioned_only: true,
    });
    const filtered = JSON.parse(filteredResult.content[0].text);
    expect(filtered).toHaveLength(1);
    expect(filtered[0].udid).toBe("B");
  });
});

describe("notification tools", () => {
  it("generates distribution-level URL", async () => {
    const { server, tools } = createToolCapture();
    registerNotificationTools(server);

    const handler = tools.get("get_notification_settings_url")!.handler;
    const result = await handler({
      level: "distribution",
      access_key: "abc123",
    });
    expect(result.content[0].text).toContain(
      "https://deploygate.com/distributions/abc123/notification_settings/new",
    );
  });

  it("generates organization app-level URL with /new path", async () => {
    const { server, tools } = createToolCapture();
    registerNotificationTools(server);

    const handler = tools.get("get_notification_settings_url")!.handler;
    const result = await handler({
      level: "app",
      owner_name: "my-org",
      owner_type: "organization",
      platform: "android",
      app_id: "com.example.app",
    });
    const url = result.content[0].text;
    expect(url).toContain(
      "/organizations/my-org/platforms/android/apps/com.example.app/notification_settings/new",
    );
    // Must NOT contain /signup for organization-owned apps
    expect(url).not.toContain("/notification_settings/signup");
  });

  it("generates user app-level URL with /signup path (NOT /new)", async () => {
    const { server, tools } = createToolCapture();
    registerNotificationTools(server);

    const handler = tools.get("get_notification_settings_url")!.handler;
    const result = await handler({
      level: "app",
      owner_name: "my-user",
      owner_type: "user",
      platform: "ios",
      app_id: "com.example.app",
    });
    const url = result.content[0].text;
    expect(url).toContain(
      "/users/my-user/platforms/ios/apps/com.example.app/notification_settings/signup",
    );
    // Verify the path uses /users/ not /organizations/
    expect(url).not.toContain("/organizations/");
  });

  it("returns error when distribution access_key is missing", async () => {
    const { server, tools } = createToolCapture();
    registerNotificationTools(server);

    const handler = tools.get("get_notification_settings_url")!.handler;
    const result = await handler({ level: "distribution" });
    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain("access_key");
  });

  it("returns error when app-level params are incomplete", async () => {
    const { server, tools } = createToolCapture();
    registerNotificationTools(server);

    const handler = tools.get("get_notification_settings_url")!.handler;
    const result = await handler({
      level: "app",
      owner_name: "my-org",
      // missing owner_type, platform, app_id
    });
    expect(result.isError).toBe(true);
  });
});

describe("member tools", () => {
  it("add_member orchestrates all steps for developer", async () => {
    const { server, tools } = createToolCapture();
    const client = createMockClient();
    (client.addWorkspaceMember as ReturnType<typeof vi.fn>).mockResolvedValue(
      {},
    );
    (client.addProjectMember as ReturnType<typeof vi.fn>).mockResolvedValue({});
    (client.addTeamMember as ReturnType<typeof vi.fn>).mockResolvedValue({});
    registerMemberTools(server, client);

    const handler = tools.get("add_member")!.handler;
    const result = await handler({
      workspace: "ws",
      project: "proj",
      user: "dev@example.com",
      role: "developer",
    });

    expect(client.addWorkspaceMember).toHaveBeenCalledWith(
      "ws",
      "dev@example.com",
    );
    expect(client.addProjectMember).toHaveBeenCalledWith(
      "ws",
      "proj",
      "dev@example.com",
    );
    expect(client.addTeamMember).toHaveBeenCalledWith(
      "proj",
      "developer",
      "dev@example.com",
    );
    expect(client.assignTeamToApp).not.toHaveBeenCalled();
    expect(result.content[0].text).toContain("developer");
  });

  it("add_member orchestrates 4 steps for tester", async () => {
    const { server, tools } = createToolCapture();
    const client = createMockClient();
    (client.addWorkspaceMember as ReturnType<typeof vi.fn>).mockResolvedValue(
      {},
    );
    (client.addProjectMember as ReturnType<typeof vi.fn>).mockResolvedValue({});
    (client.addTeamMember as ReturnType<typeof vi.fn>).mockResolvedValue({});
    (client.assignTeamToApp as ReturnType<typeof vi.fn>).mockResolvedValue({});
    registerMemberTools(server, client);

    const handler = tools.get("add_member")!.handler;
    const result = await handler({
      workspace: "ws",
      project: "proj",
      user: "tester@example.com",
      role: "tester",
      platform: "ios",
      app_id: "com.example.app",
    });

    expect(client.assignTeamToApp).toHaveBeenCalledWith(
      "proj",
      "ios",
      "com.example.app",
      "tester",
    );
    expect(result.content[0].text).toContain("tester");
  });

  it("add_member requires platform/app_id for tester", async () => {
    const { server, tools } = createToolCapture();
    registerMemberTools(server, createMockClient());

    const handler = tools.get("add_member")!.handler;
    const result = await handler({
      workspace: "ws",
      project: "proj",
      user: "tester@example.com",
      role: "tester",
    });
    expect(result.isError).toBe(true);
  });

  it("add_member handles already_joined_member gracefully", async () => {
    const { server, tools } = createToolCapture();
    const client = createMockClient();
    (client.addWorkspaceMember as ReturnType<typeof vi.fn>).mockRejectedValue(
      new DeployGateApiError({
        error: true,
        message: "Already joined",
        error_type: "already_joined_member",
      }),
    );
    (client.addProjectMember as ReturnType<typeof vi.fn>).mockResolvedValue({});
    (client.addTeamMember as ReturnType<typeof vi.fn>).mockResolvedValue({});
    registerMemberTools(server, client);

    const handler = tools.get("add_member")!.handler;
    const result = await handler({
      workspace: "ws",
      project: "proj",
      user: "existing@example.com",
      role: "developer",
    });

    expect(result.isError).toBeUndefined();
    expect(result.content[0].text).toContain("Already in workspace");
  });

  it("add_member returns upgrade message on seat limit exceeded", async () => {
    const { server, tools } = createToolCapture();
    const client = createMockClient();
    (client.addWorkspaceMember as ReturnType<typeof vi.fn>).mockRejectedValue(
      new DeployGateApiError({
        error: true,
        message: "Seat limit exceeded",
        error_type: "num_of_member_seats_exceeded",
      }),
    );
    registerMemberTools(server, client);

    const handler = tools.get("add_member")!.handler;
    const result = await handler({
      workspace: "ws",
      project: "proj",
      user: "new@example.com",
      role: "developer",
    });

    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain("upgrade");
    expect(result.content[0].text).toContain("plan");
  });

  it("add_member continues when project/team additions are upserts", async () => {
    const { server, tools } = createToolCapture();
    const client = createMockClient();
    // All three succeed (project and team are upserts, no error on duplicate)
    (client.addWorkspaceMember as ReturnType<typeof vi.fn>).mockResolvedValue(
      {},
    );
    (client.addProjectMember as ReturnType<typeof vi.fn>).mockResolvedValue({});
    (client.addTeamMember as ReturnType<typeof vi.fn>).mockResolvedValue({});
    registerMemberTools(server, client);

    const handler = tools.get("add_member")!.handler;
    const result = await handler({
      workspace: "ws",
      project: "proj",
      user: "existing@example.com",
      role: "owner",
    });

    expect(result.isError).toBeUndefined();
    // All three steps complete
    expect(client.addWorkspaceMember).toHaveBeenCalledOnce();
    expect(client.addProjectMember).toHaveBeenCalledOnce();
    expect(client.addTeamMember).toHaveBeenCalledWith(
      "proj",
      "owner",
      "existing@example.com",
    );
    expect(result.content[0].text).toContain("owner");
  });

  it("add_member propagates unexpected errors", async () => {
    const { server, tools } = createToolCapture();
    const client = createMockClient();
    (client.addWorkspaceMember as ReturnType<typeof vi.fn>).mockRejectedValue(
      new Error("Network error"),
    );
    registerMemberTools(server, client);

    const handler = tools.get("add_member")!.handler;
    await expect(
      handler({
        workspace: "ws",
        project: "proj",
        user: "user@example.com",
        role: "developer",
      }),
    ).rejects.toThrow("Network error");
  });
});

describe("shared team tools", () => {
  it("registers all shared team tools", () => {
    const { server, tools } = createToolCapture();
    registerSharedTeamTools(server, createMockClient());
    expect(tools.has("create_shared_team")).toBe(true);
    expect(tools.has("add_shared_team_member")).toBe(true);
    expect(tools.has("assign_shared_team_to_app")).toBe(true);
  });

  it("add_shared_team_member validates email XOR username", async () => {
    const { server, tools } = createToolCapture();
    registerSharedTeamTools(server, createMockClient());

    const handler = tools.get("add_shared_team_member")!.handler;

    // Neither provided
    const result1 = await handler({
      workspace: "ws",
      shared_team_id: "t1",
    });
    expect(result1.isError).toBe(true);

    // Both provided
    const result2 = await handler({
      workspace: "ws",
      shared_team_id: "t1",
      email: "a@b.com",
      username: "user1",
    });
    expect(result2.isError).toBe(true);
  });
});
