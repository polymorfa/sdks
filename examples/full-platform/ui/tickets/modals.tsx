"use client";

import { useState } from "react";

import { isE164 } from "../../lib/desk/types.js";
import { useDesk } from "../context.js";
import { Icon } from "../icons.js";
import { Avatar, Button, Field, Modal, Segmented, cx } from "../kit.js";

export function NewTicketModal({
  onClose,
  onCreate,
}: {
  readonly onClose: () => void;
  readonly onCreate: (phone: string, connectionId: string) => Promise<void>;
}) {
  const { bootstrap } = useDesk();
  const [phone, setPhone] = useState("+1");
  const [connectionId, setConnectionId] = useState(
    bootstrap.connections.find(
      (connection) => connection.status === "connected",
    )?.id ??
      bootstrap.connections[0]?.id ??
      "",
  );
  const [error, setError] = useState<string>();
  const [busy, setBusy] = useState(false);
  const normalized = phone.replace(/[\s()-]/g, "");

  const submit = () => {
    if (!isE164(normalized)) {
      setError("Use international format with a leading +, like +14155550123.");
      return;
    }
    setBusy(true);
    setError(undefined);
    onCreate(normalized, connectionId)
      .catch((cause: unknown) =>
        setError(cause instanceof Error ? cause.message : String(cause)),
      )
      .finally(() => setBusy(false));
  };

  return (
    <Modal
      title="New ticket"
      description="Start a WhatsApp conversation with a customer."
      onClose={onClose}
      size="sm"
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button variant="primary" icon="send" loading={busy} onClick={submit}>
            Start conversation
          </Button>
        </>
      }
    >
      <form
        className="form-stack"
        onSubmit={(event) => {
          event.preventDefault();
          submit();
        }}
      >
        <Field
          label="Phone number"
          hint="E.164 format, including country code"
          error={error}
        >
          {(props) => (
            <input
              {...props}
              className="input"
              type="tel"
              inputMode="tel"
              autoComplete="tel"
              autoFocus
              value={phone}
              onChange={(event) => setPhone(event.currentTarget.value)}
            />
          )}
        </Field>
        <Field label="Connection">
          {(props) => (
            <div
              className="radio-cards"
              role="radiogroup"
              id={props.id}
              aria-label="Connection"
            >
              {bootstrap.connections.map((connection) => (
                <label
                  key={connection.id}
                  className={cx(
                    "radio-card",
                    connection.id === connectionId && "is-selected",
                  )}
                >
                  <input
                    type="radio"
                    name="connection"
                    value={connection.id}
                    checked={connection.id === connectionId}
                    onChange={() => setConnectionId(connection.id)}
                  />
                  <span
                    className="conn-swatch"
                    style={{ background: connection.color }}
                    aria-hidden="true"
                  />
                  <span>
                    <strong>{connection.name}</strong>
                    <small>
                      {connection.phone ?? "No number"} · {connection.status}
                    </small>
                  </span>
                </label>
              ))}
            </div>
          )}
        </Field>
        <button type="submit" hidden />
      </form>
    </Modal>
  );
}

