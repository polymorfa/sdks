import type { MessageAttachment } from "@polymorfa/browser";

import type { DeskStore } from "./store.js";
import type {
  Connection,
  DeskCampaign,
  DeskContact,
  DeskMessage,
  DeskTemplate,
  TicketStatus,
} from "./types.js";

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;

export const DEMO_CONNECTIONS: Connection[] = [
  {
    id: "support-main",
    name: "Support · Main",
    phone: "+14155550100",
    platform: "android",
    isBusiness: true,
    status: "connected",
    color: "#10b981",
    messageCount: 18234,
    lastActiveAt: Date.now() - 2 * MINUTE,
    health: { score: 94, level: "healthy" },
  },
  {
    id: "sales-us",
    name: "Sales · US",
    phone: "+14155550142",
    platform: "ios",
    isBusiness: true,
    status: "connected",
    color: "#6366f1",
    messageCount: 6420,
    lastActiveAt: Date.now() - 11 * MINUTE,
    health: { score: 71, level: "watch" },
  },
  {
    id: "billing-eu",
    name: "Billing · EU",
    phone: "+442071838750",
    platform: "meta_cloud",
    isBusiness: true,
    status: "disconnected",
    color: "#f59e0b",
    messageCount: 910,
    lastActiveAt: Date.now() - 26 * HOUR,
    health: { score: 48, level: "at_risk" },
  },
];

export const DEMO_TEMPLATES: DeskTemplate[] = [
  {
    id: "tpl_order_ready",
    name: "order_ready",
    category: "UTILITY",
    language: "en_US",
    status: "APPROVED",
    header: "Your order is ready",
    body: "Hi {{name}}, order {{order}} is ready for pickup at our downtown store.",
    footer: "Acme Support",
    buttons: ["Track order", "Talk to an agent"],
    variables: ["name", "order"],
    updatedAt: Date.now() - 3 * 24 * HOUR,
  },
  {
    id: "tpl_follow_up",
    name: "support_follow_up",
    category: "UTILITY",
    language: "en_US",
    status: "APPROVED",
    body: "Hi {{name}}, we are following up on your support request. Reply to this message to continue the conversation.",
    footer: "Reply STOP to opt out",
    buttons: ["Continue"],
    variables: ["name"],
    updatedAt: Date.now() - 9 * 24 * HOUR,
  },
  {
    id: "tpl_spring_sale",
    name: "spring_sale",
    category: "MARKETING",
    language: "en_US",
    status: "PENDING",
    header: "Spring sale: 20% off",
    body: "Hi {{name}}, our spring sale starts today. Use code SPRING20 at checkout.",
    buttons: ["Shop now"],
    variables: ["name"],
    updatedAt: Date.now() - 5 * HOUR,
  },
  {
    id: "tpl_payment_failed",
    name: "payment_failed",
    category: "UTILITY",
    language: "es_ES",
    status: "REJECTED",
    body: "Hola {{name}}, no pudimos procesar tu pago de {{amount}}.",
    buttons: [],
    variables: ["name", "amount"],
    updatedAt: Date.now() - 2 * 24 * HOUR,
  },
  {
    id: "tpl_otp",
    name: "login_code",
    category: "AUTHENTICATION",
    language: "en_US",
    status: "APPROVED",
    body: "{{code}} is your Acme verification code.",
    buttons: ["Copy code"],
    variables: ["code"],
    updatedAt: Date.now() - 30 * 24 * HOUR,
  },
];

export function demoCampaigns(): DeskCampaign[] {
  const now = Date.now();
  return [
    {
      id: "cmp_spring",
      name: "Spring sale announcement",
      status: "running",
      templateId: "tpl_spring_sale",
      recipientCount: 4200,
      sentCount: 2730,
      deliveredCount: 2611,
      readCount: 1488,
      failedCount: 19,
      scheduledAt: now - 2 * HOUR,
      createdAt: now - 26 * HOUR,
    },
    {
      id: "cmp_followup",
      name: "Unresolved ticket follow-up",
      status: "completed",
      templateId: "tpl_follow_up",
      recipientCount: 318,
      sentCount: 318,
      deliveredCount: 312,
      readCount: 250,
      failedCount: 6,
      scheduledAt: now - 3 * 24 * HOUR,
      createdAt: now - 4 * 24 * HOUR,
    },
    {
      id: "cmp_vip",
      name: "VIP early access",
      status: "scheduled",
      templateId: "tpl_order_ready",
      recipientCount: 120,
      sentCount: 0,
      deliveredCount: 0,
      readCount: 0,
      failedCount: 0,
      scheduledAt: now + 20 * HOUR,
      createdAt: now - 3 * HOUR,
    },
    {
      id: "cmp_draft",
      name: "Holiday hours",
      status: "draft",
      templateId: null,
      recipientCount: 0,
      sentCount: 0,
      deliveredCount: 0,
      readCount: 0,
      failedCount: 0,
      scheduledAt: null,
      createdAt: now - 40 * MINUTE,
    },
  ];
}

