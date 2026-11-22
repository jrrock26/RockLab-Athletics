/**
 * School records: what each sport keeps, and how to read a record.
 *
 * Keys are taken verbatim from iOS `SportDefinition.swift`, which is the single place stat
 * sets are defined. A record whose key does not match the key the scorer writes is a record
 * that can never be broken, because the career ledger and the record book would be counting
 * different things under the same label.
 *
 * Nothing here is stored in the database. The defaults are code, so a school has a usable
 * record book on day one with no seeding job -- and a school that wants a stat nobody
 * thought of adds its own, stored per school, which is why buildStatList takes the custom
 * list as an argument instead of reading a global.
 */

/// Unit affects only formatting. It does NOT decide ranking -- `direction` does, and
/// conflating the two is how "lowest round wins" becomes "most strokes wins".
export const UNITS = {
  count: '',
  yards: ' yds',
  seconds: 's',
  strokes: ' strokes',
  points: '',
};

/// direction: 'high' means a bigger number is the better record (points scored); 'low' means
/// a smaller number is (a sprint time, a golf round, a finishing place).
const stat = (key, label, unit, direction) => ({ key, label, unit, direction });

export const SPORT_RECORDS = {
  football: [
    stat('touchdowns', 'Touchdowns', 'count', 'high'),
    stat('rushing_yards', 'Rushing yards', 'yards', 'high'),
    stat('passing_yards', 'Passing yards', 'yards', 'high'),
    stat('receiving_yards', 'Receiving yards', 'yards', 'high'),
    stat('tackles', 'Tackles', 'count', 'high'),
    stat('sacks', 'Sacks', 'count', 'high'),
    stat('interceptions', 'Interceptions', 'count', 'high'),
    stat('field_goals', 'Field goals', 'count', 'high'),
  ],
  basketball: [
    stat('points', 'Points', 'count', 'high'),
    stat('rebounds', 'Rebounds', 'count', 'high'),
    stat('assists', 'Assists', 'count', 'high'),
    stat('steals', 'Steals', 'count', 'high'),
    stat('blocks', 'Blocks', 'count', 'high'),
  ],
  baseball: [
    stat('hits', 'Hits', 'count', 'high'),
    stat('home_runs', 'Home runs', 'count', 'high'),
    stat('rbis', 'RBI', 'count', 'high'),
    stat('stolen_bases', 'Stolen bases', 'count', 'high'),
    stat('strikeouts', 'Strikeouts (pitching)', 'count', 'high'),
    stat('runs', 'Runs', 'count', 'high'),
  ],
  softball: [
    stat('hits', 'Hits', 'count', 'high'),
    stat('home_runs', 'Home runs', 'count', 'high'),
    stat('rbis', 'RBI', 'count', 'high'),
    stat('stolen_bases', 'Stolen bases', 'count', 'high'),
    stat('strikeouts', 'Strikeouts (pitching)', 'count', 'high'),
    stat('runs', 'Runs', 'count', 'high'),
  ],
  soccer: [
    stat('goals', 'Goals', 'count', 'high'),
    stat('assists', 'Assists', 'count', 'high'),
    stat('saves', 'Saves', 'count', 'high'),
  ],
  volleyball: [
    stat('kills', 'Kills', 'count', 'high'),
    stat('aces', 'Aces', 'count', 'high'),
    stat('blocks', 'Blocks', 'count', 'high'),
    stat('digs', 'Digs', 'count', 'high'),
    stat('assists', 'Assists', 'count', 'high'),
  ],
  lacrosse: [
    stat('goals', 'Goals', 'count', 'high'),
    stat('assists', 'Assists', 'count', 'high'),
    stat('ground_balls', 'Ground balls', 'count', 'high'),
    stat('saves', 'Saves', 'count', 'high'),
  ],
  field_hockey: [
    stat('goals', 'Goals', 'count', 'high'),
    stat('assists', 'Assists', 'count', 'high'),
    stat('saves', 'Saves', 'count', 'high'),
  ],
  ice_hockey: [
    stat('goals', 'Goals', 'count', 'high'),
    stat('assists', 'Assists', 'count', 'high'),
    stat('saves', 'Saves', 'count', 'high'),
  ],
  water_polo: [
    stat('goals', 'Goals', 'count', 'high'),
    stat('saves', 'Saves', 'count', 'high'),
    stat('steals', 'Steals', 'count', 'high'),
  ],
  tennis: [
    stat('singles_wins', 'Singles wins', 'count', 'high'),
    stat('doubles_wins', 'Doubles wins', 'count', 'high'),
    stat('aces', 'Aces', 'count', 'high'),
  ],
  wrestling: [
    stat('wins', 'Wins', 'count', 'high'),
    stat('pins', 'Pins', 'count', 'high'),
    stat('takedowns', 'Takedowns', 'count', 'high'),
  ],
  swimming: [
    // A time is a record only in the other direction: 22.31 beats 23.10.
    stat('best_time', 'Best time (100)', 'seconds', 'low'),
    stat('points', 'Points', 'points', 'high'),
  ],
  track_field: [
    stat('personal_best', 'Personal best (time)', 'seconds', 'low'),
    stat('place', 'Best place', 'count', 'low'),
    stat('points', 'Points', 'points', 'high'),
  ],
  cross_country: [
    stat('best_5k', 'Best 5K time', 'seconds', 'low'),
    stat('place', 'Best place', 'count', 'low'),
  ],
  golf: [
    // Lower is better for every golf record, which is exactly why direction is data rather
    // than something inferred from the unit.
    stat('strokes', 'Lowest round', 'strokes', 'low'),
    stat('putts', 'Fewest putts', 'count', 'low'),
    stat('fairways', 'Fairways hit', 'count', 'high'),
  ],
  bowling: [
    stat('pinfall', 'Highest series', 'count', 'high'),
    stat('strikes', 'Strikes', 'count', 'high'),
    stat('average', 'Highest average', 'count', 'high'),
  ],
  gymnastics: [
    stat('all_around', 'All-around score', 'points', 'high'),
    stat('vault', 'Vault', 'points', 'high'),
    stat('bars', 'Bars', 'points', 'high'),
    stat('beam', 'Beam', 'points', 'high'),
    stat('floor', 'Floor', 'points', 'high'),
  ],
  cheerleading: [stat('place', 'Best placement', 'count', 'low')],
  dance: [stat('place', 'Best placement', 'count', 'low')],
};

