// -----------------------------------------------------------------------------
// The hub: reads the Kavita server on a timer of the container, publishes the
// states of the Kavita device when they change, fires the scene events, and
// serves the scene actions and the widgets.
//
// One reading every `pollIntervalMs` (1 to 15 minutes, configuration), about
// eight light requests: the libraries, the counts, the last series added, the
// series that got a chapter last, the series in progress ("on deck"), the
// series read last, and the pages read by the user. The version is read hourly.
//
// Scene events, compared with cursors kept under /data (announced once, also
// across restarts; the first reading of a server is the starting point):
// - a new series: its id is above the highest id seen (Kavita ids only grow);
// - a new chapter or volume of an existing series: its `lastChapterAddedUtc`
//   (a UTC time) is after the newest one seen;
// - a series read to the end: pagesRead reaches pages, for a series not
//   already known as finished.
//
// Gladys never polls the device (should_poll: false): the scene events must
// fire even before the device is added.
// -----------------------------------------------------------------------------

import { DEVICE_TRANSPORTS, createLogger } from '@gladysassistant/integration-sdk';
import { KavitaClient, ERROR_KINDS } from './kavita/client.js';
import {
  parseLibraries,
  parsePagesRead,
  parseSeriesList,
  parseServerStats,
} from './kavita/model.js';
import { buildServerDevice, featureValues, serverIds } from './devices.js';
import {
  ACTION_TEXT,
  CONNECTION_TEXT,
  ERROR_TEXT,
  RECENT_TEXT,
  REPORT_TEXT,
  everyLanguage,
  labelled,
  listOf,
  pick,
} from './texts.js';

const logger = createLogger({ name: 'kavita-hub' });

// Widget keys (manifest `widgets`): permanent once published.
export const WIDGET_KEYS = Object.freeze({
  RECENTLY_ADDED: 'recently_added',
  CONTINUE_READING: 'continue_reading',
});

// Scene trigger keys (manifest `scene_triggers`): permanent once published.
export const TRIGGERS = Object.freeze({
  SERIES_ADDED: 'series_added',
  CHAPTER_ADDED: 'chapter_added',
  SERIES_FINISHED: 'series_finished',
});

export const HUB_TIMINGS = {
  // The version changes with an update: read it hourly.
  versionMs: 60 * 60_000,
  // New chapters older than this are not announced (a server back after days).
  eventMaxAgeMs: 24 * 60 * 60_000,
  // At most this many scene events of one kind per reading (a first big scan).
  maxEventsPerRead: 10,
  // Republish an unchanged value this often (Gladys flags a value older than 48 h).
  heartbeatMs: 12 * 60 * 60_000,
  // After a scan, read the server again this soon (Kavita scans in the background).
  recheckAfterMs: 60_000,
  // Series kept for the widgets and the cursors.
  recentCount: 12,
  updatedCount: 20,
  readCount: 20,
  // "Read the latest additions": the window, in days.
  recentDays: 7,
};

const MAX_FINISHED = 500;

const signature = (config) => JSON.stringify([config.url, config.apiKey]);

const emptySnapshot = () => ({
  reachable: null,
  version: null,
  libraries: null,
  series: null,
  volumes: null,
  reading: null,
  pagesToday: null,
});

const emptySaved = (url = null) => ({
  url,
  userId: null,
  seriesId: null,
  chapterAt: null,
  finished: null,
  day: null,
  pagesBase: null,
});

