"use client";

import { useMemo, useRef, useState } from "react";

import type { DeskContact, Ticket, TicketList } from "../../lib/desk/types.js";
import { useDesk } from "../context.js";
import { callApi, useResource } from "../data.js";
import { formatPhone, relative } from "../format.js";
import { Icon } from "../icons.js";
import {
  Avatar,
  Badge,
  Button,
  DataTable,
  ErrorState,
  Modal,
  PageHeader,
  Select,
  Spinner,
  TagChip,
  errorMessage,
  toast,
} from "../kit.js";

/** Parses "name,phone" rows; a header row is skipped. */
function parseCsv(text: string): { name: string; phone: string }[] {
  return text
    .split(/\r?\n/)
    .map((line) =>
      line.split(",").map((cell) => cell.trim().replace(/^"|"$/g, "")),
    )
    .filter((cells) => cells.length >= 2 && /\d/.test(cells[1] ?? ""))
    .map(([name = "", phone = ""]) => ({ name, phone }));
}

export function ContactsPage() {
  const { bootstrap, tagById, navigate } = useDesk();
  const [search, setSearch] = useState("");
  const [tag, setTag] = useState("");
  const contacts = useResource<readonly DeskContact[]>("/api/desk/contacts");
  const [importing, setImporting] = useState(false);
  const [csv, setCsv] = useState("name,phone\nMaya Patel,+14155550911\n");
  const [busy, setBusy] = useState(false);
  const file = useRef<HTMLInputElement>(null);

  const rows = useMemo(() => {
    const needle = search.trim().toLowerCase();
    return (contacts.data ?? []).filter(
      (contact) =>
        (!needle ||
          contact.name.toLowerCase().includes(needle) ||
          contact.phone.includes(needle) ||
          contact.email?.toLowerCase().includes(needle)) &&
        (!tag || contact.tags.includes(tag)),
    );
  }, [contacts.data, search, tag]);

  const openTicket = async (contact: DeskContact) => {
    try {
      const open = await callApi<TicketList>(
        `/api/desk/tickets?status=open&search=${encodeURIComponent(contact.phone)}`,
      );
      const existing = open.tickets[0];
      if (existing) {
        navigate(`/tickets/${existing.id}`);
        return;
      }
      const ticket = await callApi<Ticket>("/api/desk/tickets", {
        action: "create",
        phone: contact.phone,
      });
      navigate(`/tickets/${ticket.id}`);
    } catch (error) {
      toast(errorMessage(error), "danger");
    }
  };

  const runImport = async () => {
    const parsed = parseCsv(csv);
    if (parsed.length === 0) {
      toast("No rows found. Use one name,phone pair per line.", "danger");
      return;
    }
    setBusy(true);
    try {
      const result = await callApi<{ imported: number; skipped: number }>(
        "/api/desk/contacts",
        { action: "import", rows: parsed },
      );
      toast(
        `Imported ${result.imported}, skipped ${result.skipped}`,
        "success",
      );
      setImporting(false);
      contacts.reload();
    } catch (error) {
      toast(errorMessage(error), "danger");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="page">
      <PageHeader
        title="Contacts"
        description="Everyone who has talked to Acme on WhatsApp."
        actions={
          <Button icon="upload" onClick={() => setImporting(true)}>
            Import CSV
          </Button>
        }
      />
      <div className="toolbar">
        <label className="search-input grow">
          <Icon name="search" size={16} />
          <span className="sr-only">Search contacts</span>
          <input
            type="search"
            placeholder="Search by name, number or email"
            value={search}
            onChange={(event) => setSearch(event.currentTarget.value)}
          />
        </label>
        <Select
          label="Filter by tag"
          icon="tag"
          value={tag}
          onChange={setTag}
          options={[
            { value: "", label: "All tags" },
            ...bootstrap.tags.map((item) => ({
              value: item.id,
              label: item.name,
            })),
          ]}
        />
        <span className="muted small">{rows.length} contacts</span>
      </div>
      {contacts.error ? (
        <ErrorState error={contacts.error} onRetry={contacts.reload} />
      ) : contacts.loading && !contacts.data ? (
        <Spinner />
      ) : (
        <div className="card flush">
          <DataTable
            caption="Contacts"
            rows={rows}
            rowKey={(row) => row.id}
            onRowClick={(row) => void openTicket(row)}
            empty="No contacts match your search."
            columns={[
              {
                key: "name",
                label: "Name",
                render: (row) => (
                  <span className="cell-person">
                    <Avatar name={row.name} src={row.avatarUrl} size={36} />
                    <span>
                      <strong>{row.name}</strong>
                      <small>{row.email ?? row.company ?? ""}</small>
                    </span>
                  </span>
                ),
              },
              {
                key: "phone",
                label: "WhatsApp",
                render: (row) => (
                  <span className="mono">{formatPhone(row.phone)}</span>
                ),
              },
              {
                key: "tags",
                label: "Tags",
                className: "hide-md",
                render: (row) => (
                  <span className="chip-row">
                    {row.tags.map((id) => {
                      const item = tagById(id);
                      return item ? (
                        <TagChip key={id} name={item.name} color={item.hex} />
                      ) : null;
                    })}
                  </span>
                ),
              },
              {
                key: "plan",
                label: "Plan",
                className: "hide-md",
                render: (row) =>
                  row.customFields.Plan ? (
                    <Badge tone="neutral">{row.customFields.Plan}</Badge>
                  ) : (
                    "—"
                  ),
              },
              {
                key: "seen",
                label: "Last seen",
                className: "hide-sm",
                render: (row) =>
                  row.lastSeenAt ? relative(row.lastSeenAt) : "—",
              },
              {
                key: "action",
                label: "",
                className: "cell-action",
                render: (row) => (
                  <span className="row-status">
                    {row.blocked && <Badge tone="danger">Blocked</Badge>}
                    <Icon name="chevronRight" size={18} />
                  </span>
                ),
              },
            ]}
          />
        </div>
      )}
      {importing && (
        <Modal
          title="Import contacts"
          description="One contact per line: name, then phone in E.164 format. Numbers not on WhatsApp are skipped."
          onClose={() => setImporting(false)}
          footer={
            <>
              <Button icon="file" onClick={() => file.current?.click()}>
                Choose file
              </Button>
              <Button
                variant="primary"
                icon="upload"
                loading={busy}
                onClick={() => void runImport()}
              >
                Import {parseCsv(csv).length} contacts
              </Button>
            </>
          }
        >
          <textarea
            className="input mono"
            rows={8}
            aria-label="CSV rows"
            value={csv}
            onChange={(event) => setCsv(event.currentTarget.value)}
          />
          <input
            ref={file}
            type="file"
            accept=".csv,text/csv"
            hidden
            onChange={(event) => {
              const picked = event.currentTarget.files?.[0];
              if (picked) void picked.text().then(setCsv);
            }}
          />
        </Modal>
      )}
    </div>
  );
}
