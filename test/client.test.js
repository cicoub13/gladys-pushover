import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  API_BASE_URL,
  PushoverClient,
  PushoverError,
  describeError,
} from '../src/pushover/client.js';

const TOKEN = 'azGDORePK8gMaC0QOYAMyEEuzJnyUi';
const USER = 'uQiRzpo4DXghDmr9QzzfQu27cmVRsG';

// Records every request and answers with `respond(url, init)`.
function fakeFetch(respond) {
  const fetchImpl = async (url, init) => {
    fetchImpl.requests.push({ url, ...init });
    return respond(url, init);
  };
  fetchImpl.requests = [];
  return fetchImpl;
}

const json = (status, body, headers = {}) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', ...headers },
  });

const newClient = (respond, options = {}) => {
  const fetchImpl = fakeFetch(respond);
  return { client: new PushoverClient({ token: TOKEN, fetchImpl, ...options }), fetchImpl };
};

const failure = async (promise) => {
  try {
    await promise;
  } catch (err) {
    return err;
  }
  assert.fail('the promise resolved');
};

test('sendMessage posts the token, recipient and text to the messages endpoint', async () => {
  const { client, fetchImpl } = newClient(() =>
    json(200, { status: 1, request: 'req-1' }, { 'X-Limit-App-Remaining': '7496' }),
  );

  const result = await client.sendMessage({ user: USER, device: 'iphone,ipad', message: 'Hello' });

  assert.deepEqual(result, { request: 'req-1', remaining: 7496 });
  const [request] = fetchImpl.requests;
  assert.equal(request.url, `${API_BASE_URL}/messages.json`);
  assert.equal(request.method, 'POST');
  assert.equal(request.body.get('token'), TOKEN);
  assert.equal(request.body.get('user'), USER);
  assert.equal(request.body.get('message'), 'Hello');
  assert.equal(request.body.get('device'), 'iphone,ipad');
  assert.equal(request.body.get('attachment'), null);
  assert.ok(request.signal instanceof AbortSignal);
});

test('sendMessage leaves the device out when it is empty, so every device gets it', async () => {
  const { client, fetchImpl } = newClient(() => json(200, { status: 1, request: 'req-2' }));

  const result = await client.sendMessage({ user: USER, device: '', message: 'Hello' });

  assert.equal(fetchImpl.requests[0].body.has('device'), false);
  assert.equal(result.remaining, null, 'no quota header');
});

test('sendMessage uploads the attachment as a binary image file', async () => {
  const { client, fetchImpl } = newClient(() => json(200, { status: 1, request: 'req-3' }));
  const data = Buffer.from([0xff, 0xd8, 0xff]);

  await client.sendMessage({
    user: USER,
    message: 'Doorbell',
    attachment: { data, type: 'image/jpeg' },
  });

  const file = fetchImpl.requests[0].body.get('attachment');
  assert.equal(file.type, 'image/jpeg');
  assert.equal(file.name, 'image.jpeg');
  assert.deepEqual(Buffer.from(await file.arrayBuffer()), data);
});

test('getLimits reads the monthly quota, the token in the query string', async () => {
  const { client, fetchImpl } = newClient(() =>
    json(200, { status: 1, limit: 10000, remaining: 7496, reset: 1393653600, request: 'r' }),
  );

  assert.deepEqual(await client.getLimits(), { limit: 10000, remaining: 7496, reset: 1393653600 });
  const url = new URL(fetchImpl.requests[0].url);
  assert.equal(`${url.origin}${url.pathname}`, `${API_BASE_URL}/apps/limits.json`);
  assert.equal(url.searchParams.get('token'), TOKEN);
  assert.equal(fetchImpl.requests[0].method, 'GET');
});

test('a refused token is an invalid_token error, with Pushover errors and no key', async () => {
  const { client } = newClient(() =>
    json(400, {
      token: 'invalid',
      errors: [`application token ${TOKEN} is invalid`],
      status: 0,
      request: 'r',
    }),
  );

  const err = await failure(client.getLimits());

  assert.ok(err instanceof PushoverError);
  assert.equal(err.kind, 'invalid_token');
  assert.equal(err.status, 400);
  assert.deepEqual(err.errors, ['application token *** is invalid']);
  assert.ok(!JSON.stringify({ ...err, message: err.message }).includes(TOKEN));
});

