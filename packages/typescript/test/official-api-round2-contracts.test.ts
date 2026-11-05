import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { expect, it } from "vitest";
const file = (p: string) =>
  readFileSync(new URL(`../../../${p}`, import.meta.url));
it("pins each round-2 contract subset to its exact merge and leaves publication held", () => {
  const pin = JSON.parse(
    file("contracts/official-api-round2.json").toString(),
  ) as {
    published: boolean;
    sourceCommit: string;
    errorCodes: string[];
    items: {
      item: string;
      mergeSha: string;
      snapshotPath: string;
      snapshotSha256: string;
      sourceSha256: string;
      releaseSha256: string;
    }[];
  };
  expect(pin.published).toBe(false);
  expect(pin.sourceCommit).toBe("9bb1e2ed92d8b4a07ff727f8e7ae185498f0868f");
  expect(pin.items.map((x) => x.item)).toEqual([
    "OA-03",
    "OA-16",
    "OA-17",
    "OA-18",
    "OA-21",
    "OA-30",
  ]);
  const sourceErrorCodes = new Set<string>();
  for (const item of pin.items) {
    expect(item.mergeSha).toMatch(/^[a-f0-9]{40}$/);
    expect(item.sourceSha256).toMatch(/^[a-f0-9]{64}$/);
    expect(item.releaseSha256).toMatch(/^[a-f0-9]{64}$/);
    expect(
      createHash("sha256").update(file(item.snapshotPath)).digest("hex"),
    ).toBe(item.snapshotSha256);
    const spec = JSON.parse(file(item.snapshotPath).toString()) as {
      paths: Record<string, unknown>;
      components: {
        schemas: {
          PublicError?: {
            properties: { error: { properties: { code: { enum: string[] } } } };
          };
        };
      };
    };
    for (const code of spec.components.schemas.PublicError?.properties.error
      .properties.code.enum ?? [])
      sourceErrorCodes.add(code);
    // These catalog errors are documented in operation responses rather than
    // the shared PublicError enum at the OA-16 merge.
    for (const code of ["catalog_cache_full", "catalog_sync_cooldown"])
      if (JSON.stringify(spec.paths).includes(code)) sourceErrorCodes.add(code);
    expect(Object.keys(spec.paths).some((p) => p.startsWith("/console/"))).toBe(
      false,
    );
  }
  for (const code of pin.errorCodes)
    expect(sourceErrorCodes.has(code), code).toBe(true);
});
