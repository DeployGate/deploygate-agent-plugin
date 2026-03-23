import { describe, it, expect } from "vitest";
import { readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";

const ROOT = resolve(import.meta.dirname, "../..");

function loadJson(relativePath: string): Record<string, unknown> {
  const content = readFileSync(resolve(ROOT, relativePath), "utf-8");
  return JSON.parse(content) as Record<string, unknown>;
}

describe(".claude-plugin/plugin.json", () => {
  const plugin = loadJson(".claude-plugin/plugin.json");

  it("is valid JSON with required fields", () => {
    expect(plugin.name).toBe("deploygate");
    expect(plugin.version).toBeDefined();
    expect(plugin.description).toBeDefined();
    expect(plugin.author).toBeDefined();
    expect(plugin.skills).toBeDefined();
    expect(plugin.mcpServers).toBeDefined();
  });

  it("has valid semver version", () => {
    expect(plugin.version).toMatch(/^\d+\.\d+\.\d+$/);
  });

  it("has author with name and email", () => {
    const author = plugin.author as Record<string, string>;
    expect(author.name).toBeDefined();
    expect(author.email).toBeDefined();
  });

  it("skills path points to an existing directory", () => {
    const skillsPath = (plugin.skills as string).replace(/^\.\//, "");
    expect(existsSync(resolve(ROOT, skillsPath))).toBe(true);
  });

  it("mcpServers path points to an existing file", () => {
    const mcpPath = (plugin.mcpServers as string).replace(/^\.\//, "");
    expect(existsSync(resolve(ROOT, mcpPath))).toBe(true);
  });

  it("has homepage and license", () => {
    expect(plugin.homepage).toBeDefined();
    expect(plugin.license).toBe("MIT");
  });

  it("has keywords array", () => {
    const keywords = plugin.keywords as string[];
    expect(Array.isArray(keywords)).toBe(true);
    expect(keywords.length).toBeGreaterThan(0);
    expect(keywords).toContain("deploygate");
  });
});

describe(".claude-plugin/marketplace.json", () => {
  const marketplace = loadJson(".claude-plugin/marketplace.json");

  it("is valid JSON with required fields", () => {
    expect(marketplace.name).toBeDefined();
    expect(marketplace.owner).toBeDefined();
    expect(marketplace.plugins).toBeDefined();
  });

  it("has owner with name and email", () => {
    const owner = marketplace.owner as Record<string, string>;
    expect(owner.name).toBeDefined();
    expect(owner.email).toBeDefined();
  });

  it("has plugins array with source '.'", () => {
    const plugins = marketplace.plugins as Array<Record<string, unknown>>;
    expect(Array.isArray(plugins)).toBe(true);
    expect(plugins.length).toBeGreaterThan(0);
    expect(plugins[0].source).toBe("./");
  });

  it("plugin version matches plugin.json version", () => {
    const plugin = loadJson(".claude-plugin/plugin.json");
    const plugins = marketplace.plugins as Array<Record<string, unknown>>;
    expect(plugins[0].version).toBe(plugin.version);
  });
});

describe(".mcp.json", () => {
  const mcp = loadJson(".mcp.json");

  it("is valid JSON", () => {
    expect(mcp).toBeDefined();
  });

  it("defines deploygate MCP server", () => {
    const servers = mcp.mcpServers as Record<string, unknown>;
    expect(servers).toBeDefined();
    expect(servers.deploygate).toBeDefined();
  });

  it("uses ${CLAUDE_PLUGIN_ROOT} for entry point path", () => {
    const servers = mcp.mcpServers as Record<
      string,
      Record<string, unknown>
    >;
    const dg = servers.deploygate;
    expect(dg.command).toBe("node");
    const args = dg.args as string[];
    expect(args).toHaveLength(1);
    expect(args[0]).toBe("${CLAUDE_PLUGIN_ROOT}/dist/bundle.js");
  });

  it("references DEPLOYGATE_API_TOKEN environment variable", () => {
    const servers = mcp.mcpServers as Record<
      string,
      Record<string, unknown>
    >;
    const env = servers.deploygate.env as Record<string, string>;
    expect(env).toBeDefined();
    expect("DEPLOYGATE_API_TOKEN" in env).toBe(true);
  });
});

describe("skills as slash commands", () => {
  it("skills/setup/SKILL.md exists", () => {
    expect(existsSync(resolve(ROOT, "skills/setup/SKILL.md"))).toBe(true);
  });

  it("skills/deploy/SKILL.md exists", () => {
    expect(existsSync(resolve(ROOT, "skills/deploy/SKILL.md"))).toBe(true);
  });

  it("setup skill contains progress display instructions", () => {
    const content = readFileSync(
      resolve(ROOT, "skills/setup/SKILL.md"),
      "utf-8",
    );
    expect(content).toContain("Progress Display");
    expect(content).toContain("Phase 1");
  });

  it("deploy skill contains upload instructions", () => {
    const content = readFileSync(
      resolve(ROOT, "skills/deploy/SKILL.md"),
      "utf-8",
    );
    expect(content).toContain("upload_app");
  });
});
