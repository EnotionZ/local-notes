#!/usr/bin/env node
/**
 * Standalone script to search notes for use by LLMs and other tools.
 *
 * Usage:
 *   npx tsx scripts/search-notes.ts "query" [options]
 *
 * Options:
 *   --limit N        Maximum number of results (default: 25, max: 100)
 *   --snippets       Include content snippets in results
 *   --json           Output as JSON (default)
 *   --pretty         Pretty-print JSON output
 *
 * Examples:
 *   npx tsx scripts/search-notes.ts "lambda"
 *   npx tsx scripts/search-notes.ts "aws" --limit 10 --snippets
 *   npx tsx scripts/search-notes.ts "docker" --pretty
 */

import { createNotesManager } from "../lib/notes.js";
import { createSearchEngine, MIN_SEARCH_QUERY_LENGTH } from "../lib/search.js";

function parseArgs() {
  const args = process.argv.slice(2);
  const query = args.find((arg) => !arg.startsWith("--")) || "";
  const limitArg = args.find((arg) => arg.startsWith("--limit"));
  const limit = limitArg ? Number.parseInt(limitArg.split("=")[1] || "25", 10) : 25;
  const includeSnippets = args.includes("--snippets");
  const pretty = args.includes("--pretty");

  return { query, limit, includeSnippets, pretty };
}

function main() {
  const { query, limit, includeSnippets, pretty } = parseArgs();

  const trimmedQuery = query.trim();

  if (!trimmedQuery || trimmedQuery.length < MIN_SEARCH_QUERY_LENGTH) {
    const error = {
      error: "Query too short",
      query: trimmedQuery,
      minQueryLength: MIN_SEARCH_QUERY_LENGTH,
      results: [],
    };
    console.log(JSON.stringify(error, null, pretty ? 2 : 0));
    process.exit(1);
    return;
  }

  const notesManager = createNotesManager(
    process.env.NOTES_DIR || process.cwd() + "/Notes"
  );
  const searchEngine = createSearchEngine(notesManager);

  const normalizedLimit = Math.max(1, Math.min(limit, 100));
  const results = searchEngine.searchNotes(trimmedQuery, normalizedLimit, includeSnippets);
  const output = {
    query: trimmedQuery,
    minQueryLength: MIN_SEARCH_QUERY_LENGTH,
    total: results.length,
    results,
  };
  console.log(JSON.stringify(output, null, pretty ? 2 : 0));
}

main();
