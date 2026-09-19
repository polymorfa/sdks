"use client";

import type { DashboardStats } from "../../lib/desk/types.js";
import { useDesk } from "../context.js";
import { useResource } from "../data.js";
import { duration, number } from "../format.js";
import { Icon, type IconName } from "../icons.js";
import {
  Avatar,
  Card,
  DataTable,
  ErrorState,
  PageHeader,
  Spinner,
} from "../kit.js";

function Kpi({
  label,
  value,
  icon,
  tone,
  hint,
}: {
  readonly label: string;
  readonly value: string;
  readonly icon: IconName;
  readonly tone: string;
  readonly hint?: string;
}) {
  return (
    <div className="kpi" style={{ "--tone": tone } as object}>
      <span className="kpi-icon">
        <Icon name={icon} size={20} />
      </span>
      <span className="kpi-label">{label}</span>
      <span className="kpi-value">{value}</span>
      {hint && <span className="kpi-hint">{hint}</span>}
    </div>
  );
}

function VolumeChart({
  volume,
}: {
  readonly volume: DashboardStats["volume"];
}) {
  const width = 640;
  const height = 220;
  const pad = { top: 16, right: 12, bottom: 28, left: 36 };
  const max = Math.max(
    10,
    ...volume.map((point) => Math.max(point.inbound, point.outbound)),
  );
  const top = Math.ceil(max / 10) * 10;
  const step = (width - pad.left - pad.right) / Math.max(1, volume.length - 1);
  const y = (value: number) =>
    pad.top + (height - pad.top - pad.bottom) * (1 - value / top);
  const line = (key: "inbound" | "outbound") =>
    volume
      .map(
        (point, index) =>
          `${index === 0 ? "M" : "L"}${pad.left + index * step},${y(point[key])}`,
      )
      .join(" ");
  const area = `${line("inbound")} L${pad.left + (volume.length - 1) * step},${y(0)} L${pad.left},${y(0)} Z`;
  const ticks = [0, top / 2, top];
  const total = volume.reduce(
    (sum, point) => sum + point.inbound + point.outbound,
    0,
  );
  return (
    <figure className="chart">
      <svg
        viewBox={`0 0 ${width} ${height}`}
        role="img"
        aria-label={`Messages per hour over the last 12 hours, ${total} in total`}
      >
        <defs>
          <linearGradient id="chart-fill" x1="0" x2="0" y1="0" y2="1">
            <stop offset="0%" stopColor="var(--accent)" stopOpacity="0.28" />
            <stop offset="100%" stopColor="var(--accent)" stopOpacity="0" />
          </linearGradient>
        </defs>
        {ticks.map((tick) => (
          <g key={tick}>
            <line
              x1={pad.left}
              x2={width - pad.right}
              y1={y(tick)}
              y2={y(tick)}
              className="chart-grid"
            />
            <text
              x={pad.left - 8}
              y={y(tick) + 4}
              textAnchor="end"
              className="chart-label"
            >
              {tick}
            </text>
          </g>
        ))}
        <path d={area} fill="url(#chart-fill)" />
        <path d={line("inbound")} className="chart-line" />
        <path d={line("outbound")} className="chart-line is-secondary" />
        {volume.map((point, index) =>
          index % 2 === 0 ? (
            <text
              key={index}
              x={pad.left + index * step}
              y={height - 8}
              textAnchor="middle"
              className="chart-label"
            >
              {String(point.hour).padStart(2, "0")}:00
            </text>
          ) : null,
        )}
      </svg>
      <figcaption className="chart-legend">
        <span>
          <i className="swatch" /> Received
        </span>
        <span>
          <i className="swatch is-secondary" /> Sent
        </span>
      </figcaption>
    </figure>
  );
}

