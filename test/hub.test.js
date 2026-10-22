// -----------------------------------------------------------------------------
// The hub against the fake Kavita server: device states, scene events and
// their cursors, the token renewal, a reader key, the pages of the day, the
// scene actions and the connection status.
// -----------------------------------------------------------------------------

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { KEYS } from '../src/devices.js';
import { TRIGGERS, WIDGET_KEYS, transportOf } from '../src/hub.js';
import {
  FakeKavita,
  SERVER_URL,
  createClock,
  createWorld,
  serverDevice,
  serverFeature,
} from './helpers/world.js';

async function world(t, options) {
  const w = await createWorld(options);
  t.after(() => w.app.stop());
  return w;
}

const state = (w, key) => w.fake.lastState(serverFeature(w.gladys, key));
const events = (w, key) => w.fake.sceneEvents.filter((event) => event.key === key);

test('the Kavita device carries the counts of the server', async (t) => {
  const w = await world(t);
  const [device] = w.fake.discoveredDevices;
  assert.equal(device.external_id, serverDevice(w.gladys));
  assert.equal(device.should_poll, false);
  assert.deepEqual(device.params, [
    { name: 'KAVITA_URL', value: SERVER_URL },
    { name: 'KAVITA_USER', value: 'admin' },
  ]);
  assert.equal(state(w, KEYS.ONLINE), 1);
  assert.equal(state(w, KEYS.LIBRARIES), 2);
  assert.equal(state(w, KEYS.SERIES), 3); // server statistics of the capture
  assert.equal(state(w, KEYS.VOLUMES), 3);
  assert.equal(state(w, KEYS.READING), 1); // Test Comic, 3 pages of 9
  assert.equal(state(w, KEYS.PAGES_TODAY), 0);
  assert.equal(state(w, KEYS.VERSION), '0.9.1.4');
});

test('a reader key: no volume feature, the series counted from the list', async (t) => {
  const w = await world(t, { server: new FakeKavita({ admin: false }) });
  const [device] = w.fake.discoveredDevices;
  assert.ok(!device.features.some((feature) => feature.external_id.endsWith(':volumes')));
  assert.deepEqual(device.params.at(-1), { name: 'KAVITA_USER', value: 'reader' });
  assert.equal(state(w, KEYS.SERIES), 3);
  const ack = await w.fake.sceneAction('scan_library', {});
  assert.equal(ack.success, false);
  assert.match(ack.error, /not an administrator/);
  const content = await w.fake.widgetGet(WIDGET_KEYS.RECENTLY_ADDED, { language: 'en' });
  assert.ok(!content.data.content.components.some((component) => component.type === 'button'));
});

test('a new series fires series_added once, with its library and format', async (t) => {
  const w = await world(t);
  assert.equal(w.fake.sceneEvents.length, 0, 'the first reading is the starting point');
  w.clock.advance(60_000);
  w.server.addSeries(w.clock.now(), { title: 'Fresh Arrival', libraryId: 2 });
  await w.hub.refresh();
  await w.hub.refresh();
  assert.deepEqual(
    events(w, TRIGGERS.SERIES_ADDED).map((event) => event.data),
    [{ title: 'Fresh Arrival', library: 'Books', format: 'archive' }],
  );
  // Not a new chapter of an existing series.
  assert.equal(events(w, TRIGGERS.CHAPTER_ADDED).length, 0);
});

test('a new volume of an existing series fires chapter_added', async (t) => {
  const w = await world(t);
  w.clock.advance(60_000);
  w.server.addChapter(2, w.clock.now());
  await w.hub.refresh();
  await w.hub.refresh();
  assert.deepEqual(
    events(w, TRIGGERS.CHAPTER_ADDED).map((event) => event.data),
    [{ series: 'Test Comic', library: 'Comics' }],
  );
  assert.equal(state(w, KEYS.VOLUMES), 4);
});

test('a volume added days ago (a server back from a long outage) is not news', async (t) => {
  const w = await world(t);
  w.clock.advance(3 * 24 * 60 * 60_000);
  w.server.addChapter(2, w.clock.now() - 2 * 24 * 60 * 60_000);
  await w.hub.refresh();
  assert.equal(events(w, TRIGGERS.CHAPTER_ADDED).length, 0);
});

