# Custom UI and Inspector demos

Each recording shows a custom application beside its paired Inspector WhatsApp
view. The application sends through its native server SDK, receives an
independently typed reply through a signed HTTPS webhook and reloads the
conversation. These are concurrent captures of working applications.

- [Go: net/http and templ](go-round-trip.mp4)
- [Python: FastAPI and Jinja](python-round-trip.mp4)
- [PHP: Laravel and Blade](php-round-trip.mp4)
- [Rust: Yew and Axum](rust-round-trip.mp4)
- [C#: ASP.NET Core](csharp-round-trip.mp4)

The runs use isolated local test numbers and simulated WhatsApp with a local
backend candidate. The native pane is sampled at about two frames per second.
No real WhatsApp recipient, customer data or authentication screen appears.
The PHP clip retains an idle wait and conversation reselection after reload.

One canonical desktop UI per language is recorded. Python's Django and PHP's
Symfony handlers also have HTTP checks; C# Blazor and MAUI have separate
acceptance limits. These videos do not establish registry publication, hosted
API acceptance or production availability.
