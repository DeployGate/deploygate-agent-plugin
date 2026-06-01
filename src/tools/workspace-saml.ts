import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { DeployGateClient } from "../client.js";

export function registerWorkspaceSamlTools(
  server: McpServer,
  client: DeployGateClient,
): void {
  server.tool(
    "update_saml_certificate",
    "Update a workspace's SAML IdP certificate from a local PEM file. Requires a USER API token with workspace ADMIN permission. CAUTION: uploading an incorrect certificate can break SSO login for the whole workspace. Returns 400 for an invalid certificate file, 403 if not an admin or the plan has expired, 404 if SAML is not configured.",
    {
      workspace: z.string().describe("Workspace (enterprise) name"),
      file_path: z.string().describe("Local path to the IdP X.509 certificate (PEM) file"),
    },
    async (args) => {
      const results = await client.updateSamlCertificate(args.workspace, args.file_path);
      return { content: [{ type: "text", text: JSON.stringify(results, null, 2) }] };
    },
  );
}
