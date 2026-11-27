/**
 * The smallest dataset that can express every access boundary in the rules:
 * two schools (so "my school" is testable), one team, two families, and the
 * role variants a roster entry distinguishes.
 *
 * Ids are readable on purpose: a failing assertion should say
 * "guardianA cannot read entryKidB", not "doc 4f2a9c".
 */
import { doc, setDoc } from 'firebase/firestore';

export const SCHOOL_A = 'schoolA';
export const SCHOOL_B = 'schoolB';
export const TEAM_A = 'teamA';
export const ENTRY_KID_A = 'entryKidA';
export const ENTRY_KID_B = 'entryKidB';

export async function seedFixtures(db) {
  const write = (path, data) => setDoc(doc(db, path), data);

  await write(`schools/${SCHOOL_A}`, { name: 'Alpha High', adUserId: 'adA' });
  await write(`schools/${SCHOOL_B}`, { name: 'Bravo High', adUserId: 'adB' });

  // Users. `role` and `schoolId` are what nearly every rule reads.
  await write('users/adA', { role: 'ad', schoolId: SCHOOL_A, displayName: 'Ada Alpha', email: 'ad.a@example.com' });
  await write('users/adB', { role: 'ad', schoolId: SCHOOL_B, displayName: 'Bo Bravo', email: 'ad.b@example.com' });
  await write('users/coachA', { role: 'coach', schoolId: SCHOOL_A, displayName: 'Casey Coach' });
  await write('users/coachB', { role: 'coach', schoolId: SCHOOL_B, displayName: 'Cleo Coach' });
  await write('users/staffA', { role: 'staff', schoolId: SCHOOL_A, displayName: 'Sam Staff' });
  await write('users/guardianA', { role: 'parent', schoolId: SCHOOL_A, displayName: 'Gale Guardian', email: 'guardian.a@example.com' });
  await write('users/guardianB', { role: 'parent', schoolId: SCHOOL_A, displayName: 'Gus Guardian', email: 'guardian.b@example.com' });
  await write('users/kidA', { role: 'player', schoolId: SCHOOL_A, displayName: 'Kai Kid' });
  await write('users/followerX', { role: 'follower', displayName: 'Fran Follower' });

  // `managerUserIds` is what Storage rules read for management standing. In production
  // it is maintained by the teamManagers Cloud Functions; here it is seeded to the value
  // those functions derive from schools.adUserId and the coach/staff membership rows.
  await write(`teams/${TEAM_A}`, {
    name: 'Alpha Varsity', schoolId: SCHOOL_A,
    managerUserIds: ['adA', 'coachA', 'staffA'],
  });

  // Fail-closed cases: a team with no ownership record, and one naming a school that
  // does not exist. Neither may ever gain an AD, and neither has a manager index.
  await write('teams/teamNoSchool', { name: 'Orphan Team' });
  await write('teams/teamGhostSchool', { name: 'Ghost Team', schoolId: 'schoolGhost' });

  // Memberships decide team standing; roster entries decide family standing.
  await write(`teams/${TEAM_A}/members/coachA`, { role: 'coach' });
  await write(`teams/${TEAM_A}/members/staffA`, { role: 'staff' });
  await write(`teams/${TEAM_A}/members/guardianA`, { role: 'parent' });
  await write(`teams/${TEAM_A}/members/guardianB`, { role: 'parent' });
  await write(`teams/${TEAM_A}/members/kidA`, { role: 'player' });
  await write(`teams/${TEAM_A}/members/followerX`, { role: 'follower' });

  // Roster entries carry the guardian link. `guardianUserIds` is the only field
  // that may confer family standing, because it is server-written.
  await write(`teams/${TEAM_A}/roster/${ENTRY_KID_A}`, {
    firstName: 'Kai', lastName: 'Kid', userId: 'kidA',
    guardianUserIds: ['guardianA'], injuryStatus: 'healthy',
  });
  await write(`teams/${TEAM_A}/roster/${ENTRY_KID_B}`, {
    firstName: 'Kim', lastName: 'Kid', userId: 'kidB',
    guardianUserIds: ['guardianB'], injuryStatus: 'out',
  });

  // An invitation for guardianA, and one for a schoolB address (used to prove the
  // same-school clause on the AD read branch).
  await write('invitations/inviteA', {
    email: 'guardian.a@example.com', schoolId: SCHOOL_A, teamId: TEAM_A, role: 'parent', code: 'K7QP4MXR',
  });
  await write('invitations/inviteB', {
    email: 'someone.b@example.com', schoolId: SCHOOL_B, role: 'parent', code: 'ZZZZ2222',
  });

  // The three collections whose delete rules read `request.resource` (and so denied
  // every delete), plus a fundraiser with a donation to scope. They carry `teamId` and
  // no `schoolId`, exactly as iOS and `reportContent` write them, which is why the
  // rules resolve their school through the team.
  await write('events/eventA', { teamId: TEAM_A, type: 'game', title: 'Alpha vs Bravo' });
  await write('trips/tripA', { teamId: TEAM_A, title: 'District finals', destination: 'Springfield' });
  await write('fundraisers/fundA', { teamId: TEAM_A, title: 'Equipment fund', goal: 5000, raised: 0 });
  await write('fundraisers/fundA/donations/don1', { amount: 50, donorName: 'A Donor' });

  // Moderation queue and audit trail: both server-write only. The report carries the
  // shape `reportContent` actually writes -- `teamId`, no `schoolId`.
  await write('reports/reportA', {
    teamId: TEAM_A, contentType: 'message', contentId: 'msg1', reason: 'spam',
    reportedBy: 'guardianA', reportedUserId: 'kidB', status: 'open',
  });
  await write(`auditLogs/${SCHOOL_A}-log`, { schoolId: SCHOOL_A, action: 'test' });
  await write(`auditLogs/${SCHOOL_B}-log`, { schoolId: SCHOOL_B, action: 'test' });
}
