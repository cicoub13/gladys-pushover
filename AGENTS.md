# AGENTS.md: gladys-pushover

Project-specific notes. Generic rules (SDK contract, commands, kit-owned files, runtime) are in
`CLAUDE.md`; the module tree and user-facing features are in `README.md`.

## Gladys contract (send-only channel)

- Manifest `type: communication` + `messaging: { receive: false }`: no devices, no inbound
  messages, no linking code. `config_schema` holds the admin's `app_token`; `contact_schema`
  (the "My account" block, filled by EACH user) holds `user_key` and `devices`.
- `onSendMessage(contact, message)`: `contact` is the recipient's `contact_schema` values,
  `message` is `{ text, file }`. Gladys only calls it for users who filled their values, and
  through `message.sendToUser` only (no reply path on a send-only channel).
- The core acks `message.send` within 5 s (`COMMAND_TIMEOUT_MS`), hence the 4 s request timeout
  of the client. No retry: Pushover asks for 5 s between retries, longer than the ack window.
- The SDK does not log a failed command and the core only logs it in the Gladys server log:
  `handleSendMessage` logs every failure (`Message not delivered: …`) for the integration logs.
- `message.file` is `image/jpg;base64,…` (camera captures, see `camera.getLiveImage` in the
  core), sometimes with a `data:` prefix. `image/jpg` is mapped to `image/jpeg`.

## Data flow

- `index.js` -> `PushoverIntegration` (`src/integration.js`).
- `applyConfig()` (on `connected`, with `gladys.config` the SDK just resynchronized, and on
  `onConfigUpdated`) sets the client and `blocker` SYNCHRONOUSLY, bumps `generation`, then checks
  the token with `GET /apps/limits.json` (costs no message) and reports the connection status
  with the quota. Never rejects. An outcome whose `generation` is stale changes nothing.
- `blocker` ({en, fr} or null): missing token, malformed token, or a token Pushover refused once.
  While set, `handleSendMessage` throws without a request. Only a new configuration clears it.
- A message arriving before the first `applyConfig` (the core relays right after the WebSocket
  authenticates, before the SDK resync ends) reads the config itself; the token check then runs
  in the background.
- Errors about one recipient or one message (`invalid_user`, `invalid_request`, malformed key or
  device names, empty message) fail that message only. Channel-wide errors (token, quota,
  network, Pushover down) also become the connection status; a later success restores it.
- `reportConnection` only calls `setConnectionStatus` when `connected` or the message changes
  (pushed to every open Gladys page), and never throws.

## Pushover API (`src/pushover/client.js`)

- `POST https://api.pushover.net/1/messages.json`, multipart form (the attachment goes as a
  binary file, no base64 overhead): `token`, `user`, `message`, optional `device`, `attachment`.
  `GET /1/apps/limits.json?token=`. Success = HTTP 200 AND `"status": 1`.
- 4xx bodies flag each bad parameter (`{"token": "invalid", "errors": [...]}`): `token` ->
  `invalid_token`, `user` -> `invalid_user`, else `invalid_request`. 429 -> `quota` (monthly,
  account-wide, resets on the 1st). 5xx -> `server`. 2xx without `status: 1` (captive portal) ->
  `invalid_response`. Network -> `unreachable` / `timeout`.
- **IP blocking**: Pushover temporarily blocks an IP that sends many 4xx in a few minutes, and the
  whole house shares it. Hence the local format checks (`isValidKey`: 30 `[A-Za-z0-9]`; device
  names `[A-Za-z0-9_-]{1,25}`) and the `blocker` after a refused token.
- The token lives in a private field; the token and the user key are scrubbed (`***`) from
  Pushover's error texts, and the original fetch error is dropped (only `cause.code` kept).
  `test/client.test.js` asserts nothing leaks: keep it that way. Never log a user key.
- Limits: text 1024 Unicode characters (`truncateText` counts code points), attachment 5 MB.
  A blank text with an image becomes `📷` (Pushover refuses a blank message).

## Config and storage

- Keys are a compatibility contract: `app_token` (config), `user_key`, `devices` (contact). Users'
  "My account" values are stored by Gladys per user; renaming a key loses them.
- Nothing is written to `/data`.

## Tests

- `test/helpers/fakeGladys.js`: records `getConfig` / `setConnectionStatus`, `failNext()` simulates
  host 429s. `test/integration.test.js` injects a scripted Pushover client (outcome lists).
- `test/client.test.js` uses a recording `fakeFetch` returning real `Response` objects.
- `test/manifest.test.js` cross-checks the manifest with the code (config and contact keys,
  version, image tag, cover size and dimensions): update both sides together.
- `npm run coverage`: lines 90 %, branches/functions 85 % (needs Node >= 22.8).
