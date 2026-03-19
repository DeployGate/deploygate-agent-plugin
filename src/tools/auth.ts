import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { DeployGateClient } from "../client.js";

export function registerAuthTools(
  server: McpServer,
  client: DeployGateClient,
): void {
  server.tool(
    "get_user_info",
    "Get current user information. Retrieves organizations associated with the API token to determine workspace name and default project.",
    {},
    async () => {
      const results = await client.getOrganizations();
      return {
        content: [{ type: "text", text: JSON.stringify(results, null, 2) }],
      };
    },
  );
}
