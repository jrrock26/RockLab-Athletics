import test from 'node:test';
import assert from 'node:assert/strict';

import {
  SPORT_RECORDS,
  LEVELS,
  buildStatList,
  sortRecords,
  bestRecord,
  formatRecordValue,
  filterRecords,
  validateRecord,
  recordDoc,
  customStatDoc,
} from './records.js';

// --- the catalogue ---------------------------------------------------------

test('every sport keeps something, so no sport is a dead end', () => {
  for (const [sport, stats] of Object.entries(SPORT_RECORDS)) {
    assert.ok(stats.length > 0, `${sport} has no record stats`);
  }
  assert.ok(Object.keys(SPORT_RECORDS).length >= 20, 'the sports a school actually fields');
});

test('stat keys are unique within a sport and labels are not duplicated', () => {
  for (const [sport, stats] of Object.entries(SPORT_RECORDS)) {
    const keys = new Set();
    const labels = new Set();
    for (const s of stats) {
      assert.ok(!keys.has(s.key), `${sport} repeats key ${s.key}`);
      assert.ok(!labels.has(s.label), `${sport} repeats label ${s.label}`);
      keys.add(s.key);
      labels.add(s.label);
      assert.ok(['high', 'low'].includes(s.direction), `${sport}/${s.key} direction`);
      assert.ok(s.unit, `${sport}/${s.key} unit`);
    }
  }
});

test('direction follows the sport, not the unit', () => {
  const byKey = (sport, key) => SPORT_RECORDS[sport].find((s) => s.key === key);
  // Bigger is better for points; smaller is better for a round of golf and a sprint time.
  assert.equal(byKey('basketball', 'points').direction, 'high');
  assert.equal(byKey('golf', 'strokes').direction, 'low');
  assert.equal(byKey('swimming', 'best_time').direction, 'low');
  assert.equal(byKey('track_field', 'place').direction, 'low');
  // Fairways hit is a count where more is better -- same unit, opposite direction.
  assert.equal(byKey('golf', 'fairways').direction, 'high');
});

// --- what a school sees ----------------------------------------------------

test('a school stat list is the built-ins plus its own custom stats', () => {
  const custom = [
    { sportId: 'basketball', key: 'custom_charges_taken', label: 'Charges taken', direction: 'high' },
  ];
  const list = buildStatList('basketball', custom);
  assert.equal(list.length, SPORT_RECORDS.basketball.length + 1);
  const added = list.find((s) => s.key === 'custom_charges_taken');
  assert.equal(added.label, 'Charges taken');
  assert.equal(added.custom, true);
  assert.equal(added.unit, 'count', 'unit defaults rather than being undefined');
});

test('a custom stat does not leak into another sport', () => {
  // Otherwise a basketball coach is offered "lowest 5K time".
  const custom = [{ sportId: 'basketball', key: 'custom_charges', label: 'Charges', direction: 'high' }];
  const soccer = buildStatList('soccer', custom);
  assert.ok(!soccer.some((s) => s.key === 'custom_charges'));
});

test('a custom stat cannot shadow a built-in key', () => {
  const custom = [{ sportId: 'basketball', key: 'points', label: 'Points (mine)', direction: 'low' }];
  const list = buildStatList('basketball', custom);
  const points = list.filter((s) => s.key === 'points');
  assert.equal(points.length, 1, 'one stat per key, or the directory counts it twice');
  assert.equal(points[0].label, 'Points');
  assert.equal(points[0].direction, 'high');
});

// --- ranking ---------------------------------------------------------------

const rows = [
  { value: 1200, season: '2019-20', playerName: 'A' },
  { value: 1845, season: '1998-99', playerName: 'B' },
  { value: 1845, season: '2023-24', playerName: 'C' },
  { value: 900, season: '2010-11', playerName: 'D' },
];

test('a higher-is-better record sorts biggest first', () => {
  assert.deepEqual(sortRecords(rows, 'high').map((r) => r.playerName), ['B', 'C', 'A', 'D']);
});

test('a tie is held by the earlier season', () => {
  // 1,845 points in 1998 is not beaten by the same number in 2023.
  assert.equal(sortRecords(rows, 'high')[0].season, '1998-99');
});

test('a lower-is-better record sorts smallest first', () => {
  const rounds = [
    { value: 78, playerName: 'round 78' },
    { value: 71, playerName: 'round 71' },
    { value: 74, playerName: 'round 74' },
  ];
  assert.equal(bestRecord(rounds, 'low').value, 71);
  assert.equal(bestRecord(rounds, 'high').value, 78, 'same data, opposite question');
});

