# Agent Guide — Notes Docs Server

This document describes the codebase structure for LLM agents working on this repo.

## What This Is

A plain Node.js HTTP server (no framework) that serves personal Markdown notes from the `Notes/` directory as a styled docs site with search, sidebar, and a set of UX features. Runs locally and deploys to Vercel.

## Key File Map

```
index.js                        Entry point; creates HTTP server on port 3007
src/app.js                      Main router — dispatches GET requests to handlers
src/routes/web/pages.js         HTML renderers for homepage, note pages, search page
src/routes/api/search.js        JSON search API: GET /api/search?q=...
src/lib/notes.js                Markdown file discovery + cached file listing
src/lib/frontmatter.js          Minimal YAML frontmatter parser
src/lib/markdown.js             markdown-it setup + wikilink processing + TOC extraction
src/lib/search-index.js         In-memory search with ranking, tags, multi-word, fuzzy, backlinks
src/lib/path-utils.js           Path safety, encoding, escaping helpers
src/lib/search-config.js        Shared constants (MIN_SEARCH_QUERY_LENGTH = 3)
src/lib/http.js                 Response helpers: json(), html(), text(), serveStaticFile()
public/style.css                All styles (shared + page-specific, dark mode, new components)
public/print.css                Print/PDF styles
public/header-controls.js       Theme toggle, font size, print/PDF popover
public/sidebar-search.js        Sidebar file filter, folder state, keyboard shortcuts, search-results nav
public/markdown-page.js         Desktop sidebar collapse/expand
public/sidebar-mobile.js        Mobile sidebar drawer + backdrop
public/toc.js                   TOC active-heading highlighting (IntersectionObserver)
public/hot-reload.js            Hot reload client (SSE connection, content replacement)
src/routes/api/hot-reload.js    SSE endpoint for file change notifications
src/routes/api/content.js       API endpoint for fetching updated markdown content
scripts/search-notes.js         CLI script to search notes; useful for agents
test/search-index.test.js       node:test tests for search engine
Notes/                          All markdown notes (the actual content)
Notes/_star_/                   Favorites — shown on homepage under "Favorites" filter
```

## Notes Directory Conventions

- All content lives under `Notes/`
- Subdirectories create nested sidebar folders
- Files in `Notes/_star_/` appear in the Favorites list on the homepage
- Any `.md` file is served; images linked from notes are served too

## YAML Frontmatter

Notes can have a YAML frontmatter block at the very top:

```yaml
---
tags: [tag1, tag2]
title: Custom Title
---
```

Parsed by `src/lib/frontmatter.js`. The parser handles:
- Inline arrays: `tags: [a, b, c]`
- Block sequences: `tags:\n  - a\n  - b`
- String values: `title: My Note`

Tags are indexed in the search engine and displayed as clickable pills in the note header. The `title` field overrides the browser tab title.

## Search System

**Entry points:**
- Web: `GET /search?q=...` → `serveSearchResults()` in `pages.js`
- API: `GET /api/search?q=...&limit=25&snippets=true` → `handleSearch()` in `search.js`
- CLI: `node scripts/search-notes.js "query" [--limit N] [--snippets] [--pretty]`

**How it works (`src/lib/search-index.js`):**
- On first request, reads all Markdown files into memory + parses frontmatter → `buildSearchRecords()`
- Cache TTL: 30 seconds
- Multi-word queries: tokenize on whitespace; all tokens must match in the same field
- Scoring (single token): exact basename=100, prefix=75, tag exact=70, tag contains=60, path=50, content=25, fuzzy basename=10
- Scoring (multi-token): all in basename=70, all in tags=65, all in path=45, all in content=20
- `getBacklinks(relPath)` — scans cached records for `[[wikilinks]]` and `[text](href)` links to the given path

**Record shape:**
```js
{
  path: 'documents/docker.md',   // relative to Notes/
  basename: 'docker',
  basenameLower: 'docker',
  pathLower: 'documents/docker.md',
  tags: ['docker', 'devops'],
  tagsLower: ['docker', 'devops'],
  content: '...',                // body only (frontmatter stripped)
  contentLower: '...'
}
```

## Wikilinks

`[[Note Title]]` syntax in notes is resolved to a hyperlink before markdown-it runs. Resolution is case-insensitive by basename. If no match exists, it renders as `**Note Title**` (bold). Code blocks are protected from wikilink substitution.

