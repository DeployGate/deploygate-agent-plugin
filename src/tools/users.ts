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
