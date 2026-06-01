import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { DeployGateClient } from "../client.js";

const ownerArg = z.string().describe("Owner name (user or project)");
const appIdArg = z.string().describe("Android app ID (package name)");

export function registerKeystoreTools(
  server: McpServer,
  client: DeployGateClient,
): void {
  server.tool(
    "get_keystore",
    "Get the certificate fingerprints (md5/sha1/sha256/checksum) of an Android app's signing keystore. Android apps only. Returns 404 if the app has no keystore.",
    { owner_name: ownerArg, app_id: appIdArg },
    async (args) => {
      const results = await client.getKeystore(args.owner_name, args.app_id);
      return { content: [{ type: "text", text: JSON.stringify(results, null, 2) }] };
    },
  );

  server.tool(
    "create_keystore",
    "Generate a debug signing keystore for an Android app (commonly-used debug config: alias 'androiddebugkey', password 'android'). Android apps only; requires write permission. If the app already has a keystore this is a no-op that returns a message saying so (use update_keystore to replace).",
    { owner_name: ownerArg, app_id: appIdArg },
    async (args) => {
      const results = await client.createKeystore(args.owner_name, args.app_id);
      return { content: [{ type: "text", text: JSON.stringify(results, null, 2) }] };
    },
  );

  server.tool(
    "update_keystore",
    "Upload/replace an Android app's signing keystore from a local keystore file. Android apps only; requires write permission. Returns 400 if the keystore file or its credentials (alias/passwords) are invalid.",
    {
      owner_name: ownerArg,
      app_id: appIdArg,
      file_path: z.string().describe("Local path to the keystore file"),
      alias_name: z.string().describe("Key alias name"),
      keystore_password: z.string().describe("Keystore password"),
      key_password: z.string().describe("Key password"),
    },
    async (args) => {
      const results = await client.updateKeystore(args.owner_name, args.app_id, {
        filePath: args.file_path,
        aliasName: args.alias_name,
        keystorePassword: args.keystore_password,
        keyPassword: args.key_password,
      });
      return { content: [{ type: "text", text: JSON.stringify(results, null, 2) }] };
    },
  );

  server.tool(
    "delete_keystore",
    "Delete an Android app's signing keystore. Android apps only; requires write permission. Returns 404 if the app has no keystore.",
    { owner_name: ownerArg, app_id: appIdArg },
    async (args) => {
      const results = await client.deleteKeystore(args.owner_name, args.app_id);
      return { content: [{ type: "text", text: JSON.stringify(results, null, 2) }] };
    },
  );

  server.tool(
    "download_keystore",
    "Get a download URL and checksum for an Android app's signing keystore. Android apps only. Returns 404 if the app has no keystore.",
    { owner_name: ownerArg, app_id: appIdArg },
    async (args) => {
      const results = await client.downloadKeystore(args.owner_name, args.app_id);
      return { content: [{ type: "text", text: JSON.stringify(results, null, 2) }] };
    },
  );
}
