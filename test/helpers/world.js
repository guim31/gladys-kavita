// -----------------------------------------------------------------------------
// A complete test world: the SDK's fake Gladys, a fake Kavita server on a fake
// network, a temporary /data and a manual clock, with the integration wired on
// top through registerHandlers. No timer runs unless `timers: true`: the tests
// read the server with `world.hub.refresh()`.
// -----------------------------------------------------------------------------

import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createFakeGladys } from '@gladysassistant/integration-sdk/testing';
import { registerHandlers } from '../../src/app.js';
import { Store } from '../../src/store.js';
import { API_KEY, COVER, FakeKavita, createNetwork } from './fakeKavita.js';

process.env.LOG_LEVEL ??= 'silent';
// The dates of Kavita are in the zone of its server (UTC in the captures).
process.env.TZ = 'UTC';

export const SERVER_URL = 'http://192.0.2.10:5000';

/** A manual clock: a few minutes after the real captures. */
export function createClock(start = Date.parse('2026-10-22T01:00:00Z')) {
  const clock = {
    time: start,
    now: () => clock.time,
    advance(ms) {
      clock.time += ms;
    },
  };
  return clock;
}

export const CONFIG = { server_url: SERVER_URL, api_key: API_KEY, language: 'en' };

export async function createWorld({
  clock = createClock(),
  server = new FakeKavita(),
  servers,
  config = CONFIG,
  devices = [],
  connect = true,
  dataDir = mkdtempSync(join(tmpdir(), 'gladys-kavita-')),
  timings = {},
  timers = false,
} = {}) {
  const network = createNetwork(servers ?? { [SERVER_URL]: server });
  const gladys = createFakeGladys({ config, devices });
  const app = registerHandlers(gladys, {
    store: new Store(dataDir),
    request: network.request,
    timers,
    timings,
    now: clock.now,
  });
  if (connect) {
    await gladys.connect();
    await app.ready;
  }
  return { gladys, fake: gladys.fake, network, server, app, hub: app.hub, clock, dataDir };
}

export const serverDevice = (gladys) => gladys.externalIds('server', 'main').device;
export const serverFeature = (gladys, key) => gladys.externalIds('server', 'main').feature(key);

export { API_KEY, COVER, FakeKavita };
