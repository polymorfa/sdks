import { test } from "node:test";
import assert from "node:assert/strict";
import { once } from "node:events";
import { createFixtureServer } from "./sdk-fixture-server.mjs";

test("wire assertions reject altered bodies and record only mismatch names", async () => {
  const server = createFixtureServer({
    scenarios: [
      {
        id: "wire",
        request: {
          method: "POST",
          path: "/messaging/send",
          headers: { authorization: "Bearer synthetic" },
          body: { text: "expected" },
        },
        responses: [
          {
            status: 200,
            headers: { "content-type": "application/json" },
            body: { data: { id: "message" } },
          },
        ],
      },
    ],
  });
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  try {
    const base = `http://127.0.0.1:${server.address().port}/__fixtures/wire`;
    const send = (text) =>
      fetch(`${base}/messaging/send`, {
        method: "POST",
        headers: {
          authorization: "Bearer synthetic",
          "content-type": "application/json",
        },
        body: JSON.stringify({ text }),
      });
    assert.equal((await send("changed")).status, 422);
    assert.deepEqual(await (await fetch(`${base}/state`)).json(), {
      attempts: 1,
      mismatches: ["body"],
    });
    assert.equal(
      (await fetch(`${base}/reset`, { method: "POST" })).status,
      204,
    );
    const result = await send("expected");
    assert.deepEqual(await result.json(), { data: { id: "message" } });
    assert.deepEqual(await (await fetch(`${base}/state`)).json(), {
      attempts: 1,
      mismatches: [],
    });
  } finally {
    server.closeAllConnections();
    await new Promise((done) => server.close(done));
  }
});
