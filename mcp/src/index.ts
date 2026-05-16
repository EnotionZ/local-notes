#!/usr/bin/env node

import { readFileSync, writeFileSync, existsSync, mkdirSync, readdirSync, type Dirent } from "node:fs";
import { join, dirname, relative, basename } from "node:path";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { buildConfig } from "../../lib/config.js";
import { createNotesManager } from "../../lib/notes.js";
import { createSearchEngine, extractSnippet } from "../../lib/search.js";
import { parseFrontmatter } from "../../lib/frontmatter.js";

// ── Config ──────────────────────────────────────────────────────────────────
// Called with the MCP server's own argv (--name, --entity, notes dir).
// When run directly: mcp/index.js /path/to/notes --name Qwestly
const cfg = buildConfig(process.argv.slice(2));

const notesManager = createNotesManager(cfg.notesDir);
const searchEngine = createSearchEngine(notesManager);

const displayName = cfg.name || "local-notes";
const displayDesc = cfg.name
  ? `MCP server for managing "${cfg.name}" markdown notes`
  : "MCP server for managing personal markdown notes";

// ── MCP server ───────────────────────────────────────────────────────────────

const server = new McpServer({
  name: displayName,
  version: "1.0.0",
  description: displayDesc,
});

// ── Helper: recursively collect .md files ────────────────────────────────────

function getAllMarkdownFiles(dir: string): string[] {
  const results: string[] = [];
  function walk(d: string) {
    let entries: Dirent[];
    try {
      entries = readdirSync(d, { withFileTypes: true }) as unknown as Dirent[];
    } catch {
      return;
    }
    for (const entry of entries) {
      if (entry.name.startsWith(".")) continue;
      const full = join(d, entry.name);
      if (entry.isDirectory()) {
        walk(full);
      } else if (entry.name.endsWith(".md")) {
        results.push(relative(dir, full));
      }
    }
  }
  if (existsSync(dir)) walk(dir);
  return results.sort();
}

// ── Helper: safe path resolution ─────────────────────────────────────────────

function resolveSafe(relPath: string): string | null {
  const resolved = join(cfg.notesDir, relPath);
  if (!resolved.startsWith(cfg.notesDir)) return null;
  return resolved;
}

// Score a candidate string against a query for search results
function matchScore(haystack: string, needle: string): number {
  const h = haystack.toLowerCase();
  const n = needle.toLowerCase();
  if (h === n) return 100;
  if (h.startsWith(n)) return 80;
  if (h.includes(n)) return 60;
  // fuzzy subsequence
  let hi = 0,
    ni = 0;
  while (hi < h.length && ni < n.length) {
    if (h[hi] === n[ni]) ni++;
    hi++;
  }
  return ni === n.length && n.length >= 2 ? 30 : 0;
}

// ── tool: searchNotes ────────────────────────────────────────────────────────

server.tool(
  "searchNotes",
  "Search through your personal markdown notes folder. Matches against filename, title (from frontmatter), and content. Use this whenever you need to find an existing note — before reading or editing it.",
  {
    query: z.string().describe("Search query — matches filenames, titles, and content"),
    limit: z.number().default(10).describe("Maximum results to return (1–50)"),
  },
  async ({ query, limit }) => {
    const files = getAllMarkdownFiles(cfg.notesDir);
    const results: { path: string; score: number }[] = [];

    for (const relPath of files) {
      const absPath = resolveSafe(relPath);
      if (!absPath) continue;

      let score = matchScore(basename(relPath, ".md"), query);

      // Boost with frontmatter title and content match
      if (score < 80) {
        try {
          const raw = readFileSync(absPath, "utf-8");
          const { data, body } = parseFrontmatter(raw);
          const titleScore = data.title ? matchScore(String(data.title), query) : 0;
          const bodyScore = body.toLowerCase().includes(query.toLowerCase()) ? 25 : 0;
          score = Math.max(score, titleScore, bodyScore);
        } catch {
          /* skip unreadable */
        }
      }

      if (score > 0) {
        results.push({ path: relPath, score });
      }
    }

    results.sort((a, b) => b.score - a.score);
    const top = results.slice(0, Math.min(Math.max(limit, 1), 50));

    return {
      content: [
        {
          type: "text",
          text: top.length
            ? top.map((r) => `${r.path} (score: ${r.score})`).join("\n")
            : `No notes found matching "${query}".`,
        },
      ],
    };
  }
);

// ── tool: readNote ───────────────────────────────────────────────────────────

