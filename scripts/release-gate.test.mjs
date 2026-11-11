import { test } from "node:test";
import assert from "node:assert/strict";
import {
  readFileSync,
  writeFileSync,
  copyFileSync,
  mkdirSync,
  mkdtempSync,
} from "node:fs";
import { join } from "node:path";
import { homedir } from "node:os";
import { pathToFileURL } from "node:url";
import {
  validateAcceptance,
  releaseVersion,
  validateFeatureContractPins,
  validateGuestCallPublication,
  multiSourcePins,
  campaignSupplementPins,
  expectedContract,
} from "./release-gate.mjs";
const expected = {
  sourceSha: "a".repeat(40),
  apiVersion: "2026-09-22",
  environment: "staging",
  contracts: {
    messaging: {
      sourcePath: "apps/api/docs/openapi.json",
      sha256: "b".repeat(64),
    },
    platform: {
      sourcePath: "apps/api/docs/openapi.management.json",
      sha256: "c".repeat(64),
    },
  },
};
const receipt = {
  ...expected,
  schemaVersion: 1,
  repository: "polymorfa/polymorfa",
  result: "passed",
  scenarios: [{ result: "passed" }],
  deployment: { commit: expected.sourceSha, status: "finished" },
  acceptedAt: "2026-10-04T02:00:00Z",
  runUrl: "https://github.com/polymorfa/polymorfa/actions/runs/123",
};
test("campaign supplements bind both audiences to the accepted full contract", () => {
  const source = {
    repository: "polymorfa/polymorfa",
    commit: expected.sourceSha,
    contracts: expected.contracts,
  };
  const supplement = {
    repository: source.repository,
    commit: source.commit,
    sources: Object.fromEntries(
      Object.entries(source.contracts).map(([family, snapshot]) => [
        family,
        { sourcePath: snapshot.sourcePath, sourceSha256: snapshot.sha256 },
      ]),
    ),
  };
  validateFeatureContractPins(source, campaignSupplementPins(supplement));
  for (const changed of [
    { ...supplement, commit: "f".repeat(40) },
    { ...supplement, published: false },
    {
      ...supplement,
      sources: {
        ...supplement.sources,
        messaging: supplement.sources.platform,
      },
    },
  ])
    assert.throws(() =>
      validateFeatureContractPins(source, campaignSupplementPins(changed)),
    );
  assert.throws(() =>
    campaignSupplementPins({
      ...supplement,
      sources: { messaging: supplement.sources.messaging },
    }),
  );
});
test("unpublished campaign and custody additions block publication even after source reconciliation", () => {
  const supplement = JSON.parse(
    readFileSync(
      new URL("../contracts/campaign-custody-20261014.json", import.meta.url),
      "utf8",
    ),
  );
  const source = {
    repository: supplement.repository,
    commit: supplement.commit,
    contracts: Object.fromEntries(
      Object.entries(supplement.sources).map(([family, snapshot]) => [
        family,
        { sourcePath: snapshot.sourcePath, sha256: snapshot.sourceSha256 },
      ]),
    ),
  };
  assert.throws(
    () =>
      validateFeatureContractPins(source, campaignSupplementPins(supplement)),
    /held from publication/,
  );
});
test("nightly requires exact staging acceptance; stable requires production", () => {
  assert.equal(validateAcceptance(receipt, expected), receipt);
  for (const delta of [
    { environment: "production" },
    { sourceSha: "d".repeat(40) },
    { apiVersion: "2026-09-23" },
    { contracts: {} },
  ])
    assert.throws(() => validateAcceptance({ ...receipt, ...delta }, expected));
  assert.throws(() =>
    validateAcceptance(receipt, { ...expected, environment: "production" }),
  );
});
test("source merge and health are insufficient without actual passed scenarios", () => {
  for (const delta of [
    { result: "failed" },
    { scenarios: [] },
    { scenarios: [{ result: "failed" }] },
    { deployment: { commit: "d".repeat(40), status: "finished" } },
    { runUrl: "https://example.com/untrusted" },
  ])
    assert.throws(() => validateAcceptance({ ...receipt, ...delta }, expected));
});
test("nightly timestamp changes package version without changing API contract date", () => {
  assert.equal(
    releaseVersion(
      "nightly",
      undefined,
      "0.1.0",
      new Date("2026-10-04T02:00:00Z"),
    ),
    "0.1.0-dev.20261004020000",
  );
  assert.equal(receipt.apiVersion, "2026-09-22");
  assert.equal(releaseVersion("stable", "0.1.0", "0.1.0"), "0.1.0");
  for (const version of ["0.1.0-dev.1", "2026-09-22", "01.1.0", ""])
    assert.throws(() => releaseVersion("stable", version, "0.1.0"));
  assert.throws(() => releaseVersion("nightly", "0.1.0", "0.1.0"));
});

