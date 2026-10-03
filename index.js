// -----------------------------------------------------------------------------
// Entry point of the Pushover external integration for Gladys Assistant.
//
// This file only WIRES the SDK to PushoverIntegration (src/integration.js); it
// holds no logic. It:
//   1. instantiates the SDK (connection, auth, reconnection: handled for us);
//   2. registers every handler BEFORE connect();
//   3. applies the configuration on every connection.
//
// Environment variables provided by the Gladys supervisor:
//   - GLADYS_HOST_API_URL         (host API URL)
//   - GLADYS_INTEGRATION_TOKEN    (integration-scoped JWT)
//   - GLADYS_INTEGRATION_SELECTOR (integration identifier)
// `new GladysIntegration()` reads them automatically.
// -----------------------------------------------------------------------------

import { GladysIntegration, logger } from '@gladysassistant/integration-sdk';
import { PushoverIntegration } from './src/integration.js';
import { exitOnUnhandledRejection } from './src/lifecycle.js';

// Safety net: a rejection nobody handles is a bug. Log it where the user can
// see it, then exit so the Gladys supervisor restarts from a clean state.
exitOnUnhandledRejection({ logger });

const gladys = new GladysIntegration();
const integration = new PushoverIntegration(gladys);

// --- Messages ----------------------------------------------------------------
// Send-only channel (manifest `messaging.receive: false`): `contact` holds the
// recipient's "My account" values (contact_schema), `message` is
// `{ text, file }`. Gladys never calls this for a user without a user key.
gladys.onSendMessage((contact, message) => integration.handleSendMessage(contact, message));

// --- Configuration screen ----------------------------------------------------
gladys.onConfigUpdated(async (newConfig) => {
  logger.info('onConfigUpdated -> new configuration received');
  await integration.applyConfig(newConfig);
});

// --- Connection lifecycle ----------------------------------------------------
// The SDK emits `connected` once it has resynchronized the configuration from
// the host API (retrying until it can), so `gladys.config` is fresh here.
// applyConfig never rejects: Pushover errors become the connection status.
gladys.on('connected', () => integration.applyConfig(gladys.config));

// --- Graceful shutdown -------------------------------------------------------
gladys.handleShutdown();

// --- Startup -----------------------------------------------------------------
logger.info('Starting the Pushover integration...');
// connect() only rejects when Gladys refuses the token on the first attempt;
// the SDK keeps reconnecting afterwards (the refusal can be transient, e.g.
// Gladys still booting), so stay alive instead of exiting.
gladys.connect().catch((err) => {
  logger.error('Initial connection failed, the SDK keeps retrying', err);
});
