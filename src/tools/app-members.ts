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
    "List the members of an app. For project/workspace (Group)-owned apps (current plans) this returns individual users plus the teams attached to the app. For legacy user-owned apps it returns individual collaborators plus a usage quota object (used/max seats).",
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
    "list_app_teams",
    "List the regular (non-shared) teams attached to an app in a project. owner_name is the project (organization) name. Returns 403 if your API token lacks permission on the app.",
    { owner_name: z.string().describe("Project (organization) name"), platform: platformArg, app_id: appIdArg },
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
      owner_name: z.string().describe("Project (organization) name"),
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
    { owner_name: z.string().describe("Project (organization) name"), platform: platformArg, app_id: appIdArg },
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
    "Detach a workspace shared team from an app. Only valid for apps in an Enterprise (workspace) organization — returns 400 otherwise. DESTRUCTIVE. Returns 400 if the shared team is not attached.",
    {
      owner_name: z.string().describe("Project (organization) name"),
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
}
