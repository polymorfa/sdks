# Inbox width regression

Actual public React Inbox, compiled from this correction on parent 1a2a851. The source and access-token supplier are synthetic in-memory fixtures. Every browser network request was refused. No account, provider or deployed API was used.

Installed Playwright 1.63.0 and matching Chromium 153.0.8010.12 ran headlessly with a fresh context and reduced motion. No browser or dependency was installed. Screenshots use synthetic Ada Demo content.

Before: the 562px outer box has 560px content, with a 380px list and a 180px thread. The same real-browser assertion fails before the correction. After: the list is 240px and the thread is 320px. At 620px outer width the thread remains 320px; at 1024px it grows to 642px. The 390px dark view keeps the list hidden, the thread spanning the content and Back visible. There are no page errors or document overflow in these cases.

These results cover layout with a synthetic source, not authentication, uploads, calling, provider delivery, package installation or publication. The contact-panel rule is unchanged.
