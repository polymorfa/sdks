import {
  ObservableController,
  type ControllerSnapshot,
} from "../controller.js";
import type { PolymorfaClient } from "../dropin/client.js";
import type {
  BrowserGroup,
  BrowserGroupInviteInfo,
  BrowserGroupMemberAddMode,
} from "../messaging/types.js";
import { missingPermission, withTokenRetry } from "./directory.js";

export type GroupParticipantAction = "add" | "remove" | "promote" | "demote";

/** One change to a group's settings. The API does not report their state. */
export type GroupSettingChange =
  | { readonly setting: "infoEditing"; readonly adminsOnly: boolean }
  | { readonly setting: "messaging"; readonly adminsOnly: boolean }
  | {
      readonly setting: "memberAdd";
      readonly mode: BrowserGroupMemberAddMode;
    }
  | { readonly setting: "joinApproval"; readonly required: boolean };

/**
 * Group reads and changes. `createApiGroupSource` calls the API with the
 * client token (`groups_read` and `groups_manage`); pass your own source for
 * another backend or for local sample data.
 */
export interface GroupSource {
  retrieve(groupId: string, signal?: AbortSignal): Promise<BrowserGroup>;
  create(
    input: { readonly name: string; readonly participants: readonly string[] },
    signal?: AbortSignal,
  ): Promise<BrowserGroup>;
  setSubject(groupId: string, value: string): Promise<void>;
  setDescription(groupId: string, value: string): Promise<void>;
  participants(
    groupId: string,
    action: GroupParticipantAction,
    ids: readonly string[],
  ): Promise<void>;
  inviteCode(groupId: string, signal?: AbortSignal): Promise<string>;
  revokeInviteCode(groupId: string): Promise<string>;
  setting(groupId: string, change: GroupSettingChange): Promise<void>;
  leave(groupId: string): Promise<void>;
  joinInfo?(code: string, signal?: AbortSignal): Promise<BrowserGroupInviteInfo>;
  join?(code: string): Promise<void>;
}

export type GroupOperation =
  | "rename"
  | "describe"
  | GroupParticipantAction
  | "inviteCode"
  | "revokeInviteCode"
  | GroupSettingChange["setting"]
  | "leave";

export interface GroupSnapshot extends ControllerSnapshot {
  readonly status: "idle" | "loading" | "ready" | "error" | "left";
  readonly groupId: string;
  readonly group?: BrowserGroup;
  /** The change in flight. Controls should be disabled while it runs. */
  readonly pending?: GroupOperation;
  readonly inviteCode?: string;
  /** The last failed load or change. */
  readonly error?: string;
  readonly failed?: GroupOperation | "load";
  /** The last change that succeeded, for a short confirmation. */
  readonly done?: GroupOperation;
}

export interface GroupControllerOptions {
  readonly now?: () => number;
  /** Whether changes are offered. Defaults to true; the API still decides. */
  readonly canManage?: boolean;
}

/**
 * Framework-neutral state for one WhatsApp group: its details, roster and
 * every change client tokens can make. Each change reloads the group, since
 * the API answers changes with success only. WhatsApp still decides whether
 * this account may make a change, for example whether it is an admin.
 */
export class GroupController extends ObservableController<GroupSnapshot> {
  readonly source: GroupSource;
  readonly canManage: boolean;
  #abort = new AbortController();
  #generation = 0;

  constructor(
    source: GroupSource,
    groupId: string,
    options: GroupControllerOptions = {},
  ) {
    super({ status: "idle", groupId }, options.now);
    this.source = source;
    this.canManage = options.canManage ?? true;
  }

  async load(): Promise<void> {
    this.assertActive();
    this.#abort.abort();
    const abort = new AbortController();
    this.#abort = abort;
    const generation = ++this.#generation;
    const current = this.getSnapshot();
    this.transition({
      ...base(current),
      status: "loading",
    });
    try {
      const group = await this.source.retrieve(current.groupId, abort.signal);
      if (abort.signal.aborted || generation !== this.#generation) return;
      this.transition({
        ...base(this.getSnapshot()),
        status: "ready",
        group,
      });
    } catch (cause) {
      if (abort.signal.aborted || generation !== this.#generation) return;
      this.transition({
        ...base(this.getSnapshot()),
        status: "error",
        error: message(cause),
        failed: "load",
      });
    }
  }

  rename(name: string): Promise<boolean> {
    const value = name.trim();
    if (value === "") return Promise.resolve(false);
    return this.#run("rename", () =>
      this.source.setSubject(this.groupId, value),
    );
  }

  describe(description: string): Promise<boolean> {
    return this.#run("describe", () =>
      this.source.setDescription(this.groupId, description),
    );
  }

