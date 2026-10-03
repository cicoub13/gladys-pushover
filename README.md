# Pushover — Gladys Assistant external integration

Deliver the messages of [Gladys Assistant](https://gladysassistant.com) to the
[Pushover](https://pushover.net) apps (Android, iOS, desktop). Built as an
external integration running in its own container, on the JavaScript SDK
[`@gladysassistant/integration-sdk`](https://github.com/GladysAssistant/integration-sdk-js).

> **Requires Gladys ≥ 4.86.0.** `gladys_version` in the manifest declares that
> floor.

## Features

- A **send-only messaging channel** (`type: communication`,
  `messaging.receive: false`): the **Send Message** and **Send a camera image**
  scene actions, and every other message Gladys sends to a user, reach that
  user's Pushover devices.
- **Per-user accounts**: the administrator enters the Pushover application
  token once, each Gladys user enters their own user (or group) key and,
  optionally, the devices to target, in the **My account** block.
- **Camera images** are attached to the notification (up to 5 MB). Texts longer
  than Pushover's 1,024 characters are shortened instead of rejected.
- The **connection status** checks the token at startup and shows the messages
  left in the monthly quota. A token Pushover refused, or a malformed token or
  key, stops the sending without a request, and a refused user key or an
  exhausted quota pauses it: Pushover temporarily blocks an IP address that
  keeps sending invalid requests.

## Install

- **From Gladys**: install **Pushover** from the integration store (Gladys
  4.86.0 or later), then follow the configuration screen.
- **Development**: run it outside Docker against a local Gladys, see
  [Run locally](#run-locally).

## Configuration

| Where                  | Field                 | Description                                                                                              |
| ---------------------- | --------------------- | -------------------------------------------------------------------------------------------------------- |
| Configuration (admin)  | Application API token | Token of an application created at [pushover.net/apps/build](https://pushover.net/apps/build).           |
| My account (each user) | User key              | The user key shown on the [pushover.net](https://pushover.net) home page once logged in, or a group key. |
| My account (each user) | Devices               | Optional comma-separated Pushover device names (`iphone,ipad`); all the user's devices when empty.       |

Full user documentation, including troubleshooting:
[`docs/en.md`](./docs/en.md) / [`docs/fr.md`](./docs/fr.md).

## Development

Requires Node.js 20 or later.

```bash
npm ci
npm test               # unit tests (node --test)
npm run lint           # ESLint
npm run format:check   # Prettier
npm run coverage       # tests + coverage thresholds (needs Node >= 22.8)
```

Validate the manifest with the store's checker:

```bash
npx github:GladysAssistant/integration-store .
```

### Check against the real Pushover API

Without Gladys: put your keys in `.env` (ignored by git), then run
`npm run smoke`. It checks the token, then sends a text message and a message
with an image to your devices, through the same code Gladys drives.

```bash
PUSHOVER_APP_TOKEN=<application API token>
PUSHOVER_USER_KEY=<user or group key>
PUSHOVER_DEVICES=<optional, comma-separated device names>
```

### Run locally

Register the integration in development mode in a Gladys 4.86+ server to get
its token and selector, then:

```bash
GLADYS_HOST_API_URL="http://localhost:1443" \
GLADYS_INTEGRATION_TOKEN="<token>" \
GLADYS_INTEGRATION_SELECTOR="<selector>" \
LOG_LEVEL=debug \
npm start
```

## Architecture

```
├─ index.js                          # wires the SDK handlers to PushoverIntegration, no logic
├─ src/
│  ├─ integration.js                 # PushoverIntegration: token check, connection status, message delivery
│  ├─ config.js                      # configuration and "My account" values: trim, format checks
│  ├─ message.js                     # Gladys message -> Pushover message (text limit, camera image)
│  ├─ lifecycle.js                   # unhandled-rejection exit
│  └─ pushover/
│     └─ client.js                   # Pushover HTTP API client, errors and user-facing messages
├─ scripts/smoke.mjs                 # manual check against the real Pushover API (npm run smoke)
├─ test/                             # node:test unit tests (fake Gladys, fake Pushover)
├─ docs/{en,fr}.md                   # user documentation (shown in the Gladys catalog)
├─ gladys-assistant-integration.json # manifest
└─ Dockerfile                        # image run by the Gladys supervisor
```

## Synced files

`.github/workflows/`, `.github/dependabot.yml`, `SECURITY.md` and `CLAUDE.md`
are synced from [cicoub13/integration-kit](https://github.com/cicoub13/integration-kit).
Do not edit them here: the next sync overwrites local changes. Change the
templates in integration-kit instead.

## License

Apache-2.0
