import { describe, it, expect } from "vitest";
import { readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";

const ROOT = resolve(import.meta.dirname, "../..");

function loadSkill(relativePath: string): string {
  return readFileSync(resolve(ROOT, relativePath), "utf-8");
}

// All MCP tool names implemented in src/tools/
const IMPLEMENTED_TOOLS = [
  "set_api_token",
  "get_user_info",
  "upload_app",
  "create_distribution",
  "list_distributions",
  "get_distribution",
  "update_distribution",
  "delete_distribution",
  "get_udids",
  "get_notification_settings_url",
  "add_member",
  "list_members",
  "remove_member",
  "create_shared_team",
  "add_shared_team_member",
  "assign_shared_team_to_app",
];

describe("skills/setup/SKILL.md", () => {
  const content = loadSkill("plugin/skills/setup/SKILL.md");

  it("exists and is non-empty", () => {
    expect(content.length).toBeGreaterThan(0);
  });

  it("references only implemented MCP tools", () => {
    const toolRefs = [
      "set_api_token",
      "get_user_info",
      "upload_app",
      "create_distribution",
      "get_notification_settings_url",
      "get_udids",
      "add_member",
      "create_shared_team",
      "assign_shared_team_to_app",
    ];
    for (const tool of toolRefs) {
      expect(content).toContain(tool);
      expect(IMPLEMENTED_TOOLS).toContain(tool);
    }
  });

  it("contains correct signup URL", () => {
    expect(content).toContain(
      "https://deploygate.com/app/register/signup",
    );
  });

  it("contains correct API key settings URL", () => {
    expect(content).toContain("https://deploygate.com/settings");
  });

  it("contains distribution URL pattern", () => {
    expect(content).toContain(
      "https://deploygate.com/distributions/",
    );
  });
});

describe("skills/ci-setup/SKILL.md", () => {
  const content = loadSkill("plugin/skills/ci-setup/SKILL.md");

  it("exists and is non-empty", () => {
    expect(content.length).toBeGreaterThan(0);
  });

  it("references templates/deploygate-upload.yml", () => {
    expect(content).toContain("templates/deploygate-upload.yml");
  });

  it("references templates/deploygate-pr.yml", () => {
    expect(content).toContain("templates/deploygate-pr.yml");
  });

  it("referenced template files actually exist", () => {
    expect(
      existsSync(resolve(ROOT, "plugin/templates/deploygate-upload.yml")),
    ).toBe(true);
    expect(
      existsSync(resolve(ROOT, "plugin/templates/deploygate-pr.yml")),
    ).toBe(true);
  });
});

describe("skills/sdk-setup/SKILL.md", () => {
  const content = loadSkill("plugin/skills/sdk-setup/SKILL.md");

  it("exists and is non-empty", () => {
    expect(content.length).toBeGreaterThan(0);
  });

  it("contains Android SDK dependency with version", () => {
    expect(content).toMatch(/com\.deploygate:sdk:\d+\.\d+\.\d+/);
  });

  it("contains Android SDK mock dependency", () => {
    expect(content).toMatch(/com\.deploygate:sdk-mock:\d+\.\d+\.\d+/);
  });

  it("notes iOS SDK is not recommended", () => {
    expect(content).toContain("not recommended");
  });

  it("contains gradle-deploygate-plugin reference", () => {
    expect(content).toContain("com.deploygate.gradle");
  });
});
