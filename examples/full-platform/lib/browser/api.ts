/** Calls this application's own route handlers and unwraps `{ data }`. */
export async function callApi<T>(
  path: string,
  body?: Readonly<Record<string, unknown>>,
  init: {
    readonly signal?: AbortSignal;
    readonly idempotencyKey?: string;
  } = {},
): Promise<T> {
  const response = await fetch(path, {
    method: body === undefined ? "GET" : "POST",
    credentials: "same-origin",
    headers: {
      accept: "application/json",
      ...(body === undefined ? {} : { "content-type": "application/json" }),
      ...(init.idempotencyKey === undefined
        ? {}
        : { "idempotency-key": init.idempotencyKey }),
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    ...(init.signal === undefined ? {} : { signal: init.signal }),
  });
  // A proxy can answer with HTML; only trust JSON bodies.
  const isJson = response.headers
    .get("content-type")
    ?.includes("application/json");
  const payload: unknown = isJson ? await response.json() : undefined;
  if (!response.ok) {
    const message =
      isRecord(payload) && isRecord(payload.error)
        ? String(payload.error.message ?? payload.error.code)
        : `Request failed with status ${response.status}.`;
    throw new Error(message);
  }
  if (!isRecord(payload) || !("data" in payload)) {
    throw new Error("The server returned an unexpected response.");
  }
  return payload.data as T;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}
