import { PolymorfaValidationError } from "../errors.js";
import {
  billingId,
  billingRevision,
  billingScope,
  billingPriority,
  billingLimit,
  type BillingScope,
  type ResourceBillingControls,
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

  getResourceControls(
    scope: BillingScope,
    resourceId: string,
    options: RequestOptions = {},
  ): Promise<ApiResponse<DataEnvelope<ResourceBillingControls>>> {
    billingScope(scope);
    return this.transport.request({
      method: "GET",
      path: `/platform/billing/controls/${scope}/${billingId(resourceId)}`,
      ...options,
    });
  }
  setResourceControls(
    scope: BillingScope,
    resourceId: string,
    input: {
      readonly limitCredits: number | null;
      readonly priority: number;
      readonly expectedBudgetRevision: number;
      readonly expectedPriorityRevision: number;
    },
    options: RequestOptions = {},
  ): Promise<ApiResponse<DataEnvelope<ResourceBillingControls>>> {
    billingScope(scope);
    billingLimit(input.limitCredits);
    billingPriority(input.priority);
    billingRevision(input.expectedBudgetRevision);
    billingRevision(input.expectedPriorityRevision);
    return this.transport.request({
      method: "PUT",
      path: `/platform/billing/controls/${scope}/${billingId(resourceId)}`,
      body: {
        limitCredits: input.limitCredits,
        priority: input.priority,
        expectedBudgetRevision: input.expectedBudgetRevision,
        expectedPriorityRevision: input.expectedPriorityRevision,
      },
      ...options,
    });
  }
  /** Monthly credit limits. Organization credentials with billing:read only. */
  getLimits(
    params: { readonly projectId?: string; readonly scope?: "project" } = {},
    options: RequestOptions = {},
  ): Promise<ApiResponse<DataEnvelope<BillingLimits>>> {
    if (params.scope !== undefined && params.scope !== "project")
      throw new PolymorfaValidationError("Read scope must be project.");
    return this.transport.request({
      method: "GET",
      path: "/platform/billing/limits",
      query: {
        ...(params.projectId === undefined
          ? {}
          : { projectId: billingId(params.projectId) }),
        ...(params.scope === undefined ? {} : { scope: params.scope }),
      },
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
    params: { readonly scope?: "project"; readonly projectId?: string } = {},
    options: RequestOptions = {},
  ): Promise<ApiResponse<DataEnvelope<BillingPriorities>>> {
    if (params.scope !== undefined && params.scope !== "project")
      throw new PolymorfaValidationError("Read scope must be project.");
    return this.transport.request({
      method: "GET",
      path: "/platform/billing/priorities",
      query: {
        ...(params.scope === undefined ? {} : { scope: params.scope }),
        ...(params.projectId === undefined
          ? {}
          : { projectId: billingId(params.projectId) }),
      },
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
    billingRevision(input.expectedRevision);
    if (input.scope === "resource") {
      const resources = input.resources.map((row) => {
        if (row.scope !== "customer" && row.scope !== "number")
          throw new PolymorfaValidationError(
            "Resource scope must be customer or number.",
          );
        return { scope: row.scope, resourceId: billingId(row.resourceId) };
      });
      if (
        resources.length > 1000000 ||
        new Set(resources.map((r) => `${r.scope}:${r.resourceId}`)).size !==
          resources.length
      )
        throw new PolymorfaValidationError(
          "resources must be a unique complete list.",
        );
      return this.transport.request({
        method: "PUT",
        path: "/platform/billing/priorities",
        body: {
          scope: input.scope,
          projectId: billingId(input.projectId),
          resources,
          expectedRevision: input.expectedRevision,
        },
        ...options,
      });
    }
    billingScope(input.scope);
    const resourceIds = input.resourceIds.map(billingId);
    if (new Set(resourceIds).size !== resourceIds.length)
      throw new PolymorfaValidationError(
        "resourceIds must not contain duplicates",
        { code: "invalid_billing_control" },
      );
    const body =
      input.scope !== "project"
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
