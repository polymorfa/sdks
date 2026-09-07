import {
  ObservableController,
  type ControllerSnapshot,
} from "../controller.js";

export type QuickLinkStatus =
  | "idle"
  | "launching"
  | "ready"
  | "progress"
  | "complete"
  | "expired"
  | "cancelling"
  | "cancelled"
  | "error";

export interface QuickLinkError {
  readonly code: string;
  readonly message: string;
  readonly recoverable: boolean;
}

export interface QuickLinkSnapshot extends ControllerSnapshot {
  readonly status: QuickLinkStatus;
  readonly sessionId?: string;
  readonly expiresAt?: number;
  readonly qrCode?: string;
  readonly link?: string;
  readonly step?: string;
  readonly detail?: string;
  readonly connectionId?: string;
  readonly error?: QuickLinkError;
}

export interface QuickLinkSession {
  readonly id: string;
  readonly expiresAt: number;
  readonly qrCode?: string;
  readonly link?: string;
}

export type QuickLinkEvent =
  | {
      readonly type: "progress";
      readonly step: string;
      readonly detail?: string;
    }
  | { readonly type: "complete"; readonly connectionId: string }
  | { readonly type: "expired" }
  | {
      readonly type: "error";
      readonly code?: string;
      readonly message: string;
      readonly recoverable?: boolean;
    };

export interface QuickLinkTransport {
  create(signal: AbortSignal): Promise<QuickLinkSession>;
  recover(sessionId: string, signal: AbortSignal): Promise<QuickLinkSession>;
  cancel(sessionId: string, signal: AbortSignal): Promise<void>;
  subscribe(
    sessionId: string,
    listener: (event: QuickLinkEvent) => void,
    signal: AbortSignal,
  ): () => void;
}

export interface QuickLinkControllerOptions {
  readonly now?: () => number;
  readonly setTimeout?: typeof globalThis.setTimeout;
  readonly clearTimeout?: typeof globalThis.clearTimeout;
}

export class QuickLinkController extends ObservableController<QuickLinkSnapshot> {
  readonly #transport: QuickLinkTransport;
  readonly #now: () => number;
  readonly #setTimeout: typeof globalThis.setTimeout;
  readonly #clearTimeout: typeof globalThis.clearTimeout;
  #operation = 0;
  #abort: AbortController | undefined;
  #unsubscribe: (() => void) | undefined;
  #expiryTimer: ReturnType<typeof setTimeout> | undefined;

  constructor(
    transport: QuickLinkTransport,
    options: QuickLinkControllerOptions = {},
  ) {
    const now = options.now ?? Date.now;
    super({ status: "idle" }, now);
    this.#transport = transport;
    this.#now = now;
    this.#setTimeout =
      options.setTimeout ?? globalThis.setTimeout.bind(globalThis);
    this.#clearTimeout =
      options.clearTimeout ?? globalThis.clearTimeout.bind(globalThis);
  }

  async launch(): Promise<void> {
    const operation = this.#beginOperation();
    this.transition({ status: "launching" });
    try {
      const session = await this.#transport.create(this.#abort!.signal);
      this.#activate(session, operation);
    } catch (cause) {
      this.#fail(cause, operation);
    }
  }

