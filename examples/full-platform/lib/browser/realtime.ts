import type { RealtimeEvent } from "../realtime.js";

type Handler<T extends RealtimeEvent["type"]> = (
  event: Extract<RealtimeEvent, { type: T }>,
) => void;

export type RealtimeHandlers = {
  readonly [T in RealtimeEvent["type"]]?: Handler<T>;
};

/** Subscribes to /api/events. Returns an unsubscribe function. */
export function listen(handlers: RealtimeHandlers): () => void {
  const source = new EventSource("/api/events");
  const types = Object.keys(handlers) as RealtimeEvent["type"][];
  const listeners = types.map((type) => {
    const listener = (message: MessageEvent<string>) => {
      const event = JSON.parse(message.data) as RealtimeEvent;
      if (event.type === type) {
        (handlers[type] as ((event: RealtimeEvent) => void) | undefined)?.(
          event,
        );
      }
    };
    source.addEventListener(type, listener);
    return listener;
  });
  return () => {
    types.forEach((type, index) => {
      const listener = listeners[index];
      if (listener !== undefined) source.removeEventListener(type, listener);
    });
    source.close();
  };
}
