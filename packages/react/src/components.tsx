import {
  VoiceNoteRecorder,
  localAttachmentFromFile,
  type ComposerAttachment,
  type ConversationController,
  type ConversationMessage,
  type ConversationSnapshot,
  type LocalAttachment,
  type MessageAttachment,
  type MessageComposerController,
  type MessageComposerSnapshot,
  type RenderedTemplate,
  type TemplateBuilderController,
  type VoiceNoteError,
  type VoiceNoteRecorderSnapshot,
} from "@polymorfa/browser";
import {
  CHAT_ICONS,
  EMOJI_CATEGORY_ICONS,
  EMOJI_PICKER_CATEGORIES,
  applyQuickReply,
  emojiInCategory,
  filterQuickReplies,
  findQuickReplyQuery,
  formatElapsed,
  insertText,
  placePopover,
  quickReplyLabel,
  readRecentEmoji,
  recentEmojiEntries,
  recordRecentEmoji,
  searchEmoji,
  type EmojiPickerCategory,
  type QuickReplyOption,
  ENGLISH_MESSAGES,
  appearanceToCssVariables,
  formatDayLabel,
  formatFileSize,
  formatMessageTime,
  injectComponentStyles,
  isImageAttachment,
  layoutMessages,
  safeAttachmentUrl,
  slotClassName,
  themeClassName,
  type Appearance,
  type ChatIconName,
  type ComponentSlot,
  type MessageKey,
  type SlotClassNames,
} from "@polymorfa/ui";
import {
  memo,
  useCallback,
  useEffect,
  useId,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
  type ClipboardEvent,
  type CSSProperties,
  type DragEvent,
  type KeyboardEvent,
  type ReactNode,
} from "react";
import { usePolymorfa } from "./context.js";
import {
  useController,
  safeSubscribe,
  useOwnedController,
  useResolvedController,
} from "./hooks.js";

type ControllerProps<T> = {
  readonly controller?: T;
  readonly createController?: () => T;
};
type Configuration = ReturnType<typeof usePolymorfa>;

interface SlotProps {
  readonly className: string;
  readonly style?: CSSProperties;
  readonly "data-slot": ComponentSlot;
}
export type Slots = (slot: ComponentSlot, base: string) => SlotProps;

// Runs before paint in the browser, and quietly on the server.
const useIsomorphicLayoutEffect =
  typeof document === "undefined" ? useEffect : useLayoutEffect;

function slotStyle(
  styles: Readonly<Record<string, string>> | undefined,
): CSSProperties | undefined {
  if (styles === undefined) return undefined;
  const style: Record<string, string> = {};
  for (const [name, value] of Object.entries(styles))
    style[
      name.startsWith("--")
        ? name
        : name.replace(/-([a-z])/g, (_, letter: string) => letter.toUpperCase())
    ] = value;
  return style as CSSProperties;
}

function createSlots(
  appearance: Appearance,
  classNames: SlotClassNames | undefined,
): Slots {
  const styles = new Map<ComponentSlot, CSSProperties | undefined>();
  return (slot, base) => {
    if (!styles.has(slot))
      styles.set(slot, slotStyle(appearance.elements[slot]?.styles));
    const style = styles.get(slot);
    return {
      className: slotClassName(appearance, slot, base, classNames),
      ...(style === undefined ? {} : { style }),
      "data-slot": slot,
    };
  };
}

/** Slot resolver that keeps its identity while the inputs are unchanged. */
export function useSlots(classNames: SlotClassNames | undefined): Slots {
  const { appearance } = usePolymorfa();
  const key = classNames === undefined ? "" : JSON.stringify(classNames);
  // `key` stands in for `classNames`, which callers usually pass inline.
  return useMemo(() => createSlots(appearance, classNames), [appearance, key]);
}

function useStyles(appearance: Appearance): void {
  const unstyled = appearance.unstyled === true;
  useEffect(() => {
    if (!unstyled) injectComponentStyles();
  }, [unstyled]);
}

/** Root props: theme classes, direction, CSS variables, and the slot. */
export function useShell(
  slots: Slots,
  slot: ComponentSlot,
  base: string,
  className: string | undefined,
): {
  readonly dir: "ltr" | "rtl";
  readonly className: string;
  readonly style: CSSProperties;
  readonly "data-slot": ComponentSlot;
} {
  const configuration = usePolymorfa();
  const { appearance, locale } = configuration;
  useStyles(appearance);
  const variables = useMemo(
    () =>
      ({
        ...appearanceToCssVariables(appearance),
        "--pmfa-drawer-width": appearance.layout.drawerWidth,
      }) as CSSProperties,
    [appearance],
  );
  const slotProps = slots(slot, base);
  return {
    dir:
      appearance.layout.direction === "auto"
        ? locale.direction
        : appearance.layout.direction,
    className: [
      themeClassName(appearance.theme),
      slotProps.className,
      className,
    ]
      .filter((value) => value !== undefined && value !== "")
      .join(" "),
    style:
      slotProps.style === undefined
        ? variables
        : { ...variables, ...slotProps.style },
    "data-slot": slot,
  };
}

export function text(
  configuration: Configuration,
  key: MessageKey,
  values: Readonly<Record<string, string>> = {},
): string {
  const template = configuration.locale.messages[key] ?? ENGLISH_MESSAGES[key];
  return template.replace(
    /\{(\w+)\}/g,
    (_, name: string) => values[name] ?? "",
  );
}

export function Icon({
  name,
  className = "pmfa-icon",
}: {
  readonly name: ChatIconName;
  readonly className?: string;
}) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
    >
      <path d={CHAT_ICONS[name]} />
    </svg>
  );
}

/** Subscribe to a controller that may be absent. */
const NO_SUBSCRIPTION = () => () => undefined;
const NO_SNAPSHOT = () => undefined;
function useOptionalController<T>(
  controller:
    | {
        getSnapshot(): T;
        subscribe(listener: () => void): () => void;
      }
    | undefined,
): T | undefined {
  return useSyncExternalStore(
    controller === undefined ? NO_SUBSCRIPTION : safeSubscribe(controller),
    controller?.getSnapshot ?? NO_SNAPSHOT,
    controller?.getSnapshot ?? NO_SNAPSHOT,
  );
}

/** A value's latest version, for stable callbacks. */
function useLatest<T>(value: T): { readonly current: T } {
  const ref = useRef(value);
  useIsomorphicLayoutEffect(() => {
    ref.current = value;
  });
  return ref;
}

function authorName(
  configuration: Configuration,
  message: ConversationMessage | undefined,
): string {
  return text(
    configuration,
    message?.direction === "outbound" ? "chat.you" : "chat.contact",
  );
}

function snippet(
  configuration: Configuration,
  message: ConversationMessage,
): string {
  return message.text.trim() !== ""
    ? message.text
    : (message.attachments?.[0]?.name ??
        text(configuration, "chat.attachment"));
}

// ── Messages ──────────────────────────────────────────────────────────

export type RenderAttachment = (
  attachment: MessageAttachment,
  message: ConversationMessage,
) => ReactNode;

function AttachmentView({
  attachment,
  configuration,
  slots,
}: {
  readonly attachment: MessageAttachment;
  readonly configuration: Configuration;
  readonly slots: Slots;
}) {
  // Unsafe schemes such as `javascript:` never reach `href` or `src`.
  const url = safeAttachmentUrl(attachment.url);
  const source = safeAttachmentUrl(attachment.previewUrl) ?? url;
  if (isImageAttachment(attachment) && source !== undefined) {
    const image = (
      <img src={source} alt={attachment.name} loading="lazy" decoding="async" />
    );
    return url === undefined ? (
      <div {...slots("attachment", "pmfa-att pmfa-att-media")}>{image}</div>
    ) : (
      <a
        {...slots("attachment", "pmfa-att pmfa-att-media")}
        href={url}
        target="_blank"
        rel="noopener noreferrer"
      >
        {image}
      </a>
    );
  }
  const body = (
    <>
      <span className="pmfa-att-icon">
        <Icon name="file" />
      </span>
      <span className="pmfa-att-body">
        <span className="pmfa-att-name">{attachment.name}</span>
        <span className="pmfa-att-size">
          {formatFileSize(attachment.size, configuration.locale.code)}
        </span>
      </span>
    </>
  );
  return url === undefined ? (
    <div {...slots("attachment", "pmfa-att pmfa-att-file")}>{body}</div>
  ) : (
    <a
      {...slots("attachment", "pmfa-att pmfa-att-file")}
      href={url}
      target="_blank"
      rel="noopener noreferrer"
      title={text(configuration, "chat.openAttachment", {
        name: attachment.name,
      })}
    >
      {body}
    </a>
  );
}

