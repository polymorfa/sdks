# `@polymorfa/ui`

Shared appearance, localization, and safe diagnostic contracts for Polymorfa browser components.

```ts
import { createLocale, defineAppearance } from "@polymorfa/ui";

const appearance = defineAppearance({
  variables: { colorPrimary: "#7c3aed" },
  layout: { density: "compact" },
});

const locale = createLocale("ar-LB", { "common.cancel": "إلغاء" });
```

The appearance object is immutable and shared by the Web Component, React, and development-tool packages. CSS variable names use the stable `--pmfa-*` prefix. Partial locale dictionaries fall back to the bundled English messages.

`redactDiagnostic()` recursively removes credentials, authorization values, secrets, and message bodies before diagnostic data is displayed or copied.
