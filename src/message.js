// -----------------------------------------------------------------------------
// Gladys message -> Pushover message.
//
// Gladys hands `{ text, file }` to onSendMessage: `file` is null, or an image
// as `image/jpg;base64,<data>` (a camera capture of the "Send a camera image"
// scene action), sometimes with a `data:` prefix. Pushover takes up to 1024
// characters of text and one image of at most 5 MB. A message that does not
// fit is adapted (text shortened, attachment dropped) rather than lost: the
// notification is what matters. Pure functions, no I/O.
// -----------------------------------------------------------------------------

export const MAX_TEXT_LENGTH = 1024;
export const MAX_ATTACHMENT_BYTES = 5 * 1024 * 1024;
// Pushover refuses a blank message: an image sent without text gets this one.
export const IMAGE_ONLY_TEXT = '📷';

const DATA_URL = /^(?:data:)?(image\/[a-z0-9.+-]+);base64,([A-Za-z0-9+/=\s]+)$/i;

/**
 * Shorten a text to `max` characters, ending with an ellipsis when cut.
 * Counts Unicode characters (an emoji is one), like Pushover.
 * @param {string} text - The text.
 * @param {number} [max] - Maximum number of characters.
 * @returns {string} The text, at most `max` characters long.
 * @example
 * truncateText('a'.repeat(2000)).length; // 1024
 */
export function truncateText(text, max = MAX_TEXT_LENGTH) {
  const characters = Array.from(text);
  if (characters.length <= max) {
    return text;
  }
  return `${characters.slice(0, max - 1).join('')}…`;
}

/**
 * Decode the image attached to a Gladys message.
 * @param {unknown} file - `message.file`.
 * @returns {{attachment?: {data: Buffer, type: string}, warning?: string}} The image, or why it is left out.
 * @example
 * parseAttachment('image/jpg;base64,/9j/4AAQ...'); // { attachment: { data, type: 'image/jpeg' } }
 */
export function parseAttachment(file) {
  if (file === null || file === undefined || file === '') {
    return {};
  }
  const match = typeof file === 'string' ? DATA_URL.exec(file) : null;
  if (!match) {
    return { warning: 'the attached file is not a base64 image, sending the text only' };
  }
  const data = Buffer.from(match[2], 'base64');
  if (data.length === 0) {
    return { warning: 'the attached image is empty, sending the text only' };
  }
  if (data.length > MAX_ATTACHMENT_BYTES) {
    return {
      warning: `the attached image is ${data.length} bytes, over the ${MAX_ATTACHMENT_BYTES} bytes Pushover accepts, sending the text only`,
    };
  }
  // `image/jpg` is what Gladys cameras produce, but it is not a MIME type.
  const type = match[1].toLowerCase() === 'image/jpg' ? 'image/jpeg' : match[1].toLowerCase();
  return { attachment: { data, type } };
}

/**
 * Build the Pushover message for a Gladys message.
 * @param {{text?: unknown, file?: unknown}} [gladysMessage] - The `message` handed to onSendMessage.
 * @returns {{message: string, attachment?: {data: Buffer, type: string}, warnings: string[]}} What to send, and what was adapted.
 * @throws {Error} When there is neither text nor image to send.
 * @example
 * toPushoverMessage({ text: 'Motion in the garden', file: null });
 */
export function toPushoverMessage(gladysMessage) {
  const { text, file } = gladysMessage ?? {};
  const { attachment, warning } = parseAttachment(file);
  const warnings = warning ? [warning] : [];
  const body = typeof text === 'string' ? text.trim() : '';
  if (body === '' && !attachment) {
    throw new Error('Empty message: no text and no image to send to Pushover');
  }
  if (Array.from(body).length > MAX_TEXT_LENGTH) {
    warnings.push(`the text is longer than ${MAX_TEXT_LENGTH} characters, it is shortened`);
  }
  const result = { message: body === '' ? IMAGE_ONLY_TEXT : truncateText(body), warnings };
  if (attachment) {
    result.attachment = attachment;
  }
  return result;
}
