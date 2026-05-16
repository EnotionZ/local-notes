import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

/** Shared config shape consumed by webapp and MCP alike. */
export interface NotesConfig {
  /** Absolute path to the notes directory. */
  notesDir: string;
  /** HTTP server port (webapp only). */
  port: number;
  /** HTTP server host (webapp only). */
  host: string;
  /** Optional display name for MCP server identity (e.g. "Qwestly"). */
  name?: string;
  /** Enable markdown file watching for hot reload. Defaults to true in dev, false in production. */
  watch?: boolean;
}

/** Minimal config-file schema. */
interface ConfigFile {
  notesDir?: string;
  port?: number;
  host?: string;
  name?: string;
  watch?: boolean;
}

const DEFAULT_PORT = 8007;
const DEFAULT_HOST = "0.0.0.0";
const DEFAULT_NOTES_DIR = ".";

/**
 * Resolve the notes directory from config. Priority:
 * 1. `notesDir` from a JSON config file (loaded via --config)
 * 2. `NOTES_DIR` env var
 * 3. `notesDir` field in a `local-notes.json` in cwd
 * 4. Default current directory (`.`) resolved against cwd
 */
export function resolveNotesDir(configFile?: string): string {
  // 1. Explicit config file
  if (configFile) {
    const abs = resolve(process.cwd(), configFile);
    if (existsSync(abs)) {
      const cfg: ConfigFile = JSON.parse(readFileSync(abs, "utf-8"));
      if (cfg.notesDir) return resolve(process.cwd(), cfg.notesDir);
    }
  }

  // 2. Env var
  if (process.env.NOTES_DIR) {
    return resolve(process.cwd(), process.env.NOTES_DIR);
  }

  // 3. Auto-discover local-notes.json in cwd
  const autoConfig = resolve(process.cwd(), "local-notes.json");
  if (existsSync(autoConfig)) {
    const cfg: ConfigFile = JSON.parse(readFileSync(autoConfig, "utf-8"));
    if (cfg.notesDir) return resolve(process.cwd(), cfg.notesDir);
  }

  // 4. Default
  return resolve(process.cwd(), DEFAULT_NOTES_DIR);
}

/**
 * Parse CLI arguments into a partial config.
 * Supports:
 *   local-notes /path/to/notes           (positional)
 *   local-notes --port 8080 --host 0.0.0.0
 *   local-notes --config ./cfg.json
 *   local-notes --name Qwestly           (MCP name override)
 *   local-notes --watch                  (enable markdown watcher)
 *   local-notes --no-watch               (disable markdown watcher)
 */
export function parseCliArgs(argv: string[]): Partial<NotesConfig> & { configFile?: string } {
  const config: Partial<NotesConfig> & { configFile?: string } = {};

  let i = 0;

  // First positional arg is the notes directory.
  // Skip args that look like script files (e.g. if argv includes the script path).
  while (i < argv.length && !argv[i].startsWith("-") && /\.(ts|js|mjs|cjs)$/i.test(argv[i])) {
    i++;
  }
  if (i < argv.length && !argv[i].startsWith("-")) {
    config.notesDir = resolve(process.cwd(), argv[i]);
    i++;
  }

  while (i < argv.length) {
    const arg = argv[i];

    switch (arg) {
      case "--port":
      case "-p": {
        const val = argv[++i];
        if (val) config.port = Number.parseInt(val, 10);
        break;
      }
      case "--host":
      case "-H": {
        config.host = argv[++i];
        break;
      }
      case "--config":
      case "-c": {
        config.configFile = argv[++i];
        break;
      }
      case "--name":
      case "-n": {
        config.name = argv[++i];
        break;
      }
      case "--watch": {
        config.watch = true;
        break;
      }
      case "--no-watch": {
        config.watch = false;
        break;
      }
      default: {
        // skip unknown
        break;
      }
    }
    i++;
  }

  return config;
}

/**
 * Build a complete NotesConfig from CLI args, env, and defaults.
 * Priority: CLI args > config file > env vars > defaults.
 */
export function buildConfig(argv: string[]): NotesConfig {
  const cli = parseCliArgs(argv);

  // If --config was given, load it
  let fileCfg: ConfigFile = {};
  if (cli.configFile) {
    const abs = resolve(process.cwd(), cli.configFile);
    if (existsSync(abs)) {
      fileCfg = JSON.parse(readFileSync(abs, "utf-8"));
    }
  } else {
    // Auto-discover
    const autoConfig = resolve(process.cwd(), "local-notes.json");
    if (existsSync(autoConfig)) {
      fileCfg = JSON.parse(readFileSync(autoConfig, "utf-8"));
    }
  }

  const notesDir =
    cli.notesDir ??
    resolve(process.cwd(), fileCfg.notesDir ?? process.env.NOTES_DIR ?? DEFAULT_NOTES_DIR);

  const port = cli.port ?? fileCfg.port ?? (process.env.PORT ? Number(process.env.PORT) : DEFAULT_PORT);
  const host = cli.host ?? fileCfg.host ?? process.env.HOST ?? DEFAULT_HOST;
  const name = cli.name ?? fileCfg.name;
  const watch = cli.watch ?? fileCfg.watch;

  return { notesDir, port, host, name, watch };
}
