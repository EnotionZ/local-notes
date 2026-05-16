// Type declarations for markdown-it plugins that lack their own.
declare module "markdown-it-task-lists" {
  import type MarkdownIt from "markdown-it";
  const plugin: (md: MarkdownIt) => void;
  export default plugin;
}

declare module "markdown-it-footnote" {
  import type MarkdownIt from "markdown-it";
  const plugin: (md: MarkdownIt) => void;
  export default plugin;
}

declare module "markdown-it-deflist" {
  import type MarkdownIt from "markdown-it";
  const plugin: (md: MarkdownIt) => void;
  export default plugin;
}

declare module "markdown-it-sub" {
  import type MarkdownIt from "markdown-it";
  const plugin: (md: MarkdownIt) => void;
  export default plugin;
}

declare module "markdown-it-sup" {
  import type MarkdownIt from "markdown-it";
  const plugin: (md: MarkdownIt) => void;
  export default plugin;
}

declare module "markdown-it-abbr" {
  import type MarkdownIt from "markdown-it";
  const plugin: (md: MarkdownIt) => void;
  export default plugin;
}

declare module "markdown-it-container" {
  import type MarkdownIt from "markdown-it";
  const plugin: (md: MarkdownIt, name: string, opts?: unknown) => void;
  export default plugin;
}

declare module "markdown-it-attrs" {
  import type MarkdownIt from "markdown-it";
  const plugin: (md: MarkdownIt) => void;
  export default plugin;
}

declare module "markdown-it-anchor" {
  import type MarkdownIt from "markdown-it";
  const plugin: (md: MarkdownIt, opts?: unknown) => void;
  export default plugin;
}

declare module "markdown-it-emoji" {
  import type MarkdownIt from "markdown-it";
  const plugin: (md: MarkdownIt) => void;
  export default plugin;
}