export function TransferModal({
  currentAgentId,
  currentQueueId,
  onClose,
  onTransfer,
}: {
  readonly currentAgentId?: string | undefined;
  readonly currentQueueId: string;
  readonly onClose: () => void;
  readonly onTransfer: (target: {
    agentId?: string;
    queueId?: string;
  }) => Promise<void>;
}) {
  const { bootstrap } = useDesk();
  const [mode, setMode] = useState<"agent" | "queue">("agent");
  const [agentId, setAgentId] = useState<string>();
  const [queueId, setQueueId] = useState(currentQueueId);
  const [busy, setBusy] = useState(false);

  const submit = () => {
    setBusy(true);
    onTransfer(
      mode === "agent" && agentId !== undefined
        ? { agentId, queueId }
        : { queueId },
    ).finally(() => setBusy(false));
  };

  return (
    <Modal
      title="Transfer ticket"
      description="Hand this conversation to a teammate or back to a queue."
      onClose={onClose}
      size="sm"
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button
            variant="primary"
            icon="transfer"
            loading={busy}
            disabled={mode === "agent" && agentId === undefined}
            onClick={submit}
          >
            Transfer
          </Button>
        </>
      }
    >
      <div className="form-stack">
        <Segmented
          label="Transfer to"
          value={mode}
          onChange={setMode}
          options={[
            { id: "agent", label: "Agent", icon: "user" },
            { id: "queue", label: "Queue only", icon: "inbox" },
          ]}
        />
        <fieldset className="plain-fieldset">
          <legend className="label">Queue</legend>
          <div className="chip-row">
            {bootstrap.queues.map((queue) => (
              <button
                key={queue.id}
                type="button"
                className={cx(
                  "choice-chip",
                  queue.id === queueId && "is-selected",
                )}
                aria-pressed={queue.id === queueId}
                onClick={() => setQueueId(queue.id)}
              >
                <span className="dot" style={{ background: queue.color }} />
                {queue.name}
              </button>
            ))}
          </div>
        </fieldset>
        {mode === "agent" && (
          <fieldset className="plain-fieldset">
            <legend className="label">Agent</legend>
            <ul className="agent-picker">
              {bootstrap.agents.map((agent) => (
                <li key={agent.id}>
                  <button
                    type="button"
                    aria-pressed={agent.id === agentId}
                    disabled={agent.id === currentAgentId}
                    className={cx(
                      "agent-option",
                      agent.id === agentId && "is-selected",
                    )}
                    onClick={() => setAgentId(agent.id)}
                  >
                    <Avatar
                      name={agent.name}
                      size={32}
                      status={agent.status}
                      color={agent.color}
                    />
                    <span>
                      <strong>{agent.name}</strong>
                      <small>
                        {agent.id === currentAgentId
                          ? "Current assignee"
                          : agent.status}
                      </small>
                    </span>
                    {agent.id === agentId && <Icon name="check" size={18} />}
                  </button>
                </li>
              ))}
            </ul>
          </fieldset>
        )}
      </div>
    </Modal>
  );
}

export function LocationModal({
  onClose,
  onSend,
}: {
  readonly onClose: () => void;
  readonly onSend: (location: {
    lat: number;
    long: number;
    name?: string;
  }) => Promise<void>;
}) {
  const [name, setName] = useState("Acme Store · Downtown");
  const [lat, setLat] = useState("37.7936");
  const [long, setLong] = useState("-122.3958");
  const [error, setError] = useState<string>();
  const [busy, setBusy] = useState(false);

  const useMine = () => {
    navigator.geolocation?.getCurrentPosition(
      (position) => {
        setLat(position.coords.latitude.toFixed(5));
        setLong(position.coords.longitude.toFixed(5));
        setName("My location");
      },
      () => setError("Location access was denied."),
    );
  };

  const submit = () => {
    const latitude = Number(lat);
    const longitude = Number(long);
    if (
      !Number.isFinite(latitude) ||
      !Number.isFinite(longitude) ||
      Math.abs(latitude) > 90 ||
      Math.abs(longitude) > 180
    ) {
      setError(
        "Enter a latitude between -90 and 90 and a longitude between -180 and 180.",
      );
      return;
    }
    setBusy(true);
    onSend({
      lat: latitude,
      long: longitude,
      ...(name.trim() ? { name: name.trim() } : {}),
    }).finally(() => setBusy(false));
  };

  return (
    <Modal
      title="Send location"
      onClose={onClose}
      size="sm"
      footer={
        <>
          <Button variant="ghost" icon="mapPin" onClick={useMine}>
            Use my location
          </Button>
          <Button variant="primary" icon="send" loading={busy} onClick={submit}>
            Send
          </Button>
        </>
      }
    >
      <div className="form-stack">
        <div className="map-preview" aria-hidden="true">
          <Icon name="mapPin" size={28} />
        </div>
        <Field label="Place name">
          {(props) => (
            <input
              {...props}
              className="input"
              value={name}
              onChange={(event) => setName(event.currentTarget.value)}
            />
          )}
        </Field>
        <div className="form-row">
          <Field label="Latitude" error={error}>
            {(props) => (
              <input
                {...props}
                className="input"
                inputMode="decimal"
                value={lat}
                onChange={(event) => setLat(event.currentTarget.value)}
              />
            )}
          </Field>
          <Field label="Longitude">
            {(props) => (
              <input
                {...props}
                className="input"
                inputMode="decimal"
                value={long}
                onChange={(event) => setLong(event.currentTarget.value)}
              />
            )}
          </Field>
        </div>
      </div>
    </Modal>
  );
}

