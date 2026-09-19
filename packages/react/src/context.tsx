import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useSyncExternalStore,
  type ReactNode,
} from "react";
import {
  PolymorfaClient,
  warnMissingPermission,
  type PolymorfaClientSnapshot,
  type PolymorfaPermission,
} from "@polymorfa/browser";
import {
  createLocale,
  defineAppearance,
  type Appearance,
  type AppearanceInput,
  type Locale,
} from "@polymorfa/ui";
import { safeSubscribe, useOwnedController } from "./hooks.js";

export interface PolymorfaReactConfiguration {
  readonly appearance: Appearance;
  readonly locale: Locale;
}
const Context = createContext<PolymorfaReactConfiguration | undefined>(
  undefined,
);
const ClientContext = createContext<PolymorfaClient | undefined>(undefined);

export interface PolymorfaProviderProps {
  readonly appearance?: AppearanceInput;
  readonly locale?: Locale;
  /**
   * Your handler's token route, for example `/api/polymorfa/token`. The
   * provider fetches a client token from it, refreshes it before expiry and
   * shares it with every component inside.
   */
  readonly tokenEndpoint?: string;
  /** A client you created yourself; takes precedence over `tokenEndpoint`. */
  readonly client?: PolymorfaClient;
  readonly children?: ReactNode;
}

export function PolymorfaProvider({
  appearance,
  locale,
  tokenEndpoint,
  client,
  children,
}: PolymorfaProviderProps) {
  const value = useMemo(
    () => ({
      appearance: defineAppearance(appearance),
      locale: locale ?? createLocale("en"),
    }),
    [appearance, locale],
  );
  const owned = useOwnedClient(
    client === undefined ? tokenEndpoint : undefined,
  );
  const resolved = client ?? owned;
  useEffect(() => {
    resolved?.start();
  }, [resolved]);
  return (
    <Context.Provider value={value}>
      <ClientContext.Provider value={resolved}>
        {children}
      </ClientContext.Provider>
    </Context.Provider>
  );
}

/** One owned client per endpoint, safe under StrictMode. */
function useOwnedClient(
  tokenEndpoint: string | undefined,
): PolymorfaClient | undefined {
  return useOwnedController(
    undefined,
    tokenEndpoint === undefined
      ? undefined
      : () => new PolymorfaClient({ tokenEndpoint }),
  );
}

// One shared default keeps memoized components stable without a provider.
let defaultConfiguration: PolymorfaReactConfiguration | undefined;
export function usePolymorfa(): PolymorfaReactConfiguration {
  const value = useContext(Context);
  if (value !== undefined) return value;
  defaultConfiguration ??= {
    appearance: defineAppearance(),
    locale: createLocale("en"),
  };
  return defaultConfiguration;
}

/**
 * The provider's client: token refresh, `can()`, and the browser Messaging
 * client. Throws outside `<PolymorfaProvider tokenEndpoint>`.
 */
export function usePolymorfaClient(): PolymorfaClient {
  const client = useContext(ClientContext);
  if (client === undefined)
    throw new Error(
      'usePolymorfaClient() needs <PolymorfaProvider tokenEndpoint="/api/polymorfa/token">.',
    );
  return client;
}

/** The provider's client, or `undefined` without one. */
export function useOptionalPolymorfaClient(): PolymorfaClient | undefined {
  return useContext(ClientContext);
}

const NO_SUBSCRIPTION = () => () => undefined;
const NO_SNAPSHOT = () => undefined;

export interface PolymorfaPermissions {
  /** `unknown` without a provider client: controls render and the server decides. */
  readonly status: PolymorfaClientSnapshot["status"] | "unknown";
  readonly snapshot: PolymorfaClientSnapshot | undefined;
  /** Whether the grant allows `permission`. True without a provider client. */
  can(permission: PolymorfaPermission): boolean;
}

/**
 * What the current token allows, for rendering only. The server enforces
 * every permission again; this never widens access.
 */
export function usePermissions(): PolymorfaPermissions {
  const client = useContext(ClientContext);
  const snapshot = useSyncExternalStore(
    client === undefined ? NO_SUBSCRIPTION : safeSubscribe(client),
    client?.getSnapshot ?? NO_SNAPSHOT,
    client?.getSnapshot ?? NO_SNAPSHOT,
  );
  return useMemo(
    () => ({
      status: snapshot?.status ?? "unknown",
      snapshot,
      can: (permission: PolymorfaPermission) =>
        snapshot === undefined
          ? true
          : snapshot.grant?.allow.includes(permission) === true,
    }),
    [snapshot],
  );
}

/**
 * Whether a control may render. Once a token has been minted without
 * `permission`, logs one development warning naming the component.
 */
export function usePermission(
  component: string,
  control: string,
  permission: PolymorfaPermission,
): boolean {
  const permissions = usePermissions();
  const allowed = permissions.can(permission);
  const minted = permissions.snapshot?.grant !== undefined;
  useEffect(() => {
    if (minted && !allowed)
      warnMissingPermission(component, control, permission);
  }, [minted, allowed, component, control, permission]);
  return allowed;
}
