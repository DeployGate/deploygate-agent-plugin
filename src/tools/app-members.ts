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
