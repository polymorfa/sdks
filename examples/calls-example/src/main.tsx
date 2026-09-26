import { useEffect, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import {
  CallNumberPicker,
  CallSurface,
  DialPad,
  PolymorfaProvider,
} from "@polymorfa/react";
import {
  createNumberConnection,
  hasActiveCall,
  type NumberConnection,
} from "./numbers.js";
import "./style.css";

const apiBaseUrl = "https://api.polymorfastaging.com";
interface Feedback {
  readonly error?: string;
  readonly requestFailure?: string;
}

function App() {
  const [session, setSession] = useState("");
  const [label, setLabel] = useState("");
  const [token, setToken] = useState("");
  const [numbers, setNumbers] = useState<readonly NumberConnection[]>([]);
  const [selectedId, setSelectedId] = useState("");
  const [error, setError] = useState("");
  const [feedback, setFeedback] = useState<Record<string, Feedback>>({});
  const [, redraw] = useState(0);
  const numbersRef = useRef<readonly NumberConnection[]>([]);
  const subscriptions = useRef(new Map<string, () => void>());

  useEffect(() => {
    const timer = window.setInterval(() => redraw((value) => value + 1), 500);
    return () => {
      window.clearInterval(timer);
      for (const stop of subscriptions.current.values()) stop();
      subscriptions.current.clear();
      for (const number of numbersRef.current) void number.dispose();
      numbersRef.current = [];
    };
  }, []);

  async function addNumber() {
    const id = session.trim();
    if (numbersRef.current.some((number) => number.id === id)) {
      setError(
        "This Number is already connected. Disconnect it before replacing its token.",
      );
      return;
    }
    let number: NumberConnection;
    const update = (next: Feedback) => {
      if (!numbersRef.current.includes(number)) return;
      setFeedback((previous) => ({
        ...previous,
        [id]: { ...previous[id], ...next },
      }));
    };
    try {
      number = createNumberConnection(
        { session: id, label, token, baseUrl: apiBaseUrl },
        {
          onError: ({ code, message }) =>
            update({ error: `${code}: ${message}` }),
          onDiagnostic: (event) => {
            if (
              event.type !== "request.failed" ||
              !event.path.startsWith("/messaging/voip/")
            )
              return;
            update({
              requestFailure: `${event.method} ${event.path.split("/").at(-1)}: ${event.status ?? event.category}${event.requestId ? ` (request ${event.requestId})` : ""}`,
            });
          },
        },
      );
    } catch (cause) {
      setError(
        cause instanceof Error ? cause.message : "Could not add Number.",
      );
      return;
    }
    setError("");
    setToken("");
    setSession("");
    setLabel("");
    const next = [...numbersRef.current, number];
    numbersRef.current = next;
    setNumbers(next);
    setSelectedId((current) => current || number.id);
    subscriptions.current.set(
      number.id,
      number.calls.controller.subscribe(() => redraw((value) => value + 1)),
    );
    try {
      await number.calls.connect();
    } catch (cause) {
      update({
        error:
          cause instanceof Error
            ? cause.message
            : "Could not connect to staging.",
      });
    }
  }

  async function disconnect(number: NumberConnection) {
    if (hasActiveCall(numbersRef.current)) return;
    subscriptions.current.get(number.id)?.();
    subscriptions.current.delete(number.id);
    const next = numbersRef.current.filter((entry) => entry !== number);
    numbersRef.current = next;
    setNumbers(next);
    setSelectedId((current) =>
      current === number.id ? (next[0]?.id ?? "") : current,
    );
    setFeedback((current) => {
      const next = { ...current };
      delete next[number.id];
      return next;
    });
    await number.dispose();
  }

  const selected = numbers.find((number) => number.id === selectedId);
  const busy = hasActiveCall(numbers);
  return (
    <PolymorfaProvider>
      <main>
        <header>
          <p className="eyebrow">Polymorfa SDK</p>
          <h1>Calls example</h1>
          <p>Choose an authorized staging Number for outgoing calls.</p>
          <p className="api">API: {apiBaseUrl}</p>
        </header>
        <section aria-label="Add authorized Number" className="card">
          <form
            method="post"
            onSubmit={(event) => {
              event.preventDefault();
              void addNumber();
            }}
          >
            <label htmlFor="session">Number session</label>
            <input
              id="session"
              value={session}
              onChange={(event) => setSession(event.target.value)}
              placeholder="support"
              autoComplete="off"
              required
            />
            <label htmlFor="label">Number label</label>
            <input
              id="label"
              value={label}
              onChange={(event) => setLabel(event.target.value)}
              placeholder="Support · +41…"
              autoComplete="off"
            />
            <label htmlFor="token">Browser client token for this Number</label>
            <input
              id="token"
              type="password"
              value={token}
              onChange={(event) => setToken(event.target.value)}
              placeholder="pmfa_ct_…"
              autoComplete="off"
              required
            />
            <div className="actions">
              <button type="submit">Connect Number</button>
            </div>
          </form>
          {error && (
            <p className="error" role="alert">
              {error}
            </p>
          )}
        </section>
        {numbers.length > 0 && (
          <section aria-label="Outgoing call" className="card">
            <CallNumberPicker
              numbers={numbers.map((number) => ({
                id: number.id,
                label: number.label,
                controller: number.calls.controller,
              }))}
              value={selectedId}
              onChange={(id) => {
                if (!hasActiveCall(numbersRef.current)) setSelectedId(id);
              }}
            />
            {selected !== undefined && (
              <>
                <h2>Call from {selected.label}</h2>
                {busy ? (
                  <p>
                    Finish the active call before choosing another Number or
                    dialing.
                  </p>
                ) : selected.calls.connected ? (
                  <DialPad
                    key={selected.id}
                    controller={selected.calls.controller}
                    allowVideo={false}
                  />
                ) : (
                  <p>Waiting for this Number's call connection.</p>
                )}
              </>
            )}
          </section>
        )}
        {numbers.map((number) => {
          const failure = number.calls.controller.getSnapshot().error;
          return (
            <section
              key={number.id}
              aria-label={`Calls on ${number.label}`}
              className="card"
            >
              <h2>Calls on {number.label}</h2>
              <p>Session: {number.id}</p>
              <div className="actions">
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => void disconnect(number)}
                >
                  Disconnect Number
                </button>
                <span role="status" aria-live="polite">
                  {number.calls.connected
                    ? "Ready for calls"
                    : "Reconnecting to call events"}
                </span>
              </div>
              {feedback[number.id]?.error && (
                <p className="error" role="alert">
                  {feedback[number.id]!.error}
                </p>
              )}
              {failure && (
                <p className="error" role="alert">
                  {failure.code}: {failure.message}
                </p>
              )}
              {feedback[number.id]?.requestFailure && (
                <p className="error" role="status">
                  Last failed request: {feedback[number.id]!.requestFailure}
                </p>
              )}
              <CallSurface controller={number.calls.controller} />
            </section>
          );
        })}
      </main>
    </PolymorfaProvider>
  );
}

createRoot(document.getElementById("root")!).render(<App />);
