/**
 * AD-versus-AD isolation: two schools, both staffed, neither able to reach the other.
 *
 * The shipped suite tests a coach or a parent as the intruder. This file tests the
 * intruder the mission is actually about: an athletic director holding a real AD role
 * in a real, different school. `isAd()` asked "do I own SOME school", which every
 * assertion here would have passed before the ownership work.
 *
 * School A comes from the shared fixtures. School B is seeded here so the shared
 * fixtures stay untouched (adding a second team there would change the meaning of
 * suites that count what a follower or a guardian can see).
 */
import { after, before, describe, test } from 'node:test';
import { assertFails, assertSucceeds } from '@firebase/rules-unit-testing';
import { addDoc, collection, deleteDoc, doc, getDoc, setDoc, updateDoc } from 'firebase/firestore';
import { freshEnv } from './_env.mjs';
import { ENTRY_KID_A, ENTRY_KID_B, SCHOOL_A, SCHOOL_B, TEAM_A, seedFixtures } from './fixtures.mjs';

const TEAM_B = 'teamB';
const ENTRY_B = 'entryKidB';
const EVENT_A = 'eventA';
const EVENT_B = 'eventB';
const GAME_B = 'gameB';
const PLAYER_A = 'playerA';
const PLAYER_B = 'playerB';
const UNOWNED = 'teamUnowned';

/// Everything School B owns. Written with rules disabled: this is the world the
/// rules are then asked about, not something a client is allowed to create.
async function seedSchoolB(env) {
  await env.withSecurityRulesDisabled(async (ctx) => {
    const db = ctx.firestore();
    const write = (path, data) => setDoc(doc(db, path), data);

    await write(`teams/${TEAM_B}`, { name: 'Bravo Varsity', schoolId: SCHOOL_B, sportId: 'basketball' });
    await write(`teams/${TEAM_B}/members/coachB`, { role: 'coach' });
    await write(`teams/${TEAM_B}/members/staffB`, { role: 'staff' });
    await write(`teams/${TEAM_B}/roster/${ENTRY_B}`, {
      firstName: 'Bea', lastName: 'Bravo', userId: 'kidB2',
      guardianUserIds: ['guardianB2'], injuryStatus: 'injured', injuryNote: 'ACL sprain',
    });
    await write(`teams/${TEAM_B}/injuryReports/injB`, { rosterEntryId: ENTRY_B, status: 'injured', note: 'ACL sprain' });
    await write(`teams/${TEAM_B}/forms/formB`, { title: 'Bravo physical', published: true, required: true });
    await write(`teams/${TEAM_B}/videos/vidB`, { title: 'Bravo film', views: 0 });
    await write(`teams/${TEAM_B}/reels/reelB`, { title: 'Bravo reel', clips: [] });
    await write(`teams/${TEAM_B}/volunteerShifts/shiftB`, { title: 'Gate duty', start: 1, end: 2 });
    await write(`teams/${TEAM_B}/joinRequests/reqB`, { playerName: 'Bea Bravo', status: 'pending', requesterUserId: 'someone' });
    await write(`teams/${UNOWNED}`, { name: 'Legacy team with no owner', season: '2026-27' });

    await write(`events/${EVENT_B}`, { teamId: TEAM_B, type: 'game', title: 'Bravo vs Alpha' });
    await write(`events/${EVENT_B}/attendance/${ENTRY_B}`, { status: 'present' });
    await write(`events/${EVENT_B}/rsvps/guardianB2__${ENTRY_B}`, {
      respondentUserId: 'guardianB2', athleteEntryId: ENTRY_B, answer: 'yes',
    });
    await write(`events/${EVENT_B}/releasePlans/${ENTRY_B}`, { mode: 'pickup', byName: 'Gale' });

    await write(`games/${GAME_B}`, { teamId: TEAM_B, opponent: 'Alpha', status: 'final' });
    await write(`games/${GAME_B}/stats/${ENTRY_B}`, { points: 12 });
    await write(`gameStatisticianRequests/reqGameB`, { teamId: TEAM_B, status: 'open' });

    await write(`chats/${TEAM_B}_commBoard`, { teamId: TEAM_B, type: 'commBoard', title: 'Comm Board' });
    await write(`chats/${TEAM_B}_commBoard/messages/msgB`, { text: 'Bus leaves at 4', senderId: 'coachB', category: 'gameday' });

    await write(`players/${PLAYER_A}`, { schoolId: SCHOOL_A, firstName: 'Kai', lastName: 'Kid' });
    await write(`players/${PLAYER_A}/guardians/guardianA`, { name: 'Gale Guardian', phone: '555-0101' });
    await write(`players/${PLAYER_B}`, { schoolId: SCHOOL_B, firstName: 'Bea', lastName: 'Bravo' });
    await write(`players/${PLAYER_B}/guardians/guardianB2`, { name: 'Bea Parent', phone: '555-0199' });

    await write(`users/guardianB2`, { role: 'parent', schoolId: SCHOOL_B, displayName: 'Bea Parent' });
    await write(`users/kidB2`, { role: 'player', schoolId: SCHOOL_B, displayName: 'Bea Bravo' });

    await write(`schools/${SCHOOL_A}/records/recA`, { schoolId: SCHOOL_A, label: '100m', value: '10.9' });
    await write(`schools/${SCHOOL_B}/records/recB`, { schoolId: SCHOOL_B, label: '100m', value: '11.4' });
    await write(`schools/${SCHOOL_B}/recordStats/customB`, { label: 'Saves' });
  });
}

