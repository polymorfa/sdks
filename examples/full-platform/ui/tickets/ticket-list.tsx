"use client";

import { useEffect, useRef } from "react";

import type {
  DeskMessageKind,
  Ticket,
  TicketCounts,
  TicketStatus,
} from "../../lib/desk/types.js";
import { useDesk } from "../context.js";
import { listTime } from "../format.js";
import { Icon, type IconName } from "../icons.js";
import {
  Avatar,
  Button,
  EmptyState,
  Select,
  Spinner,
  TagChip,
  Tabs,
  cx,
} from "../kit.js";

export interface TicketFilters {
  readonly status: TicketStatus;
  readonly search: string;
  readonly queueId: string;
  readonly tag: string;
  readonly connectionId: string;
  readonly mine: boolean;
}

const KIND_ICON: Partial<Record<DeskMessageKind, IconName>> = {
  image: "image",
  video: "video",
  audio: "mic",
  document: "file",
  location: "mapPin",
  contact: "user",
  template: "templates",
  sticker: "sticker",
  interactive: "buttons",
};

function TicketRow({
  ticket,
  selected,
  onSelect,
}: {
  readonly ticket: Ticket;
  readonly selected: boolean;
  readonly onSelect: () => void;
}) {
  const { bootstrap, settings, tagById } = useDesk();
  const connection = bootstrap.connections.find(
    (item) => item.id === ticket.connectionId,
  );
  const assignee = bootstrap.agents.find(
    (agent) => agent.id === ticket.assigneeId,
  );
  const queue = bootstrap.queues.find((item) => item.id === ticket.queueId);
  const last = ticket.lastMessage;
  const icon = last ? KIND_ICON[last.kind] : undefined;
  const ref = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    if (selected) ref.current?.scrollIntoView({ block: "nearest" });
  }, [selected]);
  return (
    <li>
      <button
        ref={ref}
        type="button"
        className={cx(
          "ticket-row",
          selected && "is-selected",
          ticket.unread > 0 && "is-unread",
        )}
        aria-current={selected ? "true" : undefined}
        onClick={onSelect}
        style={{ "--conn": connection?.color ?? "transparent" } as object}
      >
        <Avatar
          name={ticket.contact.name}
          src={ticket.contact.avatarUrl}
          size={46}
        />
        <span className="ticket-main">
          <span className="ticket-top">
            <span className="ticket-name">{ticket.contact.name}</span>
            {last && (
              <time
                className="ticket-time"
                dateTime={new Date(last.at).toISOString()}
              >
                {listTime(last.at, settings.locale)}
              </time>
            )}
          </span>
          <span className="ticket-preview">
            {last?.direction === "outbound" && !last.note && (
              <Icon name="checks" size={15} className="preview-tick" />
            )}
            {last?.note && (
              <Icon name="lock" size={14} className="preview-note" />
            )}
            {icon && <Icon name={icon} size={15} className="preview-icon" />}
            <span className="truncate">
              {last?.preview ?? "No messages yet"}
            </span>
            {ticket.unread > 0 && (
              <span className="unread" aria-label={`${ticket.unread} unread`}>
                {ticket.unread}
              </span>
            )}
          </span>
          <span className="ticket-meta">
            {queue && (
              <span className="meta-queue" style={{ color: queue.color }}>
                {queue.name}
              </span>
            )}
            {ticket.contact.tags.slice(0, 2).map((id) => {
              const tag = tagById(id);
              return tag ? (
                <TagChip key={id} name={tag.name} color={tag.hex} />
              ) : null;
            })}
            {ticket.contact.tags.length > 2 && (
              <span className="more-tags">
                +{ticket.contact.tags.length - 2}
              </span>
            )}
            <span className="meta-spacer" />
            {assignee ? (
              <span
                className="meta-agent"
                title={`Assigned to ${assignee.name}`}
              >
                <Avatar name={assignee.name} size={18} color={assignee.color} />
                <span className="sr-only">Assigned to {assignee.name}</span>
              </span>
            ) : (
              <span className="meta-unassigned">Unassigned</span>
            )}
          </span>
        </span>
      </button>
    </li>
  );
}

