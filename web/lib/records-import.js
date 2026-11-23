/**
 * Bulk import of a school's existing record book.
 *
 * A school that has kept records for thirty years has them in a spreadsheet, and the columns
 * are whatever the person who started it typed: "Boys Basketball", "BBall", "points scored",
 * "Yr Broken", "1,845". Importing that as free text would reproduce the exact problem the
 * record directory exists to fix -- two sports spelled two ways, two stats for one thing,
 * and nothing filterable -- so every field is resolved to the canonical vocabulary before
 * anything is written.
 *
 * Pure functions only. The page shows the plan, the callable writes it, and both use
 * recordKey() so a second import of the same file cannot double the book.
 */
import { SPORT_RECORDS, SPORT_LABELS, LEVELS, buildStatList } from './records.js';

/// Splits CSV, TSV or semicolon-delimited text, honouring quotes.
///
/// Hand-rolled because the naive `split(',')` used by the roster importer breaks on
/// `"Smith, Jr.", 1845` -- a quoted name containing the delimiter, which is common in a file
/// exported from Excel. No dependency for forty lines of state machine.
export function parseTable(text) {
  const clean = String(text || '').replace(/^\uFEFF/, '');
  const firstLine = clean.split(/\r?\n/)[0] || '';
  const delim = firstLine.includes('\t')
    ? '\t'
    : (firstLine.includes(';') && !firstLine.includes(',')) ? ';' : ',';

  const rows = [];
  let row = [];
  let field = '';
  let quoted = false;

  for (let i = 0; i < clean.length; i += 1) {
    const c = clean[i];
    if (quoted) {
      if (c === '"') {
        if (clean[i + 1] === '"') { field += '"'; i += 1; } else { quoted = false; }
      } else { field += c; }
    } else if (c === '"') {
      quoted = true;
    } else if (c === delim) {
      row.push(field); field = '';
    } else if (c === '\n') {
      row.push(field); rows.push(row); row = []; field = '';
    } else if (c !== '\r') {
      field += c;
    }
  }
  if (field !== '' || row.length) { row.push(field); rows.push(row); }
  return rows.filter((r) => r.some((cell) => String(cell).trim() !== ''));
}

/// Header text -> field. Anything unrecognised is kept as a position so a file with odd
/// headers can still be read positionally rather than rejected outright.
const HEADER_ALIASES = {
  player: ['player', 'athlete', 'name', 'player name', 'athlete name', 'student', 'record holder', 'holder'],
  sport: ['sport', 'activity', 'team sport'],
  stat: ['stat', 'category', 'metric', 'record', 'stat type', 'record type', 'what'],
  value: ['value', 'mark', 'total', 'record value', 'score', 'amount', 'number'],
  season: ['season', 'year', 'year broken', 'yr', 'yr broken', 'year set', 'when', 'school year'],
  gender: ['gender', 'boys/girls', 'sex'],
  level: ['level', 'team level', 'division'],
  note: ['note', 'notes', 'comment', 'comments'],
};

const normalizeHeader = (h) => String(h || '').toLowerCase().replace(/[^a-z0-9/]+/g, ' ').trim();

/// Returns a map of field -> column index, plus which fields are missing.
export function detectColumns(headerRow) {
  const map = {};
  (headerRow || []).forEach((cell, index) => {
    const h = normalizeHeader(cell);
    for (const [field, aliases] of Object.entries(HEADER_ALIASES)) {
      if (map[field] !== undefined) continue;
      if (aliases.includes(h)) { map[field] = index; return; }
    }
  });
  const missing = ['player', 'stat', 'value'].filter((f) => map[f] === undefined);
  return { map, missing };
}

const norm = (s) => String(s || '')
  .toLowerCase()
  .replace(/&/g, ' and ')
  .replace(/[^a-z0-9]+/g, ' ')
  .trim();

