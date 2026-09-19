"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";

import type { Bootstrap, Tag } from "../lib/desk/types.js";
import { tagColor } from "../lib/desk/types.js";

// Settings -------------------------------------------------------------------

export type ThemePreference = "light" | "dark" | "system";

export interface Settings {
  readonly theme: ThemePreference;
  readonly accent: string;
  readonly locale: string;
  readonly sound: boolean;
  readonly density: "comfortable" | "compact";
  /** Keep recent conversations in IndexedDB on this device. Off by default. */
  readonly cacheConversations: boolean;
}

export const DEFAULT_SETTINGS: Settings = {
  theme: "system",
  accent: "#00a884",
  locale: "en-US",
  sound: true,
  density: "comfortable",
  cacheConversations: false,
};

const SETTINGS_KEY = "acme.settings";

export const RTL_LOCALES = new Set(["ar", "he", "fa", "ur"]);

export function isRtl(locale: string): boolean {
  return RTL_LOCALES.has(locale.split("-")[0] ?? "");
}

function readSettings(): Settings {
  try {
    const stored = JSON.parse(localStorage.getItem(SETTINGS_KEY) ?? "{}");
    return { ...DEFAULT_SETTINGS, ...stored };
  } catch {
    return DEFAULT_SETTINGS;
  }
}

function prefersDark(): boolean {
  return window.matchMedia("(prefers-color-scheme: dark)").matches;
}

/** Applies theme, accent and direction to the document root. */
function applySettings(settings: Settings, dark: boolean): void {
  const root = document.documentElement;
  root.dataset.theme = dark ? "dark" : "light";
  root.dataset.density = settings.density;
  root.style.setProperty("--accent", settings.accent);
  root.lang = settings.locale;
  root.dir = isRtl(settings.locale) ? "rtl" : "ltr";
}

/**
 * Runs before hydration (inlined in the layout) so the first paint already
 * uses the saved theme and accent.
 */
export const THEME_BOOTSTRAP_SCRIPT = `(function(){try{var s=JSON.parse(localStorage.getItem(${JSON.stringify(
  SETTINGS_KEY,
)})||"{}");var t=s.theme||"system";var d=t==="dark"||(t==="system"&&matchMedia("(prefers-color-scheme: dark)").matches);var r=document.documentElement;r.dataset.theme=d?"dark":"light";if(s.accent)r.style.setProperty("--accent",s.accent);if(s.density)r.dataset.density=s.density;}catch(e){}})();`;

// Router ---------------------------------------------------------------------

export interface Route {
  readonly section: string;
  readonly id?: string;
  readonly search: URLSearchParams;
}

function parse(path: string): Route {
  const url = new URL(path, "http://local");
  const [section = "tickets", id] = url.pathname.split("/").filter(Boolean);
  return {
    section,
    ...(id === undefined ? {} : { id: decodeURIComponent(id) }),
    search: url.searchParams,
  };
}

// Context --------------------------------------------------------------------

interface DeskContextValue {
  readonly bootstrap: Bootstrap;
  readonly setBootstrap: (update: (current: Bootstrap) => Bootstrap) => void;
  readonly settings: Settings;
  readonly updateSettings: (patch: Partial<Settings>) => void;
  readonly dark: boolean;
  readonly route: Route;
  readonly navigate: (path: string, options?: { replace?: boolean }) => void;
  readonly tagById: (
    id: string,
  ) => (Tag & { readonly hex: string }) | undefined;
  readonly isAdmin: boolean;
}

const DeskContext = createContext<DeskContextValue | null>(null);

export function useDesk(): DeskContextValue {
  const value = useContext(DeskContext);
  if (value === null) throw new Error("useDesk needs a DeskProvider.");
  return value;
}

