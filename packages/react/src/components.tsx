import type {
  ConversationController,
  ConversationMessage,
  ConversationSnapshot,
  MessageComposerController,
  RenderedTemplate,
  TemplateBuilderController,
} from "@polymorfa/browser";
import {
  ENGLISH_MESSAGES,
  appearanceToCssVariables,
  injectComponentStyles,
  themeClassName,
  type MessageKey,
} from "@polymorfa/ui";
import {
  useEffect,
  useLayoutEffect,
  useRef,
  type CSSProperties,
  type ReactNode,
} from "react";
import { usePolymorfa } from "./context.js";
import { useController, useResolvedController } from "./hooks.js";

type ControllerProps<T> = {
  readonly controller?: T;
  readonly createController?: () => T;
};
type Configuration = ReturnType<typeof usePolymorfa>;

function useShell(extra: string): {
  dir: "ltr" | "rtl";
  className: string;
  style: CSSProperties;
} {
  const configuration = usePolymorfa();
  useEffect(() => injectComponentStyles(), []);
  return shell(configuration, extra);
}
function shell(
  configuration: Configuration,
  extra: string,
): { dir: "ltr" | "rtl"; className: string; style: CSSProperties } {
  const { appearance } = configuration;
  return {
    dir:
      appearance.layout.direction === "auto"
        ? configuration.locale.direction
        : appearance.layout.direction,
    className: `${themeClassName(appearance.theme)} ${extra}`,
    style: {
      ...appearanceToCssVariables(appearance),
      "--pmfa-drawer-width": appearance.layout.drawerWidth,
    } as CSSProperties,
  };
}
function text(
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

/** Oldest first, whatever order the controller keeps. */
function chronological(
  messages: readonly ConversationMessage[],
): readonly ConversationMessage[] {
  return [...messages].sort(byCreatedAt);
}

function MessageItem({
  message,
  configuration,
  children,
}: {
  readonly message: ConversationMessage;
  readonly configuration: Configuration;
  readonly children: ReactNode;
}) {
  const date = new Date(message.createdAt);
  const time = Number.isNaN(date.getTime())
    ? undefined
    : date.toLocaleTimeString(configuration.locale.code, {
        hour: "numeric",
        minute: "2-digit",
      });
  const status =
    message.status === "failed"
      ? text(configuration, "chat.failed")
      : message.status === "pending"
        ? text(configuration, "chat.sending")
        : undefined;
  return (
    <li
      className={`pmfa-msg pmfa-msg-${message.direction === "outbound" ? "out" : "in"} pmfa-msg-${message.status}`}
      data-message-id={message.id}
    >
      <div className="pmfa-bubble">{children}</div>
      <span className="pmfa-meta">
        {time !== undefined && (
          <time dateTime={date.toISOString()}>{time}</time>
        )}
        {status !== undefined && `${time === undefined ? "" : " · "}${status}`}
      </span>
      {message.error !== undefined && (
        <span className="pmfa-meta" role="alert">
          {message.error}
        </span>
      )}
    </li>
  );
}

function MessageItems({
  snapshot,
  onLoadMore,
  renderMessage,
  configuration,
}: {
  readonly snapshot: ConversationSnapshot;
  readonly onLoadMore: () => void;
  readonly renderMessage?:
    ((message: ConversationMessage) => ReactNode) | undefined;
  readonly configuration: Configuration;
}) {
  return (
    <>
      {snapshot.hasMore && (
        <li className="pmfa-loadmore">
          <button type="button" className="pmfa-btn" onClick={onLoadMore}>
            {text(configuration, "chat.loadMore")}
          </button>
        </li>
      )}
      {snapshot.messages.length === 0 ? (
        <li className="pmfa-empty">{text(configuration, "chat.empty")}</li>
      ) : (
        chronological(snapshot.messages).map((message) => (
          <MessageItem
            key={message.id}
            message={message}
            configuration={configuration}
          >
            {renderMessage?.(message) ?? message.text}
          </MessageItem>
        ))
      )}
    </>
  );
}

/** Keeps the newest message in view while the reader is already at the end. */
function useStickToBottom(dependency: unknown) {
  const ref = useRef<HTMLOListElement>(null);
  const pinned = useRef(true);
  useLayoutEffect(() => {
    const node = ref.current;
    if (node !== null && pinned.current) node.scrollTop = node.scrollHeight;
  }, [dependency]);
  const onScroll = () => {
    const node = ref.current;
    if (node !== null)
      pinned.current =
        node.scrollHeight - node.scrollTop - node.clientHeight < 32;
  };
  return { ref, onScroll };
}

export interface MessageListProps extends ControllerProps<ConversationController> {
  readonly renderMessage?: (message: ConversationMessage) => ReactNode;
  readonly className?: string;
}
export function MessageList({
  controller,
  createController,
  renderMessage,
  className,
}: MessageListProps) {
  const resolved = useResolvedController(controller, createController);
  const snapshot = useController(resolved);
  const configuration = usePolymorfa();
  const root = useShell(
    `pmfa-list${className === undefined ? "" : ` ${className}`}`,
  );
  const scroll = useStickToBottom(snapshot.messages);
  return (
    <ol
      {...root}
      ref={scroll.ref}
      onScroll={scroll.onScroll}
      data-pmfa="message-list"
      aria-live="polite"
    >
      <MessageItems
        snapshot={snapshot}
        onLoadMore={() => void resolved.loadMore()}
        renderMessage={renderMessage}
        configuration={configuration}
      />
    </ol>
  );
}

export interface ComposeBoxProps extends ControllerProps<MessageComposerController> {
  readonly onSent?: () => void;
  readonly className?: string;
}
export function ComposeBox({
  controller,
  createController,
  onSent,
  className,
}: ComposeBoxProps) {
  const resolved = useResolvedController(controller, createController);
  const snapshot = useController(resolved);
  const configuration = usePolymorfa();
  const root = useShell(
    `pmfa-composer${className === undefined ? "" : ` ${className}`}`,
  );
  const submit = () => {
    if (snapshot.sending || snapshot.text.trim() === "") return;
    void resolved.submit().then(
      () => {
        // A failed send resolves with the error in the snapshot.
        if (resolved.getSnapshot().status !== "error") onSent?.();
      },
      () => undefined,
    );
  };
  return (
    <form
      {...root}
      data-pmfa="compose-box"
      onSubmit={(event) => {
        event.preventDefault();
        submit();
      }}
    >
      <textarea
        className="pmfa-input"
        aria-label="Message"
        rows={1}
        placeholder={text(configuration, "composer.placeholder")}
        value={snapshot.text}
        onChange={(event) => resolved.setText(event.currentTarget.value)}
        onKeyDown={(event) => {
          if (
            event.key === "Enter" &&
            !event.shiftKey &&
            !event.nativeEvent.isComposing
          ) {
            event.preventDefault();
            submit();
          }
        }}
      />
      <button
        type="submit"
        className="pmfa-btn pmfa-btn-primary"
        disabled={snapshot.sending || snapshot.text.trim() === ""}
      >
        {snapshot.sending
          ? text(configuration, "composer.sending")
          : text(configuration, "composer.send")}
      </button>
      {snapshot.error !== undefined && (
        <p className="pmfa-error" role="alert">
          {snapshot.error}
        </p>
      )}
    </form>
  );
}

export interface ChatDrawerProps extends MessageListProps {
  readonly open?: boolean;
  readonly onClose?: () => void;
  readonly composer?: ReactNode;
  readonly title?: string;
}
export function ChatDrawer({
  open = true,
  onClose,
  composer,
  title,
  className,
  ...listProps
}: ChatDrawerProps) {
  const configuration = usePolymorfa();
  const root = useShell(
    `pmfa-drawer${className === undefined ? "" : ` ${className}`}`,
  );
  useEffect(() => {
    if (!open || onClose === undefined) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, onClose]);
  if (!open) return null;
  const heading = title ?? text(configuration, "chat.title");
  return (
    <aside {...root} data-pmfa="chat-drawer" role="dialog" aria-label={heading}>
      <header className="pmfa-drawer-header">
        <h2 className="pmfa-drawer-title">{heading}</h2>
        {onClose !== undefined && (
          <button
            type="button"
            className="pmfa-btn pmfa-btn-ghost pmfa-btn-icon"
            aria-label={text(configuration, "common.close")}
            onClick={onClose}
          >
            <CloseIcon />
          </button>
        )}
      </header>
      <DrawerList {...listProps} />
      {composer !== undefined && (
        <div className="pmfa-drawer-footer">{composer}</div>
      )}
    </aside>
  );
}

function DrawerList({
  controller,
  createController,
  renderMessage,
}: MessageListProps) {
  const resolved = useResolvedController(controller, createController);
  const snapshot = useController(resolved);
  const configuration = usePolymorfa();
  const scroll = useStickToBottom(snapshot.messages);
  return (
    <>
      <ol
        className="pmfa-list"
        ref={scroll.ref}
        onScroll={scroll.onScroll}
        data-pmfa="message-list"
        aria-live="polite"
      >
        <MessageItems
          snapshot={snapshot}
          onLoadMore={() => void resolved.loadMore()}
          renderMessage={renderMessage}
          configuration={configuration}
        />
      </ol>
      {snapshot.status === "error" && (
        <p className="pmfa-error" role="alert">
          {snapshot.error ?? text(configuration, "chat.loadError")}
        </p>
      )}
    </>
  );
}

function CloseIcon() {
  return (
    <svg
      width="20"
      height="20"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      aria-hidden="true"
    >
      <path d="M18 6 6 18M6 6l12 12" />
    </svg>
  );
}

function Field({
  label,
  children,
}: {
  readonly label: string;
  readonly children: ReactNode;
}) {
  return (
    <label className="pmfa-field">
      <span className="pmfa-label">{label}</span>
      {children}
    </label>
  );
}

export interface TemplateBuilderProps extends ControllerProps<TemplateBuilderController> {
  readonly renderPreview?: (preview: RenderedTemplate) => ReactNode;
  readonly className?: string;
}
export function TemplateBuilder({
  controller,
  createController,
  renderPreview,
  className,
}: TemplateBuilderProps) {
  const resolved = useResolvedController(controller, createController);
  const snapshot = useController(resolved);
  const configuration = usePolymorfa();
  const root = useShell(
    `pmfa-tb${className === undefined ? "" : ` ${className}`}`,
  );
  const definition = snapshot.draft?.definition;
  const busy =
    snapshot.status === "saving" ||
    snapshot.status === "previewing" ||
    snapshot.status === "submitting";
  const unsaved = snapshot.templateId === undefined || snapshot.dirty;
  return (
    <section {...root} data-pmfa="template-builder">
      <h2 className="pmfa-tb-title">
        {text(configuration, "templates.title")}
      </h2>
      <div className="pmfa-tb-grid">
        <div className="pmfa-tb-form">
          <Field label={text(configuration, "templates.name")}>
            <input
              className="pmfa-input"
              data-field="name"
              value={snapshot.draft?.name ?? ""}
              onChange={(event) => resolved.setName(event.currentTarget.value)}
            />
          </Field>
          {definition?.header?.format === "text" && (
            <Field label={text(configuration, "templates.header")}>
              <input
                className="pmfa-input"
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
          <Field label={text(configuration, "templates.body")}>
            <textarea
              className="pmfa-input"
              rows={4}
              data-field="body"
              value={definition?.body ?? ""}
              onChange={(event) => resolved.setBody(event.currentTarget.value)}
            />
          </Field>
          {definition?.footer !== undefined && (
            <Field label={text(configuration, "templates.footer")}>
              <input
                className="pmfa-input"
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
            <fieldset className="pmfa-field">
              <legend>{text(configuration, "templates.variables")}</legend>
              <div className="pmfa-pairs">
                {definition?.variables.map((variable) => (
                  <label key={variable.name} className="pmfa-pair">
                    <span>{`{{${variable.name}}}`}</span>
                    <input
                      className="pmfa-input"
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
            <fieldset className="pmfa-field">
              <legend>{text(configuration, "templates.buttons")}</legend>
              <div className="pmfa-pairs">
                {definition?.buttons?.map((templateButton, index) => (
                  <label
                    key={`${templateButton.type}-${index}`}
                    className="pmfa-pair"
                  >
                    <span>{templateButton.type.replace("_", " ")}</span>
                    <input
                      className="pmfa-input"
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
            <fieldset className="pmfa-field">
              <legend>{text(configuration, "templates.cards")}</legend>
              {definition?.carousel?.cards.map((card, index) => (
                <textarea
                  key={`card-${index}`}
                  className="pmfa-input"
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
              className="pmfa-error"
              role="alert"
            >
              {issue.message}
            </p>
          ))}
          {snapshot.error !== undefined && (
            <p className="pmfa-error" role="alert">
              {snapshot.error.message}
            </p>
          )}
          <div className="pmfa-actions">
            <button
              type="button"
              className="pmfa-btn pmfa-btn-primary"
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
              className="pmfa-btn"
              disabled={busy || unsaved}
              onClick={() => void resolved.refreshPreview()}
            >
              {text(configuration, "templates.preview")}
            </button>
            <button
              type="button"
              className="pmfa-btn"
              disabled={busy || unsaved}
              onClick={() => void resolved.submitToMeta()}
            >
              {text(configuration, "templates.submit")}
            </button>
          </div>
        </div>
        <div className="pmfa-tb-aside">
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

/** Oldest first; messages without a valid time sort as the newest. */
function byCreatedAt(
  left: { readonly createdAt: number },
  right: { readonly createdAt: number },
): number {
  const a = sortableTime(left.createdAt);
  const b = sortableTime(right.createdAt);
  return a === b ? 0 : a < b ? -1 : 1;
}

function sortableTime(value: number): number {
  return Number.isNaN(new Date(value).getTime()) ? Infinity : value;
}
