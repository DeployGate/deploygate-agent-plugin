import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { DeployGateClient } from "../client.js";

export function registerDistributionTools(
  server: McpServer,
  client: DeployGateClient,
): void {
  server.tool(
    "create_distribution",
    "Create a new distribution page for an app. Returns the access_key which is used as the distribution page identifier. URL: https://deploygate.com/distributions/{access_key} If the app has reached its maximum number of distribution pages, the API returns 400 (exceed the maximum number of distributions). When revision is omitted, the latest build is used.",
    {
      owner_name: z.string().describe("Owner name (user or project)"),
      platform: z.enum(["ios", "android"]).describe("App platform"),
      app_id: z
        .string()
        .describe("App ID (package name or bundle identifier)"),
      title: z
        .string()
        .max(255)
        .describe("Distribution page title (max 255 chars)"),
      release_note: z
        .string()
        .optional()
        .describe("Release note for this distribution"),
      revision: z
        .number()
        .optional()
        .describe("Specific revision number to distribute"),
      active: z
        .boolean()
        .optional()
        .describe("Whether the distribution page is active (default: true)"),
    },
    async (args) => {
      const results = await client.createDistribution(
        args.owner_name,
        args.platform,
        args.app_id,
        {
          title: args.title,
          release_note: args.release_note,
          revision: args.revision,
          active: args.active,
        },
      );
      return {
        content: [{ type: "text", text: JSON.stringify(results, null, 2) }],
      };
    },
  );

  server.tool(
    "list_distributions",
    "List all distribution pages for an app.",
    {
      owner_name: z.string().describe("Owner name (user or project)"),
      platform: z.enum(["ios", "android"]).describe("App platform"),
      app_id: z
        .string()
        .describe("App ID (package name or bundle identifier)"),
    },
    async (args) => {
      const results = await client.listDistributions(
        args.owner_name,
        args.platform,
        args.app_id,
      );
      return {
        content: [{ type: "text", text: JSON.stringify(results, null, 2) }],
      };
    },
  );

  server.tool(
    "get_distribution",
    "Get details of a specific distribution page by its access_key.",
    {
      access_key: z
        .string()
        .describe("Distribution page access_key (distribution_key)"),
    },
    async (args) => {
      const results = await client.getDistribution(args.access_key);
      return {
        content: [{ type: "text", text: JSON.stringify(results, null, 2) }],
      };
    },
  );

  server.tool(
    "update_distribution",
    "Update a distribution page. Note: 'active' and 'release_scope' are required parameters even when only changing the title. Use get_distribution first to retrieve current values.",
    {
      access_key: z
        .string()
        .describe("Distribution page access_key (distribution_key)"),
      title: z.string().max(255).optional().describe("New title"),
      active: z
        .boolean()
        .describe("Whether the distribution page is active (required)"),
      release_scope: z
        .enum(["public", "unlisted", "passcode", "authorized_only"])
        .describe(
          "Access scope: public, unlisted (default), passcode, or authorized_only (required). 'authorized_only' is only valid for project/workspace-owned apps whose plan supports it (personal apps support public/unlisted/passcode only), and cannot be set if the distribution page already has testers (422). When 'passcode' is chosen, the passcode parameter is required.",
        ),
      passcode: z
        .string()
        .optional()
        .describe(
          "Passcode for the distribution page (required when release_scope is 'passcode')",
        ),
      release_note: z
        .string()
        .optional()
        .describe("Release note for this distribution"),
      ip_restriction_enable: z
        .boolean()
        .optional()
        .describe(
          "Enable IP address restriction. Only available for apps owned by a project/workspace (Group) and when the feature is enabled for that workspace; personal (user-owned) apps do not support this and the API will reject it.",
        ),
      ip_restriction: z
        .string()
        .optional()
        .describe("Comma-separated allowed IPs/CIDRs, e.g. '10.0.0.0/24,192.168.1.1'"),
    },
    async (args) => {
      const results = await client.updateDistribution(args.access_key, {
        title: args.title,
        active: args.active,
        release_scope: args.release_scope,
        passcode: args.passcode,
        release_note: args.release_note,
        ip_restriction_enable: args.ip_restriction_enable,
        ip_restriction: args.ip_restriction,
      });
      return {
        content: [{ type: "text", text: JSON.stringify(results, null, 2) }],
      };
    },
  );

  server.tool(
    "delete_distribution",
    "Delete a distribution page. Only the distribution page is deleted; the uploaded builds (binaries) are preserved.",
    {
      access_key: z
        .string()
        .describe("Distribution page access_key (distribution_key)"),
    },
    async (args) => {
      const results = await client.deleteDistribution(args.access_key);
      return {
        content: [{ type: "text", text: JSON.stringify(results, null, 2) }],
      };
    },
  );

  server.tool(
    "delete_distribution_by_name",
    "Delete a distribution page by its title (name) within an app. Returns 404 if no page matches the name, and 400 if more than one page shares the name (in that case delete by access_key with delete_distribution instead). Only the distribution page is removed; uploaded builds are preserved.",
    {
      owner_name: z.string().describe("Owner name (user or project)"),
      platform: z.enum(["ios", "android"]).describe("App platform"),
      app_id: z.string().describe("App ID (package name or bundle identifier)"),
      distribution_name: z.string().describe("Title of the distribution page to delete"),
    },
    async (args) => {
      const results = await client.deleteDistributionByName(
        args.owner_name,
        args.platform,
        args.app_id,
        args.distribution_name,
      );
      return { content: [{ type: "text", text: JSON.stringify(results, null, 2) }] };
    },
  );

  server.tool(
    "update_distribution_revision",
    "Change which build revision a distribution page serves. Returns 404 if the revision does not exist in the app. Requires app admin permission. Re-pointing moves the page's automatic protection to the new revision, which frees the previously-served revision for deletion.",
    {
      access_key: z.string().describe("Distribution page access_key (distribution_key)"),
      revision: z.number().describe("Revision number to assign to the distribution page"),
      release_note: z.string().optional().describe("Release note for this revision"),
    },
    async (args) => {
      const results = await client.updateDistributionRevision(args.access_key, {
        revision: args.revision,
        release_note: args.release_note,
      });
      return { content: [{ type: "text", text: JSON.stringify(results, null, 2) }] };
    },
  );
}
