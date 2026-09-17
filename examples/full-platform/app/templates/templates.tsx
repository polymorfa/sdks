"use client";

import {
  TemplateBuilderController,
  createSameOriginTemplateBuilderTransport,
} from "@polymorfa/browser";
import { TemplateBuilder } from "@polymorfa/react";
import { useEffect, useState } from "react";

import { listen } from "../../lib/browser/realtime.js";

function createBuilder(): TemplateBuilderController {
  const builder = new TemplateBuilderController(
    createSameOriginTemplateBuilderTransport({
      path: "/api/polymorfa/templates",
    }),
  );
  builder.create({
    name: "order_ready",
    definition: {
      version: 1,
      kind: "standard",
      category: "UTILITY",
      language: "en_US",
      header: { format: "text", text: "Your order is ready" },
      body: "Hi {{name}}, order {{order}} is ready for pickup.",
      footer: "Acme Support",
      buttons: [
        { type: "url", text: "Track order", url: "https://acme.test/orders" },
        { type: "quick_reply", text: "Talk to an agent" },
      ],
      variables: [
        { name: "name", type: "text", example: "Ada" },
        { name: "order", type: "text", example: "A-1042" },
      ],
    },
    sampleValues: { name: "Ada", order: "A-1042" },
  });
  return builder;
}

export function Templates() {
  const [status, setStatus] = useState<string>();

  // Meta review results arrive as `template.status` webhooks.
  useEffect(
    () =>
      listen({
        "template.status": (event) =>
          setStatus(`${event.templateId}: ${event.status}`),
      }),
    [],
  );

  return (
    <>
      {status && <p role="status">Review update: {status}</p>}
      <TemplateBuilder createController={createBuilder} />
    </>
  );
}
