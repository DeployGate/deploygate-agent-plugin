import { randomBytes } from "node:crypto";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { DeployGateApiError, DeployGateClient } from "../client.js";
import { TokenStore } from "../token-store.js";

const CLIENT_LABEL = "Claude Code DeployGate plugin";

interface PendingLogin {
  nonce: string;
  code: string;
  intervalMs: number;
  deadlineMs: number;
}

let pendingLogin: PendingLogin | null = null;

function generateNonce(): string {
  return randomBytes(48).toString("base64url");
}

// Exposed for tests.
export function _resetPendingLoginForTests(): void {
  pendingLogin = null;
}

export function registerAuthTools(
  server: McpServer,
  client: DeployGateClient,
  tokenStore: TokenStore,
  opts: { sleep?: (ms: number) => Promise<void>; now?: () => number } = {},
): void {
  const sleep = opts.sleep ?? ((ms) => new Promise((r) => setTimeout(r, ms)));
  const now = opts.now ?? (() => Date.now());

  server.tool(
    "login_start",
    "Start DeployGate login via the device authorization code flow. Returns a URL for the user to open in their browser and approve. After the user approves, call `login_wait` to receive and store the token.",
    {},
    async () => {
      const nonce = generateNonce();
      const res = await client.createDeviceCode(CLIENT_LABEL, nonce);
      pendingLogin = {
        nonce,
        code: res.code,
        intervalMs: res.interval * 1000,
        deadlineMs: now() + res.expires_in * 1000,
      };
      return {
        content: [
          {
            type: "text",
            text:
              `Open this URL in your browser and approve the login:\n\n` +
              `  ${res.verification_uri_complete}\n\n` +
              `Short code: ${res.code} (expires in ${res.expires_in}s)\n\n` +
              `Then call the \`login_wait\` tool to receive the token.`,
          },
        ],
      };
    },
  );

  server.tool("login_wait", "placeholder — implemented in Task 7", {}, async () => ({
    content: [{ type: "text", text: "not yet implemented" }],
    isError: true,
  }));
  server.tool("logout", "placeholder — implemented in Task 8", {}, async () => ({
    content: [{ type: "text", text: "not yet implemented" }],
    isError: true,
  }));
  server.tool("get_user_info", "placeholder — implemented in Task 9", {}, async () => ({
    content: [{ type: "text", text: "not yet implemented" }],
    isError: true,
  }));

  // The following identifiers will be used in later tasks.
  void pendingLogin;
  void sleep;
  void DeployGateApiError;
  void tokenStore;
}
