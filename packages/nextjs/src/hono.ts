import type { PolymorfaHandler } from "./handler.js";

/**
 * Serves a Polymorfa handler from Hono (or any framework whose context
 * exposes the Fetch `Request` as `c.req.raw`):
 *
 * ```ts
 * app.all("/api/polymorfa/*", toHono(handler));
 * ```
 */
export function toHono(
  handler: PolymorfaHandler,
): (context: { readonly req: { readonly raw: Request } }) => Promise<Response> {
  return (context) => handler.handle(context.req.raw);
}
