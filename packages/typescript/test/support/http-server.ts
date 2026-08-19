import { createServer, type IncomingHttpHeaders } from "node:http";
import { once } from "node:events";

export interface RecordedRequest {
  readonly method: string;
  readonly path: string;
  readonly headers: IncomingHttpHeaders;
  readonly body: string;
}

export interface TestResponse {
  readonly status?: number;
  readonly headers?: Readonly<Record<string, string>>;
  readonly body?: string | Uint8Array;
  readonly delayMs?: number;
  readonly bodyDelayMs?: number;
}

export interface TestServer {
  readonly url: string;
  readonly requests: RecordedRequest[];
  close(): Promise<void>;
}

export async function startTestServer(
  respond: (request: RecordedRequest, index: number) => TestResponse,
): Promise<TestServer> {
  const requests: RecordedRequest[] = [];
  const server = createServer((request, response) => {
    const chunks: Buffer[] = [];
    request.on("data", (chunk: Buffer) => chunks.push(chunk));
    request.on("end", () => {
      const recorded: RecordedRequest = {
        method: request.method ?? "GET",
        path: request.url ?? "/",
        headers: request.headers,
        body: Buffer.concat(chunks).toString("utf8"),
      };
      const index = requests.push(recorded) - 1;
      const result = respond(recorded, index);
      const sendBody = () => response.end(result.body ?? "");
      const send = () => {
        response.writeHead(
          result.status ?? 200,
          result.headers ?? { "content-type": "application/json" },
        );
        if (result.bodyDelayMs !== undefined) {
          setTimeout(sendBody, result.bodyDelayMs);
        } else {
          sendBody();
        }
      };
      if (result.delayMs !== undefined) {
        setTimeout(send, result.delayMs);
      } else {
        send();
      }
    });
  });

  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  const address = server.address();
  if (address === null || typeof address === "string") {
    throw new Error("Test server did not bind a TCP port.");
  }

  return {
    url: `http://127.0.0.1:${address.port}`,
    requests,
    async close() {
      const closed = once(server, "close");
      server.close();
      server.closeAllConnections();
      await closed;
    },
  };
}
