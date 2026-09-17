import "fake-indexeddb/auto";
import { IDBFactory } from "fake-indexeddb";

import {
  createPolymorfaStore,
  type PolymorfaEvent,
  type PolymorfaStoreOptions,
} from "../src/index.js";

let sequence = 0;

export const BASE_TIME = Date.parse("2026-09-01T10:00:00.000Z");

export function event(
  type: string,
  payload: unknown,
  options: { id?: string; at?: number; session?: string } = {},
): PolymorfaEvent {
  sequence += 1;
  return {
    id: options.id ?? `evt_${sequence}`,
    session: options.session ?? "support",
    timestamp: new Date(BASE_TIME + (options.at ?? sequence)).toISOString(),
    event: type,
    payload,
  };
}

export const chat = { id: "chat_1", phoneNumber: "+15550001" };

export function received(
  id: string,
  text: string,
  options: { at?: number; fromMe?: boolean; conversation?: typeof chat } = {},
) {
  const at = options.at ?? 1_000;
  return event(
    "message.received",
    {
      id,
      whatsapp_id: `wa_${id}`,
      conversation: options.conversation ?? {
        ...chat,
        sender: { id: "contact_1" },
      },
      fromMe: options.fromMe ?? false,
      timestamp: Math.floor((BASE_TIME + at) / 1000),
      pushName: "Ada",
      isGroup: false,
      type: "text",
      text,
    },
    { at },
  );
}

export function openStore(overrides: Partial<PolymorfaStoreOptions> = {}) {
  return createPolymorfaStore({
    name: `test-${Math.random().toString(36).slice(2)}`,
    indexedDB: new IDBFactory(),
    broadcastChannel: null,
    sweepIntervalMs: 0,
    ...overrides,
  });
}
