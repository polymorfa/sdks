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
