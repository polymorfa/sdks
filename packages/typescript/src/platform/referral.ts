import { HttpTransport } from "../transport/http.js";
import type { ApiResponse, RequestOptions } from "../transport/types.js";
import { type DataEnvelope, unwrapResponse } from "./response.js";

/** Bonus a referred team receives on its first top-up. */
export interface ReferralWelcomeBonus {
  /** Percent of the credits purchased in the first top-up, such as `25`. */
  readonly percent: number;
  /** Maximum bonus in credits, as a decimal string such as `"5000"`. */
  readonly capCredits: string;
}

/**
 * One reward bracket. The bracket applies from `minReferrals` referred teams
 * that completed a first top-up, counting the team being rewarded, until the
 * next bracket's `minReferrals`.
 */
export interface ReferralTier {
  readonly minReferrals: number;
  /** Percent of the referred team's first top-up credits. */
  readonly percent: number;
}

/** The caller's referral link and the current program terms. */
export interface Referral {
  /** Referral code, such as `"k3m9p2q8rt"`. */
  readonly code: string;
  /** Shareable link, such as `"https://polymorfa.com/r/k3m9p2q8rt"`. */
  readonly link: string;
  /** `false` while the program does not accept new referrals. */
  readonly enabled: boolean;
  readonly welcomeBonus: ReferralWelcomeBonus;
  /** Brackets ordered by increasing `minReferrals`; the first starts at 1. */
  readonly tiers: readonly ReferralTier[];
  /** Maximum referral bonus per referred team in credits, as a decimal string. */
  readonly rewardCapCredits: string;
  /** Days between the referred team's first top-up and the referral bonus. */
  readonly holdDays: number;
  /** Whether sending the link to WhatsApp groups from the Console is on. */
  readonly groupShareEnabled: boolean;
}

/**
 * The team's referral link. Requires a team API key with `sessions:read`.
 * A team API key reads the one link shared by the team; the API creates it on
 * the first read. Teams without referral access receive
 * `PolymorfaAuthorizationError` (HTTP 403).
 */
export class ReferralResource {
  constructor(private readonly transport: HttpTransport) {}

  /** Returns the team's referral link and the current program terms. */
  retrieve(options: RequestOptions = {}): Promise<ApiResponse<Referral>> {
    return this.transport
      .request<DataEnvelope<Referral>>({
        method: "GET",
        path: "/platform/referral",
        ...options,
      })
      .then(unwrapResponse);
  }
}
