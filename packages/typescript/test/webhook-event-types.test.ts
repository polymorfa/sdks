import { describe, expectTypeOf, it } from "vitest";

import type {
  BlocklistUpdatePayload,
  BusinessQuickReplyUpdatePayload,
  CallAcceptedPayload,
  CallEndedPayload,
  CallMissedPayload,
  CallParticipant,
  CallParticipantLeftPayload,
  CallParticipantPayload,
  CallReceivedPayload,
  CallRejectedPayload,
  CallTelemetryPayload,
  ChatArchivePayload,
  ChatClearPayload,
  ChatDeletePayload,
  ChatMutePayload,
  ChatReadPayload,
  CloudMessagePayload,
  CommandResultPayload,
  ContactUpdatePayload,
  GroupParticipantPayload,
  GroupUpdatePayload,
  HistorySyncPayload,
  IdentityReference,
  LabelsUpdatePayload,
  LinkedDeviceMessageType,
  MessageDeletePayload,
  MessagePayload,
  MessageReceivedPayload,
  NativeFlowResponse,
  NewsletterUpdatePayload,
  PollOption,
  PollVotePayload,
  PresenceUpdatePayload,
  SessionPhoneOfflinePayload,
  WebhookPayloadMap,
} from "../src/index.js";

type ExpectedIdentityReference = {
  readonly id: string;
  readonly phoneNumber?: string;
  readonly bsuid?: string;
  readonly username?: string;
};

interface ExpectedConversationReference extends ExpectedIdentityReference {
  readonly sender?: ExpectedIdentityReference;
}

type ExpectedNativeFlowResponse = {
  readonly name: string;
  readonly paramsJson: string;
  readonly version?: number;
};

type ExpectedPollOption = {
  readonly name: string;
  readonly hash: string;
};

type ExpectedLinkedDeviceMessageType =
  | "text"
  | "image"
  | "video"
  | "audio"
  | "document"
  | "location"
  | "contact"
  | "phone_number_shared"
  | "poll"
  | "sticker"
  | "reaction"
  | "revoke"
  | "edited"
  | "unknown";

type ExpectedMessagePayload = {
  readonly id: string;
  readonly whatsapp_id: string;
  readonly conversation: ExpectedConversationReference;
  readonly fromMe: boolean;
  readonly timestamp: number;
  readonly pushName: string;
  readonly isGroup: boolean;
  readonly type: ExpectedLinkedDeviceMessageType;
  readonly text?: string;
  readonly caption?: string;
  readonly mimeType?: string;
  readonly ptt?: boolean;
  readonly filename?: string;
  readonly latitude?: number;
  readonly longitude?: number;
  readonly displayName?: string;
  readonly title?: string;
  readonly reaction?: string;
  readonly reactionTo?: string;
  readonly revokedId?: string;
  readonly media?: string;
  readonly mediaUrl?: string;
  readonly edited?: boolean;
  readonly pollOptions?: readonly ExpectedPollOption[];
  readonly unavailable?: boolean;
  readonly unavailableReason?: string;
  readonly nativeFlowResponse?: ExpectedNativeFlowResponse;
  readonly [key: string]: unknown;
};

