import { test } from 'node:test';
import assert from 'node:assert/strict';
import { MESSAGES, PushoverIntegration } from '../src/integration.js';
import { PushoverError, describeError } from '../src/pushover/client.js';
import { IMAGE_ONLY_TEXT } from '../src/message.js';
import { createFakeGladys } from './helpers/fakeGladys.js';

const TOKEN = 'azGDORePK8gMaC0QOYAMyEEuzJnyUi';
const OTHER_TOKEN = 'bzGDORePK8gMaC0QOYAMyEEuzJnyUi';
const USER = 'uQiRzpo4DXghDmr9QzzfQu27cmVRsG';
const LIMITS = { limit: 10000, remaining: 7496, reset: 1393653600 };
const CONTACT = { user_key: USER };
const TEXT = { text: 'Door opened', file: null };

// A scripted Pushover client: each call takes the next outcome of its list
// (the last one repeats); an Error outcome is thrown.
function scriptedClient({ limits = [LIMITS], sends = [{ request: 'r', remaining: 7495 }] } = {}) {
  const client = { limitsCalls: 0, sent: [] };
  const next = (outcomes, index) => {
    const outcome = outcomes[Math.min(index, outcomes.length - 1)];
    return outcome instanceof Error ? Promise.reject(outcome) : Promise.resolve(outcome);
  };
  client.getLimits = () => next(limits, client.limitsCalls++);
  client.sendMessage = (message) => {
    client.sent.push(message);
    return next(sends, client.sent.length - 1);
  };
  return client;
}

function setup({ clients = [scriptedClient()], config = { app_token: TOKEN } } = {}) {
  const gladys = createFakeGladys({ config });
  const created = [];
  const logs = { info: [], warn: [], debug: [] };
  const integration = new PushoverIntegration(gladys, {
    createClient: (options) => {
      const client = clients[Math.min(created.length, clients.length - 1)];
      created.push({ options, client });
      return client;
    },
    logger: {
      info: (message) => logs.info.push(message),
      warn: (message) => logs.warn.push(message),
      debug: (message) => logs.debug.push(message),
    },
  });
  return { gladys, integration, created, logs, client: clients[0] };
}

const pushoverError = (kind, status = 400) => new PushoverError(kind, `${kind} detail`, { status });

test('without a token, nothing is created and the status asks for one', async () => {
  const { gladys, integration, created } = setup();

  await integration.applyConfig({});

  assert.equal(created.length, 0);
  assert.deepEqual(gladys.calls.connectionStatuses, [
    { connected: false, message: MESSAGES.notConfigured },
  ]);
  await assert.rejects(integration.handleSendMessage(CONTACT, TEXT), {
    message: MESSAGES.notConfigured.en,
  });
});

test('a malformed token is reported without asking Pushover', async () => {
  const { gladys, integration, created } = setup();

  await integration.applyConfig({ app_token: 'not-a-token' });

  assert.equal(created.length, 0);
  assert.deepEqual(gladys.calls.connectionStatuses, [
    { connected: false, message: MESSAGES.invalidToken },
  ]);
});

test('a valid token is checked against Pushover and the quota is shown', async () => {
  const { gladys, integration, created, client } = setup();

  await integration.applyConfig({ app_token: ` ${TOKEN} ` });

  assert.deepEqual(
    created.map(({ options }) => options),
    [{ token: TOKEN }],
  );
  assert.equal(client.limitsCalls, 1);
  assert.deepEqual(gladys.calls.connectionStatuses, [
    {
      connected: true,
      message: {
        en: 'Connected to Pushover: 7496 of 10000 messages left this month.',
        fr: 'Connecté à Pushover : 7496 messages restants sur 10000 ce mois-ci.',
      },
    },
  ]);
});

test('a quota answer without figures still reports the connection, without a message', async () => {
  const { gladys, integration } = setup({ clients: [scriptedClient({ limits: [{}] })] });

  await integration.applyConfig({ app_token: TOKEN });

  assert.deepEqual(gladys.calls.connectionStatuses, [{ connected: true, message: undefined }]);
});