type Line =
  | readonly ["in" | "out", string]
  | readonly ["in" | "out", "image" | "video", string, string]
  | readonly ["in" | "out", "audio" | "document", string]
  | readonly ["in", "location", string]
  | readonly ["out", "contact", string];

interface Script {
  readonly name: string;
  readonly phone: string;
  readonly status: TicketStatus;
  readonly queue: string;
  readonly assignee?: string;
  readonly connection: string;
  readonly tags: readonly string[];
  readonly unread: number;
  readonly minutesAgo: number;
  readonly avatar?: string;
  readonly company?: string;
  readonly lines: readonly Line[];
}

const SCRIPTS: Script[] = [
  {
    name: "Ada Lovelace",
    phone: "+14155550123",
    status: "open",
    queue: "support",
    assignee: "casey",
    connection: "support-main",
    tags: ["lb_vip", "lb_order"],
    unread: 2,
    minutesAgo: 1,
    avatar: "/demo/avatar-1.svg",
    company: "Analytical Engines Ltd",
    lines: [
      ["in", "Hi! My order A-1042 arrived but the box was damaged 😕"],
      [
        "out",
        "Sorry to hear that, Ada. Could you send a photo of the package?",
      ],
      ["in", "image", "/demo/package.svg", "Here it is"],
      ["out", "Thanks. I have started a replacement for you."],
      ["out", "document", "Replacement-A-1042.pdf"],
      ["in", "That was fast, thank you!"],
      ["in", "Will the courier pick up the damaged one?"],
    ],
  },
  {
    name: "Grace Hopper",
    phone: "+14155550177",
    status: "pending",
    queue: "billing",
    connection: "support-main",
    tags: ["lb_billing"],
    unread: 3,
    minutesAgo: 4,
    avatar: "/demo/avatar-2.svg",
    company: "Compiler Co",
    lines: [
      ["in", "Hello, I was charged twice for my March invoice."],
      ["in", "document", "invoice-march.pdf"],
      ["in", "Can someone look at this today?"],
    ],
  },
  {
    name: "Alan Turing",
    phone: "+447700900123",
    status: "open",
    queue: "sales",
    assignee: "casey",
    connection: "sales-us",
    tags: ["lb_lead"],
    unread: 0,
    minutesAgo: 9,
    avatar: "/demo/avatar-3.svg",
    lines: [
      ["in", "Do you ship the Enigma desk lamp to the UK?"],
      ["out", "We do! Delivery takes 3-5 business days."],
      ["in", "audio", "voice-note.wav"],
      ["out", "Sure. Here is the product sheet."],
      ["out", "image", "/demo/lamp.svg", "Enigma desk lamp · $129"],
    ],
  },
  {
    name: "Katherine Johnson",
    phone: "+13055550188",
    status: "open",
    queue: "support",
    assignee: "jordan",
    connection: "support-main",
    tags: ["lb_urgent"],
    unread: 1,
    minutesAgo: 14,
    lines: [
      ["in", "The app keeps logging me out."],
      ["out", "Which version of the app are you using?"],
      ["in", "4.2.1 on iPhone"],
    ],
  },
  {
    name: "Linus Park",
    phone: "+821055550199",
    status: "pending",
    queue: "support",
    connection: "support-main",
    tags: [],
    unread: 1,
    minutesAgo: 17,
    lines: [["in", "location", "Our store, 12 Market St"]],
  },
  {
    name: "Margaret Hamilton",
    phone: "+16175550142",
    status: "open",
    queue: "billing",
    assignee: "priya",
    connection: "support-main",
    tags: ["lb_billing", "lb_vip"],
    unread: 0,
    minutesAgo: 26,
    avatar: "/demo/avatar-4.svg",
    lines: [
      ["in", "Can I switch to annual billing?"],
      ["out", "Yes, you save 15%. I can switch it now."],
      ["out", "contact", "Billing team|+14155550199"],
    ],
  },
  {
    name: "Tim Berners-Lee",
    phone: "+442079460000",
    status: "resolved",
    queue: "support",
    assignee: "casey",
    connection: "support-main",
    tags: ["lb_order"],
    unread: 0,
    minutesAgo: 55,
    lines: [
      ["in", "Where is my order?"],
      ["out", "It is out for delivery and arrives today."],
      ["in", "Great, thanks 🙏"],
    ],
  },
  {
    name: "Hedy Lamarr",
    phone: "+436605550111",
    status: "pending",
    queue: "sales",
    connection: "sales-us",
    tags: ["lb_lead"],
    unread: 2,
    minutesAgo: 62,
    lines: [
      ["in", "Hi, do you offer volume discounts?"],
      ["in", "We need about 200 units."],
    ],
  },
  {
    name: "Dennis Ritchie",
    phone: "+19085550100",
    status: "open",
    queue: "support",
    assignee: "marco",
    connection: "support-main",
    tags: [],
    unread: 0,
    minutesAgo: 80,
    lines: [
      ["in", "video", "/demo/unboxing.svg", "The device makes this noise"],
      [
        "out",
        "Thanks for the video. That sounds like the fan; I will send a replacement part.",
      ],
    ],
  },
];

