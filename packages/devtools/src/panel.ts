import { appearanceToCssVariables } from "@polymorfa/ui";
import type { DevAssistant } from "./model.js";

export interface MountedDevAssistant {
  readonly element: HTMLElement;
  dispose(): void;
}

export function mountDevAssistant(
  assistant: DevAssistant,
  parent: HTMLElement = document.body,
): MountedDevAssistant | null {
  if (!assistant.getSnapshot().enabled) return null;
  const root = document.createElement("aside");
  root.dataset.polymorfaDevtools = "";
  root.setAttribute("aria-label", "Polymorfa developer assistant");
  root.style.cssText =
    "position:fixed;right:16px;bottom:16px;z-index:2147483647;width:min(360px,calc(100vw - 32px));padding:14px;border:1px solid #dedbe5;border-radius:12px;background:#fff;color:#17151f;box-shadow:0 18px 50px rgb(23 21 31 / .16);font:14px/1.4 ui-sans-serif,system-ui";
  parent.append(root);

  const render = (): void => {
    const snapshot = assistant.getSnapshot();
    root.dir = snapshot.direction;
    for (const [name, value] of Object.entries(
      appearanceToCssVariables(snapshot.appearance),
    )) {
      root.style.setProperty(name, value);
    }
    root.replaceChildren(
      heading("Polymorfa dev mode"),
      control(
        "Theme",
        ["system", "light", "dark"],
        snapshot.appearance.theme,
        (value) =>
          assistant.configure({ theme: value as "system" | "light" | "dark" }),
      ),
      control(
        "Direction",
        ["auto", "ltr", "rtl"],
        snapshot.direction,
        (value) =>
          assistant.configure({ direction: value as "auto" | "ltr" | "rtl" }),
      ),
      control(
        "Motion",
        ["system", "full", "reduced"],
        snapshot.motion,
        (value) =>
          assistant.configure({
            motion: value as "system" | "full" | "reduced",
          }),
      ),
      control(
        "Viewport",
        ["responsive", "mobile", "tablet", "desktop"],
        snapshot.viewport,
        (value) =>
          assistant.configure({ viewport: value as typeof snapshot.viewport }),
      ),
      control(
        "Network",
        ["online", "slow", "offline"],
        snapshot.network,
        (value) =>
          assistant.configure({ network: value as typeof snapshot.network }),
      ),
      summary(`${snapshot.events.length} redacted request event(s)`),
      button("Copy configuration", () =>
        navigator.clipboard.writeText(assistant.copyableConfig()),
      ),
    );
  };
  const unsubscribe = assistant.subscribe(render);
  render();
  return {
    element: root,
    dispose: () => {
      unsubscribe();
      root.remove();
    },
  };
}

function heading(text: string): HTMLElement {
  const value = document.createElement("strong");
  value.textContent = text;
  value.style.display = "block";
  value.style.marginBottom = "10px";
  return value;
}

function control(
  label: string,
  options: readonly string[],
  selected: string,
  onChange: (value: string) => void,
): HTMLElement {
  const wrapper = document.createElement("label");
  wrapper.style.cssText =
    "display:grid;grid-template-columns:1fr 1fr;gap:8px;margin:6px 0";
  wrapper.append(document.createTextNode(label));
  const select = document.createElement("select");
  for (const option of options) {
    const value = document.createElement("option");
    value.value = option;
    value.textContent = option;
    value.selected = option === selected;
    select.add(value);
  }
  select.addEventListener("change", () => onChange(select.value));
  wrapper.append(select);
  return wrapper;
}

function summary(text: string): HTMLElement {
  const value = document.createElement("p");
  value.textContent = text;
  value.setAttribute("aria-live", "polite");
  return value;
}

function button(
  text: string,
  onClick: () => void | Promise<void>,
): HTMLElement {
  const value = document.createElement("button");
  value.type = "button";
  value.textContent = text;
  value.addEventListener("click", () => void onClick());
  return value;
}
