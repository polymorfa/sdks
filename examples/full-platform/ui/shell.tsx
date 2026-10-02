"use client";

import { useEffect, useState, type ReactNode } from "react";

import { clearDeviceConversationCache } from "../lib/browser/conversation-cache.js";
import { liveEvents } from "../lib/browser/live-events.js";
import type { AgentStatus } from "../lib/desk/types.js";
import { Link, useDesk } from "./context.js";
import { useLiveEvents } from "./data.js";
import { Icon, type IconName } from "./icons.js";
import { Avatar, Badge, IconButton, Menu, cx } from "./kit.js";

export interface NavItem {
  readonly section: string;
  readonly label: string;
  readonly icon: IconName;
  readonly admin?: boolean;
}

export const NAV: readonly NavItem[] = [
  { section: "tickets", label: "Tickets", icon: "tickets" },
  { section: "contacts", label: "Contacts", icon: "contacts" },
  { section: "dashboard", label: "Dashboard", icon: "dashboard" },
  { section: "campaigns", label: "Campaigns", icon: "campaigns" },
  { section: "templates", label: "Templates", icon: "templates" },
  { section: "quick-replies", label: "Quick replies", icon: "zap" },
  { section: "tags", label: "Tags", icon: "tag" },
  { section: "connections", label: "Connections", icon: "plug" },
  { section: "calls", label: "Calls", icon: "phone" },
  { section: "admin", label: "Admin", icon: "shield", admin: true },
];

const MOBILE_TABS = ["tickets", "contacts", "dashboard", "calls"];

export function Logo({ compact = false }: { readonly compact?: boolean }) {
  return (
    <span className="logo">
      <svg viewBox="0 0 32 32" width="32" height="32" aria-hidden="true">
        <rect width="32" height="32" rx="9" fill="var(--accent)" />
        <path
          d="M9.5 22.5 15 9h2l5.5 13.5h-3l-1.2-3.2h-4.6l-1.2 3.2zm5.1-5.7h2.8L16 13z"
          fill="#fff"
        />
      </svg>
      {!compact && <span className="logo-text">Acme Support</span>}
    </span>
  );
}

function Rail() {
  const { route, isAdmin } = useDesk();
  return (
    <nav className="rail" aria-label="Main">
      <Link
        href="/tickets"
        className="rail-logo"
        aria-label="Acme Support home"
      >
        <Logo compact />
      </Link>
      <ul className="rail-list">
        {NAV.filter((item) => !item.admin || isAdmin).map((item) => (
          <li key={item.section}>
            <Link
              href={`/${item.section}`}
              className={cx(
                "rail-item",
                route.section === item.section && "is-active",
              )}
              aria-current={route.section === item.section ? "page" : undefined}
              aria-label={item.label}
              title={item.label}
            >
              <Icon name={item.icon} size={22} />
              <span className="rail-tooltip" aria-hidden="true">
                {item.label}
              </span>
            </Link>
          </li>
        ))}
        <li className="rail-divider" aria-hidden="true" />
        <li>
          <Link
            href="/settings"
            className={cx(
              "rail-item",
              route.section === "settings" && "is-active",
            )}
            aria-current={route.section === "settings" ? "page" : undefined}
            aria-label="Settings"
            title="Settings"
          >
            <Icon name="settings" size={22} />
            <span className="rail-tooltip" aria-hidden="true">
              Settings
            </span>
          </Link>
        </li>
      </ul>
    </nav>
  );
}

function ConnectionHealth() {
  const { bootstrap, setBootstrap, navigate } = useDesk();
  useLiveEvents({
    "session.status": (event) =>
      setBootstrap((current) => ({
        ...current,
        connections: current.connections.map((connection) =>
          connection.id === event.session && "status" in event.payload
            ? { ...connection, status: event.payload.status }
            : connection,
        ),
      })),
  });
  const total = bootstrap.connections.length;
  const online = bootstrap.connections.filter(
    (connection) => connection.status === "connected",
  ).length;
  const tone =
    total === 0
      ? "neutral"
      : online === total
        ? "success"
        : online === 0
          ? "danger"
          : "warning";
  return (
    <button
      type="button"
      className={cx("health-pill", `is-${tone}`)}
      onClick={() => navigate("/connections")}
      aria-label={`${online} of ${total} WhatsApp connections online. Open connections.`}
    >
      <span className="health-dot" aria-hidden="true" />
      <span className="health-text">
        {online}/{total} <span className="hide-sm">connected</span>
      </span>
    </button>
  );
}

function LiveIndicator() {
  const [state, setState] = useState<"connecting" | "open" | "closed">(
    "connecting",
  );
  useEffect(() => liveEvents.onState(setState), []);
  // Keep a subscription open so the indicator reflects the shared stream.
  useLiveEvents({ "desk.ticket": () => undefined });
  return (
    <span
      className={cx("live", `is-${state}`)}
      title={
        state === "open" ? "Live updates on" : "Reconnecting to live updates"
      }
    >
      <Icon name={state === "open" ? "wifi" : "wifiOff"} size={16} />
      <span className="sr-only">
        {state === "open" ? "Live updates on" : "Reconnecting"}
      </span>
    </span>
  );
}

