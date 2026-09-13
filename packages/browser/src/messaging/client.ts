import { BrowserValidationError } from "../errors.js";
import {
  BrowserTransport,
  type BrowserTransportOptions,
} from "../transport.js";
import type {
  BrowserActionOptions,
  BrowserActionResponse,
  BrowserAsyncAcceptedData,
  BrowserChatPresenceData,
  BrowserContact,
  BrowserContactCheckResult,
  BrowserMessageResult,
  BrowserOperationAccepted,
  BrowserPairingCode,
  BrowserPairingCodeRequest,
  BrowserPresenceData,
  BrowserPresenceSubscriptionData,
  BrowserProfilePicture,
  BrowserQrCode,
  BrowserReactionRequest,
  BrowserSeenRequest,
  BrowserSendMessageRequest,
  BrowserSessionStatus,
  BrowserStarRequest,
  BrowserSuccessEnvelope,
  BrowserSuccessResponse,
  BrowserTypingRequest,
  BrowserWidgetHandoff,
} from "./types.js";

export interface BrowserMessagingClientOptions extends BrowserTransportOptions {
  readonly session: string;
}

export class BrowserMessagingClient {
  readonly messages: BrowserMessagesResource;
  readonly presence: BrowserPresenceResource;
  readonly contacts: BrowserContactsResource;
  readonly widget: BrowserWidgetResource;

  constructor(options: BrowserMessagingClientOptions) {
    if (typeof options.session !== "string" || options.session.length === 0) {
      throw new BrowserValidationError(
        "A session is required for the browser Messaging client.",
        "missing_session",
      );
    }
    const { session, ...transportOptions } = options;
    const transport = new BrowserTransport(transportOptions);
    this.messages = new BrowserMessagesResource(transport, session);
    this.presence = new BrowserPresenceResource(transport, session);
    this.contacts = new BrowserContactsResource(transport, session);
    this.widget = new BrowserWidgetResource(transport, session);
  }
}

export class BrowserMessagesResource {
  constructor(
    private readonly transport: BrowserTransport,
    private readonly session: string,
  ) {}

  send(
    body: BrowserSendMessageRequest,
    options: BrowserActionOptions = {},
  ): Promise<
    BrowserActionResponse<BrowserSuccessEnvelope<BrowserMessageResult>>
  > {
    return this.post("send", body, options);
  }

  markSeen(
    body: BrowserSeenRequest,
    options: BrowserActionOptions = {},
  ): Promise<BrowserActionResponse<BrowserSuccessResponse>> {
    return this.post("seen", body, options);
  }

  setTyping(
    body: BrowserTypingRequest,
    options: BrowserActionOptions = {},
  ): Promise<BrowserActionResponse<BrowserSuccessResponse>> {
    return this.post("typing", body, options);
  }

  react(
    body: BrowserReactionRequest,
    options: BrowserActionOptions = {},
  ): Promise<
    BrowserActionResponse<BrowserSuccessEnvelope<BrowserMessageResult>>
  > {
    return this.post("react", body, options);
  }

  star(
    body: BrowserStarRequest,
    options: BrowserActionOptions = {},
  ): Promise<
    BrowserActionResponse<BrowserSuccessEnvelope<BrowserMessageResult>>
  > {
    return this.post("star", body, options);
  }

  private post<T>(
    action: "send" | "seen" | "typing" | "react" | "star",
    body: unknown,
    options: BrowserActionOptions,
  ): Promise<BrowserActionResponse<T>> {
    return this.transport.request({
      method: "POST",
      path: `${sessionRoot(this.session)}/messages/${action}`,
      body,
      ...options,
    });
  }
}

export class BrowserPresenceResource {
  constructor(
    private readonly transport: BrowserTransport,
    private readonly session: string,
  ) {}

  retrieve(
    options: BrowserActionOptions = {},
  ): Promise<
    BrowserActionResponse<BrowserSuccessEnvelope<BrowserPresenceData>>
  > {
    return this.transport.request({
      method: "GET",
      path: `${sessionRoot(this.session)}/presence`,
      ...options,
    });
  }

  retrieveChat(
    chatId: string,
    options: BrowserActionOptions = {},
  ): Promise<
    BrowserActionResponse<BrowserSuccessEnvelope<BrowserChatPresenceData>>
  > {
    return this.transport.request({
      method: "GET",
      path: `${sessionRoot(this.session)}/presence/${encodeURIComponent(chatId)}`,
      ...options,
    });
  }

