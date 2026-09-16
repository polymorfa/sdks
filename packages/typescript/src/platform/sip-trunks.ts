import {
  PolymorfaConfigurationError,
  PolymorfaNotFoundError,
} from "../errors.js";
import { HttpTransport } from "../transport/http.js";
import type { ApiResponse, RequestOptions } from "../transport/types.js";
import type { ClientOwner } from "./developer-types.js";
import { type DataEnvelope, unwrapResponse } from "./response.js";

/** Which way calls cross the trunk. */
export type SipTrunkDirection = "outbound" | "inbound" | "both";
export type SipTransport = "udp" | "tcp" | "tls";
export type SipCodec = "PCMU" | "PCMA" | "opus";

/** Where Polymorfa sends the incoming WhatsApp calls routed to the trunk. */
export interface SipTrunkOutbound {
  readonly targetUri: string;
  readonly transport: SipTransport;
  readonly authUsername: string | null;
  /** Whether a password is stored for `authUsername`. Passwords are never returned. */
  readonly hasPassword: boolean;
  readonly fromUser: string | null;
}

/** How your PBX places WhatsApp calls through the trunk. */
export interface SipTrunkInbound {
  readonly username: string;
  readonly realm: string;
  /** Session that places the calls, or `null` while calls are refused. */
  readonly session: string | null;
  readonly allowedAddresses: readonly string[];
  /** E.164 prefixes your PBX may call. Empty allows every destination. */
  readonly allowedDestinations: readonly string[];
}

export interface SipTrunk {
  readonly id: string;
  readonly projectId: string;
  readonly name: string;
  readonly enabled: boolean;
  readonly direction: SipTrunkDirection;
  readonly outbound: SipTrunkOutbound | null;
  readonly inbound: SipTrunkInbound | null;
  readonly codecs: readonly SipCodec[];
  readonly maxConcurrentCalls: number;
  /** Increases on every change. Send it as `expectedRevision` to guard updates. */
  readonly revision: number;
  readonly createdAt: string;
  readonly updatedAt: string;
}

/** Digest credentials for your PBX. The password is returned only once. */
export interface SipTrunkCredentials {
  readonly username: string;
  readonly password: string;
  readonly realm: string;
}

export interface SipTrunkCreated {
  readonly trunk: SipTrunk;
  /** Present when the trunk accepts calls from your PBX. */
  readonly inboundCredentials?: SipTrunkCredentials;
}

export interface SipTrunkDeleted {
  readonly id: string;
  readonly deleted: true;
}

export interface SipTrunkOutboundInput {
  readonly targetUri: string;
  readonly transport: SipTransport;
  /** Send `null` to remove the username and password. */
  readonly authUsername?: string | null;
  /** Write-only. Omit on update to keep the stored password. */
  readonly authPassword?: string;
  readonly fromUser?: string | null;
}

export interface SipTrunkInboundInput {
  readonly session?: string | null;
  readonly allowedAddresses: readonly string[];
  readonly allowedDestinations?: readonly string[];
}

export interface CreateSipTrunkInput {
  readonly name: string;
  readonly enabled?: boolean;
  readonly direction: SipTrunkDirection;
  /** Required unless `direction` is `inbound`. */
  readonly outbound?: SipTrunkOutboundInput;
  /** Required unless `direction` is `outbound`. */
  readonly inbound?: SipTrunkInboundInput;
  readonly codecs?: readonly SipCodec[];
  readonly maxConcurrentCalls?: number;
}

export interface UpdateSipTrunkInput {
  /** Refuse the change with `sip_trunk_revision_conflict` if the trunk has another revision. */
  readonly expectedRevision?: number;
  readonly name?: string;
  readonly enabled?: boolean;
  readonly direction?: SipTrunkDirection;
  readonly outbound?: Partial<SipTrunkOutboundInput>;
  readonly inbound?: Partial<SipTrunkInboundInput>;
  readonly codecs?: readonly SipCodec[];
  readonly maxConcurrentCalls?: number;
}

type ProjectArgument<O extends ClientOwner> = O extends "project"
  ? []
  : [projectId: string];

/**
 * SIP trunks connect a PBX or carrier trunk to the WhatsApp calls of a
 * project's sessions. Team clients name the project on `list` and `create`;
 * project clients use their own project.
 */
export class SipTrunksResource<O extends ClientOwner> {
  constructor(
    private readonly transport: HttpTransport,
    private readonly projectId: string | null,
    /**
     * Team keys can reach every trunk of the team by ID, so a project client
     * built from one checks a trunk's project before acting on it.
     */
    private readonly confineById: boolean,
  ) {}

