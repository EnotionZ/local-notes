import { readFileSync, existsSync } from "node:fs";
import type { IncomingMessage, ServerResponse } from "node:http";
import type { NotesManager } from "../../../lib/notes.js";
import type { SearchEngine } from "../../../lib/search.js";
import { json } from "../../../lib/http.js";
import { renderMarkdown, extractHeadings } from "../../../lib/markdown.js";
import { parseFrontmatter } from "../../../lib/frontmatter.js";
import { stripMdExtension } from "../../../lib/path-utils.js";
import { createPages } from "../web/pages.js";

export interface ContentApiHandlers {
  handleContentUpdate(req: IncomingMessage, res: ServerResponse, parsedUrl: URL): void;
}

export function createContentApi(deps: { notesManager: NotesManager; searchEngine: SearchEngine }): ContentApiHandlers {
  const pages = createPages(deps);

  function handleContentUpdate(req: IncomingMessage, res: ServerResponse, parsedUrl: URL): void {
    const relPath = parsedUrl.searchParams.get("path");

    if (!relPath) {
      json(res, 400, { error: "Missing path parameter" });
      return;
    }

    const absPath = deps.notesManager.resolveNotesPath(relPath);
    if (!absPath) {
      json(res, 400, { error: "Invalid path" });
      return;
    }

    if (!existsSync(absPath)) {
      json(res, 404, { error: "File not found" });
      return;
    }

    try {
      const rawContent = readFileSync(absPath, "utf8");
      const { data: frontmatterData } = parseFrontmatter(rawContent);
      const tags = Array.isArray(frontmatterData.tags) ? frontmatterData.tags.map(String) : [];

      const allFiles = deps.notesManager.getMarkdownFilesCached();
      const noteResolver = pages.buildNoteResolver(allFiles);
      const renderedHtml = renderMarkdown(rawContent, noteResolver);

      const headings = extractHeadings(renderedHtml);
      const tocHtml = pages.isTocEnabled(frontmatterData) ? pages.renderToc(headings) : "";

      const noteMetaHtml = pages.renderNoteMeta(tags);
      const backlinks = deps.searchEngine.getBacklinks(relPath);
      const backlinksHtml = pages.renderBacklinks(backlinks);

      const filename = relPath.split("/").pop() || relPath;
      const title = frontmatterData.title ? String(frontmatterData.title) : stripMdExtension(filename);

      const markdownBodyHtml = `${noteMetaHtml}${tocHtml}${renderedHtml}${backlinksHtml}`;

      json(res, 200, {
        html: markdownBodyHtml,
        title,
        hasToc: !!tocHtml,
        hasMermaid: rawContent.includes("```mermaid"),
      });
    } catch (err) {
      json(res, 500, { error: err instanceof Error ? err.message : String(err) });
    }
  }

  return { handleContentUpdate };
}
