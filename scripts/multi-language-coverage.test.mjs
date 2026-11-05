import { test } from "node:test";
import assert from "node:assert/strict";
import { compareCoverage, SDK_LANGUAGES } from "./check-coverage.mjs";
const operation = {
  family: "messaging",
  method: "GET",
  path: "/messaging/example",
  operationId: "example",
  fingerprint: "a".repeat(64),
};
function ledger() {
  return {
    schemaVersion: 2,
    languages: SDK_LANGUAGES,
    sourceCommit: "b".repeat(40),
    operations: [
      {
        ...operation,
        ...Object.fromEntries(
          SDK_LANGUAGES.map((language) => [
            language,
            { status: "covered", method: `${language}.Example` },
          ]),
        ),
      },
    ],
  };
}
test("one language's gap stays visible when TypeScript is complete", () => {
  const input = ledger();
  input.operations[0].go = {
    status: "missing",
    reason: "No handwritten method",
    milestone: "go-parity",
  };
  const report = compareCoverage([operation], input, true);
  assert.equal(report.covered, 1);
  assert.equal(report.languages.go.missing, 1);
  assert.deepEqual(report.gaps[0].affectedLanguages, ["go"]);
  assert.equal(report.gaps[0].languages.typescript.status, "covered");
});
test("contract drift marks each language for review", () => {
  const report = compareCoverage(
    [{ ...operation, fingerprint: "c".repeat(64) }],
    ledger(),
    false,
  );
  assert.throws(
    () =>
      compareCoverage(
        [{ ...operation, fingerprint: "c".repeat(64) }],
        ledger(),
        true,
      ),
    /contract drift/,
  );
  assert.throws(
    () => compareCoverage([], ledger(), true),
    /removed operations/,
  );
  for (const language of SDK_LANGUAGES)
    assert.equal(report.languages[language].changed, 1);
  assert.deepEqual(Object.keys(report.gaps[0].languages), SDK_LANGUAGES);
});
test("a missing language and a coverage entry without a method fail closed", () => {
  const input = ledger();
  delete input.operations[0].rust;
  assert.throws(
    () => compareCoverage([operation], input, true),
    /rust coverage/,
  );
  input.operations[0].rust = { status: "covered" };
  assert.throws(() => compareCoverage([operation], input, true), /rust method/);
});

import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { checkNativeSupplements, methodToken } from "./native-supplements.mjs";
import { checkInteractiveSupplement } from "./interactive-supplement.mjs";
const root = resolve(import.meta.dirname, "..");
const inventory = () =>
  JSON.parse(
    readFileSync(resolve(root, "contracts/native-campaign-supplements.json")),
  );
const interactiveInventory = () =>
  JSON.parse(
    readFileSync(resolve(root, "contracts/native-interactive-messages.json")),
  );

test("interactive headers, carousels and campaign reply fixtures are attributed in all six languages", () => {
  assert.deepEqual(checkInteractiveSupplement(root), {
    languages: 6,
    fields: 2,
    wireGroups: 3,
  });
});

for (const [name, mutate, expected] of [
  [
    "API commit",
    (v) => {
      v.sourceCommit = "0".repeat(40);
    },
    /API commit drifted/,
  ],
  [
    "API hash",
    (v) => {
      v.sourceSha256 = "0".repeat(64);
    },
    /API hash drifted/,
  ],
  [
    "snapshot hash",
    (v) => {
      v.contractSha256 = "0".repeat(64);
    },
    /snapshot drifted/,
  ],
  [
    "accepted baseline",
    (v) => {
      v.baseline.sourceSdkCommit = "0".repeat(40);
    },
    /baseline drifted/,
  ],
  [
    "field removal",
    (v) => {
      delete v.fields.carousel;
    },
    /field inventory drifted/,
  ],
  [
    "language removal",
    (v) => {
      delete v.languages.rust;
    },
    /all six languages/,
  ],
  [
    "missing attribution",
    (v) => {
      delete v.languages.go.carousel;
    },
    /lacks carousel attribution/,
  ],
  [
    "source path escape",
    (v) => {
      v.languages.go.mediaHeader.sourceFile = "../README.md";
    },
    /inside its package/,
  ],
  [
    "absolute wire path",
    (v) => {
      v.languages.php.carousel.testFile = resolve(root, "README.md");
    },
    /must be relative/,
  ],
  [
    "missing source symbol",
    (v) => {
      v.languages.python.mediaHeader.symbols = ["NeverImplementedHeader"];
    },
    /source symbol missing/,
  ],
  [
    "missing wire assertion",
    (v) => {
      v.languages.dotnet.campaignReplies.testNeedles = ["NeverAssertedReplyId"];
    },
    /wire evidence missing/,
  ],
  [
    "empty wire attribution",
    (v) => {
      v.languages.go.carousel.testNeedles = [];
    },
    /lacks wire evidence/,
  ],
  [
    "public method",
    (v) => {
      v.languages.typescript.sendMethod = "Client.rawTransport";
    },
    /public method drifted/,
  ],
]) {
  test(`interactive supplement rejects ${name} drift`, () => {
    const value = interactiveInventory();
    mutate(value);
    assert.throws(
      () => checkInteractiveSupplement(root, { inventory: value }),
      expected,
    );
  });
}

