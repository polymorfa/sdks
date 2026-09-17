import type { CustomerSummary } from "@polymorfa/sdk";

import { organization } from "../../../../lib/polymorfa.js";
import { env } from "../../../../lib/env.js";
import {
  action,
  idempotencyKey,
  optionalText,
  route,
  text,
  unknownAction,
} from "../../../../lib/route.js";

// GET pages through every active Customer with the cursor in `data.page`.
export const GET = route("admin", async ({ url }) => {
  const customers = organization().customers;
  const projectId = env.projectId();
  const search = url.searchParams.get("search") ?? undefined;
  const all: CustomerSummary[] = [];
  let cursor: string | undefined;
  do {
    const response = await customers.list({
      projectId,
      limit: 100,
      status: "active",
      ...(search === undefined ? {} : { search }),
      ...(cursor === undefined ? {} : { cursor }),
    });
    all.push(...response.data.data);
    cursor = response.data.page.nextCursor ?? undefined;
  } while (cursor !== undefined && all.length < 1000);
  return all;
});

export const POST = route("admin", async ({ body, request }) => {
  const customers = organization().customers;
  const projectId = env.projectId();
  const name = action(body);
  switch (name) {
    case "status":
      return customers.status(projectId);
    case "enable":
      return customers.enable(projectId, {
        idempotencyKey: idempotencyKey(request),
      });
    case "create": {
      // Creation requires a caller-supplied idempotency key.
      const externalCustomerId = optionalText(body, "externalCustomerId");
      return customers.create(
        {
          projectId,
          name: text(body, "name"),
          ...(externalCustomerId === undefined ? {} : { externalCustomerId }),
        },
        { idempotencyKey: idempotencyKey(request) },
      );
    }
  }

  const customerId = text(body, "customerId");
  switch (name) {
    case "retrieve":
      return customers.retrieve(customerId, projectId);
    case "rename":
      return customers.update(customerId, {
        projectId,
        name: text(body, "name"),
      });
    case "archive":
      return customers.archive(
        customerId,
        { projectId },
        { idempotencyKey: idempotencyKey(request) },
      );
    case "restore":
      return customers.restore(
        customerId,
        { projectId },
        { idempotencyKey: idempotencyKey(request) },
      );
    case "numbers":
      return customers.listNumbers(customerId, projectId);
    case "events":
      return customers.listEvents(customerId, { projectId, limit: 50 });
    case "createPairingLink": {
      // The URL is returned only on the first successful attempt.
      const expectedPhone = optionalText(body, "expectedPhone");
      const response = await customers.createPairingLink(
        customerId,
        {
          projectId,
          methods: ["qr", "phone"],
          expiresInSeconds: 3600,
          ...(expectedPhone === undefined ? {} : { expectedPhone }),
        },
        { idempotencyKey: idempotencyKey(request) },
      );
      return { id: response.data.data.id, url: response.data.data.url };
    }
    case "pairingLinks":
      return customers.listPairingLinks(customerId, projectId);
    case "revokePairingLink":
      return customers.revokePairingLink(
        customerId,
        text(body, "pairingLinkId"),
        projectId,
      );
    case "transferNumber":
      return customers.transferNumber(
        customerId,
        text(body, "sessionId"),
        {
          projectId,
          sourceCustomerId: text(body, "sourceCustomerId"),
          confirm: true,
        },
        { idempotencyKey: idempotencyKey(request) },
      );
    default:
      return unknownAction(name);
  }
});
