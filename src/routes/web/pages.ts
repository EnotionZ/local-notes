import { readFileSync, statSync, existsSync } from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import type { IncomingMessage, ServerResponse } from "node:http";
import type { NotesManager } from "../../../lib/notes.js";
import type { SearchEngine } from "../../../lib/search.js";
import { html, text } from "../../../lib/http.js";
import { renderMarkdown, extractHeadings } from "../../../lib/markdown.js";
import { parseFrontmatter } from "../../../lib/frontmatter.js";
import { encodePathSegments, stripMdExtension, escapeHtml, escapeRegex } from "../../../lib/path-utils.js";
import { MIN_SEARCH_QUERY_LENGTH } from "../../../lib/search.js";

const _require = createRequire(import.meta.url);

// Cache Pico CSS at module load time so the serverless file tracer includes it.
const picoCSS = readFileSync(_require.resolve("@picocss/pico"), "utf8");

const STAR_TAG = "star";
const SIDEBAR_FAVORITES_PATH = "__favorites__";
const SIDEBAR_FAVORITES_LABEL = "Favorites";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface SidebarNode {
  folders: Map<string, SidebarNode>;
  files: SidebarFile[];
}

interface SidebarFile {
  relPath: string;
  normalizedPath: string;
  fileName: string;
  depth?: number;
}

// ---------------------------------------------------------------------------
// Sidebar tree
// ---------------------------------------------------------------------------

function createSidebarTree(files: string[]): SidebarNode {
  const root: SidebarNode = { folders: new Map(), files: [] };

  files.forEach((relPath) => {
    const normalizedPath = stripMdExtension(relPath);
    const parts = normalizedPath.split("/").filter(Boolean);
    if (!parts.length) return;

    const fileName = parts.pop()!;
    let current = root;

    parts.forEach((part) => {
      if (!current.folders.has(part)) {
        current.folders.set(part, { folders: new Map(), files: [] });
      }
      current = current.folders.get(part)!;
    });

    current.files.push({ relPath, normalizedPath, fileName });
  });

  return root;
}

function getStarredPaths(files: string[], notesManager: NotesManager): string[] {
  const starred: string[] = [];
  for (const relPath of files) {
    const absPath = notesManager.resolveNotesPath(relPath);
    if (!absPath) continue;
    try {
      const rawContent = readFileSync(absPath, "utf8");
      const { data } = parseFrontmatter(rawContent);
      const tags = Array.isArray(data.tags) ? data.tags.map(String) : [];
      const hasStarTag = tags.some((tag) => tag.trim().toLowerCase() === STAR_TAG);
      if (hasStarTag) {
        starred.push(relPath);
      }
    } catch {
      // Ignore unreadable files and continue.
    }
  }
  return starred;
}

function folderSort(a: string, b: string): number {
  return a.localeCompare(b, undefined, { sensitivity: "base" });
}

function fileSort(a: SidebarFile, b: SidebarFile): number {
  return a.fileName.localeCompare(b.fileName, undefined, { sensitivity: "base" });
}