test("new feature contracts cannot publish against an older accepted source", () => {
  const source = {
    repository: "polymorfa/polymorfa",
    commit: "a".repeat(40),
    contracts: {
      platform: {
        sha256: "b".repeat(64),
        sourcePath: "apps/api/docs/openapi.management.json",
      },
    },
  };
  const pin = {
    family: "platform",
    sourcePath: source.contracts.platform.sourcePath,
    repository: source.repository,
    sourceCommit: source.commit,
    sourceSha256: source.contracts.platform.sha256,
  };
  validateFeatureContractPins(source, [pin]);
  assert.throws(
    () =>
      validateFeatureContractPins(source, [
        { ...pin, sourceCommit: "c".repeat(40) },
      ]),
    /not been reconciled/,
  );
  assert.throws(
    () =>
      validateFeatureContractPins(source, [
        { ...pin, sourceSha256: "d".repeat(64) },
      ]),
    /hash mismatch/,
  );
});

test("Messaging feature pins cannot borrow Platform acceptance or bypass a publication hold", () => {
  const source = {
    repository: "polymorfa/polymorfa",
    commit: "a".repeat(40),
    contracts: {
      messaging: {
        sha256: "b".repeat(64),
        sourcePath: "apps/api/docs/openapi.json",
      },
      platform: {
        sha256: "c".repeat(64),
        sourcePath: "apps/api/docs/openapi.management.json",
      },
    },
  };
  const pin = {
    repository: source.repository,
    sourceCommit: source.commit,
    family: "messaging",
    sourcePath: source.contracts.messaging.sourcePath,
    sourceSha256: source.contracts.messaging.sha256,
    published: true,
  };
  validateFeatureContractPins(source, [pin]);
  for (const delta of [
    { family: "platform" },
    { family: undefined },
    { published: false },
    { sourceSha256: source.contracts.platform.sha256 },
    { sourcePath: source.contracts.platform.sourcePath },
  ])
    assert.throws(() =>
      validateFeatureContractPins(source, [{ ...pin, ...delta }]),
    );
});
test("integrated frequency-cap and segment/drip supplements are gate pins that block until reconciled", () => {
  const source = JSON.parse(
    readFileSync(new URL("../contracts/source.json", import.meta.url), "utf8"),
  );
  for (const name of [
    "campaign-frequency-cap.json",
    "campaign-segments-drip.json",
  ]) {
    const supplement = JSON.parse(
      readFileSync(new URL(`../contracts/${name}`, import.meta.url), "utf8"),
    );
    const pins = campaignSupplementPins(supplement);
    assert.deepEqual(pins.map((pin) => pin.family).sort(), [
      "messaging",
      "platform",
    ]);
    assert.notEqual(supplement.commit, source.commit);
    assert.throws(
      () => validateFeatureContractPins(source, pins),
      /not been reconciled/,
    );
    // Reconciled to its own source, the supplement passes; nothing flips a hold.
    const reconciled = {
      repository: supplement.repository,
      commit: supplement.commit,
      contracts: Object.fromEntries(
        Object.entries(supplement.sources).map(([family, snapshot]) => [
          family,
          { sourcePath: snapshot.sourcePath, sha256: snapshot.sourceSha256 },
        ]),
      ),
    };
    validateFeatureContractPins(reconciled, pins);
  }
  // The current release contract therefore fails closed.
  assert.throws(() => expectedContract(), /reconciled|held from publication/);
});

test("A two-audience supplement is checked per family and honours its hold", () => {
  const source = {
    repository: "polymorfa/polymorfa",
    commit: "a".repeat(40),
    contracts: {
      messaging: {
        sha256: "b".repeat(64),
        sourcePath: "apps/api/docs/openapi.json",
      },
      platform: {
        sha256: "c".repeat(64),
        sourcePath: "apps/api/docs/openapi.management.json",
      },
    },
  };
  const supplement = {
    repository: source.repository,
    commit: source.commit,
    published: true,
    sources: {
      messaging: {
        sourcePath: source.contracts.messaging.sourcePath,
        sourceSha256: source.contracts.messaging.sha256,
      },
      platform: {
        sourcePath: source.contracts.platform.sourcePath,
        sourceSha256: source.contracts.platform.sha256,
      },
    },
  };
  const pins = multiSourcePins(supplement);
  assert.deepEqual(
    pins.map(({ family }) => family),
    ["messaging", "platform"],
  );
  validateFeatureContractPins(source, pins);
  assert.throws(
    () =>
      validateFeatureContractPins(
        source,
        multiSourcePins({ ...supplement, published: false }),
      ),
    /held from publication/,
  );
  assert.throws(
    () =>
      validateFeatureContractPins(
        source,
        multiSourcePins({ ...supplement, commit: "e".repeat(40) }),
      ),
    /not been reconciled/,
  );
});

