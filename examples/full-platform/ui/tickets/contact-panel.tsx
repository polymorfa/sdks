"use client";

import { useEffect, useState, type ReactNode } from "react";

import type {
  DeskContact,
  Ticket,
  TicketDetail,
} from "../../lib/desk/types.js";
import { useDesk } from "../context.js";
import { callApi, useResource } from "../data.js";
import { dateTime, formatPhone } from "../format.js";
import { Icon } from "../icons.js";
import {
  Avatar,
  Badge,
  Button,
  IconButton,
  TagChip,
  cx,
  errorMessage,
  toast,
  useCopy,
} from "../kit.js";

function Section({
  title,
  children,
  action,
}: {
  readonly title: string;
  readonly children: ReactNode;
  readonly action?: ReactNode;
}) {
  return (
    <section className="panel-section">
      <header>
        <h3>{title}</h3>
        {action}
      </header>
      {children}
    </section>
  );
}

export function ContactPanel({
  ticket,
  onClose,
  onContactChange,
  onOpenTicket,
}: {
  readonly ticket: Ticket;
  readonly onClose: () => void;
  readonly onContactChange: (contact: DeskContact) => void;
  readonly onOpenTicket: (ticketId: string) => void;
}) {
  const { bootstrap, settings, tagById, setBootstrap } = useDesk();
  const contact = ticket.contact;
  const detail = useResource<TicketDetail>(
    `/api/desk/tickets?id=${encodeURIComponent(ticket.id)}`,
  );
  const [notes, setNotes] = useState(contact.notes);
  const [fields, setFields] = useState(contact.customFields);
  const [editingTags, setEditingTags] = useState(false);
  const [saving, setSaving] = useState<string>();
  const copy = useCopy();

  useEffect(() => {
    setNotes(contact.notes);
    setFields(contact.customFields);
  }, [contact.id, contact.notes, contact.customFields]);

  const save = async (
    key: string,
    patch: Readonly<Record<string, unknown>>,
  ) => {
    setSaving(key);
    try {
      const updated = await callApi<DeskContact>("/api/desk/contacts", {
        action: "update",
        contactId: contact.id,
        ...patch,
      });
      onContactChange(updated);
      if (patch.tags !== undefined) {
        const tags = await callApi<typeof bootstrap.tags>("/api/desk/tags");
        setBootstrap((current) => ({ ...current, tags }));
      }
      return updated;
    } catch (error) {
      toast(errorMessage(error), "danger");
      return undefined;
    } finally {
      setSaving(undefined);
    }
  };

  const toggleTag = (id: string) =>
    void save("tags", {
      tags: contact.tags.includes(id)
        ? contact.tags.filter((tag) => tag !== id)
        : [...contact.tags, id],
    });

  const history = detail.data?.history ?? [];
  const fieldNames = [
    ...new Set([...bootstrap.customFieldNames, ...Object.keys(fields)]),
  ];

  return (
    <aside className="contact-panel" aria-label="Contact details">
      <header className="panel-head">
        <h2>Contact</h2>
        <IconButton icon="x" label="Close contact details" onClick={onClose} />
      </header>
      <div className="panel-scroll">
        <div className="profile">
          <Avatar name={contact.name} src={contact.avatarUrl} size={88} />
          <h3>{contact.name}</h3>
          <button
            type="button"
            className="profile-phone"
            onClick={() => copy(contact.phone, "Number copied")}
          >
            {formatPhone(contact.phone)} <Icon name="copy" size={14} />
          </button>
          {contact.about && <p className="profile-about">{contact.about}</p>}
          <div className="profile-badges">
            {contact.blocked && <Badge tone="danger">Blocked</Badge>}
            {contact.muted && <Badge tone="neutral">Muted</Badge>}
            {contact.company && <Badge tone="info">{contact.company}</Badge>}
          </div>
        </div>

        <Section
          title="Tags"
          action={
            <button
              type="button"
              className="link-btn"
              aria-expanded={editingTags}
              onClick={() => setEditingTags((value) => !value)}
            >
              {editingTags ? "Done" : "Edit"}
            </button>
          }
        >
          <div className="chip-row">
            {contact.tags.length === 0 && !editingTags && (
              <span className="muted small">No tags yet</span>
            )}
            {(editingTags
              ? bootstrap.tags.map((tag) => tag.id)
              : contact.tags
            ).map((id) => {
              const tag = tagById(id);
              if (!tag) return null;
              if (!editingTags) {
                return (
                  <TagChip
                    key={id}
                    name={tag.name}
                    color={tag.hex}
                    onRemove={() => toggleTag(id)}
                  />
                );
              }
              const on = contact.tags.includes(id);
              return (
                <button
                  key={id}
                  type="button"
                  aria-pressed={on}
                  disabled={saving === "tags"}
                  className={cx("choice-chip", on && "is-selected")}
                  onClick={() => toggleTag(id)}
                >
                  <span className="dot" style={{ background: tag.hex }} />
                  {tag.name}
                  {on && <Icon name="check" size={12} />}
                </button>
              );
            })}
          </div>
        </Section>

        {contact.business && (
          <Section title="Business profile">
            <dl className="kv">
              {contact.business.category && (
                <div>
                  <dt>Category</dt>
                  <dd>{contact.business.category}</dd>
                </div>
              )}
              {contact.business.description && (
                <div>
                  <dt>About</dt>
                  <dd>{contact.business.description}</dd>
                </div>
              )}
              {contact.business.website && (
                <div>
                  <dt>Website</dt>
                  <dd>
                    <a
                      href={contact.business.website}
                      target="_blank"
                      rel="noreferrer"
                    >
                      {contact.business.website.replace(/^https?:\/\//, "")}
                    </a>
                  </dd>
                </div>
              )}
            </dl>
          </Section>
        )}

        <Section title="Details">
          <dl className="kv">
            {contact.email && (
              <div>
                <dt>Email</dt>
                <dd>{contact.email}</dd>
              </div>
            )}
            <div>
              <dt>Customer since</dt>
              <dd>
                {new Date(contact.createdAt).toLocaleDateString(
                  settings.locale,
                )}
              </dd>
            </div>
          </dl>
          <form
            className="custom-fields"
            onSubmit={(event) => {
              event.preventDefault();
              void save("fields", { customFields: fields }).then(
                (updated) => updated && toast("Custom fields saved", "success"),
              );
            }}
          >
            {fieldNames.map((name) => (
              <label key={name} className="inline-field">
                <span>{name}</span>
                <input
                  className="input input-sm"
                  value={fields[name] ?? ""}
                  maxLength={200}
                  onChange={(event) => {
                    const value = event.currentTarget.value;
                    setFields((current) => ({ ...current, [name]: value }));
                  }}
                />
              </label>
            ))}
            {JSON.stringify(fields) !==
              JSON.stringify(contact.customFields) && (
              <Button
                type="submit"
                size="sm"
                variant="primary"
                loading={saving === "fields"}
              >
                Save fields
              </Button>
            )}
          </form>
        </Section>

        <Section title="Notes">
          <textarea
            className="input notes"
            rows={3}
            aria-label="Contact notes"
            placeholder="Add a note about this customer"
            value={notes}
            maxLength={2000}
            onChange={(event) => setNotes(event.currentTarget.value)}
            onBlur={() => {
              if (notes !== contact.notes) void save("notes", { notes });
            }}
          />
        </Section>

        <Section title="Ticket history">
          {history.length === 0 ? (
            <p className="muted small">
              This is the first ticket for this contact.
            </p>
          ) : (
            <ul className="history">
              {history.map((item) => (
                <li key={item.id}>
                  <button type="button" onClick={() => onOpenTicket(item.id)}>
                    <span>
                      <strong>#{item.number}</strong>{" "}
                      <span className="muted">
                        {
                          bootstrap.queues.find(
                            (queue) => queue.id === item.queueId,
                          )?.name
                        }
                      </span>
                    </span>
                    <Badge
                      tone={
                        item.status === "resolved"
                          ? "neutral"
                          : item.status === "open"
                            ? "success"
                            : "warning"
                      }
                    >
                      {item.status}
                    </Badge>
                    <span className="muted small history-date">
                      {dateTime(item.createdAt, settings.locale)}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </Section>

        <Section title="Actions">
          <div className="panel-actions">
            <Button
              icon={contact.muted ? "bell" : "bellOff"}
              loading={saving === "muted"}
              onClick={() => void save("muted", { muted: !contact.muted })}
            >
              {contact.muted ? "Unmute notifications" : "Mute notifications"}
            </Button>
            <Button
              variant={contact.blocked ? "secondary" : "danger"}
              icon="ban"
              loading={saving === "blocked"}
              onClick={() => {
                if (
                  contact.blocked ||
                  window.confirm(
                    `Block ${contact.name}? They will not be able to message this number.`,
                  )
                ) {
                  void save("blocked", { blocked: !contact.blocked });
                }
              }}
            >
              {contact.blocked ? "Unblock contact" : "Block contact"}
            </Button>
          </div>
        </Section>
      </div>
    </aside>
  );
}