function renderSidebarTree(node: SidebarNode, activePath: string, parentPath = ""): string {
  const folderEntries = Array.from(node.folders.entries()).sort((a, b) => folderSort(a[0], b[0]));
  const fileEntries = [...node.files].sort(fileSort);

  const folderHtml = folderEntries
    .map(([folderName, folderNode]) => {
      const folderPath = parentPath ? `${parentPath}/${folderName}` : folderName;
      const depth = folderPath.split("/").length - 1;
      const isOpen = activePath === folderPath || activePath.startsWith(`${folderPath}/`);
      return `
        <li class="sidebar-folder ${isOpen ? "open" : ""}" data-folder-path="${escapeHtml(folderPath)}" style="--tree-depth:${depth}">
          <button type="button" class="tree-row tree-folder-btn" aria-expanded="${isOpen ? "true" : "false"}">
            <span class="tree-chevron" aria-hidden="true">${isOpen ? "▾" : "▸"}</span>
            <span class="tree-icon" aria-hidden="true">📁</span>
            <span class="tree-label">${escapeHtml(folderName)}</span>
          </button>
          <ul class="tree-children">
            ${renderSidebarTree(folderNode, activePath, folderPath)}
          </ul>
        </li>
      `;
    })
    .join("");

  const fileHtml = fileEntries
    .map((file) => {
      const depth = file.depth ?? file.normalizedPath.split("/").length - 1;
      const isActive = file.normalizedPath === activePath ? "active" : "";
      return `
        <li class="sidebar-file ${isActive}" data-path="${escapeHtml(file.relPath)}" style="--tree-depth:${depth}">
          <a class="tree-row tree-file-link" href="/${encodePathSegments(file.normalizedPath)}">
            <span class="tree-chevron tree-chevron-spacer" aria-hidden="true"></span>
            <span class="tree-icon" aria-hidden="true">📄</span>
            <span class="tree-label">${escapeHtml(file.fileName)}</span>
          </a>
        </li>
      `;
    })
    .join("");

  return `${folderHtml}${fileHtml}`;
}

function createFavoritesNode(files: string[], notesManager: NotesManager): SidebarNode | null {
  const starredFiles = getStarredPaths(files, notesManager);
  if (!starredFiles.length) return null;

  const filesForNode: SidebarFile[] = starredFiles.map((relPath) => {
    const normalizedPath = stripMdExtension(relPath);
    const fileName = path.basename(normalizedPath);
    return { relPath, normalizedPath, fileName, depth: 1 };
  });
  filesForNode.sort(fileSort);

  return { folders: new Map(), files: filesForNode };
}

function renderFavoritesFolder(files: string[], activePath: string, notesManager: NotesManager): string {
  const favoritesNode = createFavoritesNode(files, notesManager);
  if (!favoritesNode) return "";

  const hasActiveFavorite = favoritesNode.files.some((file) => file.normalizedPath === activePath);
  const isOpen = hasActiveFavorite;
  return `
    <li class="sidebar-folder ${isOpen ? "open" : ""}" data-folder-path="${SIDEBAR_FAVORITES_PATH}" style="--tree-depth:0">
      <button type="button" class="tree-row tree-folder-btn" aria-expanded="${isOpen ? "true" : "false"}">
        <span class="tree-chevron" aria-hidden="true">${isOpen ? "▾" : "▸"}</span>
        <span class="tree-icon" aria-hidden="true">⭐</span>
        <span class="tree-label">${SIDEBAR_FAVORITES_LABEL}</span>
      </button>
      <ul class="tree-children">
        ${renderSidebarTree(favoritesNode, activePath, SIDEBAR_FAVORITES_PATH)}
      </ul>
    </li>
  `;
}

function buildSidebarItems(files: string[], activePath = "", notesManager: NotesManager): string {
  const normalizedActivePath = stripMdExtension(activePath || "");
  const favoritesHtml = renderFavoritesFolder(files, normalizedActivePath, notesManager);
  const tree = createSidebarTree(files);
  const treeHtml = renderSidebarTree(tree, normalizedActivePath);
  return `${favoritesHtml}${treeHtml}`;
}

// ---------------------------------------------------------------------------
// Homepage helpers
// ---------------------------------------------------------------------------

function getFilesWithStats(files: string[], notesManager: NotesManager) {
  const items: { relPath: string; mtimeMs: number; isFavorite: boolean }[] = [];
  for (const relPath of files) {
    const absPath = notesManager.resolveNotesPath(relPath);
    if (!absPath) continue;
    try {
      const stats = statSync(absPath);
      let hasStarTag = false;
      try {
        const rawContent = readFileSync(absPath, "utf8");
        const { data } = parseFrontmatter(rawContent);
        const tags = Array.isArray(data.tags) ? data.tags.map(String) : [];
        hasStarTag = tags.some((tag) => tag.trim().toLowerCase() === "star");
      } catch {
        // Ignore unreadable file content.
      }

      const isStarFolder = relPath.startsWith("_star_/");
      items.push({ relPath, mtimeMs: stats.mtimeMs, isFavorite: isStarFolder || hasStarTag });
    } catch {
      // Ignore unreadable files.
    }
  }
  return items;
}

