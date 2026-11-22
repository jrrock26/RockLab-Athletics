/**
 * Player claim: the rules of who may take ownership of a player profile.
 *
 * Pure functions only. The decisions here are the ones worth testing without a database:
 * what a code looks like, and who is allowed to approve a claim. Everything that touches
 * Firestore lives in index.js.
 *
 * The threat this defends against is specific: a stranger who learns a child's name must
 * not be able to attach their own account to that child's profile and read four years of
 * records. So claims are made by CODE, never by name, and a claim is granted by a guardian
 * or the school -- never by the person asking.
 */

/// The alphabet a claim code is drawn from: no I, L, O, 0 or 1.
///
/// These codes are read aloud in a gym and copied off a phone screen, so the characters
/// people confuse with each other are simply absent. 31 symbols, eight characters, is
/// about 8.5e11 combinations -- guessing is not the attack that matters here; social
/// engineering is, which is why approval is required at all.
const CLAIM_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
const CLAIM_LENGTH = 8;

/// Strips what people type by habit: spaces, dashes, lowercase.
///
/// A code printed "K7QP-4MXR" and a code typed "k7qp 4mxr" are the same code, and a
/// parent failing at a sign-in screen because of a hyphen is not a security control.
function normalizeClaimCode(raw) {
  return String(raw || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
}

function isValidClaimCode(raw) {
  return new RegExp(`^[${CLAIM_ALPHABET}]{${CLAIM_LENGTH}}$`).test(normalizeClaimCode(raw));
}

/// Generates a code. `random` is injected so tests are deterministic, and defaults to
/// Math.random because these codes are not cryptographic secrets -- the approval step is
/// what stops a wrong claim, and a guessable code still lands in a queue nobody approves.
function makeClaimCode(random = Math.random) {
  let out = '';
  for (let i = 0; i < CLAIM_LENGTH; i += 1) {
    out += CLAIM_ALPHABET[Math.floor(random() * CLAIM_ALPHABET.length)];
  }
  return out;
}

/// Compares a typed code against a stored one, tolerating formatting and case.
function claimCodeMatches(typed, stored) {
  const a = normalizeClaimCode(typed);
  return a.length > 0 && a === normalizeClaimCode(stored);
}

/// Decides whether this caller may grant a claim, and in what capacity.
///
/// Returns `{ allowed, role, withoutGuardian, reason }` rather than a boolean, because the
/// interesting part is not whether the approval happens but WHICH authority justified it.
/// That distinction goes into the audit row, and getting it wrong is not cosmetic: a
/// coach who is also the child's parent is approving as a parent, and a log that calls them
/// staff overstates the school's involvement in a family decision.
///
/// The four roles, in order of authority:
///
/// - **guardian**: always may, whatever else they are. This is the parent case, and it is
///   checked FIRST so that a coach-parent is recorded as a guardian rather than as staff.
/// - **ad**: may, including as an override when a guardian exists but cannot be reached.
///   The override is explicit and audited, because a stale guardian record would otherwise
///   lock a child out of their own profile forever.
/// - **staff**: may only when no guardian exists. The doc is specific -- staff act "when no
///   guardian is present" -- and a coach approving over a reachable parent is exactly the
///   silent capability that decision was written to prevent.
/// - **nobody else**, including the athlete. A claim that approves itself is not a claim.
function decideClaimApproval({
  isGuardian = false,
  hasGuardians = false,
  isAdOfSchool = false,
  isStaffOfSchool = false,
  force = false,
} = {}) {
  if (isGuardian) {
    return { allowed: true, role: 'guardian', withoutGuardian: false, overrodeGuardian: false, reason: '' };
  }
  if (isAdOfSchool && (!hasGuardians || force)) {
    return {
      allowed: true,
      role: 'ad',
      withoutGuardian: !hasGuardians,
      // Recorded separately from `withoutGuardian`: reaching past a guardian who exists is a
      // different act from acting where none does, and only one of them needs explaining later.
      overrodeGuardian: hasGuardians && force,
      reason: '',
    };
  }
  if (isStaffOfSchool && !hasGuardians) {
    return { allowed: true, role: 'staff', withoutGuardian: true, overrodeGuardian: false, reason: '' };
  }
  if (isStaffOfSchool && hasGuardians) {
    return {
      allowed: false,
      role: '',
      withoutGuardian: false,
      reason: 'This athlete has a guardian on file. A guardian has to approve this claim; '
        + 'an athletic director can override if that guardian cannot be reached.',
    };
  }
  if (isAdOfSchool && hasGuardians && !force) {
    return {
      allowed: false,
      role: '',
      withoutGuardian: false,
      reason: 'This athlete has a guardian on file. Ask them to approve, or repeat this as '
        + 'an override if they cannot be reached.',
    };
  }
  return {
    allowed: false,
    role: '',
    withoutGuardian: false,
    reason: 'Only a guardian of this athlete, or staff of their school, can approve a claim.',
  };
}

/// Whether an existing claim can be replaced by a new one.
///
/// A guardian may hold the account for a child who has none -- a seven-year-old on their
/// parent's login. That must not be the last word: when the child is old enough for their
/// own account, their claim has to supersede it, or they inherit a profile they can never
/// own. A claim by an ATHLETE is final, because that is the real thing.
///
/// A missing `claimedByKind` is treated as an athlete claim: the only claims that existed
/// before this distinction did were athlete claims, and guessing the other way would let a
/// stale document be taken over without approval.
function canSupersedeClaim(claimedByKind) {
  return claimedByKind === 'guardian';
}


module.exports = {
  CLAIM_ALPHABET,
  CLAIM_LENGTH,
  normalizeClaimCode,
  isValidClaimCode,
  makeClaimCode,
  claimCodeMatches,
  decideClaimApproval,
  canSupersedeClaim,
};
