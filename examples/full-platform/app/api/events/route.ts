import { authenticate } from "../../../lib/auth.js";
import { subscribe, type RealtimeEvent } from "../../../lib/realtime.js";

/** Server-sent events: relays webhook-driven updates to signed-in browsers. */
export async function GET(request: Request): Promise<Response> {
  if ((await authenticate(request)) === null) {
    return new Response(null, { status: 401 });
  }
  const encoder = new TextEncoder();
  let cleanup = (): void => undefined;
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      const send = (event: RealtimeEvent) =>
        controller.enqueue(
          encoder.encode(
            `event: ${event.type}\ndata: ${JSON.stringify(event)}\n\n`,
          ),
        );
      const unsubscribe = subscribe(send);
      const heartbeat = setInterval(
        () => controller.enqueue(encoder.encode(": keep-alive\n\n")),
        15_000,
      );
      cleanup = () => {
        clearInterval(heartbeat);
        unsubscribe();
      };
      request.signal.addEventListener("abort", () => {
        cleanup();
        controller.close();
      });
    },
    cancel() {
      cleanup();
    },
  });
  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-store",
      Connection: "keep-alive",
    },
  });
}
