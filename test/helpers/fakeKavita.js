// -----------------------------------------------------------------------------
// An in-memory Kavita server behind the `request` seam of the client
// (src/kavita/http.js). Series and answers come from a real 0.9.1.4 server
// (test/fixtures/kavita/), with the behaviors that matter: the API key
// exchanged for a JWT that expires, the admin-only routes, the 0.8 route of
// the user statistics, series and chapters added by a scan, reading progress,
// covers, a server that does not answer.
// -----------------------------------------------------------------------------

import { readFileSync } from 'node:fs';

export const fixture = (name) =>
  JSON.parse(readFileSync(new URL(`../fixtures/kavita/${name}.json`, import.meta.url), 'utf8'));

// A real cover thumbnail (320 × 455 PNG) of the test library.
export const COVER = readFileSync(
  new URL('../fixtures/kavita/cover-series-2.png', import.meta.url),
);

export const API_KEY = 'key-1';
export const VERSION = '0.9.1.4';

const json = (status, body, headers = {}) => ({
  status,
  headers: { 'content-type': 'application/json; charset=utf-8', ...headers },
  body: JSON.stringify(body),
});
const plain = (status, body = '') => ({
  status,
  headers: { 'content-type': 'text/plain' },
  body,
});

/** A JWT as Kavita signs it (the signature is never checked by the client). */
export function makeToken(claims) {
  const part = (value) => Buffer.from(JSON.stringify(value)).toString('base64url');
  return `${part({ alg: 'HS512', typ: 'JWT' })}.${part(claims)}.c2lnbmF0dXJl`;
}

/** "2026-10-22T01:00:00.1234567" from epoch ms (Kavita writes 7 decimals, no Z). */
const kavitaDate = (at) => new Date(at).toISOString().replace('Z', '0000');

export class FakeKavita {
  constructor({ apiKey = API_KEY, admin = true, legacyStats = false, urlBase = '' } = {}) {
    this.apiKey = apiKey;
    this.admin = admin;
    this.legacyStats = legacyStats;
    this.urlBase = urlBase;
    this.online = true;
    this.libraries = fixture('libraries');
    this.series = new Map(fixture('recently-added').map((series) => [series.id, series]));
    // Pages read since the install, as Kavita counts them (reading sessions).
    this.pagesRead = fixture('user-read').totalPagesRead;
    this.stats = fixture('server-stats');
    this.tokens = new Set();
    this.scans = [];
    this.requests = [];
    this.failNext = null;
  }

  user() {
    return this.admin
      ? { id: 1, name: 'admin', roles: ['Admin', 'Login'] }
      : { id: 2, name: 'reader', roles: ['Pleb', 'Login'] };
  }

  /** Every token issued so far stops working (a JWT past its expiry). */
  expireTokens() {
    this.tokens.clear();
  }

  /** A scan finds a new series at `at`. */
  addSeries(at, { title = 'New Series', pages = 3, libraryId = 1 } = {}) {
    const id = Math.max(...this.series.keys()) + 1;
    const [template] = fixture('recently-added').filter((series) => series.id === 1);
    const library = this.libraries.find((entry) => entry.id === libraryId);
    this.series.set(id, {
      ...template,
      id,
      name: title,
      originalName: title,
      sortName: title,
      pages,
      pagesRead: 0,
      libraryId,
      libraryName: library.name,
      created: kavitaDate(at),
      lastChapterAdded: kavitaDate(at),
      lastChapterAddedUtc: kavitaDate(at),
      latestReadDate: '0001-01-01T00:00:00',
      coverImage: `v${id}_c${id}.png`,
    });
    this.stats.seriesCount += 1;
    this.stats.volumeCount += 1;
    return id;
  }

  /** A scan adds a volume to an existing series at `at`. */
  addChapter(seriesId, at, pages = 4) {
    const series = this.series.get(seriesId);
    series.pages += pages;
    series.lastChapterAdded = kavitaDate(at);
    series.lastChapterAddedUtc = kavitaDate(at);
    this.stats.volumeCount += 1;
  }

  /** The user reads `pages` more pages of a series at `at`. */
  read(seriesId, at, pages) {
    const series = this.series.get(seriesId);
    const before = series.pagesRead;
    series.pagesRead = Math.min(series.pages, before + pages);
    series.latestReadDate = kavitaDate(at);
    this.pagesRead += series.pagesRead - before;
  }

