/**
 * Invitations used to be readable by any signed-in account, which exposed every
 * school's parent email addresses and invite codes. These tests pin the three
 * audiences that remain: the invitee, the owning school's AD, and the team's coach.
 */
import { after, before, describe, test } from 'node:test';
import { assertFails, assertSucceeds } from '@firebase/rules-unit-testing';
import { doc, getDoc, setDoc, updateDoc } from 'firebase/firestore';
import { freshEnv } from './_env.mjs';
import { SCHOOL_A, TEAM_A, seedFixtures } from './fixtures.mjs';

describe('invitations', () => {
  let env;

  before(async () => { env = await freshEnv(seedFixtures); });
  after(async () => { await env.cleanup(); });

  const as = (uid, claims = {}) => env.authenticatedContext(uid, claims).firestore();

  test('the invitee reads their own invitation, matched on verified email', async () => {
    const db = as('guardianA', { email: 'guardian.a@example.com', email_verified: true });
    await assertSucceeds(getDoc(doc(db, 'invitations/inviteA')));
  });

  test('a signed-in account with a different email cannot read it', async () => {
    const db = as('guardianB', { email: 'guardian.b@example.com', email_verified: true });
    await assertFails(getDoc(doc(db, 'invitations/inviteA')));
  });

  test('an account with no verified email cannot read it', async () => {
    await assertFails(getDoc(doc(as('stranger'), 'invitations/inviteA')));
  });

  test('a signed-out caller cannot read it', async () => {
    const db = env.unauthenticatedContext().firestore();
    await assertFails(getDoc(doc(db, 'invitations/inviteA')));
  });

  test('the owning school AD reads it, another school AD does not', async () => {
    await assertSucceeds(getDoc(doc(as('adA'), 'invitations/inviteA')));
    await assertFails(getDoc(doc(as('adB'), 'invitations/inviteA')));
    // ...and the other way round, so the assertion is about scoping, not about adB.
    await assertSucceeds(getDoc(doc(as('adB'), 'invitations/inviteB')));
  });

  test('the team coach reads invitations for their own team', async () => {
    await assertSucceeds(getDoc(doc(as('coachA'), 'invitations/inviteA')));
  });

  test('a parent cannot read invitations for the team', async () => {
    await assertFails(getDoc(doc(as('guardianA'), 'invitations/inviteB')));
  });

  test('a coach mints a non-AD invitation for their own team', async () => {
    const db = as('coachA');
    await assertSucceeds(setDoc(doc(db, 'invitations/inviteNew'), {
      email: 'new.family@example.com', schoolId: SCHOOL_A, teamId: TEAM_A, role: 'parent', code: 'NEWCODE1',
    }));
  });

  test('no client mints an AD invitation', async () => {
    // An AD invitation carries ownership of the school, so only the Cloud Function
    // (which verifies ownership) may create one -- including for an actual AD.
    await assertFails(setDoc(doc(as('coachA'), 'invitations/inviteAd1'), {
      email: 'new.ad@example.com', schoolId: SCHOOL_A, teamId: TEAM_A, role: 'ad', code: 'ADCODE01',
    }));
    await assertFails(setDoc(doc(as('adA'), 'invitations/inviteAd2'), {
      email: 'new.ad@example.com', schoolId: SCHOOL_A, teamId: TEAM_A, role: 'ad', code: 'ADCODE02',
    }));
  });

  test('an AD of another school cannot mint an invitation into this school', async () => {
    await assertFails(setDoc(doc(as('adB'), 'invitations/inviteByAdB'), {
      email: 'friend@example.com', schoolId: SCHOOL_A, teamId: TEAM_A, role: 'parent', code: 'ADBCODE1',
    }));
  });

  test('an unrelated parent cannot mint an invitation', async () => {
    await assertFails(setDoc(doc(as('guardianA'), 'invitations/inviteByParent'), {
      email: 'friend@example.com', schoolId: SCHOOL_A, teamId: TEAM_A, role: 'parent', code: 'PARENT01',
    }));
  });

  test('an invitation cannot be rewritten by someone it does not belong to', async () => {
    await assertFails(updateDoc(doc(as('guardianA'), 'invitations/inviteA'), { code: 'HIJACK01' }));
  });
});
