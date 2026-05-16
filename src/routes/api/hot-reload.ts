import type { IncomingMessage, ServerResponse } from "node:http";
import { EventEmitter } from "node:events";

// Global event emitter for hot reload events
const hotReloadEmitter = new EventEmitter();

/**
 * Handle Server-Sent Events (SSE) connection for hot reload.
 * Clients connect to /api/hot-reload and receive events when markdown files change.
 */
export function handleHotReloadSSE(req: IncomingMessage, res: ServerResponse): void {
  // Prevent automatic response ending and timeouts
  req.setTimeout(0);
  res.setTimeout(0);

  // Set SSE headers
  res.writeHead(200, {
    "Content-Type": "text/event-stream",
    "Cache-Control": "no-cache",
    Connection: "keep-alive",
    "X-Accel-Buffering": "no",
    "Access-Control-Allow-Origin": "*",
  });

  // Send initial connection message
  try {
    res.write(": connected\n\n");
    res.write('data: {"type":"connected"}\n\n');
  } catch (err) {
    console.error("[Hot reload SSE] Error writing initial message:", err);
    return;
  }

  let isConnected = true;
  let keepalive: ReturnType<typeof setInterval> | null = null;

  function safeWrite(data: string): boolean {
    if (!isConnected) return false;
    try {
      if ((res as any).destroyed || (res as any).closed || res.writableEnded || (res as any).finished) {
        isConnected = false;
        return false;
      }
      res.write(data);
      return true;
    } catch {
      isConnected = false;
      return false;
    }
  }

  const onFileChange = (filePath: string) => {
    if (!isConnected) return;
    try {
      const message = `data: ${JSON.stringify({ type: "file-changed", path: filePath })}\n\n`;
      if (!safeWrite(message)) {
        return;
      }
    } catch (err) {
      console.error("[Hot reload SSE] Error in onFileChange:", (err as Error).message);
      cleanup();
    }
  };

  function cleanup() {
    if (!isConnected) return;
    isConnected = false;
    if (keepalive) {
      clearInterval(keepalive);
      keepalive = null;
    }
    hotReloadEmitter.removeListener("file-changed", onFileChange);
  }

  hotReloadEmitter.on("file-changed", onFileChange);

  // Initial keepalive after 1s
  setTimeout(() => {
    if (isConnected) {
      safeWrite(": keepalive\n\n");
    }
  }, 1000);

  keepalive = setInterval(() => {
    if (!safeWrite(": keepalive\n\n")) {
      cleanup();
    }
  }, 25000);

  // Cleanup on disconnect
  req.on("close", cleanup);
  req.on("aborted", cleanup);
  req.on("error", (err) => {
    if (err.message !== "aborted") {
      console.error("[Hot reload SSE] Request error:", err.message);
    }
    cleanup();
  });
  res.on("close", cleanup);
  res.on("error", (err) => {
    console.error("[Hot reload SSE] Response error:", err.message);
    cleanup();
  });
  res.on("finish", () => {
    console.warn("[Hot reload SSE] Response finished unexpectedly");
    cleanup();
  });
}

/**
 * Emit a file change event to all connected SSE clients.
 */
export function emitFileChange(filePath: string): void {
  hotReloadEmitter.emit("file-changed", filePath);
}