const STATUS_LABEL: Record<AgentStatus, string> = {
  online: "Online",
  away: "Away",
  offline: "Offline",
};

function AgentMenu() {
  const { bootstrap, setBootstrap, navigate } = useDesk();
  const agent = bootstrap.me.agent;
  const setStatus = (status: AgentStatus) =>
    setBootstrap((current) => ({
      ...current,
      me: { ...current.me, agent: { ...current.me.agent, status } },
    }));
  return (
    <Menu
      label="Account"
      trigger={
        <span className="agent-trigger">
          <Avatar
            name={agent.name}
            size={30}
            status={agent.status}
            color={agent.color}
          />
          <span className="agent-meta hide-sm">
            <span className="agent-name">{agent.name}</span>
            <span className="agent-status">{STATUS_LABEL[agent.status]}</span>
          </span>
          <Icon name="chevronDown" size={16} className="hide-sm" />
        </span>
      }
      items={[
        {
          label: "Set online",
          icon: "check",
          onSelect: () => setStatus("online"),
        },
        { label: "Set away", icon: "clock", onSelect: () => setStatus("away") },
        {
          label: "Appear offline",
          icon: "power",
          onSelect: () => setStatus("offline"),
        },
        {
          label: "Settings",
          icon: "settings",
          onSelect: () => navigate("/settings"),
        },
        {
          label: "Sign out",
          icon: "logout",
          danger: true,
          onSelect: () => {
            // Cached conversations never outlive the session on this device.
            void clearDeviceConversationCache().finally(() => {
              const form = document.getElementById("sign-out-form");
              if (form instanceof HTMLFormElement) form.requestSubmit();
            });
          },
        },
      ]}
    />
  );
}

function TopBar({ title }: { readonly title: string }) {
  const { settings, updateSettings, dark, bootstrap } = useDesk();
  return (
    <header className="topbar">
      <div className="topbar-title">
        <span className="topbar-logo">
          <Logo compact />
        </span>
        <p className="topbar-heading">{title}</p>
        {bootstrap.me.demo && (
          <Badge tone="accent" className="demo-badge">
            Demo data
          </Badge>
        )}
      </div>
      <div className="topbar-actions">
        <ConnectionHealth />
        <LiveIndicator />
        <IconButton
          icon={dark ? "sun" : "moon"}
          label={dark ? "Switch to light theme" : "Switch to dark theme"}
          onClick={() => updateSettings({ theme: dark ? "light" : "dark" })}
          data-theme-pref={settings.theme}
        />
        <AgentMenu />
      </div>
      <form id="sign-out-form" method="post" action="/api/demo-logout" hidden />
    </header>
  );
}

function BottomTabs() {
  const { route, isAdmin, navigate } = useDesk();
  const [more, setMore] = useState(false);
  const extra = NAV.filter(
    (item) => !MOBILE_TABS.includes(item.section) && (!item.admin || isAdmin),
  );
  const moreActive =
    extra.some((item) => item.section === route.section) ||
    route.section === "settings";
  return (
    <>
      <nav className="bottom-tabs" aria-label="Main">
        {NAV.filter((item) => MOBILE_TABS.includes(item.section)).map(
          (item) => (
            <Link
              key={item.section}
              href={`/${item.section}`}
              className={cx(
                "bottom-tab",
                route.section === item.section && "is-active",
              )}
              aria-current={route.section === item.section ? "page" : undefined}
            >
              <Icon name={item.icon} size={22} />
              <span>{item.label}</span>
            </Link>
          ),
        )}
        <button
          type="button"
          className={cx("bottom-tab", moreActive && "is-active")}
          aria-expanded={more}
          onClick={() => setMore((value) => !value)}
        >
          <Icon name="menu" size={22} />
          <span>More</span>
        </button>
      </nav>
      {more && (
        <div className="sheet-backdrop" onClick={() => setMore(false)}>
          <div
            className="sheet"
            role="dialog"
            aria-label="More sections"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="sheet-grip" aria-hidden="true" />
            <div className="sheet-grid">
              {[
                ...extra,
                {
                  section: "settings",
                  label: "Settings",
                  icon: "settings" as const,
                },
              ].map((item) => (
                <button
                  key={item.section}
                  type="button"
                  className={cx(
                    "sheet-item",
                    route.section === item.section && "is-active",
                  )}
                  onClick={() => {
                    setMore(false);
                    navigate(`/${item.section}`);
                  }}
                >
                  <span className="sheet-icon">
                    <Icon name={item.icon} size={22} />
                  </span>
                  {item.label}
                </button>
              ))}
            </div>
          </div>
        </div>
      )}
    </>
  );
}

export function Shell({
  title,
  children,
  immersive = false,
}: {
  readonly title: string;
  readonly children: ReactNode;
  /** Hides the mobile tab bar, for example while a chat is open. */
  readonly immersive?: boolean;
}) {
  return (
    <div className={cx("app", immersive && "is-immersive")}>
      <a className="skip-link" href="#main">
        Skip to content
      </a>
      <Rail />
      <TopBar title={title} />
      <main id="main" className="main" tabIndex={-1}>
        {children}
      </main>
      <BottomTabs />
    </div>
  );
}
