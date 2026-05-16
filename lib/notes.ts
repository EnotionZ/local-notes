import { existsSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { globSync } from "glob";
import { normalizePath, safeJoinWithin } from "./path-utils.js";

const FILE_CACHE_TTL_MS = 30000;

interface FileCache {
  builtAt: number;
  files: string[];
}

/**
 * Create a notes manager bound to a specific notes directory.
 * All operations are scoped to this directory.
 */
export function createNotesManager(notesDir: string) {
  let fileCache: FileCache = { builtAt: 0, files: [] };

  function getNotesRootAbsPath(): string {
    return path.resolve(notesDir);
  }

  function resolveNotesPath(relPath: string): string | null {
    return safeJoinWithin(path.dirname(notesDir), path.basename(notesDir), relPath);
  }

  function getMarkdownFiles(): string[] {
    const absNotesRoot = getNotesRootAbsPath();
    if (!existsSync(absNotesRoot) || !statSync(absNotesRoot).isDirectory()) {
      return [];
    }

    return globSync("**/*.md", {
      cwd: absNotesRoot,
      ignore: ["node_modules/**", ".git/**"],
      follow: true,
    })
      .map((p: string) => normalizePath(p))
      .sort((a: string, b: string) => a.localeCompare(b));
  }

  /** Cached version — refreshes every 30 seconds. */
  function getMarkdownFilesCached(): string[] {
    if (Date.now() - fileCache.builtAt > FILE_CACHE_TTL_MS) {
      fileCache = { builtAt: Date.now(), files: getMarkdownFiles() };
    }
    return fileCache.files;
  }

  /** Force cache refresh on next access. */
  function invalidateFileCache(): void {
    fileCache.builtAt = 0;
  }

  /** Read a note's raw content by relative path. Returns null if missing. */
  function readNote(relPath: string): string | null {
    const absPath = resolveNotesPath(relPath);
    if (!absPath || !existsSync(absPath)) return null;
    return readFileSync(absPath, "utf-8");
  }

  return {
    notesDir,
    getNotesRootAbsPath,
    resolveNotesPath,
    getMarkdownFiles,
    getMarkdownFilesCached,
    invalidateFileCache,
    readNote,
  };
}

export type NotesManager = ReturnType<typeof createNotesManager>;
