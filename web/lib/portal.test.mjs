import test from 'node:test';
import assert from 'node:assert';
import {
  VISIBLE_EVENT_TYPES,
  toMillis,
  partitionEvents,
  isFinalGame,
  resultFor,
  recordFromGames,
  formatRecord,
  myAthletes,
  displayName,
  formatWhen,
  portalSummary,
} from './portal.mjs';

const NOW = Date.UTC(2026, 10, 21, 12, 0, 0);
const SEC = NOW / 1000;

// --- dates ----------------------------------------------------------------

test('epoch seconds become milliseconds', () => {
  // The live data stores events.date as seconds in a double.
  assert.strictEqual(toMillis(1793819691.622469), 1793819691622);
});

test('milliseconds are not double-converted', () => {
  assert.strictEqual(toMillis(1793819691622), 1793819691622);
});

test('Firestore-shaped dates are accepted', () => {
  assert.strictEqual(toMillis({ seconds: 1793819691 }), 1793819691000);
  assert.strictEqual(toMillis({ toMillis: () => 1234 }), 1234);
});

test('missing or nonsense dates are null, not 1970', () => {
  // Rendering "Jan 1, 1970" for a malformed row is worse than saying nothing.
  assert.strictEqual(toMillis(undefined), null);
  assert.strictEqual(toMillis(null), null);
  assert.strictEqual(toMillis(0), null);
  assert.strictEqual(toMillis(-5), null);
  assert.strictEqual(toMillis('soon'), null);
  assert.strictEqual(toMillis(NaN), null);
});

// --- calendar -------------------------------------------------------------

test('upcoming is soonest-first, past is most-recent-first', () => {
  const events = [
    { id: 'far', date: SEC + 86400 * 3 },
    { id: 'soon', date: SEC + 3600 },
    { id: 'yesterday', date: SEC - 86400 },
    { id: 'lastweek', date: SEC - 86400 * 7 },
  ];
  const { upcoming, past } = partitionEvents(events, NOW);
  assert.deepStrictEqual(upcoming.map((e) => e.id), ['soon', 'far']);
  assert.deepStrictEqual(past.map((e) => e.id), ['yesterday', 'lastweek']);
});

test('an event dated exactly now counts as upcoming', () => {
  const { upcoming } = partitionEvents([{ id: 'now', date: SEC }], NOW);
  assert.strictEqual(upcoming.length, 1);
});

test('events without a usable date are dropped rather than shown under a wrong day', () => {
  const { upcoming, past } = partitionEvents([{ id: 'broken' }, { id: 'ok', date: SEC + 60 }], NOW);
  assert.deepStrictEqual(upcoming.map((e) => e.id), ['ok']);
  assert.strictEqual(past.length, 0);
});

test('null input does not throw', () => {
  assert.deepStrictEqual(partitionEvents(null, NOW), { upcoming: [], past: [] });
});

// --- results --------------------------------------------------------------

test('a live game is not counted as a result', () => {
  // A parent watching a 5-2 first quarter must not see a win.
  const live = { status: 'live', teamScore: 5, opponentScore: 2 };
  assert.strictEqual(isFinalGame(live), false);
  assert.strictEqual(resultFor(live), null);
  assert.strictEqual(formatRecord(recordFromGames([live])), '0-0');
});

test('final games tally wins, losses and ties', () => {
  const games = [
    { status: 'final', teamScore: 60, opponentScore: 55 },
    { status: 'completed', teamScore: 40, opponentScore: 50 },
    { status: 'final', teamScore: 7, opponentScore: 7 },
  ];
  assert.deepStrictEqual(recordFromGames(games), { wins: 1, losses: 1, ties: 1 });
  assert.strictEqual(formatRecord(recordFromGames(games)), '1-1-1');
});

test('a final game with a missing score is skipped, not counted as a loss', () => {
  const games = [
    { status: 'final', teamScore: 60, opponentScore: 55 },
    { status: 'final', teamScore: 12 },
  ];
  assert.strictEqual(resultFor(games[1]), null);
  assert.deepStrictEqual(recordFromGames(games), { wins: 1, losses: 0, ties: 0 });
});

