import { readFileSync } from "node:fs";
// API-owned public test vectors; source metadata lives beside the shared fixture.
export const MACHINE_CREDENTIALS = JSON.parse(
  readFileSync(
    new URL(
      "../../../../contracts/machine-credentials.v1.json",
      import.meta.url,
    ),
    "utf8",
  ),
);
export const ORGANIZATION_API_KEY: string = MACHINE_CREDENTIALS.opaque[0].token;
export const PROJECT_TOKEN: string = MACHINE_CREDENTIALS.opaque[1].token;
