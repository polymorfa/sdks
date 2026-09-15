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
