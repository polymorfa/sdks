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
            `event: ${event.event}\ndata: ${JSON.stringify(event)}\n\n`,
          ),
        );
      // Flush headers right away so the browser reports the stream as open,
      // and ask it to reconnect after three seconds if the stream drops.
      controller.enqueue(encoder.encode("retry: 3000\n: connected\n\n"));
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
      "X-Accel-Buffering": "no",
    },
  });
}