describe('AD versus AD — School A manages School A', () => {
  let env;
  before(async () => { env = await freshEnv(seedFixtures); await seedSchoolB(env); });
  after(async () => { await env.cleanup(); });

  const as = (uid) => env.authenticatedContext(uid).firestore();

  test('AD of A updates a team in A', async () => {
    await assertSucceeds(updateDoc(doc(as('adA'), `teams/${TEAM_A}`), { name: 'Alpha Varsity (renamed)' }));
  });

  test('AD of A writes a roster entry in A', async () => {
    await assertSucceeds(updateDoc(doc(as('adA'), `teams/${TEAM_A}/roster/${ENTRY_KID_A}`), { jerseyNumber: '9' }));
  });

  test('AD of A reads injury information for A', async () => {
    await assertSucceeds(getDoc(doc(as('adA'), `teams/${TEAM_A}/roster/${ENTRY_KID_B}`)));
  });

  test('AD of A creates, edits and deletes an event in A', async () => {
    const created = await assertSucceeds(addDoc(collection(as('adA'), 'events'), {
      teamId: TEAM_A, type: 'practice', title: 'Alpha practice',
    }));
    await assertSucceeds(updateDoc(doc(as('adA'), `events/${created.id}`), { title: 'Alpha practice (moved)' }));
    await assertSucceeds(deleteDoc(doc(as('adA'), `events/${created.id}`)));
  });

  test('AD of A marks attendance for an event in A', async () => {
    await assertSucceeds(setDoc(doc(as('adA'), `events/${EVENT_A}/attendance/${ENTRY_KID_A}`), { status: 'present' }));
  });

  test('AD of A reads the audit log for A', async () => {
    await assertSucceeds(getDoc(doc(as('adA'), 'auditLogs/schoolA-log')));
  });

  test('AD of A reads a player record and its guardians in A', async () => {
    await assertSucceeds(getDoc(doc(as('adA'), `players/${PLAYER_A}`)));
    await assertSucceeds(getDoc(doc(as('adA'), `players/${PLAYER_A}/guardians/guardianA`)));
  });
});

