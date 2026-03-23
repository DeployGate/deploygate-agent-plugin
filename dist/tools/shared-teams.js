import { z } from "zod";
export function registerSharedTeamTools(server, client) {
    server.tool("create_shared_team", "Create a workspace-level shared team. Shared teams can be reused across multiple projects and apps. When assigned to an app, members get tester-level access.", {
        workspace: z.string().describe("Workspace (enterprise) name"),
        name: z.string().describe("Shared team name (e.g. 'all staff')"),
    }, async (args) => {
        const results = await client.createSharedTeam(args.workspace, args.name);
        return {
            content: [{ type: "text", text: JSON.stringify(results, null, 2) }],
        };
    });
    server.tool("add_shared_team_member", "Add a member to a shared team. Specify either email or username, but not both.", {
        workspace: z.string().describe("Workspace (enterprise) name"),
        shared_team_id: z.string().describe("Shared team ID"),
        email: z
            .string()
            .optional()
            .describe("Member's email address (specify either email or username, not both)"),
        username: z
            .string()
            .optional()
            .describe("Member's username (specify either email or username, not both)"),
        description: z
            .string()
            .max(255)
            .optional()
            .describe("Optional description for the member"),
    }, async (args) => {
        if ((!args.email && !args.username) || (args.email && args.username)) {
            return {
                content: [
                    {
                        type: "text",
                        text: "Error: Specify either email or username, but not both",
                    },
                ],
                isError: true,
            };
        }
        const results = await client.addSharedTeamMember(args.workspace, args.shared_team_id, {
            email: args.email,
            username: args.username,
            description: args.description,
        });
        return {
            content: [{ type: "text", text: JSON.stringify(results, null, 2) }],
        };
    });
    server.tool("assign_shared_team_to_app", "Assign a shared team to an app. Members of the shared team will get tester-level access to the app.", {
        project: z.string().describe("Project (organization) name"),
        platform: z.enum(["ios", "android"]).describe("App platform"),
        app_id: z
            .string()
            .describe("App ID (package name or bundle identifier)"),
        team: z.string().describe("Shared team name to assign"),
    }, async (args) => {
        const results = await client.assignSharedTeamToApp(args.project, args.platform, args.app_id, args.team);
        return {
            content: [{ type: "text", text: JSON.stringify(results, null, 2) }],
        };
    });
}
//# sourceMappingURL=shared-teams.js.map