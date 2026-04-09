import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";

const DEPLOYGATE_BASE = "https://deploygate.com";

export function registerNotificationTools(server: McpServer): void {
  server.tool(
    "get_notification_settings_url",
    "Generate the URL for configuring Slack/Teams/Chatwork notifications. Supports both distribution-level and app-level notification settings. The user needs to open this URL in a browser to complete the setup.",
    {
      level: z
        .enum(["distribution", "app"])
        .describe(
          "Notification level: 'distribution' for a specific distribution page, 'app' for all app activity",
        ),
      access_key: z
        .string()
        .optional()
        .describe(
          "Distribution page access_key (required when level is 'distribution')",
        ),
      owner_name: z
        .string()
        .optional()
        .describe("Owner name (required when level is 'app')"),
      owner_type: z
        .enum(["organization", "user"])
        .optional()
        .describe(
          "Owner type: 'organization' (project-owned app) or 'user' (personal app). Required when level is 'app'.",
        ),
      platform: z
        .enum(["ios", "android"])
        .optional()
        .describe("App platform (required when level is 'app')"),
      app_id: z
        .string()
        .optional()
        .describe(
          "App ID / package name / bundle identifier (required when level is 'app')",
        ),
    },
    async (args) => {
      let url: string;

      if (args.level === "distribution") {
        if (!args.access_key) {
          return {
            content: [
              {
                type: "text",
                text: "Error: access_key is required for distribution-level notifications",
              },
            ],
            isError: true,
          };
        }
        url = `${DEPLOYGATE_BASE}/distributions/${args.access_key}/notification_settings/new`;
      } else {
        if (!args.owner_name || !args.owner_type || !args.platform || !args.app_id) {
          return {
            content: [
              {
                type: "text",
                text: "Error: owner_name, owner_type, platform, and app_id are all required for app-level notifications",
              },
            ],
            isError: true,
          };
        }

        if (args.owner_type === "organization") {
          url = `${DEPLOYGATE_BASE}/organizations/${args.owner_name}/platforms/${args.platform}/apps/${args.app_id}/notification_settings/new`;
        } else {
          // User-owned apps have a different path (/signup instead of /new)
          url = `${DEPLOYGATE_BASE}/users/${args.owner_name}/platforms/${args.platform}/apps/${args.app_id}/notification_settings/signup`;
        }
      }

      return {
        content: [
          {
            type: "text",
            text: `Open this URL in your browser to configure notifications:\n\n${url}`,
          },
        ],
      };
    },
  );
}
