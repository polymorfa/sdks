export async function decodeResponseBody(response: Response): Promise<unknown> {
  if (response.status === 204 || response.status === 205) {
    return undefined;
  }

  const text = await response.text();
  if (text.length === 0) {
    return undefined;
  }

  const contentType = response.headers.get("content-type")?.toLowerCase() ?? "";
  if (contentType.includes("application/json") || contentType.includes("+json")) {
    try {
      return JSON.parse(text) as unknown;
    } catch {
      return text;
    }
  }
  return text;
}

export function encodeRequestBody(body: unknown): { body: BodyInit | undefined; contentType?: string } {
  if (body === undefined) {
    return { body: undefined };
  }
  if (typeof body === "string" || body instanceof ArrayBuffer) {
    return { body };
  }
  if (body instanceof Uint8Array) {
    return { body: Uint8Array.from(body).buffer };
  }
  return { body: JSON.stringify(body), contentType: "application/json" };
}
