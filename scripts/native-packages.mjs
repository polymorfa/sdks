// Loads the shared native package graph (scripts/native-packages.json).
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

export const nativePackages = JSON.parse(
  readFileSync(resolve(import.meta.dirname, "native-packages.json")),
);
export const rustCrates = nativePackages.rust;
export const dotnetPackages = nativePackages.dotnet;
