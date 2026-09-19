"use client";

import { DevAssistant, mountDevAssistant } from "@polymorfa/devtools";
import { PolymorfaProvider } from "@polymorfa/react";
import { createLocale, type AppearanceInput } from "@polymorfa/ui";
import { useEffect, useMemo, type ReactNode } from "react";

import { isRtl, type Settings } from "../ui/context.js";

/**
 * Maps the app's settings onto the Polymorfa components: theme, accent,
 * density, locale and text direction.
 */
export function Providers({
  settings,
  dark,
  children,
}: {
  readonly settings: Settings;
  readonly dark: boolean;
  readonly children: ReactNode;
}) {
  const locale = useMemo(
    () => createLocale(settings.locale),
    [settings.locale],
  );
  const appearance = useMemo<AppearanceInput>(
    () => ({
      theme: dark ? "dark" : "light",
      variables: {
        colorPrimary: settings.accent,
        colorBackground: "#ffffff",
        colorForeground: "#111b21",
        colorMuted: "#667781",
        colorBorder: "#e9edef",
        fontFamily:
          'Inter, ui-sans-serif, system-ui, -apple-system, "Segoe UI", sans-serif',
        fontSizeBase: "15px",
        radiusMedium: "10px",
        motion: "system",
      },
      darkVariables: {
        colorPrimary: settings.accent,
        colorBackground: "#111b21",
        colorForeground: "#e9edef",
        colorMuted: "#8696a0",
        colorBorder: "#2a3942",
      },
      layout: {
        density: settings.density,
        direction: isRtl(settings.locale) ? "rtl" : "ltr",
      },
    }),
    [dark, settings.accent, settings.density, settings.locale],
  );

  useEffect(() => {
    // The assistant is for local development only.
    if (process.env.NODE_ENV !== "development") return;
    const assistant = new DevAssistant({
      environment: "development",
      tokenEnvironment: "development",
      appearance: { theme: "system" },
      locale: settings.locale,
    });
    // Collapsed in the bottom-left corner, lifted above the mobile tab bar and
    // clear of the chat composer, which sits to the right of the ticket list.
    const mounted = mountDevAssistant(assistant, {
      position: "bottom-left",
      defaultOpen: false,
      offset: { x: 12, y: 84 },
    });
    return () => mounted?.dispose();
  }, [settings.locale]);

  return (
    <PolymorfaProvider appearance={appearance} locale={locale}>
      {children}
    </PolymorfaProvider>
  );
}
