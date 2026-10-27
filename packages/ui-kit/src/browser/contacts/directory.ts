import {
  ObservableController,
  type ControllerSnapshot,
} from "../controller.js";
import { BrowserError, BrowserHttpError } from "../errors.js";
import type { PolymorfaClient } from "../dropin/client.js";
import type { BrowserContact } from "../messaging/types.js";

/** One person in the address book of the WhatsApp account. */
export interface DirectoryContact {
  /** Stable Polymorfa user ID; also the one-to-one conversation's ID. */
  readonly id: string;
  /** The name saved in the account's address book. */
  readonly name?: string;
  /** The name the person set for themselves. */
  readonly pushName?: string;
  readonly businessName?: string;
  readonly phoneNumber?: string;
  readonly username?: string;
  readonly avatarUrl?: string;
}

/**
 * Where a contact directory reads from. `createApiContactSource` reads the
 * account's contacts with the client token (`read_contact`); pass your own
 * source for another backend or for local sample data.
 */
export interface ContactDirectorySource {
  list(signal?: AbortSignal): Promise<readonly DirectoryContact[]>;
  /** Resolve a phone number that is not in the list. `null`: not on WhatsApp. */
  lookup?(phone: string, signal?: AbortSignal): Promise<DirectoryContact | null>;
}

export type PhoneLookup =
  | { readonly status: "idle" }
  | { readonly status: "checking"; readonly phone: string }
  | {
      readonly status: "found";
      readonly phone: string;
      readonly contact: DirectoryContact;
    }
  | { readonly status: "not_found"; readonly phone: string }
  | { readonly status: "error"; readonly phone: string; readonly error: string };

export interface ContactDirectorySnapshot extends ControllerSnapshot {
  readonly status: "idle" | "loading" | "ready" | "error";
  /** Every contact, sorted by display name. */
  readonly contacts: readonly DirectoryContact[];
  readonly query: string;
  /** Contacts matching `query`, in the same order. */
  readonly results: readonly DirectoryContact[];
  /** The query as a phone number, when it reads as one. */
  readonly phone?: string;
  readonly lookup: PhoneLookup;
  readonly error?: string;
  /** `permission`: the token lacks `read_contact`; retrying will not help. */
  readonly errorKind?: "permission" | "failed";
}

/**
 * Framework-neutral state for a searchable contacts directory. Search folds
 * case and accents and matches phone digits, like WhatsApp's own new-chat
 * list. Responses from an older load or lookup never overwrite newer state.
 */
export class ContactDirectoryController extends ObservableController<ContactDirectorySnapshot> {
  #source: ContactDirectorySource;
  #load = new AbortController();
  #lookup = new AbortController();
  #generation = 0;

  constructor(
    source: ContactDirectorySource,
    options: { readonly now?: () => number } = {},
  ) {
    super(
      { status: "idle", contacts: [], query: "", results: [], lookup: IDLE },
      options.now,
    );
    this.#source = source;
  }

  get source(): ContactDirectorySource {
    return this.#source;
  }

