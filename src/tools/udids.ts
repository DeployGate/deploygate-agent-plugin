import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { DeployGateClient } from "../client.js";

interface UdidEntry {
  udid: string;
  user_name: string;
  device_name: string;
  is_provisioned: boolean;
}

export function registerUdidTools(
  server: McpServer,
  client: DeployGateClient,
): void {
  server.tool(
    "get_udids",
    "Get iOS device UDIDs registered for an app. Shows which devices are included in the provisioning profile. Devices with is_provisioned=false need to be added to the provisioning profile for Ad Hoc distribution.",
    {
      owner_name: z.string().describe("Owner name (user or project)"),
      app_id: z.string().describe("iOS app ID (bundle identifier)"),
      unprovisioned_only: z
        .boolean()
        .optional()
        .describe(
          "If true, only return devices not yet in the provisioning profile (is_provisioned=false)",
        ),
    },
    async (args) => {
      const results = (await client.getUdids(
        args.owner_name,
        args.app_id,
      )) as UdidEntry[];

      const filtered = args.unprovisioned_only
        ? results.filter((d) => !d.is_provisioned)
        : results;

      return {
        content: [{ type: "text", text: JSON.stringify(filtered, null, 2) }],
      };
    },
  );
}
