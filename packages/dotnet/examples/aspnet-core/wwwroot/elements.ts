import { definePolymorfaElements, type PolymorfaInboxElement } from "@polymorfa/elements";
import type { ConversationMessage, ConversationEvent, InboxChange, InboxConversation } from "@polymorfa/browser";

interface Message extends ConversationMessage { receipt: string }
interface Snapshot { messages: Message[]; peer: string; session: string; receivedEvents: number; lastEvent: string; localTest: boolean }
definePolymorfaElements();
export async function mount() {
  const inbox = document.querySelector<PolymorfaInboxElement>("pmfa-inbox");
  if (!inbox) throw new Error("The inbox is not mounted.");
  const changes = new Set<(value: InboxChange) => void>();
  const messages = new Set<(value: ConversationEvent) => void>();
  let previous = "", stopped = false;
  let timer: ReturnType<typeof setTimeout> | undefined;
  const request = async <T>(path: string, options: RequestInit = {}): Promise<T> => {
    const response = await fetch(`/api/polymorfa/${path}`, { credentials: "same-origin", ...options });
    if (!response.ok) throw new Error("The application request failed. Check your sign-in and retry.");
    return response.json() as Promise<T>;
  };
  const row = (snapshot: Snapshot): InboxConversation => {
    const last = snapshot.messages.at(-1);
    return { id: snapshot.peer, session: snapshot.session, name: "Assigned recipient", phoneNumber: snapshot.peer,
      lastActivity: last?.createdAt ?? 0, unreadCount: 0,
      ...(last ? {lastMessage:{text:last.text,createdAt:last.createdAt,direction:last.direction}} : {}) };
  };
  const poll = async () => {
    try {
      const snapshot = await request<Snapshot>("conversation");
      if (stopped) return;
      const serialized = JSON.stringify(snapshot);
      if (serialized !== previous) {
        previous = serialized;
        for (const notify of changes) notify({type:"conversation",conversation:row(snapshot)});
        for (const message of snapshot.messages) for (const notify of messages) notify({type:"upsert",message});
      }
      const label = document.querySelector("#transport-label");
      if (label) label.textContent = snapshot.localTest ? "Local test numbers. Simulated WhatsApp transport." : "";
      const status = document.querySelector("#native-status");
      if (status) {
        const outgoing = [...snapshot.messages].reverse().find(m => m.direction === "outbound");
        status.textContent = `C# SDK · ${snapshot.receivedEvents} verified webhook events` + (outgoing ? ` · Latest send: ${outgoing.receipt}` : "");
      }
    } catch (error) {
      const status = document.querySelector("#native-status");
      if (status && !stopped) status.textContent = error instanceof Error ? error.message : "The conversation is unavailable.";
    } finally { if (!stopped) timer = setTimeout(poll, 800); }
  };
  inbox.source = {
    async listConversations(_cursor, signal) { return {conversations:[row(await request<Snapshot>("conversation", {...(signal ? {signal} : {})}))]}; },
    subscribe(notify) {changes.add(notify);return () => changes.delete(notify);},
    conversation() {
      return {
        async load(_cursor, signal) {return {messages:(await request<Snapshot>("conversation",{...(signal ? {signal} : {})})).messages};},
        subscribe(notify) {messages.add(notify);return () => messages.delete(notify);},
        async send(message, signal) {
          if (message.replyTo || message.attachments?.length) throw new Error("This native example sends text only.");
          return request<Message>("send", {method:"POST",...(signal ? {signal} : {}),headers:{"Content-Type":"application/json","Idempotency-Key":message.clientId},body:JSON.stringify({text:message.text})});
        },
      };
    },
  };
  void poll();
  return {dispose() {stopped=true;clearTimeout(timer);changes.clear();messages.clear();inbox.source=undefined;}};
}