  /** Replace the source, for example after the grant's session changed. */
  setSource(source: ContactDirectorySource): void {
    this.assertActive();
    this.#source = source;
    this.#lookup.abort();
    this.#emit({
      status: "idle",
      contacts: [],
      results: [],
      lookup: IDLE,
    });
    void this.load();
  }

  async load(): Promise<void> {
    this.assertActive();
    this.#load.abort();
    const abort = new AbortController();
    this.#load = abort;
    const generation = ++this.#generation;
    const current = this.getSnapshot();
    this.#emit({
      status: "loading",
      contacts: current.contacts,
      results: current.results,
      lookup: current.lookup,
    });
    try {
      const contacts = sortContacts(await this.#source.list(abort.signal));
      if (abort.signal.aborted || generation !== this.#generation) return;
      const query = this.getSnapshot().query;
      this.#emit({
        status: "ready",
        contacts,
        results: filterContacts(contacts, query),
        lookup: this.getSnapshot().lookup,
      });
    } catch (cause) {
      if (abort.signal.aborted || generation !== this.#generation) return;
      this.#emit({
        status: "error",
        contacts: [],
        results: [],
        lookup: this.getSnapshot().lookup,
        error: errorMessage(cause),
        errorKind: isPermission(cause) ? "permission" : "failed",
      });
    }
  }

  /** Load again after an error. */
  retry(): Promise<void> {
    return this.load();
  }

  setQuery(query: string): void {
    this.assertActive();
    const current = this.getSnapshot();
    if (query === current.query) return;
    const phone = phoneQuery(query);
    const keepLookup =
      current.lookup.status !== "idle" && current.lookup.phone === phone;
    if (!keepLookup) this.#lookup.abort();
    this.#emit({
      status: current.status,
      contacts: current.contacts,
      query,
      results: filterContacts(current.contacts, query),
      lookup: keepLookup ? current.lookup : IDLE,
      ...pickError(current),
    });
  }

  /**
   * Check whether the phone number in the query is on WhatsApp. Only a match
   * found here can start a chat with someone who is not in the list.
   */
  async lookupPhone(): Promise<void> {
    this.assertActive();
    const phone = this.getSnapshot().phone;
    const lookup = this.#source.lookup;
    if (phone === undefined || lookup === undefined) return;
    this.#lookup.abort();
    const abort = new AbortController();
    this.#lookup = abort;
    this.#setLookup({ status: "checking", phone });
    try {
      const contact = await lookup.call(this.#source, phone, abort.signal);
      if (abort.signal.aborted) return;
      this.#setLookup(
        contact === null
          ? { status: "not_found", phone }
          : { status: "found", phone, contact },
      );
    } catch (cause) {
      if (!abort.signal.aborted)
        this.#setLookup({ status: "error", phone, error: errorMessage(cause) });
    }
  }

  /** Whether the source can look up numbers outside the list. */
  get canLookup(): boolean {
    return this.#source.lookup !== undefined;
  }

  protected override onDispose(): void {
    this.#load.abort();
    this.#lookup.abort();
  }

  #setLookup(lookup: PhoneLookup): void {
    const current = this.getSnapshot();
    if (lookup.status !== "idle" && current.phone !== lookup.phone) return;
    this.#emit({ ...rest(current), lookup });
  }

  #emit(
    next: Omit<
      ContactDirectorySnapshot,
      "revision" | "updatedAt" | "query" | "phone"
    > & { readonly query?: string },
  ): void {
    const query = next.query ?? this.getSnapshot().query;
    const phone = phoneQuery(query);
    this.transition({
      ...next,
      query,
      ...(phone === undefined ? {} : { phone }),
    });
  }
}

const IDLE: PhoneLookup = Object.freeze({ status: "idle" });

function rest(
  snapshot: ContactDirectorySnapshot,
): Omit<ContactDirectorySnapshot, "revision" | "updatedAt"> {
  const { revision: _revision, updatedAt: _updatedAt, ...fields } = snapshot;
  void _revision;
  void _updatedAt;
  return fields;
}

function pickError(
  snapshot: ContactDirectorySnapshot,
): Pick<ContactDirectorySnapshot, "error" | "errorKind"> {
  return {
    ...(snapshot.error === undefined ? {} : { error: snapshot.error }),
    ...(snapshot.errorKind === undefined
      ? {}
      : { errorKind: snapshot.errorKind }),
  };
}

/** The name to show: address book, then business, then self-chosen name. */
export function contactDisplayName(contact: DirectoryContact): string {
  return (
    nonEmpty(contact.name) ??
    nonEmpty(contact.businessName) ??
    nonEmpty(contact.pushName) ??
    nonEmpty(contact.username) ??
    nonEmpty(contact.phoneNumber) ??
    contact.id
  );
}

function nonEmpty(value: string | undefined): string | undefined {
  return value === undefined || value.trim() === "" ? undefined : value;
}

/** Lower-case and strip accents, so "José" matches "jose". */
export function foldSearch(value: string): string {
  return value.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase();
}

function digits(value: string | undefined): string {
  return value === undefined ? "" : value.replace(/\D/g, "");
}

const collator = new Intl.Collator(undefined, { sensitivity: "base" });

/** Named contacts first, alphabetically; unnamed ones after, by number. */
export function sortContacts(
  contacts: readonly DirectoryContact[],
): DirectoryContact[] {
  const named = (contact: DirectoryContact) =>
    nonEmpty(contact.name) ?? nonEmpty(contact.businessName);
  const seen = new Set<string>();
  return contacts
    .filter((contact) => {
      if (seen.has(contact.id)) return false;
      seen.add(contact.id);
      return true;
    })
    .sort((a, b) => {
      const an = named(a);
      const bn = named(b);
      if (an !== undefined && bn === undefined) return -1;
      if (an === undefined && bn !== undefined) return 1;
      return collator.compare(contactDisplayName(a), contactDisplayName(b));
    });
}