describe('AD versus AD — School B manages School B', () => {
  let env;
  before(async () => { env = await freshEnv(seedFixtures); await seedSchoolB(env); });
  after(async () => { await env.cleanup(); });

  const as = (uid) => env.authenticatedContext(uid).firestore();

  test('AD of B updates a team in B', async () => {
    await assertSucceeds(updateDoc(doc(as('adB'), `teams/${TEAM_B}`), { name: 'Bravo Varsity (renamed)' }));
  });

  test('AD of B writes a roster entry in B', async () => {
    await assertSucceeds(updateDoc(doc(as('adB'), `teams/${TEAM_B}/roster/${ENTRY_B}`), { jerseyNumber: '7' }));
  });

  test('AD of B creates, edits and deletes an event in B', async () => {
    const created = await assertSucceeds(addDoc(collection(as('adB'), 'events'), {
      teamId: TEAM_B, type: 'practice', title: 'Bravo practice',
    }));
    await assertSucceeds(updateDoc(doc(as('adB'), `events/${created.id}`), { title: 'Bravo practice (moved)' }));
    await assertSucceeds(deleteDoc(doc(as('adB'), `events/${created.id}`)));
  });

  test('AD of B reads the audit log for B', async () => {
    await assertSucceeds(getDoc(doc(as('adB'), 'auditLogs/schoolB-log')));
  });

  test('AD of B manages its own records book', async () => {
    await assertSucceeds(updateDoc(doc(as('adB'), `schools/${SCHOOL_B}/records/recB`), { value: '11.2' }));
  });
});

