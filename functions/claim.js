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

/// Who may approve a claim for this player.
///
/// - A guardian always may. They are the responsible adult for a minor, and the doc is
///   explicit that claiming does not revoke their access afterwards.
/// - The school may, when there is no guardian -- the realistic case of a child raised by
///   a grandparent with no account. That path is audited rather than blocked, because
///   blocking it strands the child.
/// - The athlete may NOT approve their own claim. This is the whole point: a claim that
///   approves itself is not a claim.
function canApproveClaim({ isGuardian, isAdOfSchool, isStaffOfSchool }) {
  return Boolean(isGuardian || isAdOfSchool || isStaffOfSchool);
}

module.exports = {
  CLAIM_ALPHABET,
  CLAIM_LENGTH,
  normalizeClaimCode,
  isValidClaimCode,
  makeClaimCode,
  claimCodeMatches,
  canApproveClaim,
};
