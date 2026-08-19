export type Theme = "light" | "dark" | "system";
export type MotionPreference = "full" | "reduced" | "system";
export type Density = "comfortable" | "compact";
export type Direction = "ltr" | "rtl" | "auto";

export interface AppearanceVariables {
  readonly colorPrimary: string;
  readonly colorBackground: string;
  readonly colorForeground: string;
  readonly colorMuted: string;
  readonly colorBorder: string;
  readonly colorDanger: string;
  readonly colorSuccess: string;
  readonly fontFamily: string;
  readonly fontSizeBase: string;
  readonly spacingSmall: string;
  readonly spacingMedium: string;
  readonly spacingLarge: string;
  readonly radiusSmall: string;
  readonly radiusMedium: string;
  readonly radiusLarge: string;
  readonly shadowPanel: string;
  readonly motion: MotionPreference;
}

export interface AppearanceLayout {
  readonly density: Density;
  readonly direction: Direction;
  readonly drawerWidth: string;
  readonly dialogWidth: string;
  readonly callAspectRatio: string;
}

export interface ElementAppearance {
  readonly className?: string;
  readonly surface?: "flat" | "raised" | "overlay";
  readonly styles?: Readonly<Record<string, string>>;
}

export interface Appearance {
  readonly theme: Theme;
  readonly variables: AppearanceVariables;
  readonly layout: AppearanceLayout;
  readonly elements: Readonly<Record<string, ElementAppearance>>;
}

export interface AppearanceInput {
  readonly theme?: Theme;
  readonly variables?: Partial<AppearanceVariables>;
  readonly layout?: Partial<AppearanceLayout>;
  readonly elements?: Readonly<Record<string, ElementAppearance>>;
}

const DEFAULT_APPEARANCE_VALUE: Appearance = {
  theme: "system",
  variables: {
    colorPrimary: "#5b4bf7",
    colorBackground: "#ffffff",
    colorForeground: "#17151f",
    colorMuted: "#6d6878",
    colorBorder: "#dedbe5",
    colorDanger: "#c62828",
    colorSuccess: "#18794e",
    fontFamily: "Inter, ui-sans-serif, system-ui, sans-serif",
    fontSizeBase: "16px",
    spacingSmall: "8px",
    spacingMedium: "12px",
    spacingLarge: "20px",
    radiusSmall: "6px",
    radiusMedium: "10px",
    radiusLarge: "16px",
    shadowPanel: "0 18px 50px rgb(23 21 31 / 0.16)",
    motion: "system",
  },
  layout: {
    density: "comfortable",
    direction: "auto",
    drawerWidth: "400px",
    dialogWidth: "440px",
    callAspectRatio: "16 / 9",
  },
  elements: {},
};

export const DEFAULT_APPEARANCE = deepFreeze(DEFAULT_APPEARANCE_VALUE);

export function defineAppearance(input: AppearanceInput = {}): Appearance {
  return mergeAppearance(DEFAULT_APPEARANCE, input);
}

export function mergeAppearance(
  base: AppearanceInput,
  override: AppearanceInput,
): Appearance {
  const baseVariables = { ...DEFAULT_APPEARANCE.variables, ...base.variables };
  const baseLayout = { ...DEFAULT_APPEARANCE.layout, ...base.layout };
  const elements: Record<string, ElementAppearance> = {};
  for (const name of new Set([
    ...Object.keys(base.elements ?? {}),
    ...Object.keys(override.elements ?? {}),
  ])) {
    const baseElement = base.elements?.[name];
    const overrideElement = override.elements?.[name];
    elements[name] = {
      ...baseElement,
      ...overrideElement,
      ...(baseElement?.styles === undefined &&
      overrideElement?.styles === undefined
        ? {}
        : { styles: { ...baseElement?.styles, ...overrideElement?.styles } }),
    };
  }
  return deepFreeze({
    theme: override.theme ?? base.theme ?? DEFAULT_APPEARANCE.theme,
    variables: { ...baseVariables, ...override.variables },
    layout: { ...baseLayout, ...override.layout },
    elements,
  });
}

const CSS_VARIABLES: Readonly<Record<keyof AppearanceVariables, string>> = {
  colorPrimary: "--pmfa-color-primary",
  colorBackground: "--pmfa-color-background",
  colorForeground: "--pmfa-color-foreground",
  colorMuted: "--pmfa-color-muted",
  colorBorder: "--pmfa-color-border",
  colorDanger: "--pmfa-color-danger",
  colorSuccess: "--pmfa-color-success",
  fontFamily: "--pmfa-font-family",
  fontSizeBase: "--pmfa-font-size-base",
  spacingSmall: "--pmfa-spacing-small",
  spacingMedium: "--pmfa-spacing-medium",
  spacingLarge: "--pmfa-spacing-large",
  radiusSmall: "--pmfa-radius-small",
  radiusMedium: "--pmfa-radius-medium",
  radiusLarge: "--pmfa-radius-large",
  shadowPanel: "--pmfa-shadow-panel",
  motion: "--pmfa-motion",
};

export function appearanceToCssVariables(
  appearance: Appearance,
): Readonly<Record<string, string>> {
  const entries = Object.entries(CSS_VARIABLES)
    .map(
      ([key, cssName]) =>
        [
          cssName,
          appearance.variables[key as keyof AppearanceVariables],
        ] as const,
    )
    .sort(([left], [right]) => left.localeCompare(right));
  return Object.freeze(Object.fromEntries(entries));
}

export function resolveMotionPreference(
  preference: MotionPreference,
  systemPrefersReduced: boolean,
): Exclude<MotionPreference, "system"> {
  return preference === "system"
    ? systemPrefersReduced
      ? "reduced"
      : "full"
    : preference;
}

function deepFreeze<T>(value: T): T {
  if (typeof value !== "object" || value === null || Object.isFrozen(value))
    return value;
  for (const child of Object.values(value)) deepFreeze(child);
  return Object.freeze(value);
}
