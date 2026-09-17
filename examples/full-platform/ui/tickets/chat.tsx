"use client";

import {
  ConversationController,
  MessageComposerController,
  localAttachmentFromFile,
  type ConversationEvent,
  type ConversationMessage,
  type ConversationPage,
} from "@polymorfa/browser";
import {
  ComposeBox,
  MessageList,
  type QuickReplyOption,
} from "@polymorfa/react";
import { useEffect, useMemo, useRef, useState, type RefObject } from "react";

import {
  deviceConversationCache,
  type ConversationCache,
} from "../../lib/browser/conversation-cache.js";
import type {
  DeskMessage,
  DeskTemplate,
  Presence,
  Ticket,
  TicketAction,
} from "../../lib/desk/types.js";
import { useCalls } from "../calls-context.js";
import { useDesk } from "../context.js";
import {
  absolute,
  callApi,
  newClientId,
  uploadFile,
  useLiveEvents,
} from "../data.js";
import { formatPhone, relative, remaining } from "../format.js";
import { Icon } from "../icons.js";
import {
  Avatar,
  Badge,
  Button,
  IconButton,
  Menu,
  Modal,
  cx,
  errorMessage,
  toast,
} from "../kit.js";
import { MessageView } from "./message-view.js";
import {
  ContactCardModal,
  InteractiveModal,
  Lightbox,
  LocationModal,
  TransferModal,
} from "./modals.js";
import { TemplatePicker } from "./template-picker.js";

export interface ChatHandle {
  readonly focusComposer: (text?: string) => void;
}

type SendBody = Readonly<Record<string, unknown>>;

function useNow(interval: number): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), interval);
    return () => clearInterval(timer);
  }, [interval]);
  return now;
}

function normalize(message: DeskMessage): DeskMessage {
  return message.attachments === undefined
    ? message
    : { ...message, attachments: message.attachments.map(absolute) };
}

type Page = ConversationPage & { messages: DeskMessage[] };

function fetchPage(ticketId: string, cursor?: string, signal?: AbortSignal) {
  return callApi<Page>(
    `/api/desk/messages?${new URLSearchParams({
      ticket: ticketId,
      ...(cursor === undefined ? {} : { cursor }),
    })}`,
    undefined,
    signal === undefined ? {} : { signal },
  ).then((page) => ({ ...page, messages: page.messages.map(normalize) }));
}

/**
 * Conversation and composer controllers for one ticket. History loads from
 * this app's routes; live changes arrive over `LiveEvents`. With the device
 * cache on, the cached copy renders first and the backend reconciles it.
 */
