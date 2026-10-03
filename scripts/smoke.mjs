// -----------------------------------------------------------------------------
// Manual end-to-end check against the REAL Pushover API, without Gladys.
//
// Drives PushoverIntegration exactly like the SDK does (applyConfig, then
// handleSendMessage with "My account" values), with a stand-in for Gladys
// that prints the connection status. Sends two real messages: a text, then a
// text with an image (the cover, as a Gladys camera capture would be).
//
// Usage: put your keys in .env (ignored by git), then `npm run smoke`.
//   PUSHOVER_APP_TOKEN=...   application API token
//   PUSHOVER_USER_KEY=...    user (or group) key
//   PUSHOVER_DEVICES=...     optional, comma-separated device names
// -----------------------------------------------------------------------------

import { readFileSync } from 'node:fs';
import { PushoverIntegration } from '../src/integration.js';

const { PUSHOVER_APP_TOKEN, PUSHOVER_USER_KEY, PUSHOVER_DEVICES = '' } = process.env;
if (!PUSHOVER_APP_TOKEN || !PUSHOVER_USER_KEY) {
  console.error('Set PUSHOVER_APP_TOKEN and PUSHOVER_USER_KEY in .env, then run `npm run smoke`.');
  process.exit(1);
}

const logger = {
  info: (message) => console.log(`  [info] ${message}`),
  warn: (message) => console.log(`  [warn] ${message}`),
  debug: (message) => console.log(`  [debug] ${message}`),
};
const gladys = {
  async getConfig() {
    return { app_token: PUSHOVER_APP_TOKEN };
  },
  async setConnectionStatus(connected, message) {
    console.log(`  [status] connected=${connected} ${message?.fr ?? ''}`);
  },
};
const integration = new PushoverIntegration(gladys, { logger });
const contact = { user_key: PUSHOVER_USER_KEY, devices: PUSHOVER_DEVICES };
const cover = readFileSync(new URL('../cover.png', import.meta.url)).toString('base64');

const steps = [
  ['Token check', () => integration.applyConfig({ app_token: PUSHOVER_APP_TOKEN })],
  [
    'Text message',
    () =>
      integration.handleSendMessage(contact, {
        text: `Test de l'intégration Gladys Pushover (${new Date().toLocaleTimeString()}) ✅`,
        file: null,
      }),
  ],
  [
    'Message with an image',
    () =>
      integration.handleSendMessage(contact, {
        text: 'Image jointe, comme une capture de caméra 📷',
        file: `image/png;base64,${cover}`,
      }),
  ],
];

let failed = false;
for (const [label, run] of steps) {
  console.log(`${label}...`);
  try {
    await run();
    console.log('  ok');
  } catch (err) {
    failed = true;
    console.log(`  FAILED: ${err.message}`);
  }
}
process.exitCode = failed ? 1 : 0;
