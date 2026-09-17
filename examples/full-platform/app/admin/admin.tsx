"use client";

import { useState } from "react";

import { callApi } from "../../lib/browser/api.js";

const READS = [
  ["Organization", "/api/admin/organization"],
  ["Projects", "/api/admin/projects"],
  ["Sessions", "/api/admin/sessions"],
  ["Customers", "/api/admin/customers"],
  ["Audiences", "/api/admin/audiences"],
  ["Opt-outs", "/api/admin/opt-outs"],
  ["Campaigns", "/api/admin/campaigns"],
  ["Billing", "/api/admin/billing"],
  ["Security", "/api/admin/security"],
  ["BanSafe", "/api/admin/bansafe"],
  ["Events", "/api/admin/events"],
  ["Webhooks", "/api/admin/webhooks"],
  ["Settings", "/api/admin/settings"],
  ["Platform status", "/api/admin/bridge"],
  ["Messaging sessions", "/api/messaging/sessions"],
  ["Client rules", "/api/messaging/client-rules"],
  ["Observation policies", "/api/messaging/observation-policies"],
] as const;

export function Admin() {
  const [output, setOutput] = useState<string>("");
  const [link, setLink] = useState<string>();

  const run = async (task: () => Promise<unknown>) => {
    try {
      setOutput(JSON.stringify(await task(), null, 2));
    } catch (error) {
      setOutput(error instanceof Error ? error.message : String(error));
    }
  };

  return (
    <>
      <section aria-label="Reads">
        {READS.map(([label, path]) => (
          <button
            key={path}
            type="button"
            onClick={() => run(() => callApi(path))}
          >
            {label}
          </button>
        ))}
      </section>
      <section aria-label="Connect a number">
        <button
          type="button"
          onClick={() =>
            run(async () => {
              const created = await callApi<{ url: string }>(
                "/api/messaging/quicklinks",
                { action: "create", externalId: "acme-support" },
                { idempotencyKey: crypto.randomUUID() },
              );
              // QuickLink is hosted by Polymorfa: send the person to the URL.
              setLink(created.url);
              return created;
            })
          }
        >
          Create QuickLink
        </button>
        {link && (
          <a href={link} target="_blank" rel="noreferrer">
            Open hosted QuickLink
          </a>
        )}
      </section>
      <pre aria-live="polite">{output}</pre>
    </>
  );
}
