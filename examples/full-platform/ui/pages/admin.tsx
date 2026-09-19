"use client";

import { useState, type ReactNode } from "react";

import { useDesk } from "../context.js";
import { callApi, newClientId, useResource } from "../data.js";
import { dateTime, titleCase } from "../format.js";
import { Icon, type IconName } from "../icons.js";
import {
  Badge,
  Button,
  Card,
  DataTable,
  ErrorState,
  IconButton,
  Modal,
  PageHeader,
  RawJson,
  Spinner,
  cx,
  errorMessage,
  toast,
  useCopy,
} from "../kit.js";

type Row = Readonly<Record<string, unknown>>;

/** SDK routes return `{ success, data }` envelopes; fixtures return the data. */
function unwrap(value: unknown): unknown {
  if (
    typeof value === "object" &&
    value !== null &&
    "success" in value &&
    "data" in value
  ) {
    return (value as { data: unknown }).data;
  }
  return value;
}

function rowsOf(value: unknown): Row[] {
  const data = unwrap(value);
  if (Array.isArray(data)) return data as Row[];
  if (data && typeof data === "object") {
    for (const key of ["items", "data", "numbers"]) {
      const nested = (data as Row)[key];
      if (Array.isArray(nested)) return nested as Row[];
    }
  }
  return [];
}

function Cell({
  value,
  locale,
}: {
  readonly value: unknown;
  readonly locale: string;
}) {
  if (value === null || value === undefined || value === "") {
    return <span className="muted">—</span>;
  }
  if (typeof value === "boolean") {
    return (
      <Badge tone={value ? "success" : "neutral"}>{value ? "Yes" : "No"}</Badge>
    );
  }
  if (typeof value === "number") {
    return value > 1e12 ? (
      <>{dateTime(value, locale)}</>
    ) : (
      <>{value.toLocaleString(locale)}</>
    );
  }
  if (typeof value === "string") {
    if (/^\d{4}-\d{2}-\d{2}T/.test(value))
      return <>{dateTime(value, locale)}</>;
    if (value.startsWith("http"))
      return <span className="mono truncate">{value}</span>;
    return <>{value}</>;
  }
  if (Array.isArray(value)) {
    return value.every((item) => typeof item === "string") ? (
      <span className="chip-row">
        {value.slice(0, 3).map((item) => (
          <Badge key={item}>{item}</Badge>
        ))}
        {value.length > 3 && (
          <span className="muted small">+{value.length - 3}</span>
        )}
      </span>
    ) : (
      <>{value.length} items</>
    );
  }
  return (
    <span className="mono small">{JSON.stringify(value).slice(0, 60)}</span>
  );
}

const STATUS_KEYS = new Set([
  "status",
  "state",
  "band",
  "severity",
  "role",
  "mostLikelyHealthState",
]);

function tone(value: unknown) {
  const text = String(value).toLowerCase();
  if (
    [
      "active",
      "connected",
      "ok",
      "good",
      "healthy",
      "owner",
      "acknowledged",
      "lifted",
    ].includes(text)
  )
    return "success" as const;
  if (["fair", "warning", "pending", "admin", "limited", "high"].includes(text))
    return "warning" as const;
  if (
    ["failed", "poor", "critical", "disconnected", "banned", "open"].includes(
      text,
    )
  )
    return "danger" as const;
  return "neutral" as const;
}

function Table({
  rows,
  keys,
  caption,
  actions,
}: {
  readonly rows: readonly Row[];
  readonly keys: readonly string[];
  readonly caption: string;
  readonly actions?: (row: Row) => ReactNode;
}) {
  const { settings } = useDesk();
  return (
    <DataTable
      caption={caption}
      rows={rows}
      rowKey={(row) =>
        String(row.id ?? row.session ?? row.phone ?? JSON.stringify(row))
      }
      empty="Nothing to show."
      columns={[
        ...keys.map((key) => ({
          key,
          label: titleCase(key.replace(/([a-z])([A-Z])/g, "$1 $2")),
          render: (row: Row) =>
            STATUS_KEYS.has(key) && row[key] ? (
              <Badge tone={tone(row[key])} dot>
                {String(row[key])}
              </Badge>
            ) : (
              <Cell value={row[key]} locale={settings.locale} />
            ),
        })),
        ...(actions
          ? [
              {
                key: "actions",
                label: "",
                className: "cell-action",
                render: actions,
              },
            ]
          : []),
      ]}
    />
  );
}

