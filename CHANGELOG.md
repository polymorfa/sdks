# Changelog

## Unreleased

- Breaking, pending the API route cutover: Test phone methods take a Number ID
  without a project argument. `testing.triggerEvent(numberId, body)` omits
  body `session` and accepts `fromNumber`; `listEventFixtures()` has no project
  argument. History fixtures keep their project argument and use
  `/messaging/projects/{projectId}/test-history-fixtures`. Real Numbers return
  `404 resource_not_found`. Scope names remain `sandbox:read` / `sandbox:write`.
  Coordinated API draft: polymorfa/polymorfa#792. This package is not published
  or deployed by that change.
