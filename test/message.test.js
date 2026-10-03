import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  IMAGE_ONLY_TEXT,
  MAX_ATTACHMENT_BYTES,
  MAX_TEXT_LENGTH,
  parseAttachment,
  toPushoverMessage,
  truncateText,
} from '../src/message.js';

// The first bytes of a JPEG, as a Gladys camera capture starts.
const JPEG = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10]);
const GLADYS_CAMERA_IMAGE = `image/jpg;base64,${JPEG.toString('base64')}`;

test('truncateText keeps a short text as is', () => {
  assert.equal(truncateText('Motion in the garden'), 'Motion in the garden');
  assert.equal(truncateText('a'.repeat(MAX_TEXT_LENGTH)), 'a'.repeat(MAX_TEXT_LENGTH));
});

test('truncateText cuts a long text to the Pushover limit, ending with an ellipsis', () => {
  const result = truncateText('a'.repeat(MAX_TEXT_LENGTH + 10));
  assert.equal(Array.from(result).length, MAX_TEXT_LENGTH);
  assert.ok(result.endsWith('a…'));
});

test('truncateText counts an emoji as one character and never splits it', () => {
  const result = truncateText('🔥'.repeat(MAX_TEXT_LENGTH + 1));
  assert.equal(Array.from(result).length, MAX_TEXT_LENGTH);
  assert.equal(result, `${'🔥'.repeat(MAX_TEXT_LENGTH - 1)}…`);
});

test('parseAttachment returns nothing when there is no file', () => {
  assert.deepEqual(parseAttachment(null), {});
  assert.deepEqual(parseAttachment(undefined), {});
  assert.deepEqual(parseAttachment(''), {});
});

test('parseAttachment decodes a Gladys camera image and fixes its MIME type', () => {
  const { attachment, warning } = parseAttachment(GLADYS_CAMERA_IMAGE);
  assert.equal(warning, undefined);
  assert.equal(attachment.type, 'image/jpeg');
  assert.deepEqual(attachment.data, JPEG);
});

test('parseAttachment accepts a data URL of another image type', () => {
  const { attachment } = parseAttachment(`data:image/PNG;base64,${JPEG.toString('base64')}`);
  assert.equal(attachment.type, 'image/png');
});

test('parseAttachment leaves out what is not a usable image, with a warning', () => {
  for (const file of [
    'not an image',
    'application/pdf;base64,JVBERi0=',
    { data: 'x' },
    'image/jpg;base64,',
    'image/jpg;base64,====',
  ]) {
    const { attachment, warning } = parseAttachment(file);
    assert.equal(attachment, undefined, JSON.stringify(file));
    assert.match(warning, /text only/);
  }
});

test('parseAttachment leaves out an image over the Pushover size limit', () => {
  const big = Buffer.alloc(MAX_ATTACHMENT_BYTES + 1).toString('base64');
  const { attachment, warning } = parseAttachment(`image/jpg;base64,${big}`);
  assert.equal(attachment, undefined);
  assert.match(warning, /over the 5242880 bytes/);
});

test('toPushoverMessage sends the trimmed text alone when there is no image', () => {
  assert.deepEqual(toPushoverMessage({ text: '  Door opened\n', file: null }), {
    message: 'Door opened',
    warnings: [],
  });
});

test('toPushoverMessage attaches the camera image to the text', () => {
  const result = toPushoverMessage({ text: 'Someone at the door', file: GLADYS_CAMERA_IMAGE });
  assert.equal(result.message, 'Someone at the door');
  assert.equal(result.attachment.type, 'image/jpeg');
  assert.deepEqual(result.warnings, []);
});

test('toPushoverMessage gives an image without text a placeholder text', () => {
  const result = toPushoverMessage({ text: ' ', file: GLADYS_CAMERA_IMAGE });
  assert.equal(result.message, IMAGE_ONLY_TEXT);
  assert.ok(result.attachment);
});

test('toPushoverMessage refuses a message with nothing to send', () => {
  assert.throws(() => toPushoverMessage({ text: '', file: null }), /Empty message/);
  assert.throws(() => toPushoverMessage({ text: '  ', file: 'not an image' }), /Empty message/);
  assert.throws(() => toPushoverMessage(undefined), /Empty message/);
});

test('toPushoverMessage reports what it adapted', () => {
  const result = toPushoverMessage({ text: 'x'.repeat(2000), file: 'not an image' });
  assert.equal(Array.from(result.message).length, MAX_TEXT_LENGTH);
  assert.equal(result.attachment, undefined);
  assert.equal(result.warnings.length, 2);
});
