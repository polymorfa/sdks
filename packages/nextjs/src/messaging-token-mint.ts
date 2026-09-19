import type {
  ClientTokenClaims,
  ClientTokenMint,
  ClientTokenSubject,
} from "./token-route.js";

/** Actions a Customer-scoped client token can carry in `allow`. */
export type CustomerClientTokenAction =
  | "send_message"
  | "send_reaction"
  | "send_typing"
  | "send_seen"
  | "read_presence"
  | "subscribe_presence"
  | "read_contact";

/**
 * What `resolve` returns: a token for one `session`, or (beta) for the
 * numbers one `customer` owns, optionally narrowed by `allow`.
 */
export type MessagingClientTokenMintRequest =
  | {
      readonly session: string;
      readonly ephemeralId: string;
      readonly ttlSeconds?: number;
      readonly customer?: never;
      readonly allow?: never;
    }
  | {
      /** Polymorfa Customer ID. Never pass your own external ID. */
      readonly customer: string;
      readonly allow?: readonly CustomerClientTokenAction[];
      readonly ephemeralId: string;
      readonly ttlSeconds?: number;
      readonly session?: never;
    };

export interface MessagingClientTokenMintResource {
  mint(
    input: MessagingClientTokenMintRequest,
    options: { readonly signal: AbortSignal },
  ): Promise<{
    readonly data: {
      readonly success: true;
      readonly data: {
        readonly token: string;
        readonly expiresAt: string;
      };
    };
  }>;
}

export interface MessagingClientTokenMintOptions {
  readonly clientTokens: MessagingClientTokenMintResource;
  readonly resolve: (
    subject: ClientTokenSubject,
    request: Request,
  ) =>
    MessagingClientTokenMintRequest | Promise<MessagingClientTokenMintRequest>;
}

export function createMessagingClientTokenMint(
  options: MessagingClientTokenMintOptions,
): ClientTokenMint {
  if (
    typeof options.clientTokens?.mint !== "function" ||
    typeof options.resolve !== "function"
  ) {
    throw new TypeError("clientTokens.mint and resolve must be functions.");
  }

  return async (
    subject: ClientTokenSubject,
    request: Request,
  ): Promise<ClientTokenClaims> => {
    const input = await options.resolve(subject, request);
    validateInput(input);
    const response = await options.clientTokens.mint(input, {
      signal: request.signal,
    });
    const token = response.data?.data?.token;
    const expiresAt = Date.parse(response.data?.data?.expiresAt ?? "");
    if (
      typeof token !== "string" ||
      !token.startsWith("pmfa_ct_") ||
      token.length <= "pmfa_ct_".length ||
      !Number.isFinite(expiresAt)
    ) {
      throw new TypeError(
        "The server SDK returned an invalid client token response.",
      );
    }
    return Object.freeze({
      value: token,
      audience: "browser",
      expiresAt,
    });
  };
}

function validateInput(input: MessagingClientTokenMintRequest): void {
  const hasSession =
    typeof input.session === "string" && input.session.length > 0;
  const hasCustomer =
    typeof input.customer === "string" && input.customer.length > 0;
  if (
    hasSession === hasCustomer ||
    typeof input.ephemeralId !== "string" ||
    input.ephemeralId.length === 0
  ) {
    throw new TypeError(
      "Exactly one of session or customer, and an ephemeralId, are required to mint a client token.",
    );
  }
  if (input.allow !== undefined && !hasCustomer) {
    throw new TypeError(
      "allow is only supported for Customer-scoped client tokens.",
    );
  }
}