  /** The `request` function given to the client. */
  handle(url, { method = 'GET', headers = {}, json: body, binary } = {}) {
    const { pathname, searchParams } = new URL(url);
    this.requests.push({ method, path: pathname, query: Object.fromEntries(searchParams), body });
    if (!this.online) {
      const error = new Error('connect ECONNREFUSED');
      error.code = 'ECONNREFUSED';
      throw error;
    }
    if (this.failNext) {
      const status = this.failNext;
      this.failNext = null;
      return plain(status);
    }
    if (!pathname.startsWith(this.urlBase)) {
      return { status: 404, headers: { 'content-type': 'text/html' }, body: 'Not found' };
    }
    const path = pathname.slice(this.urlBase.length);
    if (path === '/api/Plugin/authenticate' && method === 'POST') {
      if (searchParams.get('apiKey') !== this.apiKey) {
        return json(401, { status: 401, message: 'Unauthorized' });
      }
      const user = this.user();
      const token = makeToken({ name: user.name, nameid: String(user.id), role: user.roles });
      this.tokens.add(token);
      return json(200, { id: 0, username: user.name, roles: [], token });
    }
    if (path === '/api/Plugin/version') {
      return searchParams.get('apiKey') === this.apiKey ? plain(200, VERSION) : plain(401);
    }
    const token = String(headers.Authorization ?? '').replace(/^Bearer /, '');
    if (!this.tokens.has(token)) {
      return plain(401);
    }
    return this.route(path, method, searchParams, body, binary);
  }

  page(list, searchParams) {
    const size = Number(searchParams.get('PageSize') ?? 20);
    return json(200, list.slice(0, size), {
      pagination: JSON.stringify({
        currentPage: 1,
        itemsPerPage: size,
        totalItems: list.length,
        totalPages: Math.ceil(list.length / size),
      }),
    });
  }

  route(path, method, searchParams, body, binary) {
    const all = [...this.series.values()];
    const by = (key) => (a, b) => String(b[key]).localeCompare(String(a[key]));
    if (path === '/api/Library/libraries') {
      return json(200, this.libraries);
    }
    if (path === '/api/Series/recently-added-v2' && method === 'POST') {
      return this.page(all.sort(by('created')), searchParams);
    }
    if (path === '/api/Series/all-v2' && method === 'POST') {
      const field = body?.sortOptions?.sortField;
      const list =
        field === 4
          ? all.sort(by('lastChapterAddedUtc'))
          : field === 7
            ? all.sort(by('latestReadDate'))
            : all.sort((a, b) => a.sortName.localeCompare(b.sortName));
      return this.page(list, searchParams);
    }
    if (path === '/api/Series/on-deck' && method === 'POST') {
      const list = all
        .filter((series) => series.pagesRead > 0 && series.pagesRead < series.pages)
        .sort(by('latestReadDate'));
      return this.page(list, searchParams);
    }
    if (path === '/api/Stats/server/stats') {
      return this.admin ? json(200, this.stats) : plain(403);
    }
    const userId = String(this.user().id);
    if (path === '/api/Stats/user-read' && !this.legacyStats) {
      return searchParams.get('userId') === userId
        ? json(200, { ...fixture('user-read'), totalPagesRead: this.pagesRead })
        : json(400, {});
    }
    if (path === `/api/Stats/user/${userId}/read` && this.legacyStats) {
      return json(200, { ...fixture('user-read'), totalPagesRead: this.pagesRead });
    }
    if (path === '/api/Library/scan' && method === 'POST') {
      if (!this.admin) {
        return plain(403);
      }
      this.scans.push(Number(searchParams.get('libraryId')));
      return plain(200);
    }
    if (path === '/api/Image/series-cover') {
      if (!binary) {
        return json(400, {});
      }
      return { status: 200, headers: { 'content-type': 'image/png' }, body: COVER };
    }
    return plain(404, 'Not Found');
  }
}

/** A network of fake servers by base URL, as the `request` seam. */
export function createNetwork(servers) {
  return {
    servers,
    async request(url, options) {
      const base = Object.keys(servers).find((prefix) => url.startsWith(prefix));
      if (!base) {
        const error = new Error('getaddrinfo ENOTFOUND');
        error.code = 'ENOTFOUND';
        throw error;
      }
      return servers[base].handle(url, options);
    },
  };
}
