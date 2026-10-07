// Smoke test for the bundled MCP server. Spawns the bundle with the current
// Node, performs the MCP handshake over stdio and checks that tools/list
// returns tools. Dependency-free so it can run on the minimum supported Node
// without installing dev dependencies.
//
// Usage: node scripts/smoke-bundle.mjs [path/to/bundle.js]

import { spawn } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

const TIMEOUT_MS = 15_000;

const bundle = resolve(process.argv[2] ?? "plugin/scripts/bundle.js");

// Point every config location at an empty directory so a token stored on the
// machine is never picked up.
const home = mkdtempSync(join(tmpdir(), "deploygate-smoke-"));

const child = spawn(process.execPath, [bundle], {
  env: {
    ...process.env,
    HOME: home,
    USERPROFILE: home,
    XDG_CONFIG_HOME: home,
    APPDATA: home,
  },
  stdio: ["pipe", "pipe", "pipe"],
});

let stderr = "";
child.stderr.on("data", (chunk) => (stderr += chunk));

const pending = new Map();
let buffer = "";
child.stdout.on("data", (chunk) => {
  buffer += chunk;
  let newline;
  while ((newline = buffer.indexOf("\n")) >= 0) {
    const line = buffer.slice(0, newline).trim();
    buffer = buffer.slice(newline + 1);
    if (!line) continue;
    let message;
    try {
      message = JSON.parse(line);
    } catch {
      fail(new Error(`bundle wrote a non JSON-RPC line to stdout: ${line}`));
      return;
    }
    pending.get(message.id)?.(message);
    pending.delete(message.id);
  }
});

const exited = new Promise((_, reject) => {
  child.on("exit", (code, signal) =>
    reject(new Error(`bundle exited early (code=${code}, signal=${signal})`)),
  );
});

function send(message) {
  child.stdin.write(JSON.stringify(message) + "\n");
}

function request(id, method, params = {}) {
  const response = new Promise((resolve) => pending.set(id, resolve));
  send({ jsonrpc: "2.0", id, method, params });
  return Promise.race([response, exited]).then((message) => {
    if (message.error)
      throw new Error(`${method} failed: ${JSON.stringify(message.error)}`);
    return message.result;
  });
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

const timer = setTimeout(
  () => fail(new Error(`timed out after ${TIMEOUT_MS}ms`)),
  TIMEOUT_MS,
);

function finish(code) {
  clearTimeout(timer);
  child.removeAllListeners("exit");
  child.kill();
  rmSync(home, { recursive: true, force: true });
  process.exit(code);
}

function fail(error) {
  console.error(
    `smoke test failed on Node ${process.version}: ${error.message}`,
  );
  if (stderr) console.error(`bundle stderr:\n${stderr}`);
  finish(1);
}

try {
  const init = await request(1, "initialize", {
    protocolVersion: "2025-06-18",
    capabilities: {},
    clientInfo: { name: "smoke-bundle", version: "0.0.0" },
  });
  assert(
    init.serverInfo?.name === "deploygate",
    `unexpected serverInfo: ${JSON.stringify(init.serverInfo)}`,
  );

  send({ jsonrpc: "2.0", method: "notifications/initialized" });

  const { tools } = await request(2, "tools/list");
  assert(
    Array.isArray(tools) && tools.length > 0,
    "tools/list returned no tools",
  );
  for (const tool of tools) {
    assert(
      typeof tool.name === "string" && tool.inputSchema,
      `malformed tool: ${JSON.stringify(tool)}`,
    );
  }

  console.log(
    `smoke test passed on Node ${process.version}: ${init.serverInfo.name} ${init.serverInfo.version}, ${tools.length} tools`,
  );
  finish(0);
} catch (error) {
  fail(error);
}
