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
The mint helper checks the Number ID when the key has `sessions:read`, then
reads client rules and reports missing Calls actions or a blocked local origin
before minting. A project token must belong to the Number's project. The browser exchanges its
client token for a single-use lifecycle socket ticket before connecting; each
reconnect needs a fresh ticket. Staging must serve the ticket socket contract.
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
