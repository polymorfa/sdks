import { createServer } from "node:http";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { isDeepStrictEqual } from "node:util";

// Fixtures are evidence written by hand from the pinned TypeScript tests.
// This server does not read OpenAPI or generate a client.
export function createFixtureServer(fixtures, options = {}) {
  const scenarios = new Map(
    fixtures.scenarios.map((scenario) => [scenario.id, scenario]),
  );
  const states = new Map();
  return createServer(async (request, response) => {
    const url = new URL(request.url, "http://127.0.0.1");
    const prefixed = /^\/__fixtures\/([^/]+)(\/.*)?$/.exec(url.pathname);
    const selected =
      request.headers["x-polymorfa-fixture"] ?? options.scenarioId;
    const match =
      prefixed ??
      (typeof selected === "string"
        ? [url.pathname, selected, url.pathname]
        : null);
    if (!match || !scenarios.has(match[1])) {
      response.writeHead(404).end("Unknown fixture scenario");
      return;
    }
    const id = match[1];
    const path = match[2] ?? "/";
    if (path === "/reset" && request.method === "POST") {
      states.delete(id);
      response.writeHead(204).end();
      return;
    }
    const state = states.get(id) ?? { attempts: 0, mismatches: [] };
    states.set(id, state);
    if (path === "/state" && request.method === "GET") {
      response
        .writeHead(200, { "content-type": "application/json" })
        .end(JSON.stringify(state));
      return;
    }
    const scenario = scenarios.get(id);
    const expected = scenario.request;
    const chunks = [];
    let size = 0;
    for await (const chunk of request) {
      size += chunk.length;
      if (size > 1024 * 1024) {
        response.writeHead(413).end();
        return;
      }
      chunks.push(chunk);
    }
    const raw = Buffer.concat(chunks).toString("utf8");
    const mismatches = [];
    if (request.method !== expected.method) mismatches.push("method");
    if (path !== expected.path) mismatches.push("path");
    for (const [name, value] of Object.entries(expected.headers ?? {})) {
      // Store only the header name on a failure, never credential values.
      if (request.headers[name.toLowerCase()] !== value)
        mismatches.push(`header:${name}`);
    }
    for (const name of expected.absentHeaders ?? []) {
      if (request.headers[name.toLowerCase()] !== undefined)
        mismatches.push(`unexpected-header:${name}`);
    }
    if (expected.query !== undefined) {
      const actual = Object.fromEntries(
        [...new Set(url.searchParams.keys())].map((name) => {
          const values = url.searchParams.getAll(name);
          return [name, values.length === 1 ? values[0] : values];
        }),
      );
      if (!isDeepStrictEqual(actual, expected.query)) mismatches.push("query");
    }
    if (Object.hasOwn(expected, "body")) {
      let actual;
      try {
        actual = JSON.parse(raw);
      } catch {
        actual = raw;
      }
      if (!isDeepStrictEqual(actual, expected.body)) mismatches.push("body");
    } else if (raw.length > 0) mismatches.push("unexpected-body");
    state.attempts += 1;
    state.mismatches.push(...mismatches);
    if (mismatches.length > 0) {
      response.writeHead(422, { "content-type": "application/json" }).end(
        JSON.stringify({
          error: {
            code: "fixture_mismatch",
            message: mismatches.join(", "),
            request_id: "fixture-mismatch",
          },
        }),
      );
      return;
    }
    const result =
      scenario.responses[
        Math.min(state.attempts - 1, scenario.responses.length - 1)
      ];
    if (result.disconnect) {
      request.socket.destroy();
      return;
    }
    if (result.delayMs)
      await new Promise((done) => setTimeout(done, result.delayMs));
    if (response.destroyed) return;
    const body = result.rawBody ??
      (Object.hasOwn(result, "body") ? JSON.stringify(result.body) : undefined);
    const headers = { ...result.headers };
    if (result.disconnectAfterBytes !== undefined)
      headers["content-length"] = Buffer.byteLength(body ?? "").toString();
    response.writeHead(result.status, headers);
    if (result.bodyDelayMs || result.disconnectAfterBytes !== undefined)
      response.flushHeaders();
    if (result.bodyDelayMs)
      await new Promise((done) => setTimeout(done, result.bodyDelayMs));
    if (response.destroyed) return;
    if (result.disconnectAfterBytes !== undefined) {
      response.write(Buffer.from(body ?? "").subarray(0, result.disconnectAfterBytes));
      await new Promise((done) => setTimeout(done, 10));
      response.destroy();
      return;
    }
    response.end(body);
  });
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(resolve(process.argv[1])).href
) {
  const portIndex = process.argv.indexOf("--port");
  const port = portIndex < 0 ? 0 : Number(process.argv[portIndex + 1]);
  if (!Number.isInteger(port) || port < 0 || port > 65535)
    throw new Error("Invalid fixture port");
  const fixtures = JSON.parse(
    readFileSync(
      new URL("../contracts/fixtures/behavior.json", import.meta.url),
    ),
  );
  const scenarioIndex = process.argv.indexOf("--scenario");
  const scenarioId =
    scenarioIndex < 0 ? undefined : process.argv[scenarioIndex + 1];
  if (
    scenarioId !== undefined &&
    !fixtures.scenarios.some((scenario) => scenario.id === scenarioId)
  )
    throw new Error("Unknown fixture scenario");
  const server = createFixtureServer(fixtures, { scenarioId });
  server.listen(port, "127.0.0.1", () =>
    process.stdout.write(
      `${JSON.stringify({ url: `http://127.0.0.1:${server.address().port}` })}\n`,
    ),
  );
  process.on("SIGTERM", () => server.close());
  process.on("SIGINT", () => server.close());
}
