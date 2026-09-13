export interface ClientTokenSubject {
  readonly userId: string;
  readonly projectId?: string;
  readonly organizationId?: string;
}

export interface ClientTokenClaims {
  readonly value: string;
  readonly audience: "browser";
  readonly expiresAt: number;
  readonly scopes?: readonly string[];
}

export type ClientTokenMint = (
  subject: ClientTokenSubject,
  request: Request,
) => Promise<ClientTokenClaims>;

export interface ClientTokenRouteOptions {
  readonly mint: ClientTokenMint;
  readonly authorize: (
    request: Request,
  ) => Promise<ClientTokenSubject | null> | ClientTokenSubject | null;
}

/** Creates a Next.js App Router-compatible POST route without importing Next.js. */
export function createClientTokenRoute(
  options: ClientTokenRouteOptions,
): (request: Request) => Promise<Response> {
  if (
    typeof options.authorize !== "function" ||
    typeof options.mint !== "function"
  ) {
    throw new TypeError("authorize and mint must be functions.");
  }

  return async (request: Request): Promise<Response> => {
    if (request.method !== "POST") {
      return jsonError(
        405,
        "method_not_allowed",
        "Use POST to mint a client token.",
        {
          Allow: "POST",
        },
      );
    }

    try {
      const subject = await options.authorize(request);
      if (subject === null) {
        return jsonError(401, "unauthorized", "Authentication is required.");
      }
      validateSubject(subject);
      const token = await options.mint(subject, request);
      validateToken(token);
      return Response.json(token, {
        status: 200,
        headers: privateHeaders,
      });
    } catch (error) {
      if (error instanceof RouteInputError) {
        return jsonError(400, error.code, error.message);
      }
      return jsonError(
        500,
        "token_mint_failed",
        "Unable to mint a client token.",
      );
    }
  };
}

const privateHeaders = {
  "Cache-Control": "no-store, private",
  Vary: "Cookie, Authorization",
};

function jsonError(
  status: number,
  code: string,
  message: string,
  headers: Record<string, string> = {},
): Response {
  return Response.json(
    { error: { code, message } },
    { status, headers: { ...privateHeaders, ...headers } },
  );
}

function validateSubject(subject: ClientTokenSubject): void {
  if (typeof subject.userId !== "string" || subject.userId.length === 0) {
    throw new RouteInputError("invalid_subject", "userId is required.");
  }
}

function validateToken(token: ClientTokenClaims): void {
  if (!token.value.startsWith("pmfa_ct_") || token.audience !== "browser") {
    throw new RouteInputError(
      "invalid_client_token",
      "Mint returned an invalid client token.",
    );
  }
  if (!Number.isFinite(token.expiresAt) || token.expiresAt <= Date.now()) {
    throw new RouteInputError(
      "invalid_client_token",
      "Mint returned an expired client token.",
    );
  }
}

class RouteInputError extends Error {
  constructor(
    readonly code: string,
    message: string,
  ) {
    super(message);
  }
}
