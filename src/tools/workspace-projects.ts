import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { DeployGateClient } from "../client.js";

const workspaceArg = z.string().describe("Workspace (enterprise) name");
const projectArg = z.string().describe("Project (organization) name");

export function registerWorkspaceProjectTools(
  server: McpServer,
  client: DeployGateClient,
): void {
  server.tool(
    "list_workspace_projects",
    "List the projects (organizations) under a workspace (enterprise). Requires workspace management permission.",
    { workspace: workspaceArg },
    async (args) => {
      const results = await client.listWorkspaceProjects(args.workspace);
      return { content: [{ type: "text", text: JSON.stringify(results, null, 2) }] };
    },
  );

  server.tool(
    "create_project",
    "Create a new project (organization) in a workspace (enterprise). Requires workspace management permission (a workspace API key is also accepted). 'name' must be 3-28 chars (letters/digits/hyphens/underscores, starting and ending with a letter or digit) and GLOBALLY unique (400 if already in use). 'owner_name_or_email' must be an existing workspace member (404 otherwise). 403 if the plan's project limit is exceeded. display_name defaults to name.",
    {
      workspace: workspaceArg,
      owner_name_or_email: z.string().describe("Workspace member to set as the project owner (username or email)"),
      name: z.string().describe("Project name (3-28 chars, globally unique)"),
      display_name: z.string().optional().describe("Optional display name (defaults to name)"),
      description: z.string().optional().describe("Optional description"),
    },
    async (args) => {
      const results = await client.createProject(args.workspace, {
        owner_name_or_email: args.owner_name_or_email,
        name: args.name,
        display_name: args.display_name,
        description: args.description,
      });
      return { content: [{ type: "text", text: JSON.stringify(results, null, 2) }] };
    },
  );

  server.tool(
    "list_workspace_project_members",
    "List the members of a project (organization) within a workspace. Returns 401/403 if you lack permission.",
    { workspace: workspaceArg, project: projectArg },
    async (args) => {
      const results = await client.listWorkspaceProjectMembers(args.workspace, args.project);
      return { content: [{ type: "text", text: JSON.stringify(results, null, 2) }] };
    },
  );

  server.tool(
    "add_project_member",
    "Add a workspace member to a project (organization) as a direct project member. The user must already be a workspace member (401 otherwise); 403 if you lack permission. This is the project-level membership; to add to a specific team use add_team_member.",
    {
      workspace: workspaceArg,
      project: projectArg,
      user: z.string().describe("Workspace member to add (username or email)"),
    },
    async (args) => {
      const results = await client.addProjectMember(args.workspace, args.project, args.user);
      return { content: [{ type: "text", text: JSON.stringify(results, null, 2) }] };
    },
  );

  server.tool(
    "remove_project_member",
    "Remove a member from a project (organization). DESTRUCTIVE. Returns 403 if the user is not a project member or you lack permission. This removes project-level membership; to remove from a single team use remove_team_member.",
    {
      workspace: workspaceArg,
      project: projectArg,
      user: z.string().describe("Member to remove (username or email)"),
    },
    async (args) => {
      const results = await client.removeProjectMember(args.workspace, args.project, args.user);
      return { content: [{ type: "text", text: JSON.stringify(results, null, 2) }] };
    },
  );
}