const SPORT_ALIASES = {
  basketball: ['basketball', 'bball', 'b ball', 'hoops', 'hoop'],
  football: ['football', 'gridiron'],
  baseball: ['baseball', 'hardball'],
  softball: ['softball'],
  soccer: ['soccer', 'futbol', 'football soccer'],
  volleyball: ['volleyball', 'volley ball'],
  lacrosse: ['lacrosse', 'lax'],
  field_hockey: ['field hockey'],
  ice_hockey: ['ice hockey', 'hockey'],
  water_polo: ['water polo'],
  tennis: ['tennis'],
  wrestling: ['wrestling', 'wrestle'],
  swimming: ['swimming', 'swim', 'diving', 'dive'],
  track_field: ['track and field', 'track field', 'track', 'athletics'],
  cross_country: ['cross country', 'xc', 'x country', 'cross'],
  golf: ['golf'],
  bowling: ['bowling', 'bowl'],
  gymnastics: ['gymnastics', 'gym'],
  cheerleading: ['cheerleading', 'cheer'],
  dance: ['dance', 'dance team'],
};

const GENDER_WORDS = [
  { gender: 'boys', words: ['boys', 'boy', 'male', 'mens', 'men', 'b'] },
  { gender: 'girls', words: ['girls', 'girl', 'female', 'womens', 'women', 'g'] },
  { gender: 'coed', words: ['coed', 'co ed', 'mixed'] },
];

const LEVEL_WORDS = [
  { level: 'Varsity', words: ['varsity', 'var', 'v'] },
  { level: 'JV', words: ['jv', 'junior varsity', 'junior'] },
  { level: 'Freshman', words: ['freshman', 'freshmen', 'frosh', '9th'] },
  { level: 'Middle school', words: ['middle school', 'ms', 'junior high'] },
];

/// Pulls gender and level out of free text ("Boys Varsity Basketball") and returns what is
/// left to match as a sport. Removing the qualifiers first is what lets one column carry
/// "girls soccer" and another carry a separate gender column.
export function splitQualifiers(text) {
  const tokens = norm(text).split(' ').filter(Boolean);
  let gender = '';
  let level = '';

  const remaining = [];
  for (const token of tokens) {
    const g = GENDER_WORDS.find((entry) => entry.words.includes(token));
    if (g && !gender) { gender = g.gender; continue; }
    const l = LEVEL_WORDS.find((entry) => entry.words.includes(token));
    if (l && !level) { level = l.level; continue; }
    remaining.push(token);
  }
  return { gender, level, rest: remaining.join(' ') };
}

/// Free text -> canonical sport id, or '' when nothing matches.
///
/// Longest alias wins ("field hockey" before "hockey"), because otherwise a field-hockey row
/// lands in ice hockey and nobody notices until the directory is wrong.
export function resolveSport(text) {
  const { rest } = splitQualifiers(text);
  const hay = rest || norm(text);
  if (!hay) return '';

  let best = '';
  let bestLength = 0;
  for (const [sportId, aliases] of Object.entries(SPORT_ALIASES)) {
    for (const alias of aliases) {
      if (hay.includes(alias) && alias.length > bestLength) { best = sportId; bestLength = alias.length; }
    }
  }
  return best;
}

