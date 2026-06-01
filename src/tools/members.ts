import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { DeployGateApiError, DeployGateClient } from "../client.js";

export function registerMemberTools(
  server: McpServer,
  client: DeployGateClient,
): void {
  server.tool(
    "add_member",
    "Onboarding shortcut for initial project setup. Adds a user with one of the three roles backed by the standard auto-created teams (owner / developer / tester) by orchestrating: (1) add to workspace, (2) add to project, (3) add to the role team, and (4) for non-owner roles, attach the role team to the specified app so the new member can access it. Owner role members have project-wide app access by design, so step (4) is skipped for owner. Standard team display names are locale-dependent (e.g. 'テスター' in Japanese workspaces); this tool resolves the role team by its stable `role` keyword so it works across locales. Handles duplicates gracefully (workspace `already_joined_member` is skipped; project/team additions are upserts). Free plan has a 2-member limit; exceeding it returns a 403 with upgrade guidance.",
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
          "App platform (required for non-owner roles, to attach the role team to the app)",
        ),
      app_id: z
        .string()
        .optional()
        .describe(
          "App ID (required for non-owner roles, to attach the role team to the app)",
        ),
    },
    async (args) => {
      if (args.role !== "owner" && (!args.platform || !args.app_id)) {
        return {
          content: [
            {
              type: "text",
              text: `Error: platform and app_id are required when adding a ${args.role} (needed to attach the ${args.role} team to the app — only the owner role has project-wide app access)`,
            },
          ],
          isError: true,
        };
      }

      const steps: string[] = [];

      // Step 0: Resolve the standard role team's actual name. Display names are
      // locale-dependent (e.g. "Tester" / "テスター"); the `role` field is the
      // locale-independent identifier.
      const projectInfo = (await client.getProject(args.project)) as {
        organization?: { teams?: Array<{ name: string; role: string }> };
      };
      const teams = projectInfo?.organization?.teams ?? [];
      const roleTeam = teams.find((t) => t.role === args.role);
      if (!roleTeam) {
        return {
          content: [
            {
              type: "text",
              text: `Error: no team with role "${args.role}" found in project "${args.project}".`,
            },
          ],
          isError: true,
        };
      }
      const teamName = roleTeam.name;

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

      // Step 3: Add to the role team (upsert — no error on duplicate)
      await client.addTeamMember(args.project, teamName, args.user);
      steps.push(`✓ Added to ${teamName} team`);

      // Step 4 (non-owner only): Attach the role team to the app so the member
      // can access it. Owner role grants project-wide app access already.
      if (args.role !== "owner" && args.platform && args.app_id) {
        await client.assignTeamToApp(
          args.project,
          args.platform,
          args.app_id,
          teamName,
        );
        steps.push(`✓ ${teamName} team attached to app`);
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
    "list_team_members",
    "List members of a specific team in a project. The `team` parameter is the team's actual display name (case-insensitive). Run `get_project` to discover team names in the project; auto-created team names are locale-dependent (e.g. 'Tester' / 'テスター') and any team can be renamed.",
    {
      project: z.string().describe("Project (organization) name"),
      team: z
        .string()
        .describe(
          "Team display name (case-insensitive). Discover available teams via `get_project`.",
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
    "Add a user to a specific team in a project. This is the ATOMIC single-step operation — it does NOT add the user to the workspace/project first, nor attach the team to an app. The user must already be a project member; otherwise the API rejects the request. For the multi-step onboarding flow that adds to workspace + project + role team (owner/developer/tester) and attaches the role team to a target app, use `add_member` instead. Run `get_project` to discover team names in the project.",
    {
      project: z.string().describe("Project (organization) name"),
      team: z
        .string()
        .describe(
          "Team display name (case-insensitive). Discover available teams via `get_project`.",
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
    "remove_team_member",
    "Remove a member from a team. This removes the user from the specified team only; they remain in the workspace and project. The `team` parameter is the team's actual display name (case-insensitive). Run `get_project` to discover team names; auto-created team names are locale-dependent (e.g. 'Tester' / 'テスター').",
    {
      project: z.string().describe("Project (organization) name"),
      team: z
        .string()
        .describe(
          "Team display name (case-insensitive). Discover available teams via `get_project`.",
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
