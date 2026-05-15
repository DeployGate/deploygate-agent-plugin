declare const __PLUGIN_VERSION__: string | undefined;

export const VERSION =
  typeof __PLUGIN_VERSION__ !== "undefined" ? __PLUGIN_VERSION__ : "dev";
