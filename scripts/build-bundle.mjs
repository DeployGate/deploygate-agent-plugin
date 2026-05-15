import { build } from "esbuild";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, "..");
const pkg = JSON.parse(await readFile(resolve(root, "package.json"), "utf-8"));

await build({
  entryPoints: [resolve(root, "dist/index.js")],
  bundle: true,
  platform: "node",
  format: "esm",
  outfile: resolve(root, "plugin/scripts/bundle.js"),
  define: {
    __PLUGIN_VERSION__: JSON.stringify(pkg.version),
  },
});