const EXTRA_NAMES = [
  "Radia Perlman",
  "Barbara Liskov",
  "Ken Thompson",
  "Frances Allen",
  "John McCarthy",
  "Shafi Goldwasser",
  "Donald Knuth",
  "Sophie Wilson",
  "Guido Rossum",
  "Anita Borg",
  "Leslie Lamport",
  "Jean Sammet",
  "Niklaus Wirth",
  "Mary Kenneth Keller",
  "Edsger Dijkstra",
  "Carol Shaw",
];

const EXTRA_LINES: readonly (readonly Line[])[] = [
  [
    ["in", "Is the store open on Sunday?"],
    ["out", "Yes, from 10am to 4pm."],
  ],
  [["in", "I want to return a jacket."]],
  [
    ["in", "Thanks for the quick help yesterday!"],
    ["out", "Happy to help 😊"],
  ],
  [["in", "Can I change my delivery address?"]],
  [["in", "image", "/demo/receipt.svg", "Receipt attached"]],
  [
    ["in", "My discount code is not working"],
    ["out", "Let me check that for you."],
  ],
];

const STATUSES: readonly TicketStatus[] = ["open", "pending", "resolved"];
const QUEUES = ["support", "sales", "billing"] as const;
const AGENTS = ["casey", "jordan", "priya", "marco"] as const;
const TAG_IDS = ["lb_vip", "lb_order", "lb_billing", "lb_lead", "lb_urgent"];

function allScripts(): Script[] {
  const extra = EXTRA_NAMES.map((name, index): Script => {
    const status = STATUSES[index % 3] ?? "open";
    return {
      name,
      phone: `+1646555${String(1000 + index * 37).padStart(4, "0")}`,
      status,
      queue: QUEUES[index % 3] ?? "support",
      ...(status === "pending"
        ? {}
        : { assignee: AGENTS[index % AGENTS.length] ?? "casey" }),
      connection: index % 4 === 0 ? "sales-us" : "support-main",
      tags:
        index % 3 === 0 ? [TAG_IDS[index % TAG_IDS.length] ?? "lb_order"] : [],
      unread: status === "resolved" ? 0 : index % 3,
      minutesAgo: 95 + index * 47,
      lines: EXTRA_LINES[index % EXTRA_LINES.length] ?? [],
    };
  });
  return [...SCRIPTS, ...extra];
}

