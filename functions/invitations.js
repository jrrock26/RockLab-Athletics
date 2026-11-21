// Pure invitation rules: expiry, duplicate identity, and code fallback.
//
// Kept out of index.js so they can be tested without a Firestore emulator, in the
// same way booking.js and reel.js are. The callables import these; the tests import
// the same functions.

/// How long an invitation stays actionable. Two weeks is long enough for a family
/// to find the email and short enough that a stale link cannot resurrect a roster
/// spot that has since been filled.
const DEFAULT_TTL_DAYS = 14;

const DAY_MS = 24 * 60 * 60 * 1000;

/// Expiry timestamp for a new invitation, in epoch ms (the codebase stores dates
/// as doubles everywhere else).
function expiryFrom(nowMs, ttlDays = DEFAULT_TTL_DAYS) {
  return Number(nowMs) + ttlDays * DAY_MS;
}

/// Reads an expiry from an invitation, tolerating all three shapes in the data:
/// a number, a Firestore Timestamp, or a missing field.
///
/// Missing means "no expiry recorded" (older rows) and is treated as NOT expired:
/// silently voiding every legacy invitation would break outstanding invites that
/// were legitimately sent.
function readExpiryMs(invitation) {
  const raw = invitation && invitation.expiresAt;
  if (raw == null) return null;
  if (typeof raw === 'number') return raw;
  if (typeof raw.toMillis === 'function') return raw.toMillis();       // Firestore Timestamp
  if (typeof raw === 'object' && typeof raw.seconds === 'number') return raw.seconds * 1000;
  return null;
}

function isExpired(invitation, nowMs) {
  const expiry = readExpiryMs(invitation);
  if (expiry == null) return false;
  return Number(nowMs) >= expiry;
}

/// Identity used to prevent two live invitations for the same person and place.
///
/// Email is normalised because invitations are matched against the account email by
/// exact string compare; `teamId`/`role` are included so one person can legitimately
/// hold a coach invite for one team and a parent invite for another. Transfer
/// invitations are keyed separately: handing over the AD role is not a membership.
function invitationKey(invitation) {
  const inv = invitation || {};
  const email = String(inv.email || '').trim().toLowerCase();
  const schoolId = String(inv.schoolId || '');
  const teamId = String(inv.teamId || '');
  const role = String(inv.role || '');
  const kind = inv.adTransfer ? 'ad-transfer' : 'membership';
  return [kind, email, schoolId, teamId, role].join('|');
}

/// The code used to match a link to an invitation.
///
/// Older rows carry `token` (a UUID); newer rows carry `code` (6 chars). Both must
/// keep working or every invitation sent before the rename stops resolving.
function invitationCode(invitation) {
  const inv = invitation || {};
  return String(inv.code || inv.token || '').trim();
}

/// True when an invitation can still be accepted, with the reason when it cannot.
///
/// Returns a reason rather than a boolean so the caller can tell a user WHY, which
/// is the difference between "that link is old" and "something is broken".
function acceptanceBlocker(invitation, nowMs) {
  const inv = invitation || {};
  if (!inv.email) return 'Invitation has no recipient.';
  const status = String(inv.status || 'pending');
  if (status === 'accepted') return 'This invitation has already been accepted.';
  if (status === 'cancelled' || status === 'revoked') return 'This invitation was cancelled.';
  if (status === 'superseded') return 'This invitation was replaced by a newer one.';
  if (status === 'expired') return 'This invitation has expired.';
  if (status !== 'pending') return `This invitation is ${status}.`;
  if (isExpired(inv, nowMs)) return 'This invitation has expired.';
  return null;
}

module.exports = {
  DEFAULT_TTL_DAYS,
  expiryFrom,
  readExpiryMs,
  isExpired,
  invitationKey,
  invitationCode,
  acceptanceBlocker,
};
