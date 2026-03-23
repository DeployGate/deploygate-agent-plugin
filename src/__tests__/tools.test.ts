import { describe, it, expect, vi, beforeEach } from "vitest";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { DeployGateClient, DeployGateApiError } from "../client.js";
import { registerAuthTools } from "../tools/auth.js";
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

describe("auth tools", () => {
  it("registers get_user_info and set_api_token tools", () => {
    const { server, tools } = createToolCapture();
    const client = createMockClient();
    registerAuthTools(server, client);
    expect(tools.has("get_user_info")).toBe(true);
    expect(tools.has("set_api_token")).toBe(true);
  });

  it("get_user_info calls getOrganizations and returns results", async () => {
    const { server, tools } = createToolCapture();
    const client = createMockClient();
    const orgs = [{ name: "workspace1" }];
    (client.getOrganizations as ReturnType<typeof vi.fn>).mockResolvedValue(
      orgs,
    );
    registerAuthTools(server, client);

    const handler = tools.get("get_user_info")!.handler;
    const result = await handler({});
    expect(result.content[0].text).toBe(JSON.stringify(orgs, null, 2));
  });

  it("set_api_token sets token and validates by calling getOrganizations", async () => {
    const { server, tools } = createToolCapture();
    const client = createMockClient();
    const orgs = [{ name: "my-workspace" }];
    (client.getOrganizations as ReturnType<typeof vi.fn>).mockResolvedValue(
      orgs,
    );
    registerAuthTools(server, client);

    const handler = tools.get("set_api_token")!.handler;
    const result = await handler({ api_token: "valid-token" });

    expect(client.setToken).toHaveBeenCalledWith("valid-token");
    expect(client.getOrganizations).toHaveBeenCalled();
    expect(result.isError).toBeUndefined();
    expect(result.content[0].text).toContain("API token set successfully");
    expect(result.content[0].text).toContain("my-workspace");
  });

  it("set_api_token clears token and returns error on invalid token", async () => {
    const { server, tools } = createToolCapture();
    const client = createMockClient();
    (client.getOrganizations as ReturnType<typeof vi.fn>).mockRejectedValue(
      new DeployGateApiError({
        error: true,
        message: "Unauthorized",
        error_type: "unauthorized",
      }),
    );
    registerAuthTools(server, client);

    const handler = tools.get("set_api_token")!.handler;
    const result = await handler({ api_token: "bad-token" });

    expect(client.setToken).toHaveBeenCalledWith("bad-token");
    // Clears the invalid token
    expect(client.setToken).toHaveBeenCalledWith("");
    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain("invalid");
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
