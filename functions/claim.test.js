const test = require('node:test');
const assert = require('node:assert/strict');

const {
  CLAIM_ALPHABET,
  CLAIM_LENGTH,
  normalizeClaimCode,
  isValidClaimCode,
  makeClaimCode,
  claimCodeMatches,
  decideClaimApproval,
  canSupersedeClaim,
} = require('./claim');

test('a code read off a screen survives being typed by a human', () => {
  // Lowercase, spaces and a hyphen are formatting, not information.
  assert.equal(normalizeClaimCode('k7qp-4mxr'), 'K7QP4MXR');
  assert.equal(normalizeClaimCode(' K7QP 4MXR '), 'K7QP4MXR');
  assert.equal(normalizeClaimCode('k7qp.4mxr'), 'K7QP4MXR');
});

test('the confusable characters are absent from generated codes', () => {
  // I, L, O, 0 and 1 are not in the alphabet, so no generated code contains them.
  for (const ch of ['I', 'L', 'O', '0', '1']) {
    assert.ok(!CLAIM_ALPHABET.includes(ch), `${ch} should not be in the alphabet`);
  }
  for (let i = 0; i < 200; i += 1) {
    const code = makeClaimCode();
    assert.equal(code.length, CLAIM_LENGTH);
    assert.match(code, new RegExp(`^[${CLAIM_ALPHABET}]+$`));
  }
});

test('generation uses the injected source, so it is deterministic under test', () => {
  assert.equal(makeClaimCode(() => 0), CLAIM_ALPHABET[0].repeat(CLAIM_LENGTH));
  assert.equal(makeClaimCode(() => 0.999999), CLAIM_ALPHABET[CLAIM_ALPHABET.length - 1].repeat(CLAIM_LENGTH));
});

test('a generated code always validates', () => {
  for (let i = 0; i < 500; i += 1) assert.equal(isValidClaimCode(makeClaimCode()), true);
});

test('the wrong shape does not validate', () => {
  assert.equal(isValidClaimCode(''), false);
  assert.equal(isValidClaimCode(null), false);
  assert.equal(isValidClaimCode('ABC'), false, 'too short');
  assert.equal(isValidClaimCode('ABCDEFGHJ'), false, 'too long');
  assert.equal(isValidClaimCode('ABCDEFG0'), false, 'contains an excluded character');
  assert.equal(isValidClaimCode('ABCDEFGI'), false, 'contains I');
});

test('matching tolerates formatting but not a different code', () => {
  assert.equal(claimCodeMatches('k7qp-4mxr', 'K7QP4MXR'), true);
  assert.equal(claimCodeMatches('K7QP4MXS', 'K7QP4MXR'), false);
  assert.equal(claimCodeMatches('', 'K7QP4MXR'), false);
  assert.equal(claimCodeMatches('   ', 'K7QP4MXR'), false);
});

test('a guardian can approve a claim for their own child', () => {
  assert.equal(decideClaimApproval({ isGuardian: true }).allowed, true);
});

test('a coach who is also the parent approves as a PARENT, not as staff', () => {
  // The case that prompted this: staff, coach or AD who is the child's actual guardian.
  // Recording them as staff would overstate the school's part in a family decision, and
  // `withoutGuardian: true` would be a false audit row on the one path that needs to be
  // exact.
  const decision = decideClaimApproval({
    isGuardian: true,
    hasGuardians: true,
    isStaffOfSchool: true,
    isAdOfSchool: true,
  });
  assert.equal(decision.allowed, true);
  assert.equal(decision.role, 'guardian');
  assert.equal(decision.withoutGuardian, false);
  assert.equal(decision.overrodeGuardian, false);
});

test('staff cannot approve over a guardian who exists', () => {
  // The identity decision is explicit: staff act when no guardian is PRESENT. A coach
  // approving a claim for a child whose parent is reachable is the silent capability that
  // decision was written to prevent.
  const decision = decideClaimApproval({ hasGuardians: true, isStaffOfSchool: true });
  assert.equal(decision.allowed, false);
  assert.match(decision.reason, /guardian on file/i);
});

test('staff can approve when there is no guardian at all', () => {
  // Grandparent with no account, or a family whose guardian record is gone. Blocking this
  // strands the child, so it is allowed and audited.
  const decision = decideClaimApproval({ hasGuardians: false, isStaffOfSchool: true });
  assert.equal(decision.allowed, true);
  assert.equal(decision.role, 'staff');
  assert.equal(decision.withoutGuardian, true);
});

test('an AD cannot reach past a guardian without asking to', () => {
  const blocked = decideClaimApproval({ hasGuardians: true, isAdOfSchool: true });
  assert.equal(blocked.allowed, false);

  // The explicit override exists because a stale guardian record would otherwise lock a
  // child out of their own profile permanently.
  const forced = decideClaimApproval({ hasGuardians: true, isAdOfSchool: true, force: true });
  assert.equal(forced.allowed, true);
  assert.equal(forced.role, 'ad');
  assert.equal(forced.overrodeGuardian, true);
  assert.equal(forced.withoutGuardian, false);
});

test('a coach cannot use the AD override', () => {
  // `force` is only consulted on the AD branch, so passing it as staff changes nothing.
  const decision = decideClaimApproval({ hasGuardians: true, isStaffOfSchool: true, force: true });
  assert.equal(decision.allowed, false);
});

test('nobody else can approve, including the athlete themselves', () => {
  // The athlete is not a guardian, not AD and not staff of their own school. A claim that
  // approves itself is not a claim.
  assert.equal(decideClaimApproval({}).allowed, false);
  assert.equal(decideClaimApproval({ isGuardian: false, isStaffOfSchool: false }).allowed, false);
});

test('a guardian-held account can be superseded by the athlete later', () => {
  // A parent claims on behalf of a seven-year-old. At thirteen the child must be able to
  // take it over, or they inherit a profile they can never own.
  assert.equal(canSupersedeClaim('guardian'), true);
  assert.equal(canSupersedeClaim('athlete'), false);
  // Absent means the older, stricter case: the only claims that predate this distinction
  // were made by athletes, and guessing the other way would let a stale doc be taken over.
  assert.equal(canSupersedeClaim(undefined), false);
  assert.equal(canSupersedeClaim(null), false);
});