  /** Add, remove, promote or demote participants by user ID. */
  participants(
    action: GroupParticipantAction,
    ids: readonly string[],
  ): Promise<boolean> {
    if (ids.length === 0) return Promise.resolve(false);
    return this.#run(action, () =>
      this.source.participants(this.groupId, action, ids),
    );
  }

  changeSetting(change: GroupSettingChange): Promise<boolean> {
    return this.#run(
      change.setting,
      () => this.source.setting(this.groupId, change),
      false,
    );
  }

  /** Read the invite code. Shown only to the people this UI serves. */
  showInviteCode(): Promise<boolean> {
    return this.#run(
      "inviteCode",
      async () => {
        const code = await this.source.inviteCode(this.groupId);
        this.#patch({ inviteCode: code });
      },
      false,
    );
  }

  /** Revoke the invite link; the old code stops working. */
  revokeInviteCode(): Promise<boolean> {
    return this.#run(
      "revokeInviteCode",
      async () => {
        const code = await this.source.revokeInviteCode(this.groupId);
        this.#patch({ inviteCode: code });
      },
      false,
    );
  }

  /** Leave the group. The conversation stays readable; sending stops. */
  async leave(): Promise<boolean> {
    const ok = await this.#run("leave", () => this.source.leave(this.groupId), false);
    if (ok) this.transition({ ...base(this.getSnapshot()), status: "left", done: "leave" });
    return ok;
  }

  get groupId(): string {
    return this.getSnapshot().groupId;
  }

  protected override onDispose(): void {
    this.#abort.abort();
  }

  #patch(fields: Partial<GroupSnapshot>): void {
    this.transition({ ...base(this.getSnapshot()), ...fields } as Omit<
      GroupSnapshot,
      "revision" | "updatedAt"
    >);
  }

  async #run(
    operation: GroupOperation,
    change: () => Promise<void>,
    reload = true,
  ): Promise<boolean> {
    this.assertActive();
    const current = this.getSnapshot();
    if (current.pending !== undefined || !this.canManage) return false;
    const { error: _error, failed: _failed, done: _done, ...kept } = base(current);
    void _error;
    void _failed;
    void _done;
    this.transition({ ...kept, pending: operation });
    try {
      await change();
    } catch (cause) {
      this.#settle({ error: message(cause), failed: operation });
      return false;
    }
    this.#settle({ done: operation });
    if (reload) await this.load().catch(() => undefined);
    return true;
  }

  #settle(fields: Partial<GroupSnapshot>): void {
    try {
      const { pending: _pending, ...kept } = base(this.getSnapshot());
      void _pending;
      this.transition({ ...kept, ...fields } as Omit<
        GroupSnapshot,
        "revision" | "updatedAt"
      >);
    } catch {
      // Disposed while the change was in flight.
    }
  }
}

function base(
  snapshot: GroupSnapshot,
): Omit<GroupSnapshot, "revision" | "updatedAt"> {
  const { revision: _revision, updatedAt: _updatedAt, ...fields } = snapshot;
  void _revision;
  void _updatedAt;
  return fields;
}

function message(cause: unknown): string {
  return cause instanceof Error ? cause.message : String(cause);
}

/**
 * Group reads and changes through the API with the client token. Reads need
 * `groups_read`, changes `groups_manage`. Creating a group and adding
 * participants also need the session's recipient mode `any`.
 */
export function createApiGroupSource(
  client: PolymorfaClient,
  options: { readonly session?: string } = {},
): GroupSource {
  const groups = () => client.messaging(options.session).groups;
  const signalOf = (signal: AbortSignal | undefined) =>
    signal === undefined ? {} : { signal };
  const read = <T>(request: () => Promise<T>) => {
    if (!client.can("groups_read")) missingPermission("groups_read");
    return withTokenRetry(client, request);
  };
  const manage = async (request: () => Promise<unknown>) => {
    if (!client.can("groups_manage")) missingPermission("groups_manage");
    await withTokenRetry(client, request);
  };
  return {
    async retrieve(groupId, signal) {
      return (await read(() => groups().retrieve(groupId, signalOf(signal))))
        .data.data;
    },
    async create(input, signal) {
      if (!client.can("groups_manage")) missingPermission("groups_manage");
      // One idempotency key for the token retry, so it never creates twice.
      const idempotencyKey = globalThis.crypto.randomUUID();
      const response = await withTokenRetry(client, () =>
        groups().create(input, { ...signalOf(signal), idempotencyKey }),
      );
      return response.data.data;
    },
    setSubject: (groupId, value) =>
      manage(() => groups().setSubject(groupId, value)),
    setDescription: (groupId, value) =>
      manage(() => groups().setDescription(groupId, value)),
    participants: (groupId, action, ids) =>
      manage(() => {
        const resource = groups();
        switch (action) {
          case "add":
            return resource.addParticipants(groupId, ids);
          case "remove":
            return resource.removeParticipants(groupId, ids);
          case "promote":
            return resource.promote(groupId, ids);
          case "demote":
            return resource.demote(groupId, ids);
        }
      }),
    async inviteCode(groupId, signal) {
      return (await read(() => groups().inviteCode(groupId, signalOf(signal))))
        .data.data.code;
    },
    async revokeInviteCode(groupId) {
      if (!client.can("groups_manage")) missingPermission("groups_manage");
      return (
        await withTokenRetry(client, () => groups().revokeInviteCode(groupId))
      ).data.data.code;
    },
    setting: (groupId, change) =>
      manage(() => {
        const resource = groups();
        switch (change.setting) {
          case "infoEditing":
            return resource.setInfoEditing(groupId, change.adminsOnly);
          case "messaging":
            return resource.setMessaging(groupId, change.adminsOnly);
          case "memberAdd":
            return resource.setMemberAddMode(groupId, change.mode);
          case "joinApproval":
            return resource.setJoinApproval(groupId, change.required);
        }
      }),
    leave: (groupId) => manage(() => groups().leave(groupId)),
    async joinInfo(code, signal) {
      return (await read(() => groups().joinInfo(code, signalOf(signal)))).data
        .data;
    },
    join: (code) => manage(() => groups().join(code)),
  };
}