export function useSettingsState(): {
  settings: Settings;
  update: (patch: Partial<Settings>) => void;
  dark: boolean;
} {
  const [settings, setSettings] = useState<Settings>(DEFAULT_SETTINGS);
  const [systemDark, setSystemDark] = useState(false);

  useEffect(() => {
    setSettings(readSettings());
    setSystemDark(prefersDark());
    const media = window.matchMedia("(prefers-color-scheme: dark)");
    const onChange = () => setSystemDark(media.matches);
    media.addEventListener("change", onChange);
    return () => media.removeEventListener("change", onChange);
  }, []);

  const dark =
    settings.theme === "dark" || (settings.theme === "system" && systemDark);

  useEffect(() => applySettings(settings, dark), [settings, dark]);

  const update = useCallback((patch: Partial<Settings>) => {
    setSettings((current) => {
      const next = { ...current, ...patch };
      localStorage.setItem(SETTINGS_KEY, JSON.stringify(next));
      return next;
    });
  }, []);

  return { settings, update, dark };
}

export function DeskProvider({
  initialBootstrap,
  settings,
  updateSettings,
  dark,
  children,
}: {
  readonly initialBootstrap: Bootstrap;
  readonly settings: Settings;
  readonly updateSettings: (patch: Partial<Settings>) => void;
  readonly dark: boolean;
  readonly children: ReactNode;
}) {
  const [bootstrap, setBootstrapState] = useState(initialBootstrap);
  const [path, setPath] = useState(
    () => window.location.pathname + window.location.search,
  );

  useEffect(() => {
    const onPop = () =>
      setPath(window.location.pathname + window.location.search);
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, []);

  const navigate = useCallback(
    (next: string, options: { replace?: boolean } = {}) => {
      if (next === window.location.pathname + window.location.search) return;
      window.history[options.replace ? "replaceState" : "pushState"](
        null,
        "",
        next,
      );
      setPath(next);
    },
    [],
  );

  const setBootstrap = useCallback(
    (update: (current: Bootstrap) => Bootstrap) => setBootstrapState(update),
    [],
  );

  const value = useMemo<DeskContextValue>(() => {
    const tags = new Map(
      bootstrap.tags.map((tag) => [
        tag.id,
        { ...tag, hex: tagColor(tag.color) },
      ]),
    );
    return {
      bootstrap,
      setBootstrap,
      settings,
      updateSettings,
      dark,
      route: parse(path === "/" ? "/tickets" : path),
      navigate,
      tagById: (id) => tags.get(id),
      isAdmin: bootstrap.me.agent.role === "admin",
    };
  }, [bootstrap, setBootstrap, settings, updateSettings, dark, path, navigate]);

  return <DeskContext.Provider value={value}>{children}</DeskContext.Provider>;
}

/** A same-app link that navigates without a full page load. */
export function Link({
  href,
  children,
  className,
  ...props
}: {
  readonly href: string;
  readonly children: ReactNode;
  readonly className?: string;
  readonly "aria-current"?: "page" | undefined;
  readonly "aria-label"?: string;
  readonly title?: string;
}) {
  const { navigate } = useDesk();
  return (
    <a
      href={href}
      className={className}
      onClick={(event) => {
        if (
          event.defaultPrevented ||
          event.button !== 0 ||
          event.metaKey ||
          event.ctrlKey ||
          event.shiftKey
        ) {
          return;
        }
        event.preventDefault();
        navigate(href);
      }}
      {...props}
    >
      {children}
    </a>
  );
}

/** A short notification tone, generated so the app ships no audio file. */
export function playNotification(): void {
  try {
    const context = new AudioContext();
    const gain = context.createGain();
    gain.connect(context.destination);
    gain.gain.setValueAtTime(0.0001, context.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.15, context.currentTime + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.0001, context.currentTime + 0.35);
    for (const [frequency, start] of [
      [880, 0],
      [1320, 0.09],
    ] as const) {
      const tone = context.createOscillator();
      tone.type = "sine";
      tone.frequency.value = frequency;
      tone.connect(gain);
      tone.start(context.currentTime + start);
      tone.stop(context.currentTime + start + 0.25);
    }
    setTimeout(() => void context.close(), 600);
  } catch {
    // Audio is optional.
  }
}
