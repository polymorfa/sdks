import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { format } from "prettier";
export const sourceCommit = "561c9ebcefdf05784870e8ad5a88652f721da82a";
export const sourcePath = "apps/api/docs/openapi.management.json";
export const scope = {
  "/platform/audience-profiles": ["get"],
  "/platform/audience-profiles/{phone}": ["get", "put", "delete"],
  "/platform/audience-profiles/{phone}/consent": ["get"],
  "/platform/audience-profile-imports": ["post"],
  "/platform/audience-profile-imports/{jobId}": ["get", "delete"],
};
function references(value, output = new Set()) {
  if (Array.isArray(value)) for (const item of value) references(item, output);
  else if (value && typeof value === "object") {
    if (typeof value.$ref === "string") output.add(value.$ref);
    for (const item of Object.values(value)) references(item, output);
  }
  return output;
}
export function extract(document) {
  const paths = {};
  for (const [path, methods] of Object.entries(scope)) {
    const original = document.paths?.[path];
    if (!original) throw new Error("Missing approved profile path: " + path);
    const selected = {};
    if (original.parameters)
      selected.parameters = structuredClone(original.parameters);
    for (const method of methods) {
      if (!original[method])
        throw new Error(
          "Missing approved profile operation: " + method + " " + path,
        );
      selected[method] = structuredClone(original[method]);
    }
    paths[path] = selected;
  }
  const components = {},
    seen = new Set(),
    pending = references(paths);
  while (pending.size) {
    const ref = [...pending].sort()[0];
    pending.delete(ref);
    if (seen.has(ref)) continue;
    if (!ref.startsWith("#/components/"))
      throw new Error("Nonlocal component reference: " + ref);
    const parts = ref
      .slice(2)
      .split("/")
      .map((p) => p.replaceAll("~1", "/").replaceAll("~0", "~"));
    if (parts.length !== 3)
      throw new Error("Unsupported component reference: " + ref);
    const value = document.components?.[parts[1]]?.[parts[2]];
    if (value === undefined)
      throw new Error("Unresolved component reference: " + ref);
    seen.add(ref);
    (components[parts[1]] ??= {})[parts[2]] = structuredClone(value);
    for (const child of references(value))
      if (!seen.has(child)) pending.add(child);
  }
  return { paths, components };
}
export function fromGit(repository) {
  const bytes = execFileSync("git", ["show", sourceCommit + ":" + sourcePath], {
    cwd: repository,
    maxBuffer: 32 * 1024 * 1024,
  });
  return {
    repository: "polymorfa/polymorfa",
    commit: sourceCommit,
    sourcePath,
    sourceSha256: createHash("sha256").update(bytes).digest("hex"),
    note: "Scoped source binding for audience profile list filters. API source is merged; SDK review, package publication and environment acceptance are separate. Global and other supplement pins are unchanged.",
    ...extract(JSON.parse(bytes)),
  };
}
if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(resolve(process.argv[1])).href
) {
  const args = process.argv.slice(2),
    index = args.indexOf("--api-repo"),
    repository = args[index + 1];
  if (index < 0 || !repository || repository.startsWith("--"))
    throw new Error("--api-repo requires the owning API checkout");
  const output = await format(JSON.stringify(fromGit(repository)), {
    parser: "json",
  });
  const target = resolve(
    import.meta.dirname,
    "../contracts/audience-profiles.json",
  );
  if (args.includes("--check")) {
    if (readFileSync(target, "utf8") !== output)
      throw new Error("Audience profile source binding drifted");
  } else writeFileSync(target, output);
  console.log(
    "audience profiles: 8 source operations, exact component closure",
  );
}
