// -----------------------------------------------------------------------------
// PushoverIntegration: everything the SDK handlers of index.js call.
//
// - applyConfig(): takes the application token, checks it against Pushover
//   (quota endpoint, costs no message) and reports the result as the
//   connection status shown on the configuration screen. Never throws.
// - handleSendMessage(): delivers one Gladys message to one user. Throwing
//   acks the command as failed: Gladys logs the message and moves on to its
//   other channels.
//
// Pushover blocks for a while an IP address that keeps sending invalid
// requests, and every device of the house shares that address. So nothing is
// sent with a token known to be wrong (missing, malformed, or refused once)
// nor with a malformed user key: those fail here, without a request.
// -----------------------------------------------------------------------------

import { logger as defaultLogger } from '@gladysassistant/integration-sdk';
import { PushoverClient, describeError } from './pushover/client.js';
import { invalidDevices, isValidKey, normalizeConfig, normalizeContact } from './config.js';
import { toPushoverMessage } from './message.js';

export const MESSAGES = {
  notConfigured: {
    en: 'Enter the Pushover application token in the integration settings.',
    fr: "Saisissez le jeton d'application Pushover dans les paramètres de l'intégration.",
  },
  invalidToken: {
    en: 'The application token does not look right: it is 30 letters and digits, shown on your application page on pushover.net.',
    fr: "Le jeton d'application n'a pas le bon format : 30 lettres et chiffres, affichés sur la page de votre application sur pushover.net.",
  },
  invalidUserKey: {
    en: 'The Pushover user key in "My account" does not look right: it is 30 letters and digits, shown on the pushover.net home page once logged in.',
    fr: "La clé utilisateur Pushover de « Mon compte » n'a pas le bon format : 30 lettres et chiffres, affichés sur l'accueil de pushover.net une fois connecté.",
  },
};

// Errors about one message or one user: the channel itself still works.
const RECIPIENT_ERRORS = ['invalid_user', 'invalid_request'];

/**
 * Connection status message showing the quota left this month.
 * @param {{limit: unknown, remaining: unknown}} limits - Answer of getLimits().
 * @returns {{en: string, fr: string}|undefined} The message, undefined when the figures are missing.
 */
function quotaMessage({ limit, remaining }) {
  if (!Number.isFinite(limit) || !Number.isFinite(remaining)) {
    return undefined;
  }
  return {
    en: `Connected to Pushover: ${remaining} of ${limit} messages left this month.`,
    fr: `Connecté à Pushover : ${remaining} messages restants sur ${limit} ce mois-ci.`,
  };
}

export class PushoverIntegration {
  /**
   * @param {object} gladys - The SDK instance (GladysIntegration).
   * @param {object} [deps]
   * @param {(options: {token: string}) => PushoverClient} [deps.createClient] - Injectable for tests.
   * @param {{info: Function, warn: Function, debug: Function}} [deps.logger] - Injectable for tests.
   */
  constructor(
    gladys,
    { createClient = (options) => new PushoverClient(options), logger = defaultLogger } = {},
  ) {
    this.gladys = gladys;
    this.createClient = createClient;
    this.logger = logger;
    this.loaded = false;
    this.client = null;
    // {en, fr} reason why nothing can be sent, null when sending is possible.
    this.blocker = MESSAGES.notConfigured;
    // Bumped by every configuration: the outcome of a request made with an
    // older token must not change the state of the new one.
    this.generation = 0;
    this.status = null;
  }

  /**
   * Take a configuration into account: synchronously (so a message arriving
   * meanwhile already uses it), then check the token with Pushover.
   * @param {Record<string, unknown>} rawConfig - Configuration from the SDK.
   * @returns {Promise<void>} Never rejects.
   * @example
   * await integration.applyConfig(gladys.config);
   */
  async applyConfig(rawConfig) {
    const { app_token: token } = normalizeConfig(rawConfig);
    this.loaded = true;
    this.generation += 1;
    const generation = this.generation;
    this.client = null;
    if (token === '') {
      this.blocker = MESSAGES.notConfigured;
    } else if (!isValidKey(token)) {
      this.blocker = MESSAGES.invalidToken;
    } else {
      this.blocker = null;
      this.client = this.createClient({ token });
    }
    if (this.blocker) {
      this.logger.warn(`Pushover cannot be used: ${this.blocker.en}`);
      await this.reportConnection(false, this.blocker);
      return;
    }

    let limits;
    try {
      limits = await this.client.getLimits();
    } catch (err) {
      if (generation === this.generation) {
        this.logger.warn(`Pushover token check failed: ${err.message}`);
        await this.handleChannelError(err);
      }
      return;
    }
    if (generation === this.generation) {
      this.logger.info(`Pushover token valid, ${limits.remaining}/${limits.limit} messages left`);
      await this.reportConnection(true, quotaMessage(limits));
    }
  }

