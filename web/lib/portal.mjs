// Pure helpers for the parent portal. Kept free of Firebase imports so they can be
// tested directly with `node --test` — the date handling here is the part most
// likely to be wrong, and it cannot be checked by eye.

/// Event types a team follower is permitted to see. firestore.rules grants
/// followers the calendar "except practice details", so practices are filtered
/// out by the query itself, not by the UI. If this list and the rule ever
/// disagree, the list query is rejected outright.
export const VISIBLE_EVENT_TYPES = ['game', 'meeting', 'meal', 'travel'];

export function normalizeEmail(email) {
  return String(email || '').trim().toLowerCase();
}

/// Events store `date` as epoch SECONDS in a double. Older or imported rows may
/// carry milliseconds, a {seconds} object, or a Firestore Timestamp, so accept
/// all of them rather than rendering "Invalid Date" for one season's data.
export function toMillis(value) {
  if (value == null) return null;
  if (typeof value === 'number') {
    if (!Number.isFinite(value) || value <= 0) return null;
    // Anything below ~1973 in ms would be before this product existed, so a
    // value this small must be seconds.
    return value < 1e11 ? Math.round(value * 1000) : Math.round(value);
  }
  if (typeof value === 'object') {
    if (typeof value.toMillis === 'function') return value.toMillis();
    if (typeof value.seconds === 'number') return value.seconds * 1000;
    if (typeof value._seconds === 'number') return value._seconds * 1000;
  }
  return null;
}

/// Split a team calendar into what is still coming and what has happened, both
/// ordered the way a parent reads them: next thing first, last thing first.
export function partitionEvents(events, nowMs) {
  const withTime = (events || [])
    .map((e) => ({ event: e, at: toMillis(e && e.date) }))
    .filter((x) => x.at != null);

  const upcoming = withTime
    .filter((x) => x.at >= nowMs)
    .sort((a, b) => a.at - b.at)
    .map((x) => x.event);

  const past = withTime
    .filter((x) => x.at < nowMs)
    .sort((a, b) => b.at - a.at)
    .map((x) => x.event);

  return { upcoming, past };
}

/// A game counts toward the record only once it is final and both scores are
/// present. A live game is deliberately excluded: a parent watching a 5–2 first
/// quarter must not see it counted as a win.
export function isFinalGame(game) {
  if (!game) return false;
  const status = String(game.status || '').toLowerCase();
  return status === 'final' || status === 'completed';
}

export function resultFor(game) {
  if (!isFinalGame(game)) return null;
  const us = Number(game.teamScore);
  const them = Number(game.opponentScore);
  if (!Number.isFinite(us) || !Number.isFinite(them)) return null;
  if (us > them) return 'W';
  if (us < them) return 'L';
  return 'T';
}

export function recordFromGames(games) {
  const tally = { wins: 0, losses: 0, ties: 0 };
  (games || []).forEach((g) => {
    const r = resultFor(g);
    if (r === 'W') tally.wins += 1;
    if (r === 'L') tally.losses += 1;
    if (r === 'T') tally.ties += 1;
  });
  return tally;
}

export function formatRecord(tally) {
  if (!tally) return '0-0';
  return `${tally.wins}-${tally.losses}${tally.ties ? `-${tally.ties}` : ''}`;
}

/// Which roster entries belong to the signed-in account. An invitation links a
/// guardian by roster entry id; a player claims the entry by userId. Accept both,
/// because either can be the thing that was recorded.
export function myAthletes(rosterEntries, { uid, linkedPlayerIds } = {}) {
  const linked = Array.isArray(linkedPlayerIds) ? linkedPlayerIds : [];
  return (rosterEntries || []).filter(
    (entry) => entry && (linked.includes(entry.id) || (uid && entry.userId === uid)),
  );
}

export function displayName(entry) {
  const name = String((entry && entry.playerName) || '').trim();
  if (name) return name;
  // A roster entry always has a player name; if it does not, say so plainly
  // instead of showing an empty card.
  return 'Unnamed athlete';
}

export function formatWhen(ms, { locale, timeZone } = {}) {
  if (ms == null) return 'Date to be announced';
  const d = new Date(ms);
  if (Number.isNaN(d.getTime())) return 'Date to be announced';
  return d.toLocaleString(locale || 'en-US', {
    weekday: 'short', month: 'short', day: 'numeric',
    hour: 'numeric', minute: '2-digit',
    ...(timeZone ? { timeZone } : {}),
  });
}

/// Everything the portal needs to decide what to show, in one place, so the page
/// stays a rendering concern.
export function portalSummary({ profile, roster, events, games, nowMs }) {
  const athletes = myAthletes(roster, {
    uid: profile && profile.uid,
    linkedPlayerIds: profile && profile.linkedPlayerIds,
  });
  const { upcoming, past } = partitionEvents(events, nowMs);
  const finals = (games || []).filter(isFinalGame);
  return {
    athletes,
    upcoming: upcoming.slice(0, 5),
    recent: past.slice(0, 5),
    record: recordFromGames(finals),
    hasAnything: athletes.length > 0 || upcoming.length > 0 || past.length > 0,
  };
}
