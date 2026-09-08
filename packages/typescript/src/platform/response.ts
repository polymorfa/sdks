import type { ApiResponse } from "../transport/types.js";

export interface DataEnvelope<T> {
  readonly data: T;
}

export function unwrapResponse<T>(
  response: ApiResponse<DataEnvelope<T>>,
): ApiResponse<T> {
  return Object.freeze({
    data: response.data.data,
    metadata: response.metadata,
  });
}

export function decodeCursorPage<T>(data: unknown): {
  readonly items: readonly T[];
  readonly nextCursor?: string | null;
} {
  const envelope = data as {
    readonly data?: readonly T[];
    readonly page?: { readonly nextCursor?: string | null };
  };
  const nextCursor = envelope.page?.nextCursor;
  return {
    items: envelope.data ?? [],
    ...(nextCursor === undefined ? {} : { nextCursor }),
  };
}
