import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DEFAULT_CONFIG, normalizeConfig, parseServerUrl } from '../src/config.js';

test('the address typed by the user becomes a base URL', () => {
  assert.equal(parseServerUrl('192.0.2.10:5000'), 'http://192.0.2.10:5000');
  assert.equal(parseServerUrl(' http://192.0.2.10:5000/ '), 'http://192.0.2.10:5000');
  assert.equal(parseServerUrl('https://example.org/kavita/'), 'https://example.org/kavita');
  assert.equal(
    parseServerUrl('http://192.0.2.10:5000/library/1/series/2?x=1#top'),
    'http://192.0.2.10:5000',
  );
  assert.equal(parseServerUrl('https://example.org/kavita/home'), 'https://example.org/kavita');
  assert.equal(parseServerUrl('http://user:secret@192.0.2.10:5000'), null);
  assert.equal(parseServerUrl('ftp://192.0.2.10'), null);
  assert.equal(parseServerUrl(''), null);
  assert.equal(parseServerUrl(42), null);
});

test('normalizeConfig: defaults, incomplete configuration', () => {
  assert.deepEqual(normalizeConfig({}), {
    url: null,
    apiKey: null,
    incomplete: false,
    pollIntervalMs: 300_000,
    language: DEFAULT_CONFIG.language,
  });
  assert.equal(normalizeConfig({ server_url: '192.0.2.10:5000' }).incomplete, true);
  const config = normalizeConfig({
    server_url: '192.0.2.10:5000',
    api_key: ' abc ',
    poll_interval: '60',
    language: 'de',
  });
  assert.deepEqual(config, {
    url: 'http://192.0.2.10:5000',
    apiKey: 'abc',
    incomplete: false,
    pollIntervalMs: 60_000,
    language: 'de',
  });
  assert.equal(normalizeConfig({ poll_interval: '7', language: 'it' }).pollIntervalMs, 300_000);
});
