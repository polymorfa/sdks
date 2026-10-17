import type { HttpTransport } from "../transport/http.js";
import type { ApiResponse, RequestOptions } from "../transport/types.js";
import type { DataEnvelope } from "./types.js";

export type AudienceSegmentCondition =
  | {
      readonly field: "tag";
      readonly operator: "contains";
      readonly value: string;
    }
  | {
      readonly field: "tag";
      readonly operator: "in";
      readonly values: readonly string[];
    }
  | { readonly field: "tag"; readonly operator: "exists" }
  | {
      readonly field: "attribute";
      readonly name: string;
      readonly operator: "equals";
      readonly value: string | number | boolean;
    }
  | {
      readonly field: "attribute";
      readonly name: string;
      readonly operator: "contains" | "before" | "after";
      readonly value: string;
    }
  | {
      readonly field: "attribute";
      readonly name: string;
      readonly operator: "in";
      readonly values: readonly (string | number)[];
    }
  | {
      readonly field: "attribute";
      readonly name: string;
      readonly operator: "greater_than" | "less_than";
      readonly value: number;
    }
  | {
      readonly field: "attribute";
      readonly name: string;
      readonly operator: "exists";
    }
  | {
      readonly field: "consent";
      readonly operator: "equals";
      readonly value: boolean;
    }
  | {
      readonly field: "campaign";
      readonly campaignId: string;
      readonly outcome:
        | "delivered"
        | "not_delivered"
        | "read"
        | "not_read"
        | "replied"
        | "not_replied"
        | "failed";
    };

/** At most 10 groups, 20 conditions/group, 40 total, 5 campaign conditions,
 * 50 values per `in`, and 16 KiB. Missing, null or wrong-type attributes do not match. */
export interface AudienceSegmentRules {
  readonly match: "all" | "any";
  readonly groups: readonly {
    readonly match: "all" | "any";
    readonly negate?: boolean;
    readonly conditions: readonly AudienceSegmentCondition[];
  }[];
}
export interface AudienceSegment {
  readonly id: string;
  readonly name: string;
  readonly revision: number;
  readonly rules: AudienceSegmentRules;
  readonly createdAt: number;
  readonly updatedAt: number;
}
export interface AudienceSegmentPreview {
  readonly matchedCount: number;
  readonly optedOutCount: number;
  readonly consentWithheldCount: number;
  readonly eligibleCount: number;
  readonly sample: readonly {
    readonly phone: string;
    readonly tags: readonly string[];
  }[];
  readonly evaluatedAt: number;
}
export interface SavedAudienceSegmentPreview extends AudienceSegmentPreview {
  readonly revision: number;
}
export interface CreateAudienceSegmentRequest {
  readonly name: string;
  readonly rules: AudienceSegmentRules;
}
export interface UpdateAudienceSegmentRequest {
  readonly expectedRevision: number;
  readonly name?: string;
  readonly rules?: AudienceSegmentRules;
}
export interface ListAudienceSegmentsParams {
  readonly cursor?: string;
  readonly limit?: number;
}
export interface AudienceSegmentsEnvelope {
  readonly data: readonly AudienceSegment[];
  readonly page: {
    readonly hasMore: boolean;
    readonly nextCursor: string | null;
  };
}
type Result<T> = Promise<ApiResponse<DataEnvelope<T>>>;
/** Organization keys only. Read scopes: campaigns:read; mutations and unsaved
 * preview: campaigns:manage. Create/update/preview require both audience betas.
 * Reads and deletion remain available after withdrawal. Revision conflicts and
 * bounded evaluation timeouts return 409 state_conflict. Re-read/reconcile or
 * simplify rules before retrying. Writes are sent once. */
export class AudienceSegmentsResource {
  constructor(private readonly transport: HttpTransport) {}
  list(
    params: ListAudienceSegmentsParams = {},
    options: RequestOptions = {},
  ): Promise<ApiResponse<AudienceSegmentsEnvelope>> {
    return this.transport.request({
      method: "GET",
      path: "/platform/audience-segments",
      query: { ...params },
      ...options,
    });
  }
  retrieve(id: string, options: RequestOptions = {}): Result<AudienceSegment> {
    return this.transport.request({
      method: "GET",
      path: segmentPath(id),
      ...options,
    });
  }
  create(
    body: CreateAudienceSegmentRequest,
    options: RequestOptions = {},
  ): Result<AudienceSegment> {
    return this.transport.request({
      method: "POST",
      path: "/platform/audience-segments",
      body,
      ...options,
      maxNetworkRetries: 0,
    });
  }
  update(
    id: string,
    body: UpdateAudienceSegmentRequest,
    options: RequestOptions = {},
  ): Result<AudienceSegment> {
    return this.transport.request({
      method: "PATCH",
      path: segmentPath(id),
      body,
      ...options,
      maxNetworkRetries: 0,
    });
  }
  /** Refused while an unlaunched draft uses the segment. Launched campaigns
   * retain segmentSnapshot and recipients; their segmentId becomes null. */
  delete(
    id: string,
    expectedRevision: number,
    options: RequestOptions = {},
  ): Result<{ readonly deleted: true; readonly id: string }> {
    return this.transport.request({
      method: "DELETE",
      path: segmentPath(id),
      query: { expectedRevision },
      ...options,
      maxNetworkRetries: 0,
    });
  }
  preview(
    id: string,
    options: RequestOptions = {},
  ): Result<SavedAudienceSegmentPreview> {
    return this.transport.request({
      method: "GET",
      path: `${segmentPath(id)}/preview`,
      ...options,
    });
  }
  previewRules(
    rules: AudienceSegmentRules,
    options: RequestOptions = {},
  ): Result<AudienceSegmentPreview> {
    return this.transport.request({
      method: "POST",
      path: "/platform/audience-segments/preview",
      body: { rules },
      ...options,
      maxNetworkRetries: 0,
    });
  }
}
function segmentPath(id: string): string {
  return `/platform/audience-segments/${encodeURIComponent(id)}`;
}
