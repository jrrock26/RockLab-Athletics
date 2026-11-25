/**
 * The roster is the safeguarding boundary of the whole platform.
 *
 * A roster entry holds a child's injury status, clearance notes and both parents'
 * phone numbers, and rules cannot hide fields -- only whole documents. So these tests
 * assert the coarse isolation that keeps one family out of another family's entry,
 * and that families cannot write the school-owned record at all.
 */
import { after, before, describe, test } from 'node:test';
import { assertFails, assertSucceeds } from '@firebase/rules-unit-testing';
import { collection, doc, getDoc, getDocs, setDoc, updateDoc } from 'firebase/firestore';
import { freshEnv } from './_env.mjs';
import { ENTRY_KID_A, ENTRY_KID_B, TEAM_A, seedFixtures } from './fixtures.mjs';

describe('team roster', () => {
  let env;

  before(async () => { env = await freshEnv(seedFixtures); });
  after(async () => { await env.cleanup(); });

  const as = (uid) => env.authenticatedContext(uid).firestore();
  const entry = (db, id) => doc(db, `teams/${TEAM_A}/roster/${id}`);

  test('a guardian reads the entry naming them in guardianUserIds', async () => {
    await assertSucceeds(getDoc(entry(as('guardianA'), ENTRY_KID_A)));
  });

  test('a guardian cannot read another family\'s entry', async () => {
    await assertFails(getDoc(entry(as('guardianA'), ENTRY_KID_B)));
  });

  test('team membership alone does not grant the roster', async () => {
    // guardianB is a `parent` member of the team but is not linked to entry A. Team
    // membership previously granted every child's medical notes; this is that fix.
    await assertSucceeds(getDoc(entry(as('guardianB'), ENTRY_KID_B)));
    await assertFails(getDoc(entry(as('guardianB'), ENTRY_KID_A)));
  });

  test('an athlete reads their own entry and no teammate\'s', async () => {
    await assertSucceeds(getDoc(entry(as('kidA'), ENTRY_KID_A)));
    await assertFails(getDoc(entry(as('kidA'), ENTRY_KID_B)));
  });

  test('a follower cannot read the roster', async () => {
    await assertFails(getDoc(entry(as('followerX'), ENTRY_KID_A)));
  });

  test('coach and staff read the whole roster', async () => {
    await assertSucceeds(getDoc(entry(as('coachA'), ENTRY_KID_A)));
    await assertSucceeds(getDoc(entry(as('coachA'), ENTRY_KID_B)));
    await assertSucceeds(getDoc(entry(as('staffA'), ENTRY_KID_B)));
  });

  test('the school AD reads the whole roster', async () => {
    await assertSucceeds(getDoc(entry(as('adA'), ENTRY_KID_B)));
  });

  test('a coach in another school cannot read this roster', async () => {
    await assertFails(getDoc(entry(as('coachB'), ENTRY_KID_A)));
  });

  test('a guardian cannot write the school-owned roster entry', async () => {
    // Family-supplied safety data belongs on the player profile, staff-approved, not on
    // a record a family can silently rewrite.
    await assertFails(updateDoc(entry(as('guardianA'), ENTRY_KID_A), { injuryStatus: 'healthy', allergies: 'none' }));
    await assertFails(setDoc(entry(as('guardianA'), 'entryForged'), { userId: 'kidA', guardianUserIds: ['guardianA'] }));
  });

  test('a coach writes the roster entry', async () => {
    await assertSucceeds(updateDoc(entry(as('coachA'), ENTRY_KID_A), { injuryStatus: 'questionable' }));
  });

  test('an athlete cannot write their own roster entry', async () => {
    await assertFails(updateDoc(entry(as('kidA'), ENTRY_KID_A), { injuryStatus: 'healthy' }));
  });

  test('a follower cannot join the team as a player', async () => {
    // Anyone may add themselves as a follower -- and only as a follower.
    const db = as('followerX');
    await assertFails(updateDoc(doc(db, `teams/${TEAM_A}/members/followerX`), { role: 'coach' }));
    await assertFails(setDoc(doc(db, `teams/${TEAM_A}/members/followerNew`), { role: 'player' }));
  });

  test('a stranger cannot enumerate the roster collection', async () => {
    const db = env.unauthenticatedContext().firestore();
    await assertFails(getDocs(collection(db, `teams/${TEAM_A}/roster`)));
  });
});
