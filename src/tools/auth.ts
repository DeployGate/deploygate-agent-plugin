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

  server.tool(
    "login_wait",
    "Wait for the user to approve the login started by `login_start`. Polls the server on the server-specified interval until the code is authorized, rejected, or expired (~5 minutes). On success, stores the token locally and returns workspace info.",
    {},
    async () => {
      const session = pendingLogin;
      pendingLogin = null;
      if (!session) {
        return {
          content: [
            {
              type: "text",
              text: "No login in progress. Call `login_start` first.",
            },
          ],
          isError: true,
        };
      }

      let rateLimited = 0;
      let networkErrors = 0;
      const MAX_RATE_LIMITED = 3;
      const MAX_NETWORK_ERRORS = 3;

      while (true) {
        if (now() > session.deadlineMs) {
          return {
            content: [
              {
                type: "text",
                text: "The code expired after 5 minutes. Run `login_start` again.",
              },
            ],
            isError: true,
          };
        }

        await sleep(session.intervalMs);

        let res:
          | Awaited<ReturnType<DeployGateClient["pollDeviceCode"]>>
          | null = null;
        try {
          res = await client.pollDeviceCode(session.code, session.nonce);
          networkErrors = 0;
        } catch {
          networkErrors += 1;
          if (networkErrors >= MAX_NETWORK_ERRORS) {
            return {
              content: [
                {
                  type: "text",
                  text: "Repeated network errors while polling. Check your connection and run `login_start` again.",
                },
              ],
              isError: true,
            };
          }
          continue;
        }

        if (res.status === "pending") continue;

        if (res.status === "rate_limited") {
          rateLimited += 1;
          if (rateLimited >= MAX_RATE_LIMITED) {
            return {
              content: [
                {
                  type: "text",
                  text: "Hit the server's rate limit repeatedly. Wait a minute and run `login_start` again.",
                },
              ],
              isError: true,
            };
          }
          continue;
        }

        if (res.status === "rejected") {
          return {
            content: [
              {
                type: "text",
                text: "Login was not approved, or the code expired. Run `login_start` again.",
              },
            ],
            isError: true,
          };
        }

        if (res.status === "nonce_mismatch") {
          return {
            content: [
              {
                type: "text",
                text: "Login aborted for security reasons (nonce mismatch). Run `login_start` again.",
              },
            ],
            isError: true,
          };
        }

        // authorized
        await tokenStore.save(res.api_token);
        client.setToken(res.api_token);
        const orgs = await client.getOrganizations();
        const userName = (res.user as { name?: string }).name ?? "(unknown)";
        return {
          content: [
            {
              type: "text",
              text:
                `Logged in as ${userName}.\n\n` +
                JSON.stringify(orgs, null, 2) +
                `\n\nToken saved to ${tokenStore.path()}.`,
            },
          ],
        };
      }
    },
  );
  server.tool(
    "logout",
    "Revoke the stored DeployGate token on the server and delete the local token file. Use this to sign out of DeployGate on this machine.",
    {},
    async () => {
      if (!client.hasToken()) {
        return {
          content: [{ type: "text", text: "Already logged out." }],
        };
      }

      let revokeFailed = false;
      try {
        await client.revokeCurrentToken();
      } catch {
        revokeFailed = true;
      }

      await tokenStore.clear();
      client.setToken("");

      const note = revokeFailed
        ? " (Note: the server-side revoke may not have succeeded; the local token was deleted regardless.)"
        : "";
      return {
        content: [{ type: "text", text: `Logged out.${note}` }],
      };
    },
  );
  server.tool(
    "get_user_info",
    "Get current user information — workspace name and projects associated with the stored token. If the token is invalid, the local token is deleted and the tool instructs the user to run `login_start`.",
    {},
    async () => {
      try {
        const orgs = await client.getOrganizations();
        return {
          content: [{ type: "text", text: JSON.stringify(orgs, null, 2) }],
        };
      } catch (e) {
        if (
          e instanceof DeployGateApiError &&
          e.errorType === "unauthorized"
        ) {
          await tokenStore.clear();
          client.setToken("");
          return {
            content: [
              {
                type: "text",
                text: "The stored token is invalid. Run `login_start` to log in again.",
              },
            ],
            isError: true,
          };
        }
        throw e;
      }
    },
  );
}
