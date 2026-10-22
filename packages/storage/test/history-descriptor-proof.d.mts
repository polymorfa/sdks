export function prove(
  sdk: typeof import("@polymorfa/sdk"),
  storage: typeof import("../src/index.js"),
  fixture: unknown,
  history?: typeof import("../../typescript/src/history/index.js"),
): Promise<{
  outcomes: number;
  portable: boolean;
  publication: boolean;
  registryAcceptance: boolean;
}>;