function useTicketChat(
  ticketId: string,
  noteMode: RefObject<boolean>,
  cacheEnabled: boolean,
) {
  const [controllers, setControllers] = useState<{
    conversation: ConversationController;
    composer: MessageComposerController;
  }>();

  useEffect(() => {
    const cache: ConversationCache<DeskMessage> | undefined = cacheEnabled
      ? deviceConversationCache<DeskMessage>()
      : undefined;
    const key = `ticket:${ticketId}`;
    let emitEvent: ((event: ConversationEvent) => void) | undefined;
    let latestCursor: string | undefined;

    const reconcile = async (
      cached: readonly DeskMessage[],
      signal?: AbortSignal,
    ) => {
      const page = await fetchPage(ticketId, undefined, signal);
      latestCursor = page.nextCursor;
      const fresh = new Set(page.messages.map((message) => message.id));
      const oldest = page.messages[0]?.createdAt ?? 0;
      for (const message of page.messages) {
        emitEvent?.({ type: "upsert", message });
      }
      // Drop cached messages the backend no longer has in the same range.
      for (const message of cached) {
        if (message.createdAt >= oldest && !fresh.has(message.id)) {
          emitEvent?.({ type: "delete", messageId: message.id });
        }
      }
    };

    const conversation = new ConversationController({
      load: async (cursor, signal) => {
        if (cursor === undefined && cache) {
          const cached = await cache.read(key).catch(() => undefined);
          if (cached && cached.messages.length > 0) {
            latestCursor = cached.nextCursor;
            void reconcile(cached.messages, signal).catch(() => undefined);
            return {
              messages: cached.messages.map(normalize),
              ...(cached.nextCursor === undefined
                ? {}
                : { nextCursor: cached.nextCursor }),
            };
          }
        }
        const page = await fetchPage(ticketId, cursor, signal);
        if (cursor === undefined) latestCursor = page.nextCursor;
        return page;
      },
      subscribe: (listener) => {
        emitEvent = listener;
        const unsubscribe = listenForTicket(ticketId, (message) =>
          listener({ type: "upsert", message: normalize(message) }),
        );
        return () => {
          emitEvent = undefined;
          unsubscribe();
        };
      },
      send: async (message, signal) => {
        const sent = await callApi<DeskMessage>(
          "/api/desk/messages",
          {
            action: "send",
            ticketId,
            kind: "text",
            clientId: message.clientId,
            text: message.text,
            ...(noteMode.current ? { note: true } : {}),
            ...(message.replyTo === undefined
              ? {}
              : { replyTo: message.replyTo }),
            ...(message.attachments === undefined
              ? {}
              : { attachments: message.attachments }),
          },
          {
            // The client id doubles as the idempotency key, so retries are safe.
            idempotencyKey: message.clientId,
            ...(signal === undefined ? {} : { signal }),
          },
        );
        return normalize(sent);
      },
    });
    const composer = new MessageComposerController(
      {
        upload: (attachment, onProgress, signal) => {
          if (attachment.file === undefined) {
            return Promise.reject(new Error("The file could not be read."));
          }
          return uploadFile(
            attachment.file,
            attachment.name,
            onProgress,
            signal,
          );
        },
        send: async (draft) => {
          await conversation.send({
            text: draft.text,
            ...(draft.replyTo === undefined ? {} : { replyTo: draft.replyTo }),
            ...(draft.attachments.length === 0
              ? {}
              : { attachments: draft.attachments }),
          });
        },
      },
      { maxTextLength: 4096, maxAttachmentSize: 16 * 1024 * 1024 },
    );
    // Save settled history to the device cache shortly after it changes.
    let saveTimer: ReturnType<typeof setTimeout> | undefined;
    const stopSaving = cache
      ? conversation.subscribe(() => {
          clearTimeout(saveTimer);
          saveTimer = setTimeout(() => {
            const snapshot = conversation.getSnapshot();
            if (snapshot.status !== "ready") return;
            void cache
              .write(
                key,
                snapshot.messages as readonly DeskMessage[],
                latestCursor,
              )
              .catch(() => undefined);
          }, 600);
        })
      : undefined;

    void conversation.load();
    setControllers({ conversation, composer });
    return () => {
      clearTimeout(saveTimer);
      stopSaving?.();
      conversation.dispose();
      composer.dispose();
    };
  }, [ticketId, noteMode, cacheEnabled]);

  return controllers;
}

// A tiny fan-out so every open conversation shares the app's event stream.
const ticketListeners = new Map<string, Set<(message: DeskMessage) => void>>();

function listenForTicket(
  ticketId: string,
  listener: (message: DeskMessage) => void,
): () => void {
  const set = ticketListeners.get(ticketId) ?? new Set();
  set.add(listener);
  ticketListeners.set(ticketId, set);
  return () => set.delete(listener);
}

export function TicketMessageRelay() {
  useLiveEvents({
    "desk.message": ({ payload }) =>
      ticketListeners
        .get(payload.ticketId)
        ?.forEach((listener) => listener(payload.message)),
  });
  return null;
}

function WindowChip({ ticket }: { readonly ticket: Ticket }) {
  const now = useNow(30_000);
  const expires = ticket.windowExpiresAt;
  if (expires === undefined || expires <= now) {
    return (
      <Badge tone="danger" className="window-chip">
        <Icon name="lock" size={12} /> Window closed
      </Badge>
    );
  }
  const left = expires - now;
  return (
    <Badge
      tone={left < 2 * 60 * 60 * 1000 ? "warning" : "success"}
      className="window-chip"
    >
      <Icon name="clock" size={12} />
      <span>
        {remaining(left)} <span className="cq-wide">left to reply</span>
      </span>
    </Badge>
  );
}

function PresenceLine({
  presence,
  phone,
}: {
  readonly presence: Presence | undefined;
  readonly phone: string;
}) {
  if (presence?.state === "typing" || presence?.state === "recording") {
    return (
      <span className="presence is-typing" aria-live="polite">
        {presence.state === "typing" ? "typing" : "recording audio"}
        <span className="typing-dots" aria-hidden="true">
          <span />
          <span />
          <span />
        </span>
      </span>
    );
  }
  if (presence?.state === "online") {
    return <span className="presence is-online">online</span>;
  }
  return (
    <span className="presence">
      {formatPhone(phone)}
      {presence?.lastSeen !== undefined &&
        ` · last seen ${relative(presence.lastSeen)}`}
    </span>
  );
}

