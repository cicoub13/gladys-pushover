// -----------------------------------------------------------------------------
// Minimal Pushover API client (https://pushover.net/api): send a message, read
// the monthly quota of the application token.
//
// Every failure is thrown as a PushoverError whose `kind` tells what went
// wrong, so callers can turn it into an actionable message with
// describeError(). The application token is kept in a private field, and the
// token and user key are scrubbed from anything Pushover sends back: the
// client object and its errors can be logged safely. `fetchImpl` is
// injectable so unit tests never touch the real network.
// -----------------------------------------------------------------------------

export const API_BASE_URL = 'https://api.pushover.net/1';

// Gladys gives up on a message.send command after 5 s (COMMAND_TIMEOUT_MS in
// the core): answer before that, with our own error rather than its timeout.
export const DEFAULT_TIMEOUT_MS = 4 * 1000;

/**
 * Error of a Pushover request.
 * `kind`: 'unreachable' | 'timeout' | 'invalid_token' | 'invalid_user' |
 * 'invalid_request' | 'quota' | 'server' | 'invalid_response'.
 */
export class PushoverError extends Error {
  /**
   * @param {string} kind - Failure category.
   * @param {string} message - Technical message (never contains a key).
   * @param {{status?: number, code?: string, errors?: string[]}} [details] - HTTP status, system error code, Pushover's error list.
   */
  constructor(kind, message, { status, code, errors } = {}) {
    super(message);
    this.name = 'PushoverError';
    this.kind = kind;
    if (status !== undefined) {
      this.status = status;
    }
    if (code !== undefined) {
      this.code = code;
    }
    if (errors !== undefined) {
      this.errors = errors;
    }
  }
}

/**
 * Convert a rejection of fetch (or of the body read) into a PushoverError.
 * Only the system error code is kept: the original error is dropped rather
 * than chained, so nothing from the request can leak through it.
 * @param {unknown} err - What fetch threw.
 * @param {string} label - `METHOD /path` of the request.
 * @returns {PushoverError} The normalized error.
 */
function networkError(err, label) {
  if (err?.name === 'TimeoutError' || err?.name === 'AbortError') {
    return new PushoverError('timeout', `${label}: Pushover did not answer in time`);
  }
  // undici wraps the system error: TypeError('fetch failed', { cause }).
  const code = err?.cause?.code ?? err?.code;
  const suffix = typeof code === 'string' ? ` (${code})` : '';
  return new PushoverError('unreachable', `${label}: Pushover is unreachable${suffix}`, {
    code: typeof code === 'string' ? code : undefined,
  });
}

/**
 * Turn a non-2xx (or `status != 1`) answer into a PushoverError. A 4xx body
 * flags each invalid parameter (`{"token": "invalid", "errors": [...]}`).
 * @param {string} label - `METHOD /path` of the request.
 * @param {number} status - HTTP status.
 * @param {any} body - Parsed JSON body, or null.
 * @param {(text: string) => string} redact - Removes the keys from a text.
 * @returns {PushoverError} The normalized error.
 */
function apiError(label, status, body, redact) {
  const errors = Array.isArray(body?.errors)
    ? body.errors.filter((error) => typeof error === 'string').map(redact)
    : [];
  const detail = errors.length > 0 ? `: ${errors.join('; ')}` : '';
  const details = { status, errors };
  if (status === 429) {
    return new PushoverError('quota', `${label}: monthly message limit reached${detail}`, details);
  }
  if (status >= 500 || status < 400) {
    return new PushoverError('server', `${label}: HTTP ${status}${detail}`, details);
  }
  if (body?.token === 'invalid') {
    return new PushoverError(
      'invalid_token',
      `${label}: application token refused${detail}`,
      details,
    );
  }
  if (body?.user === 'invalid') {
    return new PushoverError('invalid_user', `${label}: user key refused${detail}`, details);
  }
  return new PushoverError(
    'invalid_request',
    `${label}: request refused (HTTP ${status})${detail}`,
    details,
  );
}

export class PushoverClient {
  #token;

  /**
   * @param {object} options
   * @param {string} options.token - Application API token.
   * @param {typeof fetch} [options.fetchImpl] - Injectable for tests.
   * @param {number} [options.timeoutMs] - Deadline of one request (headers AND body).
   * @param {string} [options.baseUrl] - API root, for tests.
   */
  constructor({
    token,
    fetchImpl = globalThis.fetch,
    timeoutMs = DEFAULT_TIMEOUT_MS,
    baseUrl = API_BASE_URL,
  }) {
    this.#token = token;
    this.fetchImpl = fetchImpl;
    this.timeoutMs = timeoutMs;
    this.baseUrl = baseUrl;
  }

