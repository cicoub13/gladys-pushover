// -----------------------------------------------------------------------------
// The manifest and the code state some facts twice (the configuration and
// "My account" keys, the version). Nothing links them at runtime, and a
// divergence fails at the worst possible moment. These tests are that link.
// -----------------------------------------------------------------------------

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { normalizeConfig, normalizeContact } from '../src/config.js';

const MAX_COVER_BYTES = 150 * 1024;
// INTEGRATION_CATALOG_CATEGORIES in the core. The manifest schema has no enum
// (an unknown key is dropped with a warning), so a typo here would silently
// land the integration in the uncategorized bucket.
const CATALOG_CATEGORIES = [
  'climate',
  'lighting',
  'energy',
  'security',
  'multimedia',
  'appliances',
  'environment',
  'protocols',
  'network',
  'notifications',
  'assistants',
  'services',
];

const readJson = (name) => JSON.parse(readFileSync(new URL(`../${name}`, import.meta.url), 'utf8'));

const manifest = readJson('gladys-assistant-integration.json');
const pkg = readJson('package.json');
const valueKeys = (schema) =>
  schema.filter((field) => field.type !== 'section').map((field) => field.key);
const field = (schema, key) => schema.find((entry) => entry.key === key);

test('the manifest version matches package.json and the image tag', () => {
  assert.equal(manifest.version, pkg.version);
  assert.equal(manifest.docker_image, `ghcr.io/cicoub13/gladys-pushover:${manifest.version}`);
});

test('the manifest is a send-only communication channel', () => {
  assert.equal(manifest.type, 'communication');
  assert.deepEqual(manifest.messaging, { receive: false });
  // `categories` needs a range starting at 4.86.0, the store refuses it otherwise.
  assert.equal(manifest.gladys_version, '>=4.86.0');
});

test('the name and descriptions fit the store limits', () => {
  assert.ok(manifest.name.length >= 3 && manifest.name.length <= 30);
  for (const [language, text] of Object.entries(manifest.description)) {
    assert.ok(
      text.length >= 10 && text.length <= 100,
      `description.${language} is ${text.length} chars`,
    );
  }
});

test('the catalog categories are declared and come from the core vocabulary', () => {
  assert.ok(manifest.categories?.length >= 1 && manifest.categories.length <= 3);
  for (const category of manifest.categories) {
    assert.ok(CATALOG_CATEGORIES.includes(category), `unknown catalog category: ${category}`);
  }
});

test('the transport is declared for the catalog Local / Cloud filter', () => {
  assert.deepEqual(manifest.transports, ['cloud']);
});

test('no permission or capability is declared that the integration does not use', () => {
  for (const key of [
    'location',
    'network_wake',
    'network_discovery',
    'containers',
    'webhooks',
    'actions',
    'widgets',
    'scene_triggers',
    'scene_actions',
  ]) {
    assert.equal(manifest[key], undefined, `${key} is declared but unused`);
  }
});

test('the configuration and "My account" keys are the ones the code reads', () => {
  assert.deepEqual(valueKeys(manifest.config_schema), Object.keys(normalizeConfig({})));
  assert.deepEqual(valueKeys(manifest.contact_schema), Object.keys(normalizeContact({})));
});

test('the token and the user key are required secrets, never plain strings', () => {
  for (const entry of [
    field(manifest.config_schema, 'app_token'),
    field(manifest.contact_schema, 'user_key'),
  ]) {
    assert.equal(entry.type, 'secret');
    assert.equal(entry.required, true);
  }
  assert.equal(field(manifest.contact_schema, 'devices').required, false);
});

test('every text shown to the user is translated (en + fr)', () => {
  const entries = [...manifest.config_schema, ...manifest.contact_schema];
  const links = entries.flatMap((entry) => entry.links ?? []);
  for (const entry of [...entries, ...links]) {
    assert.ok(entry.label.en && entry.label.fr, `missing label on ${JSON.stringify(entry)}`);
  }
  for (const entry of entries) {
    for (const text of [entry.description, entry.placeholder].filter(Boolean)) {
      assert.ok(text.en && text.fr, `missing translation on ${entry.key}`);
    }
  }
});

test('the sections fit the core limits: 1000 characters, 5 https links', () => {
  const sections = [...manifest.config_schema, ...manifest.contact_schema].filter(
    (entry) => entry.type === 'section',
  );
  for (const section of sections) {
    for (const text of Object.values(section.description)) {
      assert.ok(text.length <= 1000, `${section.key}: ${text.length} chars`);
    }
    assert.ok(section.links.length <= 5);
    for (const link of section.links) {
      assert.match(link.url, /^https:\/\//);
    }
  }
});

test('the cover image is an 800 x 534 PNG within the store limit', () => {
  assert.ok(manifest.cover_image.endsWith('/cover.png'));
  const png = readFileSync(new URL('../cover.png', import.meta.url));
  assert.ok(png.length <= MAX_COVER_BYTES, `cover.png is ${png.length} bytes`);
  // PNG signature, then the IHDR chunk: width and height as big-endian uint32.
  assert.equal(png.subarray(1, 4).toString('ascii'), 'PNG');
  assert.deepEqual([png.readUInt32BE(16), png.readUInt32BE(20)], [800, 534]);
});
