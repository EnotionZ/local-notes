# local-notes

A lightweight Markdown notes server for browsing, searching, and managing your local notes.

## Features

### 📝 Markdown Preview
Renders Markdown files as styled HTML pages with support for:
- **Task lists** `- [ ]` / `- [x]`
- **Mermaid diagrams** via ` ```mermaid ` blocks
- **Footnotes**, definition lists, emoji, sub/superscript
- **Custom containers** (`::: info`, `::: warning`)
- **Heading anchors** for easy linking
- **Syntax highlighting** via Prism.js

### 🔗 Wikilinks
Link between notes using `[[Note Title]]` syntax — auto-resolves to matching files.

### 🔍 Full-Text Search
Search across all notes with ranked results:
- Exact filename match (highest)
- Prefix, tag, path, content match
- Fuzzy fallback for typos
- AND semantics for multi-word queries

### 📂 Sidebar Navigation
Collapsible folder tree with favorites (tagged `star`) and keyboard shortcuts (`Ctrl/Cmd+K` to search, `Esc` to clear).

### 🏠 Homepage Filters
- **Favorites** — notes tagged with `star` or in `_star_/` folder
- **Recent** — most recently modified notes
- **Readme** — this page

### 🔄 Hot Reload
Edit a Markdown file and the browser updates in-place without a full reload — scroll position preserved.

### 📋 Backlinks
See which other notes link to the current note via `[[wikilinks]]`.

### 📱 PWA
Installable as a Progressive Web App with offline support via service worker.

## Usage

### Local preview
```bash
npx local-notes ./path/to/notes
```

### Options
| Flag | Description |
|------|-------------|
| `--port`, `-p` | Server port (default: 8007) |
| `--host`, `-H` | Server host (default: 0.0.0.0) |
| `--config`, `-c` | Path to JSON config file |
| `--name`, `-n` | Display name for MCP server identity |
| `--watch` / `--no-watch` | Toggle markdown file watching |


## Deployment

### Vercel

The package exports `createApp` — a `(req, res)` handler compatible with Vercel serverless functions. To deploy your own notes server:

1. Install the package: `npm install local-notes`
2. Create `api/index.ts` that imports and configures the app:

```ts
import { createApp } from "local-notes";
import { createNotesManager } from "local-notes";
import { createSearchEngine } from "local-notes";
import path from "node:path";
import { existsSync } from "node:fs";

const notesDir = process.env.NOTES_DIR || path.resolve(process.cwd(), "Notes");
const publicDir = path.resolve(process.cwd(), "public");

const notesManager = createNotesManager(notesDir);
const searchEngine = createSearchEngine(notesManager);

export default createApp({
  notesManager,
  searchEngine,
  publicDir,
  readmePath: undefined, // optional readme on the homepage
});
```

3. Deploy with your notes directory:
```bash
vercel --env NOTES_DIR=./docs
```

Dev-only features (hot reload, content SSE) are disabled automatically when `NODE_ENV` is `production`.

## MCP Server

The package ships a standalone MCP server that lets LLMs read, search, create, and update notes directly.

### Run it

```bash
# From a local checkout
node dist/mcp/index.js ./path/to/notes

# With a custom server name (shown in the LLM's tool list)
node dist/mcp/index.js ./path/to/notes --name Qwestly
```

The first positional argument is the notes directory. The `--name` flag controls how the MCP server identifies itself to the LLM.

### Wire it into an MCP client

For Claude Desktop, Cline, or any stdio-based MCP host:

```json
{
  "mcpServers": {
    "notes": {
      "command": "node",
      "args": ["/path/to/local-notes/dist/mcp/index.js", "/path/to/notes"]
    }
  }
}
```

### Available tools

| Tool | Description |
|------|-------------|
| `listNotes` | List all markdown files in the notes directory |
| `readNote` | Read a note's full content by relative path |
| `searchNotes` | Full-text search across all notes |
| `createNote` | Create a new markdown note |
| `updateNote` | Replace content or do a find-and-replace in a note |

## Tech
- **Runtime:** Node.js 22+, TypeScript, ESM
- **Markdown:** markdown-it with 12 plugins
- **Search:** Custom ranked full-text search engine
- **MCP:** Model Context Protocol SDK for LLM integration
- **Frontend:** Vanilla JS, Pico CSS, Prism.js, Mermaid
