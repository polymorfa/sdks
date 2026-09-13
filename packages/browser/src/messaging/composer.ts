import type {
  ComposerActions,
  ComposerDraft,
  LocalAttachment,
  MessageAttachment,
} from "../chat/index.js";
import { BrowserConfigurationError } from "../errors.js";
import type { BrowserMessagesResource } from "./client.js";
import type {
  BrowserActionOptions,
  BrowserSendMessageRequest,
} from "./types.js";

export interface BrowserComposerActionsOptions {
  readonly messages: Pick<BrowserMessagesResource, "send">;
  readonly chatId: string;
  readonly upload?: (
    attachment: LocalAttachment,
    onProgress: (progress: number) => void,
    signal: AbortSignal,
  ) => Promise<MessageAttachment>;
  readonly createMessage?: (draft: ComposerDraft) => BrowserSendMessageRequest;
  readonly requestOptions?: (
    draft: ComposerDraft,
  ) => Omit<BrowserActionOptions, "signal">;
}

export function createBrowserComposerActions(
  options: BrowserComposerActionsOptions,
): ComposerActions {
  if (typeof options.chatId !== "string" || options.chatId.length === 0) {
    throw new BrowserConfigurationError(
      "A chatId is required for browser composer actions.",
      "missing_chat_id",
    );
  }

  return Object.freeze({
    upload:
      options.upload ??
      (async () => {
        throw new BrowserConfigurationError(
          "Attachment upload requires an application-owned upload adapter.",
          "missing_upload_adapter",
        );
      }),
    send: async (draft: ComposerDraft, signal: AbortSignal): Promise<void> => {
      const body =
        options.createMessage?.(draft) ?? defaultMessage(options.chatId, draft);
      await options.messages.send(body, {
        ...options.requestOptions?.(draft),
        signal,
      });
    },
  });
}

function defaultMessage(
  chatId: string,
  draft: ComposerDraft,
): BrowserSendMessageRequest {
  if (draft.attachments.length > 0) {
    throw new BrowserConfigurationError(
      "Attachment sends require createMessage to map uploaded application media.",
      "missing_attachment_mapping",
    );
  }
  return {
    chatId,
    type: "text",
    text: draft.text,
    ...(draft.replyTo === undefined
      ? {}
      : { quotedMessage: { id: draft.replyTo } }),
  };
}
