import { afterEach, describe, expect, expectTypeOf, it } from "vitest";

import {
  MessagingClient,
  MessagingMediaResource,
  PolymorfaNotFoundError,
  PolymorfaTimeoutError,
  type ApiResponse,
  type GetMessagingMediaInfoResponse,
  type MessagingMediaInfo,
  type SuccessResponse,
} from "../src/index.js";
import {
  startTestServer,
  type RecordedRequest,
  type TestServer,
} from "./support/http-server.js";

const servers: TestServer[] = [];

afterEach(async () => {
  await Promise.all(servers.splice(0).map((server) => server.close()));
});

function mediaClient(baseUrl: string, timeoutMs = 500): MessagingClient {
  return new MessagingClient({
    credential: { type: "apiKey", value: "pmfa_example" },
    baseUrl,
    timeoutMs,
    maxNetworkRetries: 0,
  });
}

async function mediaServer(
  respond: Parameters<typeof startTestServer>[0],
): Promise<{ client: MessagingClient; requests: RecordedRequest[] }> {
  const server = await startTestServer(respond);
  servers.push(server);
  return { client: mediaClient(server.url), requests: server.requests };
}

describe("MessagingClient media", () => {
  it("exports the exact metadata shape and a distinct Messaging resource", () => {
    expectTypeOf<MessagingMediaInfo>().toEqualTypeOf<{
      readonly id: string;
      readonly session: string;
      readonly messageId: string;
      readonly mimeType: string;
      readonly fileLength: number;
      readonly persisted: boolean;
      readonly s3Url?: string | null;
    }>();
    expectTypeOf<
      MessagingClient["media"]
    >().toEqualTypeOf<MessagingMediaResource>();
  });

  it("downloads exact binary bytes with response metadata and an encoded ID", async () => {
    const bytes = Uint8Array.from([0, 255, 16, 128, 42]);
    const { client, requests } = await mediaServer(() => ({
      headers: {
        "content-type": "image/jpeg",
        "content-length": String(bytes.byteLength),
        "content-disposition": 'attachment; filename="photo.jpg"',
        "x-request-id": "req_media_download",
      },
      body: bytes,
    }));

    const downloaded = await client.media.download("media/id", {
      apiVersion: "next",
      headers: { "x-client-context": "cli" },
    });

    expectTypeOf(downloaded).toEqualTypeOf<ApiResponse<ArrayBuffer>>();
    expect(Array.from(new Uint8Array(downloaded.data))).toEqual([
      0, 255, 16, 128, 42,
    ]);
    expect(downloaded.metadata).toMatchObject({
      status: 200,
      requestId: "req_media_download",
      attempts: 1,
    });
    expect(downloaded.metadata.headers["content-type"]).toBe("image/jpeg");
    expect(requests[0]).toMatchObject({
      method: "GET",
      path: "/api/media/media%2Fid",
    });
    expect(requests[0]?.headers.accept).toBe("application/octet-stream, */*");
    expect(requests[0]?.headers["x-client-context"]).toBe("cli");
    expect(requests[0]?.headers["polymorfa-version"]).toBe("next");
  });

  it("retrieves metadata and requests persistence without sending a body", async () => {
    const { client, requests } = await mediaServer((request) =>
      request.method === "GET"
        ? {
            headers: {
              "content-type": "application/json",
              "x-request-id": "req_media_info",
            },
            body: JSON.stringify({
              success: true,
              data: {
                id: "media/id",
                session: "support",
                messageId: "message-1",
                mimeType: "image/jpeg",
                fileLength: 5,
                persisted: false,
                s3Url: null,
              },
            }),
          }
        : {
            headers: { "content-type": "application/json" },
            body: '{"success":true,"message":"media persistence queued"}',
          },
    );

    const info = await client.media.retrieve("media/id");
    const persisted = await client.media.persist("media/id", {
      idempotencyKey: "persist-media-id",
    });

    expectTypeOf(info).toEqualTypeOf<
      ApiResponse<GetMessagingMediaInfoResponse>
    >();
    expectTypeOf(persisted).toEqualTypeOf<ApiResponse<SuccessResponse>>();
    expect(info.data.data).toMatchObject({
      id: "media/id",
      fileLength: 5,
      persisted: false,
      s3Url: null,
    });
    expect(info.metadata.requestId).toBe("req_media_info");
    expect(
      requests.map(({ method, path, body }) => ({ method, path, body })),
    ).toEqual([
      { method: "GET", path: "/api/media/media%2Fid/info", body: "" },
      {
        method: "POST",
        path: "/api/media/media%2Fid/download-and-save",
        body: "",
      },
    ]);
    expect(requests[1]?.headers["idempotency-key"]).toBe("persist-media-id");
  });

  it("decodes JSON download errors and times out while buffering a binary body", async () => {
    const errorServer = await startTestServer(() => ({
      status: 404,
      headers: {
        "content-type": "application/json",
        "x-request-id": "req_media_missing",
      },
      body: '{"error":"media not found","code":"not_found"}',
    }));
    servers.push(errorServer);

    const missing = await mediaClient(errorServer.url)
      .media.download("missing")
      .catch((error) => error);
    expect(missing).toBeInstanceOf(PolymorfaNotFoundError);
    expect(missing).toMatchObject({
      message: "media not found",
      requestId: "req_media_missing",
      code: "not_found",
    });

    const slowServer = await startTestServer(() => ({
      headers: { "content-type": "application/octet-stream" },
      body: Uint8Array.from([1, 2, 3]),
      bodyDelayMs: 100,
    }));
    servers.push(slowServer);

    await expect(
      mediaClient(slowServer.url, 10).media.download("slow"),
    ).rejects.toBeInstanceOf(PolymorfaTimeoutError);
  });
});
