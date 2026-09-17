"use client";

import {
  ConversationController,
  MessageComposerController,
  type ConversationDataSource,
  type ConversationMessage,
  type ConversationPage,
} from "@polymorfa/browser";
import { ChatDrawer, ComposeBox, MessageList } from "@polymorfa/react";
import { useEffect, useState } from "react";

import { callApi } from "../../lib/browser/api.js";
import { listen } from "../../lib/browser/realtime.js";

/** Conversation data backed by this application's own routes. */
function inboxSource(chat: string): ConversationDataSource {
  return {
    load: (cursor, signal) =>
      callApi<ConversationPage>(
        `/api/messaging/inbox?${new URLSearchParams({
          chat,
          ...(cursor === undefined ? {} : { cursor }),
        })}`,
        undefined,
        signal === undefined ? {} : { signal },
      ),
    subscribe: (listener) =>
      listen({
        message: (event) => {
          if (event.chat === chat) {
            listener({ type: "upsert", message: event.message });
          }
        },
      }),
    send: (message, signal) =>
      callApi<ConversationMessage>(
        "/api/messaging/inbox",
        {
          chat,
          clientId: message.clientId,
          text: message.text,
          ...(message.replyTo === undefined
            ? {}
            : { replyTo: message.replyTo }),
        },
        {
          // The client id doubles as the idempotency key, so retries are safe.
          idempotencyKey: message.clientId,
          ...(signal === undefined ? {} : { signal }),
        },
      ),
  };
}

function useChat(chat: string) {
  const [controllers, setControllers] = useState<{
    conversation: ConversationController;
    composer: MessageComposerController;
  }>();

  useEffect(() => {
    const conversation = new ConversationController(inboxSource(chat));
    const composer = new MessageComposerController(
      {
        upload: async () => {
          throw new Error("Attachments are not enabled in this demo.");
        },
        send: async (draft) => {
          await conversation.send({
            text: draft.text,
            ...(draft.replyTo === undefined ? {} : { replyTo: draft.replyTo }),
          });
        },
      },
      { maxTextLength: 4096 },
    );
    void conversation.load();
    setControllers({ conversation, composer });
    return () => {
      conversation.dispose();
      composer.dispose();
    };
  }, [chat]);

  return controllers;
}

export function Inbox() {
  const [chat, setChat] = useState("+15550100");
  const [open, setOpen] = useState(true);
  const controllers = useChat(chat);

  return (
    <section>
      <label>
        Customer number{" "}
        <input
          value={chat}
          onChange={(event) => setChat(event.currentTarget.value)}
        />
      </label>
      <button type="button" onClick={() => setOpen(true)}>
        Open chat
      </button>
      {controllers &&
        (open ? (
          <ChatDrawer
            onClose={() => setOpen(false)}
            controller={controllers.conversation}
            composer={<ComposeBox controller={controllers.composer} />}
          />
        ) : (
          <>
            <MessageList controller={controllers.conversation} />
            <ComposeBox controller={controllers.composer} />
          </>
        ))}
    </section>
  );
}
