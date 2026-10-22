// -----------------------------------------------------------------------------
// The two widgets: valid content for the core in every state (configured or
// not, server down, every language), covers served from Kavita, the scan
// button of an administrator.
// -----------------------------------------------------------------------------

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { validateWidgetContent } from '@gladysassistant/integration-sdk';
import { WIDGET_KEYS } from '../src/hub.js';
import { ACTIONS } from '../src/widgets.js';
import { COVER, createWorld } from './helpers/world.js';

async function world(t, options) {
  const w = await createWorld(options);
  t.after(() => w.app.stop());
  return w;
}

async function content(w, key, language = 'en') {
  const ack = await w.fake.widgetGet(key, { settings: {}, language });
  assert.equal(ack.success, true, ack.error);
  const { content: value } = ack.data;
  assert.deepEqual(validateWidgetContent(value), [], `${key} (${language})`);
  return value;
}

test('every widget is valid in every language and state', async (t) => {
  const configured = await world(t);
  configured.server.read(1, configured.clock.now(), 1);
  await configured.hub.refresh();
  const empty = await world(t, { config: {} });
  const down = await world(t);
  down.server.online = false;
  await down.hub.refresh();
  for (const w of [configured, empty, down]) {
    for (const key of Object.values(WIDGET_KEYS)) {
      for (const language of ['en', 'fr', 'de', 'es']) {
        await content(w, key, language);
      }
    }
  }
});

test('recently added: counts, a cover grid, the scan button', async (t) => {
  const w = await world(t);
  const { components } = await content(w, WIDGET_KEYS.RECENTLY_ADDED, 'fr');
  assert.deepEqual(
    components.filter((c) => c.type === 'value').map((c) => [c.label, c.value]),
    [
      ['Séries', 3],
      ['Tomes', 3],
    ],
  );
  const grid = components.find((c) => c.type === 'card-list');
  assert.deepEqual(
    grid.items.map((item) => [item.title, item.image ?? null, item.badge.text]),
    [
      ['Quiet Morning', null, 'Books'], // an EPUB without a cover image
      ['Test Comic', 'series-2', 'Comics'],
      ['Other Manga', 'series-1', 'Comics'],
    ],
  );
  const button = components.find((c) => c.type === 'button');
  assert.equal(button.action.key, ACTIONS.SCAN);
  const ack = await w.fake.widgetAction(WIDGET_KEYS.RECENTLY_ADDED, ACTIONS.SCAN);
  assert.equal(ack.success, true, ack.error);
  assert.equal(ack.data.message.fr, 'Scan de 2 bibliothèque(s) lancé.');
  assert.deepEqual(w.server.scans, [2, 1]);
});

test('continue reading: the series in progress with their progress', async (t) => {
  const w = await world(t);
  const { components } = await content(w, WIDGET_KEYS.CONTINUE_READING);
  assert.deepEqual(
    components.filter((c) => c.type === 'value').map((c) => [c.label, c.value]),
    [
      ['In progress', 1],
      ['Pages today', 0],
    ],
  );
  const [row] = components.find((c) => c.type === 'card-list').items;
  assert.deepEqual(row, {
    title: 'Test Comic',
    subtitle: 'Comics · 3/9 pages',
    image: 'series-2',
    badge: { text: '33 %', color: row.badge.color },
  });
});

test('covers come from Kavita, only for the keys the widgets declare', async (t) => {
  const w = await world(t);
  const ack = await w.fake.widgetGetImage('series-2');
  assert.equal(ack.success, true, ack.error);
  assert.equal(ack.data.image, COVER.toString('base64'));
  for (const key of ['series-x', '../etc/passwd', 'cover-2']) {
    assert.equal((await w.fake.widgetGetImage(key)).success, false, key);
  }
});
