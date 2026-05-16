import type { IncomingMessage, ServerResponse } from "node:http";
import type { SearchEngine } from "../../../lib/search.js";
import { json } from "../../../lib/http.js";
import { encodePathSegments, stripMdExtension } from "../../../lib/path-utils.js";
import { MIN_SEARCH_QUERY_LENGTH } from "../../../lib/search.js";

export interface SearchApiHandlers {
  handleSearch(req: IncomingMessage, res: ServerResponse, parsedUrl: URL): void;
}

export function createSearchApi(deps: { searchEngine: SearchEngine }): SearchApiHandlers {
  function handleSearch(req: IncomingMessage, res: ServerResponse, parsedUrl: URL): void {
    const query = parsedUrl.searchParams.get("q") || "";
    const limitValue = parsedUrl.searchParams.get("limit") || "25";
    const limit = Number.parseInt(limitValue, 10);
    const includeSnippets = parsedUrl.searchParams.get("snippets") === "true";

    const trimmedQuery = query.trim();
    if (!trimmedQuery || trimmedQuery.length < MIN_SEARCH_QUERY_LENGTH) {
      json(res, 200, {
        query,
        minQueryLength: MIN_SEARCH_QUERY_LENGTH,
        results: [],
        total: 0,
      });
      return;
    }

    const results = deps.searchEngine
      .searchNotes(query, Number.isNaN(limit) ? 25 : limit, includeSnippets)
      .map((item) => ({
        ...item,
        url: `/${encodePathSegments(stripMdExtension(item.path))}`,
      }));

    json(res, 200, {
      query,
      minQueryLength: MIN_SEARCH_QUERY_LENGTH,
      total: results.length,
      results,
    });
  }

  return { handleSearch };
}
