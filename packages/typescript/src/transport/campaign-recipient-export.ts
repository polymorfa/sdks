import { PolymorfaServerError } from "../errors.js";
import type { CampaignRecipientsCsvPage } from "../messaging/types.js";
import type { HttpTransport } from "./http.js";
import type { ApiResponse, QueryValue, RequestOptions } from "./types.js";

/** Read one CSV page, preserving the API's opaque continuation cursor. */
export async function campaignRecipientExportPage(
  transport: HttpTransport,
  path: string,
  query: Readonly<Record<string, QueryValue>>,
  options: RequestOptions,
): Promise<ApiResponse<CampaignRecipientsCsvPage>> {
  const response = await transport.requestText(
    { method: "GET", path, query, ...options },
    "text/csv",
  );
  if (
    response.metadata.headers["content-type"]
      ?.split(";", 1)[0]
      ?.trim()
      .toLowerCase() !== "text/csv"
  ) {
    throw new PolymorfaServerError(
      "The Polymorfa API returned an unexpected campaign recipient export content type.",
      {
        code: "invalid_response",
        status: response.metadata.status,
        ...(response.metadata.requestId === undefined
          ? {}
          : { requestId: response.metadata.requestId }),
        metadata: response.metadata,
      },
    );
  }
  const next = response.metadata.headers["polymorfa-next-cursor"];
  return Object.freeze({
    data: Object.freeze({
      csv: response.data,
      nextCursor: next === undefined || next === "" ? null : next,
    }),
    metadata: response.metadata,
  });
}
