import {
  ConversationController,
  type ConversationControllerOptions,
  type ConversationDataSource,
} from "./conversation.js";
import {
  MessageComposerController,
  createConversationComposerActions,
  type ComposerActions,
  type MessageComposerOptions,
} from "./composer.js";

export interface ConversationSessionOptions {
  /** The host supplies an authorized public upload adapter, or leaves attachments disabled. */
  readonly upload?: ComposerActions["upload"];
  readonly draft?: string;
  readonly conversation?: ConversationControllerOptions;
  readonly composer?: MessageComposerOptions;
}

/**
 * Owns the history and composer as one in-memory lifetime. Keep a session while
 * switching threads to preserve its draft, attachments, reply and retry identity.
 * Dispose it on scope or authority changes. This factory does not discover hosts,
 * mint credentials, connect a private route, or persist anything in browser storage.
 */
export function createConversationSession(
  source: ConversationDataSource,
  options: ConversationSessionOptions = {},
) {
  const conversation = new ConversationController(source, options.conversation);
  const composer = new MessageComposerController(
    createConversationComposerActions(
      conversation,
      options.upload ??
        (async () => {
          throw new Error("An upload adapter is required for attachments.");
        }),
    ),
    options.composer,
  );
  if (options.draft !== undefined) composer.setText(options.draft);
  return {
    conversation,
    composer,
    dispose() {
      composer.dispose();
      conversation.dispose();
    },
  };
}
export type ConversationSession = ReturnType<typeof createConversationSession>;
