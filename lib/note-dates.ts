import { execFileSync } from "node:child_process";

const CACHE_TTL_MS = 30_000;
const modifiedTimesCache = new Map<string, { builtAt: number; modifiedTimes: Map<string, number> }>();

/**
 * Returns each tracked note's most recent Git commit time (milliseconds since
 * the Unix epoch). An empty map means Git history is unavailable.
 */
export const getGitModifiedTimes = (notesDir: string): Map<string, number> => {
  const cached = modifiedTimesCache.get(notesDir);
  if (cached && Date.now() - cached.builtAt < CACHE_TTL_MS) return cached.modifiedTimes;

  let modifiedTimes = new Map<string, number>();
  try {
    const git = (args: string[]) =>
      execFileSync("git", ["-C", notesDir, ...args], {
        encoding: "utf8",
        stdio: ["ignore", "pipe", "ignore"],
        maxBuffer: 10 * 1024 * 1024,
      });
    const pathPrefix = git(["rev-parse", "--show-prefix"]).trim();
    const output = git(["log", "--format=%ct%x00", "--name-only", "-z", "--", "."]);

    let commitTimeMs: number | undefined;
    for (const rawValue of output.split("\0")) {
      const value = rawValue.replace(/^\n/, "");
      if (!value) continue;

      if (/^\d+$/.test(value)) {
        commitTimeMs = Number(value) * 1_000;
        continue;
      }

      const relPath = pathPrefix && value.startsWith(pathPrefix) ? value.slice(pathPrefix.length) : value;
      if (commitTimeMs !== undefined && !modifiedTimes.has(relPath)) {
        modifiedTimes.set(relPath, commitTimeMs);
      }
    }
  } catch {
    // Filesystem modification times remain the caller's fallback when Git metadata is absent.
  }

  modifiedTimesCache.set(notesDir, { builtAt: Date.now(), modifiedTimes });
  return modifiedTimes;
};