function renderFilteredDocsList(
  filesWithStats: { relPath: string; mtimeMs: number; isFavorite: boolean }[],
  filterMode: string
): string {
  let filtered = filesWithStats;
  if (filterMode === "favorites") {
    filtered = filesWithStats.filter((item) => item.isFavorite);
  } else {
    filtered = [...filesWithStats].sort((a, b) => b.mtimeMs - a.mtimeMs);
  }

  if (!filtered.length) {
    return "<p>No documents found for this filter.</p>";
  }

  return `
    <ul class="filtered-docs-list">
      ${filtered
        .map((item) => {
          const href = `/${encodePathSegments(stripMdExtension(item.relPath))}`;
          const normalizedLabel = stripMdExtension(item.relPath).replace(/^_star_\//, "");
          const label = escapeHtml(normalizedLabel);
          const updated = new Date(item.mtimeMs).toLocaleDateString();
          return `<li><a href="${href}">${label}</a><span class="updated-label">Updated ${updated}</span></li>`;
        })
        .join("")}
    </ul>
  `;
}

function renderRootReadme(readmePath: string): string {
  if (!existsSync(readmePath)) {
    return "<p>readme.md not found.</p>";
  }
  const content = readFileSync(readmePath, "utf8");
  return `<article class="homepage-readme">${renderMarkdown(content, () => null)}</article>`;
}

// ---------------------------------------------------------------------------
// Shared header controls
// ---------------------------------------------------------------------------

function renderHeaderControls(): string {
  return `
    <button id="header-menu-toggle" class="header-menu-toggle secondary outline" aria-label="Open display menu" title="Display options" aria-haspopup="true" aria-expanded="false">
      ⋮
    </button>
    <div id="header-popover-menu" class="header-popover-menu" role="menu" aria-label="Display options">
      <div class="popover-section">
        <button id="theme-toggle" class="popover-menu-item secondary outline" role="menuitem" aria-label="Toggle dark mode" aria-pressed="false">
          <span class="popover-item-icon">🌙</span>
          <span class="popover-item-label">
            <span id="theme-toggle-label">Dark mode</span>
          </span>
        </button>
      </div>
      <div class="popover-section">
        <div class="popover-section-label">Font size</div>
        <div id="font-size-controls" role="group" aria-label="Font size">
          <button type="button" class="outline" data-size="small" aria-label="Small font size">Small</button>
          <button type="button" class="outline" data-size="medium" aria-label="Medium font size">Medium</button>
          <button type="button" class="outline" data-size="large" aria-label="Large font size">Large</button>
        </div>
      </div>
      <div class="popover-section">
        <button id="download-pdf" class="popover-menu-item secondary outline" aria-label="Print or Save as PDF" title="Print or Save as PDF">
          <span class="popover-item-icon">
            <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
          </span>
          <span class="popover-item-label">Print / PDF</span>
        </button>
      </div>
    </div>
  `;
}

// ---------------------------------------------------------------------------
// Shared page layout
// ---------------------------------------------------------------------------

function renderSidebar(sidebarItems: string, searchValue = ""): string {
  return `
    <button id="sidebar-backdrop" class="sidebar-backdrop" aria-label="Close sidebar"></button>
    <aside class="sidebar" id="sidebar">
      <div class="sidebar-header" id="sidebar-header">
        <a href="/" class="home-btn" aria-label="Home" title="Home">🏠</a>
        <input type="text" id="search" placeholder="Search files..." value="${escapeHtml(searchValue)}" />
      </div>
      <nav class="file-list" id="file-list-nav">
        <ul id="file-list">
          ${sidebarItems}
        </ul>
      </nav>
    </aside>
  `;
}