test('a token refused by Pushover blocks every send until the configuration changes', async () => {
  const refused = scriptedClient({ limits: [pushoverError('invalid_token')] });
  const fixed = scriptedClient();
  const { gladys, integration } = setup({ clients: [refused, fixed] });

  await integration.applyConfig({ app_token: TOKEN });
  await assert.rejects(integration.handleSendMessage(CONTACT, TEXT), {
    message: describeError(pushoverError('invalid_token')).en,
  });

  assert.equal(refused.sent.length, 0, 'no request with a refused token');
  assert.deepEqual(gladys.calls.connectionStatuses.at(-1), {
    connected: false,
    message: describeError(pushoverError('invalid_token')),
  });

  await integration.applyConfig({ app_token: OTHER_TOKEN });
  await integration.handleSendMessage(CONTACT, TEXT);
  assert.equal(fixed.sent.length, 1);
});

test('Pushover unreachable at startup does not block sending, and a success restores the status', async () => {
  const client = scriptedClient({ limits: [pushoverError('unreachable', undefined)] });
  const { gladys, integration } = setup({ clients: [client] });

  await integration.applyConfig({ app_token: TOKEN });
  await integration.handleSendMessage(CONTACT, TEXT);

  assert.equal(client.sent.length, 1);
  assert.deepEqual(
    gladys.calls.connectionStatuses.map(({ connected }) => connected),
    [false, true],
  );
});

test('the token check of an older configuration changes nothing once a new one is applied', async () => {
  let releaseOld;
  const old = scriptedClient();
  old.getLimits = () =>
    new Promise((resolve, reject) => {
      releaseOld = () => reject(pushoverError('invalid_token'));
    });
  const current = scriptedClient();
  const { gladys, integration } = setup({ clients: [old, current] });

  const first = integration.applyConfig({ app_token: TOKEN });
  await integration.applyConfig({ app_token: OTHER_TOKEN });
  releaseOld();
  await first;

  assert.deepEqual(
    gladys.calls.connectionStatuses.map(({ connected }) => connected),
    [true],
  );
  await integration.handleSendMessage(CONTACT, TEXT);
  assert.equal(current.sent.length, 1, 'the new token is not blocked');
});

test('a message is sent with the recipient key, the devices and the adapted text', async () => {
  const { integration, client, logs } = setup();
  await integration.applyConfig({ app_token: TOKEN });

  await integration.handleSendMessage(
    { user_key: ` ${USER} `, devices: 'iphone, ipad' },
    { text: '  Door opened  ', file: null },
  );

  assert.deepEqual(client.sent, [
    { user: USER, device: 'iphone,ipad', message: 'Door opened', attachment: undefined },
  ]);
  assert.match(logs.debug.at(-1), /request r, 7495 left/);
  assert.ok(!logs.debug.join().includes(USER), 'the user key is never logged');
});

test('a camera image is attached, and what had to be adapted is logged', async () => {
  const { integration, client, logs } = setup();
  await integration.applyConfig({ app_token: TOKEN });
  const jpeg = Buffer.from([0xff, 0xd8, 0xff]).toString('base64');

  await integration.handleSendMessage(CONTACT, { text: '', file: `image/jpg;base64,${jpeg}` });
  await integration.handleSendMessage(CONTACT, { text: 'x'.repeat(1100), file: 'nope' });

  assert.equal(client.sent[0].message, IMAGE_ONLY_TEXT);
  assert.equal(client.sent[0].attachment.type, 'image/jpeg');
  assert.equal(client.sent[1].attachment, undefined);
  assert.equal(logs.warn.filter((line) => line.startsWith('Message adapted')).length, 2);
});

