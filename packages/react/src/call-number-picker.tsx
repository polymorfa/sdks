import type { CallsController } from "@polymorfa/browser";
import { useCallback, useId, useSyncExternalStore } from "react";
import { usePolymorfa } from "./context.js";
import { safeSubscribe } from "./hooks.js";

/** A Number authorized by the application, with its own fixed Calls client. */
export interface CallNumberOption {
  readonly id: string;
  readonly label: string;
  readonly controller: CallsController;
}
export interface CallNumberPickerProps {
  readonly numbers: readonly CallNumberOption[];
  readonly value: string;
  /** Select the existing Number client; never replace its token or session. */
  readonly onChange: (id: string) => void;
  readonly disabled?: boolean;
  readonly className?: string;
}

function busy(numbers: readonly CallNumberOption[]): boolean {
  return numbers.some(({ controller }) => {
    const state = controller.getSnapshot();
    return (
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
 * Choose an outgoing Number from application-authorized clients. Locks while
 * any supplied client places, answers, or carries a call. It does not connect,
 * disconnect, discover Numbers, mint credentials, or retarget an existing call.
 */
export function CallNumberPicker({
  numbers,
  value,
  onChange,
  disabled,
  className,
}: CallNumberPickerProps) {
  const { locale } = usePolymorfa();
  const id = useId();
  const subscribe = useCallback(
    (listener: () => void) => {
      const stop = numbers.map(({ controller }) =>
        safeSubscribe(controller)(listener),
      );
      return () => {
        for (const unsubscribe of stop) unsubscribe();
      };
    },
    [numbers],
  );
  const getBusy = useCallback(() => busy(numbers), [numbers]);
  const active = useSyncExternalStore(subscribe, getBusy, getBusy);
  if (
    numbers.some(
      (number, index) =>
        !number.id || numbers.findIndex(({ id }) => id === number.id) !== index,
    )
  )
    throw new Error("Call Number choices require unique nonempty ids.");
  const selected = numbers.find((number) => number.id === value);
  return (
    <div
      className={className}
      dir={locale.direction}
      data-pmfa="call-number-picker"
    >
      <label htmlFor={id}>{locale.messages["calls.outgoingNumber"]}</label>
      <select
        id={id}
        value={selected?.id ?? ""}
        disabled={disabled === true || active || numbers.length === 0}
        onChange={(event) => {
          // Re-read on interaction: placement may have started before React rendered.
          if (disabled === true || busy(numbers)) return;
          const next = numbers.find(
            (number) => number.id === event.target.value,
          );
          if (next !== undefined) onChange(next.id);
        }}
      >
        {selected === undefined && (
          <option value="" disabled>
            {locale.messages["calls.chooseNumber"]}
          </option>
        )}
        {numbers.map((number) => (
          <option key={number.id} value={number.id}>
            {number.label}
          </option>
        ))}
      </select>
    </div>
  );
}