test('a refused user key is an invalid_user error, and the key is scrubbed too', async () => {
  const { client } = newClient(() =>
    json(400, { user: 'invalid', errors: [`user ${USER} is not valid`], status: 0, request: 'r' }),
  );

  const err = await failure(client.sendMessage({ user: USER, message: 'Hello' }));

  assert.equal(err.kind, 'invalid_user');
  assert.match(err.message, /user key refused: user \*\*\* is not valid/);
  assert.ok(!err.message.includes(USER));
});

test('another refused parameter is an invalid_request error carrying the reasons', async () => {
  const { client } = newClient(() =>
    json(400, { message: 'invalid', errors: ['message cannot be blank'], status: 0 }),
  );

  const err = await failure(client.sendMessage({ user: USER, message: '' }));

  assert.equal(err.kind, 'invalid_request');
  assert.deepEqual(err.errors, ['message cannot be blank']);
});

test('HTTP 429 is the monthly quota', async () => {
  const { client } = newClient(() => json(429, { status: 0, errors: ['quota exceeded'] }));

  const err = await failure(client.sendMessage({ user: USER, message: 'Hello' }));

  assert.equal(err.kind, 'quota');
  assert.equal(err.status, 429);
});

test('a server error page is a server error, whatever its body', async () => {
  const { client } = newClient(() => new Response('<h1>Bad gateway</h1>', { status: 502 }));

  const err = await failure(client.sendMessage({ user: USER, message: 'Hello' }));

  assert.equal(err.kind, 'server');
  assert.equal(err.status, 502);
});

test('a 2xx answer that is not Pushover JSON is an invalid_response', async () => {
  for (const response of [
    () => new Response('<html>Captive portal</html>', { status: 200 }),
    () => json(200, { status: 0 }),
  ]) {
    const { client } = newClient(response);
    const err = await failure(client.getLimits());
    assert.equal(err.kind, 'invalid_response');
  }
});

test('a network failure is unreachable, keeping only the system error code', async () => {
  const { client } = newClient(() => {
    throw new TypeError('fetch failed', {
      cause: Object.assign(new Error(`getaddrinfo ENOTFOUND ${TOKEN}`), { code: 'ENOTFOUND' }),
    });
  });

  const err = await failure(client.getLimits());

  assert.equal(err.kind, 'unreachable');
  assert.equal(err.code, 'ENOTFOUND');
  assert.equal(err.cause, undefined, 'the original error is not chained');
  assert.ok(!err.message.includes(TOKEN));
});

test('a network failure without a code is still unreachable', async () => {
  const { client } = newClient(() => {
    throw new Error('socket hang up');
  });

  const err = await failure(client.getLimits());

  assert.equal(err.kind, 'unreachable');
  assert.equal(err.code, undefined);
});

test('a request slower than the timeout is aborted as a timeout', async () => {
  const { client } = newClient(
    (url, init) =>
      new Promise((resolve, reject) => {
        // AbortSignal.timeout's timer does not keep the process alive.
        const keepAlive = setTimeout(() => {}, 5000);
        init.signal.addEventListener('abort', () => {
          clearTimeout(keepAlive);
          reject(init.signal.reason);
        });
      }),
    { timeoutMs: 10 },
  );

  const err = await failure(client.sendMessage({ user: USER, message: 'Hello' }));

  assert.equal(err.kind, 'timeout');
});

test('describeError has an English and a French message for every kind', () => {
  const kinds = [
    'invalid_token',
    'invalid_user',
    'invalid_request',
    'quota',
    'timeout',
    'server',
    'invalid_response',
    'unreachable',
  ];
  const texts = new Set();
  for (const kind of kinds) {
    const description = describeError(new PushoverError(kind, 'x', { status: 400 }));
    assert.ok(description.en && description.fr, kind);
    texts.add(description.en);
  }
  assert.equal(texts.size, kinds.length, 'one distinct message per kind');
  assert.match(describeError(new Error('boom')).en, /Unexpected error/);
});

test('describeError quotes the reasons Pushover gave for a refused message', () => {
  const err = new PushoverError('invalid_request', 'x', {
    status: 400,
    errors: ['message cannot be blank'],
  });
  assert.equal(describeError(err).en, 'Pushover refused the message (message cannot be blank).');
  assert.equal(
    describeError(new PushoverError('invalid_request', 'x', { status: 413, errors: [] })).fr,
    'Pushover a refusé le message (HTTP 413).',
  );
});
