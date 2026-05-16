import type { ServerResponse } from "node:http";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";

/** MIME types map for static file serving. */
const MIME_TYPES: Record<string, string> = {
  ".css": "text/css; charset=utf-8",
  ".js": "application/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".gif": "image/gif",
  ".webp": "image/webp",
  ".svg": "image/svg+xml",
  ".ico": "image/x-icon",
};

export function send(res: ServerResponse, statusCode: number, contentType: string, body: string | Buffer): void {
  res.statusCode = statusCode;
  res.setHeader("Content-Type", contentType);
  res.end(body);
}

export function json(res: ServerResponse, statusCode: number, data: unknown): void {
  send(res, statusCode, "application/json; charset=utf-8", JSON.stringify(data));
}

export function text(res: ServerResponse, statusCode: number, data: string): void {
  send(res, statusCode, "text/plain; charset=utf-8", data);
}

export function html(res: ServerResponse, statusCode: number, data: string): void {
  send(res, statusCode, "text/html; charset=utf-8", data);
}

export function serveStaticFile(filePath: string, res: ServerResponse): void {
  if (!existsSync(filePath)) {
    text(res, 404, "Not found");
    return;
  }

  const ext = path.extname(filePath).toLowerCase();
  const basename = path.basename(filePath).toLowerCase();
  const contentType = MIME_TYPES[ext] ?? "application/octet-stream";

  res.statusCode = 200;
  res.setHeader("Content-Type", contentType);

  if (basename === "manifest.json") {
    res.setHeader("Content-Type", "application/manifest+json; charset=utf-8");
  }

  if (basename === "service-worker.js") {
    res.setHeader("Cache-Control", "no-cache, no-store, must-revalidate");
    res.setHeader("Service-Worker-Allowed", "/");
  }

  res.end(readFileSync(filePath));
}
