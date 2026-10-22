import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import Ajv from "ajv";
import { format } from "prettier";
import addFormats from "ajv-formats";
import {
  apiVersion,
  languages,
  packages,
  recipes,
  sourceCommit,
} from "./recipes.mjs";
import * as typescript from "./typescript.mjs";
import { compareCoverage, extractOperations } from "../check-coverage.mjs";

export const root = resolve(import.meta.dirname, "../..");
export const sha256 = (value) =>
  createHash("sha256").update(value).digest("hex");
export const readJSON = (path) =>
  JSON.parse(readFileSync(resolve(root, path), "utf8"));
function git(args) {
  return execFileSync("git", args, { cwd: root, encoding: "utf8" }).trimEnd();
}
export function sourceDigest(commit, live = true) {
  // Bind all tracked package files and the original contracts. Tooling/docs-only
  // commits do not move sourceCommit, but new or changed package inputs must.
  const entries = git(["ls-tree", "-r", commit, "--", "packages", "contracts"])
    .split("\n")
    .map((line) => {
      const [meta, path] = line.split("\t");
      return { path, blob: meta.split(" ")[2] };
    })
    .filter(
      ({ path }) =>
        !path.startsWith("contracts/doc-snippets") &&
        (path.startsWith("packages/") || path.endsWith(".json")),
    );
  if (live) {
    const current = git([
      "ls-files",
      "--cached",
      "--others",
      "--exclude-standard",
      "--",
      "packages",
      "contracts",
    ])
      .split("\n")
      .filter(
        (p) =>
          !p.startsWith("contracts/doc-snippets") &&
          (p.startsWith("packages/") || p.endsWith(".json")),
      );
    if (
      JSON.stringify([...new Set(current)].sort()) !==
      JSON.stringify(entries.map((e) => e.path).sort())
    )
      throw new Error(
        "SDK source file inventory changed; rebind sourceCommit and verify all snippets",
      );
  }
  const rows = entries.map(({ path, blob }) => {
    if (live) {
      const bytes = readFileSync(resolve(root, path));
      const actual = createHash("sha1")
        .update(`blob ${bytes.length}\0`)
        .update(bytes)
        .digest("hex");
      if (actual !== blob)
        throw new Error(
          `Stale SDK sourceCommit: ${path} differs from ${commit}`,
        );
    }
    return `${path}\0${blob}\n`;
  });
  return sha256(rows.join(""));
}
export function validatePackageMetadata(metadata) {
  const file = (path) => readFileSync(resolve(root, path), "utf8");
  const match = (path, pattern) => {
    const value = file(path).match(pattern)?.[1];
    if (!value) throw new Error(`Missing package/version metadata in ${path}`);
    return value;
  };
  const ts = readJSON("packages/typescript/package.json");
  const php = readJSON("packages/php/composer.json");
  const actual = {
    typescript: { name: ts.name, version: ts.version },
    go: {
      name: match("packages/go/go.mod", /^module (.+)$/m),
      version: match("packages/go/transport.go", /const Version = "([^"]+)"/),
    },
    python: {
      name: match("packages/python/pyproject.toml", /^name = "([^"]+)"/m),
      version: match("packages/python/pyproject.toml", /^version = "([^"]+)"/m),
    },
    php: {
      name: php.name,
      version: match(
        "packages/php/src/HttpTransport.php",
        /const SDK_VERSION = '([^']+)'/,
      ),
    },
    dotnet: {
      name: match(
        "packages/dotnet/src/Polymorfa.Sdk/Polymorfa.Sdk.csproj",
        /<PackageId>([^<]+)<\/PackageId>/,
      ),
      version: match(
        "packages/dotnet/src/Polymorfa.Sdk/Polymorfa.Sdk.csproj",
        /<Version>([^<]+)<\/Version>/,
      ),
    },
    rust: {
      name: match("packages/rust/Cargo.toml", /^name = "([^"]+)"/m),
      version: match("packages/rust/Cargo.toml", /^version = "([^"]+)"/m),
    },
  };
  if (JSON.stringify(metadata) !== JSON.stringify(actual))
    throw new Error(
      "Stale package metadata: use the source manifests/constants",
    );
  for (const [path, pattern] of [
    ["packages/typescript/src/version.ts", /NATIVE_API_VERSION = "([^"]+)"/],
    ["packages/go/transport.go", /const APIVersion = "([^"]+)"/],
    ["packages/python/src/polymorfa/transport.py", /API_VERSION = "([^"]+)"/],
    ["packages/php/src/HttpTransport.php", /const API_VERSION = '([^']+)'/],
    [
      "packages/dotnet/src/Polymorfa.Sdk/Configuration.cs",
      /NativeApiVersion = "([^"]+)"/,
    ],
    ["packages/rust/src/lib.rs", /NATIVE_API_VERSION: &str = "([^"]+)"/],
  ])
    if (match(path, pattern) !== apiVersion)
      throw new Error(`Stale default API version: ${path}`);
}
export function inputs() {
  const source = readJSON("contracts/source.json");
  const specs = Object.fromEntries(
    Object.entries(source.contracts).map(([family, entry]) => {
      const bytes = readFileSync(resolve(root, entry.snapshotPath));
      if (sha256(bytes) !== entry.sha256)
        throw new Error(`Stale ${family} specification hash`);
      return [family, JSON.parse(bytes)];
    }),
  );
  const coverage = readJSON("contracts/coverage.json");
  if (coverage.sourceCommit !== source.commit)
    throw new Error("Stale API coverage sourceCommit");
  compareCoverage(
    Object.entries(specs).flatMap(([family, spec]) =>
      extractOperations(family, spec),
    ),
    coverage,
    true,
  );
  validatePackageMetadata(packages);
  return { source, specs, coverage };
}
function validator() {
  const ajv = new Ajv({ allErrors: true, strict: false });
  addFormats(ajv);
  return ajv;
}
function openapiSchema(value) {
  if (Array.isArray(value)) return value.map(openapiSchema);
  if (!value || typeof value !== "object") return value;
  const result = Object.fromEntries(
    Object.entries(value)
      .filter(([k]) => !["example", "xml", "discriminator"].includes(k))
      .map(([k, v]) => [k, openapiSchema(v)]),
  );
  if (result.nullable && result.type) result.type = [result.type, "null"];
  delete result.nullable;
  for (const side of ["Minimum", "Maximum"]) {
    const key = `exclusive${side}`,
      bound = side.toLowerCase();
    if (typeof result[key] === "boolean") {
      if (result[key]) {
        result[key] = result[bound];
        delete result[bound];
      } else delete result[key];
    }
  }
  // OpenAPI numeric/string format hints do not impose additional constraints.
  if (
    ["int32", "int64", "float", "double", "binary", "byte"].includes(
      result.format,
    )
  )
    delete result.format;
  return result;
}
export function synthetic(name) {
  if (name === "POLYMORFA_API_KEY") return `pmfa_${"A".repeat(72)}`;
  if (
    /Id$/.test(name) &&
    !["productId", "collectionId", "coverPhotoId", "sessionId"].includes(name)
  )
    return "00000000-0000-4000-8000-000000000042";
  return "42";
}
export function substitute(code) {
  return code.replace(/\{\{([A-Za-z_][A-Za-z0-9_]*)\}\}/g, (_, name) =>
    synthetic(name),
  );
}
export function validateRequest(id, recipe, spec, operation, pathItem) {
  const ajv = validator();
  const check = (schema, value, label) => {
    const validate = ajv.compile({
      ...openapiSchema(schema),
      components: openapiSchema(spec.components),
    });
    if (!validate(value))
      throw new Error(
        `${id} invalid ${label}: ${ajv.errorsText(validate.errors)}`,
      );
  };
  const params = [
    ...(pathItem.parameters || []),
    ...(operation.parameters || []),
  ];
  const query = recipe.request.query || {};
  for (const param of params) {
    if (param.in === "path")
      check(param.schema, synthetic(param.name), `path ${param.name}`);
    if (param.in === "query") {
      if (param.required && !(param.name in query))
        throw new Error(`${id} missing required query ${param.name}`);
      if (param.name in query)
        check(param.schema, query[param.name], `query ${param.name}`);
    }
    if (param.required && !["path", "query"].includes(param.in))
      throw new Error(
        `${id} needs an explicit ${param.in} recipe for ${param.name}`,
      );
  }
  for (const name of Object.keys(query))
    if (!params.some((p) => p.in === "query" && p.name === name))
      throw new Error(`${id} unknown query ${name}`);
  const schema = operation.requestBody?.content?.["application/json"]?.schema;
  if (schema) {
    if (!("body" in recipe.request)) {
      if (operation.requestBody.required)
        throw new Error(`${id} missing request body recipe`);
    } else check(schema, recipe.request.body, "body");
  } else if ("body" in recipe.request) throw new Error(`${id} unexpected body`);
}
export function validateCatalog(catalog, { checkSource = true } = {}) {
  const ajv = validator();
  const validate = ajv.compile(readJSON("contracts/doc-snippets.schema.json"));
  if (!validate(catalog))
    throw new Error(
      `Invalid snippet catalog: ${ajv.errorsText(validate.errors)}`,
    );
  const { source, specs, coverage } = inputs();
  if (
    catalog.sourceCommit !== sourceCommit ||
    catalog.apiVersion !== apiVersion ||
    catalog.apiSourceCommit !== source.commit
  )
    throw new Error("Stale source/API provenance");
  if (
    JSON.stringify(catalog.specs) !==
    JSON.stringify(
      Object.fromEntries(
        Object.entries(source.contracts).map(([f, e]) => [f, e.sha256]),
      ),
    )
  )
    throw new Error("Stale catalog spec hashes");
  if (
    checkSource &&
    catalog.sourceFilesSha256 !== sourceDigest(catalog.sourceCommit)
  )
    throw new Error("Stale SDK source digest");
  if (JSON.stringify(catalog.packages) !== JSON.stringify(packages))
    throw new Error("Stale package metadata");
  for (const [id, entry] of Object.entries(catalog.operations)) {
    const covered = coverage.operations.find((o) => o.operationId === id);
    if (!covered) throw new Error(`Uncovered operation ${id}`);
    if (
      entry.family !== covered.family ||
      entry.path !== covered.path ||
      entry.method !== covered.method
    )
      throw new Error(`${id} operation route drift`);
    const spec = specs[entry.family],
      pathItem = spec.paths[entry.path],
      operation = pathItem?.[entry.method.toLowerCase()];
    if (operation?.operationId !== id)
      throw new Error(`${id} stale OpenAPI operation`);
    validateRequest(id, entry, spec, operation, pathItem);
    const names = [...entry.path.matchAll(/\{([^{}]+)\}/g)].map((m) => m[1]);
    const expected = ["POLYMORFA_API_KEY", ...names].sort();
    for (const language of languages) {
      if (!entry[language]) continue;
      if (covered[language]?.status !== "covered")
        throw new Error(`${id}/${language} is not covered`);
      const code = entry[language].code;
      const actual = [...code.matchAll(/\{\{([A-Za-z_][A-Za-z0-9_]*)\}\}/g)]
        .map((m) => m[1])
        .sort();
      if (
        JSON.stringify(actual) !== JSON.stringify(expected) ||
        /\{\{/.test(substitute(code))
      )
        throw new Error(`${id}/${language} invalid placeholders`);
      if (
        /\bany\b|\bdynamic\b|@ts-ignore|type:\s*ignore|@phpstan-ignore|#\s*\[allow|\.raw\b|\.Raw\b/.test(
          code,
        )
      )
        throw new Error(`${id}/${language} forbidden unchecked snippet`);
    }
  }
  return catalog;
}
export async function generate() {
  const { source, coverage } = inputs();
  const renderers = { typescript };
  for (const language of languages.slice(1))
    renderers[language] = await import(`./${language}.mjs`);
  const operations = {};
  for (const id of Object.keys(recipes).sort()) {
    const recipe = recipes[id],
      entry = coverage.operations.find((o) => o.operationId === id);
    if (!entry) throw new Error(`Uncovered recipe ${id}`);
    const result = {
      family: entry.family,
      method: entry.method,
      path: entry.path,
      credentialKind: "organization_api_key",
      request: recipe.request,
    };
    for (const language of languages) {
      const code = renderers[language].render(id, recipe);
      if (code) result[language] = { code };
    }
    if (languages.some((l) => result[l])) operations[id] = result;
  }
  return validateCatalog(
    {
      schemaVersion: 1,
      sourceCommit,
      sourceFilesSha256: sourceDigest(sourceCommit),
      apiVersion,
      apiSourceCommit: source.commit,
      specs: Object.fromEntries(
        Object.entries(source.contracts).map(([f, e]) => [f, e.sha256]),
      ),
      releaseStatus: "source-only",
      packages,
      operations,
    },
    { checkSource: false },
  );
}
export const serialize = (catalog) =>
  format(JSON.stringify(catalog), { parser: "json" });
