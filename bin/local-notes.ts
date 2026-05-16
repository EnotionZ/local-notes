#!/usr/bin/env node

import { createServer } from "node:http";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { existsSync } from "node:fs";
import { buildConfig } from "../lib/config.js";
import { createNotesManager } from "../lib/notes.js";
import { createSearchEngine } from "../lib/search.js";
import { createApp } from "../src/app.js";
import { emitFileChange } from "../src/routes/api/hot-reload.js";

const cfg = buildConfig(process.argv.slice(2));

const notesManager = createNotesManager(cfg.notesDir);
const searchEngine = createSearchEngine(notesManager);

// Resolve the package root directory (where public/ and readme.md live)
//   tsx dev:  __dirname = <project>/bin/     → ..   = <project>/
//   npm pkg:  __dirname = <project>/dist/bin/ → ../.. = <project>/
const __dirname = path.dirname(fileURLToPath(import.meta.url));
let packageRoot = path.resolve(__dirname, "..");
if (!existsSync(path.join(packageRoot, "public"))) {
  packageRoot = path.resolve(__dirname, "..", "..");
}

const readmePath = path.join(packageRoot, "readme.md");

const app = createApp({
  notesManager,
  searchEngine,
  readmePath: existsSync(readmePath) ? readmePath : undefined,
  publicDir: packageRoot,
});

// ── Markdown file watching ──────────────────────────────────────────────
// Enabled in dev mode by default; use --watch / --no-watch to override.
// This watches the notes directory for .md changes and pushes updates
// to connected browsers via SSE (hot reload of content, not the server).

const watchEnabled =
  cfg.watch ??
  (process.env.NODE_ENV !== "production" ? true : false);

async function setupMarkdownWatcher() {
  let chokidar: typeof import("chokidar") | null = null;
  try {
    chokidar = await import("chokidar");
  } catch {
    console.log("[local-notes] chokidar not available, skipping markdown file watching");
    return;
  }

  const watcher = chokidar.watch(path.join(cfg.notesDir, "**/*.md"), {
    ignored: /(^|[\/\\])\../,
    persistent: true,
    ignoreInitial: true,
    followSymlinks: true,
  });

  const onChange = (eventType: string) => (filePath: string) => {
    const relPath = path.relative(process.cwd(), filePath);
    console.log(`[local-notes] Markdown ${eventType}: ${relPath}`);
    notesManager.invalidateFileCache();
    searchEngine.invalidateSearchCache();
    emitFileChange(relPath);
  };

  watcher.on("change", onChange("changed"));
  watcher.on("add", onChange("added"));
  watcher.on("unlink", onChange("deleted"));

  console.log(`[local-notes] Watching markdown files in ${cfg.notesDir} ...`);
}

// ── Start server ────────────────────────────────────────────────────────

const server = createServer(app);

server.listen(cfg.port, cfg.host, () => {
  const hostDisplay = cfg.host === "0.0.0.0" ? "localhost" : cfg.host;
  console.log(`[local-notes] Server running at http://${hostDisplay}:${cfg.port}`);
  console.log(`[local-notes] Notes directory: ${cfg.notesDir}`);
  console.log(`[local-notes] Markdown watcher: ${watchEnabled ? "enabled" : "disabled"}`);

  if (watchEnabled) {
    setupMarkdownWatcher();
  }
});
