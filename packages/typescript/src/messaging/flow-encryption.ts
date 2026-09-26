import type { MessagingCredential } from "../credentials.js";
import { PolymorfaConfigurationError } from "../errors.js";
import { HttpTransport } from "../transport/http.js";
import type { ApiResponse, RequestOptions } from "../transport/types.js";

export interface FlowEncryptionKey {
  readonly business_public_key: string;
  readonly business_public_key_signature_status: string;
}
export interface FlowEncryptionParams { readonly version: string; }
export interface RegisterFlowEncryptionKeyRequest { readonly businessPublicKey: string; }

/** Public-key registration affects every dynamic Flow on this Meta phone number. */
export class FlowEncryptionResource {
  constructor(private readonly transport: HttpTransport, private readonly credentialType: MessagingCredential["type"]) {}
  retrieve(phoneNumberId: string, params: FlowEncryptionParams, options: RequestOptions = {}): Promise<ApiResponse<{ readonly data: readonly FlowEncryptionKey[] }>> {
    return this.transport.request({ method: "GET", path: this.path(phoneNumberId, params), ...options });
  }
  /** Send once; read the registered key after an uncertain outcome before another write. */
  register(phoneNumberId: string, body: RegisterFlowEncryptionKeyRequest, params: FlowEncryptionParams, options: RequestOptions = {}): Promise<ApiResponse<{ readonly success: true }>> {
    return this.transport.request({ method: "POST", path: this.path(phoneNumberId, params), body: { business_public_key: body.businessPublicKey }, ...options, maxNetworkRetries: 0 });
  }
  private path(phoneNumberId: string, params: FlowEncryptionParams): string {
    if (this.credentialType === "clientToken") throw new PolymorfaConfigurationError("Flow encryption keys require an organization API key or project token.", "credential");
    if (!phoneNumberId.trim() || !params.version.trim()) throw new PolymorfaConfigurationError("Provide a Meta phone number ID and Graph version.");
    return `/graph/whatsapp/${encodeURIComponent(params.version)}/${encodeURIComponent(phoneNumberId)}/whatsapp_business_encryption`;
  }
}