/// Synonyms people actually type. Kept conservative where a word is ambiguous: "yds" is
/// yards, but plain "yards" could be rushing, passing or receiving, so it is left unmatched
/// and reported rather than guessed.
const STAT_SYNONYMS = {
  pts: 'points', pt: 'points', points: 'points', scoring: 'points',
  reb: 'rebounds', rebound: 'rebounds', rebounds: 'rebounds',
  ast: 'assists', assist: 'assists', assists: 'assists',
  stl: 'steals', steal: 'steals',
  blk: 'blocks', block: 'blocks',
  td: 'touchdowns', tds: 'touchdowns', touchdown: 'touchdowns',
  rush: 'rushing_yards', rushing: 'rushing_yards', 'rush yds': 'rushing_yards',
  'rushing yds': 'rushing_yards', 'rushing yards': 'rushing_yards',
  pass: 'passing_yards', passing: 'passing_yards', 'pass yds': 'passing_yards',
  'passing yds': 'passing_yards', 'passing yards': 'passing_yards',
  rec: 'receiving_yards', receiving: 'receiving_yards', 'rec yds': 'receiving_yards',
  'receiving yds': 'receiving_yards', 'receiving yards': 'receiving_yards',
  tackle: 'tackles', tackles: 'tackles',
  sack: 'sacks', sacks: 'sacks',
  int: 'interceptions', ints: 'interceptions', interception: 'interceptions',
  fg: 'field_goals', fgs: 'field_goals',
  hit: 'hits', hr: 'home_runs', hrs: 'home_runs', 'home run': 'home_runs',
  rbi: 'rbis', rbis: 'rbis', sb: 'stolen_bases', 'stolen base': 'stolen_bases',
  k: 'strikeouts', ks: 'strikeouts', strikeout: 'strikeouts',
  goal: 'goals', goals: 'goals', save: 'saves', saves: 'saves',
  kill: 'kills', ace: 'aces', dig: 'digs',
  pin: 'pins', pins: 'pins', win: 'wins', wins: 'wins', takedown: 'takedowns',
  'ground ball': 'ground_balls', 'ground balls': 'ground_balls',
  stroke: 'strokes', strokes: 'strokes', 'low round': 'strokes', 'best round': 'strokes',
  'lowest round': 'strokes',
  putt: 'putts', putts: 'putts', fairway: 'fairways', fairways: 'fairways',
  time: 'best_time', 'best time': 'best_time', pr: 'personal_best',
  place: 'place', placement: 'place', finish: 'place',
  pinfall: 'pinfall', series: 'pinfall', strikes: 'strikes',
};

/// Words that can surround a stat name without changing which stat it is. Anything else
/// unrecognised makes the match fail, which is what stops "Quidditch Points" from becoming
/// "Points" just because one word happens to appear.
const STAT_FILLERS = new Set([
  'scored', 'total', 'totals', 'most', 'highest', 'lowest', 'best', 'in', 'a', 'an',
  'season', 'career', 'single', 'game', 'games', 'all', 'time', 'record', 'per', 'the',
]);

const tokensOf = (value) => norm(value).split(' ').filter(Boolean);

/// True when the label's words all appear in the typed text and the typed text adds nothing
/// unrecognised. "points scored" matches Points; "quidditch points" does not.
function tokensMatch(label, hay) {
  const labelTokens = tokensOf(label);
  const hayTokens = tokensOf(hay);
  if (labelTokens.length === 0) return false;
  if (!labelTokens.every((t) => hayTokens.includes(t))) return false;
  return hayTokens.every((t) => labelTokens.includes(t) || STAT_FILLERS.has(t));
}

/// Free text -> a stat in this sport's list (built-in or the school's own).
///
/// Order matters: an exact match beats a token match, which beats a synonym. There is no
/// "loose" substring fallback on purpose -- it made "yards" match rushing_yards and
/// "quidditch points" match points, and a wrong guess is worse than a reported row, because
/// the row is what somebody can fix.
export function resolveStat(text, sportId, customStats = []) {
  const hay = norm(text);
  if (!hay) return null;
  const options = buildStatList(sportId, customStats);

  const exact = options.find((s) => norm(s.label) === hay || norm(s.key) === hay);
  if (exact) return exact;

  const tokens = options.find(
    (s) => tokensMatch(s.label, hay) || tokensMatch(s.key.replace(/_/g, ' '), hay),
  );
  if (tokens) return tokens;

  const synonym = STAT_SYNONYMS[hay];
  if (synonym) return options.find((s) => s.key === synonym) || null;

  return null;
}

/// "1,845" / "1845 pts" / "22.31s" / "$1,000" -> 1845, 1845, 22.31, 1000
///
/// Currency symbols and thousands separators are removed rather than replaced: turning "$"
/// into "-" is exactly how "$1,000" became -1000.
export function parseValue(raw) {
  const cleaned = String(raw || '').replace(/,/g, '').replace(/\s/g, '');
  const match = cleaned.match(/-?\d*\.?\d+/);
  if (!match) return null;
  const n = Number(match[0]);
  return Number.isFinite(n) ? n : null;
}

