import path from "node:path";

/** Normalize backslashes to forward slashes (Windows compat). */
export function normalizePath(p: string): string {
  return p.replaceAll("\\", "/");
}

/**
 * Safely resolve a relative path within a base directory.
 * Prevents directory traversal outside the base.
 * Returns the resolved absolute path, or null if traversal is detected.
 */
export function safeJoinWithin(rootDir: string, baseDir: string, relPath: string): string | null {
  const resolvedBase = path.resolve(rootDir, baseDir);
  const resolvedPath = path.resolve(resolvedBase, relPath);
  if (resolvedPath === resolvedBase || resolvedPath.startsWith(`${resolvedBase}${path.sep}`)) {
    return resolvedPath;
  }
  return null;
}

/** URI-encode each path segment individually. */
export function encodePathSegments(pathStr: string): string {
  return pathStr
    .split("/")
    .map((s) => encodeURIComponent(s))
    .join("/");
}

/** Remove trailing .md extension if present. */
export function stripMdExtension(p: string): string {
  return p.endsWith(".md") ? p.slice(0, -3) : p;
}

/** Escape HTML special characters. */
export function escapeHtml(value: string): string {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

/** Escape special regex characters in a string. */
export function escapeRegex(str: string): string {
  return String(str).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