  async recover(sessionId: string): Promise<void> {
    const operation = this.#beginOperation();
    this.transition({ status: "launching", sessionId });
    try {
      const session = await this.#transport.recover(
        sessionId,
        this.#abort!.signal,
      );
      this.#activate(session, operation);
    } catch (cause) {
      this.#fail(cause, operation, sessionId);
    }
  }

  async retry(): Promise<void> {
    const { sessionId } = this.getSnapshot();
    return sessionId === undefined ? this.launch() : this.recover(sessionId);
  }

  async cancel(): Promise<void> {
    const { sessionId } = this.getSnapshot();
    const operation = this.#beginOperation();
    if (sessionId === undefined) {
      this.transition({ status: "cancelled" });
      return;
    }
    this.transition({ status: "cancelling", sessionId });
    try {
      await this.#transport.cancel(sessionId, this.#abort!.signal);
      if (operation === this.#operation)
        this.transition({ status: "cancelled", sessionId });
    } catch (cause) {
      this.#fail(cause, operation, sessionId);
    }
  }

  protected override onDispose(): void {
    this.#operation += 1;
    this.#cleanup();
  }

  #beginOperation(): number {
    this.assertActive();
    this.#operation += 1;
    this.#cleanup();
    this.#abort = new AbortController();
    return this.#operation;
  }

  #activate(session: QuickLinkSession, operation: number): void {
    const abort = this.#abort;
    if (
      operation !== this.#operation ||
      abort === undefined ||
      abort.signal.aborted
    )
      return;
    if (!session.id || !Number.isFinite(session.expiresAt)) {
      this.#fail(
        new Error("QuickLink transport returned an invalid session."),
        operation,
      );
      return;
    }
    this.transition({
      status: "ready",
      sessionId: session.id,
      expiresAt: session.expiresAt,
      ...(session.qrCode === undefined ? {} : { qrCode: session.qrCode }),
      ...(session.link === undefined ? {} : { link: session.link }),
    });
    this.#unsubscribe = this.#transport.subscribe(
      session.id,
      (event) => this.#handleEvent(event, operation),
      abort.signal,
    );
    const delay = Math.max(session.expiresAt - this.#now(), 0);
    this.#expiryTimer = this.#setTimeout(() => this.#expire(operation), delay);
  }

  #handleEvent(event: QuickLinkEvent, operation: number): void {
    if (operation !== this.#operation) return;
    const current = this.getSnapshot();
    if (["complete", "expired", "cancelled", "error"].includes(current.status))
      return;
    if (event.type === "progress") {
      this.transition({
        ...sessionFields(current),
        status: "progress",
        step: event.step,
        ...(event.detail === undefined ? {} : { detail: event.detail }),
      });
      return;
    }
    if (event.type === "complete") {
      this.#stopWatching();
      this.transition({
        ...sessionFields(current),
        status: "complete",
        connectionId: event.connectionId,
      });
      return;
    }
    if (event.type === "expired") {
      this.#expire(operation);
      return;
    }
    this.#stopWatching();
    this.transition({
      ...sessionFields(current),
      status: "error",
      error: {
        code: event.code ?? "quicklink_failed",
        message: event.message,
        recoverable: event.recoverable ?? true,
      },
    });
  }

  #expire(operation: number): void {
    if (operation !== this.#operation) return;
    const current = this.getSnapshot();
    if (["complete", "cancelled", "error", "expired"].includes(current.status))
      return;
    this.#stopWatching();
    this.transition({ ...sessionFields(current), status: "expired" });
  }

  #fail(cause: unknown, operation: number, sessionId?: string): void {
    if (operation !== this.#operation || this.#abort?.signal.aborted === true)
      return;
    this.#stopWatching();
    this.transition({
      status: "error",
      ...(sessionId === undefined ? {} : { sessionId }),
      error: {
        code: "quicklink_failed",
        message: cause instanceof Error ? cause.message : "QuickLink failed.",
        recoverable: true,
      },
    });
  }

  #stopWatching(): void {
    this.#unsubscribe?.();
    this.#unsubscribe = undefined;
    if (this.#expiryTimer !== undefined) this.#clearTimeout(this.#expiryTimer);
    this.#expiryTimer = undefined;
  }

  #cleanup(): void {
    this.#abort?.abort();
    this.#abort = undefined;
    this.#stopWatching();
  }
}

function sessionFields(
  snapshot: QuickLinkSnapshot,
): Omit<QuickLinkSnapshot, "status" | "revision" | "updatedAt"> {
  return {
    ...(snapshot.sessionId === undefined
      ? {}
      : { sessionId: snapshot.sessionId }),
    ...(snapshot.expiresAt === undefined
      ? {}
      : { expiresAt: snapshot.expiresAt }),
    ...(snapshot.qrCode === undefined ? {} : { qrCode: snapshot.qrCode }),
    ...(snapshot.link === undefined ? {} : { link: snapshot.link }),
  };
}
