export async function prove(sdk, lib, fixture, history) {
  const check = (v, m) => {
    if (!v) throw Error(m);
  };
  let outcomes = 0;
  const event = (p, id = "descriptor-event") => ({
    id,
    session: "descriptor-session",
    event: "history.sync",
    timestamp: "2026-10-17T00:00:00Z",
    payload: p,
  });
  const signed = async (p) => {
    const e = event(p);
    const f = await sdk.webhooks.createFixture({
      event: e,
      secret: "synthetic-secret",
    });
    return sdk.webhooks.verify({
      body: f.body,
      signature: f.signature,
      secret: "synthetic-secret",
    });
  };
  const snapshot = (a) =>
    JSON.stringify(lib.ENTITY_NAMES.flatMap((n) => a.rows(n)));
  const test = async (p, options, fail, content = false) => {
    const a = lib.memoryAdapter(),
      s = lib.createStorage(a),
      e = await signed(p);
    let err;
    try {
      await lib.storageWebhookHandler(s, options)(e);
    } catch (x) {
      err = x;
    }
    check(Boolean(err) === fail, "wrong failure outcome");
    check((await s.hasEvent(e.session, e.id)) === !fail, "marker");
    check(
      fail
        ? a.rows("history_progress").length === 0
        : a.rows("history_progress").length >= 1,
      "progress",
    );
    check(a.rows("messages").length === (content ? 1 : 0), "content");
    check(
      (await s.getCheckpoint("*", "events")) === null,
      "webhook checkpoint",
    );
    if (fail) check(snapshot(a) === "[]", "failure persisted rows");
    for (const secret of [
      fixture.inline.inline.data,
      fixture.media.media.mediaKey,
      fixture.media.media.fileSha256,
    ]) {
      check(!snapshot(a).includes(secret), "stored descriptor secret");
      check(!String(err).includes(secret), "error descriptor secret");
    }
    outcomes++;
    return { a, s, e };
  };
  for (const p of [fixture.inline, fixture.media]) {
    await test(p, {}, true);
    let calls = 0;
    await test(
      p,
      {
        decodeHistory: async () => {
          calls++;
          return null;
        },
      },
      true,
    );
    check(calls === 0, "archive called for descriptor");
    await test(p, { historyDescriptorMode: "metadata-only" }, false);
    await test(
      p,
      {
        historyDescriptorMode: "metadata-only",
        decodeHistoryDescriptor: async () => {
          throw Error("must skip");
        },
      },
      false,
    );
    for (const result of [
      null,
      undefined,
      17,
      "bad",
      [],
      { conversations: "bad" },
      { conversations: [null] },
    ])
      await test(p, { decodeHistoryDescriptor: async () => result }, true);
    await test(
      p,
      {
        decodeHistoryDescriptor: async () => {
          throw Error(fixture.media.media.mediaKey);
        },
      },
      true,
    );
    await test(p, { decodeHistoryDescriptor: async () => ({}) }, false);
    const { a, s, e } = await test(
      p,
      {
        decodeHistoryDescriptor: async (d, original) => {
          check(d === original.payload, "descriptor callback args");
          return fixture.chunk;
        },
      },
      false,
      true,
    );
    const row = a.rows("messages")[0];
    check(JSON.stringify(row).includes("wa:"), "native fallback");
    check(
      !JSON.stringify(row).includes("synthetic-notification"),
      "notification identity mapping",
    );
    const before = snapshot(a);
    check(
      (await lib.applyEvent(s, e)).applied === false,
      "duplicate requires decoder",
    );
    check(snapshot(a) === before, "duplicate changed rows");
    const metadata = await test(
      p,
      { historyDescriptorMode: "metadata-only" },
      false,
    );
    check(
      (
        await lib.applyEvent(metadata.s, metadata.e, {
          decodeHistoryDescriptor: async () => {
            throw Error("duplicate callback");
          },
        })
      ).applied === false,
      "metadata replay invokes decoder",
    );
  }
  const invalid = [
    { delivery: null },
    { delivery: "archive" },
    { media: fixture.media.media },
    { inline: null },
    { whatsapp_ids: {} },
    { whatsapp_ids: { linked_devices: null } },
    { whatsapp_ids: { linked_devices: "x", bad: "y" } },
    { fileLength: null },
    { fileLength: -1 },
    { fileLength: 1.5 },
    { syncType: "" },
    { progress: 101 },
    { progress: null },
    { chunkOrder: -1 },
    { oldestMessageAt: "2026-02-30T00:00:00Z" },
    { peerDataRequestSessionId: null },
    { original_whatsapp_ids: {} },
    { whatsapp_id: "" },
  ];
  for (const patch of invalid)
    await test(
      { ...fixture.inline, ...patch },
      { historyDescriptorMode: "metadata-only" },
      true,
    );
  await test(
    { ...fixture.media, media: { ...fixture.media.media, type: "image" } },
    { historyDescriptorMode: "metadata-only" },
    true,
  );
  await test(fixture.inline, { historyDescriptorMode: "invalid" }, true);
  await test(
    { ...fixture.inline, unprojected: "synthetic" },
    { historyDescriptorMode: "metadata-only" },
    true,
  );
  await test(
    {
      ...fixture.inline,
      inline: { ...fixture.inline.inline, unprojected: "synthetic" },
    },
    { historyDescriptorMode: "metadata-only" },
    true,
  );
  await test(
    {
      ...fixture.media,
      media: { ...fixture.media.media, unprojected: "synthetic" },
    },
    { historyDescriptorMode: "metadata-only" },
    true,
  );
  for (const field of [
    "whatsapp_ids",
    "original_whatsapp_ids",
    "whatsapp_id",
    "original_whatsapp_id",
  ])
    for (const units of [512, 514]) {
      const id = "😀".repeat(units / 2);
      await test(
        {
          ...fixture.inline,
          [field]: field.endsWith("_ids") ? { linked_devices: id } : id,
        },
        { historyDescriptorMode: "metadata-only" },
        units > 512,
      );
    }
  for (const [value, valid] of [
    ["0000-02-29T00:00Z", true],
    ["2026-10-17T00:00Z", true],
    ["2026-10-17T00:00:00+00:00", false],
    ["2025-02-29T00:00Z", false],
    ["2026-10-17T00:00:00.123Z", true],
  ])
    await test(
      { ...fixture.inline, oldestMessageAt: value },
      { historyDescriptorMode: "metadata-only" },
      !valid,
    );
  const future = lib.createStorage(lib.memoryAdapter());
  await lib.applyEvent(future, {
    ...event({ delivery: "future", unprojected: "synthetic" }),
    event: "future.experimental",
  });
  check(
    await future.hasEvent("descriptor-session", "descriptor-event"),
    "unknown event compatibility",
  );
  outcomes++;
  const valid = await test(
    fixture.inline,
    { historyDescriptorMode: "metadata-only" },
    false,
  );
  const malformed = {
    ...valid.e,
    payload: { ...valid.e.payload, fileLength: null },
  };
  let refused = false;
  try {
    await lib.applyEvent(valid.s, malformed, {
      historyDescriptorMode: "metadata-only",
    });
  } catch {
    refused = true;
  }
  check(refused, "malformed duplicate bypasses validation");
  const archive = { ...fixture.inline };
  delete archive.delivery;
  delete archive.inline;
  archive.messages = [];
  archive.whatsapp = {
    encoding: "gzip-base64-protobuf",
    data: "synthetic-archive",
  };
  for (const [opts, content] of [
    [{}, false],
    [
      {
        decodeHistory: async (p, e) => {
          check(p === e.payload, "archive args changed");
          return null;
        },
      },
      false,
    ],
    [{ decodeHistory: async () => fixture.chunk }, true],
  ])
    await test(archive, opts, false, content);
  await test(
    archive,
    {
      decodeHistory: async () => {
        throw Error("archive error");
      },
    },
    true,
  );
  const cloud = lib.createStorage(lib.memoryAdapter());
  await lib.applyEvent(cloud, event({ kind: "history", value: {} }), {
    decodeHistory: async () => {
      throw Error("cloud archive");
    },
    decodeHistoryDescriptor: async () => {
      throw Error("cloud descriptor");
    },
  });
  outcomes++;
  if (history) {
    await test(
      fixture.inline,
      {
        decodeHistoryDescriptor: async (p) => {
          const decoded = await history.downloadHistoryChunk(
            { inlinePayload: p.inline.data },
            {
              fetch: async () => {
                throw Error("unexpected download");
              },
            },
          );
          // Application projection explicitly selects the storage subset from the full schema.
          return {
            syncType: decoded.syncType,
            chunkOrder: decoded.chunkOrder,
            progress: decoded.progress,
            conversations: decoded.conversations.map((c) => ({
              id: c.id,
              messages: c.messages.map((m) => ({
                message: {
                  key: m.message.key,
                  message: { conversation: m.message.message.conversation },
                  messageTimestamp: m.message.messageTimestamp,
                },
              })),
            })),
          };
        },
      },
      false,
      true,
    );
  }
  return {
    outcomes,
    portable: true,
    publication: false,
    registryAcceptance: false,
  };
}
