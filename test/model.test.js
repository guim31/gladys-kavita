import { test } from 'node:test';
import assert from 'node:assert/strict';
import { jwtClaims } from '../src/kavita/client.js';
import { parseDate, parseSeriesList } from '../src/kavita/model.js';
import { fixture, makeToken } from './helpers/fakeKavita.js';

test('the series of a real answer', () => {
  const [epub, comic] = parseSeriesList(fixture('recently-added'));
  assert.equal(epub.title, 'Quiet Morning');
  assert.equal(epub.format, 'epub');
  assert.equal(epub.cover, false);
  assert.equal(comic.format, 'archive');
  assert.equal(comic.progress, 33);
  assert.equal(comic.finished, false);
  assert.equal(comic.chapterAt, Date.parse('2026-10-22T00:41:26.497Z'));
  assert.deepEqual(parseSeriesList(null), []);
  assert.deepEqual(parseSeriesList([{ name: 'no id' }]), []);
});

test('Kavita dates: "never", UTC without Z, local time', () => {
  assert.equal(parseDate('0001-01-01T00:00:00'), null);
  assert.equal(
    parseDate('2026-10-22T00:41:26.4975819', true),
    Date.parse('2026-10-22T00:41:26.497Z'),
  );
  assert.equal(parseDate(''), null);
  assert.equal(parseDate('garbage'), null);
});

test('the claims of the token: who, and whether an administrator', () => {
  const claims = jwtClaims(makeToken({ name: 'admin', nameid: '1', role: ['Admin', 'Login'] }));
  assert.deepEqual(claims.role, ['Admin', 'Login']);
  assert.deepEqual(jwtClaims('not-a-token'), {});
});
