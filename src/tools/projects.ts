import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { DeployGateClient } from "../client.js";

const projectArg = z.string().describe("Project (organization) name");

export function registerProjectTools(
  server: McpServer,
  client: DeployGateClient,
): void {
  server.tool(
    "get_project",
    "Get a project (organization)'s details (id, name, description). Returns 403 if your API token lacks access to the project, or 401 if the project's plan has expired.",
    { project: projectArg },
    async (args) => {
      const results = await client.getProject(args.project);
      return { content: [{ type: "text", text: JSON.stringify(results, null, 2) }] };
    },
  );

  server.tool(
    "update_project",
    "Update a project (organization)'s display name and/or description. Provide at least one of display_name or description. Returns 400 on validation failure, or 403 if you lack permission on the project.",
    {
      project: projectArg,
      display_name: z
        .string()
        .optional()
        .describe("New display name for the project"),
      description: z
        .string()
        .optional()
        .describe("New description for the project"),
    },
    async (args) => {
      const results = await client.updateProject(args.project, {
        display_name: args.display_name,
        description: args.description,
      });
      return { content: [{ type: "text", text: JSON.stringify(results, null, 2) }] };
    },
  );

  server.tool(
    "delete_project",
    "Delete a project (organization). DESTRUCTIVE and irreversible: removes the project and disables all of its pending invitations. Returns 403 if you lack permission, or 422 if deletion fails.",
    { project: projectArg },
    async (args) => {
      const results = await client.deleteProject(args.project);
      return { content: [{ type: "text", text: JSON.stringify(results, null, 2) }] };
    },
  );

  server.tool(
    "list_project_apps",
    "List the apps in a project (organization) that are visible to your API token. Returns 403 if you lack access to the project.",
    { project: projectArg },
    async (args) => {
      const results = await client.listProjectApps(args.project);
      return { content: [{ type: "text", text: JSON.stringify(results, null, 2) }] };
    },
  );

  server.tool(
    "list_project_members",
    "List all users that belong to a project (organization). Returns 403 if you lack permission on the project. (To list members of a single team, use list_members.)",
    { project: projectArg },
    async (args) => {
      const results = await client.listProjectMembers(args.project);
      return { content: [{ type: "text", text: JSON.stringify(results, null, 2) }] };
    },
  );
}
