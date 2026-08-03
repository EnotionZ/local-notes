import { after, test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { getGitModifiedTimes } from "../lib/note-dates.js";

const tempDir = mkdtempSync(path.join(tmpdir(), "local-notes-git-dates-"));
const noGitDir = mkdtempSync(path.join(tmpdir(), "local-notes-no-git-dates-"));
after(() => {
  rmSync(tempDir, { recursive: true, force: true });
  rmSync(noGitDir, { recursive: true, force: true });
});

const git = (args, options = {}) =>
  execFileSync("git", args, { cwd: tempDir, encoding: "utf8", ...options });

const commit = (message, timestamp) => {
  git(["add", "."]);
  git(["-c", "user.name=Test", "-c", "user.email=test@example.com", "commit", "-m", message], {
    env: { ...process.env, GIT_AUTHOR_DATE: timestamp, GIT_COMMITTER_DATE: timestamp },
  });
};

test("getGitModifiedTimes uses each note's latest Git commit date", () => {
  git(["init"]);
  mkdirSync(path.join(tempDir, "Notes"));
  writeFileSync(path.join(tempDir, "Notes", "older.md"), "Older");
  writeFileSync(path.join(tempDir, "Notes", "newer.md"), "Newer");
  commit("add notes", "2024-01-01T00:00:00Z");

  writeFileSync(path.join(tempDir, "Notes", "newer.md"), "Updated");
  commit("update newer note", "2024-02-01T00:00:00Z");

  const modifiedTimes = getGitModifiedTimes(path.join(tempDir, "Notes"));
  assert.equal(modifiedTimes.get("older.md"), Date.parse("2024-01-01T00:00:00Z"));
  assert.equal(modifiedTimes.get("newer.md"), Date.parse("2024-02-01T00:00:00Z"));
});

test("getGitModifiedTimes falls back cleanly when notes are not in a Git repository", () => {
  assert.deepEqual(getGitModifiedTimes(noGitDir), new Map());
});
