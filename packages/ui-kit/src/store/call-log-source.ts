import type {
  CallLogEntry,
  CallLogOutcome,
  CallLogSource,
} from "../browser/index.js";
import type { PolymorfaStore } from "./store.js";
import type { StoredCall, StoredContact } from "./types.js";

export interface StoreCallLogSourceOptions {
  /** Calls read from the store. Default 200. */
  readonly limit?: number;
  /** Older pages from your backend once the store runs out. */
  readonly backend?: CallLogSource;
  readonly onError?: (error: unknown) => void;
}

function outcome(call: StoredCall): CallLogOutcome {
  switch (call.state) {
    case "ringing":
    case "active":
      return "ongoing";
    case "missed":
      return "missed";
    case "rejected":
      return "declined";
    case "ended":
      if (call.acceptedAt !== undefined || (call.durationSeconds ?? 0) > 0)
        return "answered";
      return /fail|error|pod_lost/.test(call.reason ?? "") ? "failed" : "missed";
  }
}

/** Maps a stored call to a call log entry, naming the peer from contacts. */
export function toCallLogEntry(
  call: StoredCall,
  contact?: StoredContact,
): CallLogEntry {
  const name = contact?.fullName ?? contact?.businessName ?? contact?.pushName;
  const phoneNumber = call.from?.phoneNumber ?? contact?.phoneNumber;
  return {
    id: call.id,
    session: call.session,
    direction: call.direction ?? "inbound",
    outcome: outcome(call),
    video: call.hadVideo === true,
    startedAt: call.startedAt,
    ...(call.durationSeconds === undefined
      ? {}
      : { durationSeconds: call.durationSeconds }),
    peer: {
      ...(call.from?.id === undefined ? {} : { id: call.from.id }),
      ...(phoneNumber === undefined ? {} : { phoneNumber }),
      ...(name === undefined ? {} : { name }),
    },
    ...(call.from?.id === undefined ? {} : { conversationId: call.from.id }),
  };
}

/**
 * A `<CallLog/>` source that reads the calls the store reduced from relayed
 * `call.*` events and follows store changes.
 */
export function createStoreCallLogSource(
  store: PolymorfaStore,
  options: StoreCallLogSourceOptions = {},
): CallLogSource {
  const limit = options.limit ?? 200;
  const entry = async (call: StoredCall) =>
    toCallLogEntry(
      call,
      call.from === undefined ? undefined : await store.contacts.get(call.from.id),
    );
  return {
    async list(cursor, signal) {
      if (cursor !== undefined) {
        if (options.backend === undefined) return { entries: [] };
        return options.backend.list(cursor, signal);
      }
      const calls = await store.calls.list({ limit });
      const entries = await Promise.all(calls.map(entry));
      if (entries.length === 0 && options.backend !== undefined)
        return options.backend.list(undefined, signal);
      return { entries };
    },
    subscribe(listener) {
      return store.subscribe("calls", (change) => {
        void Promise.all(
          change.keys.map(async (id) => {
            const call = await store.calls.get(id);
            if (call !== undefined) listener(await entry(call));
          }),
        ).catch((error: unknown) => options.onError?.(error));
      });
    },
    close() {
      options.backend?.close?.();
    },
  };
}