export function ContactCardModal({
  onClose,
  onSend,
}: {
  readonly onClose: () => void;
  readonly onSend: (card: { name: string; phone: string }) => Promise<void>;
}) {
  const { bootstrap } = useDesk();
  const [name, setName] = useState("Acme Billing");
  const [phone, setPhone] = useState(bootstrap.connections[0]?.phone ?? "+1");
  const [error, setError] = useState<string>();
  const [busy, setBusy] = useState(false);
  const submit = () => {
    const normalized = phone.replace(/[\s()-]/g, "");
    if (!name.trim() || !isE164(normalized)) {
      setError("Enter a name and an E.164 phone number.");
      return;
    }
    setBusy(true);
    onSend({ name: name.trim(), phone: normalized }).finally(() =>
      setBusy(false),
    );
  };
  return (
    <Modal
      title="Share a contact card"
      onClose={onClose}
      size="sm"
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button variant="primary" icon="send" loading={busy} onClick={submit}>
            Send contact
          </Button>
        </>
      }
    >
      <div className="form-stack">
        <Field label="Name">
          {(props) => (
            <input
              {...props}
              className="input"
              value={name}
              onChange={(event) => setName(event.currentTarget.value)}
            />
          )}
        </Field>
        <Field label="Phone number" error={error}>
          {(props) => (
            <input
              {...props}
              className="input"
              type="tel"
              value={phone}
              onChange={(event) => setPhone(event.currentTarget.value)}
            />
          )}
        </Field>
      </div>
    </Modal>
  );
}