test('junk values are dropped instead of poisoning the sort', () => {
  const messy = [{ value: 'n/a' }, { value: null }, {}, { value: 42 }];
  assert.deepEqual(sortRecords(messy, 'high').map((r) => r.value), [42]);
  assert.equal(bestRecord([], 'high'), null);
  assert.equal(bestRecord(null, 'high'), null);
});

// --- display ---------------------------------------------------------------

test('values read the way a coach says them', () => {
  assert.equal(formatRecordValue(1845, 'count'), '1,845');
  assert.equal(formatRecordValue(1204.5, 'yards'), '1,204.5 yds');
  assert.equal(formatRecordValue(22.312, 'seconds'), '22.31s');
  assert.equal(formatRecordValue(1062.5, 'seconds'), '17:42.5');
  assert.equal(formatRecordValue(78, 'strokes'), '78 strokes');
});

// --- the directory ---------------------------------------------------------

const directory = [
  { sportId: 'basketball', statKey: 'points', level: 'Varsity', playerName: 'Ada', season: '2019-20', gradYear: 2020 },
  { sportId: 'basketball', statKey: 'points', level: 'JV', playerName: 'Grace', season: '2021-22' },
  { sportId: 'basketball', statKey: 'assists', level: 'Varsity', playerName: 'Katherine', season: '1998-99' },
  { sportId: 'golf', statKey: 'strokes', level: 'Varsity', playerName: 'Dana', season: '2023-24' },
];

test('the filter answers "varsity basketball points"', () => {
  const got = filterRecords(directory, { sportId: 'basketball', statKey: 'points', level: 'Varsity' });
  assert.deepEqual(got.map((r) => r.playerName), ['Ada']);
});

test('an empty filter shows everything, and each filter narrows', () => {
  assert.equal(filterRecords(directory, {}).length, 4);
  assert.equal(filterRecords(directory, { sportId: 'basketball' }).length, 3);
  assert.equal(filterRecords(directory, { level: 'JV' }).length, 1);
});

test('search matches the holder, the season and the class year', () => {
  assert.deepEqual(filterRecords(directory, { query: 'grace' }).map((r) => r.playerName), ['Grace']);
  assert.deepEqual(filterRecords(directory, { query: '1998' }).map((r) => r.playerName), ['Katherine']);
  assert.deepEqual(filterRecords(directory, { query: '2020' }).map((r) => r.playerName), ['Ada']);
});

// --- the form --------------------------------------------------------------

test('a record needs a sport, a stat, a number and a holder', () => {
  const good = { sportId: 'basketball', statKey: 'points', value: '1845', playerName: 'Ada', level: 'Varsity' };
  assert.equal(validateRecord(good), '');
  assert.match(validateRecord({ ...good, sportId: '' }), /sport/i);
  assert.match(validateRecord({ ...good, sportId: 'quidditch' }), /sport/i);
  assert.match(validateRecord({ ...good, statKey: '' }), /stat/i);
  assert.match(validateRecord({ ...good, value: '' }), /number/i);
  assert.match(validateRecord({ ...good, value: 'lots' }), /number/i);
  assert.match(validateRecord({ ...good, value: -5 }), /negative/i);
  assert.match(validateRecord({ ...good, playerName: '  ' }), /who holds/i);
  assert.match(validateRecord({ ...good, level: 'Elite' }), /level/i);
});

test('every level the form offers is a level the validator accepts', () => {
  for (const level of LEVELS) {
    assert.equal(validateRecord({ sportId: 'golf', statKey: 'strokes', value: 71, playerName: 'A', level }), '');
  }
});

test('the written document carries the stat snapshot, not just its key', () => {
  // A record must stay readable after a sport's default list changes.
  const doc = recordDoc({
    schoolId: 's1', sportId: 'golf', statKey: 'strokes', statLabel: 'Lowest round',
    value: '71', unit: 'strokes', direction: 'low', playerName: ' Ada ', season: '2023-24',
  });
  assert.equal(doc.value, 71);
  assert.equal(doc.statLabel, 'Lowest round');
  assert.equal(doc.direction, 'low');
  assert.equal(doc.level, 'Varsity');
  assert.equal(doc.playerName, 'Ada');
  assert.equal(doc.gradYear, null);
  assert.ok(doc.createdAt instanceof Date);
});

test('a custom stat becomes a storable key, and junk units fall back', () => {
  const doc = customStatDoc({
    schoolId: 's1', sportId: 'basketball', label: 'Charges Taken!', unit: 'nope', direction: 'low',
  });
  assert.equal(doc.key, 'custom_charges_taken');
  assert.equal(doc.unit, 'count');
  assert.equal(doc.direction, 'low');
  assert.equal(doc.sportId, 'basketball');
});

