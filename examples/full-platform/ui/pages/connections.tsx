"use client";

import { useMemo, useState } from "react";

import type { Connection, HealthLevel } from "../../lib/desk/types.js";
import { useDesk } from "../context.js";
import { callApi, newClientId, useLiveEvents, useResource } from "../data.js";
import {
  dateTime,
  formatPhone,
  number,
  relative,
  titleCase,
} from "../format.js";
import { Icon } from "../icons.js";
import {
  Badge,
  Button,
  Card,
  ErrorState,
  Menu,
  Modal,
  PageHeader,
  Segmented,
  Spinner,
  errorMessage,
  toast,
  useCopy,
} from "../kit.js";
import { qrPath } from "../qr.js";

const HEALTH: Record<
  HealthLevel,
  { label: string; tone: "success" | "warning" | "danger" }
> = {
  healthy: { label: "Healthy", tone: "success" },
  watch: { label: "Watch", tone: "warning" },
  at_risk: { label: "At risk", tone: "danger" },
};

function statusTone(status: string) {
  if (status === "connected") return "success" as const;
  if (["connecting", "starting", "qr", "pairing"].includes(status))
    return "warning" as const;
  return "danger" as const;
}

function QrCode({ value }: { readonly value: string }) {
  const { path, size } = useMemo(() => qrPath(value), [value]);
  return (
    <svg
      className="qr"
      viewBox={`0 0 ${size} ${size}`}
      role="img"
      aria-label="Pairing QR code"
      shapeRendering="crispEdges"
    >
      <rect width={size} height={size} fill="#fff" />
      <path d={path} fill="#111b21" />
    </svg>
  );
}

