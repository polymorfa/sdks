import type {
  ConversationController,
  ConversationMessage,
  MessageComposerController,
  QuickLinkController,
  RenderedTemplate,
  TemplateBuilderController,
} from "@polymorfa/browser";
import { appearanceToCssVariables } from "@polymorfa/ui";
import type { CSSProperties, ReactNode } from "react";
import { usePolymorfa } from "./context.js";
import { useController, useResolvedController } from "./hooks.js";

type ControllerProps<T> = {
  readonly controller?: T;
  readonly createController?: () => T;
};
function shell(configuration: ReturnType<typeof usePolymorfa>): {
  dir: "ltr" | "rtl";
  style: CSSProperties;
} {
  return {
    dir: configuration.locale.direction,
    style: appearanceToCssVariables(configuration.appearance) as CSSProperties,
  };
}

export interface QuickLinkProps extends ControllerProps<QuickLinkController> {
  readonly renderStatus?: (status: string) => ReactNode;
}
export function QuickLink({
  controller,
  createController,
  renderStatus,
}: QuickLinkProps) {
  const resolved = useResolvedController(controller, createController);
  const snapshot = useController(resolved);
  const configuration = usePolymorfa();
  const action =
    snapshot.status === "expired" || snapshot.status === "error"
      ? () => resolved.retry()
      : snapshot.status === "idle" || snapshot.status === "cancelled"
        ? () => resolved.launch()
        : () => resolved.cancel();
  return (
    <section {...shell(configuration)} data-pmfa="quicklink" aria-live="polite">
      {renderStatus?.(snapshot.status) ?? <p>{snapshot.status}</p>}
      {snapshot.qrCode && <pre>{snapshot.qrCode}</pre>}
      {snapshot.link && <a href={snapshot.link}>{snapshot.link}</a>}
      <button type="button" onClick={() => void action()}>
        {snapshot.status === "error" || snapshot.status === "expired"
          ? "Retry"
          : snapshot.status === "idle"
            ? "Connect"
            : "Cancel"}
      </button>
    </section>
  );
}

export interface MessageListProps extends ControllerProps<ConversationController> {
  readonly renderMessage?: (message: ConversationMessage) => ReactNode;
}
export function MessageList({
  controller,
  createController,
  renderMessage,
}: MessageListProps) {
  const resolved = useResolvedController(controller, createController);
  const snapshot = useController(resolved);
  const configuration = usePolymorfa();
  return (
    <ol {...shell(configuration)} data-pmfa="message-list" aria-live="polite">
      {snapshot.hasMore && (
        <li>
          <button type="button" onClick={() => void resolved.loadMore()}>
            Load earlier messages
          </button>
        </li>
      )}
      {snapshot.messages.length === 0 ? (
        <li>No messages yet</li>
      ) : (
        snapshot.messages.map((message) => (
          <li key={message.id}>{renderMessage?.(message) ?? message.text}</li>
        ))
      )}
    </ol>
  );
}

export interface ComposeBoxProps extends ControllerProps<MessageComposerController> {
  readonly onSent?: () => void;
}
export function ComposeBox({
  controller,
  createController,
  onSent,
}: ComposeBoxProps) {
  const resolved = useResolvedController(controller, createController);
  const snapshot = useController(resolved);
  const configuration = usePolymorfa();
  return (
    <form
      {...shell(configuration)}
      data-pmfa="compose-box"
      onSubmit={(event) => {
        event.preventDefault();
        void resolved.submit().then(onSent);
      }}
    >
      <textarea
        aria-label="Message"
        value={snapshot.text}
        onChange={(event) => resolved.setText(event.currentTarget.value)}
      />
      <button type="submit" disabled={snapshot.sending}>
        {snapshot.sending ? "Sending…" : "Send"}
      </button>
    </form>
  );
}

export interface ChatDrawerProps extends MessageListProps {
  readonly open?: boolean;
  readonly onClose?: () => void;
  readonly composer?: ReactNode;
}
export function ChatDrawer({
  open = true,
  onClose,
  composer,
  ...listProps
}: ChatDrawerProps) {
  const configuration = usePolymorfa();
  if (!open) return null;
  return (
    <aside
      {...shell(configuration)}
      data-pmfa="chat-drawer"
      role="dialog"
      aria-label="Messages"
    >
      <header>
        <h2>Messages</h2>
        <button type="button" onClick={onClose}>
          Close
        </button>
      </header>
      <MessageList {...listProps} />
      {composer}
    </aside>
  );
}

