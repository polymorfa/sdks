// Public entry point: neutral calling operations only. Transport, signaling
// and media framing live in internal modules (see `./internal`).
export {
  CallsClient,
  type CallsClientOptions,
  type PlaceOptions,
} from "./client.js";
export {
  Call,
  AudioTrack,
  VideoTrack,
  type AnswerOptions,
  type CallCapabilities,
  type CallClaim,
  type CallDirection,
  type CallEndReason,
  type CallState,
  type CallVideoFrame,
  type CallVideoSource,
  type OutgoingVideoFrame,
} from "./call.js";
export {
  CallClaimedError,
  CallsApiError,
  CallsAuthError,
  CallsDisabledError,
  CallsError,
} from "./errors.js";
export type {
  CallsToken,
  CallsTokenProvider,
  CallsTokenRequest,
} from "./token.js";
export { DEFAULT_SAMPLE_RATE, type Participant } from "./protocol.js";

export type { MediaState, MediaStateUpdate } from "./media-state.js";