  subscribe(
    chatId: string,
    options: BrowserActionOptions = {},
  ): Promise<
    BrowserActionResponse<
      | BrowserSuccessEnvelope<BrowserPresenceSubscriptionData>
      | BrowserSuccessEnvelope<BrowserAsyncAcceptedData>
    >
  > {
    return this.transport.request({
      method: "POST",
      path: `${sessionRoot(this.session)}/presence/${encodeURIComponent(chatId)}/subscribe`,
      ...options,
    });
  }
}

export class BrowserContactsResource {
  constructor(
    private readonly transport: BrowserTransport,
    private readonly session: string,
  ) {}

  list(
    options: BrowserActionOptions = {},
  ): Promise<
    BrowserActionResponse<BrowserSuccessEnvelope<readonly BrowserContact[]>>
  > {
    return this.transport.request({
      method: "GET",
      path: `${sessionRoot(this.session)}/contacts`,
      ...options,
    });
  }

  retrieve(
    contactId: string,
    options: BrowserActionOptions = {},
  ): Promise<BrowserActionResponse<BrowserSuccessEnvelope<BrowserContact>>> {
    return this.transport.request({
      method: "GET",
      path: `${sessionRoot(this.session)}/contacts/${encodeURIComponent(contactId)}`,
      ...options,
    });
  }

  picture(
    contactId: string,
    options: BrowserActionOptions = {},
  ): Promise<
    BrowserActionResponse<BrowserSuccessEnvelope<BrowserProfilePicture>>
  > {
    return this.transport.request({
      method: "GET",
      path: `${sessionRoot(this.session)}/contacts/${encodeURIComponent(contactId)}/picture`,
      ...options,
    });
  }

  check(
    phone: string | readonly string[],
    options: BrowserActionOptions = {},
  ): Promise<
    BrowserActionResponse<
      BrowserSuccessEnvelope<readonly BrowserContactCheckResult[]>
    >
  > {
    const value = typeof phone === "string" ? phone : phone.join(",");
    if (value.length === 0) {
      throw new BrowserValidationError(
        "At least one phone number is required.",
        "missing_phone",
      );
    }
    return this.transport.request({
      method: "GET",
      path: `${sessionRoot(this.session)}/contacts/check`,
      query: { phone: value },
      ...options,
    });
  }
}

export class BrowserWidgetResource {
  constructor(
    private readonly transport: BrowserTransport,
    private readonly session: string,
  ) {}

  start(
    options: BrowserActionOptions = {},
  ): Promise<BrowserActionResponse<BrowserOperationAccepted>> {
    return this.transport.request({
      method: "POST",
      path: `/api/sessions/${encodeURIComponent(this.session)}/start`,
      ...options,
    });
  }

  status(
    options: BrowserActionOptions = {},
  ): Promise<
    BrowserActionResponse<BrowserSuccessEnvelope<BrowserSessionStatus>>
  > {
    return this.transport.request({
      method: "GET",
      path: `/api/sessions/${encodeURIComponent(this.session)}`,
      ...options,
    });
  }

  qr(
    options: BrowserActionOptions = {},
  ): Promise<BrowserActionResponse<BrowserSuccessEnvelope<BrowserQrCode>>> {
    return this.transport.request({
      method: "GET",
      path: `${sessionRoot(this.session)}/pair/qr`,
      ...options,
    });
  }

  requestPairingCode(
    body: BrowserPairingCodeRequest,
    options: BrowserActionOptions = {},
  ): Promise<
    BrowserActionResponse<BrowserSuccessEnvelope<BrowserPairingCode>>
  > {
    return this.transport.request({
      method: "POST",
      path: `${sessionRoot(this.session)}/pair/code`,
      body,
      ...options,
    });
  }

  handoff(
    options: BrowserActionOptions = {},
  ): Promise<
    BrowserActionResponse<BrowserSuccessEnvelope<BrowserWidgetHandoff>>
  > {
    return this.transport.request({
      method: "POST",
      path: `/api/widget/sessions/${encodeURIComponent(this.session)}/handoff`,
      ...options,
    });
  }
}

function sessionRoot(session: string): string {
  return `/api/${encodeURIComponent(session)}`;
}
