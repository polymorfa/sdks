import type { Body } from "../route.js";

const DAY = 24 * 60 * 60 * 1000;
const now = Date.now();
const iso = (offset: number) => new Date(now - offset).toISOString();

/**
 * Sample responses for the SDK coverage routes in demo mode. They follow the
 * SDK response shapes closely enough for the Admin pages to render them.
 */
const FIXTURES: Readonly<Record<string, unknown>> = {
  "/api/admin/organization": {
    organization: {
      id: "org_demo",
      name: "Acme Inc.",
      slug: "acme",
      plan: "pay_as_you_go",
      createdAt: iso(400 * DAY),
    },
    members: [
      {
        id: "mem_1",
        name: "Casey Rivera",
        email: "casey@acme.test",
        role: "owner",
        joinedAt: iso(400 * DAY),
      },
      {
        id: "mem_2",
        name: "Jordan Lee",
        email: "jordan@acme.test",
        role: "admin",
        joinedAt: iso(210 * DAY),
      },
      {
        id: "mem_3",
        name: "Priya Natarajan",
        email: "priya@acme.test",
        role: "member",
        joinedAt: iso(90 * DAY),
      },
      {
        id: "mem_4",
        name: "Marco Bianchi",
        email: "marco@acme.test",
        role: "member",
        joinedAt: iso(12 * DAY),
      },
    ],
    apiKeys: [
      {
        id: "key_1",
        name: "Production server",
        prefix: "pmfa_live_7Hq",
        active: true,
        lastUsedAt: iso(2 * 60 * 1000),
        createdAt: iso(120 * DAY),
      },
      {
        id: "key_2",
        name: "CI deploys",
        prefix: "pmfa_live_2kL",
        active: true,
        lastUsedAt: iso(3 * DAY),
        createdAt: iso(60 * DAY),
      },
      {
        id: "key_3",
        name: "Old staging",
        prefix: "pmfa_live_9aZ",
        active: false,
        lastUsedAt: iso(80 * DAY),
        createdAt: iso(300 * DAY),
      },
    ],
    projectTokens: [
      {
        id: "ptk_1",
        name: "Acme Support app",
        prefix: "pmfa_pt_c81",
        scopes: ["messaging"],
        createdAt: iso(40 * DAY),
      },
    ],
  },
  "/api/admin/projects": [
    {
      id: "prj_support",
      name: "Acme Support",
      slug: "acme-support",
      defaultTier: "standard",
      environment: "production",
      sessionCount: 3,
      createdAt: iso(300 * DAY),
    },
    {
      id: "prj_sandbox",
      name: "Sandbox",
      slug: "sandbox",
      defaultTier: "free",
      environment: "sandbox",
      sessionCount: 1,
      createdAt: iso(20 * DAY),
    },
  ],
  "/api/admin/billing": {
    balance: {
      currency: "USD",
      available: "182.40",
      reserved: "12.00",
      autoTopUp: true,
    },
    usage: {
      periodStart: iso(16 * DAY),
      messages: 25_564,
      sessions: 3,
      amount: "96.20",
    },
    transactions: [
      {
        id: "txn_1",
        type: "top_up",
        amount: "100.00",
        currency: "USD",
        createdAt: iso(2 * DAY),
      },
      {
        id: "txn_2",
        type: "usage",
        amount: "-14.35",
        currency: "USD",
        createdAt: iso(1 * DAY),
      },
      {
        id: "txn_3",
        type: "usage",
        amount: "-11.90",
        currency: "USD",
        createdAt: iso(0.4 * DAY),
      },
      {
        id: "txn_4",
        type: "bonus",
        amount: "10.00",
        currency: "USD",
        createdAt: iso(2 * DAY),
      },
    ],
    pricing: [
      {
        tier: "free",
        region: "global",
        perSessionDay: "0.00",
        perMessage: "0.000",
      },
      {
        tier: "standard",
        region: "north_america",
        perSessionDay: "0.40",
        perMessage: "0.002",
      },
      {
        tier: "pro",
        region: "north_america",
        perSessionDay: "0.90",
        perMessage: "0.001",
      },
    ],
  },
  "/api/admin/security": {
    auditLogs: [
      {
        id: "aud_1",
        action: "api_key.created",
        actor: "casey@acme.test",
        target: "CI deploys",
        createdAt: iso(60 * DAY),
      },
      {
        id: "aud_2",
        action: "member.invited",
        actor: "casey@acme.test",
        target: "marco@acme.test",
        createdAt: iso(12 * DAY),
      },
      {
        id: "aud_3",
        action: "webhook.secret_rotated",
        actor: "jordan@acme.test",
        target: "wh_support",
        createdAt: iso(3 * DAY),
      },
      {
        id: "aud_4",
        action: "session.restarted",
        actor: "priya@acme.test",
        target: "sales-us",
        createdAt: iso(0.2 * DAY),
      },
    ],
    securityIncidents: [
      {
        id: "inc_1",
        kind: "leaked_credential",
        severity: "high",
        status: "acknowledged",
        detectedAt: iso(30 * DAY),
      },
    ],
    sessionBans: [
      {
        id: "ban_1",
        session: "old-promo",
        reason: "spam_reports",
        status: "lifted",
        createdAt: iso(70 * DAY),
      },
    ],
    activeSessionBans: [],
  },
  "/api/admin/sessions": [
    {
      id: "ses_1",
      sessionId: "support-main",
      status: "connected",
      tierOverride: null,
    },
    {
      id: "ses_2",
      sessionId: "sales-us",
      status: "connected",
      tierOverride: "pro",
    },
    {
      id: "ses_3",
      sessionId: "billing-eu",
      status: "disconnected",
      tierOverride: null,
    },
  ],
  "/api/admin/bansafe": {
    numbers: [
      {
        session: "support-main",
        phoneNumber: "+14155550100",
        health: 94,
        band: "good",
        mostLikelyHealthState: "healthy",
      },
      {
        session: "sales-us",
        phoneNumber: "+14155550142",
        health: 71,
        band: "fair",
        mostLikelyHealthState: "healthy",
      },
      {
        session: "billing-eu",
        phoneNumber: "+442071838750",
        health: 48,
        band: "poor",
        mostLikelyHealthState: "limited",
      },
    ],
    findings: [
      {
        id: "fnd_1",
        session: "billing-eu",
        severity: "critical",
        code: "block_rate_high",
        status: "open",
        createdAt: iso(1 * DAY),
      },
    ],
    incidents: [],
    claims: [],
    enforcement: [],
    healthActions: [],
    signals: [],
    collection: [],
  },
  "/api/admin/customers": [
    {
      id: "cus_1",
      name: "Northwind Traders",
      externalCustomerId: "nw-001",
      status: "active",
      numberCount: 2,
      createdAt: iso(100 * DAY),
    },
    {
      id: "cus_2",
      name: "Globex",
      externalCustomerId: "gx-17",
      status: "active",
      numberCount: 1,
      createdAt: iso(45 * DAY),
    },
  ],
  "/api/admin/events": {
    events: [
      {
        id: "evt_1",
        type: "message.received",
        session: "support-main",
        createdAt: iso(60 * 1000),
      },
      {
        id: "evt_2",
        type: "message.ack",
        session: "support-main",
        createdAt: iso(90 * 1000),
      },
      {
        id: "evt_3",
        type: "session.status",
        session: "billing-eu",
        createdAt: iso(26 * 60 * 60 * 1000),
      },
      {
        id: "evt_4",
        type: "template.status",
        session: null,
        createdAt: iso(5 * 60 * 60 * 1000),
      },
      {
        id: "evt_5",
        type: "call.missed",
        session: "support-main",
        createdAt: iso(190 * 60 * 1000),
      },
    ],
  },
  "/api/admin/webhooks": {
    webhooks: [
      {
        id: "wh_support",
        url: "https://support.acme.test/api/polymorfa/webhooks",
        enabled: true,
        format: "native",
        eventTypes: [
          "message.received",
          "message.ack",
          "call.received",
          "session.status",
        ],
        createdAt: iso(40 * DAY),
      },
      {
        id: "wh_analytics",
        url: "https://data.acme.test/hooks/polymorfa",
        enabled: false,
        format: "native",
        eventTypes: ["campaign.completed"],
        createdAt: iso(10 * DAY),
      },
    ],
    failedDeliveries: [
      {
        id: "dlv_1",
        webhookId: "wh_analytics",
        eventType: "campaign.completed",
        status: "failed",
        attempts: 8,
        lastStatusCode: 503,
        createdAt: iso(2 * DAY),
      },
    ],
  },
  "/api/admin/settings": {
    sessionConfiguration: {
      team: {
        observation: { presenceMode: "cache", typingMode: "events" },
        historySync: { mode: "metadata_only" },
      },
      project: {
        observation: { presenceMode: "cache", typingMode: "events" },
        historySync: { mode: "deliver" },
        revision: 4,
      },
    },
    quickLinkSettings: {
      team: { theme: "dark" },
      project: {
        enabled: true,
        businessName: "Acme Support",
        methods: ["qr", "pairing"],
        defaultMethod: "qr",
      },
    },
  },
  "/api/admin/bridge": {
    health: { status: "ok" },
    version: { api: "1.0.0", build: "2026.09.15" },
    bridge: {
      region: "us-east",
      kind: "regional",
      expiresAt: iso(-10 * 60 * 1000),
    },
  },
  "/api/admin/audiences": [
    {
      id: "aud_all",
      name: "All customers",
      size: 4200,
      updatedAt: iso(1 * DAY),
    },
    { id: "aud_vip", name: "VIP", size: 120, updatedAt: iso(3 * DAY) },
  ],
  "/api/admin/opt-outs": [
    { phone: "+14155550999", reason: "STOP keyword", createdAt: iso(5 * DAY) },
  ],
  "/api/admin/campaigns": [],
  "/api/messaging/sessions": [],
  "/api/messaging/inbox": {
    messages: [
      {
        id: "el_1",
        text: "Hi! Is my order on its way?",
        createdAt: now - 6 * 60_000,
        direction: "inbound",
        status: "sent",
      },
      {
        id: "el_2",
        text: "Yes, it ships today. You will get a tracking link shortly.",
        createdAt: now - 4 * 60_000,
        direction: "outbound",
        status: "sent",
      },
      {
        id: "el_3",
        text: "Perfect, thank you 🙏",
        createdAt: now - 2 * 60_000,
        direction: "inbound",
        status: "sent",
      },
    ],
  },
  "/api/messaging/client-rules": {
    allowedOrigins: ["http://localhost:3000"],
    permissions: ["messages_send", "voip_place", "voip_answer", "voip_signal"],
  },
  "/api/messaging/observation-policies": {
    presence: "cache",
    typing: "events",
    labels: "fresh",
  },
};

export function demoFixture(
  pathname: string,
  method: string,
  body: Body,
): unknown {
  if (method === "GET") return FIXTURES[pathname] ?? [];
  if (pathname === "/api/messaging/quicklinks" && body.action === "create") {
    return {
      id: "ql_demo",
      url: "https://link.polymorfa.com/demo/acme",
      expiresAt: iso(-60 * 60 * 1000),
    };
  }
  return { demo: true, action: body.action ?? null, accepted: true };
}
