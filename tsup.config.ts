import { defineConfig } from "tsup";

export default defineConfig({
  entry: {
    "bin/local-notes": "bin/local-notes.ts",
    "mcp/index": "mcp/src/index.ts",
    index: "lib/index.ts",
  },
  format: ["esm"],
  outDir: "dist",
  clean: true,
  dts: false,
  sourcemap: true,
  splitting: false,
});
