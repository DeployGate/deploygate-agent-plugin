import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { DeployGateApiError, DeployGateClient } from "../client.js";

export function registerMemberTools(
  server: McpServer,
  client: DeployGateClient,
): void {
  server.tool(
    "add_member",
    "Add a member to a DeployGate project with the specified role. This orchestrates multiple API calls: (1) add to workspace, (2) add to project, (3) add to team. For testers, also (4) assigns the tester team to the specified app. Handles duplicates gracefully: workspace returns 400 (already_joined_member) which is skipped, project/team additions are upserts (silent success). Free plan has a 2-member limit; exceeding it returns a 403 with upgrade guidance.",
    {
      workspace: z.string().describe("Workspace (enterprise) name"),
      project: z.string().describe("Project (organization) name"),
      user: z
        .string()
        .describe("User to add (email address or username)"),
      role: z
        .enum(["owner", "developer", "tester"])
        .describe("Role to assign: owner, developer, or tester"),
      platform: z
        .enum(["ios", "android"])
        .optional()
        .describe(
          "App platform (required when role is 'tester' to assign the tester team to the app)",
        ),
      app_id: z
        .string()
        .optional()
        .describe(
          "App ID (required when role is 'tester' to assign the tester team to the app)",
        ),
    },
    async (args) => {
      if (args.role === "tester" && (!args.platform || !args.app_id)) {
        return {
          content: [
            {
              type: "text",
              text: "Error: platform and app_id are required when adding a tester (needed to assign the tester team to the app)",
            },
          ],
          isError: true,
        };
      }

      const steps: string[] = [];

      // Step 1: Add to workspace
      try {
        await client.addWorkspaceMember(args.workspace, args.user);
        steps.push("✓ Added to workspace");
      } catch (e) {
        if (
          e instanceof DeployGateApiError &&
          e.errorType === "already_joined_member"
        ) {
          steps.push("✓ Already in workspace (skipped)");
        } else if (
          e instanceof DeployGateApiError &&
          e.errorType === "num_of_member_seats_exceeded"
        ) {
          return {
            content: [
              {
                type: "text",
                text: "Error: Member seat limit exceeded. Please upgrade your plan to add more members.\nhttps://deploygate.com/settings/plan",
              },
            ],
            isError: true,
          };
        } else {
          throw e;
        }
      }

      // Step 2: Add to project (upsert — no error on duplicate)
      await client.addProjectMember(args.workspace, args.project, args.user);
      steps.push("✓ Added to project");

      // Step 3: Add to team (upsert — no error on duplicate)
      await client.addTeamMember(args.project, args.role, args.user);
      steps.push(`✓ Added to ${args.role} team`);

      // Step 4 (tester only): Assign tester team to app
      if (args.role === "tester" && args.platform && args.app_id) {
        await client.assignTeamToApp(
          args.project,
          args.platform,
          args.app_id,
          "tester",
        );
        steps.push("✓ Tester team assigned to app");
      }

      return {
        content: [
          {
            type: "text",
            text: `Member "${args.user}" added as ${args.role}:\n${steps.join("\n")}`,
          },
        ],
      };
    },
  );

  server.tool(
    "list_members",
    "List members of a specific team in a project. Use a built-in team name ('owner', 'developer', or 'tester') or any custom team name defined in the project.",
    {
      project: z.string().describe("Project (organization) name"),
      team: z
        .string()
        .describe(
          "Team name: 'owner', 'developer', 'tester', or a custom team name",
        ),
    },
    async (args) => {
      const results = await client.listTeamMembers(args.project, args.team);
      return {
        content: [{ type: "text", text: JSON.stringify(results, null, 2) }],
      };
    },
  );

  server.tool(
    "add_team_member",
    "Add a user to a specific team in a project. This is the ATOMIC single-step operation — it does NOT add the user to the workspace/project first, nor attach the team to an app. The user must already be a project member; otherwise the API rejects the request. Use this for adding to custom team names (or any single team). For the multi-step onboarding flow with the built-in roles (owner/developer/tester), use `add_member` instead.",
    {
      project: z.string().describe("Project (organization) name"),
      team: z
        .string()
        .describe(
          "Team to add the user to: 'owner', 'developer', 'tester', or a custom team name",
        ),
      user: z
        .string()
        .describe("User to add (email address or username)"),
    },
    async (args) => {
      const results = await client.addTeamMember(
        args.project,
        args.team,
        args.user,
      );
      return {
        content: [
          {
            type: "text",
            text: `Member "${args.user}" added to ${args.team} team.\n${JSON.stringify(results, null, 2)}`,
          },
        ],
      };
    },
  );

  server.tool(
    "remove_member",
    "Remove a member from a team. This removes the user from the specified team only; they remain in the workspace and project. Accepts a built-in team name ('owner', 'developer', 'tester') or any custom team name defined in the project.",
    {
      project: z.string().describe("Project (organization) name"),
      team: z
        .string()
        .describe(
          "Team to remove the member from: 'owner', 'developer', 'tester', or a custom team name",
        ),
      user: z
        .string()
        .describe("User to remove (email address or username)"),
    },
    async (args) => {
      const results = await client.removeTeamMember(
        args.project,
        args.team,
        args.user,
      );
      return {
        content: [
          {
            type: "text",
            text: `Member "${args.user}" removed from ${args.team} team.\n${JSON.stringify(results, null, 2)}`,
          },
        ],
      };
    },
  );
}
