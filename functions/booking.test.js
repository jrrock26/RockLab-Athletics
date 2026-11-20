const test = require('node:test');
const assert = require('node:assert/strict');

const {
  hasOverlap,
  localMinutesOfDay,
  localDayIndex,
  weekdayOf,
  openHoursViolation,
  expandRecurring,
  partitionCandidates,
} = require('./booking');

const MS_PER_DAY = 24 * 60 * 60 * 1000;
const MS_PER_MIN = 60 * 1000;
// US Eastern standard time: local = UTC - 5h, so the offset we pass is -300.
const EST = -300;

/** Builds an absolute timestamp for a local day number + minutes past midnight. */
function localTime(localDay, minutes, offset = EST) {
  return localDay * MS_PER_DAY - offset * MS_PER_MIN + minutes * MS_PER_MIN;
}

// 2026-01-05 is a Monday.
const MONDAY = Math.floor(Date.UTC(2026, 0, 5) / MS_PER_DAY);

test('hasOverlap treats touching intervals as free', () => {
  assert.equal(hasOverlap(100, 200, 200, 300), false, 'end == start is not a clash');
  assert.equal(hasOverlap(200, 300, 100, 200), false);
  assert.equal(hasOverlap(100, 200, 150, 250), true, 'partial overlap');
  assert.equal(hasOverlap(100, 300, 150, 200), true, 'nested');
  assert.equal(hasOverlap(100, 200, 100, 200), true, 'identical');
  assert.equal(hasOverlap(100, 200, 300, 400), false, 'disjoint');
});

test('local day and minute helpers round-trip', () => {
  const ts = localTime(MONDAY, 16 * 60); // Monday 16:00 local
  assert.equal(localDayIndex(ts, EST), MONDAY);
  assert.equal(localMinutesOfDay(ts, EST), 960);
  assert.equal(weekdayOf(MONDAY), 1, 'Monday is 1 in JS numbering');
});

test('open hours: inside the window is allowed', () => {
  const start = localTime(MONDAY, 16 * 60);
  const end = localTime(MONDAY, 18 * 60);
  assert.equal(openHoursViolation(start, end, EST, 6 * 60, 22 * 60), null);
});

test('open hours: before opening and after closing are refused', () => {
  const tooEarly = localTime(MONDAY, 5 * 60);
  const stillEarly = localTime(MONDAY, 7 * 60);
  assert.match(openHoursViolation(tooEarly, stillEarly, EST, 6 * 60, 22 * 60), /Outside open hours/);

  const late = localTime(MONDAY, 21 * 60);
  const tooLate = localTime(MONDAY, 23 * 60);
  assert.match(openHoursViolation(late, tooLate, EST, 6 * 60, 22 * 60), /Outside open hours/);
});

test('open hours: a booking cannot span midnight', () => {
  const start = localTime(MONDAY, 22 * 60);
  const end = localTime(MONDAY + 1, 60);
  assert.match(openHoursViolation(start, end, EST, 6 * 60, 23 * 60), /same day/);
});

test('open hours: end before start is refused', () => {
  const start = localTime(MONDAY, 18 * 60);
  const end = localTime(MONDAY, 16 * 60);
  assert.match(openHoursViolation(start, end, EST, 0, 24 * 60), /after the start/);
});

test('recurring: Mon-Thu for two weeks yields eight windows', () => {
  const start = localTime(MONDAY, 16 * 60);
  const end = localTime(MONDAY, 18 * 60);
  const windows = expandRecurring({
    startMs: start,
    endMs: end,
    weekdays: [1, 2, 3, 4],
    weeks: 2,
    utcOffsetMinutes: EST,
  });
  assert.equal(windows.length, 8);
  // Sorted, unique, and every window is 2 hours on a weekday we asked for.
  const starts = windows.map((w) => w.startMs);
  assert.deepEqual(starts, [...starts].sort((a, b) => a - b));
  assert.equal(new Set(starts).size, 8);
  for (const w of windows) {
    assert.equal(w.endMs - w.startMs, 2 * 60 * MS_PER_MIN);
    assert.ok([1, 2, 3, 4].includes(weekdayOf(localDayIndex(w.startMs, EST))));
    assert.equal(localMinutesOfDay(w.startMs, EST), 16 * 60);
  }
  assert.equal(windows[0].startMs, start, 'first window is the one the coach picked');
});

test('recurring: no weekdays means a single window', () => {
  const start = localTime(MONDAY, 16 * 60);
  const end = localTime(MONDAY, 18 * 60);
  const windows = expandRecurring({
    startMs: start, endMs: end, weekdays: [], weeks: 4, utcOffsetMinutes: EST,
  });
  assert.equal(windows.length, 1);
  assert.equal(windows[0].startMs, start);
});

test('partition: clashes are reported, free windows kept', () => {
  const mondayStart = localTime(MONDAY, 16 * 60);
  const mondayEnd = localTime(MONDAY, 18 * 60);
  const tuesdayStart = localTime(MONDAY + 1, 16 * 60);
  const tuesdayEnd = localTime(MONDAY + 1, 18 * 60);

  const existing = [
    { startMs: mondayStart, endMs: mondayEnd, status: 'booked', teamName: 'Girls Basketball' },
  ];
  const { available, conflicts } = partitionCandidates(
    [
      { startMs: mondayStart, endMs: mondayEnd },
      { startMs: tuesdayStart, endMs: tuesdayEnd },
    ],
    existing);

  assert.equal(conflicts.length, 1);
  assert.equal(conflicts[0].withTeam, 'Girls Basketball');
  assert.equal(available.length, 1);
  assert.equal(available[0].startMs, tuesdayStart);
});

test('partition: cancelled bookings do not block a slot', () => {
  const start = localTime(MONDAY, 16 * 60);
  const end = localTime(MONDAY, 18 * 60);
  const { available, conflicts } = partitionCandidates(
    [{ startMs: start, endMs: end }],
    [{ startMs: start, endMs: end, status: 'cancelled' }]);
  assert.equal(conflicts.length, 0);
  assert.equal(available.length, 1);
});
