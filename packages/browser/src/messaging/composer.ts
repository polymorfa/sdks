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
  BrowserConversationReference,
  BrowserSendMessageRequest,
} from "./types.js";

export interface BrowserComposerActionsOptions {
  readonly messages: Pick<BrowserMessagesResource, "send">;
  readonly conversation: BrowserConversationReference;
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
  if (
    !options.conversation ||
    !(
      options.conversation.id ||
      options.conversation.phoneNumber ||
      options.conversation.bsuid
    )
  ) {
    throw new BrowserConfigurationError(
      "A conversation ID, phoneNumber, or bsuid is required for browser composer actions.",
      "missing_conversation",
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
        options.createMessage?.(draft) ??
        defaultMessage(options.conversation, draft);
      await options.messages.send(body, {
        ...options.requestOptions?.(draft),
        signal,
      });
    },
  });
}

function defaultMessage(
  conversation: BrowserConversationReference,
  draft: ComposerDraft,
): BrowserSendMessageRequest {
  if (draft.attachments.length > 0) {
    throw new BrowserConfigurationError(
      "Attachment sends require createMessage to map uploaded application media.",
      "missing_attachment_mapping",
    );
  }
  return {
    conversation,
    content: { text: draft.text },
    ...(draft.replyTo === undefined
      ? {}
      : { quotedMessage: { id: draft.replyTo } }),
  };
}
