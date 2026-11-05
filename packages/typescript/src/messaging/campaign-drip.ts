import type {
  CampaignSendWindowDay,
  CampaignSendWindowRange,
  CampaignRecipientVariables,
} from "./types.js";
export interface CampaignDrip {
  readonly enrollment: "audience" | "continuous";
  readonly exitOnReply: boolean;
  /** GET opens, including scanners/previews, count; HEAD does not. */
  readonly exitOnLinkClick: boolean;
}
/** Create defaults: audience, true, false. Beta, linked-device/test senders only. */
export type CampaignDripInput = Partial<CampaignDrip>;
/** Omitted settings preserve stored values. No defaults are applied to PATCH.
 * Closing with only enrollment: audience also works after beta withdrawal. */
export type CampaignDripPatch = Partial<CampaignDrip>;
export interface CampaignDripStepStats {
  readonly step: number;
  readonly entered: number;
  readonly waiting: number;
  readonly sent: number;
  readonly delivered: number;
  readonly read: number;
  readonly replied: number;
  readonly exited: number;
  readonly failed: number;
}
export interface CampaignDripStats {
  readonly enrollment: "audience" | "continuous";
  readonly enrolled: number;
  readonly enrolledByApi: number;
  readonly active: number;
  readonly completed: number;
  readonly exited: number;
  readonly steps: readonly CampaignDripStepStats[];
}
export interface EnrollCampaignContactRequest {
  readonly phone: string;
  readonly variables?: CampaignRecipientVariables;
}
export interface CampaignEnrollment {
  readonly campaignId: string;
  readonly recipientId: string;
  readonly phone: string;
  readonly created: boolean;
  readonly status: string;
  readonly enrolledAt: number;
}
export interface CampaignSegmentSnapshot {
  readonly revision: number;
  readonly evaluatedAt: number;
  readonly matchedCount: number;
}
/** Later steps only. At most 4 hour ranges, same time zone as the campaign.
 * Delay is 0..2592000 seconds, in whole multiples of delayUnit. */
export interface CampaignStepWindow {
  readonly days: readonly CampaignSendWindowDay[];
  readonly hours: readonly CampaignSendWindowRange[];
}
export interface CampaignSequenceMessage {
  readonly version?: 2;
  readonly source?: string;
  readonly delayAfterSec?: number;
  readonly delayUnit?: "minutes" | "hours" | "days";
  readonly sendWindow?: CampaignStepWindow | null;
  readonly [field: string]: unknown;
}
/** Exposed through recipient.sequenceError; arbitrary send failure codes also occur. */
export type CampaignDripExitReason = "replied" | "link_clicked" | "opted_out";
