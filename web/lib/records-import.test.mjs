import test from 'node:test';
import assert from 'node:assert/strict';

import {
  parseTable,
  detectColumns,
  splitQualifiers,
  resolveSport,
  resolveStat,
  parseValue,
  parseSeason,
  recordKey,
  buildPlan,
} from './records-import.js';

// --- reading the file ------------------------------------------------------

test('a quoted name containing a comma does not split the row', () => {
  // The naive split(',') used by the roster importer turns this into two broken rows.
  const rows = parseTable('Player,Points\n"Smith, Jr.",1845\n');
  assert.equal(rows.length, 2);
  assert.deepEqual(rows[1], ['Smith, Jr.', '1845']);
});

test('escaped quotes survive', () => {
  const rows = parseTable('Player,Note\n"Ada ""The Count"" Byron",x\n');
  assert.deepEqual(rows[1], ['Ada "The Count" Byron', 'x']);
});

test('tabs and semicolons are detected, and a BOM is stripped', () => {
  assert.deepEqual(parseTable('\uFEFFa\tb\n1\t2')[1], ['1', '2']);
  assert.deepEqual(parseTable('a;b\n1;2')[1], ['1', '2']);
});

test('blank lines are dropped instead of becoming empty records', () => {
  assert.equal(parseTable('a,b\n\n1,2\n\n').length, 2);
});

// --- columns ---------------------------------------------------------------

test('common header spellings are recognised', () => {
  const { map, missing } = detectColumns(['Athlete', 'Category', 'Mark', 'Yr Broken', 'Sport']);
  assert.equal(map.player, 0);
  assert.equal(map.stat, 1);
  assert.equal(map.value, 2);
  assert.equal(map.season, 3);
  assert.equal(map.sport, 4);
  assert.deepEqual(missing, []);
});

test('a file missing required columns says which ones', () => {
  const { missing } = detectColumns(['Name', 'Sport']);
  assert.deepEqual(missing, ['stat', 'value']);
});

// --- qualifiers ------------------------------------------------------------

test('gender and level are lifted out of the sport text', () => {
  assert.deepEqual(splitQualifiers('Boys Varsity Basketball'), {
    gender: 'boys', level: 'Varsity', rest: 'basketball',
  });
  assert.deepEqual(splitQualifiers('Girls JV Soccer'), {
    gender: 'girls', level: 'JV', rest: 'soccer',
  });
});

// --- sports ----------------------------------------------------------------

test('sports resolve from the ways people actually write them', () => {
  assert.equal(resolveSport('Boys Basketball'), 'basketball');
  assert.equal(resolveSport('bball'), 'basketball');
  assert.equal(resolveSport('Field Hockey'), 'field_hockey');
  assert.equal(resolveSport('hockey'), 'ice_hockey');
  assert.equal(resolveSport('XC'), 'cross_country');
  assert.equal(resolveSport('Track & Field'), 'track_field');
  assert.equal(resolveSport('Girls Varsity Soccer'), 'soccer');
});

test('field hockey does not fall into ice hockey', () => {
  // Longest alias wins; without that, "field hockey" matches "hockey" and the directory is
  // quietly wrong.
  assert.equal(resolveSport('field hockey'), 'field_hockey');
});

test('an unknown sport resolves to nothing rather than to the first close match', () => {
  assert.equal(resolveSport('quidditch'), '');
  assert.equal(resolveSport(''), '');
});

// --- stats -----------------------------------------------------------------

test('abbreviations resolve to the canonical key for that sport', () => {
  assert.equal(resolveStat('pts', 'basketball').key, 'points');
  assert.equal(resolveStat('Points scored', 'basketball').key, 'points');
  assert.equal(resolveStat('Rushing Yds', 'football').key, 'rushing_yards');
  assert.equal(resolveStat('TDs', 'football').key, 'touchdowns');
  assert.equal(resolveStat('Lowest round', 'golf').key, 'strokes');
});

test('a stat that belongs to another sport is not matched', () => {
  // "kills" is volleyball; offering it to golf would file the row under the wrong sport.
  assert.equal(resolveStat('kills', 'golf'), null);
});

test('an ambiguous word is reported rather than guessed', () => {
  // "yards" could be rushing, passing or receiving.
  assert.equal(resolveStat('yards', 'football'), null);
});

test('a school custom stat is matched by its label', () => {
  const custom = [{ sportId: 'basketball', key: 'custom_charges', label: 'Charges taken', direction: 'high', unit: 'count' }];
  assert.equal(resolveStat('charges taken', 'basketball', custom).key, 'custom_charges');
});

