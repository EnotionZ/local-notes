import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { parseFrontmatter } from "./frontmatter.js";
import { createNotesManager, type NotesManager } from "./notes.js";

const CACHE_TTL_MS = 30000;
export const MIN_SEARCH_QUERY_LENGTH = 3;

// --------------------------------------------------------------------------
// Types
// --------------------------------------------------------------------------

export interface SearchRecord {
  path: string;
  basename: string;
  basenameLower: string;
  basenameNormalized: string;
  pathLower: string;
  pathNormalized: string;
  tags: string[];
  tagsLower: string[];
  content: string;
  contentLower: string;
}

export interface SearchResult {
  path: string;
  score: number;
  tags: string[];
  snippet?: string;
}

interface SearchCache {
  builtAt: number;
  records: SearchRecord[];
}

// --------------------------------------------------------------------------
// Helpers
// --------------------------------------------------------------------------

function normalizeForMatch(str: string): string {
  return str.toLowerCase().replace(/[-_\s]/g, "");
}

function isFuzzyMatch(haystack: string, needle: string): boolean {
  if (needle.length < 2) return false;
  let hi = 0;
  for (let ni = 0; ni < needle.length; ni++) {
    while (hi < haystack.length && haystack[hi] !== needle[ni]) hi++;
    if (hi >= haystack.length) return false;
    hi++;
  }
  return true;
}

// --------------------------------------------------------------------------
// Tokenization & scoring
// --------------------------------------------------------------------------

export function tokenizeQuery(query: string): string[] {
  return query
    .trim()
    .toLowerCase()
    .split(/\s+/)
    .filter((t) => t.length >= MIN_SEARCH_QUERY_LENGTH);
}

/**
 * Score a single record against a single lower-cased query token.
 * Returns the highest matching score for this token.
 */
export function scoreRecord(record: SearchRecord, token: string): number {
  // Exact basename match
  if (record.basenameLower === token) return 100;
  // Basename starts with token
  if (record.basenameLower.startsWith(token)) return 75;
  // Exact tag match
  if (record.tagsLower.includes(token)) return 70;
  // Tag contains token
  if (record.tagsLower.some((t) => t.includes(token))) return 60;
  // Path contains token
  if (record.pathLower.includes(token)) return 50;
  // Basename contains token (substring)
  if (record.basenameLower.includes(token)) return 40;
  // Content contains token
  if (record.contentLower.includes(token)) return 25;
  // Fuzzy match on normalized basename (subsequence)
  if (isFuzzyMatch(record.basenameNormalized, token)) return 10;

  return 0;
}

/**
 * Score a record for all tokens. Returns 0 if any token fails to match.
 */
function scoreAllTokens(record: SearchRecord, tokens: string[]): number {
  let total = 0;
  for (const token of tokens) {
    const s = scoreRecord(record, token);
    if (s === 0) return 0; // all tokens must match
    total += s;
  }
  return total;
}

export function extractSnippet(content: string, query: string, maxLen = 200): string {
  const lowerContent = content.toLowerCase();
  const lowerQuery = query.toLowerCase();
  const idx = lowerContent.indexOf(lowerQuery);

  if (idx === -1) {
    // Fallback: return first maxLen chars
    return content.slice(0, maxLen).replace(/\s+/g, " ").trim();
  }

  const start = Math.max(0, idx - 60);
  const end = Math.min(content.length, idx + query.length + 60);
  let snippet = content.slice(start, end).replace(/\s+/g, " ").trim();

  if (start > 0) snippet = `…${snippet}`;
  if (end < content.length) snippet = `${snippet}…`;

  return snippet;
}

// --------------------------------------------------------------------------
// Search engine factory
// --------------------------------------------------------------------------

/**
 * Create a search engine bound to a specific notes manager.
 */
