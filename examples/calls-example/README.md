# Calls example

A small local preview of `@polymorfa/browser` and the React `DialPad` and
`CallSurface`. It points at `https://api.polymorfastaging.com`. The page accepts
only a short-lived `pmfa_ct_` browser client token; it never accepts a server
key or stores a token in a file, URL or browser storage.

From the repository root:

```bash
nvm use 22 # @polymorfa/calls requires Node 22 or newer
npm ci
npm run build:workspaces
npm run dev -w @polymorfa/example-calls
```

Open `http://127.0.0.1:5273`. The Vite server listens only on loopback. Enter
the session of a real connected staging Number and paste a client token minted
for that session. To mint one locally, use a separate Zsh terminal. An organization
server key or project token
stays in that terminal's environment and never enters the browser:

```bash
export POLYMORFA_SESSION=support
export POLYMORFA_EPHEMERAL_ID=calls-example-1
read -rs 'POLYMORFA_SERVER_KEY?Staging server key: '; echo
export POLYMORFA_SERVER_KEY
node examples/calls-example/mint-client-token.mjs
unset POLYMORFA_SERVER_KEY
```

Paste the printed token into the page. The issuing credential needs the six client
delegation scopes (`sessions:manage`, `messages:write`, `contacts:read`,
`presence:read`, `presence:observe`, `mcp`) and authority over every action
allowed by this session's rules. The rules need `voip_place`, `voip_answer`,
and `voip_signal` for the flows here. If the rules restrict origins, allow
`http://127.0.0.1:5273`. Calls must be enabled for the connected Number and
its project must have calling access. Use a fresh ephemeral ID for each browser.
The mint helper reads client rules and reports missing Calls actions or a
blocked local origin before minting. On a rules 404 it also checks the Number
ID when the key has `sessions:read`. A project token must belong to the
Number's project. If the key cannot read the Number, a rules 404 can mean an
inaccessible Number or missing rules. The browser authenticates the Calls
socket with its client token in the first WebSocket frame. The SDK can reuse a
cached token that has not expired on network reconnect; it refreshes after
token expiry or a server rejection. This page's provider always returns the
same pasted token, so disconnect and enter a newly minted token after expiry
or rejection.

If the Number has no client rules, the example can install narrow rules for a
local test. Set `POLYMORFA_TEST_CALLEE` to the E.164 number you intend to call:

```bash
export POLYMORFA_SESSION=support
export POLYMORFA_TEST_CALLEE=+12025550123
read -rs 'POLYMORFA_SERVER_KEY?Staging server key: '; echo
export POLYMORFA_SERVER_KEY
node examples/calls-example/configure-client-rules.mjs
unset POLYMORFA_SERVER_KEY
```

The command creates rules only when a read finds none. It stops if rules exist,
so review existing rules instead of replacing them. The read and write are not
atomic; do not run this command while another operator edits the same rules.
If the command reports that a write may have saved but not applied the rules,
inspect the rules and test the Calls result before editing or retrying.
The new rules allow only
Calls place, answer and signaling, restrict browser origin to
`http://127.0.0.1:5273`, restrict outbound calls to the test callee, and limit
call concurrency and setup rate. Messaging sends stay disabled. The issuing
credential needs the six delegation scopes listed above. The API also checks
that the Number belongs to the credential's project. After the command
succeeds, mint a client token with `mint-client-token.mjs`.

Click **Connect** and wait
for **Ready for calls** before dialing or receiving. Incoming calls appear in
`CallSurface`; the dial pad places outbound calls. **Disconnect** releases the
socket and media. To reconnect after token expiry, disconnect and paste a new
token.

The connection status follows the SDK's live socket state. A failed first
attempt can continue reconnecting, and errors are shown on the page. A healthy
API `/health` response or an open SIP port does not prove this browser call
path. Staging must have the matching API revision, a connected Number, VoIP
service, and working media path. This example does not configure SIP trunks.