test('a malformed user key or device name fails without a request', async () => {
  const { integration, client } = setup();
  await integration.applyConfig({ app_token: TOKEN });

  await assert.rejects(integration.handleSendMessage({ user_key: 'abc' }, TEXT), {
    message: MESSAGES.invalidUserKey.en,
  });
  await assert.rejects(integration.handleSendMessage({}, TEXT), {
    message: MESSAGES.invalidUserKey.en,
  });
  await assert.rejects(
    integration.handleSendMessage({ user_key: USER, devices: 'iphone,my phone' }, TEXT),
    /Invalid Pushover device name\(s\) in "My account": my phone/,
  );
  await assert.rejects(integration.handleSendMessage(CONTACT, { text: '', file: null }), {
    message: /Empty message/,
  });
  assert.equal(client.sent.length, 0);
});

test('a refused user key fails the message but leaves the channel status alone', async () => {
  const client = scriptedClient({ sends: [pushoverError('invalid_user')] });
  const { gladys, integration } = setup({ clients: [client] });
  await integration.applyConfig({ app_token: TOKEN });

  await assert.rejects(integration.handleSendMessage(CONTACT, TEXT), (err) => {
    assert.ok(err.message.startsWith(describeError(pushoverError('invalid_user')).en));
    assert.match(err.message, /\[invalid_user detail\]$/);
    assert.equal(err.cause.kind, 'invalid_user');
    return true;
  });
  assert.equal(gladys.calls.connectionStatuses.length, 1, 'still the connected status');
});

test('every undelivered message is logged in the integration logs', async () => {
  const client = scriptedClient({ sends: [pushoverError('invalid_user')] });
  const { integration, logs } = setup({ clients: [client] });
  await integration.applyConfig({ app_token: TOKEN });

  await assert.rejects(integration.handleSendMessage({ user_key: 'abc' }, TEXT));
  await assert.rejects(integration.handleSendMessage(CONTACT, TEXT));

  const failures = logs.warn.filter((line) => line.startsWith('Message not delivered: '));
  assert.equal(failures.length, 2);
  assert.ok(failures[0].endsWith(MESSAGES.invalidUserKey.en));
  assert.ok(failures[1].includes(describeError(pushoverError('invalid_user')).en));
});

test('a quota or token refusal while sending is shown as the connection status', async () => {
  const client = scriptedClient({
    sends: [pushoverError('quota', 429), pushoverError('invalid_token')],
  });
  const { gladys, integration } = setup({ clients: [client] });
  await integration.applyConfig({ app_token: TOKEN });

  await assert.rejects(integration.handleSendMessage(CONTACT, TEXT));
  assert.deepEqual(gladys.calls.connectionStatuses.at(-1), {
    connected: false,
    message: describeError(pushoverError('quota', 429)),
  });

  await assert.rejects(integration.handleSendMessage(CONTACT, TEXT));
  await assert.rejects(integration.handleSendMessage(CONTACT, TEXT));
  assert.equal(client.sent.length, 2, 'blocked after the token refusal');
});

test('a message arriving before the configuration was applied reads it first', async () => {
  const { gladys, integration, client } = setup();

  await integration.handleSendMessage(CONTACT, TEXT);

  assert.equal(gladys.calls.getConfig, 1);
  assert.equal(client.sent.length, 1);
  await integration.handleSendMessage(CONTACT, TEXT);
  assert.equal(gladys.calls.getConfig, 1, 'only once');
});

test('the connection status is published only when it changes, and its failures are not fatal', async () => {
  const { gladys, integration, logs } = setup();

  await integration.applyConfig({ app_token: TOKEN });
  await integration.applyConfig({ app_token: TOKEN });
  assert.equal(gladys.calls.connectionStatuses.length, 1);

  gladys.failNext('setConnectionStatus');
  await integration.applyConfig({});
  assert.equal(gladys.calls.connectionStatuses.length, 1);
  assert.match(logs.warn.at(-1), /Unable to publish the connection status/);

  // Not recorded as published: the next report retries it.
  await integration.applyConfig({});
  assert.equal(gladys.calls.connectionStatuses.length, 2);
});
