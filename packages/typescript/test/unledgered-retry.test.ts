import { once } from "node:events";
import { createServer } from "node:http";
import { describe, expect, it } from "vitest";
import { MessagingClient, PolymorfaError } from "../src/index.js";
import { DirectMediaApi } from "../src/media/direct-api.js";
import { HttpTransport } from "../src/transport/http.js";
import { ORGANIZATION_API_KEY } from "./support/credentials.js";

// These held routes have no producer replay ledger. A caller key cannot make
// an uncertain submission safe to repeat, including the explicit history retry.
describe("unledgered API submissions", () => {
  for (const operation of ["grant", "relay", "retry", "delete"] as const)
    for (const outcome of ["drop", "429", "503"])
      for (const policy of ["keyed", "unkeyed", "default"])
        it(`${operation}/${outcome}/${policy} submits once`, async () => {
          const requests: {
            path: string;
            headers: Record<string, unknown>;
            bytes: number;
          }[] = [];
          const server = createServer(async (req, res) => {
            let bytes = 0;
            for await (const chunk of req) bytes += chunk.length;
            requests.push({ path: req.url!, headers: req.headers, bytes });
            if (outcome === "drop") {
              req.socket.destroy();
              return;
            }
            res.writeHead(Number(outcome), {
              "content-type": "application/json",
              "retry-after": "0",
              "x-request-id": "unledgered",
            });
            res.end(
              JSON.stringify({
                error: { code: "fixture_failure", message: "unknown outcome" },
              }),
            );
          });
          server.listen(0, "127.0.0.1");
          await once(server, "listening");
          const address = server.address();
          if (!address || typeof address === "string")
            throw new Error("fixture bind");
          try {
            const api = new DirectMediaApi(
              new HttpTransport({
                baseUrl: `http://127.0.0.1:${address.port}`,
                authorization: `Bearer ${ORGANIZATION_API_KEY}`,
                timeoutMs: 3000,
                maxNetworkRetries: 1,
              }),
            );
            const options = {
              headers: { "x-caller": "retained" },
              ...(policy === "default" ? {} : { maxNetworkRetries: 1 }),
              ...(policy === "keyed" ? { idempotencyKey: "caller-key" } : {}),
            };
            const info = {
              mediaType: "image" as const,
              fileEncSha256: "A".repeat(43),
              encryptedLength: 26,
            };
            const call = () =>
              operation === "grant"
                ? api.createUploadGrant("s", info, options)
                : operation === "relay"
                  ? api.relayUpload(
                      "s",
                      { ...info, body: new Uint8Array(26) },
                      options,
                    )
                  : operation === "retry"
                    ? api.requestHistoryChunkRetry(
                        "s",
                        { syncType: "RECENT", chunkOrder: 1 },
                        options,
                      )
                    : api.deleteHistoryChunk(
                        "s",
                        {
                          directPath: "/chunk",
                          fileEncSha256: "A".repeat(43) + "=",
                        },
                        options,
                      );
            const error: unknown = await call().catch((e: unknown) => e);
            expect(error).toBeInstanceOf(PolymorfaError);
            expect(requests).toHaveLength(1);
            expect(requests[0]!.headers).toMatchObject({
              authorization: `Bearer ${ORGANIZATION_API_KEY}`,
              "x-caller": "retained",
              "polymorfa-version": "2026-10-14",
            });
            expect(requests[0]!.headers["idempotency-key"]).toBe(
              policy === "keyed" ? "caller-key" : undefined,
            );
            if (operation === "relay") expect(requests[0]!.bytes).toBe(26);
            if (outcome !== "drop")
              expect(error).toMatchObject({
                code: "fixture_failure",
                status: Number(outcome),
                requestId: "unledgered",
                metadata: { attempts: 1 },
              });
            else expect(error).toMatchObject({ code: "connection_error" });
          } finally {
            server.closeAllConnections();
            await new Promise<void>((resolve) => server.close(() => resolve()));
          }
        });
  it("retains established keyed message-send and GET retries", async () => {
    const counts = new Map<string, number>();
    const server = createServer(async (req, res) => {
      for await (const chunk of req) {
        expect(chunk.length).toBeGreaterThan(0);
      }
      const n = (counts.get(req.url!) ?? 0) + 1;
      counts.set(req.url!, n);
      res.writeHead(n === 1 ? 503 : 200, {
        "content-type": "application/json",
        "retry-after": "0",
      });
      res.end(
        JSON.stringify(
          n === 1
            ? { error: { code: "busy" } }
            : { success: true, data: { id: "message", status: "sent" } },
        ),
      );
    });
    server.listen(0, "127.0.0.1");
    await once(server, "listening");
    const address = server.address();
    if (!address || typeof address === "string")
      throw new Error("fixture bind");
    try {
      const sdk = new MessagingClient({
        credential: { type: "apiKey", value: ORGANIZATION_API_KEY },
        baseUrl: `http://127.0.0.1:${address.port}`,
        maxNetworkRetries: 1,
      });
      await sdk.messages.send(
        "s",
        {
          conversation: { phoneNumber: "+15550001111" },
          content: { text: "fixture" },
        },
        { idempotencyKey: "send-key", maxNetworkRetries: 1 },
      );
      await sdk.sessions.retrieve("s", { maxNetworkRetries: 1 });
      expect([...counts.values()]).toEqual([2, 2]);
    } finally {
      server.closeAllConnections();
      await new Promise<void>((resolve) => server.close(() => resolve()));
    }
  });
});