export function seedStore(store: DeskStore, voiceNote: Uint8Array): void {
  const agents = [
    ["casey", "Casey Rivera", "admin", "online", "#0f766e"],
    ["jordan", "Jordan Lee", "agent", "online", "#7c3aed"],
    ["priya", "Priya Natarajan", "agent", "away", "#db2777"],
    ["marco", "Marco Bianchi", "agent", "offline", "#ea580c"],
  ] as const;
  for (const [id, name, role, status, color] of agents) {
    store.agents.set(id, {
      id,
      name,
      email: `${id}@acme.test`,
      role,
      status,
      color,
    });
  }
  for (const [id, name, color] of [
    ["support", "Support", "#0ea5e9"],
    ["sales", "Sales", "#8b5cf6"],
    ["billing", "Billing", "#f59e0b"],
  ] as const) {
    store.queues.set(id, { id, name, color });
  }
  for (const [id, name, color] of [
    ["lb_vip", "VIP", 16],
    ["lb_order", "Order issue", 1],
    ["lb_billing", "Billing", 2],
    ["lb_lead", "New lead", 5],
    ["lb_urgent", "Urgent", 13],
  ] as const) {
    store.tags.set(id, { id, name, color, chatCount: 0 });
  }
  for (const [id, shortcut, message] of [
    [
      "qr_hello",
      "hello",
      "Hi! Thanks for contacting Acme. How can I help you today?",
    ],
    [
      "qr_hours",
      "hours",
      "We are open Monday to Friday, 9am to 6pm, and Saturday 10am to 4pm.",
    ],
    [
      "qr_refund",
      "refund",
      "Refunds reach your original payment method within 5-7 business days.",
    ],
    [
      "qr_track",
      "track",
      "You can track your order at https://acme.test/orders.",
    ],
    [
      "qr_bye",
      "bye",
      "Is there anything else I can help with? Have a great day!",
    ],
  ] as const) {
    store.quickReplies.set(id, { id, shortcut, message });
  }

  const voice = store.storeMedia(
    { name: "voice-note.wav", contentType: "audio/wav", bytes: voiceNote },
    "",
  );
  const pdf = (name: string) =>
    store.storeMedia(
      { name, contentType: "application/pdf", bytes: samplePdf(name) },
      "",
    );

  const now = Date.now();
  allScripts().forEach((script, index) => {
    const contact: DeskContact = {
      id: `ct_demo_${index}`,
      name: script.name,
      phone: script.phone,
      ...(script.avatar === undefined ? {} : { avatarUrl: script.avatar }),
      about: index % 2 === 0 ? "Hey there! I am using WhatsApp." : "Available",
      email: `${script.name.split(" ")[0]?.toLowerCase()}@example.com`,
      ...(script.company === undefined ? {} : { company: script.company }),
      tags: script.tags,
      customFields: {
        Plan: ["Pro", "Starter", "Enterprise"][index % 3] ?? "Pro",
        "Account ID": `AC-${String(4100 + index * 7)}`,
        City:
          ["San Francisco", "London", "Berlin", "São Paulo"][index % 4] ?? "",
      },
      notes: index === 0 ? "Prefers WhatsApp over email. Ships to office." : "",
      blocked: false,
      muted: false,
      ...(script.company === undefined
        ? {}
        : {
            business: {
              description: `${script.company} builds calculating machines.`,
              category: "Technology",
              website: "https://example.com",
            },
          }),
      createdAt: now - (index + 3) * 24 * HOUR,
      lastSeenAt: now - script.minutesAgo * MINUTE,
    };
    store.contacts.set(contact.id, contact);

    const lastAt = now - script.minutesAgo * MINUTE;
    const createdAt = lastAt - script.lines.length * 3 * MINUTE - 5 * MINUTE;
    const ticketId = `tk_demo_${index}`;
    store.tickets.set(ticketId, {
      id: ticketId,
      number: store.nextTicketNumber(),
      contact,
      status: script.status,
      queueId: script.queue,
      ...(script.assignee === undefined ? {} : { assigneeId: script.assignee }),
      connectionId: script.connection,
      unread: 0,
      createdAt,
      updatedAt: lastAt,
      ...(script.status === "resolved" ? { resolvedAt: lastAt } : {}),
    });

    script.lines.forEach((line, lineIndex) => {
      const at = lastAt - (script.lines.length - 1 - lineIndex) * 3 * MINUTE;
      const direction = line[0] === "in" ? "inbound" : "outbound";
      const base = {
        id: `msg_${ticketId}_${lineIndex}`,
        ticketId,
        createdAt: at,
        direction,
        status: "sent",
        ...(direction === "outbound"
          ? {
              delivery:
                lineIndex >= script.lines.length - 1
                  ? ("delivered" as const)
                  : ("read" as const),
              authorId: script.assignee ?? "casey",
            }
          : {}),
      } as const;
      const message = messageFor(line, base, { voice, pdf });
      store.upsert(message, { countUnread: false });
    });

    const ticket = store.tickets.get(ticketId);
    if (ticket !== undefined) {
      store.saveTicket(
        {
          ...ticket,
          status: script.status,
          unread: script.unread,
          ...(ticket.lastInboundAt === undefined
            ? { lastInboundAt: index % 7 === 3 ? now - 30 * HOUR : lastAt }
            : {}),
          // Ticket 4 is outside the 24h window, to show the template prompt.
          ...(index === 3 ? { lastInboundAt: now - 26 * HOUR } : {}),
        },
        false,
      );
    }
    if (index === 0) {
      store.patchMessage(ticketId, `msg_${ticketId}_3`, {
        reactions: [{ emoji: "❤️", fromMe: false }],
      });
    }
    if (index === 2) {
      store.patchMessage(ticketId, `msg_${ticketId}_2`, {
        transcript: "Hi, can you also tell me if it comes with a UK plug?",
      });
    }
    if (index === 1) seedBotHandoff(store, ticketId, createdAt);
  });

  for (const tag of store.tags.values()) {
    const chatCount = [...store.contacts.values()].filter((contact) =>
      contact.tags.includes(tag.id),
    ).length;
    store.tags.set(tag.id, { ...tag, chatCount });
  }

  store.calls.push(
    call(
      "+14155550123",
      "Ada Lovelace",
      "incoming",
      false,
      "answered",
      312,
      35,
    ),
    call(
      "+447700900123",
      "Alan Turing",
      "outgoing",
      true,
      "answered",
      845,
      120,
    ),
    call(
      "+13055550188",
      "Katherine Johnson",
      "incoming",
      false,
      "missed",
      0,
      190,
    ),
    call(
      "+16175550142",
      "Margaret Hamilton",
      "outgoing",
      false,
      "rejected",
      0,
      26 * 60,
    ),
    call(
      "+19085550100",
      "Dennis Ritchie",
      "incoming",
      true,
      "answered",
      128,
      30 * 60,
    ),
  );
}

