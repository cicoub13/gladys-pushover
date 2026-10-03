// -----------------------------------------------------------------------------
// The two forms the user fills in Gladys:
//   - the integration configuration (`config_schema`, admin): the application
//     token;
//   - "My account" (`contact_schema`, each user): the user key and optional
//     device names, handed back by Gladys with every message to that user.
//
// This module trims the values and checks their format locally: a malformed
// key never reaches Pushover, whose API blocks for a while an IP address that
// sends too many invalid requests (the whole house shares that address).
// -----------------------------------------------------------------------------

// Application tokens, user keys and group keys: 30 characters, case-sensitive.
const KEY_PATTERN = /^[A-Za-z0-9]{30}$/;
// Pushover device names: up to 25 characters.
const DEVICE_PATTERN = /^[A-Za-z0-9_-]{1,25}$/;

/**
 * Whether a value has the format of a Pushover token or user/group key.
 * @param {string} value - A trimmed token or key.
 * @returns {boolean} True when it is 30 letters and digits.
 * @example
 * isValidKey('azGDORePK8gMaC0QOYAMyEEuzJnyUi'); // true
 */
export function isValidKey(value) {
  return KEY_PATTERN.test(value);
}

const trimmed = (value) => (typeof value === 'string' ? value.trim() : '');

/**
 * Normalize the integration configuration.
 * @param {Record<string, unknown>} [raw] - Configuration returned by the SDK.
 * @returns {{app_token: string}} The trimmed configuration.
 * @example
 * normalizeConfig({ app_token: ' azGDORePK8gMaC0QOYAMyEEuzJnyUi ' });
 */
export function normalizeConfig(raw) {
  // `= {}` would not cover an explicit null, which getConfig() can return.
  const source = raw ?? {};
  return { app_token: trimmed(source.app_token) };
}

/**
 * Normalize the "My account" values of the recipient of a message: trimmed
 * key, device names joined without spaces (`iphone, ipad` -> `iphone,ipad`).
 * @param {Record<string, unknown>} [raw] - The `contact` handed to onSendMessage.
 * @returns {{user_key: string, devices: string}} The normalized values.
 * @example
 * normalizeContact({ user_key: 'uQiRzpo4DXghDmr9QzzfQu27cmVRsG', devices: 'iphone, ipad' });
 */
export function normalizeContact(raw) {
  const source = raw ?? {};
  const devices = trimmed(source.devices)
    .split(',')
    .map((device) => device.trim())
    .filter((device) => device !== '')
    .join(',');
  return { user_key: trimmed(source.user_key), devices };
}

/**
 * The device names that do not have the Pushover format.
 * @param {string} devices - Normalized comma-separated device names.
 * @returns {string[]} The invalid names, empty when all are valid.
 * @example
 * invalidDevices('iphone,my phone'); // ['my phone']
 */
export function invalidDevices(devices) {
  if (devices === '') {
    return [];
  }
  return devices.split(',').filter((device) => !DEVICE_PATTERN.test(device));
}
