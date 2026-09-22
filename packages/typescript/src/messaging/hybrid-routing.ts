import type { MessageTransport } from "./types.js";

/** Set the Graph-compatible route choice on a raw request. */
export function graphTransportHeaders(
  transport: MessageTransport,
): Readonly<Record<"X-Polymorfa-Transport", MessageTransport>> {
  return { "X-Polymorfa-Transport": transport };
}