/// A season label as the directory shows it: "2019-20" stays, 2019 becomes "2019",
/// "Spring 2019" becomes "2019".
export function parseSeason(raw) {
  const text = String(raw || '').trim();
  if (!text) return '';
  const range = text.match(/(19|20)\d{2}\s*[-/–]\s*(\d{4}|\d{2})/);
  if (range) return `${range[0].slice(0, 4)}-${range[0].slice(-2)}`;
  const single = text.match(/(19|20)\d{2}/);
  return single ? single[0] : text.slice(0, 20);
}

/// Stable identity of a record, used to skip rows already in the book.
///
/// The value is part of the key on purpose: a school with 1,845 points in 1998 and 1,900 in
/// 2019 has two legitimate rows for one stat. Re-importing the same file produces identical
/// keys, which is what makes the import safe to run twice.
export function recordKey({ sportId, statKey, playerName, season, value }) {
  return [
    sportId, statKey, norm(playerName), String(season || '').trim().toLowerCase(), Number(value),
  ].join('|');
}


/// Turns the file into a plan: the rows that can be written, and the rows that cannot, with
/// a reason each. Nothing is guessed silently -- an unmatched stat is reported, not dropped,
/// because a record book that quietly loses six rows is worse than one that refuses them.
export function buildPlan({ text, defaultSportId = '', defaultLevel = 'Varsity', customStats = [] }) {
  const table = parseTable(text);
  if (table.length === 0) {
    return { ready: [], problems: [{ line: 0, reason: 'The file is empty.' }], columns: {}, headers: [] };
  }

  // Header row? Only if it contains the three required columns. Otherwise every row is data
  // and is read positionally, which is what a hand-typed file needs.
  const headerCheck = detectColumns(table[0]);
  const hasHeader = headerCheck.missing.length === 0;
  const headers = hasHeader ? table[0] : [];
  const columns = hasHeader
    ? headerCheck.map
    : { sport: 0, stat: 1, player: 2, value: 3, season: 4 };
  const dataRows = hasHeader ? table.slice(1) : table;

  const ready = [];
  const problems = [];

  dataRows.forEach((cells, index) => {
    const line = hasHeader ? index + 2 : index + 1;
    const at = (field) => (columns[field] === undefined ? '' : String(cells[columns[field]] ?? '').trim());

    const sportText = at('sport');
    const statText = at('stat');
    const playerName = at('player');
    const valueRaw = at('value');

    const sportId = defaultSportId || resolveSport(sportText);
    if (!sportId) {
      problems.push({
        line,
        reason: sportText
          ? `I could not read the sport "${sportText}".`
          : 'No sport on this row, and no default sport chosen.',
        raw: cells.join(' | '),
      });
      return;
    }

    const stat = resolveStat(statText, sportId, customStats);
    if (!stat) {
      problems.push({
        line,
        reason: `I could not match the stat "${statText}" for ${SPORT_LABELS[sportId] || sportId}.`,
        raw: cells.join(' | '),
      });
      return;
    }

    const value = parseValue(valueRaw);
    if (value === null) {
      problems.push({ line, reason: `"${valueRaw}" is not a number.`, raw: cells.join(' | ') });
      return;
    }
    if (!playerName) {
      problems.push({ line, reason: 'No player name on this row.', raw: cells.join(' | ') });
      return;
    }

    // Qualifiers come from a dedicated column, from the sport text, or from both.
    const fromSport = splitQualifiers(sportText);
    const genderCell = norm(at('gender'));
    const gender = fromSport.gender
      || (genderCell.startsWith('boy') || genderCell === 'male' ? 'boys'
        : genderCell.startsWith('girl') || genderCell === 'female' ? 'girls'
          : genderCell.startsWith('co') || genderCell === 'mixed' ? 'coed' : '');

    const levelCell = at('level');
    const level = fromSport.level
      || LEVELS.find((l) => norm(l) === norm(levelCell))
      || defaultLevel;

    ready.push({
      line,
      sportId,
      statKey: stat.key,
      statLabel: stat.label,
      unit: stat.unit,
      direction: stat.direction,
      value,
      playerName,
      season: parseSeason(at('season')),
      level,
      gender,
      note: at('note').slice(0, 300),
    });
  });

  return { ready, problems, columns, headers, hasHeader };
}

