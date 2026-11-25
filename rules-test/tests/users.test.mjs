/**
 * Users, and the school boundary around them.
 *
 * The users collection is the most load-bearing document in the database: nearly
 * every other rule reads it to learn a caller's role and school. These tests pin the
 * three things that make that safe -- self-access only, same-school staff access only,
 * and a self-edit that cannot rewrite `schoolId` or award itself 'ad'.
 */
import { after, before, describe, test } from 'node:test';
import { assertFails, assertSucceeds } from '@firebase/rules-unit-testing';
import { deleteDoc, doc, getDoc, setDoc, updateDoc } from 'firebase/firestore';
import { freshEnv } from './_env.mjs';
import { seedFixtures } from './fixtures.mjs';

describe('users', () => {
  let env;

  before(async () => { env = await freshEnv(seedFixtures); });
  after(async () => { await env.cleanup(); });

  const as = (uid, claims = {}) => env.authenticatedContext(uid, claims).firestore();

  test('a signed-out caller cannot read any user document', async () => {
    const db = env.unauthenticatedContext().firestore();
    await assertFails(getDoc(doc(db, 'users/adA')));
  });

  test('an account reads its own document', async () => {
    await assertSucceeds(getDoc(doc(as('guardianA'), 'users/guardianA')));
  });

  test('a coach reads a user in their own school', async () => {
    await assertSucceeds(getDoc(doc(as('coachA'), 'users/guardianA')));
  });

  test('a coach cannot read a user in another school', async () => {
    // The escalation this blocks: claim role 'coach' and pick a victim schoolId in one
    // write, then read that school's families.
    await assertFails(getDoc(doc(as('coachB'), 'users/guardianA')));
  });

  test('a parent cannot read another family in the same school', async () => {
    await assertFails(getDoc(doc(as('guardianA'), 'users/guardianB')));
  });

  test('a parent cannot read a coach in their own school', async () => {
    await assertFails(getDoc(doc(as('guardianA'), 'users/coachA')));
  });

  test('the AD of a school reads users in that school', async () => {
    await assertSucceeds(getDoc(doc(as('adA'), 'users/coachA')));
  });

  test('the AD of one school cannot read users in another school', async () => {
    // The Critical hole: `isAd()` only asked "do I own SOME school", so any AD could
    // read every guardian's email and phone number in the database.
    await assertFails(getDoc(doc(as('adB'), 'users/guardianA')));
    await assertFails(getDoc(doc(as('adB'), 'users/coachA')));
  });

  test('an AD can edit a user in their own school', async () => {
    await assertSucceeds(updateDoc(doc(as('adA'), 'users/kidA'), { displayName: 'Kai K.' }));
  });

  test('the AD of one school cannot edit a user in another school', async () => {
    // Scoping the read alone would leave the write open -- and the write is the worse
    // half: it can change a guardian's contact details or a coach's role.
    await assertFails(updateDoc(doc(as('adB'), 'users/guardianA'), { displayName: 'Hijacked' }));
  });

  test('self-signup may claim an unprivileged role with no school', async () => {
    const db = as('newSignup');
    await assertSucceeds(setDoc(doc(db, 'users/newSignup'), { role: 'parent', displayName: 'New Parent' }));
  });

  test('self-signup cannot choose its own schoolId', async () => {
    const db = as('newSignup2');
    await assertFails(setDoc(doc(db, 'users/newSignup2'), { role: 'parent', schoolId: 'schoolA' }));
  });

  test('self-signup cannot claim the AD role without owning the school', async () => {
    const db = as('newSignup3');
    await assertFails(setDoc(doc(db, 'users/newSignup3'), { role: 'ad', schoolId: 'schoolA' }));
  });

  test('a parent edits their own profile fields', async () => {
    await assertSucceeds(updateDoc(doc(as('guardianA'), 'users/guardianA'), { displayName: 'Gale G.' }));
  });

  test('a parent cannot move themselves into another school', async () => {
    await assertFails(updateDoc(doc(as('guardianA'), 'users/guardianA'), { schoolId: 'schoolB' }));
  });

  test('a parent cannot promote themselves to AD', async () => {
    await assertFails(updateDoc(doc(as('guardianA'), 'users/guardianA'), { role: 'ad' }));
  });

  test('an account cannot edit another account', async () => {
    await assertFails(updateDoc(doc(as('guardianA'), 'users/guardianB'), { displayName: 'Hijacked' }));
  });

  test('no client deletes a user document', async () => {
    // Account deletion is a callable (deleteMyAccount), so a self-delete here is still
    // denied -- and a coach deleting a family is denied too.
    await assertFails(deleteDoc(doc(as('guardianA'), 'users/guardianA')));
    await assertFails(deleteDoc(doc(as('coachA'), 'users/guardianA')));
  });
});
