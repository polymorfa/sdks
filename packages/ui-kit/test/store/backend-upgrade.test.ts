import { IDBFactory } from "fake-indexeddb";
import { describe, expect, it } from "vitest";
import { openIndexedDbBackend } from "../../src/store/backend.js";

async function seed(factory: IDBFactory, sealed = false) {
  const opening = factory.open("cache", 1);
  opening.onupgradeneeded = () => {
    opening.result
      .createObjectStore("sessions", { keyPath: "id" })
      .put({
        id: "stable-root",
        session: "support",
        _t: 1,
        ...(sealed
          ? { _sealed: "owner-ciphertext" }
          : { phoneNumber: "+15550001" }),
      });
    opening.result
      .createObjectStore("messages", { keyPath: "id" })
      .put({
        id: "message-1",
        session: "support",
        _t: 2,
        _sealed: "unchanged-message-ciphertext",
      });
  };
  return new Promise<IDBDatabase>((resolve, reject) => {
    opening.onsuccess = () => resolve(opening.result);
    opening.onerror = () => reject(opening.error);
  });
}

describe("Connection UI cache schema upgrade", () => {
  it("preserves identities and message ciphertext while moving the account store and fields", async () => {
    const factory = new IDBFactory();
    (await seed(factory)).close();
    const backend = await openIndexedDbBackend(factory, "cache");
    expect(
      await backend.getMany([
        { store: "connections", key: "stable-root" },
        { store: "messages", key: "message-1" },
      ]),
    ).toEqual([
      {
        id: "stable-root",
        connection: "support",
        _t: 1,
        phoneNumber: "+15550001",
      },
      {
        id: "message-1",
        connection: "support",
        _t: 2,
        _sealed: "unchanged-message-ciphertext",
      },
    ]);
    await backend.clear();
    backend.close();
    const reopened = await openIndexedDbBackend(factory, "cache");
    expect(
      await reopened.getMany([{ store: "connections", key: "stable-root" }]),
    ).toEqual([undefined]);
    reopened.close();
  });
  it("refuses sealed account rows atomically because their owner-defined seal context changes", async () => {
    const factory = new IDBFactory();
    (await seed(factory, true)).close();
    await expect(openIndexedDbBackend(factory, "cache")).rejects.toThrow(
      "sealed account",
    );
    const old = await seed(factory, true);
    expect(old.version).toBe(1);
    expect(old.objectStoreNames.contains("sessions")).toBe(true);
    expect(old.objectStoreNames.contains("connections")).toBe(false);
    old.close();
  });
  it("does not migrate the cache later after a blocked open has already failed", async () => {
    const factory = new IDBFactory();
    const held = await seed(factory);
    await expect(openIndexedDbBackend(factory, "cache")).rejects.toThrow(
      "blocked",
    );
    held.close();
    await new Promise((resolve) => setTimeout(resolve, 20));
    const unchanged = await seed(factory);
    expect(unchanged.version).toBe(1);
    expect(unchanged.objectStoreNames.contains("sessions")).toBe(true);
    unchanged.close();
  });
});