// --- values and seasons ----------------------------------------------------

test('numbers survive the decoration a spreadsheet adds', () => {
  assert.equal(parseValue('1,845'), 1845);
  assert.equal(parseValue('1845 pts'), 1845);
  assert.equal(parseValue('22.31s'), 22.31);
  assert.equal(parseValue('$1,000'), 1000);
  assert.equal(parseValue('n/a'), null);
  assert.equal(parseValue(''), null);
});

test('seasons normalise without inventing a range', () => {
  assert.equal(parseSeason('2019-20'), '2019-20');
  assert.equal(parseSeason('2019 - 2020'), '2019-20');
  assert.equal(parseSeason('Spring 2019'), '2019');
  assert.equal(parseSeason(2019), '2019');
  assert.equal(parseSeason(''), '');
});

// --- record identity -------------------------------------------------------

test('the same record always produces the same key', () => {
  const a = recordKey({ sportId: 'basketball', statKey: 'points', playerName: 'Ada Byron', season: '2019-20', value: 1845 });
  const b = recordKey({ sportId: 'basketball', statKey: 'points', playerName: ' ada  byron ', season: '2019-20 ', value: 1845 });
  assert.equal(a, b, 'case and spacing are not a different record');
});

test('two different marks by one player are two records', () => {
  const base = { sportId: 'basketball', statKey: 'points', playerName: 'Ada', season: '2019-20' };
  assert.notEqual(recordKey({ ...base, value: 1845 }), recordKey({ ...base, value: 1900 }));
  assert.notEqual(recordKey({ ...base, value: 1845 }), recordKey({ ...base, value: 1845, season: '1998-99' }));
});

// --- the whole plan --------------------------------------------------------

const mixedFile = [
  'Sport,Stat,Player,Value,Year Broken',
  'Boys Basketball,Points,Ada Byron,"1,845",2019-20',
  'Boys Football,Rushing Yards,Dana Reed,1204,1998-99',
  'Girls Volleyball,Kills,Grace Hopper,412,2021-22',
].join('\n');

test('one file holding several sports becomes records in each sport', () => {
  const plan = buildPlan({ text: mixedFile });
  assert.equal(plan.problems.length, 0);
  assert.deepEqual(plan.ready.map((r) => r.sportId), ['basketball', 'football', 'volleyball']);
  assert.deepEqual(plan.ready.map((r) => r.statKey), ['points', 'rushing_yards', 'kills']);
  assert.equal(plan.ready[0].value, 1845);
  assert.equal(plan.ready[0].gender, 'boys');
  assert.equal(plan.ready[0].level, 'Varsity', 'level defaults when the file does not say');
  assert.equal(plan.ready[1].season, '1998-99');
});

test('a single-sport file works with the sport chosen up front', () => {
  // The second workflow that was asked for: no sport column, just the default.
  const text = 'Stat,Player,Value\nPoints,Ada Byron,1845\nAssists,Ada Byron,612';
  const plan = buildPlan({ text, defaultSportId: 'basketball' });
  assert.equal(plan.problems.length, 0);
  assert.deepEqual(plan.ready.map((r) => r.statKey), ['points', 'assists']);
});

test('rows that cannot be read are reported with a line number, never dropped silently', () => {
  const text = [
    'Sport,Stat,Player,Value',
    'Boys Basketball,Points,Ada,1845',
    'Quidditch,Points,Ada,10',
    'Boys Basketball,Quidditch Points,Ada,10',
    'Boys Basketball,Points,Ada,lots',
    'Boys Basketball,Points,,99',
  ].join('\n');
  const plan = buildPlan({ text });
  assert.equal(plan.ready.length, 1);
  assert.equal(plan.problems.length, 4);
  assert.deepEqual(plan.problems.map((p) => p.line), [3, 4, 5, 6]);
  assert.match(plan.problems[0].reason, /sport/i);
  assert.match(plan.problems[1].reason, /stat/i);
  assert.match(plan.problems[2].reason, /number/i);
  assert.match(plan.problems[3].reason, /player/i);
});

test('a headerless file is read positionally', () => {
  const plan = buildPlan({ text: 'Boys Basketball,Points,Ada,1845,2019-20' });
  assert.equal(plan.ready.length, 1);
  assert.equal(plan.ready[0].sportId, 'basketball');
  assert.equal(plan.ready[0].season, '2019-20');
});

test('an empty file says so instead of pretending to succeed', () => {
  const plan = buildPlan({ text: '' });
  assert.equal(plan.ready.length, 0);
  assert.match(plan.problems[0].reason, /empty/i);
});