function Section({
  path,
  children,
}: {
  readonly path: string;
  readonly children: (data: unknown, reload: () => void) => ReactNode;
}) {
  const resource = useResource<unknown>(path);
  if (resource.error)
    return <ErrorState error={resource.error} onRetry={resource.reload} />;
  if (resource.data === undefined) return <Spinner />;
  return (
    <div className="admin-section">
      {children(unwrap(resource.data), resource.reload)}
      <RawJson value={resource.data} />
    </div>
  );
}

function field(data: unknown, key: string): unknown {
  return data && typeof data === "object"
    ? unwrap((data as Row)[key])
    : undefined;
}

function Stat({
  label,
  value,
}: {
  readonly label: string;
  readonly value: ReactNode;
}) {
  return (
    <div className="stat">
      <span className="stat-label">{label}</span>
      <span className="stat-value">{value}</span>
    </div>
  );
}

function SecretModal({
  secret,
  onClose,
}: {
  readonly secret: string;
  readonly onClose: () => void;
}) {
  const copy = useCopy();
  return (
    <Modal
      title="Signing secret"
      description="Shown once. Store it as POLYMORFA_WEBHOOK_SECRET on the server now."
      onClose={onClose}
      size="sm"
      footer={
        <Button
          variant="primary"
          icon="copy"
          onClick={() => copy(secret, "Secret copied")}
        >
          Copy secret
        </Button>
      }
    >
      <code className="secret">{secret}</code>
    </Modal>
  );
}

async function run(
  path: string,
  body: Row,
  done?: () => void,
): Promise<unknown> {
  try {
    const result = await callApi<unknown>(path, body, {
      idempotencyKey: newClientId(),
    });
    toast("Done", "success");
    done?.();
    return result;
  } catch (error) {
    toast(errorMessage(error), "danger");
    return undefined;
  }
}

const TABS: readonly { id: string; label: string; icon: IconName }[] = [
  { id: "organization", label: "Organization", icon: "building" },
  { id: "projects", label: "Projects", icon: "templates" },
  { id: "billing", label: "Billing", icon: "dashboard" },
  { id: "security", label: "Security", icon: "shield" },
  { id: "webhooks", label: "Webhooks", icon: "link" },
  { id: "events", label: "Events", icon: "bell" },
  { id: "bansafe", label: "BanSafe", icon: "alert" },
  { id: "customers", label: "Customers", icon: "contacts" },
  { id: "audiences", label: "Audiences", icon: "campaigns" },
  { id: "settings", label: "Session settings", icon: "settings" },
  { id: "platform", label: "Platform", icon: "globe" },
  { id: "messaging", label: "Messaging API", icon: "code" },
];

