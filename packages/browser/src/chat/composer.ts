import {
  ObservableController,
  type ControllerSnapshot,
} from "../controller.js";
import type { MessageAttachment } from "./conversation.js";

export interface LocalAttachment {
  readonly id: string;
  readonly name: string;
  readonly size: number;
  readonly contentType: string;
}

export interface ComposerAttachment extends LocalAttachment {
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
  readonly now?: () => number;
}

export class MessageComposerController extends ObservableController<MessageComposerSnapshot> {
  readonly #actions: ComposerActions;
  readonly #maxTextLength: number;
  readonly #maxAttachmentSize: number;
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
      throw new Error(
        `Message text cannot exceed ${this.#maxTextLength} characters.`,
      );
    if (current.attachments.some(({ status }) => status !== "ready"))
      throw new Error("Attachments must finish uploading before send.");
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
          attachments: current.attachments.flatMap(({ uploaded }) =>
            uploaded === undefined ? [] : [uploaded],
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
            item.id === attachment.id ? attachment : item,
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

function errorMessage(cause: unknown): string {
  return cause instanceof Error ? cause.message : "Composer request failed.";
}
