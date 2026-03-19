import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { parse } from "yaml";

const ROOT = resolve(import.meta.dirname, "../..");

function loadYaml(relativePath: string): Record<string, unknown> {
  const content = readFileSync(resolve(ROOT, relativePath), "utf-8");
  return parse(content) as Record<string, unknown>;
}

function loadRaw(relativePath: string): string {
  return readFileSync(resolve(ROOT, relativePath), "utf-8");
}

describe("templates/deploygate-upload.yml", () => {
  const yaml = loadYaml("templates/deploygate-upload.yml");
  const raw = loadRaw("templates/deploygate-upload.yml");

  it("is valid YAML", () => {
    expect(yaml).toBeDefined();
    expect(typeof yaml).toBe("object");
  });

  it("has on.push trigger", () => {
    const on = yaml.on as Record<string, unknown>;
    expect(on).toBeDefined();
    expect(on.push).toBeDefined();
  });

  it("includes DeployGate upload action step", () => {
    expect(raw).toContain("DeployGate/deploygate-upload-github-action");
  });

  it("references DEPLOYGATE_API_TOKEN secret", () => {
    expect(raw).toContain("secrets.DEPLOYGATE_API_TOKEN");
  });

  it("references DEPLOYGATE_OWNER_NAME secret", () => {
    expect(raw).toContain("secrets.DEPLOYGATE_OWNER_NAME");
  });
});

describe("templates/deploygate-pr.yml", () => {
  const yaml = loadYaml("templates/deploygate-pr.yml");
  const raw = loadRaw("templates/deploygate-pr.yml");

  it("is valid YAML", () => {
    expect(yaml).toBeDefined();
    expect(typeof yaml).toBe("object");
  });

  it("has on.pull_request trigger with required types", () => {
    const on = yaml.on as Record<string, unknown>;
    expect(on).toBeDefined();
    const pr = on.pull_request as Record<string, unknown>;
    expect(pr).toBeDefined();
    const types = pr.types as string[];
    expect(types).toContain("opened");
    expect(types).toContain("synchronize");
    expect(types).toContain("closed");
  });

  it("has deploy and cleanup jobs", () => {
    const jobs = yaml.jobs as Record<string, unknown>;
    expect(jobs).toBeDefined();
    expect(jobs.deploy).toBeDefined();
    expect(jobs.cleanup).toBeDefined();
  });

  it("includes PR comment search logic for access_key metadata", () => {
    expect(raw).toContain("<!-- deploygate:access_key=");
  });

  it("includes DELETE API call in cleanup job", () => {
    expect(raw).toContain("DELETE");
    expect(raw).toContain("/api/distributions/");
  });

  it("references required secrets", () => {
    expect(raw).toContain("secrets.DEPLOYGATE_API_TOKEN");
    expect(raw).toContain("secrets.DEPLOYGATE_OWNER_NAME");
  });

  it("includes DeployGate upload action step", () => {
    expect(raw).toContain("DeployGate/deploygate-upload-github-action");
  });

  it("creates GitHub Deployment", () => {
    expect(raw).toContain("createDeployment");
    expect(raw).toContain("createDeploymentStatus");
  });
});
