"use client";

import { DevAssistant, mountDevAssistant } from "@polymorfa/devtools";
import { PolymorfaProvider } from "@polymorfa/react";
import { createLocale, type AppearanceInput } from "@polymorfa/ui";
import { useEffect, useMemo, type ReactNode } from "react";

const appearance: AppearanceInput = {
  theme: "system",
  variables: {
    colorPrimary: "#0f766e",
    fontFamily: "Inter, ui-sans-serif, system-ui, sans-serif",
    radiusMedium: "12px",
    motion: "system",
  },
  layout: { density: "compact", drawerWidth: "420px" },
};

export function Providers({ children }: { children: ReactNode }) {
  const locale = useMemo(
    () =>
      createLocale(
        typeof navigator === "undefined" ? "en" : navigator.language,
      ),
    [],
  );

  useEffect(() => {
    // The assistant disables itself outside development.
    if (process.env.NODE_ENV !== "development") return;
    const assistant = new DevAssistant({
      environment: "development",
      tokenEnvironment: "development",
      appearance,
      locale: locale.code,
    });
    const mounted = mountDevAssistant(assistant);
    return () => mounted?.dispose();
  }, [locale]);

  return (
    <PolymorfaProvider appearance={appearance} locale={locale}>
      {children}
    </PolymorfaProvider>
  );
}
