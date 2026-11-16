# UI Kit integrations

Use React components in React and Next.js applications. Other web frameworks
use the same Web Components. Server credentials stay in the application's
native backend; browser rendering does not require a TypeScript server.

| Application                | UI and setup                                                                                                                                                  |
| -------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| React                      | [React components and hooks](react.md) over the shared controllers.                                                                                           |
| Next.js                    | React client components with the server-only [`@polymorfa/nextjs` handler](https://github.com/polymorfa/sdks/tree/main/packages/nextjs).                      |
| Plain HTML, Vue and Svelte | [Web Components](web-components.md), without a React runtime.                                                                                                 |
| Go                         | [`net/http` or Gin with templ and HTMX](https://github.com/polymorfa/sdks/tree/main/examples/go/web-host), using the native Go SDK on the server.             |
| Python                     | [FastAPI or Django](https://github.com/polymorfa/sdks/tree/main/examples/python/web_host), using the native Python SDK on the server.                         |
| PHP                        | [Laravel or Symfony](https://github.com/polymorfa/sdks/tree/main/examples/php/web-host), using the native PHP SDK on the server.                              |
| Rust                       | [Yew with Axum](https://github.com/polymorfa/sdks/tree/main/examples/rust/yew), using the native Rust SDK in Axum.                                            |
| C#                         | [ASP.NET Core, Blazor and MAUI Blazor Hybrid](https://github.com/polymorfa/sdks/tree/main/packages/dotnet/examples), using the native .NET SDK on the server. |

The native framework integrations are example applications, not separate
component libraries. They render the shared Web Components and keep API calls
in the native server SDK. Their guides describe authentication, application-owned
storage, tested platforms and runtime limits. They are source examples; a
successful local build does not establish registry or deployed API availability.

The default components include their own styles. Use appearance variables,
slots or an explicit unstyled configuration to customize them. A host can add
layout CSS when composing primitives into a custom screen; basic composer
alignment needs no application stylesheet.
