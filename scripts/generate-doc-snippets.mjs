import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { generate, root, serialize } from "./doc-snippets/catalog.mjs";
const file = resolve(root, "contracts/doc-snippets.json");
const output = serialize(await generate());
if (process.argv.includes("--check")) {
  if (readFileSync(file, "utf8") !== output)
    throw new Error(
      "Documentation snippets drifted. Run npm run generate:doc-snippets and verify all emitted languages.",
    );
} else writeFileSync(file, output);
const catalog = JSON.parse(output);
for (const language of Object.keys(catalog.packages))
  console.log(
    `${language}: ${Object.values(catalog.operations).filter((o) => o[language]).length} snippets`,
  );
