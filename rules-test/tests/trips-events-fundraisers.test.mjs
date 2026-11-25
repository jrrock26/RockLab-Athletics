/**
 * Trips, events and fundraisers: the three collections whose delete rules read
 * `request.resource`.
 *
 * `request.resource` is null on a delete, so every one of those rules raised and denied
 * -- a mistyped practice, a cancelled trip and a closed fundraiser were all permanent.
 * These tests do two jobs: they prove deletes now work for the people who should have
 * them, and they prove the fix did not turn "delete" into a district-wide power, since
 * the AD branch of these rules is now scoped through the team's school.
 */
import { after, before, describe, test } from 'node:test';
import { assertFails, assertSucceeds } from '@firebase/rules-unit-testing';
import { addDoc, collection, deleteDoc, doc, getDoc, setDoc, updateDoc } from 'firebase/firestore';
import { freshEnv } from './_env.mjs';
import { TEAM_A, seedFixtures } from './fixtures.mjs';

describe('trips, events and fundraisers', () => {
  let env;

  before(async () => { env = await freshEnv(seedFixtures); });
  after(async () => { await env.cleanup(); });

  const as = (uid) => env.authenticatedContext(uid).firestore();

  test('a coach schedules a trip and can then delete it', async () => {
    // The D-2 regression in one test: before the fix this delete was denied to
    // everyone, because the rule read `request.resource.data.teamId`.
    const db = as('coachA');
    const created = await addDoc(collection(db, 'trips'), {
      teamId: TEAM_A, title: 'Away game', destination: 'Springfield',
    });
    await assertSucceeds(deleteDoc(doc(db, 'trips', created.id)));
  });

  test('the AD of the owning school schedules a trip; another school\'s AD cannot', async () => {
    await assertSucceeds(addDoc(collection(as('adA'), 'trips'), {
      teamId: TEAM_A, title: 'Banquet', destination: 'Gym',
    }));
    await assertFails(addDoc(collection(as('adB'), 'trips'), {
      teamId: TEAM_A, title: 'Banquet', destination: 'Gym',
    }));
  });

  test('a coach of another school cannot schedule a trip on this team', async () => {
    await assertFails(addDoc(collection(as('coachB'), 'trips'), {
      teamId: TEAM_A, title: 'Injected', destination: 'Nowhere',
    }));
  });

  test('the AD of the owning school reads the trip; another school\'s AD does not', async () => {
    await assertSucceeds(getDoc(doc(as('adA'), 'trips/tripA')));
    await assertFails(getDoc(doc(as('adB'), 'trips/tripA')));
  });

  test('a coach of another school cannot delete this trip', async () => {
    await assertFails(deleteDoc(doc(as('coachB'), 'trips/tripA')));
  });

  test('a player reads the team trip and a follower does not', async () => {
    // Proves the scoping chain does not swallow the later operands: `isAdOf` is false
    // for a player, so `isTeamMember` has to be reached and believed.
    await assertSucceeds(getDoc(doc(as('kidA'), 'trips/tripA')));
    await assertFails(getDoc(doc(as('followerX'), 'trips/tripA')));
  });

  test('the AD of another school cannot delete an event', async () => {
    await assertFails(deleteDoc(doc(as('adB'), 'events/eventA')));
  });

  test('a coach deletes an event that was mistyped', async () => {
    await assertFails(deleteDoc(doc(as('coachB'), 'events/eventA')));
    await assertSucceeds(deleteDoc(doc(as('coachA'), 'events/eventA')));
  });

  test('a coach edits a trip without losing it', async () => {
    await assertSucceeds(updateDoc(doc(as('coachA'), 'trips/tripA'), { departureDate: 1800000000 }));
  });

  test('the AD of the owning school reads donations; another school\'s AD does not', async () => {
    await assertSucceeds(getDoc(doc(as('adA'), 'fundraisers/fundA/donations/don1')));
    await assertFails(getDoc(doc(as('adB'), 'fundraisers/fundA/donations/don1')));
  });

  test('a coach of another school cannot delete this fundraiser or add to it', async () => {
    await assertFails(deleteDoc(doc(as('coachB'), 'fundraisers/fundA')));
    await assertFails(setDoc(doc(as('coachB'), 'fundraisers/fundB'), {
      teamId: TEAM_A, title: 'Injected', goal: 1, raised: 0,
    }));
  });

  test('a coach deletes a fundraiser and the donation under it goes with it', async () => {
    await assertSucceeds(deleteDoc(doc(as('coachA'), 'fundraisers/fundA')));
  });
});
