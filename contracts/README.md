# Contract coverage

## Number-scoped Test phone and events

`test-number-dropin-routes.json`, `testing-phone.json` and `testing-events.json`
pin the six moved operations to API `eda77760b56095a771c55e5d2df18be23e985377`
(see the full source commit in each JSON). The six coverage entries carry
`sourceCommit` overrides; the global baseline remains unchanged. Collision
schemas in the merged snapshot are namespaced `TestDropin*` so unrelated
operations retain their baseline fingerprints. The focused snapshots preserve
the authoritative schema names. Native route parity and qualification must be completed before this change is ready. This is an unpublished breaking contract
change, coordinated with polymorfa/polymorfa#792.