  list(
    ...args: [...ProjectArgument<O>, options?: RequestOptions]
  ): Promise<ApiResponse<readonly SipTrunk[]>> {
    const [projectId, options] = this.#split(args);
    return this.transport
      .request<DataEnvelope<readonly SipTrunk[]>>({
        method: "GET",
        path: "/platform/sip-trunks",
        query: { projectId },
        ...options,
      })
      .then(unwrapResponse);
  }

  create(
    ...args: [
      ...ProjectArgument<O>,
      input: CreateSipTrunkInput,
      options?: RequestOptions,
    ]
  ): Promise<ApiResponse<SipTrunkCreated>> {
    const values = args as unknown[];
    const projectId = this.projectId ?? requireProjectId(values.shift());
    const input = values[0] as CreateSipTrunkInput;
    const options = (values[1] as RequestOptions | undefined) ?? {};
    return this.transport
      .request<DataEnvelope<SipTrunkCreated>>({
        method: "POST",
        path: "/platform/sip-trunks",
        body: { ...input, projectId },
        ...options,
      })
      .then(unwrapResponse);
  }

  retrieve(
    trunkId: string,
    options: RequestOptions = {},
  ): Promise<ApiResponse<SipTrunk>> {
    return this.#retrieve(trunkId, options).then((response) => {
      this.#assertProject(trunkId, response.data);
      return response;
    });
  }

  async update(
    trunkId: string,
    input: UpdateSipTrunkInput,
    options: RequestOptions = {},
  ): Promise<ApiResponse<SipTrunk>> {
    await this.#confine(trunkId, options);
    return this.transport
      .request<DataEnvelope<SipTrunk>>({
        method: "PATCH",
        path: trunkPath(trunkId),
        body: input,
        ...options,
      })
      .then(unwrapResponse);
  }

  /** Fails with `sip_trunk_in_use` while a session routes incoming calls to the trunk. */
  async delete(
    trunkId: string,
    options: RequestOptions = {},
  ): Promise<ApiResponse<SipTrunkDeleted>> {
    await this.#confine(trunkId, options);
    return this.transport
      .request<DataEnvelope<SipTrunkDeleted>>({
        method: "DELETE",
        path: trunkPath(trunkId),
        ...options,
      })
      .then(unwrapResponse);
  }

  /** Replaces the password your PBX uses. The previous one stops working within about a minute. */
  async rotateCredentials(
    trunkId: string,
    options: RequestOptions = {},
  ): Promise<ApiResponse<SipTrunkCredentials>> {
    await this.#confine(trunkId, options);
    return this.transport
      .request<DataEnvelope<SipTrunkCredentials>>({
        method: "POST",
        path: `${trunkPath(trunkId)}/credentials`,
        ...options,
      })
      .then(unwrapResponse);
  }

  #split(args: readonly unknown[]): [string, RequestOptions] {
    if (this.projectId !== null) {
      return [this.projectId, (args[0] as RequestOptions | undefined) ?? {}];
    }
    return [
      requireProjectId(args[0]),
      (args[1] as RequestOptions | undefined) ?? {},
    ];
  }

  #retrieve(trunkId: string, options: RequestOptions) {
    return this.transport
      .request<DataEnvelope<SipTrunk>>({
        method: "GET",
        path: trunkPath(trunkId),
        ...options,
      })
      .then(unwrapResponse);
  }

  async #confine(trunkId: string, options: RequestOptions): Promise<void> {
    if (!this.confineById) return;
    const { signal } = options;
    const response = await this.#retrieve(trunkId, signal ? { signal } : {});
    this.#assertProject(trunkId, response.data);
  }

  #assertProject(trunkId: string, trunk: SipTrunk): void {
    if (
      this.projectId !== null &&
      trunk.projectId.toLowerCase() !== this.projectId.toLowerCase()
    ) {
      throw new PolymorfaNotFoundError("SIP trunk not found.", {
        code: "resource_not_found",
        status: 404,
        details: { trunkId },
      });
    }
  }
}

function trunkPath(trunkId: string): string {
  if (typeof trunkId !== "string" || trunkId.trim().length === 0) {
    throw new PolymorfaConfigurationError(
      "A SIP trunk id is required.",
      "trunkId",
    );
  }
  return `/platform/sip-trunks/${encodeURIComponent(trunkId)}`;
}

function requireProjectId(value: unknown): string {
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new PolymorfaConfigurationError(
      "A projectId is required for team clients.",
      "projectId",
    );
  }
  return value;
}
