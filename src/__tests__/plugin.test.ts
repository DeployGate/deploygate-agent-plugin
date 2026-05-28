import { describe, it, expect } from "vitest";
import { readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";

const ROOT = resolve(import.meta.dirname, "../..");

function loadJson(relativePath: string): Record<string, unknown> {
  const content = readFileSync(resolve(ROOT, relativePath), "utf-8");
  return JSON.parse(content) as Record<string, unknown>;
}

describe("plugin/.codex-plugin/plugin.json", () => {
  const plugin = loadJson("plugin/.codex-plugin/plugin.json");

  it("is valid JSON with required fields", () => {
    expect(plugin.name).toBe("deploygate");
    expect(plugin.version).toBeDefined();
    expect(plugin.description).toBeDefined();
    expect(plugin.author).toBeDefined();
    expect(plugin.skills).toBeDefined();
    expect(plugin.mcpServers).toBeDefined();
    expect(plugin.interface).toBeDefined();
  });

  it("has valid semver version", () => {
    expect(plugin.version).toMatch(/^\d+\.\d+\.\d+$/);
  });

  it("has author with name and email", () => {
    const author = plugin.author as Record<string, string>;
    expect(author.name).toBeDefined();
    expect(author.email).toBeDefined();
    expect(author.url).toBeDefined();
  });

  it("skills path points to an existing directory", () => {
    const skillsPath = (plugin.skills as string).replace(/^\.\//, "");
    expect(existsSync(resolve(ROOT, "plugin", skillsPath))).toBe(true);
  });

  it("mcpServers path points to an existing file", () => {
    const mcpPath = (plugin.mcpServers as string).replace(/^\.\//, "");
    expect(existsSync(resolve(ROOT, "plugin", mcpPath))).toBe(true);
  });

  it("has homepage and license", () => {
    expect(plugin.homepage).toBeDefined();
    expect(plugin.license).toBe("MIT");
  });

  it("has Codex interface metadata", () => {
    const iface = plugin.interface as Record<string, unknown>;
    expect(iface.displayName).toBe("DeployGate");
    expect(iface.shortDescription).toBeDefined();
    expect(iface.longDescription).toBeDefined();
    expect(iface.developerName).toBe("DeployGate");
    expect(iface.category).toBe("Coding");
    expect(iface.websiteURL).toBeDefined();
    expect(iface.privacyPolicyURL).toBe("https://deploygate.com/terms/privacy");
    expect(iface.termsOfServiceURL).toBe("https://deploygate.com/terms");
    expect(iface.brandColor).toBe("#19B368");
  });

  it("has keywords array", () => {
    const keywords = plugin.keywords as string[];
    expect(Array.isArray(keywords)).toBe(true);
    expect(keywords.length).toBeGreaterThan(0);
    expect(keywords).toContain("deploygate");
  });
});

describe("plugin/.claude-plugin/plugin.json", () => {
  const plugin = loadJson("plugin/.claude-plugin/plugin.json");

  it("keeps the legacy Claude Code manifest for dual-client support", () => {
    expect(plugin.name).toBe("deploygate");
    expect(plugin.version).toBeDefined();
    expect(plugin.skills).toBe("./skills/");
    expect(plugin.mcpServers).toBe("./.mcp.json");
  });
});

describe(".claude-plugin/marketplace.json", () => {
  const marketplace = loadJson(".claude-plugin/marketplace.json");

  it("keeps the Claude Code marketplace entry for dual-client support", () => {
    const plugins = marketplace.plugins as Array<Record<string, unknown>>;
    expect(marketplace.name).toBe("deploygate-marketplace");
    expect(plugins[0].name).toBe("deploygate");
    expect(plugins[0].source).toBe("./plugin");
  });
});

describe(".agents/plugins/marketplace.json", () => {
  const marketplace = loadJson(".agents/plugins/marketplace.json");

  it("is valid JSON with required fields", () => {
    expect(marketplace.name).toBeDefined();
    expect(marketplace.interface).toBeDefined();
    expect(marketplace.plugins).toBeDefined();
  });

  it("has plugins array with local source './plugin'", () => {
    const plugins = marketplace.plugins as Array<Record<string, unknown>>;
    expect(Array.isArray(plugins)).toBe(true);
    expect(plugins.length).toBeGreaterThan(0);
    expect(plugins[0].name).toBe("deploygate");
    expect(plugins[0].source).toEqual({
      source: "local",
      path: "./plugin",
    });
  });

  it("has Codex installation policy and category", () => {
    const plugins = marketplace.plugins as Array<Record<string, unknown>>;
    expect(plugins[0].policy).toEqual({
      installation: "AVAILABLE",
      authentication: "ON_INSTALL",
    });
    expect(plugins[0].category).toBe("Coding");
  });
});

describe("plugin/.mcp.json", () => {
  const mcp = loadJson("plugin/.mcp.json");

  it("is valid JSON", () => {
    expect(mcp).toBeDefined();
  });

  it("defines deploygate MCP server", () => {
    const servers = mcp.mcpServers as Record<string, unknown>;
    expect(servers).toBeDefined();
    expect(servers.deploygate).toBeDefined();
  });

  it("uses a Codex-compatible portable entry point resolver", () => {
    const servers = mcp.mcpServers as Record<
      string,
      Record<string, unknown>
    >;
    const dg = servers.deploygate;
    expect(dg.command).toBe("node");
    const args = dg.args as string[];
    expect(args).toHaveLength(2);
    expect(args[0]).toBe("-e");
    expect(args[1]).toContain("CODEX_PLUGIN_ROOT");
    expect(args[1]).toContain("CLAUDE_PLUGIN_ROOT");
    expect(args[1]).toContain("scripts");
    expect(args[1]).toContain("bundle.js");
    expect(dg.cwd).toBe(".");
  });

  it("does not pass DEPLOYGATE_API_TOKEN through env", () => {
    const servers = mcp.mcpServers as Record<
      string,
      Record<string, unknown>
    >;
    expect(servers.deploygate.env).toBeUndefined();
  });
});

describe("plugin/skills/ (slash commands)", () => {
  it("skills/setup/SKILL.md exists", () => {
    expect(existsSync(resolve(ROOT, "plugin/skills/setup/SKILL.md"))).toBe(true);
  });

  it("skills/deploy/SKILL.md exists", () => {
    expect(existsSync(resolve(ROOT, "plugin/skills/deploy/SKILL.md"))).toBe(true);
  });

  it("setup skill contains full content (progress display, phases)", () => {
    const content = readFileSync(
      resolve(ROOT, "plugin/skills/setup/SKILL.md"),
      "utf-8",
    );
    expect(content).toContain("Progress Display");
    expect(content).toContain("Phase 1");
    expect(content).toContain("login_start");
  });

  it("deploy skill contains upload instructions", () => {
    const content = readFileSync(
      resolve(ROOT, "plugin/skills/deploy/SKILL.md"),
      "utf-8",
    );
    expect(content).toContain("upload_app");
  });
});

describe("npm package (@deploygate/mcp standalone)", () => {
  const pkg = loadJson("package.json");

  it("is named @deploygate/mcp", () => {
    expect(pkg.name).toBe("@deploygate/mcp");
  });

  it("bin deploygate-mcp points at the committed zero-dep bundle, which exists and starts with a node shebang", () => {
    const bin = pkg.bin as Record<string, string>;
    expect(bin["deploygate-mcp"]).toBe("plugin/scripts/bundle.js");
    const bundlePath = resolve(ROOT, bin["deploygate-mcp"]);
    expect(existsSync(bundlePath)).toBe(true);
    expect(
      readFileSync(bundlePath, "utf-8").startsWith("#!/usr/bin/env node"),
    ).toBe(true);
  });

  it("ships only the bundle, README, and LICENSE (no plugin/agent dirs)", () => {
    const files = pkg.files as string[];
    expect(files).toContain("plugin/scripts/bundle.js");
    expect(files).not.toContain("plugin/");
    expect(files).not.toContain(".agents/");
    expect(files).not.toContain(".claude-plugin/");
  });

  it("publishes the scoped package publicly", () => {
    const publishConfig = pkg.publishConfig as Record<string, string> | undefined;
    expect(publishConfig?.access).toBe("public");
  });

  it("has zero runtime dependencies; sdk and zod live in devDependencies", () => {
    expect(pkg.dependencies ?? {}).toEqual({});
    const dev = pkg.devDependencies as Record<string, string>;
    expect(dev["@modelcontextprotocol/sdk"]).toBeDefined();
    expect(dev["zod"]).toBeDefined();
  });

  it("does not expose a library main entry", () => {
    expect(pkg.main).toBeUndefined();
  });
});

describe("version sync across release manifests", () => {
  it("package.json, both plugin.json files, the marketplace entry, and the release-please manifest share the same version", () => {
    const pkg = loadJson("package.json");
    const codexPlugin = loadJson("plugin/.codex-plugin/plugin.json");
    const claudePlugin = loadJson("plugin/.claude-plugin/plugin.json");
    const marketplace = loadJson(".claude-plugin/marketplace.json");
    const manifest = loadJson(".release-please-manifest.json");

    const version = pkg.version as string;
    expect(version).toMatch(/^\d+\.\d+\.\d+$/);
    expect(codexPlugin.version).toBe(version);
    expect(claudePlugin.version).toBe(version);
    const plugins = marketplace.plugins as Array<{ name: string; version: string }>;
    const deploygateEntry = plugins.find((p) => p.name === "deploygate");
    expect(deploygateEntry?.version).toBe(version);
    expect(manifest["."]).toBe(version);
  });
});
