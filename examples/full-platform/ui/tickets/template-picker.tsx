"use client";

import { useEffect, useMemo, useState } from "react";

import type { DeskTemplate } from "../../lib/desk/types.js";
import { useResource } from "../data.js";
import { Icon } from "../icons.js";
import { Badge, Button, EmptyState, Spinner, cx } from "../kit.js";

export function fillTemplate(
  text: string,
  values: Readonly<Record<string, string>>,
): string {
  return text.replace(/\{\{\s*(\w+)\s*\}\}/g, (match, name: string) =>
    values[name]?.trim() ? values[name]! : match,
  );
}

export function statusTone(status: string) {
  switch (status.toUpperCase()) {
    case "APPROVED":
      return "success" as const;
    case "PENDING":
    case "IN_REVIEW":
    case "SUBMITTED":
      return "warning" as const;
    case "REJECTED":
    case "DISABLED":
      return "danger" as const;
    default:
      return "neutral" as const;
  }
}

/** A WhatsApp-style phone preview of a template. */
export function TemplatePreview({
  template,
  values,
  businessName = "Acme Support",
}: {
  readonly template: Pick<
    DeskTemplate,
    "header" | "body" | "footer" | "buttons"
  >;
  readonly values: Readonly<Record<string, string>>;
  readonly businessName?: string;
}) {
  return (
    <div className="phone" aria-label="Message preview">
      <div className="phone-notch" aria-hidden="true" />
      <div className="phone-bar">
        <span className="phone-avatar" aria-hidden="true">
          A
        </span>
        <span>
          <strong>{businessName}</strong>
          <small>Business account</small>
        </span>
      </div>
      <div className="phone-chat">
        <div className="phone-bubble">
          {template.header && (
            <strong className="phone-header">
              {fillTemplate(template.header, values)}
            </strong>
          )}
          <p>{fillTemplate(template.body, values)}</p>
          {template.footer && (
            <small className="phone-footer">{template.footer}</small>
          )}
          <span className="phone-time">9:41</span>
        </div>
        {template.buttons.map((button) => (
          <div key={button} className="phone-button">
            {button}
          </div>
        ))}
      </div>
    </div>
  );
}

/**
 * Pick an approved template, fill its parameters, preview it and send it.
 * Used inline when the 24-hour window is closed, and from the attach menu.
 */
export function TemplatePicker({
  contactName,
  onSend,
  onCancel,
  compact = false,
}: {
  readonly contactName: string;
  readonly onSend: (
    template: DeskTemplate,
    values: Readonly<Record<string, string>>,
  ) => Promise<void>;
  readonly onCancel?: () => void;
  readonly compact?: boolean;
}) {
  const templates = useResource<readonly DeskTemplate[]>("/api/desk/templates");
  const [query, setQuery] = useState("");
  const [selectedId, setSelectedId] = useState<string>();
  const [values, setValues] = useState<Record<string, string>>({});
  const [sending, setSending] = useState(false);

  const approved = useMemo(
    () =>
      (templates.data ?? []).filter(
        (template) =>
          template.status === "APPROVED" &&
          template.name.toLowerCase().includes(query.toLowerCase()),
      ),
    [templates.data, query],
  );
  const selected = approved.find((template) => template.id === selectedId);

  useEffect(() => {
    if (selectedId === undefined && approved[0]) setSelectedId(approved[0].id);
  }, [approved, selectedId]);

  useEffect(() => {
    if (!selected) return;
    const firstName = contactName.split(" ")[0] ?? "";
    setValues(
      Object.fromEntries(
        selected.variables.map((name) => [
          name,
          name === "name" ? firstName : "",
        ]),
      ),
    );
  }, [selected, contactName]);

  if (templates.loading && !templates.data)
    return <Spinner label="Loading templates" />;
  const missing =
    selected?.variables.filter((name) => !values[name]?.trim()) ?? [];

  return (
    <div className={cx("tpl-picker", compact && "is-compact")}>
      <div className="tpl-list">
        <label className="search-input">
          <Icon name="search" size={16} />
          <span className="sr-only">Search templates</span>
          <input
            type="search"
            placeholder="Search approved templates"
            value={query}
            onChange={(event) => setQuery(event.currentTarget.value)}
          />
        </label>
        {approved.length === 0 ? (
          <EmptyState icon="templates" title="No approved templates">
            Create one on the Templates page and submit it for review.
          </EmptyState>
        ) : (
          <ul role="listbox" aria-label="Approved templates">
            {approved.map((template) => (
              <li key={template.id}>
                <button
                  type="button"
                  role="option"
                  aria-selected={template.id === selectedId}
                  className="tpl-option"
                  onClick={() => setSelectedId(template.id)}
                >
                  <span className="tpl-option-top">
                    <strong>{template.name}</strong>
                    <Badge tone="neutral">
                      {template.category.toLowerCase()}
                    </Badge>
                  </span>
                  <span className="tpl-option-body">{template.body}</span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
      {selected && (
        <form
          className="tpl-form"
          onSubmit={(event) => {
            event.preventDefault();
            if (missing.length > 0) return;
            setSending(true);
            void onSend(selected, values).finally(() => setSending(false));
          }}
        >
          <div className="tpl-fields">
            <h3>Parameters</h3>
            {selected.variables.length === 0 && (
              <p className="muted small">This template has no parameters.</p>
            )}
            {selected.variables.map((name) => (
              <label key={name} className="field">
                <span>{`{{${name}}}`}</span>
                <input
                  className="input"
                  value={values[name] ?? ""}
                  required
                  maxLength={200}
                  onChange={(event) => {
                    const value = event.currentTarget.value;
                    setValues((current) => ({ ...current, [name]: value }));
                  }}
                />
              </label>
            ))}
          </div>
          <TemplatePreview template={selected} values={values} />
          <div className="tpl-actions">
            {onCancel && (
              <Button variant="ghost" onClick={onCancel}>
                Cancel
              </Button>
            )}
            <Button
              type="submit"
              variant="primary"
              icon="send"
              loading={sending}
              disabled={missing.length > 0}
            >
              Send template
            </Button>
          </div>
        </form>
      )}
    </div>
  );
}
