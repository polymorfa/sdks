import {
  ObservableController,
  type ControllerSnapshot,
} from "../controller.js";
import type {
  ConversationController,
  MediaQuality,
  MessageAttachment,
} from "./conversation.js";

export interface LocalAttachment {
  readonly id: string;
  readonly name: string;
  readonly size: number;
  readonly contentType: string;
  /** The picked or pasted bytes, for `ComposerActions.upload` to read. */
  readonly file?: Blob;
}

/** Describe a picked, pasted, or dropped file as a composer attachment. */
export function localAttachmentFromFile(
  file: File,
  createId: () => string = () => crypto.randomUUID(),
): LocalAttachment {
  return {
    id: createId(),
    name: file.name,
    size: file.size,
    contentType: file.type === "" ? "application/octet-stream" : file.type,
    file,
  };
}

export interface ComposerAttachment extends LocalAttachment {
  /** Requested send quality for a picture; see `setAttachmentQuality`. */
  readonly quality?: MediaQuality;
  readonly status: "uploading" | "ready" | "failed";
  readonly progress: number;
  readonly uploaded?: MessageAttachment;
  readonly error?: string;
}

export interface ComposerDraft {
  readonly text: string;
  readonly replyTo?: string;
  readonly attachments: readonly MessageAttachment[];
}

export interface ComposerActions {
  upload(
    attachment: LocalAttachment,
    onProgress: (progress: number) => void,
    signal: AbortSignal,
  ): Promise<MessageAttachment>;
  send(draft: ComposerDraft, signal: AbortSignal): Promise<void>;
}

/**
 * Composer actions that send through a conversation, so the composer and the
 * message list share one optimistic history. `upload` stays yours: it turns
 * the local bytes into a hosted `MessageAttachment`.
 */
export function createConversationComposerActions(
  conversation: ConversationController,
  upload: ComposerActions["upload"],
): ComposerActions {
  let failed:
    { readonly clientId: string; readonly payload: string } | undefined;
  return {
    upload,
    send: async (draft, signal) => {
      const input = {
        text: draft.text,
        ...(draft.replyTo === undefined ? {} : { replyTo: draft.replyTo }),
        ...(draft.attachments.length === 0
          ? {}
          : { attachments: draft.attachments }),
      };
      const payload = JSON.stringify(input);
      const retryable =
        failed?.payload === payload &&
        conversation
          .getSnapshot()
          .messages.some(
            (message) =>
              message.clientId === failed?.clientId &&
              message.status === "failed",
          );
      const result =
        retryable && failed
          ? await conversation.retry(failed.clientId, signal)
          : await conversation.send(input, signal);
      if (result.status === "failed") {
        failed = { clientId: result.clientId ?? result.id, payload };
        throw new Error(result.error ?? "Message send failed.");
      }
      failed = undefined;
    },
  };
}

export interface MessageComposerSnapshot extends ControllerSnapshot {
  readonly status: "ready" | "error";
  readonly text: string;
  readonly replyTo?: string;
  readonly attachments: readonly ComposerAttachment[];
  readonly sending: boolean;
  readonly error?: string;
}

export interface MessageComposerOptions {
  readonly maxTextLength?: number;
  readonly maxAttachmentSize?: number;
  /** Quality new pictures start with. Defaults to `standard`. */
  readonly defaultMediaQuality?: MediaQuality;
  readonly now?: () => number;
}

export class MessageComposerController extends ObservableController<MessageComposerSnapshot> {
  readonly #actions: ComposerActions;
  readonly #maxTextLength: number;
  readonly #maxAttachmentSize: number;
  readonly #defaultQuality: MediaQuality;
  readonly #uploads = new Map<string, AbortController>();
  #sendAbort: AbortController | undefined;

  constructor(actions: ComposerActions, options: MessageComposerOptions = {}) {
    super(
      { status: "ready", text: "", attachments: [], sending: false },
      options.now,
    );
    this.#actions = actions;
    this.#maxTextLength = options.maxTextLength ?? 4096;
    this.#maxAttachmentSize = options.maxAttachmentSize ?? 25 * 1024 * 1024;
    this.#defaultQuality = options.defaultMediaQuality ?? "standard";
  }

  /**
   * Choose standard or HD for an attached picture. The choice travels with
   * the draft as `quality`; the send adapter decides how to deliver HD.
   */
  setAttachmentQuality(id: string, quality: MediaQuality): void {
    const current = this.getSnapshot();
    const target = current.attachments.find((item) => item.id === id);
    if (
      target === undefined ||
      !isPicture(target) ||
      target.quality === quality
    )
      return;
    this.transition({
      ...composerFields(current),
      attachments: current.attachments.map((item) =>
        item.id === id ? { ...item, quality } : item,
      ),
    });
  }

  setText(text: string): void {
    this.#update({ text });
  }

  setReplyTo(replyTo?: string): void {
    this.#update(replyTo === undefined ? { clearReply: true } : { replyTo });
  }

