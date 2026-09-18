import { describe, expect, it } from "vitest";

import { CallsTokenSource } from "../src/token.js";

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}

describe("CallsTokenSource", () => {
  it("shares one provider call between concurrent requests", async () => {
    const calls: boolean[] = [];
    const source = new CallsTokenSource(async ({ refresh }) => {
      calls.push(refresh === true);
      return "pmfa_ct_one";
    });
    const [a, b] = await Promise.all([source.get(), source.get()]);
    expect(a.value).toBe("pmfa_ct_one");
    expect(b.value).toBe("pmfa_ct_one");
    expect(calls).toEqual([false]);
  });

  it("does not answer a refresh with a provider call that was not refreshing", async () => {
    const stale = deferred<string>();
    const calls: boolean[] = [];
    const source = new CallsTokenSource(async ({ refresh }) => {
      calls.push(refresh === true);
      return refresh ? "pmfa_ct_fresh" : stale.promise;
    });
    const plain = source.get();
    const refreshed = await source.get({ refresh: true });
    expect(refreshed.value).toBe("pmfa_ct_fresh");
    expect(calls).toEqual([false, true]);

    // The older call finishing later does not replace the refreshed token.
    stale.resolve("pmfa_ct_refused");
    expect((await plain).value).toBe("pmfa_ct_refused");
    expect((await source.get()).value).toBe("pmfa_ct_fresh");
  });

  it("does not let a call pending across invalidate() answer or repopulate later requests", async () => {
    const stale = deferred<string>();
    let calls = 0;
    const source = new CallsTokenSource(async () => {
      calls += 1;
      return calls === 1 ? stale.promise : "pmfa_ct_fresh";
    });
    const before = source.get();
    source.invalidate(); // e.g. a 401 on a REST call
    const after = source.get();
    expect(calls).toBe(2);
    stale.resolve("pmfa_ct_refused");
    expect((await before).value).toBe("pmfa_ct_refused");
    expect((await after).value).toBe("pmfa_ct_fresh");
    expect((await source.get()).value).toBe("pmfa_ct_fresh");
    expect(calls).toBe(2);
  });

  it("keeps one caller's cancellation from failing another caller's shared fetch", async () => {
    const pending = deferred<string>();
    const signals: (AbortSignal | undefined)[] = [];
    const source = new CallsTokenSource(async ({ signal }) => {
      signals.push(signal);
      // A provider that honours its signal, as documented.
      return await new Promise<string>((resolve, reject) => {
        signal?.addEventListener("abort", () => reject(signal.reason));
        void pending.promise.then(resolve);
      });
    });
    const first = new AbortController();
    const cancelled = source.get({ signal: first.signal });
    const kept = source.get({ signal: new AbortController().signal });
    const unsignalled = source.get();
    expect(signals).toHaveLength(1);
    first.abort(new Error("placement cancelled"));
    await expect(cancelled).rejects.toThrow("placement cancelled");
    // The shared provider call is still running for the other callers.
    expect(signals[0]?.aborted).toBe(false);
    pending.resolve("pmfa_ct_shared");
    expect((await kept).value).toBe("pmfa_ct_shared");
    expect((await unsignalled).value).toBe("pmfa_ct_shared");
  });

  it("cancels the shared provider call once every caller has cancelled", async () => {
    const signals: AbortSignal[] = [];
    const source = new CallsTokenSource(
      ({ signal }) =>
        new Promise<string>((_resolve, reject) => {
          signals.push(signal!);
          signal!.addEventListener("abort", () => reject(signal!.reason));
        }),
    );
    const a = new AbortController();
    const b = new AbortController();
    const first = source.get({ signal: a.signal });
    const second = source.get({ signal: b.signal });
    a.abort(new Error("a"));
    await expect(first).rejects.toThrow("a");
    expect(signals[0]?.aborted).toBe(false);
    b.abort(new Error("b"));
    await expect(second).rejects.toThrow("b");
    expect(signals[0]?.aborted).toBe(true);
    // A later request starts a fresh provider call.
    void source.get().catch(() => undefined);
    expect(signals).toHaveLength(2);
  });

  it("lets a plain request share an in-flight refresh", async () => {
    const calls: boolean[] = [];
    const source = new CallsTokenSource(async ({ refresh }) => {
      calls.push(refresh === true);
      return "pmfa_ct_fresh";
    });
    const [refreshed, plain] = await Promise.all([
      source.get({ refresh: true }),
      source.get(),
    ]);
    expect(refreshed.value).toBe("pmfa_ct_fresh");
    expect(plain.value).toBe("pmfa_ct_fresh");
    expect(calls).toEqual([true]);
  });
});