test("interactive coverage detects removed native registration and changed contract bytes", () => {
  const nativeManifest = resolve(root, "packages/php/coverage.json");
  const pinPath = resolve(root, "contracts/interactive-messages.json");
  for (const target of [nativeManifest, pinPath]) {
    const readFile = (path, encoding) => {
      if (path !== target) return readFileSync(path, encoding);
      const value = JSON.parse(readFileSync(path, "utf8"));
      if (target === nativeManifest)
        delete value.supplements.interactiveMessages;
      else
        value.carouselContent.properties.carousel.properties.cards.maxItems = 11;
      const bytes = Buffer.from(JSON.stringify(value));
      return encoding ? bytes.toString(encoding) : bytes;
    };
    assert.throws(
      () => checkInteractiveSupplement(root, { readFile }),
      /registration drifted|snapshot drifted/,
    );
  }
});

import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { spawnSync } from "node:child_process";

test("the shared coverage CLI rejects a missing interactive registration", () => {
  const parent = resolve(homedir(), ".polymorfa-agent-work");
  mkdirSync(parent, { recursive: true });
  const work = mkdtempSync(resolve(parent, "sdk-interactive-coverage-"));
  try {
    const ledger = JSON.parse(
      readFileSync(resolve(root, "contracts/coverage.json")),
    );
    delete ledger.supplements.interactiveMessages;
    const path = resolve(work, "coverage.json");
    writeFileSync(path, JSON.stringify(ledger));
    const result = spawnSync(
      process.execPath,
      [
        resolve(root, "scripts/check-coverage.mjs"),
        "--messaging",
        resolve(root, "contracts/openapi.messaging.json"),
        "--platform",
        resolve(root, "contracts/openapi.platform.json"),
        "--ledger",
        path,
        "--strict",
      ],
      { encoding: "utf8" },
    );
    assert.equal(result.status, 1, result.stdout + result.stderr);
    assert.match(result.stderr, /interactive coverage registration drifted/);
  } finally {
    rmSync(work, { recursive: true, force: true });
  }
});
test("the integrated campaign supplement inventory maps eleven operations in every language", () => {
  const result = checkNativeSupplements(root, inventory());
  assert.equal(result.operations, 11);
  assert.ok(result.fields > 0);
  assert.equal(
    methodToken("OrganizationClient.Campaigns().GetFrequencyCap"),
    "GetFrequencyCap",
  );
  assert.equal(
    methodToken("Client::audienceSegments.previewRules"),
    "previewRules",
  );
});
test("supplement inventory drift and missing native evidence fail closed", () => {
  const cases = [
    [(v) => (v.supplements[0].commit = "f".repeat(40)), /commit drifted/],
    [
      (v) => (v.supplements[1].sources.platform = "0".repeat(64)),
      /hash drifted/,
    ],
    [
      (v) => (v.operations[0].path = "/platform/campaign-settings/missing"),
      /is not in/,
    ],
    [(v) => (v.operations[0].operationId = "renamed"), /operationId differs/],
    [(v) => delete v.operations[1].languages.rust, /must map every language/],
    [
      (v) => (v.operations[2].languages.go.status = "partial"),
      /must be covered/,
    ],
    [
      (v) => (v.operations[3].languages.php.testFile = "tests/missing.php"),
      /wire test does not exist/,
    ],
    [
      (v) => (v.operations[4].languages.python.testFile = "../../README.md"),
      /inside the package/,
    ],
    [
      (v) =>
        (v.operations[5].languages.dotnet.sdkMethod =
          "OrganizationClient.AudienceSegments.NeverCalledAsync"),
      /test does not call/,
    ],
    [
      (v) =>
        (v.operations[6].languages.go.sdkMethod =
          "OrganizationClient.AudienceSegments().Retrieve2"),
      /does not call|source lacks/,
    ],
    [(v) => (v.fields[0].contractName = "MissingSchema.field"), /is not in/],
    [(v) => (v.fields[1].native.rust = "NoSuchRustIdentifier"), /source lacks/],
    [(v) => (v.baselineLedger.operations = 638), /579|Expected values/],
  ];
  for (const [mutate, expected] of cases) {
    const value = inventory();
    mutate(value);
    assert.throws(() => checkNativeSupplements(root, value), expected);
  }
});