export function InteractiveModal({
  onClose,
  onSend,
}: {
  readonly onClose: () => void;
  readonly onSend: (
    input:
      | { kind: "buttons"; text: string; buttons: string[] }
      | { kind: "list"; text: string; buttonText: string; rows: string[] },
  ) => Promise<void>;
}) {
  const [kind, setKind] = useState<"buttons" | "list">("buttons");
  const [text, setText] = useState("How would you rate our support today?");
  const [options, setOptions] = useState(["Great", "Okay", "Poor"]);
  const [buttonText, setButtonText] = useState("Choose an option");
  const [busy, setBusy] = useState(false);
  const max = kind === "buttons" ? 3 : 10;
  const limit = kind === "buttons" ? 20 : 24;
  const filled = options.map((option) => option.trim()).filter(Boolean);
  const valid =
    text.trim() !== "" && filled.length >= 1 && filled.length <= max;

  const submit = () => {
    if (!valid) return;
    setBusy(true);
    onSend(
      kind === "buttons"
        ? { kind, text, buttons: filled }
        : { kind, text, buttonText, rows: filled },
    ).finally(() => setBusy(false));
  };

  return (
    <Modal
      title="Interactive message"
      description="Customers tap a reply instead of typing."
      onClose={onClose}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button
            variant="primary"
            icon="send"
            loading={busy}
            disabled={!valid}
            onClick={submit}
          >
            Send
          </Button>
        </>
      }
    >
      <div className="interactive-editor">
        <div className="form-stack">
          <Segmented
            label="Message type"
            value={kind}
            onChange={(value) => {
              setKind(value);
              if (value === "buttons")
                setOptions((current) => current.slice(0, 3));
            }}
            options={[
              { id: "buttons", label: "Reply buttons", icon: "buttons" },
              { id: "list", label: "List", icon: "list" },
            ]}
          />
          <Field label="Message">
            {(props) => (
              <textarea
                {...props}
                className="input"
                rows={3}
                maxLength={1024}
                value={text}
                onChange={(event) => setText(event.currentTarget.value)}
              />
            )}
          </Field>
          {kind === "list" && (
            <Field label="Menu button">
              {(props) => (
                <input
                  {...props}
                  className="input"
                  maxLength={20}
                  value={buttonText}
                  onChange={(event) => setButtonText(event.currentTarget.value)}
                />
              )}
            </Field>
          )}
          <fieldset className="plain-fieldset">
            <legend className="label">
              {kind === "buttons" ? "Buttons (1–3)" : "Rows (1–10)"}
            </legend>
            <div className="option-list">
              {options.map((option, index) => (
                <div key={index} className="option-row">
                  <input
                    className="input"
                    aria-label={`Option ${index + 1}`}
                    maxLength={limit}
                    value={option}
                    onChange={(event) => {
                      const value = event.currentTarget.value;
                      setOptions((current) =>
                        current.map((item, itemIndex) =>
                          itemIndex === index ? value : item,
                        ),
                      );
                    }}
                  />
                  <button
                    type="button"
                    className="icon-btn"
                    aria-label={`Remove option ${index + 1}`}
                    disabled={options.length <= 1}
                    onClick={() =>
                      setOptions((current) =>
                        current.filter((_, itemIndex) => itemIndex !== index),
                      )
                    }
                  >
                    <Icon name="trash" size={16} />
                  </button>
                </div>
              ))}
            </div>
            <Button
              size="sm"
              variant="ghost"
              icon="plus"
              disabled={options.length >= max}
              onClick={() => setOptions((current) => [...current, ""])}
            >
              Add option
            </Button>
          </fieldset>
        </div>
        <div className="phone phone-sm" aria-label="Preview">
          <div className="phone-chat">
            <div className="phone-bubble">
              <p>{text || "Your message"}</p>
              <span className="phone-time">9:41</span>
            </div>
            {kind === "buttons" ? (
              filled.map((option) => (
                <div key={option} className="phone-button">
                  {option}
                </div>
              ))
            ) : (
              <div className="phone-button">
                <Icon name="list" size={14} /> {buttonText}
              </div>
            )}
          </div>
        </div>
      </div>
    </Modal>
  );
}

export function ShortcutsModal({ onClose }: { readonly onClose: () => void }) {
  const rows: [string, string][] = [
    ["J", "Next ticket"],
    ["K", "Previous ticket"],
    ["R", "Reply (focus the composer)"],
    ["E", "Resolve ticket"],
    ["A", "Accept or assign to me"],
    ["/", "Quick replies"],
    ["?", "Show this sheet"],
    ["Esc", "Close dialogs and menus"],
  ];
  return (
    <Modal title="Keyboard shortcuts" onClose={onClose} size="sm">
      <dl className="shortcuts">
        {rows.map(([key, label]) => (
          <div key={key}>
            <dt>
              <kbd>{key}</kbd>
            </dt>
            <dd>{label}</dd>
          </div>
        ))}
      </dl>
    </Modal>
  );
}

export function Lightbox({
  url,
  name,
  onClose,
}: {
  readonly url: string;
  readonly name: string;
  readonly onClose: () => void;
}) {
  return (
    <Modal title={name} onClose={onClose} size="lg">
      <div className="lightbox">
        <img src={url} alt={name} />
      </div>
    </Modal>
  );
}
