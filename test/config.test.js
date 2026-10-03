import { test } from 'node:test';
import assert from 'node:assert/strict';
import { invalidDevices, isValidKey, normalizeConfig, normalizeContact } from '../src/config.js';

const TOKEN = 'azGDORePK8gMaC0QOYAMyEEuzJnyUi';

test('normalizeConfig trims the token and tolerates a missing configuration', () => {
  assert.deepEqual(normalizeConfig({ app_token: ` ${TOKEN}\n` }), { app_token: TOKEN });
  assert.deepEqual(normalizeConfig(null), { app_token: '' });
  assert.deepEqual(normalizeConfig(undefined), { app_token: '' });
  assert.deepEqual(normalizeConfig({ app_token: 42 }), { app_token: '' });
});

test('isValidKey accepts exactly 30 letters and digits', () => {
  assert.equal(isValidKey(TOKEN), true);
  assert.equal(isValidKey('uQiRzpo4DXghDmr9QzzfQu27cmVRsG'), true);
  assert.equal(isValidKey(TOKEN.slice(1)), false, '29 characters');
  assert.equal(isValidKey(`${TOKEN}a`), false, '31 characters');
  assert.equal(isValidKey('azGDORePK8gMaC0QOYAMyEEuzJnyU-'), false, 'a dash');
  assert.equal(isValidKey(''), false);
});

test('normalizeContact trims the key and joins the device names without spaces', () => {
  assert.deepEqual(
    normalizeContact({
      user_key: ' uQiRzpo4DXghDmr9QzzfQu27cmVRsG ',
      devices: ' iphone , ipad,, ',
    }),
    { user_key: 'uQiRzpo4DXghDmr9QzzfQu27cmVRsG', devices: 'iphone,ipad' },
  );
});

test('normalizeContact tolerates missing or mistyped values', () => {
  assert.deepEqual(normalizeContact(null), { user_key: '', devices: '' });
  assert.deepEqual(normalizeContact({ user_key: 12, devices: ['iphone'] }), {
    user_key: '',
    devices: '',
  });
});

test('invalidDevices lists the names Pushover would not accept', () => {
  assert.deepEqual(invalidDevices(''), []);
  assert.deepEqual(invalidDevices('iphone,pixel_8-pro'), []);
  assert.deepEqual(invalidDevices('iphone,my phone,a'.concat('b'.repeat(25))), [
    'my phone',
    `a${'b'.repeat(25)}`,
  ]);
});