describe('AD versus AD — School B cannot reach School A', () => {
  let env;
  before(async () => { env = await freshEnv(seedFixtures); await seedSchoolB(env); });
  after(async () => { await env.cleanup(); });

  const db = () => env.authenticatedContext('adB').firestore();

  test('cannot update or delete team A', async () => {
    // The team DIRECTORY document is readable by any signed-in account on purpose --
    // a follower has to be able to find a school's teams. That is the one documented
    // exception; everything hanging off the team is not.
    await assertSucceeds(getDoc(doc(db(), `teams/${TEAM_A}`)));
    await assertFails(updateDoc(doc(db(), `teams/${TEAM_A}`), { name: 'taken over' }));
    await assertFails(deleteDoc(doc(db(), `teams/${TEAM_A}`)));
  });

  test('cannot read or write team A roster', async () => {
    await assertFails(getDoc(doc(db(), `teams/${TEAM_A}/roster/${ENTRY_KID_A}`)));
    await assertFails(updateDoc(doc(db(), `teams/${TEAM_A}/roster/${ENTRY_KID_A}`), { injuryNote: 'tampered' }));
  });

  test('cannot read team A injury reports', async () => {
    await assertFails(getDoc(doc(db(), `teams/${TEAM_A}/injuryReports/reportA`)));
  });

  test('cannot read team A members or followers', async () => {
    await assertFails(getDoc(doc(db(), `teams/${TEAM_A}/members/coachA`)));
  });

  test('cannot read or write team A forms', async () => {
    await assertFails(getDoc(doc(db(), `teams/${TEAM_A}/forms/formA`)));
    await assertFails(setDoc(doc(db(), `teams/${TEAM_A}/forms/planted`), { title: 'planted' }));
  });

  test('cannot read teamwork media or reels', async () => {
    await assertFails(getDoc(doc(db(), `teams/${TEAM_A}/videos/vidA`)));
    await assertFails(getDoc(doc(db(), `teams/${TEAM_A}/reels/reelA`)));
  });

  test('cannot read or answer team A volunteer data', async () => {
    await assertFails(getDoc(doc(db(), `teams/${TEAM_A}/volunteerShifts/shiftA`)));
  });

  test('cannot read team A join requests or approve one', async () => {
    await assertFails(getDoc(doc(db(), `teams/${TEAM_A}/joinRequests/reqA`)));
    await assertFails(updateDoc(doc(db(), `teams/${TEAM_A}/joinRequests/reqA`), { status: 'approved' }));
  });

  test('cannot read, create, edit or delete team A events', async () => {
    await assertFails(getDoc(doc(db(), `events/${EVENT_A}`)));
    await assertFails(addDoc(collection(db(), 'events'), { teamId: TEAM_A, type: 'practice', title: 'planted' }));
    await assertFails(updateDoc(doc(db(), `events/${EVENT_A}`), { title: 'planted' }));
    await assertFails(deleteDoc(doc(db(), `events/${EVENT_A}`)));
  });

  test('cannot read or write team A attendance', async () => {
    await assertFails(getDoc(doc(db(), `events/${EVENT_A}/attendance/${ENTRY_KID_A}`)));
    await assertFails(setDoc(doc(db(), `events/${EVENT_A}/attendance/${ENTRY_KID_A}`), { status: 'absent' }));
  });

  test('cannot read or write team A RSVPs', async () => {
    await assertFails(getDoc(doc(db(), `events/${EVENT_A}/rsvps/guardianA__${ENTRY_KID_A}`)));
    await assertFails(setDoc(doc(db(), `events/${EVENT_A}/rsvps/guardianA__${ENTRY_KID_A}`), {
      respondentUserId: 'adB', answer: 'no',
    }));
  });

  test('cannot read team A release plans', async () => {
    await assertFails(getDoc(doc(db(), `events/${EVENT_A}/releasePlans/${ENTRY_KID_A}`)));
  });

  test('cannot write team A game statistics or plays', async () => {
    await assertFails(setDoc(doc(db(), 'games/gameA/stats/entryKidA'), { points: 99 }));
    await assertFails(setDoc(doc(db(), 'games/gameA/plays/planted'), { side: 'us', actionKey: 'shot' }));
  });

  test('cannot read team A statistician requests', async () => {
    await assertFails(getDoc(doc(db(), 'gameStatisticianRequests/reqGameA')));
  });

  test('cannot read or post in team A comm board', async () => {
    await assertFails(getDoc(doc(db(), `chats/${TEAM_A}_commBoard/messages/msgA`)));
    await assertFails(setDoc(doc(db(), `chats/${TEAM_A}_commBoard/messages/planted`), {
      text: 'planted', senderId: 'adB',
    }));
  });

  test('cannot hide a message in team A', async () => {
    await assertFails(updateDoc(doc(db(), `chats/${TEAM_A}_commBoard/messages/msgA`), { hidden: true }));
  });

  test('cannot read School A audit log', async () => {
    await assertFails(getDoc(doc(db(), 'auditLogs/schoolA-log')));
  });

  test('cannot read or edit School A player records or guardians', async () => {
    await assertFails(getDoc(doc(db(), `players/${PLAYER_A}`)));
    await assertFails(updateDoc(doc(db(), `players/${PLAYER_A}`), { firstName: 'taken' }));
    await assertFails(getDoc(doc(db(), `players/${PLAYER_A}/guardians/guardianA`)));
    await assertFails(setDoc(doc(db(), `players/${PLAYER_A}/guardians/adB`), { name: 'planted' }));
  });

  test('cannot write School A record book or custom stats', async () => {
    await assertFails(updateDoc(doc(db(), `schools/${SCHOOL_A}/records/recA`), { value: '9.9' }));
    await assertFails(setDoc(doc(db(), `schools/${SCHOOL_A}/recordStats/planted`), { label: 'planted' }));
  });

  test('cannot read School A player claim queue', async () => {
    await assertFails(getDoc(doc(db(), `schools/${SCHOOL_A}/playerClaimRequests/claimA`)));
  });
});

