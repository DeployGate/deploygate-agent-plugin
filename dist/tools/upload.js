import { z } from "zod";
export function registerUploadTools(server, client) {
    server.tool("upload_app", "Upload an app binary (IPA/APK/AAB) to DeployGate. Optionally specify a distribution page to update. If both distribution_key and distribution_name are specified, distribution_key takes priority and distribution_name is ignored. When distribution_name creates a new page, it is created with active=false.", {
        owner_name: z.string().describe("Owner name (user or organization)"),
        file_path: z
            .string()
            .describe("Absolute path to the app binary (IPA/APK/AAB)"),
        message: z
            .string()
            .max(32766)
            .optional()
            .describe("Short description of this build (e.g. branch name, commit hash). Max 32,766 bytes; auto-truncated if exceeded (response includes a warning)."),
        distribution_key: z
            .string()
            .max(255)
            .optional()
            .describe("Distribution page key (access_key) to update. Takes priority over distribution_name."),
        distribution_name: z
            .string()
            .max(255)
            .optional()
            .describe("Distribution page name. Creates a new page if not found (with active=false). Ignored if distribution_key is also specified."),
        release_note: z
            .string()
            .optional()
            .describe("Release note for the distribution page"),
        disable_notify: z
            .boolean()
            .optional()
            .describe("Disable push notification to testers (iOS only)"),
        ios_simulator_zip: z
            .string()
            .optional()
            .describe("Absolute path to the iOS simulator build zip file. Enables Instant Device (browser-based app preview). Build with `xcodebuild -sdk iphonesimulator` and zip the .app directory. Must be uploaded together with an IPA (file_path)."),
    }, async (args) => {
        const results = await client.uploadApp(args.owner_name, args.file_path, {
            message: args.message,
            distribution_key: args.distribution_key,
            distribution_name: args.distribution_name,
            release_note: args.release_note,
            disable_notify: args.disable_notify,
            ios_simulator_zip: args.ios_simulator_zip,
        });
        return {
            content: [{ type: "text", text: JSON.stringify(results, null, 2) }],
        };
    });
}
//# sourceMappingURL=upload.js.map