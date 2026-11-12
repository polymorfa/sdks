import { existsSync } from "node:fs";
import { homedir } from "node:os";
import { resolve } from "node:path";

/** Use the shared Mac cache even when the caller's PATH names toolchain Cargo. */
export function nativeCargoCommand({
  platform = process.platform,
  home = homedir(),
  exists = existsSync,
} = {}) {
  if (platform !== "darwin") return "cargo";
  const shim = resolve(home, "Library/Application Support/mbx/bin/cargo");
  if (!exists(shim)) {
    throw new Error(
      "Rust verification on macOS requires MrBoxington's active Cargo shim.",
    );
  }
  return shim;
}

/** MrBoxington owns Mac target/cache placement; other CI platforms keep staging. */
export function nativeCargoTargetArgs(target, platform = process.platform) {
  return platform === "darwin" ? [] : ["--target-dir", target];
}
