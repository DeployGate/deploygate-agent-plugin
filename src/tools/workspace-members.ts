import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { DeployGateClient } from "../client.js";

const workspaceArg = z.string().describe("Workspace (enterprise) name");

export function registerWorkspaceMemberTools(
  server: McpServer,
  client: DeployGateClient,
): void {
  server.tool(
    "list_workspace_members",
    "List all members of a workspace (enterprise). Requires workspace management permission (403/404 otherwise).",
    { workspace: workspaceArg },
    async (args) => {
      const results = await client.listWorkspaceMembers(args.workspace);
      return { content: [{ type: "text", text: JSON.stringify(results, null, 2) }] };
    },
  );

  server.tool(
    "get_workspace_member",
    "Get a single workspace (enterprise) member by name or email (must be at least 3 characters). Returns 400 if no matching member is found.",
    { workspace: workspaceArg, id: z.string().describe("Member name or email") },
    async (args) => {
      const results = await client.getWorkspaceMember(args.workspace, args.id);
      return { content: [{ type: "text", text: JSON.stringify(results, null, 2) }] };
    },
  );

  server.tool(
    "add_workspace_member",
    "Invite/add a member to a workspace (enterprise) by email address. Requires workspace invite permission (a workspace API key is also accepted). Returns 400 if already a member, 403 if you lack invite permission or the plan's member seats are exceeded.",
    {
      workspace: workspaceArg,
      user: z.string().describe("Email address of the user to invite (inviting an existing user by username is deprecated)"),
      full_name: z.string().optional().describe("Optional full name for the invitee"),
      role: z.string().optional().describe("Optional role; 'guest' invites a guest member but is available only to certain partner workspaces"),
    },
    async (args) => {
      const results = await client.addWorkspaceMember(args.workspace, args.user, {
        full_name: args.full_name,
        role: args.role,
      });
      return { content: [{ type: "text", text: JSON.stringify(results, null, 2) }] };
    },
  );

  server.tool(
    "remove_workspace_member",
    "Remove a member from a workspace (enterprise) entirely. Requires workspace management permission (a workspace API key is also accepted). DESTRUCTIVE. You cannot remove yourself (403); a non-member returns 400.",
    { workspace: workspaceArg, user: z.string().describe("Member name or email to remove") },
    async (args) => {
      const results = await client.removeWorkspaceMember(args.workspace, args.user);
      return { content: [{ type: "text", text: JSON.stringify(results, null, 2) }] };
    },
  );
}