function renderContentHeader(title: string, titleId = "filename"): string {
  return `
    <div class="content-header">
      <div class="content-header-left">
        <button id="mobile-sidebar-toggle" class="sidebar-toggle mobile-sidebar-toggle" aria-label="Open sidebar" aria-expanded="false" title="Open sidebar">☰</button>
        <a href="/" id="content-header-home" class="content-header-home" aria-label="Home" title="Home" style="display:none;">🏠</a>
        <button id="sidebar-toggle" class="sidebar-toggle" aria-label="Collapse sidebar" title="Collapse sidebar">«</button>
      </div>
      <h2 id="${escapeHtml(titleId)}">${escapeHtml(title)}</h2>
      <div class="content-header-controls">
        ${renderHeaderControls()}
      </div>
    </div>
  `;
}

interface AppPageOptions {
  pageTitle: string;
  sidebarItems: string;
  contentHeaderTitle: string;
  contentHeaderTitleId?: string;
  markdownBodyClass?: string;
  markdownBodyHtml?: string;
  sidebarSearchValue?: string;
  extraHead?: string;
  extraInlineScripts?: string;
  extraExternalScripts?: string;
}

function renderAppPage({
  pageTitle,
  sidebarItems,
  contentHeaderTitle,
  contentHeaderTitleId = "filename",
  markdownBodyClass = "",
  markdownBodyHtml = "",
  sidebarSearchValue = "",
  extraHead = "",
  extraInlineScripts = "",
  extraExternalScripts = "",
}: AppPageOptions): string {
  const markdownBodyClasses = `markdown-body${markdownBodyClass ? ` ${markdownBodyClass}` : ""}`;
  return `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="utf-8">
      <meta name="viewport" content="width=device-width, initial-scale=1">
      <meta name="theme-color" content="#1a73e8">
      <meta name="apple-mobile-web-app-capable" content="yes">
      <meta name="apple-mobile-web-app-status-bar-style" content="default">
      <meta name="apple-mobile-web-app-title" content="Notes">
      <link rel="manifest" href="/public/manifest.json">
      <link rel="icon" type="image/png" sizes="192x192" href="/public/icons/icon-192x192.png">
      <link rel="icon" type="image/png" sizes="512x512" href="/public/icons/icon-512x512.png">
      <link rel="apple-touch-icon" href="/public/icons/icon-192x192.png">
      <title>${escapeHtml(pageTitle)}</title>
      <style>${picoCSS}</style>
      <link rel="stylesheet" href="/public/style.css">
      <link rel="stylesheet" href="/public/print.css" media="print">
      ${extraHead}
    </head>
    <body>
      <div class="container">
        ${renderSidebar(sidebarItems, sidebarSearchValue)}
        <main class="content">
          ${renderContentHeader(contentHeaderTitle, contentHeaderTitleId)}
          <div class="${markdownBodyClasses}" id="markdown-body">
            ${markdownBodyHtml}
          </div>
        </main>
      </div>
      <script>window.__SEARCH_MIN_QUERY_LENGTH__ = ${MIN_SEARCH_QUERY_LENGTH};</script>
      <script src="/public/header-controls.js"></script>
      <script src="/public/markdown-page.js"></script>
      <script src="/public/copy-code.js"></script>
      <script src="/public/sidebar-mobile.js"></script>
      <script src="/public/sidebar-search.js"></script>
      ${process.env.NODE_ENV !== "production" ? '<script src="/public/hot-reload.js"></script>' : ""}
      ${extraInlineScripts}
      ${extraExternalScripts}
      <script src="/public/pwa-install.js"></script>
    </body>
    </html>
  `;
}

// ---------------------------------------------------------------------------
// Note metadata helpers
// ---------------------------------------------------------------------------

function renderNoteMeta(tags: string[]): string {
  if (!tags || tags.length === 0) return "";

  const tagHtml = tags
    .map((t) => `<a href="/search?q=${encodeURIComponent(t)}" class="tag-pill">${escapeHtml(t)}</a>`)
    .join("");
  return `<div class="note-meta"><span class="note-tags">${tagHtml}</span></div>`;
}