type ExpectedPayloads = {
  readonly "blocklist.update": {
    readonly action: string;
    readonly changes: readonly {
      readonly action: string;
      readonly phoneNumber?: string;
      readonly bsuid?: string;
      readonly id: string;
      readonly username?: string;
    }[];
  };
  readonly "business.quick_reply.update": {
    readonly id: string;
    readonly shortcut: string;
    readonly message: string;
    readonly keywords: readonly string[];
    readonly count: number;
    readonly deleted: boolean;
    readonly associatedLabelIds: readonly string[];
    readonly observedAt: number;
    readonly fromFullSync: boolean;
  };
  readonly "call.accepted": {
    readonly from: ExpectedIdentityReference;
    readonly callId: string;
  };
  readonly "call.ended": {
    readonly from: ExpectedIdentityReference | null;
    readonly callId: string;
    readonly durationSeconds: number;
    readonly reason: string;
    readonly direction: "inbound" | "outbound";
    readonly hadVideo: boolean;
  };
  readonly "call.missed": {
    readonly from: ExpectedIdentityReference;
    readonly callId: string;
    readonly reason: string;
  };
  readonly "call.participant_joined": {
    readonly callId: string;
    readonly participant: {
      readonly id: string;
      readonly phoneNumber?: string;
      readonly bsuid?: string;
      readonly username?: string;
      readonly audioMuted: false;
      readonly video: false;
      readonly state: "invited" | "ringing" | "connected" | "left";
    };
  };
  readonly "call.participant_left": {
    readonly callId: string;
    readonly participantId: string;
    readonly reason?: string;
  };
  readonly "call.participant_state": {
    readonly callId: string;
    readonly participant: {
      readonly id: string;
      readonly phoneNumber?: string;
      readonly bsuid?: string;
      readonly username?: string;
      readonly audioMuted: false;
      readonly video: false;
      readonly state: "invited" | "ringing" | "connected" | "left";
    };
  };
  readonly "call.received": {
    readonly from: ExpectedIdentityReference;
    readonly callId: string;
  };
  readonly "call.rejected": {
    readonly from: ExpectedIdentityReference;
    readonly callId: string;
  };
  readonly "call.telemetry": {
    readonly callId: string;
    readonly setupMs: number;
    readonly ringMs: number;
    readonly durationSeconds: number;
    readonly terminateReason: string;
    readonly codec: string;
    readonly jitterMs: number;
    readonly packetsLost: number;
    readonly rttMs: number;
    readonly recvKbps: number;
    readonly sendKbps: number;
  };
  readonly "chat.archive": {
    readonly from: ExpectedIdentityReference;
    readonly archive?: boolean;
    readonly pinned?: boolean;
  };
  readonly "chat.clear": { readonly from: ExpectedIdentityReference };
  readonly "chat.delete": { readonly from: ExpectedIdentityReference };
  readonly "chat.mute": {
    readonly from: ExpectedIdentityReference;
    readonly muted: boolean;
    readonly muteEndTimestamp?: number;
  };
  readonly "chat.read": {
    readonly from: ExpectedIdentityReference;
    readonly read: boolean;
  };
  readonly "command.result": {
    readonly requestId: string;
    readonly command: string;
    readonly success: boolean;
    readonly data?: Readonly<Record<string, unknown>>;
    readonly error?: string;
  };
  readonly "contact.update": {
    readonly id: string;
    readonly phoneNumber?: string;
    readonly bsuid?: string;
    readonly fullName?: string;
    readonly firstName?: string;
    readonly pushName?: string;
    readonly oldPushName?: string;
    readonly businessName?: string;
    readonly oldBusinessName?: string;
    readonly pictureId?: string;
    readonly pictureRemoved?: boolean;
    readonly username?: string;
  };
  readonly "group.participant": {
    readonly id: string;
    readonly joined?: readonly ExpectedIdentityReference[];
    readonly left?: readonly ExpectedIdentityReference[];
    readonly promoted?: readonly ExpectedIdentityReference[];
    readonly demoted?: readonly ExpectedIdentityReference[];
  };
  readonly "group.update": {
    readonly id: string;
    readonly newSubject?: string;
    readonly newDescription?: string;
    readonly action?: string;
  };
  readonly "history.sync": {
    readonly whatsapp_id: string;
    readonly original_whatsapp_id?: string;
    readonly messages: readonly {
      readonly id: string;
      readonly whatsapp_id: string;
      readonly conversation: ExpectedIdentityReference;
      readonly fromMe?: boolean;
    }[];
    readonly mode: "deliver";
    readonly syncType: string;
    readonly chunkOrder?: number;
    readonly progress?: number;
    readonly fileLength: number;
    readonly conversationCount: number;
    readonly messageCount: number;
    readonly pushNameCount: number;
    readonly statusMessageCount: number;
    readonly whatsapp: {
      readonly encoding: "gzip-base64-protobuf";
      readonly data: string;
    };
  };
  readonly "labels.update": {
    readonly action: string;
    readonly labelId?: string;
    readonly from?: ExpectedIdentityReference;
    readonly label?: string;
    readonly name?: string;
    readonly color?: number;
    readonly orderIndex?: number;
    readonly deleted?: boolean;
    readonly labeled?: boolean;
    readonly observedAt?: number;
    readonly messageId?: string;
    readonly starred?: boolean;
  };
  readonly "message.delete": {
    readonly from: ExpectedIdentityReference;
    readonly sender: ExpectedIdentityReference;
    readonly id: string;
    readonly whatsapp_id: string;
    readonly conversation: ExpectedConversationReference;
    readonly fromMe: boolean;
  };
  readonly "message.edited": ExpectedMessagePayload;
  readonly "message.reaction": ExpectedMessagePayload | CloudMessagePayload;
  readonly "message.revoked": ExpectedMessagePayload;
  readonly "message.update": ExpectedMessagePayload;
  readonly "message.vote": {
    readonly conversation: ExpectedConversationReference;
    readonly pollMessageId: string;
    readonly voter: ExpectedIdentityReference;
    readonly selectedHashes: readonly string[];
    readonly timestamp: number;
  };
  readonly "newsletter.update": {
    readonly id: string;
    readonly action: string;
    readonly muted?: boolean;
  };
  readonly "presence.update": {
    readonly observedAt: number;
    readonly from?: ExpectedIdentityReference;
    readonly sender?: ExpectedIdentityReference;
    readonly state?: string;
    readonly media?: string;
    readonly unavailable?: boolean;
    readonly lastSeen?: number;
  };
  readonly "session.phone_offline": {
    readonly daysSinceLastSeen: number;
    readonly daysRemaining: number;
    readonly lastSeen: string;
    readonly action: string;
  };
};