export const LEVELS = ['Varsity', 'JV', 'Freshman', 'Middle school'];

export const SPORT_LABELS = {
  football: 'Football',
  basketball: 'Basketball',
  baseball: 'Baseball',
  softball: 'Softball',
  soccer: 'Soccer',
  volleyball: 'Volleyball',
  lacrosse: 'Lacrosse',
  field_hockey: 'Field hockey',
  ice_hockey: 'Ice hockey',
  water_polo: 'Water polo',
  tennis: 'Tennis',
  wrestling: 'Wrestling',
  swimming: 'Swimming',
  track_field: 'Track & field',
  cross_country: 'Cross country',
  golf: 'Golf',
  bowling: 'Bowling',
  gymnastics: 'Gymnastics',
  cheerleading: 'Cheerleading',
  dance: 'Dance',
};

/// The stat list a school actually sees: the built-in set for the sport, plus whatever that
/// school has added. A custom stat for one sport must not appear under another, or a
/// basketball coach is offered "lowest 5K time".
export function buildStatList(sportId, customStats = []) {
  const builtIn = SPORT_RECORDS[sportId] || [];
  const seen = new Set(builtIn.map((s) => s.key));
  const custom = (customStats || [])
    .filter((s) => s && s.sportId === sportId && s.key && !seen.has(s.key))
    .map((s) => ({
      key: s.key,
      label: s.label || s.key,
      unit: s.unit || 'count',
      direction: s.direction === 'low' ? 'low' : 'high',
      custom: true,
    }));
  return [...builtIn, ...custom];
}

/// Records for one sport+stat, best first.
///
/// Sorted here rather than by a query: Firestore cannot sort by direction, and a school
/// record book is tens of rows, not thousands. Equal values keep the earlier season first,
/// because a record set in 1998 is not beaten by the same number in 2024.
export function sortRecords(records, direction = 'high') {
  const sign = direction === 'low' ? 1 : -1;
  // `Number(null)` is 0 and `Number('')` is 0, so a null value would rank as a real zero and
  // sit in the middle of the table looking like a legitimate record.
  const numeric = (value) => {
    if (typeof value === 'number') return value;
    if (typeof value === 'string' && value.trim() !== '') return Number(value);
    return Number.NaN;
  };
  return [...(records || [])]
    .filter((r) => r && Number.isFinite(numeric(r.value)))
    .sort((a, b) => {
      const diff = (numeric(a.value) - numeric(b.value)) * sign;
      if (diff !== 0) return diff;
      return String(a.season || '').localeCompare(String(b.season || ''));
    });
}