test('the record omits the tie column when there are none', () => {
  assert.strictEqual(formatRecord({ wins: 3, losses: 2, ties: 0 }), '3-2');
});

// --- athletes -------------------------------------------------------------

test('a guardian is matched by the linked roster entry id', () => {
  const roster = [
    { id: 'r1', playerName: 'Ada' },
    { id: 'r2', playerName: 'Grace' },
  ];
  const mine = myAthletes(roster, { uid: 'parent-uid', linkedPlayerIds: ['r2'] });
  assert.deepStrictEqual(mine.map((e) => e.id), ['r2']);
});

test('a player is matched by the userId they claimed', () => {
  const roster = [
    { id: 'r1', playerName: 'Ada', userId: 'me' },
    { id: 'r2', playerName: 'Grace' },
  ];
  assert.deepStrictEqual(myAthletes(roster, { uid: 'me' }).map((e) => e.id), ['r1']);
});

test('a guardian with no link sees nobody, and nothing crashes', () => {
  const roster = [{ id: 'r1', playerName: 'Ada' }];
  assert.deepStrictEqual(myAthletes(roster, { uid: 'x' }), []);
  assert.deepStrictEqual(myAthletes(null, { uid: 'x' }), []);
  assert.deepStrictEqual(myAthletes(roster, {}), []);
});

test('a nameless roster entry still renders something honest', () => {
  assert.strictEqual(displayName({ id: 'r1' }), 'Unnamed athlete');
  assert.strictEqual(displayName({ id: 'r1', playerName: '  ' }), 'Unnamed athlete');
});

// --- formatting -----------------------------------------------------------

test('an absent date says so instead of showing an invalid date', () => {
  assert.strictEqual(formatWhen(null), 'Date to be announced');
});

test('a fixed timezone formats deterministically', () => {
  const ms = Date.UTC(2026, 10, 21, 23, 30, 0);
  const utc = formatWhen(ms, { timeZone: 'UTC' });
  assert.match(utc, /Nov 21/);
  assert.match(utc, /11:30 PM/);
});

// --- the rule-matching constant ------------------------------------------

test('the visible event types match the firestore rule exactly', () => {
  // Drift here is not cosmetic: the values become an `in` filter, and a type
  // the rule does not permit fails the entire list query.
  assert.deepStrictEqual(VISIBLE_EVENT_TYPES, ['game', 'meeting', 'meal', 'travel']);
  assert.ok(!VISIBLE_EVENT_TYPES.includes('practice'));
});

// --- summary --------------------------------------------------------------

test('the summary puts a guardian\u2019s athlete, next event and record together', () => {
  const summary = portalSummary({
    profile: { uid: 'p', linkedPlayerIds: ['r1'] },
    roster: [{ id: 'r1', playerName: 'Ada' }],
    events: [
      { id: 'game', type: 'game', date: SEC + 7200, title: 'vs Central' },
      { id: 'old', type: 'game', date: SEC - 86400, title: 'vs North' },
    ],
    games: [{ status: 'final', teamScore: 3, opponentScore: 1 }],
    nowMs: NOW,
  });
  assert.strictEqual(summary.athletes.length, 1);
  assert.strictEqual(summary.upcoming[0].id, 'game');
  assert.strictEqual(summary.recent[0].id, 'old');
  assert.deepStrictEqual(summary.record, { wins: 1, losses: 0, ties: 0 });
  assert.strictEqual(summary.hasAnything, true);
});

test('an account with nothing linked is honestly empty', () => {
  const summary = portalSummary({
    profile: { uid: 'p' }, roster: [], events: [], games: [], nowMs: NOW,
  });
  assert.strictEqual(summary.hasAnything, false);
  assert.strictEqual(summary.athletes.length, 0);
});

test('the summary caps lists so a long season cannot flood the page', () => {
  const events = Array.from({ length: 12 }, (_, i) => ({ id: 'e' + i, date: SEC + 3600 * (i + 1) }));
  const summary = portalSummary({ profile: { uid: 'p' }, roster: [], events, games: [], nowMs: NOW });
  assert.strictEqual(summary.upcoming.length, 5);
});

