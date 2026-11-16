import { CallsError } from "./errors.js";
import { createConnectionId, type Participant } from "./protocol.js";

/** Pending guests use the same public identity as their later call roster entry. */
export interface WaitingRoomState {
  readonly enabled: boolean;
  readonly isAdmin: boolean;
  readonly inWaitingRoom: boolean;
  readonly users: readonly Participant[];
}
export type WaitingRoomAction =
  | { readonly operation: "toggle"; readonly enabled: boolean }
  | { readonly operation: "admit" | "deny"; readonly participantId: string };
export type WaitingRoomRequest = WaitingRoomAction & {
  readonly type: "waiting_room_control";
  readonly requestId: string;
};
export type WaitingRoomResult = {
  readonly type: "waiting_room_result";
  readonly requestId: string;
  readonly ok: boolean;
  readonly code?: string;
};

/** @internal Commands are bounded, ordered and never replayed after uncertainty. */
export class WaitingRoomCommands {
  #tail: Promise<unknown> = Promise.resolve();
  #queued = 0;
  #closed = false;
  #pending:
    { id: string; finish: (result?: WaitingRoomResult) => void } | undefined;
  constructor(readonly send: (frame: WaitingRoomRequest) => boolean) {}

  execute(action: WaitingRoomAction): Promise<void> {
    if (
      action.operation === "toggle"
        ? typeof action.enabled !== "boolean"
        : !["admit", "deny"].includes(action.operation) ||
          !/^[1-9][0-9]{0,18}$/.test(action.participantId)
    )
      return Promise.reject(
        new TypeError(
          "Specify a waiting-room operation and public participant ID.",
        ),
      );
    if (this.#closed || this.#queued >= 16)
      return Promise.reject(
        new CallsError(
          "waiting_room_unavailable",
          "Waiting-room controls are unavailable.",
        ),
      );
    const requested: WaitingRoomAction =
      action.operation === "toggle"
        ? { operation: "toggle", enabled: action.enabled }
        : { operation: action.operation, participantId: action.participantId };
    this.#queued++;
    const result = this.#tail.then(() => this.#request(requested));
    this.#tail = result
      .catch(() => undefined)
      .finally(() => {
        this.#queued--;
      });
    return result;
  }
  receive(result: WaitingRoomResult): void {
    if (result.requestId === this.#pending?.id) this.#pending.finish(result);
  }
  close(): void {
    this.#closed = true;
    this.#pending?.finish();
  }
  #request(action: WaitingRoomAction): Promise<void> {
    if (this.#closed)
      return Promise.reject(
        new CallsError("waiting_room_unavailable", "Media connection closed."),
      );
    return new Promise((resolve, reject) => {
      const id = createConnectionId();
      const timer = setTimeout(() => finish(), 5000);
      let settled = false;
      const finish = (result?: WaitingRoomResult) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        this.#pending = undefined;
        if (result?.ok) resolve();
        else
          reject(
            new CallsError(
              result?.code ?? "waiting_room_control_unknown",
              "Waiting-room control was not confirmed.",
            ),
          );
      };
      this.#pending = { id, finish };
      try {
        if (
          !this.send({ ...action, type: "waiting_room_control", requestId: id })
        )
          finish();
      } catch {
        finish();
      }
    });
  }
}
