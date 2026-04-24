import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { resolve, join } from "node:path";

const ROOT = resolve(import.meta.dirname, "../..");

function loadSkill(relativePath: string): string {
  return readFileSync(resolve(ROOT, relativePath), "utf-8");
}

// Concatenate SKILL.md with every markdown file inside the skill directory
// (references/, etc.). Tests validate invariants across the whole skill
// corpus, so references can be split out without breaking these checks.
function loadSkillCorpus(skillDir: string): string {
  const absDir = resolve(ROOT, skillDir);
  const parts: string[] = [];

  function walk(dir: string) {
    for (const entry of readdirSync(dir)) {
      const full = join(dir, entry);
      const st = statSync(full);
      if (st.isDirectory()) {
        walk(full);
      } else if (entry.endsWith(".md")) {
        parts.push(readFileSync(full, "utf-8"));
      }
    }
  }

  walk(absDir);
  return parts.join("\n");
}

// All MCP tool names implemented in src/tools/
const IMPLEMENTED_TOOLS = [
  "login_start",
  "login_wait",
  "logout",
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

describe("skills/setup", () => {
  const main = loadSkill("plugin/skills/setup/SKILL.md");
  const corpus = loadSkillCorpus("plugin/skills/setup");

  it("SKILL.md exists and is non-empty", () => {
    expect(main.length).toBeGreaterThan(0);
  });

  it("references only implemented MCP tools (across SKILL.md + references)", () => {
    const toolRefs = [
      "login_start",
      "login_wait",
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
      expect(corpus).toContain(tool);
      expect(IMPLEMENTED_TOOLS).toContain(tool);
    }
  });

  it("SKILL.md contains correct signup URL", () => {
    expect(main).toContain("https://deploygate.com/app/register/signup");
  });

  it("SKILL.md contains device-auth login flow tools", () => {
    expect(main).toContain("login_start");
    expect(main).toContain("login_wait");
  });

  it("SKILL.md contains distribution URL pattern", () => {
    expect(main).toContain("https://deploygate.com/distributions/");
  });

  it("references directory provides progressive disclosure", () => {
    const referenced = [
      "references/terminology.md",
      "references/ios-build.md",
      "references/ios-udid.md",
      "references/next-steps.md",
      "references/troubleshooting.md",
    ];
    for (const ref of referenced) {
      expect(main).toContain(ref);
      // File must actually exist
      expect(() => loadSkill(`plugin/skills/setup/${ref}`)).not.toThrow();
    }
  });
});

describe("skills/ci-setup", () => {
  const main = loadSkill("plugin/skills/ci-setup/SKILL.md");
  const corpus = loadSkillCorpus("plugin/skills/ci-setup");

  it("SKILL.md exists and is non-empty", () => {
    expect(main.length).toBeGreaterThan(0);
  });

  it("contains inlined upload workflow template (in corpus)", () => {
    expect(corpus).toContain("name: DeployGate Upload");
    expect(corpus).toContain("deploygate-upload-github-action");
  });

  it("contains inlined PR workflow template (in corpus)", () => {
    expect(corpus).toContain("name: DeployGate PR");
    expect(corpus).toContain("deploygate:access_key=");
  });

  it("references directory provides progressive disclosure", () => {
    const referenced = [
      "references/github-actions-upload.md",
      "references/github-actions-pr.md",
      "references/ios-code-signing.md",
      "references/bitrise.md",
      "references/external-ci.md",
      "references/troubleshooting.md",
    ];
    for (const ref of referenced) {
      expect(main).toContain(ref);
      expect(() => loadSkill(`plugin/skills/ci-setup/${ref}`)).not.toThrow();
    }
  });
});

describe("skills allowed-tools frontmatter", () => {
  const skills = ["setup", "deploy", "ci-setup", "sdk-setup"];

  for (const skill of skills) {
    it(`${skill}/SKILL.md declares allowed-tools`, () => {
      const content = loadSkill(`plugin/skills/${skill}/SKILL.md`);
      const frontmatterMatch = content.match(/^---\n([\s\S]*?)\n---/);
      expect(frontmatterMatch).not.toBeNull();
      const frontmatter = frontmatterMatch![1];
      expect(frontmatter).toMatch(/^allowed-tools:\s*\S/m);
    });
  }

  it("setup skill pre-approves MCP deploygate tools (wildcard)", () => {
    const content = loadSkill("plugin/skills/setup/SKILL.md");
    expect(content).toMatch(/allowed-tools:.*mcp__deploygate__\*/);
  });

  it("deploy skill pre-approves upload_app and get_user_info", () => {
    const content = loadSkill("plugin/skills/deploy/SKILL.md");
    expect(content).toContain("mcp__deploygate__upload_app");
    expect(content).toContain("mcp__deploygate__get_user_info");
  });

  it("ci-setup skill pre-approves file-editing tools", () => {
    const content = loadSkill("plugin/skills/ci-setup/SKILL.md");
    expect(content).toMatch(/allowed-tools:.*\bWrite\b/);
    expect(content).toMatch(/allowed-tools:.*\bEdit\b/);
  });

  it("sdk-setup skill pre-approves Edit for build.gradle", () => {
    const content = loadSkill("plugin/skills/sdk-setup/SKILL.md");
    expect(content).toMatch(/allowed-tools:.*\bEdit\b/);
  });
});

describe("skills/deploy delegates to setup skill for complex cases", () => {
  const content = loadSkill("plugin/skills/deploy/SKILL.md");

  it("identifies itself as the fast-path", () => {
    expect(content.toLowerCase()).toContain("fast-path");
  });

  it("tells the model when to escalate to setup", () => {
    expect(content).toMatch(/escalate.*setup/i);
    expect(content).toContain("`setup`");
  });

  it("lists code signing, UDID, and distribution as escalation triggers", () => {
    expect(content.toLowerCase()).toContain("code signing");
    expect(content).toContain("UDID");
    expect(content.toLowerCase()).toContain("distribution page");
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
