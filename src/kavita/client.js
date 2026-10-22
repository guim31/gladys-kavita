// -----------------------------------------------------------------------------
// Kavita REST API client. The user's API key (Kavita: Settings → 3rd Party
// Clients / Auth Keys) is exchanged for a JWT through the plugin route
// (POST /api/Plugin/authenticate, Kavita 0.5 to 0.9), renewed once on a 401.
// The key travels only in that query string: never logged, never in an error.
//
// The JWT says who the key belongs to (`nameid`, `name`) and whether it is an
// administrator's (`role`): the server statistics and the library scans are
// admin routes, the rest works with the key of any reader.
// -----------------------------------------------------------------------------

import { httpRequest } from './http.js';

export const ERROR_KINDS = Object.freeze({
  UNREACHABLE: 'unreachable', // no answer: down, wrong address, firewall
  TLS: 'tls', // the certificate does not verify
  AUTH: 'auth', // API key refused (401)
  FORBIDDEN: 'forbidden', // the key works but is not an administrator's (403)
  NOT_KAVITA: 'not_kavita', // something answers, not a Kavita server
  REDIRECT: 'redirect', // the address redirects (HTTP to HTTPS, a login page)
  HTTP: 'http', // any other HTTP error
});

export class KavitaError extends Error {
  /**
   * @param {string} kind one of ERROR_KINDS
   * @param {string} message English, for the logs (never contains a secret)
   * @param {object} [extra] { status }
   */
  constructor(kind, message, extra = {}) {
    super(message);
    this.name = 'KavitaError';
    this.kind = kind;
    Object.assign(this, extra);
  }
}

const TLS_CODES = new Set([
  'DEPTH_ZERO_SELF_SIGNED_CERT',
  'SELF_SIGNED_CERT_IN_CHAIN',
  'UNABLE_TO_VERIFY_LEAF_SIGNATURE',
  'UNABLE_TO_GET_ISSUER_CERT_LOCALLY',
  'CERT_HAS_EXPIRED',
  'ERR_TLS_CERT_ALTNAME_INVALID',
]);

// Sort fields of the series filter (SeriesSortField, Kavita 0.7.8+).
export const SORT = Object.freeze({ CREATED: 2, LAST_CHAPTER_ADDED: 4, READ_PROGRESS: 7 });

const PLUGIN_NAME = 'Gladys';

/** The claims of a JWT (no signature check: Kavita checks it, not us). */
export function jwtClaims(token) {
  try {
    const [, payload] = String(token).split('.');
    return JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'));
  } catch {
    return {};
  }
}

const filter = (sortField, isAscending = false) => ({
  statements: [],
  combination: 1,
  sortOptions: { sortField, isAscending },
  limitTo: 0,
});

export class KavitaClient {
  /**
   * @param {object} options
   * @param {string} options.url base URL, with the path of a reverse proxy if any
   * @param {string} options.apiKey
   * @param {Function} [options.request] HTTP seam (src/kavita/http.js)
   */
  constructor({ url, apiKey, request = httpRequest }) {
    this.url = url;
    this.apiKey = apiKey;
    this.request = request;
    this.token = null;
    /** Who the key belongs to: { id, name, admin }, known after the first login. */
    this.user = null;
  }

  async send(path, { method = 'GET', json, binary = false, token, timeoutMs } = {}) {
    let answer;
    try {
      answer = await this.request(`${this.url}${path}`, {
        method,
        binary,
        ...(json === undefined ? {} : { json }),
        headers: token ? { Authorization: `Bearer ${token}` } : {},
        ...(timeoutMs ? { timeoutMs } : {}),
      });
    } catch (err) {
      if (TLS_CODES.has(err.code)) {
        throw new KavitaError(ERROR_KINDS.TLS, `Certificate refused (${err.code})`);
      }
      throw new KavitaError(ERROR_KINDS.UNREACHABLE, err.code ? `${err.code}` : err.message);
    }
    // Never the query string in a message: it may carry the API key.
    const route = path.split('?')[0];
    const { status, headers = {}, body } = answer;
    if (status === 401) {
      throw new KavitaError(ERROR_KINDS.AUTH, 'API key refused', { status });
    }
    if (status === 403) {
      throw new KavitaError(ERROR_KINDS.FORBIDDEN, `${route}: not an administrator key`, {
        status,
      });
    }
    if (status >= 300 && status < 400) {
      throw new KavitaError(ERROR_KINDS.REDIRECT, `Redirected (HTTP ${status})`, { status });
    }
    if (status < 200 || status >= 300) {
      throw new KavitaError(ERROR_KINDS.HTTP, `${route} answered HTTP ${status}`, { status });
    }
    return { headers, body };
  }

  async json(answer, route) {
    const text = String(answer.body ?? '');
    if (text === '') {
      return null;
    }
    try {
      return JSON.parse(text);
    } catch {
      // A reverse proxy's login page, another web application...
      throw new KavitaError(ERROR_KINDS.NOT_KAVITA, `${route} did not answer JSON`);
    }
  }

