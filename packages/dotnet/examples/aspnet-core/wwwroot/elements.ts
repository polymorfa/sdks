import { definePolymorfa } from "@polymorfa/elements";
// Bundle this module into wwwroot/elements.js using the same exact SDK version as the server release.
export function mount() { return definePolymorfa({ tokenEndpoint: "/api/polymorfa/token" }); }
