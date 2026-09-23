/** Initial identity of an isolated simulated account. No real credentials or message content. */
export interface TestingConfiguration {
  profile?: { name?: string; status?: string };
  accountType?: "personal" | "business";
  replyBehavior?: "off" | "echo";
  failureScenario?: "none" | "reject-send";
  historyFixtureId?: string;
}
export type TestingConfigurationField =
  | "profile.name"
  | "profile.status"
  | "accountType"
  | "replyBehavior"
  | "failureScenario"
  | "historyFixtureId";

export interface TestingHistoryMessage {
  id: string;
  senderPhone: string;
  text: string;
  timestamp: number;
  fromMe: boolean;
}

/** Fixture names accepted by `testing.triggerEvent`, in catalog order. */
export const TEST_EVENT_FIXTURES = [
  "message.received",
  "message.ack",
  "message.failed",
  "call.received",
  "call.missed",
  "call.ended",
  "session.status",
  "session.restriction_updated",
  "template.status",
  "bansafe.enforcement",
  "bansafe.risk_changed",
] as const;

/** Named test-event fixtures. Each name is the event type it produces. */
export type TestEventFixture = (typeof TEST_EVENT_FIXTURES)[number];

/** Optional payload overrides. Each fixture accepts only the fields it lists. */
export interface TestEventOverrides {
  /** message.received: text body. */
  text?: string;
  /** Peer phone number in E.164 format. */
  from?: string;
  /** message.received: sender display name. */
  pushName?: string;
  /** message.received: send a media message of this type instead of text. */
  mediaType?: "image" | "video" | "audio" | "document" | "sticker";
  /** message.received: media caption (image, video, document). */
  caption?: string;
  /** message.ack: receipt type. */
  ackStatus?: "delivered" | "read" | "played" | "error";
  /** message.ack: Polymorfa message ID the receipt refers to. */
  messageId?: string;
  /** message.failed: sanitized failure class. */
  failureReason?:
    | "invalid_recipient"
    | "session_not_connected"
    | "ack_timeout"
    | "send_failed"
    | "blocked_by_safety";
  /** call.received, call.ended: video call. */
  video?: boolean;
  /** call.ended: connected duration in seconds. */
  durationSeconds?: number;
  /** call.ended: termination reason. */
  callEndReason?:
    | "user_hangup"
    | "timeout"
    | "lost_connection"
    | "rejected"
    | "call_restricted";
  /** session.restriction_updated: whether the restriction starts (true) or ends (false). */
  restrictionActive?: boolean;
  /** session.status: status. */
  status?: "CONNECTING" | "CONNECTED" | "DISCONNECTED";
  /** session.status: reason. */
  statusReason?:
    | "SCAN_QR"
    | "AUTO_RECONNECT"
    | "FAILED"
    | "MANUAL_STOP"
    | "QR_TIMEOUT"
    | "LOGGED_OUT"
    | "TEMPORARY_BAN"
    | "STREAM_ERROR";
  /** template.status: template name. */
  templateName?: string;
  /** template.status: approval result. */
  templateStatus?: "APPROVED" | "REJECTED";
  /** template.status: rejection reason (REJECTED only). */
  reason?: string;
  /** bansafe.enforcement: outcome kind. */
  enforcementKind?:
    "cap_warning" | "cap_reached" | "timelock" | "temporary_ban";
  /** bansafe.risk_changed: new risk level. */
  riskLevel?: "low" | "elevated" | "high" | "critical";
}

export interface TriggerTestEventRequest {
  /** Test number session name in the project. */
  session: string;
  event: TestEventFixture;
  overrides?: TestEventOverrides;
  /**
   * message.received only: deliver a real simulated message from this other
   * Test number in the same project instead of a generated event.
   */
  fromSession?: string;
}

export interface TriggerTestEventResponse {
  event: TestEventFixture;
  session: string;
  /** `generated`: a test event was published. `simulated`: a simulated message was sent. */
  delivery: "generated" | "simulated";
  /** Event ID for generated events. Simulated messages produce their event asynchronously. */
  eventId: string | null;
  /** Event source recorded on the event: `test` for generated events, `runtime` for simulated ones. */
  source: "test" | "runtime";
}

export interface TestEventFixtureInfo {
  name: TestEventFixture;
  description: string;
  overrides: Array<keyof TestEventOverrides>;
}
