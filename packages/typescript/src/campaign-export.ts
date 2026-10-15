import { PolymorfaServerError } from "./errors.js";
import { campaignContractOptions } from "./campaign-contract-validation.js";
import type { CampaignRecipientExportPage } from "./campaign-contracts.js";
import type { HttpTransport } from "./transport/http.js";
import { parseContentDispositionFilename } from "./transport/content-disposition.js";
import type { ApiResponse, RequestOptions } from "./transport/types.js";

/** One finite CSV page; no redirects, parsing/requoting or automatic next page. */
export async function requestCampaignExport(
  transport: HttpTransport,
  path: string,
  query: Readonly<Record<string, string | number>>,
  options: RequestOptions,
): Promise<ApiResponse<CampaignRecipientExportPage>> {
  const response = await transport.requestText(
    {
      ...campaignContractOptions(options),
      method: "GET",
      path,
      query,
    },
    "text/csv",
  );
  if (
    response.metadata.status !== 200 ||
    response.metadata.headers["content-type"]
      ?.split(";")[0]
      ?.trim()
      .toLowerCase() !== "text/csv"
  ) {
    throw new PolymorfaServerError("The API did not return a CSV export.", {
      code: "invalid_response",
      status: response.metadata.status,
      ...(response.metadata.requestId === undefined
        ? {}
        : { requestId: response.metadata.requestId }),
      metadata: response.metadata,
    });
  }
  return {
    data: {
      csv: response.data,
      nextCursor: response.metadata.headers["polymorfa-next-cursor"] ?? null,
      filename:
        parseContentDispositionFilename(
          response.metadata.headers["content-disposition"],
        ) ?? null,
    },
    metadata: response.metadata,
  };
}
