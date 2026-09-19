"use client";

import { CallSurface } from "@polymorfa/react";
import { useEffect, useMemo, useState, type ReactNode } from "react";

import { Providers } from "../app/providers.js";
import type { Bootstrap } from "../lib/desk/types.js";
import { createDeskCalls, type DeskCalls } from "./calls.js";
import { CallsContext, contactNames } from "./calls-context.js";
import {
  DeskProvider,
  playNotification,
  useDesk,
  useSettingsState,
} from "./context.js";
import { callApi, useLiveEvents } from "./data.js";
import { Spinner, Toaster, toast } from "./kit.js";
import { AdminPage } from "./pages/admin.js";
import { CallsPage } from "./pages/calls.js";
import { CampaignsPage } from "./pages/campaigns.js";
import { ConnectionsPage } from "./pages/connections.js";
import { ContactsPage } from "./pages/contacts.js";
import { DashboardPage } from "./pages/dashboard.js";
import { LoginPage } from "./pages/login.js";
import { QuickRepliesPage } from "./pages/quick-replies.js";
import { SettingsPage } from "./pages/settings.js";
import { TagsPage } from "./pages/tags.js";
import { TemplatesPage } from "./pages/templates.js";
import { NAV, Shell } from "./shell.js";
import { TicketsPage } from "./tickets/tickets-page.js";

function CallsProvider({ children }: { readonly children: ReactNode }) {
  const { bootstrap } = useDesk();
  const [calls, setCalls] = useState<DeskCalls | null>(null);
  const session = bootstrap.connections[0]?.id ?? "";
  useEffect(() => {
    // Calls need browser media APIs, so create them after mount.
    if (!bootstrap.me.demo && session === "") {
      setCalls(null);
      return;
    }
    const created = createDeskCalls({ demo: bootstrap.me.demo, session });
    setCalls(created);
    return () => {
      setCalls((current) => (current === created ? null : current));
      created.dispose();
    };
  }, [bootstrap.me.demo, session]);

  const names = useMemo(
    () =>
      new Map<string, string>(
        bootstrap.connections.map((connection) => [
          connection.phone ?? "",
          connection.name,
        ]),
      ),
    [bootstrap.connections],
  );

  return (
    <CallsContext.Provider value={calls}>
      {children}
      {calls && (
        <CallSurface
          controller={calls.controller}
          resolveName={(peer) => names.get(peer) ?? contactNames.get(peer)}
        />
      )}
    </CallsContext.Provider>
  );
}

function Notifications() {
  const { settings } = useDesk();
  useLiveEvents({
    "desk.message": (event) => {
      const message = event.payload.message;
      const fresh = Date.now() - message.createdAt < 10_000;
      if (
        message.direction !== "inbound" ||
        message.kind === "system" ||
        !fresh
      ) {
        return;
      }
      if (settings.sound) playNotification();
      if (document.hidden) {
        document.title = "• New message · Acme Support";
      }
    },
  });
  useEffect(() => {
    const reset = () => {
      if (!document.hidden) document.title = "Acme Support";
    };
    document.addEventListener("visibilitychange", reset);
    return () => document.removeEventListener("visibilitychange", reset);
  }, []);
  return null;
}

function Page() {
  const { route, isAdmin } = useDesk();
  const item = NAV.find((entry) => entry.section === route.section);
  const title =
    route.section === "settings" ? "Settings" : (item?.label ?? "Tickets");
  const immersive = route.section === "tickets" && route.id !== undefined;

  let page: ReactNode;
  switch (route.section) {
    case "contacts":
      page = <ContactsPage />;
      break;
    case "dashboard":
      page = <DashboardPage />;
      break;
    case "campaigns":
      page = <CampaignsPage />;
      break;
    case "templates":
      page = <TemplatesPage />;
      break;
    case "quick-replies":
      page = <QuickRepliesPage />;
      break;
    case "tags":
      page = <TagsPage />;
      break;
    case "connections":
      page = <ConnectionsPage />;
      break;
    case "calls":
      page = <CallsPage />;
      break;
    case "admin":
      page = isAdmin ? <AdminPage /> : <TicketsPage />;
      break;
    case "settings":
      page = <SettingsPage />;
      break;
    default:
      page = <TicketsPage />;
  }

  useEffect(() => {
    document.title = `${title} · Acme Support`;
  }, [title]);

  return (
    <Shell title={title} immersive={immersive}>
      {page}
    </Shell>
  );
}

export function DeskApp() {
  const { settings, update, dark } = useSettingsState();
  const [state, setState] = useState<
    | { readonly kind: "loading" }
    | { readonly kind: "signedOut" }
    | { readonly kind: "error"; readonly message: string }
    | { readonly kind: "ready"; readonly bootstrap: Bootstrap }
  >({ kind: "loading" });

  useEffect(() => {
    callApi<Bootstrap>("/api/desk/bootstrap")
      .then((bootstrap) => setState({ kind: "ready", bootstrap }))
      .catch((error: unknown) => {
        const message = error instanceof Error ? error.message : String(error);
        setState(
          message === "unauthorized"
            ? { kind: "signedOut" }
            : { kind: "error", message },
        );
        if (message !== "unauthorized") toast(message, "danger");
      });
  }, []);

  return (
    <Providers settings={settings} dark={dark}>
      {state.kind === "loading" && (
        <div className="splash">
          <Spinner label="Loading Acme Support" />
        </div>
      )}
      {state.kind === "signedOut" && <LoginPage />}
      {state.kind === "error" && <LoginPage error={state.message} />}
      {state.kind === "ready" && (
        <DeskProvider
          initialBootstrap={state.bootstrap}
          settings={settings}
          updateSettings={update}
          dark={dark}
        >
          <CallsProvider>
            <Notifications />
            <Page />
          </CallsProvider>
        </DeskProvider>
      )}
      <Toaster />
    </Providers>
  );
}