test('a series read to the end fires series_finished once, again after a reset', async (t) => {
  const w = await world(t);
  w.clock.advance(60_000);
  w.server.read(2, w.clock.now(), 6);
  await w.hub.refresh();
  await w.hub.refresh();
  assert.deepEqual(
    events(w, TRIGGERS.SERIES_FINISHED).map((event) => event.data),
    [{ title: 'Test Comic', library: 'Comics', pages: 9 }],
  );
  assert.equal(state(w, KEYS.READING), 0);
  // A new volume makes it unfinished; reading it to the end is news again.
  w.clock.advance(60_000);
  w.server.addChapter(2, w.clock.now(), 4);
  await w.hub.refresh();
  w.server.read(2, w.clock.now(), 4);
  await w.hub.refresh();
  assert.equal(events(w, TRIGGERS.SERIES_FINISHED).length, 2);
});

test('the cursors survive a restart: nothing is announced twice', async (t) => {
  const clock = createClock();
  const server = new FakeKavita();
  const first = await createWorld({ clock, server });
  clock.advance(60_000);
  server.addSeries(clock.now());
  server.read(3, clock.now(), 3);
  await first.hub.refresh();
  assert.equal(first.fake.sceneEvents.length, 2);
  await first.app.stop();
  const second = await world(t, { clock, server, dataDir: first.dataDir });
  await second.hub.refresh();
  assert.equal(second.fake.sceneEvents.length, 0);
});

test('another server starts its cursors again', async (t) => {
  const clock = createClock();
  const other = 'http://192.0.2.11:5000';
  const servers = { [SERVER_URL]: new FakeKavita(), [other]: new FakeKavita() };
  const w = await world(t, { clock, servers });
  clock.advance(60_000);
  servers[other].addSeries(clock.now());
  await w.fake.configUpdated({ server_url: other, api_key: 'key-1', language: 'en' });
  assert.equal(w.fake.sceneEvents.length, 0);
});

test('pages read today: the total of the user minus the total at midnight', async (t) => {
  const w = await world(t);
  w.clock.advance(60_000);
  w.server.read(1, w.clock.now(), 2);
  await w.hub.refresh();
  assert.equal(state(w, KEYS.PAGES_TODAY), 2);
  w.clock.time = Date.parse('2026-10-23T00:05:00Z');
  await w.hub.refresh();
  assert.equal(state(w, KEYS.PAGES_TODAY), 0);
  w.server.read(2, w.clock.now(), 4);
  await w.hub.refresh();
  assert.equal(state(w, KEYS.PAGES_TODAY), 4);
});

test('the 0.8 route of the user statistics is used when the 0.9 one is missing', async (t) => {
  const w = await world(t, { server: new FakeKavita({ legacyStats: true }) });
  w.server.read(1, w.clock.now(), 1);
  await w.hub.refresh();
  assert.equal(state(w, KEYS.PAGES_TODAY), 1);
});

test('an expired token is renewed once, silently', async (t) => {
  const w = await world(t);
  const logins = () =>
    w.server.requests.filter((request) => request.path === '/api/Plugin/authenticate').length;
  assert.equal(logins(), 1);
  w.server.expireTokens();
  await w.hub.refresh();
  assert.equal(logins(), 2);
  assert.equal(state(w, KEYS.ONLINE), 1);
  // The key never travels outside the plugin routes.
  for (const request of w.server.requests) {
    if (!request.path.startsWith('/api/Plugin/')) {
      assert.equal(request.query.apiKey, undefined, request.path);
    }
  }
});

test('a refused key and a server down: offline, a status, the last values kept', async (t) => {
  const w = await world(t, { config: { server_url: SERVER_URL, api_key: 'wrong' } });
  assert.equal(state(w, KEYS.ONLINE), 0);
  assert.equal(w.fake.connectionStatus.connected, false);
  assert.match(w.fake.connectionStatus.message.en, /API key refused/);

  const ok = await world(t);
  ok.server.online = false;
  await ok.hub.refresh();
  assert.equal(state(ok, KEYS.ONLINE), 0);
  assert.equal(state(ok, KEYS.SERIES), 3);
  assert.match(ok.fake.connectionStatus.message.fr, /Kavita : le serveur ne répond pas/);
  ok.server.online = true;
  await ok.hub.refresh();
  assert.equal(ok.fake.connectionStatus.connected, true);
});