  /**
   * Send one request and return its parsed JSON body.
   * @param {string} method - HTTP method.
   * @param {string} path - Path under the API root, e.g. '/messages.json'.
   * @param {object} options
   * @param {URLSearchParams} [options.query] - Query string (the token goes here for a GET).
   * @param {FormData} [options.body] - Form body (the token goes here for a POST).
   * @param {string[]} [options.secrets] - Values to scrub from the answer, besides the token.
   * @returns {Promise<{body: any, headers: Headers}>} The answer of a successful request.
   */
  async request(method, path, { query, body, secrets = [] }) {
    const label = `${method} ${path}`;
    const keys = [this.#token, ...secrets].filter(Boolean);
    const redact = (text) => keys.reduce((result, key) => result.replaceAll(key, '***'), text);
    const url = query ? `${this.baseUrl}${path}?${query}` : `${this.baseUrl}${path}`;

    let response;
    let text;
    try {
      // The same signal also aborts the body read below.
      response = await this.fetchImpl(url, {
        method,
        headers: { Accept: 'application/json' },
        body,
        signal: AbortSignal.timeout(this.timeoutMs),
      });
      text = await response.text();
    } catch (err) {
      throw networkError(err, label);
    }

    let parsed = null;
    try {
      parsed = JSON.parse(text);
    } catch {
      // Handled below: an error page is classified by its status alone.
    }
    if (!response.ok || parsed?.status !== 1) {
      if (response.ok) {
        // 2xx without `"status": 1`: a captive portal or a proxy page, not Pushover.
        throw new PushoverError('invalid_response', `${label}: unexpected answer`, {
          status: response.status,
        });
      }
      throw apiError(label, response.status, parsed, redact);
    }
    return { body: parsed, headers: response.headers };
  }

  /**
   * Monthly message quota of the account owning the token. Costs no message:
   * the cheapest way to check that the token is valid.
   * @returns {Promise<{limit: number, remaining: number, reset: number}>} The quota (`reset`: Unix time).
   * @example
   * const { remaining } = await client.getLimits();
   */
  async getLimits() {
    const query = new URLSearchParams({ token: this.#token });
    const { body } = await this.request('GET', '/apps/limits.json', { query });
    return { limit: body.limit, remaining: body.remaining, reset: body.reset };
  }

  /**
   * Push one message.
   * @param {object} message
   * @param {string} message.user - User (or group) key of the recipient.
   * @param {string} [message.device] - Comma-separated device names; all devices when empty.
   * @param {string} message.message - Text, at most 1024 characters.
   * @param {{data: Buffer, type: string}} [message.attachment] - Image to attach.
   * @returns {Promise<{request: string, remaining: number|null}>} Pushover's request id and the messages left this month.
   * @example
   * await client.sendMessage({ user: 'uQiRzpo4DXghDmr9QzzfQu27cmVRsG', message: 'Door opened' });
   */
  async sendMessage({ user, device, message, attachment }) {
    const form = new FormData();
    form.append('token', this.#token);
    form.append('user', user);
    form.append('message', message);
    if (device) {
      form.append('device', device);
    }
    if (attachment) {
      const extension = attachment.type.split('/')[1];
      form.append(
        'attachment',
        new Blob([attachment.data], { type: attachment.type }),
        `image.${extension}`,
      );
    }
    const { body, headers } = await this.request('POST', '/messages.json', {
      body: form,
      secrets: [user],
    });
    const remaining = Number.parseInt(headers.get('x-limit-app-remaining'), 10);
    return { request: body.request, remaining: Number.isNaN(remaining) ? null : remaining };
  }
}

/**
 * User-facing, actionable message for any error (PushoverError or not).
 * @param {unknown} err - The error to describe.
 * @returns {{en: string, fr: string}} The message.
 * @example
 * describeError(new PushoverError('invalid_token', '...', { status: 400 }));
 */
export function describeError(err) {
  if (!(err instanceof PushoverError)) {
    return {
      en: 'Unexpected error while talking to Pushover. Check the integration logs.',
      fr: "Erreur inattendue en communiquant avec Pushover. Consultez les journaux de l'intégration.",
    };
  }
  switch (err.kind) {
    case 'invalid_token':
      return {
        en: 'Pushover refused the application token. Check it in the integration settings.',
        fr: "Pushover a refusé le jeton d'application. Vérifiez-le dans les paramètres de l'intégration.",
      };
    case 'invalid_user':
      return {
        en: 'Pushover refused the user key, or the account has no active device. Check the key in "My account".',
        fr: "Pushover a refusé la clé utilisateur, ou le compte n'a aucun appareil actif. Vérifiez la clé dans « Mon compte ».",
      };
    case 'invalid_request':
      return {
        en: `Pushover refused the message (${err.errors?.join('; ') || `HTTP ${err.status}`}).`,
        fr: `Pushover a refusé le message (${err.errors?.join(' ; ') || `HTTP ${err.status}`}).`,
      };
    case 'quota':
      return {
        en: 'The monthly Pushover message limit is reached. It resets on the 1st of the month.',
        fr: 'La limite mensuelle de messages Pushover est atteinte. Elle est remise à zéro le 1er du mois.',
      };
    case 'timeout':
      return {
        en: 'Pushover did not answer in time. Try again later.',
        fr: "Pushover n'a pas répondu à temps. Réessayez plus tard.",
      };
    case 'server':
      return {
        en: `Pushover is having trouble (HTTP ${err.status}). Try again later.`,
        fr: `Pushover rencontre des difficultés (HTTP ${err.status}). Réessayez plus tard.`,
      };
    case 'invalid_response':
      return {
        en: 'Unexpected answer instead of Pushover: check the Internet access of the Gladys machine (proxy, captive portal).',
        fr: "Réponse inattendue à la place de Pushover : vérifiez l'accès à Internet de la machine Gladys (proxy, portail captif).",
      };
    default:
      return {
        en: 'Pushover cannot be reached. Check the Internet access of the Gladys machine.',
        fr: "Pushover est injoignable. Vérifiez l'accès à Internet de la machine Gladys.",
      };
  }
}
