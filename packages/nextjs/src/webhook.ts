export type WebhookConstructor<TEvent> = (
  rawBody: ArrayBuffer,
  signature: string,
  secret: string,
) => Promise<TEvent>;

export interface WebhookRequestOptions<TEvent> {
  /** Pass `constructWebhookEvent` from `@polymorfa/sdk`. */
  readonly constructEvent: WebhookConstructor<TEvent>;
  readonly secret: string;
  readonly signatureHeader?: string;
}

/** Reads the raw body exactly once, then delegates signature verification and parsing to the server SDK. */
export async function readVerifiedWebhook<TEvent>(
  request: Request,
  options: WebhookRequestOptions<TEvent>,
): Promise<TEvent> {
  if (request.bodyUsed) {
    throw new TypeError("Webhook request body has already been consumed.");
  }
  if (options.secret.length === 0) {
    throw new TypeError("Webhook secret must not be empty.");
  }
  const headerName = options.signatureHeader ?? "x-webhook-signature";
  const signature = request.headers.get(headerName);
  if (signature === null || signature.length === 0) {
    throw new TypeError(`Missing webhook signature header: ${headerName}.`);
  }
  const rawBody = await request.arrayBuffer();
  return options.constructEvent(rawBody, signature, options.secret);
}
