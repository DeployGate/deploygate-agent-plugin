import { z } from "zod";
export function registerUdidTools(server, client) {
    server.tool("get_udids", "Get iOS device UDIDs registered for an app. Shows which devices are included in the provisioning profile. Devices with is_provisioned=false need to be added to the provisioning profile for Ad Hoc distribution.", {
        owner_name: z.string().describe("Owner name (user or organization)"),
        app_id: z.string().describe("iOS app ID (bundle identifier)"),
        unprovisioned_only: z
            .boolean()
            .optional()
            .describe("If true, only return devices not yet in the provisioning profile (is_provisioned=false)"),
    }, async (args) => {
        const results = (await client.getUdids(args.owner_name, args.app_id));
        const filtered = args.unprovisioned_only
            ? results.filter((d) => !d.is_provisioned)
            : results;
        return {
            content: [{ type: "text", text: JSON.stringify(filtered, null, 2) }],
        };
    });
}
//# sourceMappingURL=udids.js.map