test('something else at the address is not taken for Kavita', async (t) => {
  const server = new FakeKavita({ urlBase: '/kavita' });
  const w = await world(t, { server });
  assert.match(w.fake.connectionStatus.message.en, /no Kavita server at this address/);
  await w.fake.configUpdated({ server_url: `${SERVER_URL}/kavita/`, api_key: 'key-1' });
  assert.equal(w.fake.connectionStatus.connected, true);
});

test('the transport badge: local on the home network, cloud beyond', async (t) => {
  assert.equal(transportOf('http://192.168.1.20:5000'), 'local');
  assert.equal(transportOf('http://kavita.local'), 'local');
  assert.equal(transportOf('http://nas:5000'), 'local');
  assert.equal(transportOf('https://books.example.org/kavita'), 'cloud');
  const w = await world(t);
  assert.deepEqual(
    w.fake.transports.map((entry) => entry.transport),
    ['cloud'], // 192.0.2.10 is a documentation address, not a private one
  );
  assert.equal(w.fake.transports[0].device_external_id, serverDevice(w.gladys));
});

test('the device added: every state sent again, the widgets refreshed', async (t) => {
  const w = await world(t);
  const before = w.fake.states.length;
  await w.fake.deviceCreated(w.fake.discoveredDevices[0]);
  assert.ok(w.fake.states.length - before >= 7);
  assert.deepEqual(
    [...new Set(w.fake.widgetRefreshes.slice(-2))].sort(),
    Object.values(WIDGET_KEYS).sort(),
  );
});

test('scan_library: one library by name, or all of them', async (t) => {
  const w = await world(t);
  let ack = await w.fake.sceneAction('scan_library', { library: 'books' });
  assert.equal(ack.success, true);
  assert.deepEqual(ack.data.outputs, { libraries: 1 });
  assert.deepEqual(w.server.scans, [2]);
  ack = await w.fake.sceneAction('scan_library', {});
  assert.deepEqual(ack.data.outputs, { libraries: 2 });
  ack = await w.fake.sceneAction('scan_library', { library: 'Nope' });
  assert.equal(ack.success, false);
  assert.match(ack.error, /No library of this name/);
});

test('read_latest_additions: a sentence of the series of the last 7 days', async (t) => {
  const w = await world(t);
  let ack = await w.fake.sceneAction('read_latest_additions', {});
  assert.deepEqual(ack.data.outputs, {
    sentence:
      '3 new series on Kavita in the last 7 days: Quiet Morning, Test Comic and Other Manga.',
    count: 3,
    title: 'Quiet Morning',
  });
  w.clock.advance(8 * 24 * 60 * 60_000);
  ack = await w.fake.sceneAction('read_latest_additions', {});
  assert.equal(ack.data.outputs.sentence, 'Nothing new on Kavita in the last 7 days.');
  assert.equal(ack.data.outputs.count, 0);
});

test('test_connection reports the version, the account and the counts', async (t) => {
  const w = await world(t);
  const ack = await w.fake.action('test_connection', {});
  assert.equal(ack.success, true);
  assert.equal(
    ack.data.message.en,
    'Kavita 0.9.1.4: connected as admin (administrator), 2 library(ies), 3 series, 1 series in progress',
  );
});

test('the container reads the server on its own timer, without onPoll', async (t) => {
  const w = await world(t, {
    timers: true,
    config: { server_url: SERVER_URL, api_key: 'key-1', poll_interval: '60' },
  });
  t.mock.timers.enable({ apis: ['setTimeout'] });
  w.hub.schedule();
  const reads = () =>
    w.server.requests.filter((request) => request.path === '/api/Library/libraries').length;
  const before = reads();
  t.mock.timers.tick(60_000);
  await w.hub.running;
  assert.equal(reads(), before + 1);
});