/// The record itself: the single best entry, or null when nothing qualifies.
export function bestRecord(records, direction = 'high') {
  const sorted = sortRecords(records, direction);
  return sorted.length ? sorted[0] : null;
}

/// Seconds are written the way a coach says them: 22.31s under a minute, 17:42.6 over.
export function formatRecordValue(value, unit = 'count') {
  const n = Number(value);
  if (!Number.isFinite(n)) return String(value ?? '');
  if (unit === 'seconds') {
    if (n < 60) return `${n.toFixed(2)}s`;
    const minutes = Math.floor(n / 60);
    const rest = n - minutes * 60;
    return `${minutes}:${rest < 10 ? '0' : ''}${rest.toFixed(1)}`;
  }
  const rounded = Number.isInteger(n) ? n : Math.round(n * 100) / 100;
  return `${rounded.toLocaleString('en-US')}${UNITS[unit] || ''}`;
}

/// Filters the directory. Every field is optional, and each one that is set narrows.
export function filterRecords(records, { sportId, statKey, level, query } = {}) {
  const q = String(query || '').trim().toLowerCase();
  return (records || []).filter((r) => {
    if (!r) return false;
    if (sportId && r.sportId !== sportId) return false;
    if (statKey && r.statKey !== statKey) return false;
    if (level && r.level !== level) return false;
    if (q) {
      const hay = `${r.playerName || ''} ${r.season || ''} ${r.gradYear || ''}`.toLowerCase();
      if (!hay.includes(q)) return false;
    }
    return true;
  });
}

/// Validation shared by the form and the rules' expectations.
///
/// Returns a sentence, not a boolean, because the form has to tell somebody what to fix and
/// "invalid" is not that. A record with no holder is the one that cannot be repaired later:
/// nobody will remember whose 1,845 points these were.
export function validateRecord({ sportId, statKey, value, playerName, level } = {}) {
  if (!sportId) return 'Choose the sport.';
  if (!SPORT_RECORDS[sportId]) return 'Choose the sport from the list.';
  if (!statKey) return 'Choose which stat this record is for.';
  const numeric = Number(value);
  if (value === '' || value == null || !Number.isFinite(numeric)) {
    return 'The record value has to be a number.';
  }
  if (numeric < 0) return 'A record cannot be negative.';
  if (!String(playerName || '').trim()) return 'Say who holds the record.';
  if (level && !LEVELS.includes(level)) return 'Choose a level from the list.';
  return '';
}

/// Docs are written from the browser, so the shape is built in one place: the rules check
/// the fields, and a field the page forgets would be a field the rules reject.
export function recordDoc({
  schoolId, sportId, statKey, statLabel, value, unit, direction,
  playerName, playerId, gradYear, season, level, gender, teamId, note, createdBy,
}) {
  return {
    schoolId,
    sportId,
    statKey,
    statLabel: statLabel || statKey,
    value: Number(value),
    unit: unit || 'count',
    direction: direction === 'low' ? 'low' : 'high',
    playerName: String(playerName).trim(),
    playerId: playerId || null,
    gradYear: gradYear ? Number(gradYear) : null,
    season: String(season || '').trim(),
    level: level || 'Varsity',
    gender: gender || '',
    teamId: teamId || null,
    note: String(note || '').trim().slice(0, 300),
    createdBy,
    createdAt: new Date(),
  };
}

/// A custom stat, shaped for `schools/{id}/recordStats/{key}`.
export function customStatDoc({ schoolId, sportId, label, unit, direction, createdBy }) {
  const clean = String(label || '').trim();
  return {
    schoolId,
    sportId,
    key: `custom_${clean.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '')}`,
    label: clean.slice(0, 60),
    unit: UNITS[unit] !== undefined ? unit : 'count',
    direction: direction === 'low' ? 'low' : 'high',
    createdBy,
    createdAt: new Date(),
  };
}

