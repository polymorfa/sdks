import { PolymorfaValidationError } from "../errors.js";
import { HttpTransport } from "../transport/http.js";
import type {
  ApiResponse,
  RawRequest,
  RequestOptions,
} from "../transport/types.js";
import { type DataEnvelope, unwrapResponse } from "./response.js";

export interface FunctionDefinition {
  readonly id: string;
  readonly projectId: string;
  readonly name: string;
  readonly enabled: boolean;
  readonly revision: number;
  readonly activeDeploymentId: string | null;
  readonly createdAt: string;
  readonly updatedAt: string;
}
export interface FunctionPage<T> {
  readonly items: readonly T[];
  readonly nextCursor: string | null;
}
export interface ListFunctionsParams {
  readonly limit?: number;
  readonly before?: string;
}
export interface CreateFunctionInput {
  readonly functionId?: string;
  readonly name: string;
}
export interface UpdateFunctionInput {
  readonly expectedRevision: number;
  readonly name?: string;
  readonly enabled?: boolean;
}
export interface CreateFunctionDeploymentInput {
  readonly deploymentId: string;
  readonly source: string;
  readonly language: "javascript" | "typescript" | "visual";
  readonly region: string;
  readonly compatibilityDate: string;
  readonly secretVersionIds?: readonly string[];
  readonly egressOrigins?: readonly string[];
}
export interface FunctionDeployment extends Omit<
  CreateFunctionDeploymentInput,
  "deploymentId" | "secretVersionIds" | "egressOrigins"
> {
  readonly id: string;
  readonly functionId: string;
  readonly sha256: string;
  readonly secretVersionIds: readonly string[];
  readonly egressOrigins: readonly string[];
  readonly createdAt: string;
}
export interface FunctionSecretVersion {
  readonly id: string;
  readonly name: string;
  readonly createdAt: string;
  readonly revokedAt: string | null;
}
export interface FunctionRequest {
  readonly method:
    "GET" | "HEAD" | "POST" | "PUT" | "PATCH" | "DELETE" | "OPTIONS";
  /** A synthetic URL on https://function.polymorfa.invalid; never a network destination. */
  readonly url: string;
  readonly headers: Readonly<Record<string, string>>;
  readonly bodyBase64: string;
}
export interface FunctionResponse {
  readonly status: number;
  readonly headers: Readonly<Record<string, string>>;
  readonly bodyBase64: string;
}
export interface FunctionInvocation {
  readonly id: string;
  readonly functionId: string;
  readonly deploymentId: string;
  readonly outcome:
    "running" | "succeeded" | "failed" | "unknown" | "unavailable";
  readonly trigger: "http" | "flow" | "test";
  readonly errorCode: string | null;
  readonly durationMs: number | null;
  readonly responseBytes: number | null;
  readonly attempt: number;
  readonly createdAt: string;
  readonly completedAt: string | null;
}
export interface CreateFunctionInvocationInput {
  readonly deploymentId?: string;
  readonly request: FunctionRequest;
  readonly trigger?: "http" | "test";
}
export interface FunctionInvocationResult {
  readonly receipt: FunctionInvocation;
  readonly replayed: boolean;
  /** Present only on the initial successful response; never retained for replay. */
  readonly response?: FunctionResponse;
  readonly responseRetained: false;
  /** True only when the executor proved that execution did not start. */
  readonly retryable: boolean;
}
export interface FunctionInvocationOptions extends RequestOptions {
  readonly idempotencyKey: string;
}
export interface FunctionMutationResult {
  readonly ok: true;
}

class FunctionTransport {
  constructor(
    private readonly transport: HttpTransport,
    private readonly projectId: string,
  ) {}
  request<T>(
    method: RawRequest["method"],
    path: string,
    input: object | undefined,
    options: RequestOptions,
  ): Promise<ApiResponse<T>> {
    if (
      input &&
      (Object.hasOwn(input, "projectId") ||
        (path !== "" && Object.hasOwn(input, "functionId")))
    )
      throw invalid(
        "Function input cannot override its project or path identity",
      );
    identifier(this.projectId);
    const value = { ...input, projectId: this.projectId };
    return this.transport
      .request<DataEnvelope<T>>({
        ...options,
        method,
        path: `/platform/functions${path}`,
        ...(method === "GET" || method === "DELETE"
          ? { query: value }
          : { body: value }),
        // An uncertain invocation or write is never automatically repeated.
        ...(method === "GET" ? {} : { maxNetworkRetries: 0 }),
      })
      .then(unwrapResponse);
  }
}

