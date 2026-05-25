#!/usr/bin/env node

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { DeployGateClient } from "./client.js";
import { TokenStore } from "./token-store.js";
import { VERSION } from "./version.js";
import { registerAuthTools } from "./tools/auth.js";
import { registerUploadTools } from "./tools/upload.js";
import { registerDistributionTools } from "./tools/distributions.js";
import { registerUdidTools } from "./tools/udids.js";
import { registerNotificationTools } from "./tools/notifications.js";
import { registerMemberTools } from "./tools/members.js";
import { registerSharedTeamTools } from "./tools/shared-teams.js";
import { registerAppTools } from "./tools/apps.js";
import { registerAppMemberTools } from "./tools/app-members.js";
import { registerKeystoreTools } from "./tools/keystores.js";
import { registerUserTools } from "./tools/users.js";
import { registerProjectTools } from "./tools/projects.js";
import { registerWorkspaceMemberTools } from "./tools/workspace-members.js";

const tokenStore = new TokenStore();
const stored = await tokenStore.load();
const client = new DeployGateClient(stored?.token);

const server = new McpServer({
  name: "deploygate",
  version: VERSION,
});

registerAuthTools(server, client, tokenStore);
registerUploadTools(server, client);
registerDistributionTools(server, client);
registerUdidTools(server, client);
registerNotificationTools(server);
registerMemberTools(server, client);
registerSharedTeamTools(server, client);
registerAppTools(server, client);
registerAppMemberTools(server, client);
registerKeystoreTools(server, client);
registerUserTools(server, client);
registerProjectTools(server, client);
registerWorkspaceMemberTools(server, client);

const transport = new StdioServerTransport();
await server.connect(transport);
