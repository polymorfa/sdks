import type {
  ClientTokenClaims,
  ClientTokenMint,
  ClientTokenSubject,
} from "./token-route.js";

export interface MessagingClientTokenMintRequest {
  readonly session: string;
  readonly ephemeralId: string;
  readonly ttlSeconds?: number;
}

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
  if (
    typeof input.session !== "string" ||
    input.session.length === 0 ||
    typeof input.ephemeralId !== "string" ||
    input.ephemeralId.length === 0
  ) {
    throw new TypeError(
      "session and ephemeralId are required to mint a client token.",
    );
  }
}
