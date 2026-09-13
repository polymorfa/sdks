import { PolymorfaServerError } from "../errors.js";
import type { ApiResponse, ResponseMetadata } from "../transport/types.js";

export interface DataEnvelope<T> {
  readonly data: T;
}

export function unwrapResponse<T>(
  response: ApiResponse<DataEnvelope<T>>,
): ApiResponse<T> {
  if (
    typeof response.data !== "object" ||
    response.data === null ||
    !Object.hasOwn(response.data, "data") ||
    response.data.data === undefined
  ) {
    throw new PolymorfaServerError(
      "The Polymorfa API returned an invalid response envelope.",
      {
        code: "invalid_response",
        status: response.metadata.status,
        ...(response.metadata.requestId === undefined
          ? {}
          : { requestId: response.metadata.requestId }),
        metadata: response.metadata,
        details: response.data,
      },
    );
  }
  return Object.freeze({
    data: response.data.data,
    metadata: response.metadata,
  });
}

export function decodeCursorPage<T>(
  data: unknown,
  metadata: ResponseMetadata,
): {
  readonly items: readonly T[];
  readonly nextCursor?: string | null;
} {
  const envelope = data as {
    readonly data?: readonly T[];
    readonly page?: { readonly nextCursor?: string | null };
  };
  if (!Array.isArray(envelope?.data)) {
    throw new PolymorfaServerError(
      "The Polymorfa API returned an invalid collection envelope.",
      {
        code: "invalid_response",
        status: metadata.status,
        ...(metadata.requestId === undefined
          ? {}
          : { requestId: metadata.requestId }),
        metadata,
        details: data,
      },
    );
  }
  const nextCursor = envelope.page?.nextCursor;
  return {
    items: envelope.data,
    ...(nextCursor === undefined ? {} : { nextCursor }),
  };
}
