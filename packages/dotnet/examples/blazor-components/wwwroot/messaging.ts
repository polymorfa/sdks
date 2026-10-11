import { definePolymorfa } from "@polymorfa/elements";
let client: ReturnType<typeof definePolymorfa> | undefined;
export function mount(tokenEndpoint: string) { client = definePolymorfa({ tokenEndpoint }); }
export function dispose() { client?.dispose(); client = undefined; }