/** A chatbot conversation that hands off to a person, with rich message types. */
function seedBotHandoff(store: DeskStore, ticketId: string, before: number) {
  const at = (minutes: number) => before - minutes * MINUTE;
  const base = { ticketId, status: "sent" as const };
  const messages: DeskMessage[] = [
    {
      ...base,
      id: `bot_${ticketId}_1`,
      kind: "interactive",
      text: "Hi Grace 👋 I am Acme's assistant. What do you need help with?",
      createdAt: at(9),
      direction: "outbound",
      delivery: "read",
      bot: true,
      interactive: {
        type: "buttons",
        body: "Hi Grace 👋 I am Acme's assistant. What do you need help with?",
        buttons: ["Orders", "Billing", "Something else"],
      },
    },
    {
      ...base,
      id: `bot_${ticketId}_2`,
      kind: "interactive",
      text: "",
      createdAt: at(8),
      direction: "inbound",
      selection: { title: "Billing" },
    },
    {
      ...base,
      id: `bot_${ticketId}_3`,
      kind: "interactive",
      text: "Which billing topic?",
      createdAt: at(7.5),
      direction: "outbound",
      delivery: "read",
      bot: true,
      interactive: {
        type: "list",
        body: "Which billing topic?",
        buttonText: "Choose a topic",
        rows: ["Refund", "Duplicate charge", "Change plan"],
      },
    },
    {
      ...base,
      id: `bot_${ticketId}_4`,
      kind: "interactive",
      text: "",
      createdAt: at(7),
      direction: "inbound",
      selection: { title: "Duplicate charge" },
    },
    {
      ...base,
      id: `bot_${ticketId}_5`,
      kind: "sticker",
      text: "",
      createdAt: at(6.5),
      direction: "inbound",
      attachments: [
        {
          id: `bot_${ticketId}_sticker`,
          name: "sticker.svg",
          size: 2048,
          contentType: "image/svg+xml",
          url: "/demo/sticker.svg",
          previewUrl: "/demo/sticker.svg",
        },
      ],
    },
    {
      ...base,
      id: `sys_${ticketId}_handoff`,
      kind: "system",
      text: "Assistant handed the conversation to the Billing queue",
      createdAt: at(6),
      direction: "inbound",
    },
  ];
  store.history.prepend(ticketId, messages);
}

