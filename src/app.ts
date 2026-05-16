import type { IncomingMessage, ServerResponse } from "node:http";
import { existsSync, statSync } from "node:fs";
import path from "node:path";
import type { NotesManager } from "../lib/notes.js";
import type { SearchEngine } from "../lib/search.js";
import { text, serveStaticFile } from "../lib/http.js";
import { createPages } from "./routes/web/pages.js";
import { createSearchApi } from "./routes/api/search.js";
import { createContentApi } from "./routes/api/content.js";
import { handleHotReloadSSE } from "./routes/api/hot-reload.js";

const IMAGE_EXTENSIONS = new Set([".png", ".jpg", ".jpeg", ".gif", ".webp", ".svg", ".ico"]);

export interface AppDeps {
  notesManager: NotesManager;
  searchEngine: SearchEngine;
  /** Path to readme.md shown on the homepage Readme filter tab. Default: empty (not shown). */
  readmePath?: string;
  /** Root directory for public/ static assets (CSS, JS, icons, service worker). */
  publicDir: string;
}

export function createApp(deps: AppDeps) {
  const pages = createPages(deps);
  const searchApi = createSearchApi(deps);
  const contentApi = createContentApi(deps);

  return function app(req: IncomingMessage, res: ServerResponse): void {
    const method = req.method || "GET";
    const parsedUrl = new URL(req.url!, "http://localhost");
    const { pathname } = parsedUrl;

    if (method !== "GET") {
      text(res, 405, "Method Not Allowed");
      return;
    }

    // API: search
    if (pathname === "/api/search") {
      searchApi.handleSearch(req, res, parsedUrl);
      return;
    }

    // Static files from public/
    if (pathname.startsWith("/public/")) {
      const filePath = path.join(deps.publicDir, pathname);
      serveStaticFile(filePath, res);
      return;
    }

    // Service worker from public/ (served at root for scope)
    if (pathname === "/service-worker.js") {
      const swPath = path.join(deps.publicDir, "public", "service-worker.js");
      serveStaticFile(swPath, res);
      return;
    }

    // Dev-only endpoints
    if (process.env.NODE_ENV !== "production") {
      if (pathname === "/api/hot-reload") {
        handleHotReloadSSE(req, res);
        return;
      }
      if (pathname === "/api/content") {
        contentApi.handleContentUpdate(req, res, parsedUrl);
        return;
      }
    }

    // Content routes (markdown pages, images, homepage, search page)
    handleContentRoute(pathname, parsedUrl, res);
  };

  function handleContentRoute(pathname: string, parsedUrl: URL, res: ServerResponse): void {
    if (pathname === "/" || pathname === "/index.html") {
      pages.serveHomepage(res, parsedUrl);
      return;
    }

    if (pathname === "/search") {
      pages.serveSearchResults(res, parsedUrl);
      return;
    }

    const urlPath = pathname.startsWith("/") ? pathname.slice(1) : pathname;
    const decodedPath = decodeURIComponent(urlPath);
    const ext = path.extname(decodedPath).toLowerCase();

    // Serve images from notes directory
    if (IMAGE_EXTENSIONS.has(ext)) {
      const filePath = deps.notesManager.resolveNotesPath(decodedPath);
      if (!filePath) {
        text(res, 400, "Invalid path");
        return;
      }
      serveStaticFile(filePath, res);
      return;
    }

    // Resolve markdown path
    let relPath = decodedPath;
    const absDir = deps.notesManager.resolveNotesPath(relPath);
    if (!absDir) {
      text(res, 400, "Invalid path");
      return;
    }

    if (existsAndIsDirectory(absDir)) {
      relPath = path.join(relPath, "index.md");
    } else if (!path.extname(relPath)) {
      relPath = `${relPath}.md`;
    }

    pages.serveMarkdownFile(relPath, res);
  }
}

function existsAndIsDirectory(absPath: string): boolean {
  try {
    return existsSync(absPath) && statSync(absPath).isDirectory();
  } catch {
    return false;
  }
}
