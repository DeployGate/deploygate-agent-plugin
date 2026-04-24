import { mkdir, rename, rm, writeFile, readFile, chmod } from "node:fs/promises";
import { randomBytes } from "node:crypto";
import { homedir, platform } from "node:os";
import { dirname, join } from "node:path";

interface StoredToken {
  token: string;
  saved_at: number;
}

export class TokenStore {
  private readonly filePath: string;

  constructor(filePath: string = TokenStore.defaultPath()) {
    this.filePath = filePath;
  }

  static defaultPath(): string {
    if (platform() === "win32") {
      const appData = process.env.APPDATA ?? join(homedir(), "AppData", "Roaming");
      return join(appData, "deploygate", "token");
    }
    const base = process.env.XDG_CONFIG_HOME ?? join(homedir(), ".config");
    return join(base, "deploygate", "token");
  }

  path(): string {
    return this.filePath;
  }

  async load(): Promise<{ token: string } | null> {
    let raw: string;
    try {
      raw = await readFile(this.filePath, "utf8");
    } catch {
      return null;
    }
    if (raw.trim() === "") return null;
    try {
      const parsed = JSON.parse(raw) as Partial<StoredToken>;
      if (typeof parsed.token !== "string" || parsed.token === "") return null;
      return { token: parsed.token };
    } catch {
      return null;
    }
  }

  async save(token: string): Promise<void> {
    const dir = dirname(this.filePath);
    await mkdir(dir, { recursive: true, mode: 0o700 });
    if (platform() !== "win32") {
      try {
        await chmod(dir, 0o700);
      } catch {
        // ignore; directory may be owned by someone else
      }
    }
    const payload: StoredToken = { token, saved_at: Date.now() };
    const tmpPath = `${this.filePath}.${randomBytes(6).toString("hex")}.tmp`;
    await writeFile(tmpPath, JSON.stringify(payload), { mode: 0o600 });
    if (platform() !== "win32") {
      await chmod(tmpPath, 0o600);
    }
    await rename(tmpPath, this.filePath);
  }

  async clear(): Promise<void> {
    try {
      await rm(this.filePath);
    } catch (e) {
      const err = e as NodeJS.ErrnoException;
      if (err.code !== "ENOENT") throw err;
    }
  }
}
