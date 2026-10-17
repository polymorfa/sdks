import { definePolymorfa } from "@polymorfa/elements";
let client;
window.startPolymorfa = () => {
  client ??= definePolymorfa({ tokenEndpoint: "/api/polymorfa/token" });
};

window.stopPolymorfa = () => {
  client?.dispose();
  client = undefined;
};