/** The local day of a time (the supervisor sets TZ to the zone of Gladys). */
export function dayOf(at) {
  const date = new Date(at);
  const pad = (value) => String(value).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

const PRIVATE_HOST =
  /^(localhost|127\.|10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.|169\.254\.|\[?::1\]?$|\[?f[cd][0-9a-f]{2}:|[^.]+$)|\.(local|lan|home|internal|localdomain|home\.arpa)$/i;

/** The transport badge: a server on the home network, or reached over the Internet. */
export function transportOf(url) {
  try {
    const { hostname } = new URL(url);
    return PRIVATE_HOST.test(hostname) ? DEVICE_TRANSPORTS.LOCAL : DEVICE_TRANSPORTS.CLOUD;
  } catch {
    return DEVICE_TRANSPORTS.LOCAL;
  }
}

export class KavitaHub {
  /**
   * @param {object} options
   * @param {object} options.gladys GladysIntegration (or the SDK's fake Gladys)
   * @param {object} options.store persistence (src/store.js)
   * @param {Function} [options.request] HTTP seam (src/kavita/http.js)
   * @param {boolean} [options.timers] periodic timer (off in tests)
   * @param {object} [options.timings] HUB_TIMINGS overrides
   * @param {() => number} [options.now]
   */
  constructor({ gladys, store, request, timers = true, timings, now }) {
    this.gladys = gladys;
    this.store = store;
    this.request = request;
    this.timersEnabled = timers;
    this.timings = { ...HUB_TIMINGS, ...timings };
    this.now = now ?? (() => Date.now());
    this.config = null;
    this.client = null;
    this.signature = null;
    this.snapshot = emptySnapshot();
    this.error = null;
    this.libraries = [];
    this.recent = [];
    this.onDeck = [];
    this.versionAt = 0;
    /** Last value published per feature external id: { value, at }. */
    this.published = new Map();
    this.transport = null;
    this.connection = null;
    this.devicesKey = null;
    this.saved = emptySaved();
    this.timer = null;
    this.recheckTimer = null;
    this.running = null;
    this.stopped = false;
    /** Problems already logged, by key: repeats go to debug. */
    this.warned = new Set();
  }

  // --- Logs ------------------------------------------------------------------

  /** Log a problem once (`level` warn or error), its repeats at debug. */
  problem(key, message, err, level = 'warn') {
    const args = err === undefined ? [message] : [message, err];
    if (this.warned.has(key)) {
      logger.debug(...args);
      return;
    }
    this.warned.add(key);
    logger[level](...args);
  }

  /** The problem `key` is gone: the next occurrence is logged again. */
  resolved(key, message) {
    if (this.warned.delete(key) && message) {
      logger.info(message);
    }
  }

  // --- Lifecycle -------------------------------------------------------------

  async start(config) {
    const saved = await this.store.load();
    this.saved = { ...emptySaved(), ...saved };
    await this.reconfigure(config);
  }

  /** Gladys reconnected (it restarted): send everything again. */
  async resync(config) {
    this.published.clear();
    this.transport = null;
    this.connection = null;
    this.devicesKey = null;
    await this.reconfigure(config);
  }

  async reconfigure(config) {
    this.config = config;
    if (signature(config) !== this.signature) {
      this.signature = signature(config);
      this.reset();
      this.client = config.url
        ? new KavitaClient({ url: config.url, apiKey: config.apiKey, request: this.request })
        : null;
      // Another server: its cursors start again from now.
      if (config.url && this.saved.url !== config.url) {
        this.saved = emptySaved(config.url);
        this.store.save(this.saved);
      }
    }
    try {
      await this.publishDevices();
      await this.refresh();
    } finally {
      // Even after a failure: the next tick tries again.
      this.schedule();
    }
  }

  reset() {
    this.published.clear();
    this.snapshot = emptySnapshot();
    this.error = null;
    this.libraries = [];
    this.recent = [];
    this.onDeck = [];
    this.versionAt = 0;
    this.transport = null;
  }

  async stop() {
    this.stopped = true;
    clearTimeout(this.timer);
    clearTimeout(this.recheckTimer);
    await this.running?.catch(() => {});
    await this.store.flush();
  }

  schedule() {
    clearTimeout(this.timer);
    if (!this.timersEnabled || this.stopped || !this.client) {
      return;
    }
    this.timer = setTimeout(async () => {
      try {
        await this.refresh();
        this.resolved('poll');
      } catch (err) {
        this.problem('poll', 'Reading failed', err, 'error');
      }
      this.schedule();
    }, this.config.pollIntervalMs);
  }

  /** One more reading soon (after a scan), without moving the regular timer. */
  recheck() {
    clearTimeout(this.recheckTimer);
    if (!this.timersEnabled || this.stopped) {
      return;
    }
    this.recheckTimer = setTimeout(() => {
      this.refresh().catch((err) => this.problem('poll', 'Reading failed', err, 'error'));
    }, this.timings.recheckAfterMs);
  }

  // --- Reading the server ------------------------------------------------------

  /** One reading. Concurrent calls share the reading in progress. */
  refresh() {
    if (this.running && this.runningClient === this.client) {
      return this.running;
    }
    // A reading of a previous configuration may still run: this one follows it.
    const previous = this.running ?? Promise.resolve();
    const run = previous
      .catch(() => {})
      .then(() => this.read())
      .finally(() => {
        if (this.running === run) {
          this.running = null;
        }
      });
    this.running = run;
    this.runningClient = this.client;
    return run;
  }

  async read() {
    if (!this.client) {
      await this.afterChanges(new Set());
      return;
    }
    const client = this.guarded(this.client);
    const changed = new Set();
    try {
      await this.readServer(client, changed);
      if (client.stale()) {
        return; // reconfigured meanwhile
      }
      if (this.error) {
        logger.info('Kavita: connection restored');
      } else if (this.snapshot.reachable === null) {
        const role = this.client.user?.admin ? 'administrator' : 'reader';
        logger.info(`Kavita: connected, version ${this.snapshot.version}, ${role} key`);
      }
      if (this.snapshot.reachable !== true) {
        changed.add(WIDGET_KEYS.RECENTLY_ADDED).add(WIDGET_KEYS.CONTINUE_READING);
      }
      this.error = null;
      this.snapshot.reachable = true;
      await this.publishDevices();
      await this.publishServer();
    } catch (err) {
      if (err.stale) {
        return; // reconfigured meanwhile: this reading is dropped
      }
      if (!err.kind) {
        throw err;
      }
      if (client.stale()) {
        return;
      }
      await this.applyFailure(err, changed);
    }
    await this.afterChanges(changed);
  }

  /**
   * The client of a reading: after each answer, a reading whose client was
   * replaced (a new address or key) stops before it changes anything.
   */
  guarded(client) {
    const stale = () => client !== this.client;
    return new Proxy(client, {
      get(target, name) {
        if (name === 'stale') {
          return stale;
        }
        const value = target[name];
        if (typeof value !== 'function') {
          return value;
        }
        return async (...args) => {
          const answer = await value.apply(target, args);
          if (stale()) {
            throw Object.assign(new Error('Reconfigured during the reading'), { stale: true });
          }
          return answer;
        };
      },
    });
  }

  async applyFailure(err, changed) {
    const wasError = this.error?.kind;
    this.error = { kind: err.kind, message: err.message };
    if (this.snapshot.reachable !== false) {
      changed.add(WIDGET_KEYS.RECENTLY_ADDED).add(WIDGET_KEYS.CONTINUE_READING);
    }
    this.snapshot.reachable = false;
    // One warning when the problem starts (or changes), not one per reading.
    if (wasError !== err.kind) {
      logger.warn(`Kavita: ${err.message}`);
    } else {
      logger.debug(`Kavita: ${err.message} (again)`);
    }
    await this.publishServer();
  }

  async readServer(client, changed) {
    const now = this.now();
    if (!client.user) {
      await client.login();
    }
    const user = this.client.user;
    if (!this.snapshot.version || now - this.versionAt >= this.timings.versionMs) {
      this.snapshot.version = await client.version();
      this.versionAt = now;
    }
    if (this.saved.userId !== user.id) {
      // Another account sees other libraries: every cursor starts again.
      Object.assign(this.saved, { ...emptySaved(this.saved.url), userId: user.id });
      this.store.save(this.saved);
    }

    this.libraries = parseLibraries(await client.libraries());
    this.snapshot.libraries = this.libraries.length;

    const added = await client.recentlyAdded(this.timings.recentCount);
    const recent = parseSeriesList(added.items);
    const updated = await client.recentlyUpdated(this.timings.updatedCount);
    if (user.admin) {
      const stats = parseServerStats(await this.optional(client, 'serverStats'));
      this.snapshot.series = stats.series ?? updated.total;
      this.snapshot.volumes = stats.volumes;
    } else {
      this.snapshot.series = updated.total;
      this.snapshot.volumes = null;
    }

    const deck = await client.onDeck(this.timings.recentCount);
    const onDeck = parseSeriesList(deck.items);
    this.snapshot.reading = deck.total ?? onDeck.length;

    const read = parseSeriesList((await client.recentlyRead(this.timings.readCount)).items);
    const pages = parsePagesRead(
      user.id ? await this.optional(client, 'userStats', user.id) : null,
    );

    if (JSON.stringify(recent) !== JSON.stringify(this.recent)) {
      changed.add(WIDGET_KEYS.RECENTLY_ADDED);
    }
    if (JSON.stringify(onDeck) !== JSON.stringify(this.onDeck)) {
      changed.add(WIDGET_KEYS.CONTINUE_READING);
    }
    this.recent = recent;
    this.onDeck = onDeck;
    this.applyPages(pages, now);

    const previousSeriesId = this.saved.seriesId;
    await this.announceSeries(recent);
    await this.announceChapters(parseSeriesList(updated.items), previousSeriesId);
    await this.announceFinished(read);
  }

  /**
   * A statistic the device can do without: its failure (a route of another
   * Kavita version, a 500) leaves the figure empty instead of the server offline.
   */
  async optional(client, method, ...args) {
    try {
      const answer = await client[method](...args);
      this.resolved(`optional-${method}`);
      return answer;
    } catch (err) {
      if (!err.kind || ![ERROR_KINDS.HTTP, ERROR_KINDS.FORBIDDEN].includes(err.kind)) {
        throw err;
      }
      this.problem(`optional-${method}`, `Kavita: ${err.message}, figure left empty`);
      return null;
    }
  }

  /** Pages read today: the total of the user minus the total at midnight. */
  applyPages(total, now) {
    if (total === null) {
      this.snapshot.pagesToday = null;
      return;
    }
    const day = dayOf(now);
    if (
      this.saved.day !== day ||
      !Number.isFinite(this.saved.pagesBase) ||
      total < this.saved.pagesBase
    ) {
      this.saved.day = day;
      this.saved.pagesBase = total;
      this.store.save(this.saved);
    }
    this.snapshot.pagesToday = Math.min(total - this.saved.pagesBase, 100_000);
  }

  /** New series: above the highest id seen. */
  async announceSeries(recent) {
    const newest = recent.reduce((max, series) => Math.max(max, series.id), 0);
    const cursor = this.saved.seriesId;
    if (!Number.isFinite(cursor)) {
      this.saved.seriesId = newest;
      this.store.save(this.saved);
      return;
    }
    const fresh = recent.filter((series) => series.id > cursor).sort((a, b) => a.id - b.id);
    if (fresh.length === 0) {
      return;
    }
    this.saved.seriesId = Math.max(cursor, newest);
    this.store.save(this.saved);
    for (const series of fresh.slice(-this.timings.maxEventsPerRead)) {
      logger.debug(`New series: "${series.title}" (${series.library})`);
      await this.fire(TRIGGERS.SERIES_ADDED, {
        title: series.title,
        library: series.library,
        format: series.format,
      });
    }
  }

  /** New chapters or volumes of series that existed at the previous reading. */
  async announceChapters(updated, previousSeriesId) {
    const newest = updated.reduce((max, series) => Math.max(max, series.chapterAt ?? 0), 0);
    const cursor = this.saved.chapterAt;
    if (!Number.isFinite(cursor) || !Number.isFinite(previousSeriesId)) {
      this.saved.chapterAt = newest;
      this.store.save(this.saved);
      return;
    }
    const fresh = updated
      .filter((series) => (series.chapterAt ?? 0) > cursor)
      .sort((a, b) => a.chapterAt - b.chapterAt);
    if (fresh.length === 0) {
      return;
    }
    this.saved.chapterAt = newest;
    this.store.save(this.saved);
    const minAt = this.now() - this.timings.eventMaxAgeMs;
    const announced = fresh
      // A new series is announced as such, not as a new chapter.
      .filter((series) => series.id <= previousSeriesId)
      .filter((series) => series.chapterAt >= minAt)
      .slice(-this.timings.maxEventsPerRead);
    for (const series of announced) {
      logger.debug(`New chapter: "${series.title}" (${series.library})`);
      await this.fire(TRIGGERS.CHAPTER_ADDED, {
        series: series.title,
        library: series.library,
      });
    }
  }

  /** Series read to the end since the previous reading. */
  async announceFinished(read) {
    if (!Array.isArray(this.saved.finished)) {
      this.saved.finished = read.filter((series) => series.finished).map((series) => series.id);
      this.store.save(this.saved);
      return;
    }
    const known = new Set(this.saved.finished);
    const fresh = [];
    let dirty = false;
    for (const series of read) {
      if (series.finished && !known.has(series.id)) {
        known.add(series.id);
        fresh.push(series);
        dirty = true;
      } else if (!series.finished && series.pages > 0 && known.has(series.id)) {
        // Marked unread, or a new volume: finishing it again is news again.
        known.delete(series.id);
        dirty = true;
      }
    }
    if (!dirty) {
      return;
    }
    this.saved.finished = [...known].slice(-MAX_FINISHED);
    this.store.save(this.saved);
    for (const series of fresh.reverse().slice(-this.timings.maxEventsPerRead)) {
      logger.debug(`Finished: "${series.title}"`);
      await this.fire(TRIGGERS.SERIES_FINISHED, {
        title: series.title,
        library: series.library,
        pages: series.pages,
      });
    }
  }

  /** Fire a scene event (the data keys are the ones the manifest declares). */
  async fire(key, data) {
    try {
      await this.gladys.publishSceneEvent(key, data);
      this.resolved('scene-event');
    } catch (err) {
      this.problem('scene-event', `Scene event ${key} refused: ${err.message}`);
    }
  }

  // --- Publishing to Gladys ----------------------------------------------------------

  async publishDevices() {
    const devices = this.config?.url
      ? [
          buildServerDevice(
            this.gladys,
            {
              url: this.config.url,
              user: this.client?.user?.name,
              admin: this.client?.user?.admin,
            },
            this.config.language,
          ),
        ]
      : [];
    const key = JSON.stringify(devices);
    if (key === this.devicesKey) {
      return;
    }
    // Even an empty list: the Discovery tab then shows no stale device.
    try {
      await this.gladys.publishDiscoveredDevices(devices);
      this.devicesKey = key;
      this.resolved('devices');
    } catch (err) {
      // Sent again at the next reading.
      this.problem('devices', `Devices refused: ${err.message}`);
    }
  }

  /** "Search" in the Discovery tab: publish the device again, read the server. */
  async rediscover() {
    this.devicesKey = null;
    await this.publishDevices();
    await this.refresh();
  }

  /** The user added the device: its states sent before were dropped by Gladys. */
  async onDeviceCreated(device) {
    if (device.external_id !== serverIds(this.gladys).device) {
      return;
    }
    await this.publishServer({ force: true });
    for (const key of Object.values(WIDGET_KEYS)) {
      this.gladys.requestWidgetRefresh(key);
    }
  }

  async publishServer({ force = false } = {}) {
    const now = this.now();
    const stale = this.snapshot.reachable === false;
    const states = [];
    for (const { key, externalId, value, text } of featureValues(this.gladys, this.snapshot)) {
      if (value === null) {
        continue;
      }
      const last = this.published.get(externalId);
      // While the server is down, the last values are not republished as fresh.
      const frozen = stale && key !== 'online';
      const fresh =
        last && last.value === value && (frozen || now - last.at < this.timings.heartbeatMs);
      if (!force && fresh) {
        continue;
      }
      states.push(
        text
          ? { device_feature_external_id: externalId, text: String(value) }
          : { device_feature_external_id: externalId, state: value },
      );
    }
    if (states.length === 0) {
      return;
    }
    try {
      await this.gladys.publishStates(states);
      for (const state of states) {
        this.published.set(state.device_feature_external_id, {
          value: state.text ?? state.state,
          at: now,
        });
      }
      this.resolved('states');
    } catch (err) {
      this.problem('states', `States refused: ${err.message}`);
    }
  }

  async afterChanges(changed) {
    await this.publishTransport();
    await this.publishConnectionStatus();
    for (const key of changed) {
      this.gladys.requestWidgetRefresh(key);
    }
  }

  async publishTransport() {
    if (this.snapshot.reachable === null || !this.config?.url) {
      return;
    }
    const transport = this.snapshot.reachable
      ? transportOf(this.config.url)
      : DEVICE_TRANSPORTS.UNREACHABLE;
    if (transport === this.transport) {
      return;
    }
    try {
      await this.gladys.publishTransports([
        { external_id: serverIds(this.gladys).device, transport },
      ]);
      this.transport = transport;
      this.resolved('transports');
    } catch (err) {
      this.problem('transports', `Transports refused: ${err.message}`);
    }
  }

  /** The status under the integration name. */
  connectionStatus() {
    if (!this.config?.url) {
      return {
        connected: false,
        message: this.config?.incomplete ? CONNECTION_TEXT.invalid : CONNECTION_TEXT.noServer,
      };
    }
    if (this.error) {
      return {
        connected: false,
        message: everyLanguage(ERROR_TEXT[this.error.kind], (text, language) =>
          labelled('Kavita', text, language).slice(0, 200),
        ),
      };
    }
    return { connected: true };
  }

  async publishConnectionStatus() {
    const status = this.connectionStatus();
    const key = JSON.stringify(status);
    if (key === this.connection) {
      return;
    }
    try {
      await this.gladys.setConnectionStatus(status.connected, status.message);
      this.connection = key;
      this.resolved('connection-status');
    } catch (err) {
      this.problem('connection-status', `Connection status refused: ${err.message}`);
    }
  }

  // --- Commands --------------------------------------------------------------------------

  requireClient() {
    if (!this.client) {
      throw new Error(pick(ACTION_TEXT.noServer, this.config?.language));
    }
    return this.client;
  }

  /** The error of an action, in the language of the configuration. */
  actionError(err) {
    if (!err.kind) {
      return err;
    }
    const text = pick(ERROR_TEXT[err.kind], this.config.language);
    return new Error(labelled('Kavita', text, this.config.language));
  }

  /**
   * Ask Kavita to scan one library (by its name, any case) or all of them for
   * new files (administrator key). Kavita scans in the background: the new
   * series show at the reading that follows.
   * @returns {Promise<{ libraries: number }>}
   */
  async scanLibraries(name = '') {
    const client = this.requireClient();
    try {
      const libraries = parseLibraries(await client.libraries());
      const wanted = String(name ?? '')
        .trim()
        .toLowerCase();
      const targets = wanted
        ? libraries.filter((library) => library.name.toLowerCase() === wanted)
        : libraries;
      if (targets.length === 0) {
        throw new Error(pick(ACTION_TEXT.unknownLibrary, this.config.language));
      }
      for (const library of targets) {
        await client.scanLibrary(library.id);
      }
      logger.info(`Scan of ${targets.length} library(ies) started`);
      this.recheck();
      return { libraries: targets.length };
    } catch (err) {
      if (err.kind) {
        logger.warn(`Library scan failed: ${err.message}`);
      }
      throw this.actionError(err);
    }
  }

  /**
   * The series added in the last days, as a sentence for a message. Reads the
   * server now.
   * @returns {Promise<{ sentence: object, count: number, title: string }>}
   */
  async latestAdditions() {
    this.requireClient();
    await this.refresh();
    if (this.error) {
      throw this.actionError(this.error);
    }
    const days = this.timings.recentDays;
    const since = this.now() - days * 24 * 60 * 60_000;
    const fresh = this.recent.filter((series) => (series.createdAt ?? 0) >= since);
    const titles = fresh.map((series) => series.title);
    return {
      sentence: everyLanguage(RECENT_TEXT, (text) =>
        (fresh.length === 0
          ? text.none(days)
          : text.some(fresh.length, days, listOf(titles, fresh.length, text))
        ).slice(0, 1000),
      ),
      count: fresh.length,
      title: titles[0] ?? '',
    };
  }

  /** "Test the connection": read the server now, one line. */
  async testConnection() {
    await this.refresh();
    const status = this.connectionStatus();
    if (!status.connected) {
      return status.message;
    }
    const user = this.client.user;
    return everyLanguage(REPORT_TEXT, (text) =>
      [
        `${text.ok(this.snapshot.version, user.name)} (${user.admin ? text.admin() : text.reader()})`,
        text.library(this.snapshot.libraries ?? 0, this.snapshot.series ?? 0),
        text.reading(this.snapshot.reading ?? 0),
      ].join(', '),
    );
  }
}

export { ERROR_KINDS };
