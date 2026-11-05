// Synthetic local HTTPS peer. Its ephemeral certificate is not a product secret.
import { createServer } from "node:https";
import {
  mkdtempSync,
  mkdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { join } from "node:path";
import { homedir } from "node:os";
import { execFileSync } from "node:child_process";
const work =
  process.env.POLYMORFA_TEST_WORK_DIR ??
  join(
    homedir(),
    ".polymorfa-agent-work",
    "multi-language-sdks-20261011",
    "dotnet-media-tests",
  );
mkdirSync(work, { recursive: true });
const directory = mkdtempSync(join(work, "tls-"));
const certificate = join(directory, "certificate.pem");
const key = join(directory, "key.pem");
const authority = join(directory, "authority.pem");
const authorityKey = join(directory, "authority-key.pem");
const request = join(directory, "request.pem");
const extensions = join(directory, "extensions.txt");
execFileSync(
  "openssl",
  [
    "req",
    "-x509",
    "-newkey",
    "rsa:2048",
    "-nodes",
    "-days",
    "1",
    "-keyout",
    authorityKey,
    "-out",
    authority,
    "-subj",
    "/CN=PolymorfaSyntheticTestRoot",
    "-addext",
    "basicConstraints=critical,CA:TRUE",
  ],
  { stdio: "ignore" },
);
execFileSync(
  "openssl",
  [
    "req",
    "-new",
    "-newkey",
    "rsa:2048",
    "-nodes",
    "-keyout",
    key,
    "-out",
    request,
    "-subj",
    "/CN=mmg.whatsapp.net",
  ],
  { stdio: "ignore" },
);
writeFileSync(
  extensions,
  "basicConstraints=critical,CA:FALSE\nsubjectAltName=DNS:mmg.whatsapp.net,DNS:media.whatsapp.net\nkeyUsage=critical,digitalSignature,keyEncipherment\nextendedKeyUsage=serverAuth\n",
);
execFileSync(
  "openssl",
  [
    "x509",
    "-req",
    "-in",
    request,
    "-CA",
    authority,
    "-CAkey",
    authorityKey,
    "-CAcreateserial",
    "-days",
    "1",
    "-out",
    certificate,
    "-extfile",
    extensions,
  ],
  { stdio: "ignore" },
);
const fixtures = JSON.parse(readFileSync(process.argv[2], "utf8")).fixtures;
const requests = [];
let abandoned = 0;
const server = createServer(
  { cert: readFileSync(certificate), key: readFileSync(key) },
  async (request, response) => {
    if (request.url === "/state") {
      response.end(JSON.stringify({ requests, abandoned }));
      return;
    }
    response.on("close", () => {
      if (!response.writableEnded) abandoned++;
    });
    const publicHeaders = {
      authorization: !!request.headers.authorization,
      cookie: !!request.headers.cookie,
      origin: request.headers.origin,
      referer: request.headers.referer,
    };
    requests.push({
      path: request.url,
      method: request.method,
      ...publicHeaders,
    });
    if (
      publicHeaders.authorization ||
      publicHeaders.cookie ||
      publicHeaders.origin !== "https://web.whatsapp.com" ||
      publicHeaders.referer !== "https://web.whatsapp.com/"
    ) {
      response.writeHead(400);
      response.end();
      return;
    }
    if (request.url === "/stall") {
      response.writeHead(200, { "transfer-encoding": "chunked" });
      response.write(Buffer.from(fixtures[0].encrypted, "hex").subarray(0, 32));
      return;
    }
    if (request.url === "/escape") {
      response.writeHead(302, {
        location: "https://outside.example/private?secret=never-forward",
      });
      response.end();
      return;
    }
    if (request.url === "/redirect") {
      response.writeHead(302, {
        location: "https://media.whatsapp.net/image.enc?signature=fixture",
      });
      response.end();
      return;
    }
    const fixture = fixtures.find((value) =>
      request.url?.startsWith(`/${value.kind}.enc`),
    );
    if (!fixture) {
      response.writeHead(404);
      response.end();
      return;
    }
    const bytes = Buffer.from(fixture.encrypted, "hex");
    if (request.url.includes("oversize")) {
      response.writeHead(200, { "content-length": "1000000000" });
      response.end();
      return;
    }
    response.writeHead(200, {
      "content-type": "application/octet-stream",
      "transfer-encoding": "chunked",
    });
    for (let offset = 0; offset < bytes.length; offset += 3) {
      response.write(bytes.subarray(offset, offset + 3));
      await new Promise((resolve) => setTimeout(resolve, 1));
    }
    response.end();
  },
);
server.listen(0, "127.0.0.1", () =>
  process.stdout.write(
    JSON.stringify({
      port: server.address().port,
      certificate: readFileSync(authority).toString("base64"),
      directory,
    }) + "\n",
  ),
);
function stop() {
  server.close();
  rmSync(directory, { recursive: true, force: true });
  process.exit(0);
}
process.on("SIGTERM", stop);
process.on("SIGINT", stop);
