// Matches a YAML frontmatter block at the very start of a file.
const FRONTMATTER_RE = /^---[ \t]*\r?\n([\s\S]*?)\r?\n---[ \t]*(?:\r?\n|$)/;

export interface FrontmatterData {
  [key: string]: string | string[] | null | undefined;
}

export interface ParsedContent {
  data: FrontmatterData;
  body: string;
}

/**
 * Parse YAML frontmatter from a markdown string.
 * Supports a small subset of YAML:
 *   - string values:        key: value
 *   - inline arrays:        tags: [foo, bar]
 *   - block sequences:      tags:\n  - foo\n  - bar
 *   - quoted strings:       title: "My Note"
 */
export function parseFrontmatter(content: string): ParsedContent {
  const match = content.match(FRONTMATTER_RE);
  if (!match) return { data: {}, body: content };
  const body = content.slice(match[0].length);
  const data = parseYamlSubset(match[1]);
  return { data, body };
}

function parseYamlSubset(yaml: string): FrontmatterData {
  const data: FrontmatterData = {};
  const lines = yaml.split(/\r?\n/);
  let i = 0;

  while (i < lines.length) {
    const line = lines[i];
    const colonIdx = line.indexOf(":");

    if (colonIdx === -1 || line.startsWith("#")) {
      i++;
      continue;
    }

    const key = line.slice(0, colonIdx).trim().toLowerCase();
    const rest = line.slice(colonIdx + 1).trim();

    if (!key) {
      i++;
      continue;
    }

    if (!rest) {
      // Possibly a block sequence
      const items: string[] = [];
      while (i + 1 < lines.length && /^\s+-\s+/.test(lines[i + 1])) {
        i++;
        items.push(
          lines[i]
            .replace(/^\s+-\s+/, "")
            .replace(/^['"]|['"]$/g, "")
            .trim()
        );
      }
      data[key] = items.length ? items : null;
    } else if (rest.startsWith("[") && rest.endsWith("]")) {
      // Inline array: [foo, bar, "baz"]
      data[key] = rest
        .slice(1, -1)
        .split(",")
        .map((s) => s.trim().replace(/^['"]|['"]$/g, ""))
        .filter(Boolean);
    } else {
      data[key] = rest.replace(/^['"]|['"]$/g, "");
    }

    i++;
  }

  return data;
}
