import MarkdownIt from "markdown-it";
import markdownItTaskLists from "markdown-it-task-lists";
import markdownItFootnote from "markdown-it-footnote";
import markdownItDeflist from "markdown-it-deflist";
import markdownItSub from "markdown-it-sub";
import markdownItSup from "markdown-it-sup";
import markdownItAbbr from "markdown-it-abbr";
import markdownItContainer from "markdown-it-container";
import markdownItAttrs from "markdown-it-attrs";
import markdownItAnchor from "markdown-it-anchor";
import { parseFrontmatter } from "./frontmatter.js";

const md = new MarkdownIt({
  linkify: true,
  highlight(str: string, lang: string): string {
    if (lang && lang.toLowerCase() === "mermaid") {
      return `<div class="mermaid">${str}</div>`;
    }

    const escaped = md.utils.escapeHtml(str);
    if (lang) {
      return `<pre class="language-${lang}"><code class="language-${lang}">${escaped}</code></pre>`;
    }
    return `<pre><code>${escaped}</code></pre>`;
  },
});

md.use(markdownItTaskLists);
md.use(markdownItFootnote);
md.use(markdownItDeflist);
md.use(markdownItSub);
md.use(markdownItSup);
md.use(markdownItAbbr);
md.use(markdownItContainer, "warning");
md.use(markdownItContainer, "info");
md.use(markdownItAttrs);
md.use(markdownItAnchor);

/**
 * Replace [[Title]] wikilinks in non-code segments of a markdown string.
 * resolver(title) should return a URL string or null.
 * Unresolved wikilinks are rendered as bold text.
 */
export function processWikilinks(
  content: string,
  resolver: (title: string) => string | null
): string {
  const parts: string[] = [];
  const codeRe = /(`{3,}[\s\S]*?`{3,}|`[^`\n]+`)/g;
  let lastIndex = 0;
  let match: RegExpExecArray | null;

  while ((match = codeRe.exec(content)) !== null) {
    // Push any text before this code span
    if (match.index > lastIndex) {
      parts.push(processWikilinksInText(content.slice(lastIndex, match.index), resolver));
    }
    // Pass code span through unchanged
    parts.push(match[0]);
    lastIndex = codeRe.lastIndex;
  }

  // Process remaining text after the last code span
  if (lastIndex < content.length) {
    parts.push(processWikilinksInText(content.slice(lastIndex), resolver));
  }

  return parts.join("");
}

function processWikilinksInText(
  text: string,
  resolver: (title: string) => string | null
): string {
  return text.replace(/\[\[([^\]\n]+)\]\]/g, (_match, title: string) => {
    const trimmed = title.trim();
    const url = resolver(trimmed);
    if (url) {
      return `<a href="${url}" class="wikilink">${trimmed}</a>`;
    }
    return `<strong class="wikilink-unresolved">${trimmed}</strong>`;
  });
}

export interface Heading {
  level: number;
  id: string;
  text: string;
}

/**
 * Extract headings from rendered HTML for table of contents generation.
 */
export function extractHeadings(html: string): Heading[] {
  const headings: Heading[] = [];
  const re = /<h([1-6])\s+id="([^"]+)"[^>]*>(.*?)<\/h[1-6]>/gi;
  let match: RegExpExecArray | null;
  while ((match = re.exec(html)) !== null) {
    headings.push({
      level: Number(match[1]),
      id: match[2],
      text: match[3].replace(/<[^>]*>/g, ""),
    });
  }
  return headings;
}

/**
 * Read a markdown file, parse frontmatter, process wikilinks, and render to HTML.
 */
export function renderMarkdown(
  content: string,
  resolver: (title: string) => string | null
): string {
  const { body } = parseFrontmatter(content);
  const withWikilinks = processWikilinks(body, resolver);
  return md.render(withWikilinks);
}

/** Access the underlying markdown-it instance for advanced use. */
export function getMarkdownIt(): MarkdownIt {
  return md;
}

export default md;
