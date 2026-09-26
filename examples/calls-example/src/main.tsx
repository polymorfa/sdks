import { useEffect, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import { createBrowserCalls, type BrowserCalls } from "@polymorfa/browser";
import { CallSurface, DialPad, PolymorfaProvider } from "@polymorfa/react";
import "./style.css";

const apiBaseUrl = "https://api.polymorfastaging.com";

function App() {
  const [session, setSession] = useState("");
  const [token, setToken] = useState("");
  const [calls, setCalls] = useState<BrowserCalls | null>(null);
  const [status, setStatus] = useState("Disconnected");
  const [error, setError] = useState("");
  const [callError, setCallError] = useState("");
  const [requestFailure, setRequestFailure] = useState("");
  const callsRef = useRef<BrowserCalls | null>(null);
  const tokenRef = useRef("");

  useEffect(() => {
    const timer = window.setInterval(() => {
      if (callsRef.current) {
        setStatus(
          callsRef.current.connected
            ? "Ready for calls"
            : "Reconnecting to call events",
        );
      }
    }, 500);
    return () => {
      window.clearInterval(timer);
      void callsRef.current?.dispose();
      callsRef.current = null;
      tokenRef.current = "";
    };
  }, []);

  async function connect() {
    if (!session.trim() || !token.trim().startsWith("pmfa_ct_")) {
      setError(
        "Enter the connected Number's session and a pmfa_ct_ browser client token. Server keys cannot be used here.",
      );
      return;
    }
    setError("");
    setCallError("");
    setRequestFailure("");
    setStatus("Connecting to call events");
    await callsRef.current?.dispose();
    tokenRef.current = token.trim();
    setToken("");
    const next = createBrowserCalls({
      session: session.trim(),
      baseUrl: apiBaseUrl,
      getClientToken: async () => tokenRef.current,
      onError: ({ code, message }) => {
        if (callsRef.current === next) setError(`${code}: ${message}`);
      },
      onDiagnostic: (event) => {
        if (
          callsRef.current !== next ||
          !event.path.startsWith("/messaging/voip/")
        )
          return;
        if (event.type !== "request.failed") return;
        const action = event.path.split("/").at(-1) ?? "calls";
        setRequestFailure(
          `${event.method} ${action}: ${event.status ?? event.category}${event.requestId ? ` (request ${event.requestId})` : ""}`,
        );
      },
    });
    next.controller.subscribe(() => {
      if (callsRef.current !== next) return;
      const failure = next.controller.getSnapshot().error;
      setCallError(failure ? `${failure.code}: ${failure.message}` : "");
    });
    callsRef.current = next;
    setCalls(next);
    try {
      await next.connect();
      if (callsRef.current !== next) return;
      setStatus(
        next.connected ? "Ready for calls" : "Reconnecting to call events",
      );
    } catch (cause) {
      if (callsRef.current !== next) return;
      setStatus("Reconnecting to call events");
      setError(
        cause instanceof Error
          ? cause.message
          : "Could not connect to staging.",
      );
    }
  }

  async function disconnect() {
    const current = callsRef.current;
    callsRef.current = null;
    setCalls(null);
    tokenRef.current = "";
    await current?.dispose();
    setStatus("Disconnected");
    setError("");
    setCallError("");
    setRequestFailure("");
  }

  return (
    <PolymorfaProvider>
      <main>
        <header>
          <p className="eyebrow">Polymorfa SDK</p>
          <h1>Calls example</h1>
          <p>Browser calling on a connected staging Number.</p>
          <p className="api">API: {apiBaseUrl}</p>
        </header>
        <section aria-label="Connection" className="card">
          <label htmlFor="session">Session</label>
          <input
            id="session"
            value={session}
            onChange={(event) => setSession(event.target.value)}
            disabled={calls !== null}
            placeholder="support"
            autoComplete="off"
          />
          <label htmlFor="token">Browser client token</label>
          <input
            id="token"
            type="password"
            value={token}
            onChange={(event) => setToken(event.target.value)}
            disabled={calls !== null}
            placeholder="pmfa_ct_…"
            autoComplete="off"
          />
          <div className="actions">
            {calls ? (
              <button onClick={() => void disconnect()}>Disconnect</button>
            ) : (
              <button onClick={() => void connect()}>Connect</button>
            )}
            <span role="status" aria-live="polite">
              {status}
            </span>
          </div>
          {error && (
            <p className="error" role="alert">
              {error}
            </p>
          )}
        </section>
        {calls && (
          <section aria-label="Calls" className="card">
            <h2>Place a call</h2>
            <p>
              Enter an allowed E.164 destination (+ followed by country code and
              number), then press the green handset. Dialing is unavailable
              while an incoming or active call is shown.
            </p>
            {calls.connected ? (
              <DialPad controller={calls.controller} allowVideo={false} />
            ) : (
              <p>
                Call events are unavailable. Dialing will appear when the
                connection is ready.
              </p>
            )}
            {callError && (
              <p className="error" role="alert">
                {callError}
              </p>
            )}
            {requestFailure && (
              <p className="error" role="status">
                Last failed request: {requestFailure}
              </p>
            )}
            <CallSurface controller={calls.controller} />
          </section>
        )}
      </main>
    </PolymorfaProvider>
  );
}

createRoot(document.getElementById("root")!).render(<App />);