interface MessageItemProps {
  readonly message: ConversationMessage;
  readonly quoted: ConversationMessage | undefined;
  readonly groupStart: boolean;
  readonly groupEnd: boolean;
  readonly configuration: Configuration;
  readonly slots: Slots;
  readonly canReply: boolean;
  readonly canRetry: boolean;
  readonly onReply: (message: ConversationMessage) => void;
  readonly onRetry: (message: ConversationMessage) => void;
  readonly onJump: (id: string) => void;
  readonly renderMessage:
    ((message: ConversationMessage) => ReactNode) | undefined;
  readonly renderAttachment: RenderAttachment | undefined;
}

const MessageItem = memo(function MessageItem({
  message,
  quoted,
  groupStart,
  groupEnd,
  configuration,
  slots,
  canReply,
  canRetry,
  onReply,
  onRetry,
  onJump,
  renderMessage,
  renderAttachment,
}: MessageItemProps) {
  const outbound = message.direction === "outbound";
  const time = formatMessageTime(message.createdAt, configuration.locale.code);
  const status =
    message.status === "failed"
      ? text(configuration, "chat.failed")
      : message.status === "pending"
        ? text(configuration, "chat.sending")
        : outbound
          ? text(configuration, "chat.sent")
          : undefined;
  const retry =
    canRetry &&
    outbound &&
    message.status === "failed" &&
    message.clientId !== undefined;
  const custom = renderMessage?.(message);
  return (
    <li
      {...slots(
        "message",
        [
          "pmfa-msg",
          `pmfa-msg-${outbound ? "out" : "in"}`,
          `pmfa-msg-${message.status}`,
          groupStart ? "pmfa-msg-start" : "",
          groupEnd ? "pmfa-msg-end" : "",
        ]
          .filter(Boolean)
          .join(" "),
      )}
      data-message-id={message.id}
      tabIndex={-1}
    >
      {quoted !== undefined && (
        <button
          type="button"
          {...slots("replyQuote", "pmfa-quote")}
          onClick={() => onJump(quoted.id)}
        >
          <span className="pmfa-sr">
            {text(configuration, "chat.jumpToReply")}
          </span>
          <span className="pmfa-quote-name">
            {authorName(configuration, quoted)}
          </span>
          <span className="pmfa-quote-text">
            {snippet(configuration, quoted)}
          </span>
        </button>
      )}
      <div className="pmfa-row">
        <div {...slots("bubble", "pmfa-bubble")}>
          {custom ?? (
            <>
              {(message.attachments?.length ?? 0) > 0 && (
                <div className="pmfa-atts">
                  {message.attachments?.map((attachment) => (
                    <AttachmentItem
                      key={attachment.id}
                      attachment={attachment}
                      message={message}
                      configuration={configuration}
                      slots={slots}
                      renderAttachment={renderAttachment}
                    />
                  ))}
                </div>
              )}
              {message.text !== "" && (
                <span className="pmfa-text">{message.text}</span>
              )}
            </>
          )}
        </div>
        {(canReply || retry) && (
          <div
            {...slots("messageActions", "pmfa-actions-msg")}
            role="group"
            aria-label={text(configuration, "chat.messageActions")}
          >
            {retry && (
              <button
                type="button"
                {...slots(
                  "retryButton",
                  "pmfa-btn pmfa-btn-ghost pmfa-btn-icon pmfa-action-retry",
                )}
                aria-label={text(configuration, "chat.retry")}
                title={text(configuration, "chat.retry")}
                onClick={() => onRetry(message)}
              >
                <Icon name="retry" />
              </button>
            )}
            {canReply && (
              <button
                type="button"
                {...slots(
                  "replyButton",
                  "pmfa-btn pmfa-btn-ghost pmfa-btn-icon",
                )}
                aria-label={text(configuration, "chat.reply")}
                title={text(configuration, "chat.reply")}
                onClick={() => onReply(message)}
              >
                <Icon name="reply" />
              </button>
            )}
          </div>
        )}
      </div>
      <span {...slots("messageMeta", "pmfa-meta")}>
        {time !== undefined && (
          <time dateTime={new Date(message.createdAt).toISOString()}>
            {time}
          </time>
        )}
        {outbound && (
          <Icon name={message.status} className="pmfa-icon pmfa-status" />
        )}
        {status !== undefined &&
          (message.status === "failed" ? (
            <span>{status}</span>
          ) : (
            <span className="pmfa-sr">{status}</span>
          ))}
      </span>
      {message.error !== undefined && (
        <span className="pmfa-msg-error" role="alert">
          {message.error}
        </span>
      )}
    </li>
  );
});

function AttachmentItem({
  attachment,
  message,
  configuration,
  slots,
  renderAttachment,
}: {
  readonly attachment: MessageAttachment;
  readonly message: ConversationMessage;
  readonly configuration: Configuration;
  readonly slots: Slots;
  readonly renderAttachment: RenderAttachment | undefined;
}) {
  return (
    renderAttachment?.(attachment, message) ?? (
      <AttachmentView
        attachment={attachment}
        configuration={configuration}
        slots={slots}
      />
    )
  );
}

interface ConversationViewProps {
  readonly renderMessage?: (message: ConversationMessage) => ReactNode;
  readonly renderAttachment?: RenderAttachment;
  /** Show a Reply action on each message. */
  readonly onReply?: (message: ConversationMessage) => void;
}

/** Keeps the newest message in view while the reader is already at the end. */
function useStickToBottom(dependency: unknown) {
  const ref = useRef<HTMLDivElement>(null);
  const pinned = useRef(true);
  useIsomorphicLayoutEffect(() => {
    const node = ref.current;
    if (node !== null && pinned.current) node.scrollTop = node.scrollHeight;
  }, [dependency]);
  const onScroll = useCallback(() => {
    const node = ref.current;
    if (node !== null)
      pinned.current =
        node.scrollHeight - node.scrollTop - node.clientHeight < 32;
  }, []);
  return { ref, onScroll };
}

function prefersReducedMotion(): boolean {
  return (
    typeof matchMedia === "function" &&
    matchMedia("(prefers-reduced-motion: reduce)").matches
  );
}

