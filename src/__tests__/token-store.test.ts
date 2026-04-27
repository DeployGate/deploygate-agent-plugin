import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtempSync, rmSync, statSync, writeFileSync, mkdirSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { tmpdir, platform } from "node:os";
import { join } from "node:path";
import { TokenStore } from "../token-store.js";

describe("TokenStore", () => {
  let tmp: string;
  let store: TokenStore;

  beforeEach(() => {
    tmp = mkdtempSync(join(tmpdir(), "tokenstore-"));
    store = new TokenStore(join(tmp, "deploygate", "token"));
  });

  afterEach(() => {
    rmSync(tmp, { recursive: true, force: true });
  });

  it("path() returns the configured path", () => {
    expect(store.path()).toBe(join(tmp, "deploygate", "token"));
  });

  it("load() returns null when the file is missing", async () => {
    expect(await store.load()).toBeNull();
  });

  it("load() returns null when the file is empty", async () => {
    mkdirSync(join(tmp, "deploygate"));
    writeFileSync(store.path(), "");
    expect(await store.load()).toBeNull();
  });

  it("load() returns null on invalid JSON", async () => {
    mkdirSync(join(tmp, "deploygate"));
    writeFileSync(store.path(), "not json");
    expect(await store.load()).toBeNull();
  });

  it("load() returns null when JSON has no token field", async () => {
    mkdirSync(join(tmp, "deploygate"));
    writeFileSync(store.path(), JSON.stringify({ saved_at: 1 }));
    expect(await store.load()).toBeNull();
  });

  it("save() then load() round-trips the token", async () => {
    await store.save("deploygate_cacc_abc");
    expect(await store.load()).toEqual({ token: "deploygate_cacc_abc" });
  });

  it("save() creates the parent directory if missing", async () => {
    await store.save("t");
    const dirStat = statSync(join(tmp, "deploygate"));
    expect(dirStat.isDirectory()).toBe(true);
    if (platform() !== "win32") {
      expect(dirStat.mode & 0o777).toBe(0o700);
    }
  });

  it("save() writes the token file with 0600 permissions", async () => {
    if (platform() === "win32") return;
    await store.save("t");
    const fileStat = statSync(store.path());
    expect(fileStat.mode & 0o777).toBe(0o600);
  });

  it("save() overwrites an existing token atomically", async () => {
    await store.save("first");
    await store.save("second");
    const raw = await readFile(store.path(), "utf8");
    const parsed = JSON.parse(raw);
    expect(parsed.token).toBe("second");
  });

  it("clear() deletes the file", async () => {
    await store.save("t");
    await store.clear();
    expect(await store.load()).toBeNull();
  });

  it("clear() is a no-op when the file does not exist", async () => {
    await expect(store.clear()).resolves.toBeUndefined();
  });
});

describe("TokenStore.defaultPath", () => {
  it("uses XDG_CONFIG_HOME when set (non-Windows)", () => {
    if (platform() === "win32") return;
    const orig = process.env.XDG_CONFIG_HOME;
    process.env.XDG_CONFIG_HOME = "/xdg";
    try {
      expect(TokenStore.defaultPath()).toBe("/xdg/deploygate/token");
    } finally {
      if (orig === undefined) delete process.env.XDG_CONFIG_HOME;
      else process.env.XDG_CONFIG_HOME = orig;
    }
  });

  it("falls back to $HOME/.config when XDG is unset (non-Windows)", () => {
    if (platform() === "win32") return;
    const origXdg = process.env.XDG_CONFIG_HOME;
    const origHome = process.env.HOME;
    delete process.env.XDG_CONFIG_HOME;
    process.env.HOME = "/home/u";
    try {
      expect(TokenStore.defaultPath()).toBe("/home/u/.config/deploygate/token");
    } finally {
      if (origXdg !== undefined) process.env.XDG_CONFIG_HOME = origXdg;
      if (origHome === undefined) delete process.env.HOME;
      else process.env.HOME = origHome;
    }
  });
});