type ExportedPayloads = {
  readonly "blocklist.update": BlocklistUpdatePayload;
  readonly "business.quick_reply.update": BusinessQuickReplyUpdatePayload;
  readonly "call.accepted": CallAcceptedPayload;
  readonly "call.ended": CallEndedPayload;
  readonly "call.missed": CallMissedPayload;
  readonly "call.participant_joined": CallParticipantPayload;
  readonly "call.participant_left": CallParticipantLeftPayload;
  readonly "call.participant_state": CallParticipantPayload;
  readonly "call.received": CallReceivedPayload;
  readonly "call.rejected": CallRejectedPayload;
  readonly "call.telemetry": CallTelemetryPayload;
  readonly "chat.archive": ChatArchivePayload;
  readonly "chat.clear": ChatClearPayload;
  readonly "chat.delete": ChatDeletePayload;
  readonly "chat.mute": ChatMutePayload;
  readonly "chat.read": ChatReadPayload;
  readonly "command.result": CommandResultPayload;
  readonly "contact.update": ContactUpdatePayload;
  readonly "group.participant": GroupParticipantPayload;
  readonly "group.update": GroupUpdatePayload;
  readonly "history.sync": HistorySyncPayload;
  readonly "labels.update": LabelsUpdatePayload;
  readonly "message.delete": MessageDeletePayload;
  readonly "message.edited": MessagePayload;
  readonly "message.reaction": MessageReceivedPayload;
  readonly "message.revoked": MessagePayload;
  readonly "message.update": MessagePayload;
  readonly "message.vote": PollVotePayload;
  readonly "newsletter.update": NewsletterUpdatePayload;
  readonly "presence.update": PresenceUpdatePayload;
  readonly "session.phone_offline": SessionPhoneOfflinePayload;
};

describe("webhook event payload types", () => {
  it("maps every formerly opaque event family to its contract payload", () => {
    expectTypeOf<IdentityReference>().toEqualTypeOf<ExpectedIdentityReference>();
    expectTypeOf<NativeFlowResponse>().toEqualTypeOf<ExpectedNativeFlowResponse>();
    expectTypeOf<PollOption>().toEqualTypeOf<ExpectedPollOption>();
    expectTypeOf<LinkedDeviceMessageType>().toEqualTypeOf<ExpectedLinkedDeviceMessageType>();
    expectTypeOf<CallParticipant>().toEqualTypeOf<
      ExpectedPayloads["call.participant_joined"]["participant"]
    >();
    expectTypeOf<ExportedPayloads>().toEqualTypeOf<ExpectedPayloads>();
    expectTypeOf<
      Pick<WebhookPayloadMap, keyof ExpectedPayloads>
    >().toEqualTypeOf<ExpectedPayloads>();
  });
});
