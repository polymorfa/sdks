import { createContext, useContext, useMemo, type ReactNode } from "react";
import {
  createLocale,
  defineAppearance,
  type Appearance,
  type AppearanceInput,
  type Locale,
} from "@polymorfa/ui";

export interface PolymorfaReactConfiguration {
  readonly appearance: Appearance;
  readonly locale: Locale;
}
const Context = createContext<PolymorfaReactConfiguration | undefined>(
  undefined,
);
export interface PolymorfaProviderProps {
  readonly appearance?: AppearanceInput;
  readonly locale?: Locale;
  readonly children?: ReactNode;
}
export function PolymorfaProvider({
  appearance,
  locale,
  children,
}: PolymorfaProviderProps) {
  const value = useMemo(
    () => ({
      appearance: defineAppearance(appearance),
      locale: locale ?? createLocale("en"),
    }),
    [appearance, locale],
  );
  return <Context.Provider value={value}>{children}</Context.Provider>;
}
// One shared default keeps memoized components stable without a provider.
let defaultConfiguration: PolymorfaReactConfiguration | undefined;
export function usePolymorfa(): PolymorfaReactConfiguration {
  const value = useContext(Context);
  if (value !== undefined) return value;
  defaultConfiguration ??= {
    appearance: defineAppearance(),
    locale: createLocale("en"),
  };
  return defaultConfiguration;
}
