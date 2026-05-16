// ── Config ──
export {
  resolveNotesDir,
  buildConfig,
  parseCliArgs,
} from "./config.js";
export type { NotesConfig } from "./config.js";

// ── Frontmatter ──
export { parseFrontmatter } from "./frontmatter.js";
export type { FrontmatterData, ParsedContent } from "./frontmatter.js";

// ── HTTP helpers ──
export { send, json, text, html, serveStaticFile } from "./http.js";

// ── Markdown ──
export {
  renderMarkdown,
  processWikilinks,
  extractHeadings,
  getMarkdownIt,
  default as markdownIt,
} from "./markdown.js";
export type { Heading } from "./markdown.js";

// ── Notes manager ──
export { createNotesManager } from "./notes.js";
export type { NotesManager } from "./notes.js";

// ── Path utils ──
export {
  normalizePath,
  safeJoinWithin,
  encodePathSegments,
  stripMdExtension,
  escapeHtml,
  escapeRegex,
} from "./path-utils.js";

// ── Search engine ──
export { createSearchEngine, tokenizeQuery, scoreRecord, extractSnippet, MIN_SEARCH_QUERY_LENGTH } from "./search.js";
export type { SearchRecord, SearchResult, SearchEngine } from "./search.js";
