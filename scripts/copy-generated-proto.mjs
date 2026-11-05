// Copies the generated WhatsApp protobuf module (JavaScript plus
// declarations) into the TypeScript package's dist folder. tsc does not
// emit or copy these files because they are checked in as .js/.d.ts.
import { copyFileSync, mkdirSync } from "node:fs";

const source = new URL(
  "../packages/typescript/src/history/gen/",
  import.meta.url,
);
const target = new URL(
  "../packages/typescript/dist/history/gen/",
  import.meta.url,
);
mkdirSync(target, { recursive: true });
for (const name of ["whatsapp_pb.js", "whatsapp_pb.d.ts"]) {
  copyFileSync(new URL(name, source), new URL(name, target));
}
