import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { DeployGateClient } from "../client.js";

const ownerArg = z.string().describe("Owner name (user or project)");
const platformArg = z.enum(["ios", "android"]).describe("App platform");
const appIdArg = z.string().describe("App ID (package name or bundle identifier)");

export function registerAppTools(
  server: McpServer,
  client: DeployGateClient,
): void {
  server.tool(
    "get_app",
    "Get details of an app, optionally for a specific revision.",
    {
      owner_name: ownerArg,
      platform: platformArg,
      app_id: appIdArg,
      revision: z.number().optional().describe("Specific revision to inspect"),
    },
    async (args) => {
      const results = await client.getApp(
        args.owner_name,
        args.platform,
        args.app_id,
        { revision: args.revision },
      );
      return { content: [{ type: "text", text: JSON.stringify(results, null, 2) }] };
    },
  );

  server.tool(
    "list_app_revisions",
    "List uploaded build revisions (binaries) of an app, newest first (50 per page). Only revisions within the storage retention period are returned; older auto-pruned builds are not listed.",
    {
      owner_name: ownerArg,
      platform: platformArg,
      app_id: appIdArg,
      page: z.number().optional().describe("Page number (default 1)"),
    },
    async (args) => {
      const results = await client.listAppRevisions(
        args.owner_name,
        args.platform,
        args.app_id,
        { page: args.page },
      );
      return { content: [{ type: "text", text: JSON.stringify(results, null, 2) }] };
    },
  );

  server.tool(
    "get_app_revision",
    "Get details of a specific build revision (binary) of an app. Returns 404 if the revision number does not exist.",
    {
      owner_name: ownerArg,
      platform: platformArg,
      app_id: appIdArg,
      revision: z.number().describe("Revision number"),
    },
    async (args) => {
      const results = await client.getAppRevision(
        args.owner_name,
        args.platform,
        args.app_id,
        args.revision,
      );
      return { content: [{ type: "text", text: JSON.stringify(results, null, 2) }] };
    },
  );

  server.tool(
    "update_app_revision",
    "Update the message (memo) of a build revision. Only the message can be changed.",
    {
      owner_name: ownerArg,
      platform: platformArg,
      app_id: appIdArg,
      revision: z.number().describe("Revision number"),
      message: z.string().describe("New message/memo for the revision"),
    },
    async (args) => {
      const results = await client.updateAppRevision(
        args.owner_name,
        args.platform,
        args.app_id,
        args.revision,
        args.message,
      );
      return { content: [{ type: "text", text: JSON.stringify(results, null, 2) }] };
    },
  );

  server.tool(
    "delete_app_revision",
    "Delete a build revision (binary). The API rejects deletion (HTTP 400) of: (1) the latest revision ('cannot delete the latest binary'), and (2) any protected revision ('cannot delete a protected binary'). A revision currently served by a distribution page is automatically protected and therefore cannot be deleted while in use — first repoint that distribution to another revision (update_distribution_revision) or delete the distribution page (delete_distribution / delete_distribution_by_name). Note: unprotect_app_revision only removes MANUAL protection, not a distribution's protection.",
    {
      owner_name: ownerArg,
      platform: platformArg,
      app_id: appIdArg,
      revision: z.number().describe("Revision number to delete"),
    },
    async (args) => {
      const results = await client.deleteAppRevision(
        args.owner_name,
        args.platform,
        args.app_id,
        args.revision,
      );
      return { content: [{ type: "text", text: JSON.stringify(results, null, 2) }] };
    },
  );

  server.tool(
    "protect_app_revision",
    "Add manual protection to a build revision so it is excluded from automatic deletion (retention pruning). Fails (403) if the app has reached its maximum number of protected revisions.",
    {
      owner_name: ownerArg,
      platform: platformArg,
      app_id: appIdArg,
      revision: z.number().describe("Revision number to protect"),
    },
    async (args) => {
      const results = await client.protectAppRevision(
        args.owner_name,
        args.platform,
        args.app_id,
        args.revision,
      );
      return { content: [{ type: "text", text: JSON.stringify(results, null, 2) }] };
    },
  );

  server.tool(
    "unprotect_app_revision",
    "Remove MANUAL deletion protection from a build revision (the protection added by protect_app_revision). This does NOT remove the automatic protection a revision gets while it is served by a distribution page — for that, repoint or delete the distribution.",
    {
      owner_name: ownerArg,
      platform: platformArg,
      app_id: appIdArg,
      revision: z.number().describe("Revision number to unprotect"),
    },
    async (args) => {
      const results = await client.unprotectAppRevision(
        args.owner_name,
        args.platform,
        args.app_id,
        args.revision,
      );
      return { content: [{ type: "text", text: JSON.stringify(results, null, 2) }] };
    },
  );

  server.tool(
    "search_app_revisions",
    "Search build revisions of an app by a query string. Only revisions within the storage retention period are searched.",
    {
      owner_name: ownerArg,
      platform: platformArg,
      app_id: appIdArg,
      q: z.string().describe("Search query"),
      page: z.number().optional().describe("Page number"),
      per_page: z.number().optional().describe("Items per page"),
    },
    async (args) => {
      const results = await client.searchAppRevisions(
        args.owner_name,
        args.platform,
        args.app_id,
        { q: args.q, page: args.page, perPage: args.per_page },
      );
      return { content: [{ type: "text", text: JSON.stringify(results, null, 2) }] };
    },
  );
}