function PairModal({
  connection,
  onClose,
}: {
  readonly connection: Connection;
  readonly onClose: () => void;
}) {
  const [method, setMethod] = useState<"qr" | "code">("qr");
  const [qr, setQr] = useState<string>();
  const [phone, setPhone] = useState(connection.phone ?? "+");
  const [code, setCode] = useState<string>();
  const [busy, setBusy] = useState(false);

  const run = async (operation: "qr" | "pairingCode") => {
    setBusy(true);
    try {
      const result = await callApi<Readonly<Record<string, unknown>>>(
        "/api/desk/connections",
        {
          action: "session",
          connectionId: connection.id,
          operation,
          ...(operation === "pairingCode"
            ? { phone: phone.replace(/[\s()-]/g, "") }
            : {}),
        },
      );
      if (operation === "qr")
        setQr(typeof result.qr === "string" ? result.qr : undefined);
      else
        setCode(
          typeof result.code === "string"
            ? result.code
            : JSON.stringify(result),
        );
    } catch (error) {
      toast(errorMessage(error), "danger");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal
      title={`Pair ${connection.name}`}
      description="Link the WhatsApp app on the phone to this session."
      onClose={onClose}
      size="sm"
    >
      <div className="form-stack">
        <Segmented
          label="Pairing method"
          value={method}
          onChange={setMethod}
          options={[
            { id: "qr", label: "QR code", icon: "qr" },
            { id: "code", label: "Phone number", icon: "phone" },
          ]}
        />
        {method === "qr" ? (
          <div className="pair-box">
            {qr ? (
              <QrCode value={qr} />
            ) : (
              <div className="qr-placeholder">
                <Icon name="qr" size={40} />
              </div>
            )}
            <ol className="steps">
              <li>Open WhatsApp on the phone</li>
              <li>
                Go to <strong>Settings › Linked devices</strong>
              </li>
              <li>
                Tap <strong>Link a device</strong> and scan the code
              </li>
            </ol>
            <Button
              variant="primary"
              icon="rotate"
              loading={busy}
              onClick={() => void run("qr")}
            >
              {qr ? "Refresh code" : "Show QR code"}
            </Button>
          </div>
        ) : (
          <div className="pair-box">
            <div className="field">
              <label htmlFor="pair-phone">Phone number</label>
              <input
                id="pair-phone"
                className="input"
                type="tel"
                value={phone}
                onChange={(event) => setPhone(event.currentTarget.value)}
              />
            </div>
            {code && (
              <div className="pair-code" aria-live="polite">
                {code}
              </div>
            )}
            <p className="muted small">
              On the phone, choose{" "}
              <strong>Link with phone number instead</strong> and enter the
              code.
            </p>
            <Button
              variant="primary"
              loading={busy}
              onClick={() => void run("pairingCode")}
            >
              Get pairing code
            </Button>
          </div>
        )}
        <p className="muted small">
          Direct pairing depends on your plan. QuickLink is the standard way to
          connect a number.
        </p>
      </div>
    </Modal>
  );
}

export function ConnectionsPage() {
  const { isAdmin, setBootstrap, settings } = useDesk();
  const connections = useResource<readonly Connection[]>(
    "/api/desk/connections",
  );
  const [pairing, setPairing] = useState<Connection>();
  const [link, setLink] = useState<{ url: string; expiresAt?: string }>();
  const [busy, setBusy] = useState<string>();
  const copy = useCopy();
  const { reload, setData } = connections;

  useLiveEvents({
    "session.status": (event) =>
      setData((current) =>
        current?.map((connection) =>
          connection.id === event.session
            ? { ...connection, status: event.payload.status }
            : connection,
        ),
      ),
  });

  const operate = async (
    connection: Connection,
    operation: "restart" | "logout" | "delete" | "start" | "stop",
  ) => {
    if (
      (operation === "logout" || operation === "delete") &&
      !window.confirm(
        operation === "delete"
          ? `Delete ${connection.name}? Its WhatsApp link is removed.`
          : `Log out ${connection.name}? The phone will need to pair again.`,
      )
    ) {
      return;
    }
    setBusy(`${connection.id}:${operation}`);
    try {
      await callApi("/api/desk/connections", {
        action: "session",
        connectionId: connection.id,
        operation,
      });
      toast(
        `${titleCase(operation)} requested for ${connection.name}`,
        "success",
      );
      const next = await callApi<readonly Connection[]>(
        "/api/desk/connections",
      );
      setData(() => next);
      setBootstrap((current) => ({ ...current, connections: next }));
    } catch (error) {
      toast(errorMessage(error), "danger");
    } finally {
      setBusy(undefined);
    }
  };

  const createLink = async () => {
    setBusy("quicklink");
    try {
      const created = await callApi<{ url: string; expiresAt?: string }>(
        "/api/desk/connections",
        { action: "quickLink" },
        { idempotencyKey: newClientId() },
      );
      setLink(created);
    } catch (error) {
      toast(errorMessage(error), "danger");
    } finally {
      setBusy(undefined);
    }
  };

  return (
    <div className="page">
      <PageHeader
        title="Connections"
        description="WhatsApp numbers this workspace sends and receives from."
        actions={
          isAdmin && (
            <Button
              variant="primary"
              icon="link"
              loading={busy === "quicklink"}
              onClick={() => void createLink()}
            >
              Connect a number
            </Button>
          )
        }
      />
      {link && (
        <div className="callout is-accent">
          <Icon name="link" size={18} />
          <div className="grow">
            <strong>QuickLink ready.</strong> Send this hosted page to whoever
            holds the phone.
            <code className="link-code">{link.url}</code>
            {link.expiresAt && (
              <span className="muted small">
                Expires {dateTime(link.expiresAt, settings.locale)}
              </span>
            )}
          </div>
          <div className="callout-actions">
            <Button
              size="sm"
              icon="copy"
              onClick={() => copy(link.url, "Link copied")}
            >
              Copy
            </Button>
            <a
              className="btn btn-primary btn-sm"
              href={link.url}
              target="_blank"
              rel="noreferrer"
            >
              <Icon name="external" size={16} /> Open
            </a>
          </div>
        </div>
      )}
      {connections.error ? (
        <ErrorState error={connections.error} onRetry={reload} />
      ) : !connections.data ? (
        <Spinner />
      ) : (
        <div className="connection-grid">
          {connections.data.map((connection) => {
            const health = HEALTH[connection.health.level];
            return (
              <Card key={connection.id} className="connection">
                <div className="connection-top">
                  <span
                    className="connection-icon"
                    style={{ background: connection.color }}
                  >
                    <Icon name="phone" size={20} />
                  </span>
                  <div className="grow">
                    <h2>{connection.name}</h2>
                    <p className="mono muted">
                      {formatPhone(connection.phone)}
                    </p>
                  </div>
                  {isAdmin && (
                    <Menu
                      label={`Actions for ${connection.name}`}
                      items={[
                        {
                          label: "Pair device",
                          icon: "qr",
                          onSelect: () => setPairing(connection),
                        },
                        {
                          label: "Restart",
                          icon: "rotate",
                          onSelect: () => void operate(connection, "restart"),
                        },
                        connection.status === "stopped"
                          ? {
                              label: "Start",
                              icon: "power",
                              onSelect: () => void operate(connection, "start"),
                            }
                          : {
                              label: "Stop",
                              icon: "power",
                              onSelect: () => void operate(connection, "stop"),
                            },
                        {
                          label: "Log out",
                          icon: "logout",
                          danger: true,
                          onSelect: () => void operate(connection, "logout"),
                        },
                        {
                          label: "Delete",
                          icon: "trash",
                          danger: true,
                          onSelect: () => void operate(connection, "delete"),
                        },
                      ]}
                    />
                  )}
                </div>
                <div className="connection-badges">
                  <Badge tone={statusTone(connection.status)} dot>
                    {titleCase(connection.status)}
                  </Badge>
                  {connection.platform && (
                    <Badge>{titleCase(connection.platform)}</Badge>
                  )}
                  {connection.isBusiness && <Badge tone="info">Business</Badge>}
                </div>
                <div className="health">
                  <div className="health-head">
                    <span>BanSafe health</span>
                    <Badge tone={health.tone}>{health.label}</Badge>
                  </div>
                  <div
                    className="meter"
                    role="meter"
                    aria-valuemin={0}
                    aria-valuemax={100}
                    aria-valuenow={connection.health.score}
                    aria-label="BanSafe health score"
                  >
                    <span
                      className={`is-${health.tone}`}
                      style={{ width: `${connection.health.score}%` }}
                    />
                  </div>
                  <span className="health-score">
                    {connection.health.score}/100
                  </span>
                </div>
                <dl className="connection-stats">
                  <div>
                    <dt>Messages</dt>
                    <dd>{number(connection.messageCount, settings.locale)}</dd>
                  </div>
                  <div>
                    <dt>Last active</dt>
                    <dd>
                      {connection.lastActiveAt
                        ? relative(connection.lastActiveAt)
                        : "—"}
                    </dd>
                  </div>
                </dl>
                {isAdmin && connection.status !== "connected" && (
                  <div className="connection-actions">
                    <Button
                      size="sm"
                      icon="qr"
                      onClick={() => setPairing(connection)}
                    >
                      Pair
                    </Button>
                    <Button
                      size="sm"
                      icon="rotate"
                      loading={busy === `${connection.id}:restart`}
                      onClick={() => void operate(connection, "restart")}
                    >
                      Restart
                    </Button>
                  </div>
                )}
              </Card>
            );
          })}
        </div>
      )}
      {pairing && (
        <PairModal connection={pairing} onClose={() => setPairing(undefined)} />
      )}
    </div>
  );
}
