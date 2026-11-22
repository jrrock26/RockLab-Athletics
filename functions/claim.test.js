const test = require('node:test');
const assert = require('node:assert/strict');

const {
  CLAIM_ALPHABET,
  CLAIM_LENGTH,
  normalizeClaimCode,
  isValidClaimCode,
  makeClaimCode,
  claimCodeMatches,
  canApproveClaim,
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
  assert.equal(canApproveClaim({ isGuardian: true }), true);
});

test('the school can approve when no guardian exists', () => {
  // A child raised by a grandparent with no account, or a family whose guardian account
  // is gone. Blocking this strands the child; allowing it is audited instead.
  assert.equal(canApproveClaim({ isAdOfSchool: true }), true);
  assert.equal(canApproveClaim({ isStaffOfSchool: true }), true);
});

test('nobody else can approve, including the athlete themselves', () => {
  // The athlete is not a guardian, not AD and not staff of their own school, so this is
  // the case that stops self-claim. A claim that approves itself is not a claim.
  assert.equal(canApproveClaim({}), false);
  assert.equal(canApproveClaim({ isGuardian: false, isAdOfSchool: false, isStaffOfSchool: false }), false);
});