export function DashboardPage() {
  const { bootstrap, settings } = useDesk();
  const stats = useResource<DashboardStats>("/api/desk/dashboard");
  const agents = new Map(bootstrap.agents.map((agent) => [agent.id, agent]));
  const queues = new Map(bootstrap.queues.map((queue) => [queue.id, queue]));

  if (stats.error)
    return (
      <div className="page">
        <ErrorState error={stats.error} onRetry={stats.reload} />
      </div>
    );
  if (!stats.data) return <Spinner />;
  const data = stats.data;
  const queueTotal = Math.max(
    1,
    data.queues.reduce((sum, queue) => sum + queue.open, 0),
  );

  return (
    <div className="page">
      <PageHeader
        title="Dashboard"
        description={
          bootstrap.me.demo
            ? "Sample numbers for the demo workspace."
            : "Live numbers from this app's tickets."
        }
      />
      <div className="kpis">
        <Kpi
          label="Open tickets"
          value={number(data.open, settings.locale)}
          icon="tickets"
          tone="#0ea5e9"
        />
        <Kpi
          label="Waiting in queue"
          value={number(data.pending, settings.locale)}
          icon="inbox"
          tone="#f59e0b"
          hint="Unassigned"
        />
        <Kpi
          label="Resolved today"
          value={number(data.resolvedToday, settings.locale)}
          icon="check"
          tone="#10b981"
        />
        <Kpi
          label="Avg. first response"
          value={duration(data.avgFirstResponseSeconds)}
          icon="clock"
          tone="#8b5cf6"
        />
        <Kpi
          label="Messages today"
          value={number(data.messagesToday, settings.locale)}
          icon="send"
          tone="#ec4899"
        />
      </div>
      <div className="grid-2">
        <Card title="Conversation volume" className="span-2">
          <VolumeChart volume={data.volume} />
        </Card>
        <Card title="Open by queue">
          <ul className="bars">
            {data.queues.map((row) => {
              const queue = queues.get(row.queueId);
              return (
                <li key={row.queueId}>
                  <span className="bar-label">
                    <span
                      className="dot"
                      style={{ background: queue?.color }}
                    />
                    {queue?.name ?? row.queueId}
                  </span>
                  <span className="bar-track">
                    <span
                      className="bar-fill"
                      style={{
                        width: `${(row.open / queueTotal) * 100}%`,
                        background: queue?.color,
                      }}
                    />
                  </span>
                  <span className="bar-value">{row.open}</span>
                </li>
              );
            })}
          </ul>
        </Card>
      </div>
      <Card title="Agent performance" className="flush">
        <DataTable
          caption="Agent performance"
          rows={data.agents}
          rowKey={(row) => row.agentId}
          columns={[
            {
              key: "agent",
              label: "Agent",
              render: (row) => {
                const agent = agents.get(row.agentId);
                return (
                  <span className="cell-person">
                    <Avatar
                      name={agent?.name ?? row.agentId}
                      size={32}
                      status={agent?.status}
                      color={agent?.color}
                    />
                    <span>
                      <strong>{agent?.name ?? row.agentId}</strong>
                      <small>
                        {agent?.role === "admin" ? "Admin" : "Agent"}
                      </small>
                    </span>
                  </span>
                );
              },
            },
            { key: "open", label: "Open", render: (row) => row.open },
            {
              key: "resolved",
              label: "Resolved",
              render: (row) => row.resolved,
            },
            {
              key: "frt",
              label: "First response",
              render: (row) => duration(row.avgFirstResponseSeconds),
            },
            {
              key: "csat",
              label: "CSAT",
              className: "hide-sm",
              render: (row) =>
                row.satisfaction > 0 ? (
                  <span className="csat">
                    <span className="csat-track">
                      <span
                        style={{ width: `${(row.satisfaction / 5) * 100}%` }}
                      />
                    </span>
                    {row.satisfaction.toFixed(1)}
                  </span>
                ) : (
                  "—"
                ),
            },
          ]}
        />
      </Card>
    </div>
  );
}
