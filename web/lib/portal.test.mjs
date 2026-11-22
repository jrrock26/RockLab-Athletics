import test from 'node:test';
import assert from 'node:assert';
import {
  VISIBLE_EVENT_TYPES,
  ALL_EVENT_TYPES,
  eventTypesFor,
  rsvpId,
  normalizeRole,
  toMillis,
  partitionEvents,
  isFinalGame,
  resultFor,
  recordFromGames,
  formatRecord,
  myAthletes,
  displayName,
  personName,
  isArchivedEntry,
  activeRoster,
  formatWhen,
  portalSummary,
  REQUIREMENT_STATUS,
  REQUIREMENT_LABELS,
  requirementStatus,
  isOutstanding,
  outstandingRequirements,
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

// --- roster archival (a closed season marks, never deletes) ----------------

test('an archived entry is not on the roster', () => {
  const entries = [
    { id: 'r1', playerName: 'Ada', state: 'active' },
    { id: 'r2', playerName: 'Grace', state: 'archived', archivedAt: 1 },
  ];
  assert.deepStrictEqual(activeRoster(entries).map((e) => e.id), ['r1']);
});

test('an entry with no state field is still on the roster', () => {
  // THE load-bearing case. Every roster entry written before seasons existed has no
  // state at all. If absence meant archived, deploying this would empty every roster
  // in every school -- and the backfill has never been run.
  const entries = [{ id: 'r1', playerName: 'Ada' }, { id: 'r2', playerName: 'Grace', state: 'archived' }];
  assert.deepStrictEqual(activeRoster(entries).map((e) => e.id), ['r1']);
  assert.strictEqual(isArchivedEntry({ id: 'r1' }), false);
});

test('only the explicit archived marker counts', () => {
  assert.strictEqual(isArchivedEntry({ state: 'archived' }), true);
  assert.strictEqual(isArchivedEntry({ state: 'active' }), false);
  assert.strictEqual(isArchivedEntry({ state: 'anything else' }), false);
  assert.strictEqual(isArchivedEntry(null), false);
  assert.strictEqual(isArchivedEntry(undefined), false);
});

test('activeRoster tolerates nulls and a missing list', () => {
  assert.deepStrictEqual(activeRoster(null), []);
  assert.deepStrictEqual(activeRoster(undefined), []);
  assert.deepStrictEqual(activeRoster([null, { id: 'r1' }]).map((e) => e.id), ['r1']);
});

// --- one name from four document shapes ------------------------------------

test('each collection\'s name field is read, so no screen has to know the shape', () => {
  // These four are the real shapes in production. Every mismatch below has already
  // shipped as a visible bug at least once.
  assert.strictEqual(personName({ displayName: 'Dana Reed' }), 'Dana Reed'); // users, members
  assert.strictEqual(personName({ playerName: 'Ada Byron' }), 'Ada Byron'); // roster entries
  assert.strictEqual(personName({ name: 'Grace Hopper' }), 'Grace Hopper'); // players documents
  assert.strictEqual(personName({ firstName: 'Katherine', lastName: 'Johnson' }), 'Katherine Johnson');
});

test('displayName wins over the other fields on the same document', () => {
  // A member row may carry both. The Auth-set name is the one a person chose.
  assert.strictEqual(
    personName({ displayName: 'Dana Reed', name: 'dana.reed@school.edu', email: 'dana.reed@school.edu' }),
    'Dana Reed',
  );
});

test('an address is a last resort, and only when there is no name at all', () => {
  // Better than an empty cell, never the intent. This is what the coach list showed
  // for every coach before the field names were reconciled.
  assert.strictEqual(personName({ email: 'coach@school.edu' }), 'coach@school.edu');
  assert.strictEqual(personName({ displayName: 'Dana Reed', email: 'd@school.edu' }), 'Dana Reed');
});

test('whitespace is not a name', () => {
  assert.strictEqual(personName({ displayName: '   ', playerName: 'Ada' }), 'Ada');
  assert.strictEqual(personName({ displayName: '  ' }), '');
});

test('a missing or malformed record falls back without throwing', () => {
  assert.strictEqual(personName(null, 'Coach'), 'Coach');
  assert.strictEqual(personName(undefined), '');
  assert.strictEqual(personName({ displayName: 42 }, 'Coach'), 'Coach');
  assert.strictEqual(personName('Ada Byron'), 'Ada Byron'); // a bare string is a name
});

test('the roster-entry helper keeps its own honest fallback', () => {
  assert.strictEqual(displayName({ id: 'r1' }), 'Unnamed athlete');
  assert.strictEqual(displayName({ id: 'r1', playerName: 'Ada' }), 'Ada');
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

// --- guardian matching (guardianUserIds first) ----------------------------

test('a guardian is matched by guardianUserIds on the roster entry', () => {
  // The server-written marker. This is the case that failed before the rules fix:
  // the account was a guardian but had no linkedPlayerIds at all.
  const roster = [
    { id: 'r1', playerName: 'Ada', guardianUserIds: ['parent-uid'] },
    { id: 'r2', playerName: 'Grace', guardianUserIds: ['someone-else'] },
  ];
  const mine = myAthletes(roster, { uid: 'parent-uid' });
  assert.deepStrictEqual(mine.map((e) => e.id), ['r1']);
});

test('a stale linkedPlayerIds entry still shows the athlete, but the panel will be empty', () => {
  // Deliberate consequence of keeping linkedPlayerIds as a fallback: the account
  // may be shown an athlete whose data firestore.rules will refuse to release.
  // The failure mode is an empty panel, never a leak — the read is denied, not
  // widened. Tightening this to guardianUserIds-only would hide the athlete
  // instead, which is arguably more honest but would strand legacy rows.
  const roster = [{ id: 'r1', playerName: 'Ada', guardianUserIds: ['other'] }];
  assert.deepStrictEqual(myAthletes(roster, { uid: 'parent-uid', linkedPlayerIds: ['r1'] }).map((e) => e.id), ['r1']);
});

test('a linked player uid is still accepted for legacy rows', () => {
  const roster = [{ id: 'r1', playerName: 'Ada', userId: 'kid-uid' }];
  const mine = myAthletes(roster, { uid: 'parent-uid', linkedPlayerIds: ['kid-uid'] });
  assert.deepStrictEqual(mine.map((e) => e.id), ['r1']);
});

test('an entry with a malformed guardianUserIds does not throw', () => {
  assert.deepStrictEqual(myAthletes([{ id: 'r1', guardianUserIds: 'nope' }], { uid: 'x' }), []);
});

// --- requirement status ---------------------------------------------------

test('nothing submitted is Required', () => {
  assert.strictEqual(requirementStatus({ id: 'f1' }, null, NOW), REQUIREMENT_STATUS.REQUIRED);
});

test('a submission awaiting review is Pending approval, not Completed', () => {
  // A family must be able to tell that staff have not yet approved it.
  assert.strictEqual(
    requirementStatus({ id: 'f1' }, { status: 'submitted' }, NOW),
    REQUIREMENT_STATUS.PENDING,
  );
});

test('an approved form is Completed', () => {
  assert.strictEqual(
    requirementStatus({ id: 'f1' }, { status: 'approved' }, NOW),
    REQUIREMENT_STATUS.COMPLETED,
  );
});

test('an approved form whose document has lapsed is Expired, not Completed', () => {
  // A lapsed physical makes the athlete ineligible again; showing Completed here
  // would be the most damaging kind of wrong.
  const form = { id: 'f1', expiresAt: SEC - 86400 };
  assert.strictEqual(
    requirementStatus(form, { status: 'approved' }, NOW),
    REQUIREMENT_STATUS.EXPIRED,
  );
});

test('an approved form expiring in the future stays Completed', () => {
  const form = { id: 'f1', expiresAt: SEC + 86400 };
  assert.strictEqual(
    requirementStatus(form, { status: 'approved' }, NOW),
    REQUIREMENT_STATUS.COMPLETED,
  );
});

test('a rejected submission needs correction', () => {
  assert.strictEqual(
    requirementStatus({ id: 'f1' }, { status: 'rejected' }, NOW),
    REQUIREMENT_STATUS.REJECTED,
  );
});

test('a passed due date outranks the pending state', () => {
  const form = { id: 'f1', dueDate: SEC - 3600 };
  assert.strictEqual(
    requirementStatus(form, { status: 'submitted' }, NOW),
    REQUIREMENT_STATUS.OVERDUE,
  );
});

test('a future due date leaves a submitted form Pending approval', () => {
  const form = { id: 'f1', dueDate: SEC + 3600 };
  assert.strictEqual(
    requirementStatus(form, { status: 'submitted' }, NOW),
    REQUIREMENT_STATUS.PENDING,
  );
});

test('an approved form is never Overdue, even past its due date', () => {
  const form = { id: 'f1', dueDate: SEC - 86400 };
  assert.strictEqual(
    requirementStatus(form, { status: 'approved' }, NOW),
    REQUIREMENT_STATUS.COMPLETED,
  );
});

test('every status has a human label', () => {
  for (const value of Object.values(REQUIREMENT_STATUS)) {
    assert.ok(REQUIREMENT_LABELS[value], `missing label for ${value}`);
  }
});

test('a submitted form is no longer the family\u2019s to-do', () => {
  // Regression from the live walkthrough: three already-submitted forms rendered
  // as "3 still to do" with a Complete button on each, inviting a parent to
  // resubmit paperwork they had already done.
  assert.strictEqual(isOutstanding(REQUIREMENT_STATUS.PENDING), false);
  assert.strictEqual(isOutstanding(REQUIREMENT_STATUS.COMPLETED), false);
});

test('the family must still act on required, overdue, rejected and expired', () => {
  for (const key of ['REQUIRED', 'OVERDUE', 'REJECTED', 'EXPIRED']) {
    assert.strictEqual(isOutstanding(REQUIREMENT_STATUS[key]), true, `${key} should be actionable`);
  }
});

test('pending rows are excluded from the outstanding list', () => {
  const rows = [
    { id: 'sent', status: REQUIREMENT_STATUS.PENDING },
    { id: 'todo', status: REQUIREMENT_STATUS.REQUIRED },
  ];
  assert.deepStrictEqual(outstandingRequirements(rows).map((r) => r.id), ['todo']);
});

test('outstanding rows lead with the soonest deadline and drop completed ones', () => {
  const rows = [
    { id: 'done', status: REQUIREMENT_STATUS.COMPLETED, dueAt: SEC + 60 },
    { id: 'later', status: REQUIREMENT_STATUS.REQUIRED, dueAt: SEC + 7200 },
    { id: 'soon', status: REQUIREMENT_STATUS.OVERDUE, dueAt: SEC - 7200 },
    { id: 'nodate', status: REQUIREMENT_STATUS.REQUIRED },
  ];
  const out = outstandingRequirements(rows);
  assert.deepStrictEqual(out.map((r) => r.id), ['soon', 'later', 'nodate']);
});

test('outstandingRequirements tolerates null', () => {
  assert.deepStrictEqual(outstandingRequirements(null), []);
});

// --- cross-platform contract ------------------------------------------------
//
// These three exist because iOS and the web drifted apart in exactly these
// places: a role spelled two ways, a calendar that disagreed with the rules, and
// an RSVP id each client invented for itself. `CrossPlatformContractTests.swift`
// asserts the same values on the Swift side.

test('rsvpId carries the athlete so each child answers separately', () => {
  assert.equal(rsvpId('uid1', 'entry9'), 'uid1__entry9');
});

test('rsvpId falls back to the bare uid when there is no athlete', () => {
  assert.equal(rsvpId('uid1', ''), 'uid1');
  assert.equal(rsvpId('uid1', null), 'uid1');
  assert.equal(rsvpId('', 'entry9'), '');
});

test('a guardian is a member: the calendar includes practice', () => {
  assert.ok(eventTypesFor('parent').includes('practice'));
  assert.deepStrictEqual(eventTypesFor('parent'), ALL_EVENT_TYPES);
});

test('a follower never asks for a type the rule withholds', () => {
  assert.ok(!eventTypesFor('follower').includes('practice'));
  assert.deepStrictEqual(eventTypesFor('follower'), VISIBLE_EVENT_TYPES);
});

test('the legacy role spelling is the parent role', () => {
  assert.equal(normalizeRole('family'), 'parent');
  assert.equal(normalizeRole(' PARENT '), 'parent');
  assert.equal(normalizeRole('follower'), 'follower');
  assert.equal(normalizeRole(undefined), '');
});

