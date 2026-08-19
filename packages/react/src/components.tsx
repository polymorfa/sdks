import type {
  CallsController,
  ConversationController,
  ConversationMessage,
  MessageComposerController,
  QuickLinkController,
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
  readonly renderPreview?: (text: string) => ReactNode;
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
      {snapshot.draft?.components.map((component) => (
        <textarea
          key={component.id}
          aria-label={`${component.type} content`}
          value={component.text ?? ""}
          onChange={(event) =>
            resolved.updateComponent(component.id, {
              text: event.currentTarget.value,
            })
          }
        />
      ))}
      <button type="button" onClick={() => void resolved.refreshPreview()}>
        Preview
      </button>
      <button type="button" onClick={() => void resolved.submit()}>
        Submit
      </button>
      {snapshot.preview &&
        (renderPreview?.(snapshot.preview.text) ?? (
          <output>{snapshot.preview.text}</output>
        ))}
    </section>
  );
}

export interface CallSurfaceProps extends ControllerProps<CallsController> {
  readonly renderMedia?: (streams: {
    readonly local?: MediaStream;
    readonly remote?: MediaStream;
  }) => ReactNode;
}
export function CallSurface({
  controller,
  createController,
  renderMedia,
}: CallSurfaceProps) {
  const resolved = useResolvedController(controller, createController);
  const snapshot = useController(resolved);
  const configuration = usePolymorfa();
  return (
    <section {...shell(configuration)} data-pmfa="call" aria-live="assertive">
      <h2>{snapshot.status}</h2>
      {snapshot.peer && <p>{snapshot.peer}</p>}
      {renderMedia?.({
        ...(resolved.localStream === undefined
          ? {}
          : { local: resolved.localStream }),
        ...(resolved.remoteStream === undefined
          ? {}
          : { remote: resolved.remoteStream }),
      })}
      {snapshot.status === "incoming" && (
        <>
          <button type="button" onClick={() => void resolved.answer()}>
            Answer
          </button>
          <button type="button" onClick={() => void resolved.reject()}>
            Reject
          </button>
        </>
      )}
      {["ringing", "accepted", "connecting", "connected"].includes(
        snapshot.status,
      ) && (
        <>
          <button
            type="button"
            onClick={() => resolved.setMuted({ audio: !snapshot.audioMuted })}
          >
            {snapshot.audioMuted ? "Unmute" : "Mute"}
          </button>
          <button type="button" onClick={() => void resolved.hangup()}>
            Hang up
          </button>
        </>
      )}
    </section>
  );
}