function isTocEnabled(frontmatterData: Record<string, unknown>): boolean {
  if (!frontmatterData || !Object.prototype.hasOwnProperty.call(frontmatterData, "toc")) return true;

  const value = frontmatterData.toc;
  if (typeof value === "boolean") return value;
  if (typeof value === "string") {
    const normalized = value.trim().toLowerCase();
    if (["false", "0", "off", "no"].includes(normalized)) return false;
    if (["true", "1", "on", "yes"].includes(normalized)) return true;
  }

  return Boolean(value);
}

function buildNoteResolver(allFiles: string[]): (title: string) => string | null {
  const map = new Map<string, string>();
  for (const relPath of allFiles) {
    const title = path.basename(relPath, ".md").toLowerCase();
    if (!map.has(title)) {
      map.set(title, "/" + encodePathSegments(stripMdExtension(relPath)));
    }
  }
  return (title: string) => map.get(title.toLowerCase()) || null;
}

function renderToc(headings: { level: number; id: string; text: string }[]): string {
  if (headings.length < 2) return "";

  const items = headings
    .map(({ level, id, text: headingText }) => {
      const clampedLevel = Math.min(Math.max(level, 2), 6);
      return `<li class="toc-item toc-level-${clampedLevel}"><a class="toc-link" href="#${escapeHtml(id)}" data-heading-id="${escapeHtml(id)}">${escapeHtml(headingText)}</a></li>`;
    })
    .join("");

  return `
    <div class="toc-details-wrapper">
      <details class="toc-details" open>
        <summary class="toc-summary">Table of Contents</summary>
        <nav class="toc" aria-label="Table of contents">
          <ul class="toc-list">${items}</ul>
        </nav>
      </details>
    </div>
  `;
}

function renderBacklinks(backlinks: { path: string; title: string }[]): string {
  if (!backlinks.length) return "";

  const items = backlinks
    .map(({ path: relPath, title }) => {
      const url = "/" + encodePathSegments(stripMdExtension(relPath));
      return `<li><a href="${url}">${escapeHtml(title)}</a></li>`;
    })
    .join("");

  return `
    <section class="backlinks-section" aria-label="Referenced by">
      <h2 class="backlinks-heading">Referenced by</h2>
      <ul class="backlinks-list">${items}</ul>
    </section>
  `;
}

function renderMissingNoteNotice(relPath: string): string {
  return `
    <section class="not-found-notice" role="status" aria-live="polite">
      <h3>Note not found</h3>
      <p>The requested note does not exist:</p>
      <p class="not-found-path">${escapeHtml(relPath)}</p>
      <p><a href="/">Go to Docs home</a></p>
    </section>
  `;
}

// ---------------------------------------------------------------------------
// Factory — creates route handlers bound to deps
// ---------------------------------------------------------------------------

export interface PagesHandlers {
  serveHomepage: (res: ServerResponse, parsedUrl: URL) => void;
  serveMarkdownFile: (relPath: string, res: ServerResponse) => void;
  serveSearchResults: (res: ServerResponse, parsedUrl: URL) => void;
  renderNoteMeta: (tags: string[]) => string;
  renderToc: (headings: { level: number; id: string; text: string }[]) => string;
  renderBacklinks: (backlinks: { path: string; title: string }[]) => string;
  isTocEnabled: (frontmatterData: Record<string, unknown>) => boolean;
  buildNoteResolver: (allFiles: string[]) => (title: string) => string | null;
  buildSidebarItems: (files: string[], activePath?: string) => string;
}