export function createSearchEngine(nm: NotesManager) {
  let cache: SearchCache = { builtAt: 0, records: [] };

  function buildSearchRecords(): SearchRecord[] {
    const files = nm.getMarkdownFilesCached();
    return files
      .map((relPath: string) => {
        const absPath = nm.resolveNotesPath(relPath);
        if (!absPath || !existsSync(absPath)) return null;

        const raw = readFileSync(absPath, "utf8");
        const { data, body } = parseFrontmatter(raw);
        const tags = Array.isArray(data.tags) ? data.tags.map(String) : [];
        const basename = path.basename(relPath, ".md");
        const basenameLower = basename.toLowerCase();
        const pathLower = relPath.toLowerCase();

        return {
          path: relPath,
          basename,
          basenameLower,
          basenameNormalized: normalizeForMatch(basenameLower),
          pathLower,
          pathNormalized: normalizeForMatch(pathLower),
          tags,
          tagsLower: tags.map((t) => t.toLowerCase()),
          content: body,
          contentLower: body.toLowerCase(),
        } as SearchRecord;
      })
      .filter(Boolean) as SearchRecord[];
  }

  function getRecords(): SearchRecord[] {
    if (Date.now() - cache.builtAt > CACHE_TTL_MS) {
      cache = {
        builtAt: Date.now(),
        records: buildSearchRecords(),
      };
    }
    return cache.records;
  }

  /** Force cache refresh on next access. */
  function invalidateSearchCache(): void {
    cache.builtAt = 0;
  }

  /**
   * Search notes with the given query string.
   * Multi-word queries require ALL tokens to match (AND semantics).
   */
  function searchNotes(
    query: string,
    limit = 25,
    includeSnippets = false
  ): SearchResult[] {
    const tokens = tokenizeQuery(query);
    if (tokens.length === 0) return [];

    const records = getRecords();
    const results: SearchResult[] = [];

    for (const record of records) {
      const score = scoreAllTokens(record, tokens);
      if (score > 0) {
        const result: SearchResult = {
          path: record.path,
          score,
          tags: record.tags,
        };
        if (includeSnippets) {
          result.snippet = extractSnippet(record.content, query);
        }
        results.push(result);
      }
    }

    results.sort((a, b) => b.score - a.score);
    return results.slice(0, Math.max(1, limit));
  }

  /**
   * Find all backlinks to a note (other notes that link to it via [[wikilink]] or [text](path)).
   */
  function getBacklinks(currentPath: string): { path: string; title: string }[] {
    const records = getRecords();
    const currentBasename = path.basename(currentPath, ".md").toLowerCase();
    const normalizedCurrent = currentBasename.replace(/[-_\s]/g, "").toLowerCase();
    const backlinks: { path: string; title: string }[] = [];

    for (const record of records) {
      if (record.path === currentPath) continue;

      let hasLink = false;

      // Check [[wikilinks]]
      const wikilinkRe = /\[\[([^\]\n]+)\]\]/g;
      let m: RegExpExecArray | null;
      while ((m = wikilinkRe.exec(record.content)) !== null) {
        if (m[1].trim().toLowerCase() === currentBasename) {
          hasLink = true;
          break;
        }
      }

      // Check markdown links [text](href)
      if (!hasLink) {
        const linkRe = /\[([^\]]*)\]\(([^)]+)\)/g;
        while ((m = linkRe.exec(record.content)) !== null) {
          const href = m[2].replace(/\.md$/, "").replace(/^\//, "").toLowerCase();
          if (href === normalizedCurrent || href === currentBasename) {
            hasLink = true;
            break;
          }
        }
      }

      if (hasLink) {
        backlinks.push({ path: record.path, title: record.basename });
      }
    }

    return backlinks;
  }

  return {
    searchNotes,
    getBacklinks,
    getRecords,
    invalidateSearchCache,
  };
}

export type SearchEngine = ReturnType<typeof createSearchEngine>;

/**
 * Standalone search helper for testing — takes an array of records directly
 * instead of going through the filesystem-backed search engine.
 */
export function searchNotesInRecords(
  records: SearchRecord[],
  query: string,
  limit = 25,
  includeSnippets = false
): SearchResult[] {
  const tokens = tokenizeQuery(query);
  if (tokens.length === 0) return [];

  const results: SearchResult[] = [];

  for (const record of records) {
    const score = scoreAllTokens(record, tokens);
    if (score > 0) {
      const result: SearchResult = {
        path: record.path,
        score,
        tags: record.tags,
      };
      if (includeSnippets) {
        result.snippet = extractSnippet(record.content, query);
      }
      results.push(result);
    }
  }

  results.sort((a, b) => b.score - a.score);
  return results.slice(0, Math.max(1, limit));
}
