import type { CallsController } from "../browser/index.js";
import { useCallback, useId, useSyncExternalStore } from "react";
import { usePolymorfa } from "./context.js";
import { safeSubscribe } from "./hooks.js";

/** A Connection authorized by the application, with its own fixed Calls client. */
export interface CallConnectionOption {
  readonly id: string;
  readonly label: string;
  readonly controller: CallsController;
}
export interface CallConnectionPickerProps {
  readonly connections: readonly CallConnectionOption[];
  readonly value: string;
  /** Select the existing Connection client; never replace its token or connection. */
  readonly onChange: (id: string) => void;
  readonly disabled?: boolean;
  readonly className?: string;
}

function busy(connections: readonly CallConnectionOption[]): boolean {
  return connections.some(({ controller }) => {
    const state = controller.getSnapshot();
    return (
      state.placing === true ||
      state.answering === true ||
      [
        "ringing",
        "accepted",
        "connecting",
        "connected",
        "reconnecting",
      ].includes(state.status)
    );
  });
}

/**
 * Choose an outgoing Connection from application-authorized clients. Locks while
 * any supplied client places, answers, or carries a call. It does not connect,
 * disconnect, discover Connections, mint credentials, or retarget an existing call.
 */
export function CallConnectionPicker({
  connections,
  value,
  onChange,
  disabled,
  className,
}: CallConnectionPickerProps) {
  const { locale } = usePolymorfa();
  const id = useId();
  const subscribe = useCallback(
    (listener: () => void) => {
      const stop = connections.map(({ controller }) =>
        safeSubscribe(controller)(listener),
      );
      return () => {
        for (const unsubscribe of stop) unsubscribe();
      };
    },
    [connections],
  );
  const getBusy = useCallback(() => busy(connections), [connections]);
  const active = useSyncExternalStore(subscribe, getBusy, getBusy);
  if (
    connections.some(
      (connection, index) =>
        !connection.id || connections.findIndex(({ id }) => id === connection.id) !== index,
    )
  )
    throw new Error("Call Connection choices require unique nonempty ids.");
  const selected = connections.find((connection) => connection.id === value);
  return (
    <div
      className={className}
      dir={locale.direction}
      data-pmfa="call-connection-picker"
    >
      <label htmlFor={id}>{locale.messages["calls.outgoingConnection"]}</label>
      <select
        id={id}
        value={selected?.id ?? ""}
        disabled={disabled === true || active || connections.length === 0}
        onChange={(event) => {
          // Re-read on interaction: placement may have started before React rendered.
          if (disabled === true || busy(connections)) return;
          const next = connections.find(
            (connection) => connection.id === event.target.value,
          );
          if (next !== undefined) onChange(next.id);
        }}
      >
        {selected === undefined && (
          <option value="" disabled>
            {locale.messages["calls.chooseConnection"]}
          </option>
        )}
        {connections.map((connection) => (
          <option key={connection.id} value={connection.id}>
            {connection.label}
          </option>
        ))}
      </select>
    </div>
  );
}
