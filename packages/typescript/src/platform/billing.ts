import { PolymorfaValidationError } from "../errors.js";
import {
  billingId,
  billingRevision,
  billingScope,
  billingPriority,
  billingLimit,
  type BillingScope,
  type BillingLimits,
  type BillingPriorities,
  type ReorderBillingPrioritiesInput,
} from "./billing-controls.js";
import { HttpTransport } from "../transport/http.js";
import type { ApiResponse, RequestOptions } from "../transport/types.js";
import type {
  BillingBalance,
  BillingTransaction,
  BillingUsage,
  DataEnvelope,
  TierPricing,
} from "./types.js";

export class BillingResource {
  constructor(private readonly transport: HttpTransport) {}

  retrieve(
    options: RequestOptions = {},
  ): Promise<ApiResponse<DataEnvelope<BillingBalance>>> {
    return this.get("", options);
  }

  usage(
    options: RequestOptions = {},
  ): Promise<ApiResponse<DataEnvelope<BillingUsage>>> {
    return this.get("/usage", options);
  }

  listTransactions(
    options: RequestOptions = {},
  ): Promise<ApiResponse<DataEnvelope<readonly BillingTransaction[]>>> {
    return this.get("/transactions", options);
  }

  listPricing(
    options: RequestOptions = {},
  ): Promise<ApiResponse<DataEnvelope<readonly TierPricing[]>>> {
    return this.get("/pricing", options);
  }

  /** Monthly credit limits. Organization credentials with billing:read only. */
  getLimits(
    params: { readonly projectId?: string } = {},
    options: RequestOptions = {},
  ): Promise<ApiResponse<DataEnvelope<BillingLimits>>> {
    return this.transport.request({
      method: "GET",
      path: "/platform/billing/limits",
      query:
        params.projectId === undefined
          ? {}
          : { projectId: billingId(params.projectId) },
      ...options,
    });
  }
  setLimit(
    scope: BillingScope,
    resourceId: string,
    input: {
      readonly limitCredits: number | null;
      readonly expectedRevision: number;
    },
    options: RequestOptions = {},
  ): Promise<ApiResponse<DataEnvelope<{ readonly saved: boolean }>>> {
    billingScope(scope);
    billingRevision(input.expectedRevision);
    billingLimit(input.limitCredits);
    return this.transport.request({
      method: "PUT",
      path: `/platform/billing/limits/${scope}/${billingId(resourceId)}`,
      body: {
        limitCredits: input.limitCredits,
        expectedRevision: input.expectedRevision,
      },
      ...options,
    });
  }
  getPriorities(
    options: RequestOptions = {},
  ): Promise<ApiResponse<DataEnvelope<BillingPriorities>>> {
    return this.transport.request({
      method: "GET",
      path: "/platform/billing/priorities",
      ...options,
    });
  }
  setPriority(
    scope: BillingScope,
    resourceId: string,
    input: { readonly priority: number; readonly expectedRevision: number },
    options: RequestOptions = {},
  ): Promise<ApiResponse<DataEnvelope<BillingPriorities>>> {
    billingScope(scope);
    billingRevision(input.expectedRevision);
    billingPriority(input.priority);
    return this.transport.request({
      method: "PUT",
      path: `/platform/billing/priorities/${scope}/${billingId(resourceId)}`,
      body: {
        priority: input.priority,
        expectedRevision: input.expectedRevision,
      },
      ...options,
    });
  }
  reorderPriorities(
    input: ReorderBillingPrioritiesInput,
    options: RequestOptions = {},
  ): Promise<ApiResponse<DataEnvelope<BillingPriorities>>> {
    billingScope(input.scope);
    billingRevision(input.expectedRevision);
    const resourceIds = input.resourceIds.map(billingId);
    if (new Set(resourceIds).size !== resourceIds.length)
      throw new PolymorfaValidationError(
        "resourceIds must not contain duplicates",
        { code: "invalid_billing_control" },
      );
    const body =
      input.scope === "number"
        ? {
            scope: input.scope,
            projectId: billingId(input.projectId),
            resourceIds,
            expectedRevision: input.expectedRevision,
          }
        : {
            scope: input.scope,
            resourceIds,
            expectedRevision: input.expectedRevision,
          };
    return this.transport.request({
      method: "PUT",
      path: "/platform/billing/priorities",
      body,
      ...options,
    });
  }

  private get<T>(
    suffix: "" | "/usage" | "/transactions" | "/pricing",
    options: RequestOptions,
  ): Promise<ApiResponse<DataEnvelope<T>>> {
    return this.transport.request({
      method: "GET",
      path: `/platform/billing${suffix}`,
      ...options,
    });
  }
}