export function TicketList({
  filters,
  onFilters,
  tickets,
  counts,
  loading,
  selectedId,
  onSelect,
  onNew,
}: {
  readonly filters: TicketFilters;
  readonly onFilters: (patch: Partial<TicketFilters>) => void;
  readonly tickets: readonly Ticket[] | undefined;
  readonly counts: TicketCounts | undefined;
  readonly loading: boolean;
  readonly selectedId: string | undefined;
  readonly onSelect: (ticket: Ticket) => void;
  readonly onNew: () => void;
}) {
  const { bootstrap } = useDesk();
  const active =
    filters.queueId !== "" ||
    filters.tag !== "" ||
    filters.connectionId !== "" ||
    filters.mine;
  return (
    <section className="ticket-pane" aria-labelledby="tickets-heading">
      <div className="pane-head">
        <h1 id="tickets-heading">Tickets</h1>
        <Button variant="primary" size="sm" icon="plus" onClick={onNew}>
          New ticket
        </Button>
      </div>
      <div className="pane-tools">
        <label className="search-input">
          <Icon name="search" size={16} />
          <span className="sr-only">Search tickets</span>
          <input
            type="search"
            placeholder="Search name, number or message"
            value={filters.search}
            onChange={(event) =>
              onFilters({ search: event.currentTarget.value })
            }
          />
        </label>
        <div className="filter-row">
          <Select
            label="Queue"
            icon="inbox"
            value={filters.queueId}
            onChange={(queueId) => onFilters({ queueId })}
            options={[
              { value: "", label: "All queues" },
              ...bootstrap.queues.map((queue) => ({
                value: queue.id,
                label: queue.name,
              })),
            ]}
          />
          <Select
            label="Tag"
            icon="tag"
            value={filters.tag}
            onChange={(tag) => onFilters({ tag })}
            options={[
              { value: "", label: "All tags" },
              ...bootstrap.tags.map((tag) => ({
                value: tag.id,
                label: tag.name,
              })),
            ]}
          />
          <Select
            label="Connection"
            icon="plug"
            value={filters.connectionId}
            onChange={(connectionId) => onFilters({ connectionId })}
            options={[
              { value: "", label: "All numbers" },
              ...bootstrap.connections.map((connection) => ({
                value: connection.id,
                label: connection.name,
              })),
            ]}
          />
          <button
            type="button"
            className={cx("choice-chip", filters.mine && "is-selected")}
            aria-pressed={filters.mine}
            onClick={() => onFilters({ mine: !filters.mine })}
          >
            <Icon name="user" size={14} /> Mine
          </button>
          {active && (
            <button
              type="button"
              className="link-btn"
              onClick={() =>
                onFilters({
                  queueId: "",
                  tag: "",
                  connectionId: "",
                  mine: false,
                })
              }
            >
              Clear
            </button>
          )}
        </div>
      </div>
      <Tabs
        label="Ticket status"
        className="status-tabs"
        value={filters.status}
        onChange={(status) => onFilters({ status })}
        tabs={[
          {
            id: "open",
            label: "Open",
            ...(counts ? { count: counts.open } : {}),
          },
          {
            id: "pending",
            label: "Pending",
            ...(counts ? { count: counts.pending } : {}),
          },
          {
            id: "resolved",
            label: "Resolved",
            ...(counts ? { count: counts.resolved } : {}),
          },
        ]}
      />
      <div
        className="ticket-scroll"
        role="tabpanel"
        aria-label={`${filters.status} tickets`}
      >
        {tickets === undefined && loading ? (
          <Spinner label="Loading tickets" />
        ) : tickets && tickets.length > 0 ? (
          <ul className="ticket-list">
            {tickets.map((ticket) => (
              <TicketRow
                key={ticket.id}
                ticket={ticket}
                selected={ticket.id === selectedId}
                onSelect={() => onSelect(ticket)}
              />
            ))}
          </ul>
        ) : (
          <EmptyState
            icon="inbox"
            title={
              filters.status === "pending"
                ? "The queue is clear"
                : filters.status === "open"
                  ? "No open tickets"
                  : "Nothing resolved yet"
            }
          >
            {filters.search || active
              ? "No tickets match these filters."
              : "New WhatsApp conversations appear here as they arrive."}
          </EmptyState>
        )}
      </div>
    </section>
  );
}