/** Project-owned Functions. Obtain through client.project(projectId).functions. */
export class FunctionsResource {
  private readonly api: FunctionTransport;
  readonly deployments: FunctionDeploymentsResource;
  readonly secrets: FunctionSecretsResource;
  readonly invocations: FunctionInvocationsResource;
  constructor(transport: HttpTransport, projectId: string) {
    this.api = new FunctionTransport(transport, projectId);
    this.deployments = new FunctionDeploymentsResource(this.api);
    this.secrets = new FunctionSecretsResource(this.api);
    this.invocations = new FunctionInvocationsResource(this.api);
  }
  list(params: ListFunctionsParams = {}, options: RequestOptions = {}) {
    return this.api.request<FunctionPage<FunctionDefinition>>(
      "GET",
      "",
      params,
      options,
    );
  }
  create(
    input: CreateFunctionInput,
    options: RequestOptions = {},
  ): Promise<ApiResponse<FunctionDefinition>> {
    // functionId is an optional creation identity, not an override of a path.
    if (input.functionId !== undefined) identifier(input.functionId);
    if (Object.hasOwn(input, "projectId"))
      throw invalid("Function input cannot override its project");
    return this.api.request<FunctionDefinition>("POST", "", input, options);
  }
  retrieve(functionId: string, options: RequestOptions = {}) {
    return this.api.request<FunctionDefinition>(
      "GET",
      `/${identifier(functionId)}`,
      undefined,
      options,
    );
  }
  update(
    functionId: string,
    input: UpdateFunctionInput,
    options: RequestOptions = {},
  ) {
    revision(input.expectedRevision);
    return this.api.request<FunctionDefinition>(
      "PATCH",
      `/${identifier(functionId)}`,
      input,
      options,
    );
  }
  delete(
    functionId: string,
    expectedRevision: number,
    options: RequestOptions = {},
  ) {
    revision(expectedRevision);
    return this.api.request<FunctionMutationResult>(
      "DELETE",
      `/${identifier(functionId)}`,
      { expectedRevision },
      options,
    );
  }
}
export class FunctionDeploymentsResource {
  constructor(private readonly api: FunctionTransport) {}
  list(
    functionId: string,
    params: ListFunctionsParams = {},
    options: RequestOptions = {},
  ) {
    return this.api.request<FunctionPage<FunctionDeployment>>(
      "GET",
      `/${identifier(functionId)}/deployments`,
      params,
      options,
    );
  }
  create(
    functionId: string,
    input: CreateFunctionDeploymentInput,
    options: RequestOptions = {},
  ) {
    identifier(input.deploymentId);
    return this.api.request<FunctionDeployment>(
      "POST",
      `/${identifier(functionId)}/deployments`,
      input,
      options,
    );
  }
  retrieve(
    functionId: string,
    deploymentId: string,
    options: RequestOptions = {},
  ) {
    return this.api.request<FunctionDeployment>(
      "GET",
      `/${identifier(functionId)}/deployments/${identifier(deploymentId)}`,
      undefined,
      options,
    );
  }
  promote(
    functionId: string,
    input: { readonly deploymentId: string; readonly expectedRevision: number },
    options: RequestOptions = {},
  ) {
    identifier(input.deploymentId);
    revision(input.expectedRevision);
    return this.api.request<FunctionDefinition>(
      "PUT",
      `/${identifier(functionId)}/promotion`,
      input,
      options,
    );
  }
}
export class FunctionSecretsResource {
  constructor(private readonly api: FunctionTransport) {}
  list(
    functionId: string,
    params: ListFunctionsParams = {},
    options: RequestOptions = {},
  ) {
    return this.api.request<FunctionPage<FunctionSecretVersion>>(
      "GET",
      `/${identifier(functionId)}/secrets`,
      params,
      options,
    );
  }
  create(
    functionId: string,
    input: { readonly name: string; readonly value: string },
    options: RequestOptions = {},
  ) {
    return this.api.request<FunctionSecretVersion>(
      "POST",
      `/${identifier(functionId)}/secrets`,
      input,
      options,
    );
  }
  revoke(functionId: string, versionId: string, options: RequestOptions = {}) {
    return this.api.request<FunctionMutationResult>(
      "DELETE",
      `/${identifier(functionId)}/secrets/${identifier(versionId)}`,
      undefined,
      options,
    );
  }
}
export class FunctionInvocationsResource {
  constructor(private readonly api: FunctionTransport) {}
  list(
    functionId: string,
    params: ListFunctionsParams = {},
    options: RequestOptions = {},
  ) {
    return this.api.request<FunctionPage<FunctionInvocation>>(
      "GET",
      `/${identifier(functionId)}/invocations`,
      params,
      options,
    );
  }
  retrieve(
    functionId: string,
    invocationId: string,
    options: RequestOptions = {},
  ) {
    return this.api.request<FunctionInvocation>(
      "GET",
      `/${identifier(functionId)}/invocations/${identifier(invocationId)}`,
      undefined,
      options,
    );
  }
  create(
    functionId: string,
    input: CreateFunctionInvocationInput,
    options: FunctionInvocationOptions,
  ) {
    if (
      typeof options?.idempotencyKey !== "string" ||
      !/^[\x21-\x7e]{1,128}$/.test(options.idempotencyKey)
    )
      throw invalid("A valid invocation idempotency key is required");
    if (input.deploymentId !== undefined) identifier(input.deploymentId);
    return this.api.request<FunctionInvocationResult>(
      "POST",
      `/${identifier(functionId)}/invocations`,
      input,
      options,
    );
  }
}
function identifier(value: unknown): string {
  if (
    typeof value !== "string" ||
    !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(
      value,
    )
  )
    throw invalid("A canonical Functions UUID is required");
  return value;
}
function revision(value: number): void {
  if (!Number.isSafeInteger(value) || value < 1)
    throw invalid("A positive Function revision is required");
}
function invalid(message: string) {
  return new PolymorfaValidationError(message, {
    code: "invalid_function_input",
  });
}
