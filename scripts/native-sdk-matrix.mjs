import { existsSync } from "node:fs";

const versions = {
  go: ["1.24.x", "1.25.x"],
  python: ["3.10", "3.13"],
  php: ["8.2", "8.4"],
  dotnet: ["8.0.x", "10.0.x"],
  rust: ["1.85.0", "stable"],
};
const manifests = {
  go: "go.mod",
  python: "pyproject.toml",
  php: "composer.json",
  dotnet: "src/Polymorfa.Sdk/Polymorfa.Sdk.csproj",
  rust: "Cargo.toml",
};
const include = Object.entries(versions).flatMap(([language, runtimes]) =>
  existsSync(`packages/${language}/${manifests[language]}`)
    ? runtimes.map((runtime) => ({ language, runtime }))
    : [],
);
process.stdout.write(`matrix=${JSON.stringify({ include })}\n`);
process.stdout.write(`enabled=${include.length > 0}\n`);