server.tool(
  "readNote",
  "Read the full contents of a markdown note by its relative path. Use this to view a note before deciding how to edit it.",
  {
    path: z.string().describe("Relative path to the note, e.g. 'AI/MCP.md' or 'projects/JotDown.md'"),
  },
  async ({ path: relPath }) => {
    const absPath = resolveSafe(relPath);
    if (!absPath) {
      return { content: [{ type: "text", text: `Error: Invalid path "${relPath}".` }] };
    }
    if (!existsSync(absPath)) {
      return {
        content: [
          {
            type: "text",
            text: `Error: Note "${relPath}" not found. Use listNotes or searchNotes to find the right path.`,
          },
        ],
      };
    }
    const content = readFileSync(absPath, "utf-8");
    return {
      content: [{ type: "text", text: content }],
    };
  }
);

// ── tool: createNote ─────────────────────────────────────────────────────────

server.tool(
  "createNote",
  "Create a new markdown note in your notes folder. Creates parent directories as needed. If a note at that path already exists, it will NOT overwrite unless you set overwrite to true.",
  {
    path: z.string().describe("Relative path for the new note, e.g. 'thoughts/my-idea.md'. Must end in .md."),
    content: z.string().describe("Markdown content for the note. Can include YAML frontmatter (--- delimited)."),
    overwrite: z.boolean().default(false).describe("Set to true to overwrite if the note already exists."),
  },
  async ({ path: relPath, content, overwrite }) => {
    if (!relPath.endsWith(".md")) {
      return { content: [{ type: "text", text: `Error: Path must end in ".md", got "${relPath}".` }] };
    }
    const absPath = resolveSafe(relPath);
    if (!absPath) {
      return { content: [{ type: "text", text: `Error: Invalid path "${relPath}".` }] };
    }
    if (existsSync(absPath) && !overwrite) {
      return {
        content: [
          {
            type: "text",
            text: `Note "${relPath}" already exists. Set overwrite=true to replace it, or use updateNote to edit it.`,
          },
        ],
      };
    }
    mkdirSync(dirname(absPath), { recursive: true });
    writeFileSync(absPath, content, "utf-8");
    return {
      content: [{ type: "text", text: `Created note "${relPath}".` }],
    };
  }
);

// ── tool: updateNote ─────────────────────────────────────────────────────────

server.tool(
  "updateNote",
  "Update an existing markdown note. You can either replace the entire content, or provide old_string/new_string for a targeted find-and-replace within the file.",
  {
    path: z.string().describe("Relative path to the note to update, e.g. 'AI/MCP.md'."),
    content: z.string().optional().describe("Complete new content for the note. Use to replace the entire file."),
    old_string: z.string().optional().describe("Exact text to find and replace in the note."),
    new_string: z.string().optional().describe("Replacement text (only used with old_string)."),
  },
  async ({ path: relPath, content, old_string, new_string }) => {
    const absPath = resolveSafe(relPath);
    if (!absPath || !existsSync(absPath)) {
      return {
        content: [
          {
            type: "text",
            text: `Error: Note "${relPath}" not found. Use searchNotes to find it, or createNote to create it.`,
          },
        ],
      };
    }

    const current = readFileSync(absPath, "utf-8");

    if (content !== undefined) {
      writeFileSync(absPath, content, "utf-8");
      return { content: [{ type: "text", text: `Updated "${relPath}" (full replacement).` }] };
    }

    if (old_string !== undefined) {
      if (!current.includes(old_string)) {
        return {
          content: [
            {
              type: "text",
              text: `Error: Could not find the specified text in "${relPath}". The note was not modified. Double-check the exact text and try again.`,
            },
          ],
        };
      }
      const updated = current.replace(old_string, new_string ?? "");
      writeFileSync(absPath, updated, "utf-8");
      return { content: [{ type: "text", text: `Updated "${relPath}" (replaced 1 occurrence).` }] };
    }

    return {
      content: [
        {
          type: "text",
          text: `Error: Provide either "content" (full replacement) or "old_string" + "new_string" (targeted edit).`,
        },
      ],
    };
  }
);

// ── tool: listNotes ──────────────────────────────────────────────────────────

server.tool(
  "listNotes",
  "List all markdown notes in your notes folder, optionally filtered to a subdirectory. Use this to get an overview or browse what notes exist.",
  {
    directory: z.string().optional().describe("Optional subdirectory to list, e.g. 'AI' or 'projects'. If omitted, lists all notes."),
  },
  async ({ directory }) => {
    const targetDir = directory ? join(cfg.notesDir, directory) : cfg.notesDir;
    if (!existsSync(targetDir)) {
      return {
        content: [{ type: "text", text: `Directory "${directory || "."}" not found in notes.` }],
      };
    }
    const files = getAllMarkdownFiles(targetDir);
    const display = directory ? files.map((f) => join(directory, f)) : files;

    return {
      content: [
        {
          type: "text",
          text: display.length ? display.join("\n") : "(no markdown files in this directory)",
        },
      ],
    };
  }
);

// ── start ────────────────────────────────────────────────────────────────────

const transport = new StdioServerTransport();
await server.connect(transport);
