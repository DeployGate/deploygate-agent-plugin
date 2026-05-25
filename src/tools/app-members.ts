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
}