function call(
  peer: string,
  name: string,
  direction: "incoming" | "outgoing",
  video: boolean,
  outcome: "answered" | "missed" | "rejected",
  durationSeconds: number,
  minutesAgo: number,
) {
  return {
    id: `call_${peer}_${minutesAgo}`,
    peer,
    name,
    direction,
    video,
    outcome,
    durationSeconds,
    at: Date.now() - minutesAgo * MINUTE,
  };
}

type Base = Pick<
  DeskMessage,
  | "id"
  | "ticketId"
  | "createdAt"
  | "direction"
  | "status"
  | "delivery"
  | "authorId"
>;

function messageFor(
  line: Line,
  base: Base,
  media: {
    voice: MessageAttachment;
    pdf: (name: string) => MessageAttachment;
  },
): DeskMessage {
  if (line.length === 2) return { ...base, kind: "text", text: line[1] };
  if (line.length === 4) {
    const [, kind, url, caption] = line;
    return {
      ...base,
      kind,
      text: caption,
      attachments: [
        {
          id: `${base.id}_att`,
          name: url.split("/").pop() ?? "image.svg",
          size: 48_210,
          contentType: kind === "image" ? "image/svg+xml" : "video/mp4",
          url,
          previewUrl: url,
        },
      ],
    };
  }
  const [, kind, value] = line;
  switch (kind) {
    case "audio":
      return { ...base, kind, text: "", attachments: [media.voice] };
    case "document":
      return { ...base, kind, text: "", attachments: [media.pdf(value)] };
    case "location":
      return {
        ...base,
        kind,
        text: "",
        location: {
          lat: 37.7936,
          long: -122.3958,
          name: value,
          address: "San Francisco, CA",
        },
      };
    case "contact": {
      const [name = value, phone = ""] = value.split("|");
      return { ...base, kind, text: "", contactCard: { name, phone } };
    }
  }
}

/** A one-page PDF with a title line. */
function samplePdf(title: string): Uint8Array {
  const safe = title.replace(/[()\\]/g, "");
  const stream = `BT /F1 18 Tf 72 720 Td (${safe}) Tj ET`;
  const objects = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
    "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>",
    `<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`,
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
  ];
  let body = "%PDF-1.4\n";
  const offsets: number[] = [];
  objects.forEach((object, index) => {
    offsets.push(body.length);
    body += `${index + 1} 0 obj\n${object}\nendobj\n`;
  });
  const xref = body.length;
  body += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  for (const offset of offsets) {
    body += `${String(offset).padStart(10, "0")} 00000 n \n`;
  }
  body += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  return new TextEncoder().encode(body);
}

/** A short two-tone WAV clip, so the demo voice note plays. */
export function sampleVoiceNote(): Uint8Array {
  const rate = 8000;
  const seconds = 2;
  const samples = rate * seconds;
  const buffer = new ArrayBuffer(44 + samples);
  const view = new DataView(buffer);
  const write = (offset: number, text: string) => {
    for (let i = 0; i < text.length; i += 1) {
      view.setUint8(offset + i, text.charCodeAt(i));
    }
  };
  write(0, "RIFF");
  view.setUint32(4, 36 + samples, true);
  write(8, "WAVE");
  write(12, "fmt ");
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, 1, true);
  view.setUint32(24, rate, true);
  view.setUint32(28, rate, true);
  view.setUint16(32, 1, true);
  view.setUint16(34, 8, true);
  write(36, "data");
  view.setUint32(40, samples, true);
  for (let i = 0; i < samples; i += 1) {
    const t = i / rate;
    const frequency = t < 1 ? 440 : 554;
    const envelope = Math.min(1, (seconds - t) * 4, t * 8);
    const value = Math.sin(2 * Math.PI * frequency * t) * 0.35 * envelope;
    view.setUint8(44 + i, Math.round(128 + value * 127));
  }
  return new Uint8Array(buffer);
}
