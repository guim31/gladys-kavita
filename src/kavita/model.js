// -----------------------------------------------------------------------------
// From the answers of the Kavita API to the few fields the integration uses.
// Every parser accepts a missing or odd answer and returns something usable:
// a server mid-update must not crash the reading loop.
// -----------------------------------------------------------------------------

// Formats of a series (MangaFormat): the four the user knows.
export const FORMATS = Object.freeze({ 0: 'images', 1: 'archive', 3: 'epub', 4: 'pdf' });

const number = (value) => (Number.isFinite(Number(value)) ? Number(value) : null);
const text = (value) => (typeof value === 'string' ? value.trim() : '');

// Kavita writes "0001-01-01T00:00:00" for "never".
const NEVER = /^0001-/;

/**
 * A date of Kavita: the `...Utc` fields are UTC without the "Z", the others are
 * in the time zone of the server (Gladys runs in the same one, most often).
 * @returns {number|null} epoch milliseconds
 */
export function parseDate(value, utc = false) {
  const raw = text(value);
  if (!raw || NEVER.test(raw)) {
    return null;
  }
  const zoned = /(Z|[+-]\d\d:?\d\d)$/i.test(raw);
  const at = Date.parse(utc && !zoned ? `${raw}Z` : raw);
  return Number.isFinite(at) ? at : null;
}

export function parseLibraries(answer) {
  return (Array.isArray(answer) ? answer : [])
    .map((library) => ({ id: number(library?.id), name: text(library?.name) }))
    .filter((library) => library.id !== null && library.name);
}

/** A series of a list (SeriesDto). */
export function parseSeries(entry) {
  const id = number(entry?.id);
  if (id === null) {
    return null;
  }
  const pages = Math.max(0, number(entry.pages) ?? 0);
  const pagesRead = Math.max(0, number(entry.pagesRead) ?? 0);
  return {
    id,
    title: text(entry.localizedName) || text(entry.name) || `#${id}`,
    library: text(entry.libraryName),
    libraryId: number(entry.libraryId),
    format: FORMATS[entry.format] ?? 'unknown',
    // Kavita has no cover for an EPUB without an image: no image key then.
    cover: typeof entry.coverImage === 'string' && entry.coverImage !== '',
    pages,
    pagesRead,
    progress: pages > 0 ? Math.min(100, Math.round((pagesRead / pages) * 100)) : 0,
    finished: pages > 0 && pagesRead >= pages,
    createdAt: parseDate(entry.created),
    lastChapterAddedUtc: NEVER.test(text(entry.lastChapterAddedUtc))
      ? ''
      : text(entry.lastChapterAddedUtc),
    lastReadAt: parseDate(entry.latestReadDate),
  };
}

export const parseSeriesList = (list) =>
  (Array.isArray(list) ? list : []).map(parseSeries).filter(Boolean);

/** The counts of the server statistics (admin). */
export function parseServerStats(answer) {
  return {
    series: number(answer?.seriesCount),
    volumes: number(answer?.volumeCount),
    chapters: number(answer?.chapterCount),
  };
}

/** Total pages read by the user, all time. */
export const parsePagesRead = (answer) => {
  const pages = number(answer?.totalPagesRead);
  return pages === null ? null : Math.max(0, pages);
};