describe('AD role alone never grants access', () => {
  let env;
  before(async () => { env = await freshEnv(seedFixtures); await seedSchoolB(env); });
  after(async () => { await env.cleanup(); });

  const as = (uid) => env.authenticatedContext(uid).firestore();

  test('an AD label with no school reaches no team', async () => {
    await env.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(doc(ctx.firestore(), 'users/adNoSchool'), { role: 'ad', schoolId: '', displayName: 'Nomad AD' });
    });
    await assertFails(getDoc(doc(as('adNoSchool'), `teams/${TEAM_A}/roster/${ENTRY_KID_A}`)));
    await assertFails(updateDoc(doc(as('adNoSchool'), `teams/${TEAM_A}`), { name: 'taken' }));
  });

  test('an AD whose school names a different AD reaches nothing', async () => {
    await env.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(doc(ctx.firestore(), 'users/adFake'), { role: 'ad', schoolId: SCHOOL_A, displayName: 'Fake AD' });
    });
    await assertFails(updateDoc(doc(as('adFake'), `teams/${TEAM_A}`), { name: 'taken' }));
    await assertFails(getDoc(doc(as('adFake'), `teams/${TEAM_A}/roster/${ENTRY_KID_A}`)));
  });

  test('a team with no schoolId fails closed for every AD', async () => {
    // test-team-basketball in production: no schoolId, no head coach, no owner signal.
    await assertFails(updateDoc(doc(as('adA'), `teams/${UNOWNED}`), { name: 'claimed' }));
    await assertFails(updateDoc(doc(as('adB'), `teams/${UNOWNED}`), { name: 'claimed' }));
  });

  test('an AD with no profile document at all reaches nothing', async () => {
    await assertFails(getDoc(doc(as('ghostAd'), `teams/${TEAM_A}/roster/${ENTRY_KID_A}`)));
  });
});

describe('everyone else keeps their intended permissions', () => {
  let env;
  before(async () => { env = await freshEnv(seedFixtures); await seedSchoolB(env); });
  after(async () => { await env.cleanup(); });

  const as = (uid) => env.authenticatedContext(uid).firestore();

  test('coach still manages their own team roster and events', async () => {
    await assertSucceeds(updateDoc(doc(as('coachA'), `teams/${TEAM_A}/roster/${ENTRY_KID_A}`), { jerseyNumber: '4' }));
    await assertSucceeds(addDoc(collection(as('coachA'), 'events'), { teamId: TEAM_A, type: 'practice', title: 'Coach practice' }));
  });

  test('coach of A cannot manage team B', async () => {
    await assertFails(updateDoc(doc(as('coachA'), `teams/${TEAM_B}`), { name: 'taken' }));
    await assertFails(getDoc(doc(as('coachA'), `teams/${TEAM_B}/roster/${ENTRY_B}`)));
  });

  test('staff reads the roster but does not manage the team', async () => {
    await assertSucceeds(getDoc(doc(as('staffA'), `teams/${TEAM_A}/roster/${ENTRY_KID_B}`)));
    await assertFails(updateDoc(doc(as('staffA'), `teams/${TEAM_A}`), { name: 'staff edit' }));
  });

  test('guardian reads their own child, not another family', async () => {
    await assertSucceeds(getDoc(doc(as('guardianA'), `teams/${TEAM_A}/roster/${ENTRY_KID_A}`)));
    await assertFails(getDoc(doc(as('guardianA'), `teams/${TEAM_A}/roster/${ENTRY_KID_B}`)));
  });

  test('athlete reads their own entry, not a teammate or another school', async () => {
    await assertSucceeds(getDoc(doc(as('kidA'), `teams/${TEAM_A}/roster/${ENTRY_KID_A}`)));
    await assertFails(getDoc(doc(as('kidA'), `teams/${TEAM_A}/roster/${ENTRY_KID_B}`)));
    await assertFails(getDoc(doc(as('kidA'), `teams/${TEAM_B}/roster/${ENTRY_B}`)));
  });

  test('guardian can still answer their own child RSVP and nothing else', async () => {
    await assertSucceeds(setDoc(doc(as('guardianA'), `events/${EVENT_A}/rsvps/guardianA__${ENTRY_KID_A}`), {
      respondentUserId: 'guardianA', athleteEntryId: ENTRY_KID_A, answer: 'yes',
    }));
    await assertFails(getDoc(doc(as('guardianA'), `events/${EVENT_B}/rsvps/guardianB2__${ENTRY_B}`)));
  });
});
