"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import type {
  DeskContact,
  Ticket,
  TicketDetail,
  TicketList as TicketListData,
} from "../../lib/desk/types.js";
import { contactNames } from "../calls-context.js";
import { useDesk } from "../context.js";
import { callApi, useDebounced, useLiveEvents } from "../data.js";
import { EmptyState, cx, errorMessage, toast } from "../kit.js";
import { ChatPane, TicketMessageRelay, type ChatHandle } from "./chat.js";
import { ContactPanel } from "./contact-panel.js";
import { NewTicketModal, ShortcutsModal } from "./modals.js";
import { TicketList, type TicketFilters } from "./ticket-list.js";

const FILTERS_KEY = "acme.ticketFilters";

function isTyping(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  return (
    target.isContentEditable ||
    ["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName) ||
    target.closest("dialog[open]") !== null
  );
}

export function TicketsPage() {
  const { route, navigate, bootstrap } = useDesk();
  const selectedId = route.id;
  const [filters, setFilters] = useState<TicketFilters>({
    status: "open",
    search: "",
    queueId: "",
    tag: "",
    connectionId: "",
    mine: false,
  });
  const [list, setList] = useState<TicketListData>();
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<Ticket>();
  const [panelOpen, setPanelOpen] = useState(false);
  const [modal, setModal] = useState<"new" | "shortcuts">();
  const chat = useRef<ChatHandle | null>(null);

  useEffect(() => {
    try {
      const saved = JSON.parse(sessionStorage.getItem(FILTERS_KEY) ?? "null");
      if (saved)
        setFilters((current) => ({ ...current, ...saved, search: "" }));
    } catch {
      // Ignore unreadable saved filters.
    }
    setPanelOpen(window.matchMedia("(min-width: 1280px)").matches);
  }, []);

  const query = useMemo(() => {
    const params = new URLSearchParams({ status: filters.status });
    if (filters.search.trim()) params.set("search", filters.search.trim());
    if (filters.queueId) params.set("queueId", filters.queueId);
    if (filters.tag) params.set("tag", filters.tag);
    if (filters.connectionId) params.set("connectionId", filters.connectionId);
    if (filters.mine) params.set("mine", "true");
    return params.toString();
  }, [filters]);

  const load = useCallback(
    (signal?: AbortSignal) => {
      setLoading(true);
      return callApi<TicketListData>(
        `/api/desk/tickets?${query}`,
        undefined,
        signal ? { signal } : {},
      )
        .then((data) => {
          setList(data);
          for (const ticket of data.tickets) {
            contactNames.set(ticket.contact.phone, ticket.contact.name);
          }
        })
        .catch((error: unknown) => {
          if (!signal?.aborted) toast(errorMessage(error), "danger");
        })
        .finally(() => setLoading(false));
    },
    [query],
  );

  useEffect(() => {
    const controller = new AbortController();
    const timer = setTimeout(
      () => void load(controller.signal),
      filters.search ? 200 : 0,
    );
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [load, filters.search]);

  // Ticket changes are pushed by the server; refresh the list once per burst.
  const refresh = useDebounced(() => void load(), 250);
  useLiveEvents({
    "desk.ticket": ({ payload }) => {
      const event = payload;
      setSelected((current) =>
        current?.id === event.ticket.id ? event.ticket : current,
      );
      setList(
        (current) =>
          current && {
            ...current,
            tickets: current.tickets.map((ticket) =>
              ticket.id === event.ticket.id ? event.ticket : ticket,
            ),
          },
      );
      refresh();
    },
  });

  useEffect(() => {
    if (selectedId === undefined) {
      setSelected(undefined);
      return;
    }
    const known = list?.tickets.find((ticket) => ticket.id === selectedId);
    if (known) {
      setSelected(known);
      return;
    }
    const controller = new AbortController();
    callApi<TicketDetail>(
      `/api/desk/tickets?id=${encodeURIComponent(selectedId)}`,
      undefined,
      { signal: controller.signal },
    )
      .then((detail) => setSelected(detail.ticket))
      .catch((error: unknown) => {
        if (controller.signal.aborted) return;
        toast(errorMessage(error), "danger");
        navigate("/tickets", { replace: true });
      });
    return () => controller.abort();
    // The list is only a cache for the selected ticket.
  }, [selectedId]);

  const updateFilters = (patch: Partial<TicketFilters>) =>
    setFilters((current) => {
      const next = { ...current, ...patch };
      const { search: _search, ...saved } = next;
      sessionStorage.setItem(FILTERS_KEY, JSON.stringify(saved));
      return next;
    });

  const open = useCallback(
    (ticketId: string) => navigate(`/tickets/${encodeURIComponent(ticketId)}`),
    [navigate],
  );

  const onTicketChange = (ticket: Ticket) => {
    setSelected(ticket);
    if (ticket.status !== filters.status) {
      // Follow the ticket to its new tab so the agent keeps context.
      updateFilters({ status: ticket.status });
    }
    refresh();
  };

  const act = useCallback(
    async (action: "accept" | "resolve") => {
      if (!selected) return;
      try {
        const updated = await callApi<Ticket>("/api/desk/tickets", {
          action,
          ticketId: selected.id,
        });
        setSelected(updated);
        toast(
          action === "resolve"
            ? `Ticket #${updated.number} resolved`
            : `Ticket #${updated.number} assigned to you`,
          "success",
        );
        refresh();
      } catch (error) {
        toast(errorMessage(error), "danger");
      }
    },
    [selected, refresh],
  );

  // J/K/R/E/A and "/" shortcuts, plus "?" for the sheet.
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.metaKey || event.ctrlKey || event.altKey) return;
      if (isTyping(event.target)) return;
      const tickets = list?.tickets ?? [];
      const index = tickets.findIndex((ticket) => ticket.id === selectedId);
      switch (event.key) {
        case "j":
        case "k": {
          const next =
            tickets[
              index === -1
                ? 0
                : Math.min(
                    tickets.length - 1,
                    Math.max(0, index + (event.key === "j" ? 1 : -1)),
                  )
            ];
          if (next) open(next.id);
          break;
        }
        case "r":
          chat.current?.focusComposer();
          break;
        case "/":
          chat.current?.focusComposer("/");
          break;
        case "e":
          if (selected?.status === "open") void act("resolve");
          break;
        case "a":
          if (selected && selected.assigneeId !== bootstrap.me.agent.id) {
            void act("accept");
          }
          break;
        case "?":
          setModal("shortcuts");
          break;
        default:
          return;
      }
      event.preventDefault();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [list, selectedId, selected, open, act, bootstrap.me.agent.id]);

  return (
    <div
      className={cx(
        "tickets",
        selected && "has-selection",
        selected && panelOpen && "has-panel",
      )}
    >
      <TicketMessageRelay />
      <TicketList
        filters={filters}
        onFilters={updateFilters}
        tickets={list?.tickets}
        counts={list?.counts}
        loading={loading}
        selectedId={selectedId}
        onSelect={(ticket) => open(ticket.id)}
        onNew={() => setModal("new")}
      />
      {selected ? (
        <ChatPane
          key={selected.id}
          ticket={selected}
          handle={chat}
          onBack={() => navigate("/tickets")}
          onTicketChange={onTicketChange}
          panelOpen={panelOpen}
          onTogglePanel={() => setPanelOpen((value) => !value)}
        />
      ) : (
        <section
          className="chat chat-empty"
          aria-label="No conversation selected"
        >
          <EmptyState icon="tickets" title="Pick a ticket to start">
            Choose a conversation on the left, or press <kbd>J</kbd> to open the
            first one. Press <kbd>?</kbd> for all shortcuts.
          </EmptyState>
        </section>
      )}
      {selected && panelOpen && (
        <>
          <div
            className="panel-backdrop"
            aria-hidden="true"
            onClick={() => setPanelOpen(false)}
          />
          <ContactPanel
            ticket={selected}
            onClose={() => setPanelOpen(false)}
            onOpenTicket={open}
            onContactChange={(contact: DeskContact) =>
              setSelected((current) => current && { ...current, contact })
            }
          />
        </>
      )}
      {modal === "new" && (
        <NewTicketModal
          onClose={() => setModal(undefined)}
          onCreate={async (phone, connectionId) => {
            const ticket = await callApi<Ticket>("/api/desk/tickets", {
              action: "create",
              phone,
              connectionId,
            });
            setModal(undefined);
            updateFilters({ status: ticket.status });
            open(ticket.id);
          }}
        />
      )}
      {modal === "shortcuts" && (
        <ShortcutsModal onClose={() => setModal(undefined)} />
      )}
    </div>
  );
}