function ConversationLog({
  controller,
  rootProps,
  slots,
  renderMessage,
  renderAttachment,
  onReply,
}: ConversationViewProps & {
  readonly controller: ConversationController;
  readonly rootProps: SlotProps & { readonly dir?: "ltr" | "rtl" };
  readonly slots: Slots;
}) {
  const snapshot: ConversationSnapshot = useController(controller);
  const configuration = usePolymorfa();
  const scroll = useStickToBottom(snapshot.messages);
  const entries = useMemo(
    () => layoutMessages(snapshot.messages),
    [snapshot.messages],
  );
  const byId = useMemo(
    () => new Map(snapshot.messages.map((message) => [message.id, message])),
    [snapshot.messages],
  );
  const latestReply = useLatest(onReply);
  const reply = useCallback(
    (message: ConversationMessage) => latestReply.current?.(message),
    [latestReply],
  );
  const retry = useCallback(
    (message: ConversationMessage) => {
      if (message.clientId !== undefined)
        void controller.retry(message.clientId).catch(() => undefined);
    },
    [controller],
  );
  const jump = useCallback(
    (id: string) => {
      const target = scroll.ref.current?.querySelector<HTMLElement>(
        `[data-message-id="${id.replace(/["\\]/g, "\\$&")}"]`,
      );
      if (target === null || target === undefined) return;
      target.scrollIntoView?.({
        block: "center",
        behavior: prefersReducedMotion() ? "auto" : "smooth",
      });
      target.focus({ preventScroll: true });
      target.classList.remove("pmfa-msg-flash");
      target.classList.add("pmfa-msg-flash");
      setTimeout(() => target.classList.remove("pmfa-msg-flash"), 1200);
    },
    [scroll.ref],
  );
  const loadMore = useCallback(() => void controller.loadMore(), [controller]);
  const canRetry = typeof controller.retry === "function";
  const now = Date.now();
  const dayLabels = {
    today: text(configuration, "chat.today"),
    yesterday: text(configuration, "chat.yesterday"),
  };
  return (
    <div
      {...rootProps}
      ref={scroll.ref}
      onScroll={scroll.onScroll}
      data-pmfa="message-list"
      role="log"
      aria-live="polite"
      aria-label={text(configuration, "chat.title")}
    >
      <ol className="pmfa-items">
        {snapshot.hasMore && (
          <li className="pmfa-loadmore">
            <button
              type="button"
              {...slots("loadMore", "pmfa-btn")}
              onClick={loadMore}
            >
              {text(configuration, "chat.loadMore")}
            </button>
          </li>
        )}
        {entries.length === 0 ? (
          <li {...slots("empty", "pmfa-empty")}>
            {text(configuration, "chat.empty")}
          </li>
        ) : (
          entries.map((entry) =>
            entry.kind === "date" ? (
              <li key={entry.key} {...slots("dateSeparator", "pmfa-date")}>
                {formatDayLabel(
                  entry.time,
                  configuration.locale.code,
                  dayLabels,
                  now,
                )}
              </li>
            ) : (
              <MessageItem
                key={entry.key}
                message={entry.message}
                quoted={
                  entry.message.replyTo === undefined
                    ? undefined
                    : byId.get(entry.message.replyTo)
                }
                groupStart={entry.groupStart}
                groupEnd={entry.groupEnd}
                configuration={configuration}
                slots={slots}
                canReply={onReply !== undefined}
                canRetry={canRetry}
                onReply={reply}
                onRetry={retry}
                onJump={jump}
                renderMessage={renderMessage}
                renderAttachment={renderAttachment}
              />
            ),
          )
        )}
      </ol>
    </div>
  );
}

export interface MessageListProps
  extends ControllerProps<ConversationController>, ConversationViewProps {
  readonly className?: string;
  readonly classNames?: SlotClassNames;
}
export function MessageList({
  controller,
  createController,
  className,
  classNames,
  ...viewProps
}: MessageListProps) {
  const resolved = useResolvedController(controller, createController);
  const slots = useSlots(classNames);
  const root = useShell(slots, "messageList", "pmfa-list", className);
  return (
    <ConversationLog
      {...viewProps}
      controller={resolved}
      rootProps={root}
      slots={slots}
    />
  );
}

// ── Composer ──────────────────────────────────────────────────────────

let attachmentCounter = 0;
function attachmentFromFile(file: File): LocalAttachment {
  attachmentCounter += 1;
  return {
    id:
      globalThis.crypto?.randomUUID?.() ??
      `local-${Date.now()}-${attachmentCounter}`,
    name: file.name,
    size: file.size,
    contentType: file.type === "" ? "application/octet-stream" : file.type,
    file,
  };
}

function errorText(cause: unknown): string {
  return cause instanceof Error ? cause.message : String(cause);
}

const supportsFieldSizing =
  typeof CSS !== "undefined" &&
  typeof CSS.supports === "function" &&
  CSS.supports("field-sizing", "content");

function hasFiles(event: DragEvent<HTMLElement>): boolean {
  return [...(event.dataTransfer?.types ?? [])].includes("Files");
}

function rejectionCleared(
  previous: MessageComposerSnapshot,
  next: MessageComposerSnapshot,
): boolean {
  if (previous.text !== next.text) return true;
  if (previous.sending && !next.sending && next.error === undefined)
    return true;
  return (
    next.status === "ready" &&
    !next.sending &&
    next.error === undefined &&
    next.text === "" &&
    next.attachments.length === 0 &&
    next.replyTo === undefined
  );
}

function AttachmentChip({
  attachment,
  configuration,
  slots,
  onRemove,
}: {
  readonly attachment: ComposerAttachment;
  readonly configuration: Configuration;
  readonly slots: Slots;
  readonly onRemove: (id: string) => void;
}) {
  const percent = Math.round(attachment.progress * 100);
  return (
    <li
      {...slots("attachmentChip", `pmfa-chip pmfa-chip-${attachment.status}`)}
      data-attachment-id={attachment.id}
    >
      <Icon name={attachment.status === "failed" ? "failed" : "file"} />
      <span className="pmfa-chip-body">
        <span className="pmfa-chip-name">{attachment.name}</span>
        {attachment.status === "uploading" && (
          <span
            className="pmfa-progress"
            role="progressbar"
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={percent}
            aria-label={text(configuration, "composer.uploading", {
              name: attachment.name,
            })}
          >
            <span style={{ width: `${percent}%` }} />
          </span>
        )}
        <span className="pmfa-chip-status" aria-live="polite">
          {attachment.status === "failed" ? (
            (attachment.error ?? text(configuration, "composer.uploadFailed"))
          ) : attachment.status === "uploading" ? (
            <span className="pmfa-sr">
              {text(configuration, "composer.uploading", {
                name: attachment.name,
              })}
            </span>
          ) : (
            formatFileSize(attachment.size, configuration.locale.code)
          )}
        </span>
      </span>
      <button
        type="button"
        className="pmfa-btn pmfa-btn-ghost pmfa-btn-icon"
        aria-label={text(configuration, "composer.removeNamedAttachment", {
          name: attachment.name,
        })}
        onClick={() => onRemove(attachment.id)}
      >
        <Icon name="close" />
      </button>
    </li>
  );
}

const EMOJI_COLUMNS = 8;

function gridColumns(cells: readonly HTMLElement[]): number {
  const first = cells[0];
  if (first === undefined) return EMOJI_COLUMNS;
  let columns = 0;
  for (const cell of cells) {
    if (cell.offsetTop !== first.offsetTop) break;
    columns += 1;
  }
  return columns > 0 && columns < cells.length ? columns : EMOJI_COLUMNS;
}

function narrowViewport(): boolean {
  return (
    typeof matchMedia === "function" && matchMedia("(max-width: 600px)").matches
  );
}

