# `@polymorfa/ui-kit`

The Polymorfa UI Kit: browser transport, product controllers, React
components, web components, appearance, an opt-in event store and a
development assistant, in one package with one version.

```bash
npm install @polymorfa/ui-kit@dev
```

`@polymorfa/ui-kit` depends on `@polymorfa/sdk` for the shared Calls client.
React applications also need `react` and `react-dom` 18.2 or 19. They are
optional peer dependencies: only the `/react` and `/store/react` subpaths load
them.

## Imports

| Import                                  | Contents                                                                        | Guide                                    |
| --------------------------------------- | ------------------------------------------------------------------------------- | ---------------------------------------- |
| `@polymorfa/ui-kit`                     | Client-token transport, token refresh and product controllers                   | [Browser runtime](docs/browser.md)       |
| `@polymorfa/ui-kit/react`               | React components and hooks over the same controllers                            | [React components](docs/react.md)        |
| `@polymorfa/ui-kit/web-components`      | Custom elements and `defineUiKit()` for plain HTML, Vue, Svelte and other hosts | [Web components](docs/web-components.md) |
| `@polymorfa/ui-kit/web-components/*`    | `chat`, `templates` and `calls` element groups on their own                     | [Web components](docs/web-components.md) |
| `@polymorfa/ui-kit/appearance`          | Themes, localization, diagnostic redaction and shared styles                    | [Appearance](docs/appearance.md)         |
| `@polymorfa/ui-kit/store`               | Opt-in IndexedDB store for webhook-shaped events                                | [Store](docs/store.md)                   |
| `@polymorfa/ui-kit/store/react`         | React hooks for the store                                                       | [Store](docs/store.md)                   |
| `@polymorfa/ui-kit/devtools`            | Production-gated configuration and diagnostics assistant                        | [Developer assistant](docs/devtools.md)  |
| `@polymorfa/ui-kit/devtools/production` | Inert assistant entry point for production builds                               | [Developer assistant](docs/devtools.md)  |

Importing a subpath has no side effects. Custom elements register only when
you call `defineUiKit()`, `definePolymorfaElements()` or a group's `define*`
function, and only the React subpaths import React.

```ts
import { defineUiKit } from "@polymorfa/ui-kit/web-components";

defineUiKit({ tokenEndpoint: "/api/polymorfa/token" });
```

Tag, class and CSS variable names use the `pmfa-` prefix, for example
`<pmfa-inbox>`, `.pmfa-bubble` and `--pmfa-c-primary`.

## Credentials

The UI Kit accepts only short-lived `pmfa_ct_` client tokens returned by your
application. It never accepts or stores server API keys. Mint client tokens on
your server with `@polymorfa/sdk` or `@polymorfa/nextjs`.

## Moving from the earlier packages

The UI Kit replaces six packages. Change the import specifier; the exported
names are unchanged except `definePolymorfa`, which is now `defineUiKit`, and
its options type, now `DefineUiKitOptions`.

| Earlier import                                          | UI Kit import                                                         |
| ------------------------------------------------------- | --------------------------------------------------------------------- |
| `@polymorfa/browser`                                    | `@polymorfa/ui-kit`                                                   |
| `@polymorfa/react`                                      | `@polymorfa/ui-kit/react`                                             |
| `@polymorfa/elements`                                   | `@polymorfa/ui-kit/web-components`                                    |
| `@polymorfa/elements/chat`, `/templates`, `/calls`      | `@polymorfa/ui-kit/web-components/chat`, `/templates`, `/calls`       |
| `@polymorfa/ui`                                         | `@polymorfa/ui-kit/appearance`                                        |
| `@polymorfa/store`, `@polymorfa/store/react`            | `@polymorfa/ui-kit/store`, `@polymorfa/ui-kit/store/react`            |
| `@polymorfa/devtools`, `@polymorfa/devtools/production` | `@polymorfa/ui-kit/devtools`, `@polymorfa/ui-kit/devtools/production` |