test("guest-call hold blocks the real publisher after other supplements are reconciled", async () => {
  const parent = join(
    homedir(),
    ".polymorfa-agent-work",
    "guest-calls",
    "release-gate-fixtures",
  );
  mkdirSync(parent, { recursive: true });
  const fixture = mkdtempSync(join(parent, "guest-hold-"));
  mkdirSync(join(fixture, "scripts"));
  mkdirSync(join(fixture, "contracts"));
  mkdirSync(join(fixture, "packages/typescript/src"), { recursive: true });
  copyFileSync(
    new URL("./release-gate.mjs", import.meta.url),
    join(fixture, "scripts/release-gate.mjs"),
  );
  copyFileSync(
    new URL("../packages/typescript/src/version.ts", import.meta.url),
    join(fixture, "packages/typescript/src/version.ts"),
  );
  const source = JSON.parse(
    readFileSync(new URL("../contracts/source.json", import.meta.url)),
  );
  writeFileSync(join(fixture, "contracts/source.json"), JSON.stringify(source));
  for (const snapshot of ["openapi.messaging.json", "openapi.platform.json"])
    copyFileSync(
      new URL("../contracts/" + snapshot, import.meta.url),
      join(fixture, "contracts", snapshot),
    );
  for (const name of [
    "calls-simultaneous-calls.json",
    "analytics-device-signals.json",
    "abprops-capabilities.json",
    "request-logs.json",
    "client-token-ceilings.json",
    "campaign-ab-tests.json",
    "campaign-message-variations.json",
    "campaign-follow-ups.json",
    "campaign-custody-20261014.json",
    "campaign-frequency-cap.json",
    "campaign-segments-drip.json",
    "official-api-round2.json",
  ]) {
    const pin = JSON.parse(
      readFileSync(new URL("../contracts/" + name, import.meta.url)),
    );
    pin.repository = source.repository;
    pin.commit = source.commit;
    pin.sourceCommit = source.commit;
    pin.published = true;
    if (pin.sources) {
      for (const [family, value] of Object.entries(pin.sources)) {
        value.sourcePath = source.contracts[family].sourcePath;
        value.sourceSha256 = source.contracts[family].sha256;
      }
    } else {
      pin.sourcePath = source.contracts[pin.family].sourcePath;
      pin.sourceSha256 = source.contracts[pin.family].sha256;
    }
    writeFileSync(join(fixture, "contracts", name), JSON.stringify(pin));
  }
  const candidate = JSON.parse(
    readFileSync(
      new URL("../contracts/calls-guests.candidate.json", import.meta.url),
    ),
  );
  const candidatePath = join(fixture, "contracts/calls-guests.candidate.json");
  writeFileSync(candidatePath, JSON.stringify(candidate));
  const publisher = await import(
    pathToFileURL(join(fixture, "scripts/release-gate.mjs")).href
  );
  assert.throws(
    () => publisher.expectedContract(),
    /Guest calls.*held from publication/,
  );
  candidate.sourceAccepted = candidate.published = true;
  candidate.httpControl.sourceAccepted = candidate.httpControl.published = true;
  candidate.candidateSource.repository = source.repository;
  candidate.candidateSource.commit = source.commit;
  candidate.candidateSource.files = [
    {
      path: source.contracts.messaging.sourcePath,
      sha256: source.contracts.messaging.sha256,
    },
  ];
  writeFileSync(candidatePath, JSON.stringify(candidate));
  assert.equal(publisher.expectedContract().sourceSha, source.commit);
});

test("guest-call publication binds both holds, version, repository, commit and Messaging hash", () => {
  const source = {
    repository: "polymorfa/polymorfa",
    commit: expected.sourceSha,
    contracts: expected.contracts,
  };
  const candidate = {
    schemaVersion: 1,
    sourceAccepted: true,
    published: true,
    httpControl: { sourceAccepted: true, published: true },
    apiVersion: expected.apiVersion,
    candidateSource: {
      repository: source.repository,
      commit: source.commit,
      files: [
        {
          path: source.contracts.messaging.sourcePath,
          sha256: source.contracts.messaging.sha256,
        },
      ],
    },
  };
  validateGuestCallPublication(source, candidate, expected.apiVersion);
  for (const delta of [
    { sourceAccepted: false },
    { sourceAccepted: undefined },
    { published: false },
    { published: undefined },
    { httpControl: undefined },
    { httpControl: { sourceAccepted: false, published: true } },
    { httpControl: { sourceAccepted: true, published: false } },
    { httpControl: { published: true } },
    { httpControl: { sourceAccepted: true } },
    { apiVersion: "2000-01-01" },
    {
      candidateSource: {
        ...candidate.candidateSource,
        repository: "other/repo",
      },
    },
    {
      candidateSource: { ...candidate.candidateSource, commit: "f".repeat(40) },
    },
    {
      candidateSource: {
        ...candidate.candidateSource,
        files: [
          {
            path: source.contracts.messaging.sourcePath,
            sha256: "f".repeat(64),
          },
        ],
      },
    },
    {
      candidateSource: {
        ...candidate.candidateSource,
        files: [
          {
            path: source.contracts.platform.sourcePath,
            sha256: source.contracts.platform.sha256,
          },
        ],
      },
    },
    { candidateSource: { ...candidate.candidateSource, files: [] } },
    {
      candidateSource: {
        ...candidate.candidateSource,
        files: [
          ...candidate.candidateSource.files,
          ...candidate.candidateSource.files,
        ],
      },
    },
  ])
    assert.throws(() =>
      validateGuestCallPublication(
        source,
        { ...candidate, ...delta },
        expected.apiVersion,
      ),
    );
});