function EmojiPicker({
  anchor,
  configuration,
  slots,
  onPick,
  onClose,
}: {
  readonly anchor: { readonly current: HTMLElement | null };
  readonly configuration: Configuration;
  readonly slots: Slots;
  readonly onPick: (emoji: string) => void;
  readonly onClose: (restoreFocus: boolean) => void;
}) {
  const popover = useRef<HTMLDivElement>(null);
  const search = useRef<HTMLInputElement>(null);
  const grid = useRef<HTMLDivElement>(null);
  const id = useId();
  const [recent, setRecent] = useState<readonly string[]>(() =>
    readRecentEmoji(),
  );
  const [category, setCategory] = useState<EmojiPickerCategory>(() =>
    recent.length > 0 ? "recent" : "smileys",
  );
  const [query, setQuery] = useState("");
  const [active, setActive] = useState(0);
  const latestClose = useLatest(onClose);

  const entries = useMemo(
    () =>
      query.trim() !== ""
        ? searchEmoji(query)
        : category === "recent"
          ? recentEmojiEntries(recent)
          : emojiInCategory(category),
    [query, category, recent],
  );
  const activeIndex = Math.min(active, Math.max(0, entries.length - 1));

  useIsomorphicLayoutEffect(() => {
    const node = popover.current;
    if (node === null) return;
    const place = () => {
      const target = anchor.current;
      if (target === null) return;
      const rect = target.getBoundingClientRect();
      const width = node.offsetWidth || 360;
      const height = node.offsetHeight || 400;
      const direction =
        getComputedStyle(target).direction === "rtl" ? "rtl" : "ltr";
      const spot = placePopover(
        rect,
        { width, height },
        { width: window.innerWidth, height: window.innerHeight },
        { direction },
      );
      node.style.setProperty("--pmfa-pop-top", `${spot.top}px`);
      node.style.setProperty("--pmfa-pop-left", `${spot.left}px`);
      node.style.setProperty("--pmfa-pop-max", `${spot.maxHeight}px`);
      node.dataset.placement = spot.placement;
      node.removeAttribute("data-measuring");
    };
    place();
    window.addEventListener("resize", place);
    window.addEventListener("scroll", place, true);
    return () => {
      window.removeEventListener("resize", place);
      window.removeEventListener("scroll", place, true);
    };
  }, [anchor]);

  useEffect(() => {
    // On small screens the search field would raise the keyboard over the
    // sheet, so focus goes to the sheet itself.
    if (narrowViewport()) popover.current?.focus({ preventScroll: true });
    else search.current?.focus({ preventScroll: true });
    const onPointer = (event: PointerEvent) => {
      const path = event.composedPath();
      if (
        (popover.current !== null && path.includes(popover.current)) ||
        (anchor.current !== null && path.includes(anchor.current))
      )
        return;
      latestClose.current(false);
    };
    document.addEventListener("pointerdown", onPointer, true);
    return () => document.removeEventListener("pointerdown", onPointer, true);
  }, [anchor, latestClose]);

  const cells = () => [
    ...(grid.current?.querySelectorAll<HTMLElement>(".pmfa-emoji-cell") ?? []),
  ];
  const focusCell = (index: number) => {
    const list = cells();
    const next = Math.max(0, Math.min(index, list.length - 1));
    setActive(next);
    list[next]?.focus();
    list[next]?.scrollIntoView?.({ block: "nearest" });
  };
  const pick = (emoji: string) => {
    setRecent(recordRecentEmoji(emoji));
    onPick(emoji);
  };
  const selectTab = (next: EmojiPickerCategory) => {
    setCategory(next);
    setQuery("");
    setActive(0);
    if (grid.current !== null)
      grid.current.parentElement?.scrollTo?.({ top: 0 });
  };
  const heading =
    query.trim() !== ""
      ? text(configuration, "composer.emojiSearch")
      : text(configuration, `composer.emojiCategory.${category}`);
  return (
    <div
      ref={popover}
      {...slots("emojiPicker", "pmfa-popover pmfa-emoji")}
      role="dialog"
      aria-label={text(configuration, "composer.emojiPicker")}
      tabIndex={-1}
      data-measuring=""
      onKeyDown={(event) => {
        if (event.key !== "Escape" || event.nativeEvent.isComposing) return;
        event.preventDefault();
        event.stopPropagation();
        latestClose.current(true);
      }}
    >
      <div className="pmfa-emoji-search">
        <Icon name="search" />
        <input
          ref={search}
          type="search"
          className="pmfa-input"
          aria-label={text(configuration, "composer.emojiSearch")}
          placeholder={text(configuration, "composer.emojiSearch")}
          value={query}
          aria-controls={`${id}-panel`}
          onChange={(event) => {
            setQuery(event.currentTarget.value);
            setActive(0);
          }}
          onKeyDown={(event) => {
            if (event.key === "ArrowDown") {
              event.preventDefault();
              focusCell(0);
            } else if (event.key === "Enter" && entries[0] !== undefined) {
              event.preventDefault();
              pick(entries[0].emoji);
            }
          }}
        />
      </div>
      <div
        className="pmfa-emoji-tabs"
        role="tablist"
        aria-label={text(configuration, "composer.emojiCategories")}
        onKeyDown={(event) => {
          if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return;
          event.preventDefault();
          const rtl = getComputedStyle(event.currentTarget).direction === "rtl";
          const step = (event.key === "ArrowRight") !== rtl ? 1 : -1;
          const index = EMOJI_PICKER_CATEGORIES.indexOf(category);
          const next =
            EMOJI_PICKER_CATEGORIES[
              (index + step + EMOJI_PICKER_CATEGORIES.length) %
                EMOJI_PICKER_CATEGORIES.length
            ] ?? "smileys";
          selectTab(next);
          event.currentTarget
            .querySelector<HTMLElement>(`[data-category="${next}"]`)
            ?.focus();
        }}
      >
        {EMOJI_PICKER_CATEGORIES.map((name) => {
          const selected = query.trim() === "" && name === category;
          return (
            <button
              key={name}
              type="button"
              role="tab"
              className="pmfa-emoji-tab"
              data-category={name}
              id={`${id}-tab-${name}`}
              aria-selected={selected}
              aria-controls={`${id}-panel`}
              tabIndex={
                name === (query.trim() === "" ? category : "recent") ? 0 : -1
              }
              aria-label={text(configuration, `composer.emojiCategory.${name}`)}
              title={text(configuration, `composer.emojiCategory.${name}`)}
              onClick={() => selectTab(name)}
            >
              <span aria-hidden="true">{EMOJI_CATEGORY_ICONS[name]}</span>
            </button>
          );
        })}
      </div>
      <div
        className="pmfa-emoji-body"
        id={`${id}-panel`}
        role="tabpanel"
        aria-label={heading}
      >
        <p className="pmfa-emoji-heading" aria-hidden="true">
          {heading}
        </p>
        {entries.length === 0 ? (
          <p className="pmfa-emoji-empty">
            {text(
              configuration,
              query.trim() === ""
                ? "composer.emojiNoRecent"
                : "composer.emojiNoResults",
            )}
          </p>
        ) : (
          <div
            ref={grid}
            className="pmfa-emoji-grid"
            role="group"
            aria-label={heading}
            onKeyDown={(event) => {
              const list = cells();
              const index = list.indexOf(event.target as HTMLElement);
              if (index < 0) return;
              const columns = gridColumns(list);
              const rtl =
                getComputedStyle(event.currentTarget).direction === "rtl";
              const moves: Record<string, number> = {
                ArrowRight: rtl ? -1 : 1,
                ArrowLeft: rtl ? 1 : -1,
                ArrowDown: columns,
                ArrowUp: -columns,
                Home: -index,
                End: list.length - 1 - index,
              };
              const move = moves[event.key];
              if (move === undefined) return;
              event.preventDefault();
              if (event.key === "ArrowUp" && index < columns) {
                search.current?.focus();
                return;
              }
              focusCell(index + move);
            }}
          >
            {entries.map((entry, index) => (
              <button
                key={`${entry.emoji}-${index}`}
                type="button"
                className="pmfa-emoji-cell"
                tabIndex={index === activeIndex ? 0 : -1}
                aria-label={entry.name}
                title={entry.name}
                onFocus={() => setActive(index)}
                onClick={() => pick(entry.emoji)}
              >
                {entry.emoji}
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

const LEVEL_BARS = 28;

function RecordingBar({
  snapshot,
  configuration,
  slots,
  autoSend,
  onCancel,
  onStop,
}: {
  readonly snapshot: VoiceNoteRecorderSnapshot;
  readonly configuration: Configuration;
  readonly slots: Slots;
  readonly autoSend: boolean;
  readonly onCancel: () => void;
  readonly onStop: () => void;
}) {
  // A rolling history of input levels, newest last.
  const [history, setHistory] = useState<{
    readonly revision: number;
    readonly levels: readonly number[];
  }>({ revision: snapshot.revision, levels: [] });
  if (history.revision !== snapshot.revision) {
    setHistory({
      revision: snapshot.revision,
      levels: [...history.levels, snapshot.level].slice(-LEVEL_BARS),
    });
  }
  const levels = [
    ...Array.from<number>({
      length: LEVEL_BARS - history.levels.length,
    }).fill(0),
    ...history.levels,
  ];
  const stopLabel = text(
    configuration,
    autoSend ? "composer.sendVoiceNote" : "composer.stopRecording",
  );
  return (
    <div
      {...slots("recordingBar", "pmfa-recording")}
      role="group"
      aria-label={text(configuration, "composer.recording")}
    >
      <button
        type="button"
        className="pmfa-btn pmfa-btn-ghost pmfa-btn-icon pmfa-rec-cancel"
        aria-label={text(configuration, "composer.cancelRecording")}
        title={text(configuration, "composer.cancelRecording")}
        onClick={onCancel}
      >
        <Icon name="trash" />
      </button>
      <div className="pmfa-recording-status">
        <span className="pmfa-rec-dot" aria-hidden="true" />
        <span className="pmfa-rec-time" role="timer">
          {formatElapsed(snapshot.elapsed)}
        </span>
        <span
          className="pmfa-rec-level"
          role="meter"
          aria-label={text(configuration, "composer.recordingLevel")}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={Math.round(snapshot.level * 100)}
        >
          {levels.map((level, index) => (
            <span
              key={index}
              style={
                {
                  "--pmfa-level": String(Math.max(0.12, level)),
                } as CSSProperties
              }
            />
          ))}
        </span>
      </div>
      <button
        type="button"
        className="pmfa-btn pmfa-btn-primary pmfa-btn-icon pmfa-send"
        aria-label={stopLabel}
        title={stopLabel}
        disabled={snapshot.status !== "recording"}
        onClick={onStop}
      >
        <Icon name={autoSend ? "sendArrow" : "sent"} />
      </button>
    </div>
  );
}

const voiceErrorKeys = {
  "permission-denied": "composer.microphoneDenied",
  unavailable: "composer.microphoneUnavailable",
  failed: "composer.recordingFailed",
} as const satisfies Record<VoiceNoteError, MessageKey>;

const isVoiceSupported = () => VoiceNoteRecorder.isSupported();
const notSupported = () => false;

export interface ComposeBoxProps extends ControllerProps<MessageComposerController> {
  readonly onSent?: () => void;
  readonly className?: string;
  readonly classNames?: SlotClassNames;
  /**
   * Offer file attachments: the attach button, drop and paste. Defaults to
   * `true`. Turn it off when the composer's actions have no upload adapter.
   */
  readonly attachments?: boolean;
  /** File types the attach button offers, as for `<input accept>`. */
  readonly accept?: string;
  /** Allow picking several files at once. Defaults to `true`. */
  readonly multiple?: boolean;
  /** Resolves the reply banner's quoted message. */
  readonly conversation?: ConversationController;
  /** Resolves the reply banner's quoted message without a controller. */
  readonly messages?: readonly ConversationMessage[];
  /** Replaces the locale's `composer.placeholder`. */
  readonly placeholder?: string;
  /** Rendered in the toolbar before the built-in buttons. */
  readonly startActions?: ReactNode;
  /** Rendered after the message field, before the send or mic button. */
  readonly endActions?: ReactNode;
  /** Show the emoji picker button. Defaults to `true`. */
  readonly emoji?: boolean;
  /**
   * Show the voice note button. Defaults to `true` where the browser has
   * `MediaRecorder` and `getUserMedia`.
   */
  readonly voiceNotes?: boolean;
  /** Send a voice note as soon as it finishes uploading. Defaults to `true`. */
  readonly voiceNoteAutoSend?: boolean;
  /** Options for the "/" quick reply menu. */
  readonly quickReplies?: readonly QuickReplyOption[];
  /** Called after a quick reply's text is inserted. */
  readonly onQuickReply?: (option: QuickReplyOption) => void;
  /** Rows the message field grows to before it scrolls. Defaults to 8. */
  readonly maxRows?: number;
}
export function ComposeBox({
  controller,
  createController,
  onSent,
  className,
  classNames,
  attachments = true,
  accept,
  multiple = true,
  conversation,
  messages,
  placeholder,
  startActions,
  endActions,
  emoji = true,
  voiceNotes,
  voiceNoteAutoSend = true,
  quickReplies,
  onQuickReply,
  maxRows = 8,
}: ComposeBoxProps) {
  const resolved = useResolvedController(controller, createController);
  const snapshot: MessageComposerSnapshot = useController(resolved);
  const conversationSnapshot = useOptionalController(conversation);
  const configuration = usePolymorfa();
  const slots = useSlots(classNames);
  const root = useShell(slots, "composer", "pmfa-composer", className);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const emojiButtonRef = useRef<HTMLButtonElement>(null);
  const micRef = useRef<HTMLButtonElement>(null);
  const pendingCaret = useRef<number | undefined>(undefined);
  const menuId = useId();
  const [dragging, setDragging] = useState(false);
  const [rejection, setRejection] = useState<string | undefined>(undefined);
  const [emojiOpen, setEmojiOpen] = useState(false);
  const [caret, setCaret] = useState(0);
  const [dismissedText, setDismissedText] = useState<string | undefined>(
    undefined,
  );
  const [activeOption, setActiveOption] = useState(0);
  const [announcement, setAnnouncement] = useState("");
  // A rejected file's message clears once the text changes, a send
  // succeeds, or the composer resets.
  const [previousSnapshot, setPreviousSnapshot] = useState(snapshot);
  if (previousSnapshot !== snapshot) {
    setPreviousSnapshot(snapshot);
    if (rejection !== undefined && rejectionCleared(previousSnapshot, snapshot))
      setRejection(undefined);
  }

  // Voice notes
  const voiceSupported = useSyncExternalStore(
    NO_SUBSCRIPTION,
    isVoiceSupported,
    notSupported,
  );
  const voiceEnabled = (voiceNotes ?? true) && voiceSupported;
  const recorderRef = useRef<VoiceNoteRecorder | undefined>(undefined);
  const [recorder, setRecorder] = useState<VoiceNoteRecorder | undefined>(
    undefined,
  );
  const recording = useOptionalController(recorder);
  useEffect(
    () => () => {
      recorderRef.current?.dispose();
      recorderRef.current = undefined;
    },
    [],
  );
  const recorderActive =
    recording !== undefined &&
    (recording.status === "recording" || recording.status === "stopping");
  const voiceError =
    recording?.status === "error" && recording.error !== undefined
      ? text(configuration, voiceErrorKeys[recording.error])
      : undefined;

  useIsomorphicLayoutEffect(() => {
    const input = inputRef.current;
    if (input === null) return;
    if (!supportsFieldSizing) {
      input.style.height = "auto";
      input.style.height = `${input.scrollHeight + 2}px`;
    }
    const target = pendingCaret.current;
    if (target !== undefined && input.value === snapshot.text) {
      pendingCaret.current = undefined;
      input.setSelectionRange(target, target);
    }
  }, [snapshot.text]);

  const canSend =
    !snapshot.sending &&
    (snapshot.text.trim() !== "" ||
      snapshot.attachments.some(({ status }) => status === "ready"));
  const showMic =
    voiceEnabled &&
    !snapshot.sending &&
    snapshot.text.trim() === "" &&
    !snapshot.attachments.some(({ status }) => status === "ready");
  const submit = () => {
    if (!canSend) return;
    void resolved.submit().then(
      () => {
        // A failed send resolves with the error in the snapshot.
        if (resolved.getSnapshot().status !== "error") onSent?.();
      },
      () => undefined,
    );
  };
  const addFiles = (files: FileList | readonly File[] | null | undefined) => {
    if (files === null || files === undefined) return;
    setRejection(undefined);
    for (const file of [...files])
      resolved
        .addAttachment(attachmentFromFile(file))
        .catch((cause: unknown) => setRejection(errorText(cause)));
  };
  const remove = useCallback(
    (id: string) => resolved.cancelAttachment(id),
    [resolved],
  );

  const replaceText = (value: string, nextCaret: number) => {
    pendingCaret.current = nextCaret;
    setRejection(undefined);
    setCaret(nextCaret);
    resolved.setText(value);
  };
  const insertEmoji = (value: string) => {
    const input = inputRef.current;
    const current = resolved.getSnapshot().text;
    const start = input?.selectionStart ?? current.length;
    const end = input?.selectionEnd ?? start;
    const edit = insertText(current, value, start, end);
    replaceText(edit.text, edit.caret);
  };
  const closeEmoji = useCallback((restoreFocus: boolean) => {
    setEmojiOpen(false);
    if (restoreFocus) emojiButtonRef.current?.focus();
  }, []);

  // Quick replies
  const quickMatch =
    quickReplies !== undefined && quickReplies.length > 0 && !recorderActive
      ? findQuickReplyQuery(
          snapshot.text,
          Math.min(caret, snapshot.text.length),
        )
      : undefined;
  const options =
    quickMatch === undefined || quickReplies === undefined
      ? []
      : filterQuickReplies(quickReplies, quickMatch.query);
  const menuOpen = options.length > 0 && dismissedText !== snapshot.text;
  const [previousQuery, setPreviousQuery] = useState(quickMatch?.query);
  if (previousQuery !== quickMatch?.query) {
    setPreviousQuery(quickMatch?.query);
    setActiveOption(0);
  }
  const activeIndex = Math.min(activeOption, Math.max(0, options.length - 1));
  const chooseOption = (option: QuickReplyOption) => {
    if (quickMatch === undefined) return;
    const edit = applyQuickReply(snapshot.text, quickMatch, option);
    replaceText(edit.text, edit.caret);
    onQuickReply?.(option);
    inputRef.current?.focus();
  };

  const startRecording = () => {
    let active = recorderRef.current;
    if (active === undefined) {
      active = new VoiceNoteRecorder();
      recorderRef.current = active;
      setRecorder(active);
    }
    setEmojiOpen(false);
    const current = active;
    void current.start().then(() => {
      if (current.getSnapshot().status === "recording")
        setAnnouncement(text(configuration, "composer.recording"));
    });
  };
  const cancelRecording = () => {
    recorderRef.current?.cancel();
    setAnnouncement(text(configuration, "composer.recordingCancelled"));
    requestAnimationFrameSafe(() => micRef.current?.focus());
  };
  const stopRecording = () => {
    const active = recorderRef.current;
    if (active === undefined) return;
    void active.stop().then(async (file) => {
      setAnnouncement(text(configuration, "composer.recordingStopped"));
      requestAnimationFrameSafe(() => inputRef.current?.focus());
      if (file === undefined) return;
      const attachment = localAttachmentFromFile(file);
      try {
        await resolved.addAttachment(attachment);
      } catch (cause) {
        setRejection(errorText(cause));
        return;
      }
      if (!voiceNoteAutoSend) return;
      const after = resolved.getSnapshot();
      const added = after.attachments.find(({ id }) => id === attachment.id);
      if (
        added?.status !== "ready" ||
        after.sending ||
        after.attachments.some(({ status }) => status !== "ready")
      )
        return;
      await resolved.submit().then(
        () => {
          if (resolved.getSnapshot().status !== "error") onSent?.();
        },
        () => undefined,
      );
    });
  };

  const pool = messages ?? conversationSnapshot?.messages;
  const replied =
    snapshot.replyTo === undefined
      ? undefined
      : pool?.find(({ id }) => id === snapshot.replyTo);
  const error = snapshot.error ?? rejection ?? voiceError;
  const inputSlot = slots("composerInput", "pmfa-input");
  const combobox =
    quickReplies !== undefined && quickReplies.length > 0
      ? {
          role: "combobox",
          "aria-autocomplete": "list" as const,
          "aria-expanded": menuOpen,
          "aria-controls": menuId,
          ...(menuOpen
            ? { "aria-activedescendant": `${menuId}-${activeIndex}` }
            : {}),
        }
      : {};

  return (
    <form
      {...root}
      data-pmfa="compose-box"
      {...(dragging ? { "data-dragging": "" } : {})}
      {...(recorderActive ? { "data-recording": "" } : {})}
      onSubmit={(event) => {
        event.preventDefault();
        submit();
      }}
      onDragEnter={(event) => {
        if (!attachments || !hasFiles(event)) return;
        event.preventDefault();
        setDragging(true);
      }}
      onDragOver={(event) => {
        if (!attachments || !hasFiles(event)) return;
        event.preventDefault();
        if (event.dataTransfer) event.dataTransfer.dropEffect = "copy";
      }}
      onDragLeave={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget as Node | null))
          setDragging(false);
      }}
      onDrop={(event) => {
        if (!attachments || !hasFiles(event)) return;
        event.preventDefault();
        setDragging(false);
        addFiles(event.dataTransfer.files);
      }}
    >
      <div className="pmfa-drop-hint" aria-hidden="true">
        {text(configuration, "composer.dropHint")}
      </div>
      <span className="pmfa-sr" aria-live="polite">
        {announcement}
      </span>
      {menuOpen && (
        <div {...slots("quickReplyMenu", "pmfa-qr")}>
          <div className="pmfa-qr-title" aria-hidden="true">
            {text(configuration, "composer.quickReplies")}
          </div>
          <ul
            id={menuId}
            role="listbox"
            aria-label={text(configuration, "composer.quickReplies")}
          >
            {options.map((option, index) => (
              <li
                key={option.id}
                id={`${menuId}-${index}`}
                role="option"
                className="pmfa-qr-option"
                aria-selected={index === activeIndex}
                onMouseDown={(event) => event.preventDefault()}
                onMouseMove={() => {
                  if (index !== activeIndex) setActiveOption(index);
                }}
                onClick={() => chooseOption(option)}
              >
                <span className="pmfa-qr-head">
                  <span className="pmfa-qr-shortcut">
                    {quickReplyLabel(option)}
                  </span>
                  {option.description !== undefined && (
                    <span className="pmfa-qr-description">
                      {option.description}
                    </span>
                  )}
                </span>
                <span className="pmfa-qr-text">{option.text}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
      {snapshot.replyTo !== undefined && (
        <div {...slots("replyBanner", "pmfa-reply-banner")}>
          <span className="pmfa-reply-body">
            <span className="pmfa-reply-name">
              {text(configuration, "composer.replyingTo", {
                name: authorName(configuration, replied),
              })}
            </span>
            {replied !== undefined && (
              <span className="pmfa-reply-text">
                {snippet(configuration, replied)}
              </span>
            )}
          </span>
          <button
            type="button"
            className="pmfa-btn pmfa-btn-ghost pmfa-btn-icon"
            aria-label={text(configuration, "composer.cancelReply")}
            onClick={() => {
              resolved.setReplyTo();
              inputRef.current?.focus();
            }}
          >
            <Icon name="close" />
          </button>
        </div>
      )}
      {snapshot.attachments.length > 0 && (
        <ul
          className="pmfa-chips"
          aria-label={text(configuration, "composer.attachments")}
        >
          {snapshot.attachments.map((attachment) => (
            <AttachmentChip
              key={attachment.id}
              attachment={attachment}
              configuration={configuration}
              slots={slots}
              onRemove={remove}
            />
          ))}
        </ul>
      )}
      {recorderActive && recording !== undefined && (
        <RecordingBar
          snapshot={recording}
          configuration={configuration}
          slots={slots}
          autoSend={voiceNoteAutoSend}
          onCancel={cancelRecording}
          onStop={stopRecording}
        />
      )}
      <div
        {...slots("composerToolbar", "pmfa-composer-row")}
        hidden={recorderActive}
      >
        {startActions !== undefined && startActions !== null && (
          <div className="pmfa-composer-actions pmfa-composer-start">
            {startActions}
          </div>
        )}
        {emoji && (
          <button
            ref={emojiButtonRef}
            type="button"
            {...slots(
              "emojiButton",
              "pmfa-btn pmfa-btn-ghost pmfa-btn-icon pmfa-emoji-button",
            )}
            aria-label={text(configuration, "composer.emoji")}
            title={text(configuration, "composer.emoji")}
            aria-haspopup="dialog"
            aria-expanded={emojiOpen}
            onClick={() => setEmojiOpen((open) => !open)}
          >
            <Icon name="smiley" />
          </button>
        )}
        {attachments && (
          <>
            <button
              type="button"
              {...slots(
                "composerAttach",
                "pmfa-btn pmfa-btn-ghost pmfa-btn-icon",
              )}
              aria-label={text(configuration, "composer.attach")}
              title={text(configuration, "composer.attach")}
              onClick={() => fileRef.current?.click()}
            >
              <Icon name="attach" />
            </button>
            <input
              ref={fileRef}
              type="file"
              className="pmfa-sr"
              tabIndex={-1}
              aria-hidden="true"
              accept={accept}
              multiple={multiple}
              onChange={(event) => {
                addFiles(event.currentTarget.files);
                event.currentTarget.value = "";
              }}
            />
          </>
        )}
        <textarea
          ref={inputRef}
          {...inputSlot}
          style={
            {
              ...inputSlot.style,
              "--pmfa-composer-max-rows": String(Math.max(1, maxRows)),
            } as CSSProperties
          }
          {...combobox}
          aria-label={text(configuration, "composer.label")}
          rows={1}
          placeholder={
            placeholder ?? text(configuration, "composer.placeholder")
          }
          value={snapshot.text}
          onChange={(event) => {
            setRejection(undefined);
            setCaret(event.currentTarget.selectionStart);
            resolved.setText(event.currentTarget.value);
          }}
          onSelect={(event) => setCaret(event.currentTarget.selectionStart)}
          onPaste={(event: ClipboardEvent<HTMLTextAreaElement>) => {
            const files = event.clipboardData?.files;
            if (!attachments || files === undefined || files.length === 0)
              return;
            event.preventDefault();
            addFiles(files);
          }}
          onKeyDown={(event) => {
            if (event.nativeEvent.isComposing) return;
            if (menuOpen) {
              const option = options[activeIndex];
              if (event.key === "ArrowDown" || event.key === "ArrowUp") {
                event.preventDefault();
                const step = event.key === "ArrowDown" ? 1 : -1;
                setActiveOption(
                  (activeIndex + step + options.length) % options.length,
                );
                return;
              }
              if (
                (event.key === "Enter" && !event.shiftKey) ||
                event.key === "Tab"
              ) {
                if (option === undefined) return;
                event.preventDefault();
                chooseOption(option);
                return;
              }
              if (event.key === "Escape") {
                event.preventDefault();
                event.stopPropagation();
                setDismissedText(snapshot.text);
                return;
              }
            }
            if (event.key === "Enter" && !event.shiftKey) {
              event.preventDefault();
              submit();
            }
          }}
        />
        {endActions !== undefined && endActions !== null && (
          <div className="pmfa-composer-actions pmfa-composer-end">
            {endActions}
          </div>
        )}
        {showMic ? (
          <button
            ref={micRef}
            type="button"
            {...slots(
              "voiceButton",
              "pmfa-btn pmfa-btn-ghost pmfa-btn-icon pmfa-voice",
            )}
            aria-label={text(configuration, "composer.voiceNote")}
            title={text(configuration, "composer.voiceNote")}
            aria-busy={recording?.status === "requesting"}
            disabled={recording?.status === "requesting"}
            onClick={startRecording}
          >
            <Icon name="mic" />
          </button>
        ) : (
          <button
            type="submit"
            {...slots(
              "composerSend",
              "pmfa-btn pmfa-btn-primary pmfa-btn-icon pmfa-send",
            )}
            aria-label={
              snapshot.sending
                ? text(configuration, "composer.sending")
                : text(configuration, "composer.send")
            }
            title={text(configuration, "composer.send")}
            disabled={!canSend}
          >
            <Icon name="sendArrow" />
          </button>
        )}
      </div>
      {emojiOpen && emoji && !recorderActive && (
        <EmojiPicker
          anchor={emojiButtonRef}
          configuration={configuration}
          slots={slots}
          onPick={insertEmoji}
          onClose={closeEmoji}
        />
      )}
      {error !== undefined && (
        <p {...slots("error", "pmfa-error")} role="alert">
          {error}
        </p>
      )}
    </form>
  );
}

function requestAnimationFrameSafe(callback: () => void): void {
  if (typeof requestAnimationFrame === "function")
    requestAnimationFrame(callback);
  else setTimeout(callback, 0);
}

// ── Drawer ────────────────────────────────────────────────────────────

export interface ChatDrawerProps extends MessageListProps {
  readonly open?: boolean;
  readonly onClose?: () => void;
  /** Custom footer; takes precedence over the built-in composer. */
  readonly composer?: ReactNode;
  readonly title?: string;
  /** Alias of `controller`. */
  readonly conversation?: ConversationController;
  /** Renders the built-in composer and wires message Reply to it. */
  readonly composerController?: MessageComposerController;
  readonly createComposerController?: () => MessageComposerController;
  /**
   * Move focus into the drawer when it first mounts open. Defaults to
   * `false`; focus always moves when `open` changes to `true`.
   */
  readonly autoFocus?: boolean;
  /** Props for the built-in composer. */
  readonly composerProps?: Omit<
    ComposeBoxProps,
    "controller" | "createController" | "conversation"
  >;
}

function focusFirst(root: HTMLElement | null): void {
  if (root === null) return;
  const target =
    root.querySelector<HTMLElement>("textarea") ??
    root.querySelector<HTMLElement>(".pmfa-drawer-header button") ??
    root;
  target.focus({ preventScroll: true });
}

export function ChatDrawer({
  open = true,
  onClose,
  composer,
  title,
  className,
  classNames,
  conversation,
  controller,
  createController,
  composerController,
  createComposerController,
  composerProps,
  onReply,
  autoFocus = false,
  ...viewProps
}: ChatDrawerProps) {
  const configuration = usePolymorfa();
  const slots = useSlots(classNames);
  const root = useShell(slots, "drawer", "pmfa-drawer", className);
  const panel = useRef<HTMLElement>(null);
  const titleId = useId();
  const resolved = useResolvedController(
    controller ?? conversation,
    createController,
  );
  const composing = useOwnedController(
    composerController,
    createComposerController,
  );
  const latestClose = useLatest(onClose);

  const onKeyDown = (event: KeyboardEvent<HTMLElement>) => {
    if (
      event.key !== "Escape" ||
      event.defaultPrevented ||
      event.nativeEvent.isComposing ||
      latestClose.current === undefined
    )
      return;
    event.preventDefault();
    latestClose.current();
  };

  // Focus moves when `open` becomes true after mount, or on mount with
  // `autoFocus`. Closing returns focus to where it was.
  const lastOpen = useRef<boolean | undefined>(undefined);
  const moveFocus = useRef(false);
  const latestAutoFocus = useLatest(autoFocus);
  useEffect(() => {
    // An effect re-run with the same `open` (StrictMode, `<Activity>`) keeps
    // the earlier decision.
    if (lastOpen.current !== open) {
      moveFocus.current =
        open &&
        (lastOpen.current === false ||
          (lastOpen.current === undefined && latestAutoFocus.current));
      lastOpen.current = open;
    }
    if (!moveFocus.current || typeof document === "undefined") return;
    const previous = document.activeElement;
    focusFirst(panel.current);
    return () => {
      if (previous instanceof HTMLElement && previous.isConnected)
        previous.focus({ preventScroll: true });
    };
  }, [open, latestAutoFocus]);

  const reply = useMemo(
    () =>
      onReply === undefined && composing === undefined
        ? undefined
        : (message: ConversationMessage) => {
            onReply?.(message);
            if (composing !== undefined) {
              composing.setReplyTo(message.id);
              panel.current?.querySelector("textarea")?.focus();
            }
          },
    [onReply, composing],
  );

  if (!open) return null;
  const heading = title ?? text(configuration, "chat.title");
  const footer =
    composer ??
    (composing === undefined ? undefined : (
      <ComposeBox
        {...composerProps}
        controller={composing}
        conversation={resolved}
      />
    ));
  return (
    <aside
      {...root}
      ref={panel}
      tabIndex={-1}
      onKeyDown={onKeyDown}
      data-pmfa="chat-drawer"
      role="dialog"
      aria-modal="false"
      aria-labelledby={titleId}
    >
      <header {...slots("drawerHeader", "pmfa-drawer-header")}>
        <h2 {...slots("drawerTitle", "pmfa-drawer-title")} id={titleId}>
          {heading}
        </h2>
        {onClose !== undefined && (
          <button
            type="button"
            {...slots("drawerClose", "pmfa-btn pmfa-btn-ghost pmfa-btn-icon")}
            aria-label={text(configuration, "common.close")}
            onClick={onClose}
          >
            <Icon name="close" />
          </button>
        )}
      </header>
      <ConversationLog
        {...viewProps}
        {...(reply === undefined ? {} : { onReply: reply })}
        controller={resolved}
        rootProps={slots("messageList", "pmfa-list")}
        slots={slots}
      />
      <DrawerError controller={resolved} slots={slots} />
      {footer !== undefined && (
        <div className="pmfa-drawer-footer">{footer}</div>
      )}
    </aside>
  );
}

function DrawerError({
  controller,
  slots,
}: {
  readonly controller: ConversationController;
  readonly slots: Slots;
}) {
  const snapshot = useController(controller);
  const configuration = usePolymorfa();
  if (snapshot.status !== "error") return null;
  return (
    <p {...slots("error", "pmfa-error")} role="alert">
      {snapshot.error ?? text(configuration, "chat.loadError")}
    </p>
  );
}

// ── Template builder ──────────────────────────────────────────────────

function Field({
  label,
  slots,
  children,
}: {
  readonly label: string;
  readonly slots: Slots;
  readonly children: ReactNode;
}) {
  return (
    <label {...slots("field", "pmfa-field")}>
      <span {...slots("label", "pmfa-label")}>{label}</span>
      {children}
    </label>
  );
}

export interface TemplateBuilderProps extends ControllerProps<TemplateBuilderController> {
  readonly renderPreview?: (preview: RenderedTemplate) => ReactNode;
  readonly className?: string;
  readonly classNames?: SlotClassNames;
}
export function TemplateBuilder({
  controller,
  createController,
  renderPreview,
  className,
  classNames,
}: TemplateBuilderProps) {
  const resolved = useResolvedController(controller, createController);
  const snapshot = useController(resolved);
  const configuration = usePolymorfa();
  const slots = useSlots(classNames);
  const root = useShell(slots, "templateBuilder", "pmfa-tb", className);
  const definition = snapshot.draft?.definition;
  const busy =
    snapshot.status === "saving" ||
    snapshot.status === "previewing" ||
    snapshot.status === "submitting";
  const unsaved = snapshot.templateId === undefined || snapshot.dirty;
  const input = slots("input", "pmfa-input");
  return (
    <section {...root} data-pmfa="template-builder">
      <h2 className="pmfa-tb-title">
        {text(configuration, "templates.title")}
      </h2>
      <div className="pmfa-tb-grid">
        <div className="pmfa-tb-form">
          <Field label={text(configuration, "templates.name")} slots={slots}>
            <input
              {...input}
              data-field="name"
              value={snapshot.draft?.name ?? ""}
              onChange={(event) => resolved.setName(event.currentTarget.value)}
            />
          </Field>
          {definition?.header?.format === "text" && (
            <Field
              label={text(configuration, "templates.header")}
              slots={slots}
            >
              <input
                {...input}
                data-field="header"
                value={definition.header.text}
                onChange={(event) =>
                  resolved.updateDefinition({
                    header: { format: "text", text: event.currentTarget.value },
                  })
                }
              />
            </Field>
          )}
          <Field label={text(configuration, "templates.body")} slots={slots}>
            <textarea
              {...input}
              rows={4}
              data-field="body"
              value={definition?.body ?? ""}
              onChange={(event) => resolved.setBody(event.currentTarget.value)}
            />
          </Field>
          {definition?.footer !== undefined && (
            <Field
              label={text(configuration, "templates.footer")}
              slots={slots}
            >
              <input
                {...input}
                data-field="footer"
                value={definition.footer}
                onChange={(event) =>
                  resolved.updateDefinition({
                    footer: event.currentTarget.value,
                  })
                }
              />
            </Field>
          )}
          {(definition?.variables.length ?? 0) > 0 && (
            <fieldset {...slots("field", "pmfa-field")}>
              <legend>{text(configuration, "templates.variables")}</legend>
              <div className="pmfa-pairs">
                {definition?.variables.map((variable) => (
                  <label key={variable.name} className="pmfa-pair">
                    <span>{`{{${variable.name}}}`}</span>
                    <input
                      {...input}
                      aria-label={text(
                        configuration,
                        "templates.variableExample",
                        {
                          name: variable.name,
                        },
                      )}
                      value={variable.example}
                      onChange={(event) =>
                        resolved.setVariableExample(
                          variable.name,
                          event.currentTarget.value,
                        )
                      }
                    />
                  </label>
                ))}
              </div>
            </fieldset>
          )}
          {(definition?.buttons?.length ?? 0) > 0 && (
            <fieldset {...slots("field", "pmfa-field")}>
              <legend>{text(configuration, "templates.buttons")}</legend>
              <div className="pmfa-pairs">
                {definition?.buttons?.map((templateButton, index) => (
                  <label
                    key={`${templateButton.type}-${index}`}
                    className="pmfa-pair"
                  >
                    <span>{templateButton.type.replace("_", " ")}</span>
                    <input
                      {...input}
                      aria-label={text(configuration, "templates.buttonText", {
                        index: String(index + 1),
                      })}
                      value={templateButton.text ?? ""}
                      onChange={(event) => {
                        const buttons = [...(definition.buttons ?? [])];
                        const current = buttons[index];
                        if (current !== undefined)
                          buttons[index] = {
                            ...current,
                            text: event.currentTarget.value,
                          };
                        resolved.updateDefinition({ buttons });
                      }}
                    />
                  </label>
                ))}
              </div>
            </fieldset>
          )}
          {(definition?.carousel?.cards.length ?? 0) > 0 && (
            <fieldset {...slots("field", "pmfa-field")}>
              <legend>{text(configuration, "templates.cards")}</legend>
              {definition?.carousel?.cards.map((card, index) => (
                <textarea
                  key={`card-${index}`}
                  {...input}
                  aria-label={text(configuration, "templates.cardBody", {
                    index: String(index + 1),
                  })}
                  value={card.body}
                  onChange={(event) => {
                    const cards = [...(definition.carousel?.cards ?? [])];
                    const current = cards[index];
                    if (current !== undefined)
                      cards[index] = {
                        ...current,
                        body: event.currentTarget.value,
                      };
                    resolved.updateDefinition({ carousel: { cards } });
                  }}
                />
              ))}
            </fieldset>
          )}
          {snapshot.localIssues.map((issue) => (
            <p
              key={`${issue.code}-${issue.path ?? ""}`}
              {...slots("error", "pmfa-error")}
              role="alert"
            >
              {issue.message}
            </p>
          ))}
          {snapshot.error !== undefined && (
            <p {...slots("error", "pmfa-error")} role="alert">
              {snapshot.error.message}
            </p>
          )}
          <div {...slots("actions", "pmfa-actions")}>
            <button
              type="button"
              {...slots("primaryButton", "pmfa-btn pmfa-btn-primary")}
              disabled={
                busy ||
                snapshot.draft === undefined ||
                snapshot.localIssues.length > 0
              }
              onClick={() => void resolved.save()}
            >
              {text(configuration, "templates.save")}
            </button>
            <button
              type="button"
              {...slots("button", "pmfa-btn")}
              disabled={busy || unsaved}
              onClick={() => void resolved.refreshPreview()}
            >
              {text(configuration, "templates.preview")}
            </button>
            <button
              type="button"
              {...slots("button", "pmfa-btn")}
              disabled={busy || unsaved}
              onClick={() => void resolved.submitToMeta()}
            >
              {text(configuration, "templates.submit")}
            </button>
          </div>
        </div>
        <div {...slots("preview", "pmfa-tb-aside")}>
          {snapshot.preview ? (
            (renderPreview?.(snapshot.preview.rendered) ?? (
              <TemplatePreviewOutput preview={snapshot.preview.rendered} />
            ))
          ) : (
            <p className="pmfa-hint">
              {text(configuration, "templates.previewHint")}
            </p>
          )}
        </div>
      </div>
    </section>
  );
}

function TemplatePreviewOutput({
  preview,
}: {
  readonly preview: RenderedTemplate;
}) {
  return (
    <output className="pmfa-preview">
      <div className="pmfa-preview-bubble">
        {preview.header?.text && (
          <strong className="pmfa-preview-header">{preview.header.text}</strong>
        )}
        <p className="pmfa-preview-body">{preview.body}</p>
        {preview.footer && (
          <small className="pmfa-preview-footer">{preview.footer}</small>
        )}
      </div>
      {preview.buttons.map((templateButton, index) => (
        <span
          key={`${templateButton.type}-${index}`}
          className="pmfa-preview-button"
        >
          {templateButton.text}
        </span>
      ))}
      {preview.cards.length > 0 && (
        <div className="pmfa-preview-cards">
          {preview.cards.map((card, index) => (
            <article key={`card-${index}`} className="pmfa-preview-card">
              <p className="pmfa-preview-body">{card.body}</p>
              {card.buttons.map((templateButton, buttonIndex) => (
                <span
                  key={`${templateButton.type}-${buttonIndex}`}
                  className="pmfa-preview-button"
                >
                  {templateButton.text}
                </span>
              ))}
            </article>
          ))}
        </div>
      )}
    </output>
  );
}
