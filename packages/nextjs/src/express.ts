import type { IncomingMessage, ServerResponse } from "node:http";
import { Readable } from "node:stream";

import type { PolymorfaHandler } from "./handler.js";

type NodeRequest = IncomingMessage & {
  /** Express sets this to the URL including the mount path. */
  readonly originalUrl?: string;
  /** Set by a body parser. Only a raw `Buffer` or string can be forwarded. */
  readonly body?: unknown;
};

/**
 * Serves a Polymorfa handler from Express or plain `node:http`:
 *
 * ```ts
 * app.use("/api/polymorfa", toExpress(handler));
 * ```
 *
 * Mount it before `express.json()`, or use `express.raw()` for this path:
 * webhook signatures are checked against the raw body.
 */
export function toExpress(
  handler: PolymorfaHandler,
): (
  request: NodeRequest,
  response: ServerResponse,
  next?: (error?: unknown) => void,
) => Promise<void> {
  return async (request, response, next) => {
    const abort = new AbortController();
    response.on("close", () => {
      if (!response.writableFinished) abort.abort();
    });
    try {
      const webResponse = await handler.handle(
        toRequest(request, abort.signal),
      );
      response.statusCode = webResponse.status;
      webResponse.headers.forEach((value, name) => {
        response.setHeader(name, value);
      });
      if (webResponse.body === null) {
        response.end();
        return;
      }
      response.flushHeaders?.();
      const reader = webResponse.body.getReader();
      abort.signal.addEventListener("abort", () => {
        void reader.cancel().catch(() => undefined);
      });
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        if (!response.write(value))
          await new Promise<void>((resolve) => response.once("drain", resolve));
      }
      response.end();
    } catch (error) {
      if (abort.signal.aborted) return;
      if (next !== undefined) next(error);
      else if (!response.headersSent) {
        response.statusCode = 500;
        response.end();
      } else response.destroy();
    }
  };
}

function toRequest(request: NodeRequest, signal: AbortSignal): Request {
  const host = request.headers.host ?? "localhost";
  const encrypted = (request.socket as { encrypted?: boolean }).encrypted;
  const url = new URL(
    request.originalUrl ?? request.url ?? "/",
    `${encrypted === true ? "https" : "http"}://${host}`,
  );
  const headers = new Headers();
  for (const [name, value] of Object.entries(request.headers)) {
    if (value === undefined) continue;
    if (Array.isArray(value))
      for (const item of value) headers.append(name, item);
    else headers.set(name, value);
  }
  const method = (request.method ?? "GET").toUpperCase();
  if (method === "GET" || method === "HEAD")
    return new Request(url, { method, headers, signal });
  let body: BodyInit;
  if (Buffer.isBuffer(request.body)) body = new Uint8Array(request.body);
  else if (typeof request.body === "string") body = request.body;
  else if (request.readableEnded)
    // A JSON body parser already ran. Re-encoding works for JSON routes;
    // webhook signatures fail, so mount toExpress() before express.json().
    body = request.body === undefined ? "" : JSON.stringify(request.body);
  else body = Readable.toWeb(request) as unknown as ReadableStream<Uint8Array>;
  return new Request(url, {
    method,
    headers,
    body,
    signal,
    duplex: "half",
  } as RequestInit);
}