To add wikilink support for new pages, pass a resolver to `renderMarkdown(content, noteResolver)`.

## Caching Strategy

All caching uses simple in-memory objects with a `builtAt` timestamp and 30-second TTL:
- `notes.js` — file list cache (`getMarkdownFilesCached`)
- `search-index.js` — full search record cache (`getRecords`)

Static assets (JS/CSS files from `public/`) are read once at module load in `pages.js` and reused for all requests. No per-request filesystem reads for static content.

## HTML Generation

All pages are server-rendered as complete HTML strings in `pages.js`. No templating library — just template literals. CSS and JS are inlined into every page response (from module-level caches).

Page structure for a note page:
```
.container
  aside.sidebar
    .sidebar-header (home icon + search input)
    nav.file-list (sidebar tree)
  main.content
    .content-header (breadcrumb/title + controls)
    .markdown-body
      .note-meta (word count + tag pills)
      .toc-details (collapsible TOC, only if ≥2 headings)
      [rendered markdown]
      .backlinks-section (only if backlinks exist)
```

## Making Changes

**Adding a new frontmatter field:**
1. Parse it in `parseFrontmatter` (may work already if it's a string or array)
2. Add it to the search record in `buildSearchRecords` if it should be searchable
3. Display it in `renderNoteMeta` in `pages.js`

**Adding a new page route:**
1. Add handler function in a new file under `src/routes/`
2. Wire it up in `src/app.js`

**Adding a new markdown-it plugin:**
1. `npm install markdown-it-<plugin>`
2. `md.use(...)` in `src/lib/markdown.js`

**Adding styles:**
- All styles go in `public/style.css`
- Dark mode variants use `body[data-theme="dark"] .class-name { ... }` selectors

## Running the CLI Search (for agents)

```bash
node scripts/search-notes.js "query term" --pretty --snippets
```

Returns JSON: `{ query, total, results: [{ path, title, tags, score, snippet? }] }`.

Useful for finding relevant notes before reading them.

## Hot Reload System

**Development-only feature** — only active when `NODE_ENV !== 'production'`.

Hot reload enables automatic browser updates when markdown files change, without requiring a full page reload. The system consists of:

**Server-side (`index.js`):**
- File watcher using `chokidar` (or `fs.watch` fallback) monitors all `.md` files in `Notes/`
- On file change: invalidates caches (`invalidateFileCache()`, `invalidateSearchCache()`) and emits event via `emitFileChange()`
- Only sets up watcher when `NODE_ENV !== 'production'`

**API endpoints (`src/app.js`):**
- `GET /api/hot-reload` — Server-Sent Events (SSE) endpoint that broadcasts file change events
- `GET /api/content?path=...` — Returns updated markdown HTML for a given file path
- Both endpoints only available in development mode

**Client-side (`public/hot-reload.js`):**
- Connects to SSE endpoint on page load
- Listens for `file-changed` events
- When current page's file changes: fetches updated content from `/api/content`, replaces `#markdown-body` innerHTML, preserves scroll position, re-initializes TOC/Mermaid/Prism
- Path normalization handles `Notes/` prefix difference between server and client paths
- Only active on `localhost`/`127.0.0.1` (additional safety check)

**How it works:**
1. File watcher detects markdown change → emits event
2. SSE endpoint broadcasts event to all connected browsers
3. Browser receives event, checks if changed file matches current page
4. If match: fetches updated content, replaces DOM, re-initializes scripts
5. Scroll position is preserved automatically (no save/restore needed)

**Cache invalidation:**
- `src/lib/notes.js` — `invalidateFileCache()` clears file list cache
- `src/lib/search-index.js` — `invalidateSearchCache()` clears search records cache
- Both caches have 30-second TTL, but hot reload forces immediate refresh

**Note**: The dev script (`npm run dev`) uses nodemon to watch code files (`index.js`, `src/`, `public/`) but does NOT watch `Notes/` — markdown changes are handled by hot reload, not server restarts.

## Test Suite

```bash
npm test
```

Uses `node:test` (no external test framework). Tests are in `test/search-index.test.js` and cover ranking, multi-word, tag scoring, fuzzy matching, limit, and result format. When modifying search scoring, update or add tests here.
