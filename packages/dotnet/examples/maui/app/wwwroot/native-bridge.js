// Fixed app routes only; remote Polymorfa API requests keep the browser client's scoped token.
const routes = new Map([
  ["/example/config", ["GET", "config"]],
  ["/api/polymorfa/token", ["POST", "token"]],
  ["/api/polymorfa/history/conversations", ["GET", "conversations"]],
  ["/api/polymorfa/connect", ["POST", "connect"]],
]);
let originalFetch;
export function install(native) {
  if (originalFetch) throw new Error("The native bridge is already installed.");
  originalFetch = globalThis.fetch.bind(globalThis);
  globalThis.fetch = async (input, options) => {
    const url = new URL(typeof input === "string" ? input : input.url ?? input.href, location.href);
    const route = url.protocol === new URL(location.href).protocol && url.host === new URL(location.href).host && !url.username && !url.password && !url.search && !url.hash ? routes.get(url.pathname) : undefined;
    if (!route) return originalFetch(input, options);
    const method = (options?.method ?? (input instanceof Request ? input.method : "GET")).toUpperCase();
    if (method !== route[0]) return new Response(null, { status: 405 });
    const signal = options?.signal ?? (input instanceof Request ? input.signal : undefined);
    if (signal?.aborted) throw new DOMException("Aborted", "AbortError");
    const response = await native.invokeMethodAsync("RequestApplicationAsync", route[1]);
    if (signal?.aborted) throw new DOMException("Aborted", "AbortError");
    return new Response(response.status === 204 ? null : response.body, {
      status: response.status,
      headers: { "Content-Type": response.contentType, "Cache-Control": "no-store" },
    });
  };
}
export function dispose() {
  if (originalFetch) globalThis.fetch = originalFetch;
  originalFetch = undefined;
}
