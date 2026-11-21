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

/// Which roster entries belong to the signed-in account.
///
/// `guardianUserIds` on the roster entry is the primary signal because it is the
/// one a guardian cannot write: acceptInvitation sets it server-side, and roster
/// entries are writable only by coaches and ADs. `users.linkedPlayerIds` is
/// client-writable, so it stays as a fallback for rows written before
/// guardianUserIds existed — and a guardian who has only that can be shown an
/// athlete whose data the rules will refuse, which renders as an empty panel
/// rather than a leak.
export function myAthletes(rosterEntries, { uid, linkedPlayerIds } = {}) {
  const linked = Array.isArray(linkedPlayerIds) ? linkedPlayerIds : [];
  return (rosterEntries || []).filter((entry) => {
    if (!entry) return false;
    if (uid && Array.isArray(entry.guardianUserIds) && entry.guardianUserIds.includes(uid)) return true;
    if (uid && entry.userId === uid) return true;
    return linked.includes(entry.id) || Boolean(entry.userId && linked.includes(entry.userId));
  });
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

// --- requirements ---------------------------------------------------------

/// The states a family sees against a requirement — the six buckets the directive
/// asks for, named the way a parent would say them.
export const REQUIREMENT_STATUS = {
  REQUIRED: 'required',
  COMPLETED: 'completed',
  PENDING: 'pending_approval',
  REJECTED: 'rejected',
  EXPIRED: 'expired',
  OVERDUE: 'overdue',
};

export const REQUIREMENT_LABELS = {
  [REQUIREMENT_STATUS.REQUIRED]: 'Required',
  [REQUIREMENT_STATUS.COMPLETED]: 'Completed',
  [REQUIREMENT_STATUS.PENDING]: 'Pending approval',
  [REQUIREMENT_STATUS.REJECTED]: 'Needs correction',
  [REQUIREMENT_STATUS.EXPIRED]: 'Expired',
  [REQUIREMENT_STATUS.OVERDUE]: 'Overdue',
};

const COMPLETED_STATUSES = ['approved', 'completed', 'verified'];
const REJECTED_STATUSES = ['rejected', 'needs_correction', 'correction'];

/// One requirement's state, from the form definition and (if there is one) the
/// submission.
///
/// Precedence is deliberate. An approval is final UNLESS the document has since
/// expired: a lapsed physical makes the athlete ineligible again, so the family
/// must see "Expired" rather than a reassuring "Completed". For anything not yet
/// approved, a passed due date outranks the submitted/pending distinction,
/// because "Pending approval" that is three weeks late is really "Overdue".
export function requirementStatus(form, submission, nowMs) {
  const f = form || {};
  const s = String((submission && submission.status) || f.status || '').toLowerCase().trim();
  const expiresAt = toMillis(f.expiresAt != null ? f.expiresAt : submission && submission.expiresAt);
  const dueAt = toMillis(f.dueDate != null ? f.dueDate : submission && submission.dueDate);

  if (COMPLETED_STATUSES.includes(s)) {
    return expiresAt != null && nowMs >= expiresAt
      ? REQUIREMENT_STATUS.EXPIRED
      : REQUIREMENT_STATUS.COMPLETED;
  }
  if (s === 'expired') return REQUIREMENT_STATUS.EXPIRED;
  if (REJECTED_STATUSES.includes(s)) return REQUIREMENT_STATUS.REJECTED;
  if (dueAt != null && nowMs > dueAt) return REQUIREMENT_STATUS.OVERDUE;
  if (s === 'submitted') return REQUIREMENT_STATUS.PENDING;
  return REQUIREMENT_STATUS.REQUIRED;
}

/// Whether the FAMILY still has to act. This is deliberately narrower than
/// "not finished": once a form is submitted, the family's part is done and only
/// staff can move it, so it must not appear in their to-do count or offer a
/// Complete button. Found by walking the live portal, where three already-submitted
/// forms rendered as "3 still to do" with a button each.
export function isActionable(status) {
  return status === REQUIREMENT_STATUS.REQUIRED
    || status === REQUIREMENT_STATUS.OVERDUE
    || status === REQUIREMENT_STATUS.REJECTED
    || status === REQUIREMENT_STATUS.EXPIRED;
}

/// Waiting on staff, not on the family.
export function isAwaitingReview(status) {
  return status === REQUIREMENT_STATUS.PENDING;
}

/// Kept as the name the portal already uses for "needs the family to act".
export function isOutstanding(status) {
  return isActionable(status);
}

/// Only what the family must act on, soonest deadline first, so the panel leads
/// with the requirement that will make the athlete ineligible next. Rows with no
/// deadline sort last rather than jumping the queue.
export function outstandingRequirements(rows) {
  return (rows || [])
    .filter((r) => r && isActionable(r.status))
    .sort((a, b) => {
      const am = toMillis(a.dueAt);
      const bm = toMillis(b.dueAt);
      if (am == null && bm == null) return 0;
      if (am == null) return 1;
      if (bm == null) return -1;
      return am - bm;
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