function Panel({ tab }: { readonly tab: string }) {
  const [secret, setSecret] = useState<string>();
  switch (tab) {
    case "organization":
      return (
        <Section path="/api/admin/organization">
          {(data, reload) => {
            const org = field(data, "organization") as Row | undefined;
            return (
              <>
                <Card>
                  <div className="stats">
                    <Stat
                      label="Organization"
                      value={String(org?.name ?? "—")}
                    />
                    <Stat
                      label="Plan"
                      value={titleCase(String(org?.plan ?? "—"))}
                    />
                    <Stat
                      label="Members"
                      value={rowsOf(field(data, "members")).length}
                    />
                    <Stat
                      label="API keys"
                      value={rowsOf(field(data, "apiKeys")).length}
                    />
                  </div>
                </Card>
                <Card title="Members" className="flush">
                  <Table
                    caption="Members"
                    rows={rowsOf(field(data, "members"))}
                    keys={["name", "email", "role", "joinedAt"]}
                  />
                </Card>
                <Card title="API keys" className="flush">
                  <Table
                    caption="API keys"
                    rows={rowsOf(field(data, "apiKeys"))}
                    keys={["name", "prefix", "active", "lastUsedAt"]}
                    actions={(row) =>
                      row.active !== false && (
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => {
                            if (
                              window.confirm(`Deactivate ${String(row.name)}?`)
                            ) {
                              void run(
                                "/api/admin/organization",
                                {
                                  action: "deactivateApiKey",
                                  keyId: String(row.id),
                                },
                                reload,
                              );
                            }
                          }}
                        >
                          Deactivate
                        </Button>
                      )
                    }
                  />
                </Card>
                <Card title="Project tokens" className="flush">
                  <Table
                    caption="Project tokens"
                    rows={rowsOf(field(data, "projectTokens"))}
                    keys={["name", "prefix", "scopes", "createdAt"]}
                  />
                </Card>
              </>
            );
          }}
        </Section>
      );
    case "projects":
      return (
        <Section path="/api/admin/projects">
          {(data) => (
            <Card className="flush">
              <Table
                caption="Projects"
                rows={rowsOf(data)}
                keys={[
                  "name",
                  "slug",
                  "environment",
                  "defaultTier",
                  "createdAt",
                ]}
              />
            </Card>
          )}
        </Section>
      );
    case "billing":
      return (
        <Section path="/api/admin/billing">
          {(data) => {
            const balance = field(data, "balance") as Row | undefined;
            const usage = field(data, "usage") as Row | undefined;
            return (
              <>
                <Card>
                  <div className="stats">
                    <Stat
                      label="Available credit"
                      value={`$${String(balance?.available ?? "—")}`}
                    />
                    <Stat
                      label="Reserved"
                      value={`$${String(balance?.reserved ?? "—")}`}
                    />
                    <Stat
                      label="Usage this period"
                      value={`$${String(usage?.amount ?? "—")}`}
                    />
                    <Stat
                      label="Messages"
                      value={Number(usage?.messages ?? 0).toLocaleString()}
                    />
                  </div>
                </Card>
                <Card title="Transactions" className="flush">
                  <Table
                    caption="Transactions"
                    rows={rowsOf(field(data, "transactions"))}
                    keys={["type", "amount", "currency", "createdAt"]}
                  />
                </Card>
                <Card title="Pricing" className="flush">
                  <Table
                    caption="Pricing"
                    rows={rowsOf(field(data, "pricing"))}
                    keys={["tier", "region", "perSessionDay", "perMessage"]}
                  />
                </Card>
              </>
            );
          }}
        </Section>
      );
    case "security":
      return (
        <Section path="/api/admin/security">
          {(data, reload) => (
            <>
              <Card title="Audit log" className="flush">
                <Table
                  caption="Audit log"
                  rows={rowsOf(field(data, "auditLogs"))}
                  keys={["action", "actor", "target", "createdAt"]}
                />
              </Card>
              <Card title="Security incidents" className="flush">
                <Table
                  caption="Security incidents"
                  rows={rowsOf(field(data, "securityIncidents"))}
                  keys={["kind", "severity", "status", "detectedAt"]}
                  actions={(row) =>
                    row.status !== "acknowledged" && (
                      <Button
                        size="sm"
                        onClick={() =>
                          void run(
                            "/api/admin/security",
                            {
                              action: "acknowledgeIncident",
                              incidentId: String(row.id),
                            },
                            reload,
                          )
                        }
                      >
                        Acknowledge
                      </Button>
                    )
                  }
                />
              </Card>
              <Card title="Session bans" className="flush">
                <Table
                  caption="Session bans"
                  rows={rowsOf(field(data, "sessionBans"))}
                  keys={["session", "reason", "status", "createdAt"]}
                />
              </Card>
            </>
          )}
        </Section>
      );
    case "webhooks":
      return (
        <>
          <Section path="/api/admin/webhooks">
            {(data, reload) => (
              <>
                <Card
                  title="Endpoints"
                  className="flush"
                  actions={
                    <Button
                      size="sm"
                      variant="primary"
                      icon="plus"
                      onClick={() =>
                        void run(
                          "/api/admin/webhooks",
                          { action: "create" },
                          reload,
                        ).then((result) => {
                          const created = result as
                            { secret?: string } | undefined;
                          if (created?.secret) setSecret(created.secret);
                        })
                      }
                    >
                      Register this app
                    </Button>
                  }
                >
                  <Table
                    caption="Webhook endpoints"
                    rows={rowsOf(field(data, "webhooks"))}
                    keys={["url", "enabled", "eventTypes", "createdAt"]}
                    actions={(row) => (
                      <span className="row-actions">
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() =>
                            void run(
                              "/api/admin/webhooks",
                              {
                                action: "setEnabled",
                                webhookId: String(row.id),
                                enabled: row.enabled !== true,
                              },
                              reload,
                            )
                          }
                        >
                          {row.enabled ? "Disable" : "Enable"}
                        </Button>
                        <IconButton
                          icon="send"
                          label="Send test event"
                          onClick={() =>
                            void run("/api/admin/webhooks", {
                              action: "test",
                              webhookId: String(row.id),
                            })
                          }
                        />
                        <IconButton
                          icon="rotate"
                          label="Rotate secret"
                          onClick={() =>
                            void run("/api/admin/webhooks", {
                              action: "rotateSecret",
                              webhookId: String(row.id),
                            }).then((result) => {
                              const rotated = result as
                                { secret?: string } | undefined;
                              if (rotated?.secret) setSecret(rotated.secret);
                            })
                          }
                        />
                      </span>
                    )}
                  />
                </Card>
                <Card title="Failed deliveries" className="flush">
                  <Table
                    caption="Failed deliveries"
                    rows={rowsOf(field(data, "failedDeliveries"))}
                    keys={[
                      "eventType",
                      "status",
                      "attempts",
                      "lastStatusCode",
                      "createdAt",
                    ]}
                    actions={(row) => (
                      <Button
                        size="sm"
                        variant="ghost"
                        icon="rotate"
                        onClick={() =>
                          void run(
                            "/api/admin/webhooks",
                            {
                              action: "retryDelivery",
                              deliveryId: String(row.id),
                            },
                            reload,
                          )
                        }
                      >
                        Retry
                      </Button>
                    )}
                  />
                </Card>
              </>
            )}
          </Section>
          {secret && (
            <SecretModal secret={secret} onClose={() => setSecret(undefined)} />
          )}
        </>
      );
    case "events":
      return (
        <Section path="/api/admin/events">
          {(data) => (
            <Card title="Events in the last 24 hours" className="flush">
              <Table
                caption="Events"
                rows={rowsOf(field(data, "events"))}
                keys={["type", "session", "createdAt"]}
              />
            </Card>
          )}
        </Section>
      );
    case "bansafe":
      return (
        <Section path="/api/admin/bansafe">
          {(data) => (
            <>
              <Card title="Number health" className="flush">
                <Table
                  caption="Number health"
                  rows={rowsOf(field(data, "numbers"))}
                  keys={[
                    "session",
                    "phoneNumber",
                    "health",
                    "band",
                    "mostLikelyHealthState",
                  ]}
                />
              </Card>
              <Card title="Open critical findings" className="flush">
                <Table
                  caption="Findings"
                  rows={rowsOf(field(data, "findings"))}
                  keys={["session", "code", "severity", "status", "createdAt"]}
                />
              </Card>
            </>
          )}
        </Section>
      );
    case "customers":
      return (
        <Section path="/api/admin/customers">
          {(data) => (
            <Card className="flush">
              <Table
                caption="Customers"
                rows={rowsOf(data)}
                keys={[
                  "name",
                  "externalCustomerId",
                  "status",
                  "numberCount",
                  "createdAt",
                ]}
              />
            </Card>
          )}
        </Section>
      );
    case "audiences":
      return (
        <>
          <Section path="/api/admin/audiences">
            {(data) => (
              <Card title="Audiences" className="flush">
                <Table
                  caption="Audiences"
                  rows={rowsOf(data)}
                  keys={["name", "size", "updatedAt"]}
                />
              </Card>
            )}
          </Section>
          <Section path="/api/admin/opt-outs">
            {(data) => (
              <Card title="Opt-outs" className="flush">
                <Table
                  caption="Opt-outs"
                  rows={rowsOf(data)}
                  keys={["phone", "reason", "createdAt"]}
                />
              </Card>
            )}
          </Section>
        </>
      );
    case "settings":
      return (
        <Section path="/api/admin/settings">
          {(data, reload) => {
            const config = field(data, "sessionConfiguration") as
              Row | undefined;
            const quick = field(data, "quickLinkSettings") as Row | undefined;
            return (
              <div className="grid-2">
                <Card title="Session defaults">
                  <dl className="kv">
                    <div>
                      <dt>Team</dt>
                      <dd>
                        <code>{JSON.stringify(unwrap(config?.team))}</code>
                      </dd>
                    </div>
                    <div>
                      <dt>This project</dt>
                      <dd>
                        <code>{JSON.stringify(unwrap(config?.project))}</code>
                      </dd>
                    </div>
                  </dl>
                </Card>
                <Card
                  title="QuickLink page"
                  actions={
                    <Button
                      size="sm"
                      onClick={() =>
                        void run(
                          "/api/admin/settings",
                          { action: "projectQuickLink" },
                          reload,
                        )
                      }
                    >
                      Apply Acme branding
                    </Button>
                  }
                >
                  <dl className="kv">
                    <div>
                      <dt>Team</dt>
                      <dd>
                        <code>{JSON.stringify(unwrap(quick?.team))}</code>
                      </dd>
                    </div>
                    <div>
                      <dt>This project</dt>
                      <dd>
                        <code>{JSON.stringify(unwrap(quick?.project))}</code>
                      </dd>
                    </div>
                  </dl>
                </Card>
              </div>
            );
          }}
        </Section>
      );
    case "platform":
      return (
        <Section path="/api/admin/bridge">
          {(data) => {
            const health = field(data, "health") as Row | undefined;
            const version = field(data, "version") as Row | undefined;
            const bridge = field(data, "bridge") as Row | undefined;
            return (
              <Card>
                <div className="stats">
                  <Stat
                    label="API status"
                    value={
                      <Badge tone={tone(health?.status)} dot>
                        {String(health?.status ?? "unknown")}
                      </Badge>
                    }
                  />
                  <Stat
                    label="API version"
                    value={String(version?.api ?? version?.version ?? "—")}
                  />
                  <Stat
                    label="Bridge region"
                    value={String(bridge?.region ?? "—")}
                  />
                  <Stat
                    label="Bridge route"
                    value={String(bridge?.kind ?? "—")}
                  />
                </div>
              </Card>
            );
          }}
        </Section>
      );
    default:
      return (
        <>
          <Card
            title="Client rules"
            actions={
              <Button
                size="sm"
                variant="primary"
                onClick={() =>
                  void run("/api/messaging/client-rules", { action: "apply" })
                }
              >
                Apply rules for this app
              </Button>
            }
          >
            <p className="muted">
              Browser tokens can only do what the session&apos;s client rules
              allow: sending messages and placing, answering and signaling calls
              from this app&apos;s origin.
            </p>
          </Card>
          <Section path="/api/messaging/client-rules">
            {(data) => (
              <Card title="Current rules">
                <pre className="code-block">
                  {JSON.stringify(data, null, 2)}
                </pre>
              </Card>
            )}
          </Section>
          <Card
            title="Messaging webhook"
            actions={
              <Button
                size="sm"
                onClick={() =>
                  void run("/api/messaging/webhooks", { action: "register" })
                }
              >
                Register
              </Button>
            }
          >
            <p className="muted">
              An alternative to the management webhook. Register only one of the
              two so each event arrives once.
            </p>
          </Card>
        </>
      );
  }
}

export function AdminPage() {
  const [tab, setTab] = useState("organization");
  return (
    <div className="page">
      <PageHeader
        title="Admin"
        description="Organization, billing, security and platform settings."
      />
      <div className="settings-layout">
        <nav className="settings-nav" aria-label="Admin sections">
          {TABS.map((item) => (
            <button
              key={item.id}
              type="button"
              className={cx("settings-link", item.id === tab && "is-active")}
              aria-current={item.id === tab ? "page" : undefined}
              onClick={() => setTab(item.id)}
            >
              <Icon name={item.icon} size={18} />
              {item.label}
            </button>
          ))}
        </nav>
        <div className="settings-body">
          <h2 className="section-title">
            {TABS.find((item) => item.id === tab)?.label}
          </h2>
          <Panel key={tab} tab={tab} />
        </div>
      </div>
    </div>
  );
}
