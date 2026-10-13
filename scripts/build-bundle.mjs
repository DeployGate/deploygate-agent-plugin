import { build } from "esbuild";
import { readFile, stat } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, resolve, sep } from "node:path";

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, "..");
const pkg = JSON.parse(await readFile(resolve(root, "package.json"), "utf-8"));
const outfile = resolve(root, "plugin/scripts/bundle.js");

// The Claude plugin directory reads files only up to 1 MiB as text; a larger
// bundle can't be inspected and holds every version for a reviewer.
const MAX_BUNDLE_BYTES = 1024 * 1024;

// zod re-exports every error-message locale as `z.locales`, which adds about
// 280 KB that the server never uses: zod configures English itself, and
// nothing switches locales. Keep only English.
const zodEnglishLocaleOnly = {
  name: "zod-english-locale-only",
  setup(build) {
    const zodLocalesDir = `${sep}node_modules${sep}zod${sep}v4${sep}locales${sep}`;
    build.onLoad({ filter: /[\\/]zod[\\/]v4[\\/]locales[\\/]index\.js$/ }, (args) =>
      args.path.includes(zodLocalesDir)
        ? { contents: 'export { default as en } from "./en.js";', loader: "js" }
        : undefined,
    );
  },
};

await build({
  entryPoints: [resolve(root, "dist/index.js")],
  bundle: true,
  platform: "node",
  format: "esm",
  outfile,
  plugins: [zodEnglishLocaleOnly],
  define: {
    __PLUGIN_VERSION__: JSON.stringify(pkg.version),
  },
});

const { size } = await stat(outfile);
if (size >= MAX_BUNDLE_BYTES) {
  throw new Error(
    `plugin/scripts/bundle.js is ${size} bytes, at or over the ${MAX_BUNDLE_BYTES}-byte limit ` +
      "the Claude plugin directory reads as text. Trim dependencies instead of minifying.",
  );
}
