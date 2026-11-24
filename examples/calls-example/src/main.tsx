import { useEffect, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import {
  CallConnectionPicker,
  CallSurface,
  DialPad,
  PolymorfaProvider,
} from "@polymorfa/ui-kit/react";
import {
  createCallingConnection,
  hasActiveCall,
  type CallingConnection,
} from "./connections.js";
import "./style.css";

const apiBaseUrl = "https://api.polymorfastaging.com";
interface Feedback {
  readonly error?: string;
  readonly requestFailure?: string;
}

function App() {
  const [connection, setConnection] = useState("");
  const [label, setLabel] = useState("");
  const [token, setToken] = useState("");
  const [connections, setConnections] = useState<readonly CallingConnection[]>(
    [],
  );
  const [selectedId, setSelectedId] = useState("");
  const [error, setError] = useState("");
  const [feedback, setFeedback] = useState<Record<string, Feedback>>({});
  const [, redraw] = useState(0);
  const connectionsRef = useRef<readonly CallingConnection[]>([]);
  const subscriptions = useRef(new Map<string, () => void>());

  useEffect(() => {
    const timer = window.setInterval(() => redraw((value) => value + 1), 500);
    return () => {
      window.clearInterval(timer);
      for (const stop of subscriptions.current.values()) stop();
      subscriptions.current.clear();
      for (const connection of connectionsRef.current)
        void connection.dispose();
      connectionsRef.current = [];
    };
  }, []);

  async function addConnection() {
    const id = connection.trim();
    if (connectionsRef.current.some((connection) => connection.id === id)) {
      setError(
        "This Connection is already connected. Disconnect it before replacing its token.",
      );
      return;
    }
    let configured: CallingConnection;
    const update = (next: Feedback) => {
      if (!connectionsRef.current.includes(configured)) return;
      setFeedback((previous) => ({
        ...previous,
        [id]: { ...previous[id], ...next },
      }));
    };
    try {
      configured = createCallingConnection(
        { connection: id, label, token, baseUrl: apiBaseUrl },
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
        cause instanceof Error ? cause.message : "Could not add Connection.",
      );
      return;
    }
    setError("");
    setToken("");
    setConnection("");
    setLabel("");
    const next = [...connectionsRef.current, configured];
    connectionsRef.current = next;
    setConnections(next);
    setSelectedId((current) => current || configured.id);
    subscriptions.current.set(
      configured.id,
      configured.calls.controller.subscribe(() => redraw((value) => value + 1)),
    );
    try {
      await configured.calls.connect();
    } catch (cause) {
      update({
        error:
          cause instanceof Error
            ? cause.message
            : "Could not connect to staging.",
      });
    }
  }

  async function disconnect(connection: CallingConnection) {
    if (hasActiveCall(connectionsRef.current)) return;
    subscriptions.current.get(connection.id)?.();
    subscriptions.current.delete(connection.id);
    const next = connectionsRef.current.filter((entry) => entry !== connection);
    connectionsRef.current = next;
    setConnections(next);
    setSelectedId((current) =>
      current === connection.id ? (next[0]?.id ?? "") : current,
    );
    setFeedback((current) => {
      const next = { ...current };
      delete next[connection.id];
      return next;
    });
    await connection.dispose();
  }

  const selected = connections.find(
    (connection) => connection.id === selectedId,
  );
  const busy = hasActiveCall(connections);
  return (
    <PolymorfaProvider>
      <main>
        <header>
          <p className="eyebrow">Polymorfa SDK</p>
          <h1>Calls example</h1>
          <p>Choose an authorized staging Connection for outgoing calls.</p>
          <p className="api">API: {apiBaseUrl}</p>
        </header>
        <section aria-label="Add authorized Connection" className="card">
          <form
            method="post"
            onSubmit={(event) => {
              event.preventDefault();
              void addConnection();
            }}
          >
            <label htmlFor="connection">Connection connection</label>
            <input
              id="connection"
              value={connection}
              onChange={(event) => setConnection(event.target.value)}
              placeholder="support"
              autoComplete="off"
              required
            />
            <label htmlFor="label">Connection label</label>
            <input
              id="label"
              value={label}
              onChange={(event) => setLabel(event.target.value)}
              placeholder="Support · +41…"
              autoComplete="off"
            />
            <label htmlFor="token">
              Browser client token for this Connection
            </label>
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
              <button type="submit">Connect Connection</button>
            </div>
          </form>
          {error && (
            <p className="error" role="alert">
              {error}
            </p>
          )}
        </section>
        {connections.length > 0 && (
          <section aria-label="Outgoing call" className="card">
            <CallConnectionPicker
              connections={connections.map((connection) => ({
                id: connection.id,
                label: connection.label,
                controller: connection.calls.controller,
              }))}
              value={selectedId}
              onChange={(id) => {
                if (!hasActiveCall(connectionsRef.current)) setSelectedId(id);
              }}
            />
            {selected !== undefined && (
              <>
                <h2>Call from {selected.label}</h2>
                {busy ? (
                  <p>
                    Finish the active call before choosing another Connection or
                    dialing.
                  </p>
                ) : selected.calls.connected ? (
                  <DialPad
                    key={selected.id}
                    controller={selected.calls.controller}
                    allowVideo={false}
                  />
                ) : (
                  <p>Waiting for this Connection's call connection.</p>
                )}
              </>
            )}
          </section>
        )}
        {connections.map((connection) => {
          const failure = connection.calls.controller.getSnapshot().error;
          return (
            <section
              key={connection.id}
              aria-label={`Calls on ${connection.label}`}
              className="card"
            >
              <h2>Calls on {connection.label}</h2>
              <p>Connection: {connection.id}</p>
              <div className="actions">
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => void disconnect(connection)}
                >
                  Disconnect Connection
                </button>
                <span role="status" aria-live="polite">
                  {connection.calls.connected
                    ? "Ready for calls"
                    : "Reconnecting to call events"}
                </span>
              </div>
              {feedback[connection.id]?.error && (
                <p className="error" role="alert">
                  {feedback[connection.id]!.error}
                </p>
              )}
              {failure && (
                <p className="error" role="alert">
                  {failure.code}: {failure.message}
                </p>
              )}
              {feedback[connection.id]?.requestFailure && (
                <p className="error" role="status">
                  Last failed request: {feedback[connection.id]!.requestFailure}
                </p>
              )}
              <CallSurface controller={connection.calls.controller} />
            </section>
          );
        })}
      </main>
    </PolymorfaProvider>
  );
}

createRoot(document.getElementById("root")!).render(<App />);