  async addAttachment(attachment: LocalAttachment): Promise<void> {
    this.assertActive();
    if (attachment.size > this.#maxAttachmentSize)
      throw new Error(`Attachment exceeds ${this.#maxAttachmentSize} bytes.`);
    if (this.getSnapshot().attachments.some(({ id }) => id === attachment.id))
      return;
    const abort = new AbortController();
    this.#uploads.set(attachment.id, abort);
    this.#replaceAttachment({
      ...attachment,
      ...(isPicture(attachment) ? { quality: this.#defaultQuality } : {}),
      status: "uploading",
      progress: 0,
    });
    try {
      const uploaded = await this.#actions.upload(
        attachment,
        (progress) => this.#progress(attachment.id, progress),
        abort.signal,
      );
      if (!abort.signal.aborted)
        this.#replaceAttachment({
          ...attachment,
          status: "ready",
          progress: 1,
          uploaded,
        });
    } catch (cause) {
      if (!abort.signal.aborted)
        this.#replaceAttachment({
          ...attachment,
          status: "failed",
          progress: 0,
          error: errorMessage(cause),
        });
    } finally {
      this.#uploads.delete(attachment.id);
    }
  }

  cancelAttachment(id: string): void {
    this.#uploads.get(id)?.abort();
    this.#uploads.delete(id);
    const current = this.getSnapshot();
    this.transition({
      ...composerFields(current),
      attachments: current.attachments.filter((item) => item.id !== id),
    });
  }

  async submit(): Promise<void> {
    const current = this.getSnapshot();
    if (current.sending) throw new Error("Composer is already sending.");
    if (current.text.length > this.#maxTextLength)
      this.#rejectSubmit(
        current,
        `Message text cannot exceed ${this.#maxTextLength} characters.`,
      );
    if (current.attachments.some(({ status }) => status !== "ready"))
      this.#rejectSubmit(
        current,
        "Attachments must finish uploading before send.",
      );
    if (current.text.trim() === "" && current.attachments.length === 0)
      throw new Error("Message cannot be empty.");
    const abort = new AbortController();
    this.#sendAbort = abort;
    this.transition({ ...composerFields(current), sending: true });
    try {
      await this.#actions.send(
        {
          text: current.text,
          ...(current.replyTo === undefined
            ? {}
            : { replyTo: current.replyTo }),
          // Standard is the default send quality, so only HD is spelled out.
          attachments: current.attachments.flatMap(({ uploaded, quality }) =>
            uploaded === undefined
              ? []
              : [quality === "hd" ? { ...uploaded, quality } : uploaded],
          ),
        },
        abort.signal,
      );
      if (!abort.signal.aborted) this.reset();
    } catch (cause) {
      if (!abort.signal.aborted)
        this.transition({
          ...composerFields(current),
          status: "error",
          sending: false,
          error: errorMessage(cause),
        });
    } finally {
      if (this.#sendAbort === abort) this.#sendAbort = undefined;
    }
  }

  /** Publish a validation failure so bound UI can show it, then reject. */
  #rejectSubmit(current: MessageComposerSnapshot, message: string): never {
    this.transition({
      ...composerFields(current),
      status: "error",
      error: message,
    });
    throw new Error(message);
  }

  cancelSend(): void {
    this.#sendAbort?.abort();
    this.#sendAbort = undefined;
    const current = this.getSnapshot();
    this.transition({ ...composerFields(current), sending: false });
  }

  reset(): void {
    for (const upload of this.#uploads.values()) upload.abort();
    this.#uploads.clear();
    this.transition({
      status: "ready",
      text: "",
      attachments: [],
      sending: false,
    });
  }

  protected override onDispose(): void {
    for (const upload of this.#uploads.values()) upload.abort();
    this.#uploads.clear();
    this.#sendAbort?.abort();
  }

  #update(change: {
    readonly text?: string;
    readonly replyTo?: string;
    readonly clearReply?: true;
  }): void {
    const current = this.getSnapshot();
    const base = {
      status: "ready" as const,
      text: change.text ?? current.text,
      attachments: current.attachments,
      sending: current.sending,
      ...(current.error === undefined ? {} : { error: current.error }),
    };
    this.transition({
      ...base,
      ...(change.clearReply
        ? {}
        : change.replyTo === undefined
          ? current.replyTo === undefined
            ? {}
            : { replyTo: current.replyTo }
          : { replyTo: change.replyTo }),
    });
  }

  #progress(id: string, progress: number): void {
    const current = this.getSnapshot();
    if (!this.#uploads.has(id)) return;
    this.transition({
      ...composerFields(current),
      attachments: current.attachments.map((item) =>
        item.id === id
          ? { ...item, progress: Math.max(0, Math.min(progress, 1)) }
          : item,
      ),
    });
  }

  #replaceAttachment(attachment: ComposerAttachment): void {
    const current = this.getSnapshot();
    const existing = current.attachments.some(({ id }) => id === attachment.id);
    this.transition({
      ...composerFields(current),
      attachments: existing
        ? current.attachments.map((item) =>
            item.id === attachment.id
              ? // A quality chosen while uploading survives the upload result.
                item.quality === undefined
                ? attachment
                : { ...attachment, quality: item.quality }
              : item,
          )
        : [...current.attachments, attachment],
    });
  }
}

function composerFields(snapshot: MessageComposerSnapshot) {
  return {
    status: snapshot.status,
    text: snapshot.text,
    attachments: snapshot.attachments,
    sending: snapshot.sending,
    ...(snapshot.replyTo === undefined ? {} : { replyTo: snapshot.replyTo }),
    ...(snapshot.error === undefined ? {} : { error: snapshot.error }),
  } as const;
}

function isPicture(attachment: { readonly contentType: string }): boolean {
  const type = attachment.contentType.toLowerCase();
  return type.startsWith("image/") && type !== "image/gif";
}

function errorMessage(cause: unknown): string {
  return cause instanceof Error ? cause.message : "Composer request failed.";
}
