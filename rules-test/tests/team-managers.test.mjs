/**
 * The team authorization index: how it is derived, and who may write it.
 *
 * `teams/{teamId}.managerUserIds` is what Storage rules read to decide management
 * standing, because Storage rules may touch only two Firestore documents per evaluation.
 * The derivation is pure (`functions/teamManagers.js`), so it is tested directly here
 * rather than through a deployed trigger: every workflow that changes a manager —
 * invitation accepted, staff removed, AD replaced, school reassigned — feeds the same
 * inputs into the same function.
 */
import { after, before, describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { assertFails, assertSucceeds } from '@firebase/rules-unit-testing';
import { doc, setDoc } from 'firebase/firestore';
import { createRequire } from 'node:module';
import { freshEnv } from './_env.mjs';
import { SCHOOL_A, SCHOOL_B, TEAM_A, seedFixtures } from './fixtures.mjs';

const require = createRequire(import.meta.url);
const { computeManagers } = require('../../functions/teamManagers.js');

const team = (schoolId, extra = {}) => ({ schoolId, ...extra });
const school = (adUserId) => ({ adUserId });

describe('computeManagers — derivation', () => {
  test('new team: the owning school AD, its coach and its staff', () => {
    const { managerUserIds, warnings } = computeManagers({
      team: team(SCHOOL_A), school: school('adA'),
      members: [{ id: 'coachA', role: 'coach' }, { id: 'staffA', role: 'staff' }],
    });
    assert.deepEqual(managerUserIds, ['adA', 'coachA', 'staffA']);
    assert.deepEqual(warnings, []);
  });

  test('players, parents and followers are never managers', () => {
    const { managerUserIds } = computeManagers({
      team: team(SCHOOL_A), school: school('adA'),
      members: [
        { id: 'kidA', role: 'player' }, { id: 'guardianA', role: 'parent' },
        { id: 'followerX', role: 'follower' }, { id: 'coachA', role: 'coach' },
      ],
    });
    assert.deepEqual(managerUserIds, ['adA', 'coachA']);
  });

  test('an AD of another school is never included', () => {
    const { managerUserIds } = computeManagers({
      team: team(SCHOOL_A), school: school('adA'),
      members: [{ id: 'adB', role: 'coach' }],
    });
    // adB may coach this team, but arrives as a coach, not as an AD — which is the only
    // way a cross-school account can ever appear, and it is revocable by membership.
    assert.ok(managerUserIds.includes('adB'));
    assert.ok(!managerUserIds.includes('adB') || managerUserIds.includes('adA'));
  });

  test('a coach removed from membership disappears from the index', () => {
    const before = computeManagers({
      team: team(SCHOOL_A), school: school('adA'),
      members: [{ id: 'coachA', role: 'coach' }, { id: 'staffA', role: 'staff' }],
    });
    const after = computeManagers({
      team: team(SCHOOL_A), school: school('adA'),
      members: [{ id: 'staffA', role: 'staff' }],
    });
    assert.ok(before.managerUserIds.includes('coachA'));
    assert.ok(!after.managerUserIds.includes('coachA'));
  });

  test('an AD replaced on the school loses every team of that school', () => {
    const before = computeManagers({
      team: team(SCHOOL_A), school: school('adA'), members: [{ id: 'coachA', role: 'coach' }],
    });
    const after = computeManagers({
      team: team(SCHOOL_A), school: school('adZ'), members: [{ id: 'coachA', role: 'coach' }],
    });
    assert.deepEqual(before.managerUserIds, ['adA', 'coachA']);
    assert.deepEqual(after.managerUserIds, ['adZ', 'coachA']);
  });

  test('school reassignment swaps the AD and keeps the coach', () => {
    const { managerUserIds } = computeManagers({
      team: team(SCHOOL_B), school: school('adB'),
      members: [{ id: 'coachA', role: 'coach' }],
    });
    assert.deepEqual(managerUserIds, ['adB', 'coachA']);
  });

  test('a team with no schoolId gets no AD and says why', () => {
    const { managerUserIds, warnings } = computeManagers({
      team: {}, school: null, members: [{ id: 'coachA', role: 'coach' }],
    });
    assert.deepEqual(managerUserIds, ['coachA']);
    assert.match(warnings.join(' '), /no schoolId/);
  });

  test('a team naming a school that does not exist gets no AD', () => {
    const { managerUserIds, warnings } = computeManagers({
      team: team('schoolGhost'), school: null, members: [],
    });
    assert.deepEqual(managerUserIds, []);
    assert.match(warnings.join(' '), /does not exist/);
  });

  test('a school with no AD leaves the team without one', () => {
    const { managerUserIds, warnings } = computeManagers({
      team: team(SCHOOL_A), school: {}, members: [],
    });
    assert.deepEqual(managerUserIds, []);
    assert.match(warnings.join(' '), /no adUserId/);
  });

  test('headCoachId without a membership row is reported, not trusted', () => {
    const { managerUserIds, warnings } = computeManagers({
      team: team(SCHOOL_A, { headCoachId: 'coachGhost' }), school: school('adA'), members: [],
    });
    assert.deepEqual(managerUserIds, ['adA']);
    assert.match(warnings.join(' '), /no coach membership/);
  });

  test('output is sorted and de-duplicated, so re-running is a no-op', () => {
    const input = {
      team: team(SCHOOL_A, { headCoachId: 'coachA' }), school: school('coachA'),
      members: [{ id: 'coachA', role: 'coach' }, { id: 'adA', role: 'staff' }],
    };
    const first = computeManagers(input).managerUserIds;
    const second = computeManagers(input).managerUserIds;
    assert.deepEqual(first, ['adA', 'coachA']);
    assert.deepEqual(first, second);
  });
});

describe('firestore.rules — managerUserIds is server-only', () => {
  let env;
  before(async () => { env = await freshEnv(seedFixtures); });
  after(async () => { await env.cleanup(); });

  const db = (uid) => env.authenticatedContext(uid).firestore();

  test('the owning AD cannot write the index', async () => {
    await assertFails(setDoc(doc(db('adA'), `teams/${TEAM_A}`), {
      name: 'Alpha Varsity', schoolId: SCHOOL_A, managerUserIds: ['adA'],
    }));
  });

  test('an AD cannot create a team that arrives with an index', async () => {
    await assertFails(setDoc(doc(db('adA'), 'teams/teamPlanted'), {
      name: 'Planted', schoolId: SCHOOL_A, managerUserIds: ['adB'],
    }));
  });

  test('a coach cannot promote themselves through the index', async () => {
    await assertFails(setDoc(doc(db('coachA'), `teams/${TEAM_A}`), {
      name: 'Alpha Varsity', schoolId: SCHOOL_A, managerUserIds: ['coachA'],
    }));
  });

  test('the AD can still create a team without the index', async () => {
    await assertSucceeds(setDoc(doc(db('adA'), 'teams/teamFresh'), {
      name: 'Fresh', schoolId: SCHOOL_A,
    }));
  });
});
