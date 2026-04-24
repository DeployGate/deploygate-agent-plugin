#!/usr/bin/env node

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { DeployGateClient } from "./client.js";
import { TokenStore } from "./token-store.js";
import { registerAuthTools } from "./tools/auth.js";
import { registerUploadTools } from "./tools/upload.js";
import { registerDistributionTools } from "./tools/distributions.js";
import { registerUdidTools } from "./tools/udids.js";
import { registerNotificationTools } from "./tools/notifications.js";
import { registerMemberTools } from "./tools/members.js";
import { registerSharedTeamTools } from "./tools/shared-teams.js";

const tokenStore = new TokenStore();
const stored = await tokenStore.load();
const client = new DeployGateClient(stored?.token);

const server = new McpServer({
  name: "deploygate",
  version: "1.0.0",
});

registerAuthTools(server, client, tokenStore);
registerUploadTools(server, client);
registerDistributionTools(server, client);
registerUdidTools(server, client);
registerNotificationTools(server);
registerMemberTools(server, client);
registerSharedTeamTools(server, client);

const transport = new StdioServerTransport();
await server.connect(transport);
