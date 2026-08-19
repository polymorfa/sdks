#!/usr/bin/env node

import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const retiredName = Buffer.from([116, 105, 116, 97, 110]).toString("utf8");

try {
  const root = parseRoot(process.argv.slice(2));
  const output = execFileSync(
    "git",
    [
      "-C",
      root,
      "ls-files",
      "-z",
      "--cached",
      "--others",
      "--exclude-standard",
    ],
    { encoding: "utf8" },
  );
  const matches = [];
  for (const path of output.split("\0").filter(Boolean)) {
    const contents = readFileSync(resolve(root, path));
    if (contents.includes(0)) continue;
    if (contents.toString("utf8").toLowerCase().includes(retiredName))
      matches.push(path);
  }
  if (matches.length > 0) {
    throw new Error(
      `Retired product name found in tracked content:\n${matches.map((path) => `- ${path}`).join("\n")}`,
    );
  }
} catch (error) {
  process.stderr.write(
    `${error instanceof Error ? error.message : String(error)}\n`,
  );
  process.exitCode = 1;
}

function parseRoot(args) {
  if (args.length === 0) return process.cwd();
  if (args.length === 2 && args[0] === "--root" && args[1])
    return resolve(args[1]);
  throw new Error("Usage: check-retired-name [--root <repository>]");
}
