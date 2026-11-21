const test = require('node:test');
const assert = require('node:assert');
const {
  DEFAULT_TTL_DAYS,
  expiryFrom,
  readExpiryMs,
  isExpired,
  invitationKey,
  invitationCode,
  acceptanceBlocker,
} = require('./invitations');

const NOW = Date.UTC(2026, 10, 21, 12, 0, 0);
const DAY = 24 * 60 * 60 * 1000;

// --- expiry ---------------------------------------------------------------

test('a new invitation expires after the default window', () => {
  assert.strictEqual(expiryFrom(NOW), NOW + DEFAULT_TTL_DAYS * DAY);
  assert.strictEqual(expiryFrom(NOW, 1), NOW + DAY);
});

test('expiry is read from a number, a Firestore Timestamp, or a raw seconds object', () => {
  const ms = NOW + DAY;
  assert.strictEqual(readExpiryMs({ expiresAt: ms }), ms);
  assert.strictEqual(readExpiryMs({ expiresAt: { toMillis: () => ms } }), ms);
  assert.strictEqual(readExpiryMs({ expiresAt: { seconds: ms / 1000 } }), ms);
  assert.strictEqual(readExpiryMs({}), null);
  assert.strictEqual(readExpiryMs(null), null);
});

test('an invitation without a recorded expiry is NOT treated as expired', () => {
  // Every invitation sent before this field existed would otherwise be voided the
  // moment the new code deploys.
  assert.strictEqual(isExpired({ email: 'a@b.c' }, NOW), false);
  assert.strictEqual(isExpired({ email: 'a@b.c', expiresAt: null }, NOW), false);
});

test('expiry is inclusive of the boundary and one second past it', () => {
  const expiresAt = NOW;
  assert.strictEqual(isExpired({ expiresAt }, NOW - 1), false);
  assert.strictEqual(isExpired({ expiresAt }, NOW), true);
  assert.strictEqual(isExpired({ expiresAt }, NOW + 1), true);
});

// --- duplicate identity ---------------------------------------------------

test('one person can hold invites for different teams or roles', () => {
  const base = { email: 'Coach@Example.com ', schoolId: 's1', teamId: 't1', role: 'coach' };
  const same = { email: 'coach@example.com', schoolId: 's1', teamId: 't1', role: 'coach' };
  const otherTeam = { ...same, teamId: 't2' };
  const otherRole = { ...same, role: 'parent' };

  assert.strictEqual(invitationKey(base), invitationKey(same), 'casing and padding must not matter');
  assert.notStrictEqual(invitationKey(base), invitationKey(otherTeam));
  assert.notStrictEqual(invitationKey(base), invitationKey(otherRole));
});

test('an AD handoff is not the same invitation as a membership', () => {
  const membership = { email: 'a@b.c', schoolId: 's1', role: 'ad' };
  const transfer = { ...membership, adTransfer: true };
  assert.notStrictEqual(invitationKey(membership), invitationKey(transfer));
});

// --- code fallback --------------------------------------------------------

test('the invitation code falls back to the legacy token field', () => {
  assert.strictEqual(invitationCode({ code: 'ABC123' }), 'ABC123');
  assert.strictEqual(invitationCode({ token: 'EB88-UUID' }), 'EB88-UUID');
  assert.strictEqual(invitationCode({ code: '', token: 'EB88-UUID' }), 'EB88-UUID');
  assert.strictEqual(invitationCode({}), '');
});

// --- acceptance -----------------------------------------------------------

test('a pending invitation is acceptable', () => {
  assert.strictEqual(acceptanceBlocker({ email: 'a@b.c', status: 'pending' }, NOW), null);
});

test('each dead state explains itself', () => {
  const t = (status) => acceptanceBlocker({ email: 'a@b.c', status }, NOW);
  assert.match(t('accepted'), /already been accepted/);
  assert.match(t('cancelled'), /cancelled/);
  assert.match(t('revoked'), /cancelled/);
  assert.match(t('superseded'), /replaced/);
  assert.match(t('expired'), /expired/);
});

test('a pending invitation past its expiry is refused with the expiry reason', () => {
  const blocker = acceptanceBlocker(
    { email: 'a@b.c', status: 'pending', expiresAt: NOW - 1 }, NOW);
  assert.strictEqual(blocker, 'This invitation has expired.');
});

test('an invitation with no recipient is refused', () => {
  assert.match(acceptanceBlocker({ status: 'pending' }, NOW), /no recipient/i);
});