export function ChatPane({
  ticket,
  onBack,
  onTicketChange,
  panelOpen,
  onTogglePanel,
  handle,
}: {
  readonly ticket: Ticket;
  readonly onBack: () => void;
  readonly onTicketChange: (ticket: Ticket) => void;
  readonly panelOpen: boolean;
  readonly onTogglePanel: () => void;
  readonly handle: RefObject<ChatHandle | null>;
}) {
  const { bootstrap, settings, navigate } = useDesk();
  const calls = useCalls();
  const noteMode = useRef(false);
  const [note, setNote] = useState(false);
  const controllers = useTicketChat(
    ticket.id,
    noteMode,
    settings.cacheConversations,
  );
  const [presence, setPresence] = useState<Presence>();
  const [modal, setModal] = useState<
    "transfer" | "template" | "location" | "contact" | "interactive" | undefined
  >();
  const [lightbox, setLightbox] = useState<{ url: string; name: string }>();
  const [searching, setSearching] = useState(false);
  const [term, setTerm] = useState("");
  const [busy, setBusy] = useState<string>();
  const composerRoot = useRef<HTMLDivElement>(null);
  const fileInput = useRef<HTMLInputElement>(null);
  const mediaInput = useRef<HTMLInputElement>(null);
  const now = useNow(30_000);

  const agents = useMemo(
    () => new Map(bootstrap.agents.map((agent) => [agent.id, agent])),
    [bootstrap.agents],
  );
  const connection = bootstrap.connections.find(
    (item) => item.id === ticket.connectionId,
  );
  const queue = bootstrap.queues.find((item) => item.id === ticket.queueId);
  const me = bootstrap.me.agent;
  const windowOpen =
    ticket.windowExpiresAt !== undefined && ticket.windowExpiresAt > now;
  const resolved = ticket.status === "resolved";

  useEffect(() => {
    noteMode.current = note;
  }, [note]);

  useEffect(() => {
    setNote(false);
    setSearching(false);
    setTerm("");
    setPresence(undefined);
    callApi<Presence>("/api/desk/messages", {
      action: "presence",
      ticketId: ticket.id,
    })
      .then(setPresence)
      .catch(() => undefined);
    if (ticket.unread > 0) {
      callApi<Ticket>("/api/desk/tickets", {
        action: "markRead",
        ticketId: ticket.id,
      })
        .then(onTicketChange)
        .catch(() => undefined);
    }
    // Runs only when a different ticket is opened.
  }, [ticket.id]);

  // Publish the composer height so floating tools can stay clear of it.
  useEffect(() => {
    const footer = composerRoot.current;
    const root = document.documentElement;
    if (!footer) return;
    root.dataset.chatOpen = "";
    const observer = new ResizeObserver(([entry]) => {
      if (entry) {
        root.style.setProperty(
          "--composer-h",
          `${Math.ceil(entry.contentRect.height)}px`,
        );
      }
    });
    observer.observe(footer);
    return () => {
      observer.disconnect();
      delete root.dataset.chatOpen;
    };
  }, []);

  useLiveEvents({
    "desk.presence": ({ payload }) => {
      if (payload.ticketId === ticket.id) setPresence(payload.presence);
    },
  });

  // Tell the customer's phone the agent is typing, at most every 5 seconds.
  useEffect(() => {
    const composer = controllers?.composer;
    if (!composer) return;
    let last = 0;
    let previous = composer.getSnapshot().text;
    return composer.subscribe(() => {
      const text = composer.getSnapshot().text;
      if (text === previous) return;
      previous = text;
      if (noteMode.current || text === "" || Date.now() - last < 5000) return;
      last = Date.now();
      void callApi("/api/desk/messages", {
        action: "typing",
        ticketId: ticket.id,
        typing: true,
      }).catch(() => undefined);
    });
  }, [controllers, ticket.id]);

  handle.current = {
    focusComposer: (text) => {
      if (text !== undefined) controllers?.composer.setText(text);
      const field = composerRoot.current?.querySelector("textarea");
      field?.focus();
      if (field && text !== undefined) {
        field.setSelectionRange(text.length, text.length);
      }
    },
  };

  const act = async (action: TicketAction["action"], extra: SendBody = {}) => {
    setBusy(action);
    try {
      const updated = await callApi<Ticket>("/api/desk/tickets", {
        action,
        ticketId: ticket.id,
        ...extra,
      });
      onTicketChange(updated);
      if (action === "resolve")
        toast(`Ticket #${ticket.number} resolved`, "success");
      if (action === "accept") toast("Ticket accepted", "success");
    } catch (error) {
      toast(errorMessage(error), "danger");
    } finally {
      setBusy(undefined);
    }
  };

  const sendSpecial = async (body: SendBody) => {
    try {
      await callApi(
        "/api/desk/messages",
        {
          action: "send",
          ticketId: ticket.id,
          clientId: newClientId(),
          ...body,
        },
        { idempotencyKey: newClientId() },
      );
      setModal(undefined);
    } catch (error) {
      toast(errorMessage(error), "danger");
    }
  };

  const sendTemplate = (
    template: DeskTemplate,
    values: Readonly<Record<string, string>>,
  ) =>
    sendSpecial({ kind: "template", templateId: template.id, values }).then(
      () => toast(`Template "${template.name}" sent`, "success"),
    );

  const react = (message: ConversationMessage, emoji: string) => {
    void callApi("/api/desk/messages", {
      action: "react",
      ticketId: ticket.id,
      messageId: message.id,
      emoji,
    }).catch((error: unknown) => toast(errorMessage(error), "danger"));
  };

  const quickReplies = useMemo<QuickReplyOption[]>(
    () =>
      bootstrap.quickReplies.map((reply) => ({
        id: reply.id,
        shortcut: reply.shortcut,
        text: reply.message,
      })),
    [bootstrap.quickReplies],
  );

  const matches = useMemo(() => {
    if (!searching || term.trim().length < 2 || !controllers) return [];
    const needle = term.toLowerCase();
    return controllers.conversation
      .getSnapshot()
      .messages.filter((message) => message.text.toLowerCase().includes(needle))
      .sort((a, b) => b.createdAt - a.createdAt);
  }, [searching, term, controllers]);

  const jump = (id: string) => {
    const node = document.querySelector<HTMLElement>(
      `.chat-body [data-message-id="${CSS.escape(id)}"]`,
    );
    node?.scrollIntoView({ block: "center", behavior: "smooth" });
    node?.classList.add("pmfa-msg-flash");
    setTimeout(() => node?.classList.remove("pmfa-msg-flash"), 1300);
  };

  const pickFiles = (input: HTMLInputElement | null) => {
    if (!input || !controllers) return;
    for (const file of [...(input.files ?? [])]) {
      void controllers.composer.addAttachment(localAttachmentFromFile(file));
    }
    input.value = "";
  };

  const assignee = ticket.assigneeId
    ? agents.get(ticket.assigneeId)
    : undefined;

  return (
    <section
      className="chat"
      aria-label={`Conversation with ${ticket.contact.name}`}
    >
      <header className="chat-header">
        <IconButton
          icon="chevronLeft"
          label="Back to tickets"
          className="only-mobile"
          onClick={onBack}
        />
        <button
          type="button"
          className="chat-contact"
          onClick={onTogglePanel}
          aria-label={`Contact details for ${ticket.contact.name}`}
        >
          <Avatar
            name={ticket.contact.name}
            src={ticket.contact.avatarUrl}
            size={40}
            status={
              presence?.state === "online" || presence?.state === "typing"
                ? "online"
                : undefined
            }
          />
          <span className="chat-contact-text">
            <span className="chat-name">
              {ticket.contact.name}
              <span className="chat-number">#{ticket.number}</span>
            </span>
            <PresenceLine presence={presence} phone={ticket.contact.phone} />
          </span>
        </button>
        <div className="chat-header-actions">
          <WindowChip ticket={ticket} />
          {ticket.status === "pending" ? (
            <Button
              variant="primary"
              size="sm"
              icon="check"
              loading={busy === "accept"}
              onClick={() => void act("accept")}
            >
              Accept
            </Button>
          ) : resolved ? (
            <Button
              size="sm"
              icon="rotate"
              loading={busy === "reopen"}
              onClick={() => void act("reopen")}
            >
              Reopen
            </Button>
          ) : (
            <Button
              variant="success"
              size="sm"
              icon="check"
              loading={busy === "resolve"}
              onClick={() => void act("resolve")}
              className="cq-mid"
            >
              Resolve
            </Button>
          )}
          <IconButton
            icon="search"
            label="Search in conversation"
            active={searching}
            onClick={() => setSearching((value) => !value)}
            className="cq-wide"
          />
          <IconButton
            icon="phone"
            label="Voice call"
            disabled={!calls}
            onClick={() => void calls?.controller.place(ticket.contact.phone)}
            className="cq-mid"
          />
          <IconButton
            icon="video"
            label="Video call"
            disabled={!calls}
            onClick={() =>
              void calls?.controller.place(ticket.contact.phone, {
                video: true,
              })
            }
            className="cq-wide"
          />
          <IconButton
            icon="panelRight"
            label={panelOpen ? "Hide contact details" : "Show contact details"}
            active={panelOpen}
            onClick={onTogglePanel}
            className="cq-mid"
          />
          <Menu
            label="More ticket actions"
            items={[
              {
                label: "Transfer",
                icon: "transfer",
                onSelect: () => setModal("transfer"),
              },
              ...(ticket.status === "open"
                ? [
                    {
                      label: "Resolve",
                      icon: "check" as const,
                      onSelect: () => void act("resolve"),
                    },
                  ]
                : []),
              {
                label: "Search in chat",
                icon: "search",
                onSelect: () => setSearching(true),
              },
              {
                label: "Voice call",
                icon: "phone",
                disabled: !calls,
                onSelect: () =>
                  void calls?.controller.place(ticket.contact.phone),
              },
              {
                label: "Video call",
                icon: "video",
                disabled: !calls,
                onSelect: () =>
                  void calls?.controller.place(ticket.contact.phone, {
                    video: true,
                  }),
              },
              {
                label: "Contact details",
                icon: "user",
                onSelect: onTogglePanel,
              },
            ]}
          />
        </div>
      </header>

      <div className="chat-subbar">
        <WindowChip ticket={ticket} />
        <span className="sub-item">
          <span className="dot" style={{ background: queue?.color }} />
          {queue?.name ?? "No queue"}
        </span>
        <span className="sub-item">
          {assignee ? (
            <>
              <Avatar name={assignee.name} size={18} color={assignee.color} />
              {assignee.id === me.id ? "Assigned to you" : assignee.name}
            </>
          ) : (
            <>
              <Icon name="inbox" size={14} /> Unassigned
            </>
          )}
        </span>
        {connection && (
          <span className="sub-item">
            <span
              className="conn-swatch"
              style={{ background: connection.color }}
            />
            {connection.name}
          </span>
        )}
        <button
          type="button"
          className="sub-link"
          onClick={() => setModal("transfer")}
        >
          <Icon name="transfer" size={14} /> Transfer
        </button>
      </div>

      {searching && (
        <div className="chat-search" role="search">
          <label className="search-input">
            <Icon name="search" size={16} />
            <span className="sr-only">Search messages</span>
            <input
              type="search"
              autoFocus
              placeholder="Search this conversation"
              value={term}
              onChange={(event) => setTerm(event.currentTarget.value)}
              onKeyDown={(event) => {
                if (event.key === "Escape") setSearching(false);
                if (event.key === "Enter" && matches[0]) jump(matches[0].id);
              }}
            />
          </label>
          <span className="muted small" aria-live="polite">
            {term.trim().length >= 2 ? `${matches.length} found` : ""}
          </span>
          <IconButton
            icon="x"
            label="Close search"
            onClick={() => setSearching(false)}
          />
          {matches.length > 0 && (
            <ul className="search-results">
              {matches.slice(0, 8).map((message) => (
                <li key={message.id}>
                  <button type="button" onClick={() => jump(message.id)}>
                    <span className="muted small">
                      {relative(message.createdAt)}
                    </span>
                    <span className="truncate">{message.text}</span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      <div className="chat-body">
        {controllers && (
          <MessageList
            controller={controllers.conversation}
            className="chat-list"
            onReply={(message) => {
              controllers.composer.setReplyTo(message.id);
              handle.current?.focusComposer();
            }}
            renderMessage={(message) => (
              <MessageView
                message={message}
                locale={settings.locale}
                authorName={
                  "authorId" in message && typeof message.authorId === "string"
                    ? agents.get(message.authorId)?.name
                    : undefined
                }
                highlight={searching ? term : undefined}
                onReact={(emoji) => react(message, emoji)}
                onOpenImage={(url, name) => setLightbox({ url, name })}
                onMessageContact={(phone) => {
                  void callApi<Ticket>("/api/desk/tickets", {
                    action: "create",
                    phone,
                    connectionId: ticket.connectionId,
                  })
                    .then((created) => navigate(`/tickets/${created.id}`))
                    .catch((error: unknown) =>
                      toast(errorMessage(error), "danger"),
                    );
                }}
              />
            )}
          />
        )}
      </div>

      <div className="chat-footer" ref={composerRoot}>
        {resolved ? (
          <div className="composer-banner">
            <Icon name="check" size={18} />
            <span>
              This ticket is resolved. Reopen it to keep the conversation going.
            </span>
            <Button
              variant="primary"
              size="sm"
              icon="rotate"
              onClick={() => void act("reopen")}
            >
              Reopen
            </Button>
          </div>
        ) : !windowOpen ? (
          <div className="window-closed">
            <div className="composer-banner is-warning">
              <Icon name="lock" size={18} />
              <span>
                <strong>The 24-hour reply window is closed.</strong> WhatsApp
                only allows approved templates until{" "}
                {ticket.contact.name.split(" ")[0]} writes again.
              </span>
            </div>
            <TemplatePicker
              compact
              contactName={ticket.contact.name}
              onSend={sendTemplate}
            />
          </div>
        ) : (
          controllers && (
            <div className={cx("desk-composer", note && "is-note")}>
              {note && (
                <div className="note-hint">
                  <Icon name="lock" size={14} /> Private note: only your team
                  sees this.
                </div>
              )}
              <ComposeBox
                controller={controllers.composer}
                conversation={controllers.conversation}
                placeholder={
                  note
                    ? "Write a private note"
                    : "Type a message, or / for quick replies"
                }
                quickReplies={quickReplies}
                emoji
                voiceNotes={!note}
                voiceNoteAutoSend
                maxRows={6}
                startActions={
                  <Menu
                    label="Attach"
                    icon="paperclip"
                    align="start"
                    items={[
                      {
                        label: "Document",
                        icon: "file",
                        onSelect: () => fileInput.current?.click(),
                      },
                      {
                        label: "Photo or video",
                        icon: "image",
                        onSelect: () => mediaInput.current?.click(),
                      },
                      {
                        label: "Contact card",
                        icon: "user",
                        disabled: note,
                        onSelect: () => setModal("contact"),
                      },
                      {
                        label: "Location",
                        icon: "mapPin",
                        disabled: note,
                        onSelect: () => setModal("location"),
                      },
                      {
                        label: "Buttons or list",
                        icon: "buttons",
                        disabled: note,
                        onSelect: () => setModal("interactive"),
                      },
                      {
                        label: "Template message",
                        icon: "templates",
                        disabled: note,
                        onSelect: () => setModal("template"),
                      },
                    ]}
                  />
                }
                endActions={
                  <IconButton
                    icon="note"
                    label={
                      note
                        ? "Switch to customer reply"
                        : "Switch to private note"
                    }
                    active={note}
                    className="note-toggle"
                    onClick={() => setNote((value) => !value)}
                  />
                }
              />
              <input
                ref={fileInput}
                type="file"
                hidden
                multiple
                accept=".pdf,.doc,.docx,.xls,.xlsx,.csv,.txt,.zip"
                onChange={(event) => pickFiles(event.currentTarget)}
              />
              <input
                ref={mediaInput}
                type="file"
                hidden
                multiple
                accept="image/jpeg,image/png,image/webp,image/gif,video/mp4,video/webm"
                onChange={(event) => pickFiles(event.currentTarget)}
              />
            </div>
          )
        )}
      </div>

      {modal === "transfer" && (
        <TransferModal
          currentAgentId={ticket.assigneeId}
          currentQueueId={ticket.queueId}
          onClose={() => setModal(undefined)}
          onTransfer={async (target) => {
            await act("transfer", target);
            setModal(undefined);
          }}
        />
      )}
      {modal === "template" && (
        <Modal
          title="Send a template"
          description="Approved templates can be sent at any time."
          size="lg"
          onClose={() => setModal(undefined)}
        >
          <TemplatePicker
            contactName={ticket.contact.name}
            onSend={sendTemplate}
            onCancel={() => setModal(undefined)}
          />
        </Modal>
      )}
      {modal === "location" && (
        <LocationModal
          onClose={() => setModal(undefined)}
          onSend={(location) => sendSpecial({ kind: "location", location })}
        />
      )}
      {modal === "contact" && (
        <ContactCardModal
          onClose={() => setModal(undefined)}
          onSend={(card) => sendSpecial({ kind: "contact", ...card })}
        />
      )}
      {modal === "interactive" && (
        <InteractiveModal
          onClose={() => setModal(undefined)}
          onSend={(input) => sendSpecial(input)}
        />
      )}
      {lightbox && (
        <Lightbox
          url={lightbox.url}
          name={lightbox.name}
          onClose={() => setLightbox(undefined)}
        />
      )}
    </section>
  );
}
