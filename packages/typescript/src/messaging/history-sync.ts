import {
  DirectMediaApi,
  type HistorySyncChunkDeleteRequest,
  type HistorySyncChunkRetryRequest,
  type HistorySyncChunkRetryResponse,
} from "../media/direct-api.js";
import type { HttpTransport } from "../transport/http.js";
import type { MessagingCredential } from "../credentials.js";
import type { RequestOptions } from "../transport/types.js";

/**
 * Connection commands for direct history. Download and decode chunks with
 * `downloadHistoryChunk` from `@polymorfa/sdk/history`.
 * @experimental Pending backend alignment.
 */
export class HistorySyncResource {
  readonly #api: DirectMediaApi;

  constructor(
    transport: HttpTransport,
    credentialType: MessagingCredential["type"] = "apiKey",
  ) {
    this.#api = new DirectMediaApi(transport, credentialType);
  }

  /**
   * Asks the connection's phone to send a missed or failed chunk again. The
   * chunk arrives as a new `history.sync` event.
   */
  requestChunkRetry(
    connection: string,
    request: HistorySyncChunkRetryRequest,
    options: RequestOptions = {},
  ): Promise<HistorySyncChunkRetryResponse> {
    return this.#api.requestHistoryChunkRetry(connection, request, options);
  }

  /**
   * Asks the connection to delete a processed chunk from the WhatsApp CDN, as
   * WhatsApp Web does after applying a chunk. Call it only after the chunk
   * is stored.
   */
  deleteChunk(
    connection: string,
    request: HistorySyncChunkDeleteRequest,
    options: RequestOptions = {},
  ): Promise<void> {
    return this.#api.deleteHistoryChunk(connection, request, options);
  }
}