export interface TemplateBuilderProps extends ControllerProps<TemplateBuilderController> {
  readonly renderPreview?: (preview: RenderedTemplate) => ReactNode;
}
export function TemplateBuilder({
  controller,
  createController,
  renderPreview,
}: TemplateBuilderProps) {
  const resolved = useResolvedController(controller, createController);
  const snapshot = useController(resolved);
  const configuration = usePolymorfa();
  return (
    <section {...shell(configuration)} data-pmfa="template-builder">
      <h2>Template builder</h2>
      <input
        aria-label="Template name"
        value={snapshot.draft?.name ?? ""}
        onChange={(event) => resolved.setName(event.currentTarget.value)}
      />
      {snapshot.draft?.definition.header?.format === "text" && (
        <textarea
          aria-label="Header text"
          value={snapshot.draft.definition.header.text}
          onChange={(event) =>
            resolved.updateDefinition({
              header: {
                format: "text",
                text: event.currentTarget.value,
              },
            })
          }
        />
      )}
      <textarea
        aria-label="Template body"
        value={snapshot.draft?.definition.body ?? ""}
        onChange={(event) => resolved.setBody(event.currentTarget.value)}
      />
      {snapshot.draft?.definition.footer !== undefined && (
        <textarea
          aria-label="Template footer"
          value={snapshot.draft.definition.footer}
          onChange={(event) =>
            resolved.updateDefinition({ footer: event.currentTarget.value })
          }
        />
      )}
      {snapshot.draft?.definition.variables.map((variable) => (
        <label key={variable.name}>
          {variable.name}
          <input
            aria-label={`Variable ${variable.name} example`}
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
      {snapshot.draft?.definition.buttons?.map((templateButton, index) => (
        <label key={`${templateButton.type}-${index}`}>
          {templateButton.type}
          <input
            aria-label={`Button ${index + 1} text`}
            value={templateButton.text ?? ""}
            onChange={(event) => {
              const buttons = [...(snapshot.draft?.definition.buttons ?? [])];
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
      {snapshot.draft?.definition.carousel?.cards.map((card, index) => (
        <textarea
          key={`card-${index}`}
          aria-label={`Carousel card ${index + 1} body`}
          value={card.body}
          onChange={(event) => {
            const cards = [
              ...(snapshot.draft?.definition.carousel?.cards ?? []),
            ];
            const current = cards[index];
            if (current !== undefined)
              cards[index] = { ...current, body: event.currentTarget.value };
            resolved.updateDefinition({ carousel: { cards } });
          }}
        />
      ))}
      <button
        type="button"
        disabled={
          snapshot.draft === undefined || snapshot.localIssues.length > 0
        }
        onClick={() => void resolved.save()}
      >
        Save draft
      </button>
      <button
        type="button"
        disabled={snapshot.templateId === undefined || snapshot.dirty}
        onClick={() => void resolved.refreshPreview()}
      >
        Preview
      </button>
      <button
        type="button"
        disabled={snapshot.templateId === undefined || snapshot.dirty}
        onClick={() => void resolved.submitToMeta()}
      >
        Submit to Meta
      </button>
      {snapshot.preview &&
        (renderPreview?.(snapshot.preview.rendered) ?? (
          <TemplatePreviewOutput preview={snapshot.preview.rendered} />
        ))}
      {snapshot.localIssues.map((issue) => (
        <p key={`${issue.code}-${issue.path ?? ""}`} role="alert">
          {issue.message}
        </p>
      ))}
    </section>
  );
}

function TemplatePreviewOutput({
  preview,
}: {
  readonly preview: RenderedTemplate;
}) {
  return (
    <output>
      {preview.header?.text && <strong>{preview.header.text}</strong>}
      <p>{preview.body}</p>
      {preview.footer && <small>{preview.footer}</small>}
      {preview.buttons.map((templateButton, index) => (
        <button key={`${templateButton.type}-${index}`} type="button">
          {templateButton.text}
        </button>
      ))}
      {preview.cards.map((card, index) => (
        <article key={`card-${index}`}>
          <p>{card.body}</p>
          {card.buttons.map((templateButton, buttonIndex) => (
            <button key={`${templateButton.type}-${buttonIndex}`} type="button">
              {templateButton.text}
            </button>
          ))}
        </article>
      ))}
    </output>
  );
}
