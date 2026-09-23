import { describe, expect, it, vi } from "vitest";
import { HttpCallsApi, parseSocketTicket } from "../src/api.js";

const ticket = {
  ticket: "pmfa_wst_abc",
  expiresAt: 1_790_000_000_000,
  url: "/voip/ws?ticket=pmfa_wst_abc",
};

describe("lifecycle socket ticket", () => {
  it("mints with the named session for a server credential", async () => {
    const fetch = vi.fn<
      (input: string, init: RequestInit) => Promise<Response>
    >(async () => Response.json({ data: ticket }));
    const api = new HttpCallsApi({ token: "pmfa_live_server", fetch });
    await expect(api.socketTicket("support")).resolves.toEqual(ticket);
    expect(fetch).toHaveBeenCalledWith(
      "https://api.polymorfa.com/messaging/voip/ws-ticket",
      expect.objectContaining({
        method: "POST",
        body: '{"session":"support"}',
      }),
    );
    expect(
      new Headers(fetch.mock.calls[0]![1].headers).get("authorization"),
    ).toBe("Bearer pmfa_live_server");
  });

  it("omits the session for a session-bound client token", async () => {
    const fetch = vi.fn<
      (input: string, init: RequestInit) => Promise<Response>
    >(async () => Response.json({ data: ticket }));
    const api = new HttpCallsApi({ token: "pmfa_ct_browser", fetch });
    await api.socketTicket("wrong-session");
    expect(fetch.mock.calls[0]![1].body).toBe("{}");
  });

  it("rejects a ticket URL that would not present the issued ticket", () => {
    expect(() =>
      parseSocketTicket({ ...ticket, url: "/voip/ws?ticket=other" }),
    ).toThrow(/socket ticket/);
    expect(() =>
      parseSocketTicket({
        ...ticket,
        url: "https://other.example/voip/ws?ticket=pmfa_wst_abc",
      }),
    ).toThrow(/socket ticket/);
  });

  it("preserves a ticket issuance authorization failure", async () => {
    const api = new HttpCallsApi({
      token: "pmfa_ct_browser",
      fetch: async () =>
        Response.json(
          { error: { code: "permission_denied", message: "Not allowed" } },
          { status: 403 },
        ),
    });
    await expect(api.socketTicket()).rejects.toMatchObject({
      status: 403,
      code: "permission_denied",
    });
  });
});