  /** Exchange the API key for a JWT, and learn who it belongs to. */
  async login() {
    const route = '/api/Plugin/authenticate';
    let answer;
    try {
      answer = await this.send(
        `${route}?apiKey=${encodeURIComponent(this.apiKey)}&pluginName=${PLUGIN_NAME}`,
        { method: 'POST' },
      );
    } catch (err) {
      if (err.kind === ERROR_KINDS.HTTP && [404, 405].includes(err.status)) {
        throw new KavitaError(ERROR_KINDS.NOT_KAVITA, 'No Kavita plugin route at this address');
      }
      throw err;
    }
    const user = await this.json(answer, route);
    if (typeof user?.token !== 'string' || user.token === '') {
      throw new KavitaError(ERROR_KINDS.NOT_KAVITA, 'No Kavita token in the answer');
    }
    const claims = jwtClaims(user.token);
    const roles = [claims.role ?? []].flat();
    this.token = user.token;
    this.user = {
      id: Number(claims.nameid) || null,
      name: String(user.username || claims.name || ''),
      admin: roles.includes('Admin'),
    };
    return this.user;
  }

  /** An authenticated call; a refused (expired) token is renewed once. */
  async call(path, options = {}) {
    if (!this.token) {
      await this.login();
    }
    try {
      return await this.send(path, { ...options, token: this.token });
    } catch (err) {
      if (err.kind !== ERROR_KINDS.AUTH) {
        throw err;
      }
      this.token = null;
      await this.login();
      return this.send(path, { ...options, token: this.token });
    }
  }

  async get(path, options) {
    return this.json(await this.call(path, options), path.split('?')[0]);
  }

  /** A page of series and the total the `Pagination` header announces. */
  async page(path, body) {
    const answer = await this.call(path, { method: 'POST', json: body });
    const items = await this.json(answer, path.split('?')[0]);
    let total;
    try {
      total = Number(JSON.parse(answer.headers.pagination ?? 'null')?.totalItems);
    } catch {
      total = null;
    }
    return {
      items: Array.isArray(items) ? items : [],
      total: Number.isFinite(total) ? total : null,
    };
  }

  /** The version of the server ("0.9.1.4"). Public with the key. */
  async version() {
    const route = '/api/Plugin/version';
    const { body } = await this.send(`${route}?apiKey=${encodeURIComponent(this.apiKey)}`);
    const text = String(body ?? '')
      .trim()
      .replace(/^"|"$/g, '');
    if (!/^\d+\.\d+/.test(text)) {
      throw new KavitaError(ERROR_KINDS.NOT_KAVITA, `${route} did not answer a version`);
    }
    return text;
  }

  /** The libraries the user can see. */
  libraries() {
    return this.get('/api/Library/libraries');
  }

  /** Series, volume, chapter and file counts of the server (admin). */
  serverStats() {
    return this.get('/api/Stats/server/stats');
  }

  /** The last series created, the newest first. */
  recentlyAdded(size) {
    return this.page(`/api/Series/recently-added-v2?PageNumber=1&PageSize=${size}`, {
      ...filter(SORT.CREATED),
    });
  }

  /** The series that got a new chapter or volume last (also gives the series count). */
  recentlyUpdated(size) {
    return this.page(
      `/api/Series/all-v2?PageNumber=1&PageSize=${size}`,
      filter(SORT.LAST_CHAPTER_ADDED),
    );
  }

  /** The series the user read last, with their pages read. */
  recentlyRead(size) {
    return this.page(`/api/Series/all-v2?PageNumber=1&PageSize=${size}`, {
      ...filter(SORT.READ_PROGRESS),
    });
  }

  /** "On deck": the series in progress of the user. */
  onDeck(size) {
    return this.page(`/api/Series/on-deck?PageNumber=1&PageSize=${size}`, undefined);
  }

  /**
   * The reading statistics of the user (`totalPagesRead`). Kavita 0.9 route,
   * then the 0.8 one; null when neither exists.
   */
  async userStats(userId) {
    const id = encodeURIComponent(String(userId));
    for (const path of [`/api/Stats/user-read?userId=${id}`, `/api/Stats/user/${id}/read`]) {
      try {
        return await this.get(path);
      } catch (err) {
        if (err.kind !== ERROR_KINDS.HTTP || ![400, 404, 405].includes(err.status)) {
          throw err;
        }
      }
    }
    return null;
  }

  /** Scan one library for new files (admin); Kavita scans in the background. */
  scanLibrary(libraryId) {
    return this.call(`/api/Library/scan?libraryId=${encodeURIComponent(String(libraryId))}`, {
      method: 'POST',
    });
  }

  /** The cover of a series (a PNG or WebP thumbnail). */
  async cover(seriesId) {
    const { body, headers } = await this.call(
      `/api/Image/series-cover?seriesId=${encodeURIComponent(String(seriesId))}`,
      { binary: true },
    );
    return { body, contentType: String(headers['content-type'] ?? '') };
  }
}
