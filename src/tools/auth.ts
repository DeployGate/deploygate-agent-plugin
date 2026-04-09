import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { DeployGateApiError, DeployGateClient } from "../client.js";

export function registerAuthTools(
  server: McpServer,
  client: DeployGateClient,
): void {
  server.tool(
    "set_api_token",
    "Set the DeployGate API token for this session. Validates the token by calling the API and returns user information on success. For persistent configuration, set the DEPLOYGATE_API_TOKEN environment variable in your MCP server settings.",
    {
      api_token: z
        .string()
        .describe(
          "DeployGate API token (get it from https://deploygate.com/settings)",
        ),
    },
    async (args) => {
      client.setToken(args.api_token);

      try {
        const results = await client.getOrganizations();
        return {
          content: [
            {
              type: "text",
              text: `API token set successfully.\n\n${JSON.stringify(results, null, 2)}\n\nNote: This token is only valid for the current session. To persist it, set the DEPLOYGATE_API_TOKEN environment variable in your MCP server configuration.`,
            },
          ],
        };
      } catch (e) {
        if (
          e instanceof DeployGateApiError &&
          e.errorType === "unauthorized"
        ) {
          client.setToken("");
          return {
            content: [
              {
                type: "text",
                text: "Error: The provided API token is invalid. Please check your token at https://deploygate.com/settings",
              },
            ],
            isError: true,
          };
        }
        throw e;
      }
    },
  );

  server.tool(
    "get_user_info",
    "Get current user information. Returns the workspace name and projects associated with the API token.",
    {},
    async () => {
      const results = await client.getOrganizations();
      return {
        content: [{ type: "text", text: JSON.stringify(results, null, 2) }],
      };
    },
  );
}