export function createPages(deps: { notesManager: NotesManager; searchEngine: SearchEngine; readmePath?: string }): PagesHandlers {
  const { notesManager, searchEngine } = deps;
  const readmePath = deps.readmePath || "";

  function serveHomepage(res: ServerResponse, parsedUrl: URL): void {
    const homepageScript = `
      (function () {
        (function () {
          var urlParams = new URLSearchParams(window.location.search);
          if (!urlParams.has('filter')) {
            var savedFilter = localStorage.getItem('docs-home-filter');
            if (savedFilter === 'recent' || savedFilter === 'readme') {
              window.location.replace('/?filter=' + savedFilter);
              return;
            }
          }
        })();
        document.addEventListener('click', function (e) {
          var btn = e.target.closest('.filter-btn');
          if (btn) {
            var href = btn.getAttribute('href');
            var match = href && href.match(/[?&]filter=([^&]+)/);
            if (match) {
              localStorage.setItem('docs-home-filter', match[1]);
            }
          }
        });
        if (!window.mermaid) return;
        window.mermaid.initialize({ startOnLoad: true });
      })();
    `;

    const files = notesManager.getMarkdownFilesCached();
    const filesWithStats = getFilesWithStats(files, notesManager);
    const requestedFilter = parsedUrl.searchParams.get("filter") || "";
    const filterMode = requestedFilter === "recent" || requestedFilter === "readme" ? requestedFilter : "favorites";
    const filteredDocsHtml =
      filterMode === "readme" ? renderRootReadme(readmePath) : renderFilteredDocsList(filesWithStats, filterMode);
    const sidebarItems = buildSidebarItems(files, "", notesManager);

    const markdownBodyHtml = `
      <div class="filter-controls">
        <a role="button" class="filter-btn ${filterMode === "favorites" ? "" : "secondary outline"}" href="/?filter=favorites">Favorites</a>
        <a role="button" class="filter-btn ${filterMode === "recent" ? "" : "secondary outline"}" href="/?filter=recent">Recent</a>
        <a role="button" class="filter-btn ${filterMode === "readme" ? "" : "secondary outline"}" href="/?filter=readme">Readme</a>
      </div>
      ${filteredDocsHtml}
    `;

    html(
      res,
      200,
      renderAppPage({
        pageTitle: "Docs",
        sidebarItems,
        contentHeaderTitle: "Docs",
        contentHeaderTitleId: "home-title",
        markdownBodyHtml,
        extraHead: '<script src="https://cdn.jsdelivr.net/npm/mermaid/dist/mermaid.min.js"></script>',
        extraInlineScripts: `<script>${homepageScript}</script>`,
      })
    );
  }

  function serveMarkdownFile(relPath: string, res: ServerResponse): void {
    const absPath = notesManager.resolveNotesPath(relPath);

    if (!absPath) {
      text(res, 400, "Invalid path");
      return;
    }

    const allFiles = notesManager.getMarkdownFilesCached();
    const sidebarItems = buildSidebarItems(allFiles, relPath, notesManager);

    if (!existsSync(absPath)) {
      html(
        res,
        404,
        renderAppPage({
          pageTitle: `Not found: ${relPath}`,
          sidebarItems,
          contentHeaderTitle: relPath,
          markdownBodyHtml: renderMissingNoteNotice(relPath),
        })
      );
      return;
    }

    const rawContent = readFileSync(absPath, "utf8");
    const { data: frontmatterData } = parseFrontmatter(rawContent);
    const tags = Array.isArray(frontmatterData.tags) ? frontmatterData.tags.map(String) : [];

    const noteResolver = buildNoteResolver(allFiles);
    const renderedHtml = renderMarkdown(rawContent, noteResolver);

    const headings = extractHeadings(renderedHtml);
    const tocHtml = isTocEnabled(frontmatterData) ? renderToc(headings) : "";

    const noteMetaHtml = renderNoteMeta(tags);
    const backlinks = searchEngine.getBacklinks(relPath);
    const backlinksHtml = renderBacklinks(backlinks);

    const filename = relPath.split("/").pop() || relPath;
    const title = frontmatterData.title ? String(frontmatterData.title) : stripMdExtension(filename);

    html(
      res,
      200,
      renderAppPage({
        pageTitle: title,
        sidebarItems,
        contentHeaderTitle: relPath,
        markdownBodyClass: tocHtml ? "has-toc" : "",
        markdownBodyHtml: `${noteMetaHtml}${tocHtml}${renderedHtml}${backlinksHtml}`,
        extraHead: `
          <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/prism/1.29.0/themes/prism.min.css">
          <script src="https://cdn.jsdelivr.net/npm/mermaid/dist/mermaid.min.js"></script>
        `,
        extraExternalScripts: `
          <script src="/public/toc.js"></script>
          <script src="https://cdnjs.cloudflare.com/ajax/libs/prism/1.29.0/components/prism-core.min.js"></script>
          <script src="https://cdnjs.cloudflare.com/ajax/libs/prism/1.29.0/plugins/autoloader/prism-autoloader.min.js"></script>
        `,
      })
    );
  }

  function serveSearchResults(res: ServerResponse, parsedUrl: URL): void {
    const query = parsedUrl.searchParams.get("q") || "";
    const trimmedQuery = query.trim();

    const files = notesManager.getMarkdownFilesCached();
    const sidebarItems = buildSidebarItems(files, "", notesManager);

    let resultsHtml = "";
    let resultsCount = 0;

    if (trimmedQuery && trimmedQuery.length >= MIN_SEARCH_QUERY_LENGTH) {
      const results = searchEngine.searchNotes(trimmedQuery, 100, true);
      resultsCount = results.length;

      if (results.length > 0) {
        resultsHtml = `
          <ul class="search-results-list" id="search-results-list">
            ${results
              .map((item) => {
                const url = `/${encodePathSegments(stripMdExtension(item.path))}`;
                const snippet = item.snippet
                  ? escapeHtml(item.snippet).replace(
                      new RegExp(`(${escapeRegex(trimmedQuery)})`, "gi"),
                      "<mark>$1</mark>"
                    )
                  : "";
                const tagHtml =
                  item.tags && item.tags.length
                    ? `<div class="search-result-tags">${item.tags
                        .map(
                          (t: string) =>
                            `<a href="/search?q=${encodeURIComponent(t)}" class="tag-pill">${escapeHtml(t)}</a>`
                        )
                        .join("")}</div>`
                    : "";
                return `
                  <li class="search-result-item">
                    <h3 class="search-result-title">
                      <a href="${url}">${escapeHtml(item.path.replace(/\.md$/i, "").split("/").pop() || item.path)}</a>
                    </h3>
                    <div class="search-result-path">${escapeHtml(item.path)}</div>
                    ${tagHtml}
                    ${snippet ? `<div class="search-result-snippet">${snippet}</div>` : ""}
                  </li>
                `;
              })
              .join("")}
          </ul>
        `;
      } else {
        resultsHtml = '<p class="search-no-results">No results found.</p>';
      }
    } else {
      resultsHtml = `<p class="search-no-results">Please enter at least ${MIN_SEARCH_QUERY_LENGTH} characters to search.</p>`;
    }

    const markdownBodyHtml = `
      <div class="search-header">
        <h2>Search Results</h2>
        ${trimmedQuery ? `<div class="search-query-display">Query: <strong>${escapeHtml(trimmedQuery)}</strong></div>` : ""}
        ${resultsCount > 0 ? `<div class="search-count">Found ${resultsCount} result${resultsCount !== 1 ? "s" : ""}</div>` : ""}
      </div>
      ${resultsHtml}
    `;

    html(
      res,
      200,
      renderAppPage({
        pageTitle: `Search: ${trimmedQuery || ""}`,
        sidebarItems,
        sidebarSearchValue: trimmedQuery,
        contentHeaderTitle: "Search Results",
        markdownBodyHtml,
      })
    );
  }

  return {
    serveHomepage,
    serveMarkdownFile,
    serveSearchResults,
    renderNoteMeta,
    renderToc,
    renderBacklinks,
    isTocEnabled,
    buildNoteResolver,
    buildSidebarItems: (files: string[], activePath = "") => buildSidebarItems(files, activePath, notesManager),
  };
}
