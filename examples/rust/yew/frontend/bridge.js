import { definePolymorfaElements } from "@polymorfa/elements";
definePolymorfaElements();
let disposeInbox;
// Only receipts the host observed from message.ack become chat receipts. The
// send response status is upstream acceptance, never delivery or read.
const observedReceipts = new Map([
  ["delivered", "delivered"],
  ["delivery", "delivered"],
  ["read", "read"],
  ["played", "played"],
]);
function chatMessage({ receipt, ...message }) {
  const state =
    message.direction === "outbound"
      ? observedReceipts.get(receipt)
      : undefined;
  return state ? { ...message, receipt: { state } } : message;
}
// The browser renders shared components. Every send and incoming message is
// handled by this application's native Rust SDK, not the browser API transport.
function nativeInbox(inbox) {
  const changes = new Set();
  const messages = new Set();
  let previous = "";
  let stopped = false;
  let timer;
  const request = async (path, options = {}) => {
    const response = await fetch(`/api/polymorfa/${path}`, {
      credentials: "same-origin",
      ...options,
    });
    if (!response.ok) throw new Error(await response.text());
    return response.json();
  };
  const row = (snapshot) => {
    const last = snapshot.messages.at(-1);
    return {
      id: snapshot.peer,
      session: snapshot.session,
      name: "Assigned recipient",
      phoneNumber: snapshot.peer,
      lastActivity: last?.createdAt ?? 0,
      unreadCount: 0,
      ...(last
        ? {
            lastMessage: {
              text: last.text,
              createdAt: last.createdAt,
              direction: last.direction,
            },
          }
        : {}),
    };
  };
  const poll = async () => {
    try {
      const snapshot = await request("conversation");
      if (stopped) return;
      const serialized = JSON.stringify(snapshot);
      if (serialized !== previous) {
        previous = serialized;
        for (const notify of changes)
          notify({ type: "conversation", conversation: row(snapshot) });
        for (const message of snapshot.messages)
          for (const notify of messages)
            notify({ type: "upsert", message: chatMessage(message) });
      }
      const label = document.querySelector("#transport-label");
      if (label)
        label.textContent = snapshot.localTest
          ? "Local test numbers. Simulated WhatsApp transport."
          : "";
      const status = document.querySelector("#native-status");
      if (status) {
        const outgoing = snapshot.messages.findLast(
          (m) => m.direction === "outbound",
        );
        status.textContent =
          `Rust SDK · ${snapshot.receivedEvents} verified webhook events` +
          (outgoing ? ` · Latest send: ${outgoing.receipt}` : "");
      }
    } catch (error) {
      const status = document.querySelector("#native-status");
      if (status && !stopped) status.textContent = error.message;
    } finally {
      if (!stopped) timer = setTimeout(poll, 800);
    }
  };
  inbox.source = {
    async listConversations(_cursor, signal) {
      return {
        conversations: [row(await request("conversation", { signal }))],
      };
    },
    subscribe(notify) {
      changes.add(notify);
      return () => changes.delete(notify);
    },
    conversation() {
      return {
        async load(_cursor, signal) {
          return {
            messages: (await request("conversation", { signal })).messages.map(
              chatMessage,
            ),
          };
        },
        subscribe(notify) {
          messages.add(notify);
          return () => messages.delete(notify);
        },
        async send(message, signal) {
          if (message.replyTo || message.attachments?.length)
            throw new Error("This native example sends text only.");
          return chatMessage(
            await request("send", {
              method: "POST",
              signal,
              headers: {
                "Content-Type": "application/json",
                "Idempotency-Key": message.clientId,
              },
              body: JSON.stringify({ text: message.text }),
            }),
          );
        },
      };
    },
  };
  void poll();
  return () => {
    stopped = true;
    clearTimeout(timer);
    changes.clear();
    messages.clear();
  };
}
window.startPolymorfa = () => {
  const inbox = document.querySelector("pmfa-inbox");
  if (inbox) disposeInbox ??= nativeInbox(inbox);
};
window.stopPolymorfa = () => {
  disposeInbox?.();
  disposeInbox = undefined;
};
