/**
 * Internal building blocks shared with other Polymorfa packages and tests.
 * Not part of the public API: no stability guarantee, and applications must
 * not import this entry point.
 * @packageDocumentation
 * @internal
 */
export * from "./index.js";
export * from "./calls/internal.js";
// The public entry exports the controller as a type; internals need the class.
export { CallsController } from "./calls/controller.js";
export { resetPermissionWarnings } from "./dropin/permissions.js";