/**
 * Every query word must appear in a name, or the query's digits (three or
 * more) must appear in the phone number.
 */
export function filterContacts(
  contacts: readonly DirectoryContact[],
  query: string,
): readonly DirectoryContact[] {
  const folded = foldSearch(query).trim();
  if (folded === "") return contacts;
  const words = folded.split(/\s+/);
  const number = digits(query);
  return contacts.filter((contact) => {
    const haystack = foldSearch(
      [contact.name, contact.pushName, contact.businessName, contact.username]
        .filter((value) => value !== undefined)
        .join(" "),
    );
    if (words.every((word) => haystack.includes(word))) return true;
    return number.length >= 3 && digits(contact.phoneNumber).includes(number);
  });
}

/** The query as an E.164-style number, when it is only a phone number. */
export function phoneQuery(query: string): string | undefined {
  const trimmed = query.trim();
  if (!/^\+?[\d\s().-]+$/.test(trimmed)) return undefined;
  const value = digits(trimmed);
  return value.length >= 7 && value.length <= 15 ? `+${value}` : undefined;
}

function errorMessage(cause: unknown): string {
  return cause instanceof Error ? cause.message : String(cause);
}

function isPermission(cause: unknown): boolean {
  return (
    cause instanceof BrowserError &&
    (cause.category === "authorization" || cause.status === 403)
  );
}

export function fromBrowserContact(contact: BrowserContact): DirectoryContact {
  return {
    id: contact.id,
    ...(nonEmpty(contact.name) === undefined ? {} : { name: contact.name }),
    ...(nonEmpty(contact.pushName) === undefined
      ? {}
      : { pushName: contact.pushName }),
    ...(contact.businessName === undefined
      ? {}
      : { businessName: contact.businessName }),
    ...(contact.phoneNumber === undefined
      ? {}
      : { phoneNumber: contact.phoneNumber }),
    ...(contact.username === undefined ? {} : { username: contact.username }),
    ...(contact.profileUrl === undefined
      ? {}
      : { avatarUrl: contact.profileUrl }),
  };
}

/** Throws the error the controller reports as a missing permission. */
export function missingPermission(permission: string): never {
  throw new BrowserHttpError(`The token lacks "${permission}".`, {
    category: "authorization",
    status: 403,
    code: "permission_missing",
  });
}

/** Runs `request`, fetching one fresh token after a 401 or 403. */
export async function withTokenRetry<T>(
  client: PolymorfaClient,
  request: () => Promise<T>,
): Promise<T> {
  try {
    return await request();
  } catch (cause) {
    if (
      cause instanceof BrowserError &&
      (cause.status === 401 || cause.status === 403)
    ) {
      await client.refresh();
      return request();
    }
    throw cause;
  }
}

/**
 * Reads the WhatsApp account's contacts with the client token. Requires
 * `read_contact`. The API returns the contacts the linked account holds,
 * without paging, and looks numbers up with WhatsApp.
 */
export function createApiContactSource(
  client: PolymorfaClient,
  options: { readonly session?: string } = {},
): ContactDirectorySource {
  const messaging = () => client.messaging(options.session);
  const signalOf = (signal: AbortSignal | undefined) =>
    signal === undefined ? {} : { signal };
  return {
    async list(signal) {
      if (!client.can("read_contact")) missingPermission("read_contact");
      const response = await withTokenRetry(client, () =>
        messaging().contacts.list(signalOf(signal)),
      );
      return response.data.data.map(fromBrowserContact);
    },
    async lookup(phone, signal) {
      if (!client.can("read_contact")) missingPermission("read_contact");
      const response = await withTokenRetry(client, () =>
        messaging().contacts.check(phone, signalOf(signal)),
      );
      const match = response.data.data.find(
        (result) => result.exists && result.id !== undefined,
      );
      if (match === undefined || match.id === undefined) return null;
      return {
        id: match.id,
        phoneNumber: match.phoneNumber ?? phone,
        ...(match.username === undefined ? {} : { username: match.username }),
      };
    },
  };
}