  /**
   * Deliver one Gladys message to the Pushover account of its recipient.
   * @param {Record<string, unknown>} contact - The recipient's "My account" values (contact_schema).
   * @param {{text: string, file: string|null}} gladysMessage - The message.
   * @returns {Promise<void>}
   * @throws {Error} When the message cannot be delivered.
   * @example
   * await integration.handleSendMessage({ user_key: 'uQiRzpo4DXghDmr9QzzfQu27cmVRsG' }, { text: 'Hi', file: null });
   */
  async handleSendMessage(contact, gladysMessage) {
    try {
      await this.deliver(contact, gladysMessage);
    } catch (err) {
      // The failed ack only reaches the Gladys server log: say it here too,
      // in the integration logs the admin can open from Gladys.
      this.logger.warn(`Message not delivered: ${err.message}`);
      throw err;
    }
  }

  /**
   * The body of handleSendMessage.
   * @param {Record<string, unknown>} contact - The recipient's "My account" values.
   * @param {{text: string, file: string|null}} gladysMessage - The message.
   * @returns {Promise<void>}
   */
  async deliver(contact, gladysMessage) {
    if (!this.loaded) {
      // Gladys may relay a message right after the WebSocket authenticates,
      // before the SDK resynchronized the configuration: read it now. Not
      // awaited (it never rejects): the token is in place as soon as the
      // call returns, its check against Pushover runs meanwhile.
      this.applyConfig(await this.gladys.getConfig());
    }
    if (this.blocker) {
      throw new Error(this.blocker.en);
    }
    const { user_key: user, devices } = normalizeContact(contact);
    if (!isValidKey(user)) {
      throw new Error(MESSAGES.invalidUserKey.en);
    }
    const badDevices = invalidDevices(devices);
    if (badDevices.length > 0) {
      throw new Error(
        `Invalid Pushover device name(s) in "My account": ${badDevices.join(', ')} (up to 25 letters, digits, - or _)`,
      );
    }
    const { message, attachment, warnings } = toPushoverMessage(gladysMessage);
    for (const warning of warnings) {
      this.logger.warn(`Message adapted for Pushover: ${warning}`);
    }

    const generation = this.generation;
    let result;
    try {
      result = await this.client.sendMessage({ user, device: devices, message, attachment });
    } catch (err) {
      if (generation === this.generation && !RECIPIENT_ERRORS.includes(err.kind)) {
        await this.handleChannelError(err);
      }
      // Only the message reaches Gladys (the command ack): put both the
      // actionable text and the technical detail in it.
      throw new Error(`${describeError(err).en} [${err.message}]`, { cause: err });
    }
    this.logger.debug(
      `Message sent to Pushover (request ${result.request}, ${result.remaining ?? '?'} left this month)`,
    );
    if (generation === this.generation && this.status?.connected !== true) {
      await this.reportConnection(true);
    }
  }

  /**
   * React to a failure that concerns the whole channel (token, quota,
   * Pushover itself): show it as the connection status, and stop sending
   * with a token Pushover refused.
   * @param {unknown} err - The error.
   * @returns {Promise<void>}
   */
  async handleChannelError(err) {
    const description = describeError(err);
    if (err?.kind === 'invalid_token') {
      this.blocker = description;
    }
    await this.reportConnection(false, description);
  }

  /**
   * Publish the connection status, only when it changes (it is pushed to
   * every open Gladys page). A failure is logged, never thrown: sending a
   * message must not fail because the status could not be shown.
   * @param {boolean} connected - Whether Pushover can be used.
   * @param {{en: string, fr: string}} [message] - Why, shown to the admin.
   * @returns {Promise<void>}
   */
  async reportConnection(connected, message) {
    const status = { connected, message: message ?? null };
    if (
      this.status?.connected === status.connected &&
      this.status?.message?.en === status.message?.en
    ) {
      return;
    }
    try {
      await this.gladys.setConnectionStatus(connected, message);
      this.status = status;
    } catch (err) {
      this.logger.warn(`Unable to publish the connection status: ${err.message}`);
    }
  }
}
