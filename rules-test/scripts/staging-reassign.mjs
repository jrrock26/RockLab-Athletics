#!/usr/bin/env node
/**
 * reassignTeamSchool on staging, plus the assignTeamRole -> revokeTeamMember lifecycle.
 *
 *   node rules-test/scripts/staging-reassign.mjs
 *
 * Ownership changes are proved twice: through the callable, and by attempting the same thing
 * as a direct client write (which must now be refused). Access is proved against the real
 * bucket with real identities, before and after.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const MANIFEST = path.join(ROOT, '.local-test-accounts.staging.json');
const P = 'rocklab-athletics-staging';
const FN = `https://us-central1-${P}.cloudfunctions.net`;
const FS = `https://firestore.googleapis.com/v1/projects/${P}/databases/(default)/documents`;
const TEAM = 'qa-team';
const rows = [];
const note = (n, ok, d) => { rows.push({ n, ok }); console.log(`${ok ? 'PASS' : 'FAIL'}  ${n}  ${d}`); };

async function signIn(m, key) {
  const a = m.accounts[key];
  if (!a) throw new Error(`manifest has no account '${key}'`);
  const b = await fetch(`https://identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=${m.apiKey}`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: a.email, password: a.password, returnSecureToken: true }),
  }).then((r) => r.json());
  return { idToken: b.idToken, uid: b.localId };
}

const call = async (name, tok, data) => {
  const r = await fetch(`${FN}/${name}`, {
    method: 'POST',
    headers: { ...(tok ? { Authorization: `Bearer ${tok}` } : {}), 'Content-Type': 'application/json' },
    body: JSON.stringify({ data }),
  });
  const b = await r.json().catch(() => ({}));
  return { status: r.status, result: b.result, error: b.error };
};

const get = (tok, p) => fetch(`${FS}/${p}`, { headers: { Authorization: `Bearer ${tok}` } }).then((r) => r.json());
const storage = (m, tok, name) => fetch(
  `https://firebasestorage.googleapis.com/v0/b/${m.bucket}/o/${encodeURIComponent(name)}?alt=media`,
  tok ? { headers: { Authorization: `Bearer ${tok}` } } : {},
).then((r) => r.status);

const fd = (doc) => (doc && doc.fields) || {};
const arr = (f) => (f && f.arrayValue && f.arrayValue.values || []).map((v) => v.stringValue);

/** schoolId and the index must agree: current school's AD in, previous AD out. */
async function consistent(tok) {
  const team = fd(await get(tok, `teams/${TEAM}`));
  const schoolId = team.schoolId?.stringValue || '';
  const managers = arr(team.managerUserIds);
  const school = schoolId ? fd(await get(tok, `schools/${schoolId}`)) : {};
  const adId = school.adUserId?.stringValue || '';
  const members = (await get(tok, `teams/${TEAM}/members`)).documents || [];
  const managerRoles = members
    .filter((d) => ['coach', 'staff'].includes(d.fields?.role?.stringValue))
    .map((d) => d.name.split('/').pop());
  const expected = [...new Set([adId, ...managerRoles].filter(Boolean))].sort();
  return { schoolId, adId, managers, expected, ok: JSON.stringify([...managers].sort()) === JSON.stringify(expected) };
}

async function main() {
  if (!fs.existsSync(MANIFEST)) { console.log('NOT RUN: no staging manifest'); process.exit(2); }
  const m = JSON.parse(fs.readFileSync(MANIFEST, 'utf8'));
  if (m.project !== P) { console.log(`REFUSED: manifest is for ${m.project}`); process.exit(2); }

  const ad = await signIn(m, 'ad');
  const ad2 = await signIn(m, 'ad2');
  const coach = await signIn(m, 'coach');
  const parent = await signIn(m, 'parent');
  const athlete = await signIn(m, 'athlete');

  const team = fd(await get(ad.idToken, `teams/${TEAM}`));
  const homeSchool = team.schoolId?.stringValue || '';
  const headCoachId = team.headCoachId?.stringValue || '';
  console.log(`team ${TEAM}: school=${homeSchool}, headCoach=${headCoachId.slice(0, 6)}`);

  // Destination: an existing school whose AD is ad2, else one ad2 creates (rules allow self-create).
  const schoolList = (await get(ad.idToken, 'schools')).documents || [];
  let dest = schoolList
    .map((d) => ({ id: d.name.split('/').pop(), adUserId: d.fields?.adUserId?.stringValue }))
    .find((x) => x.adUserId === ad2.uid && x.id !== homeSchool);
  if (!dest) {
    const created = await fetch(`${FS}/schools?documentId=qa-school-b`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${ad2.idToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ fields: { name: { stringValue: 'QA School B' }, adUserId: { stringValue: ad2.uid } } }),
    }).then((r) => r.status);
    dest = { id: 'qa-school-b', adUserId: ad2.uid, created };
    console.log(`created destination school qa-school-b (HTTP ${created})`);
  }
  console.log(`destination school: ${dest.id} (AD ${dest.adUserId.slice(0, 6)})`);
  const DEST = dest.id;

  const media = `teams/${TEAM}/media/probe-${Date.now()}.mov`;

  // ---------- A. lifecycle: assignTeamRole -> index -> Storage -> revoke -> Storage ----------
  const assign = await call('assignTeamRole', ad.idToken, { teamId: TEAM, targetUid: parent.uid, role: 'staff' });
  note('assignTeamRole grants staff', assign.status === 200, `HTTP ${assign.status}`);

  let indexed = false;
  for (let i = 0; i < 20 && !indexed; i += 1) {
    indexed = arr(fd(await get(ad.idToken, `teams/${TEAM}`)).managerUserIds).includes(parent.uid);
    if (!indexed) await new Promise((r) => setTimeout(r, 400));
  }
  note('the manager index picks up the assignment', indexed, `indexed=${indexed}`);
  const assignedRead = await storage(m, parent.idToken, media);
  note('the assigned staff member can reach team media', assignedRead === 404, `HTTP ${assignedRead}`);

  const revoke = await call('revokeTeamMember', ad.idToken, { teamId: TEAM, targetUid: parent.uid });
  const tDone = Date.now();
  const revokedRead = await storage(m, parent.idToken, media);
  note('revokeTeamMember removes them and Storage denies immediately',
    revoke.status === 200 && revoke.result?.removed === true && revokedRead === 403,
    `HTTP ${revokedRead}, ${Date.now() - tDone} ms after the callable returned`);

  // restore: parent back to a plain member role for later suites
  await call('assignTeamRole', ad.idToken, { teamId: TEAM, targetUid: parent.uid, role: 'parent' });

  // ---------- B. direct client writes ----------
  const patch = (tok, fields, mask) => fetch(`${FS}/teams/${TEAM}?updateMask.fieldPaths=${mask}`, {
    method: 'PATCH',
    headers: { Authorization: `Bearer ${tok}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ fields }),
  }).then(async (r) => ({ status: r.status, body: (await r.text()).slice(0, 160) }));

  const directSchool = await patch(ad.idToken, { schoolId: { stringValue: DEST } }, 'schoolId');
  note('client cannot change schoolId directly', directSchool.status === 403, `HTTP ${directSchool.status}`);

  const directIndex = await patch(ad.idToken, { managerUserIds: { arrayValue: { values: [{ stringValue: ad.uid }] } } }, 'managerUserIds');
  note('client cannot write managerUserIds', directIndex.status === 403, `HTTP ${directIndex.status}`);

  const before = fd(await get(ad.idToken, `teams/${TEAM}`));
  const originalSeason = before.season?.stringValue || '';
  const editable = await patch(ad.idToken, { season: { stringValue: 'regression-check' } }, 'season');
  note('unrelated team fields are still editable', editable.status === 200, `HTTP ${editable.status} ${editable.body}`);
  await patch(ad.idToken, { season: { stringValue: originalSeason } }, 'season');

  // ---------- C. authorization on the callable ----------
  const cases = [
    ['coach is denied', coach, TEAM, DEST, 'PERMISSION_DENIED'],
    ['parent is denied', parent, TEAM, DEST, 'PERMISSION_DENIED'],
    ['athlete is denied', athlete, TEAM, DEST, 'PERMISSION_DENIED'],
    ['unrelated-school AD is denied', ad2, TEAM, DEST, 'PERMISSION_DENIED'],
    ['nonexistent destination is rejected', ad, TEAM, 'qa-school-nope', 'FAILED_PRECONDITION'],
    ['unchanged school is rejected', ad, TEAM, homeSchool, 'FAILED_PRECONDITION'],
    ['missing schoolId is rejected', ad, TEAM, '', 'INVALID_ARGUMENT'],
  ];
  for (const [label, who, teamId, schoolId, expected] of cases) {
    const r = await call('reassignTeamSchool', who.idToken, { teamId, schoolId });
    note(label, r.error?.status === expected, `${r.error?.status || 'no error'}`);
  }
  const anon = await call('reassignTeamSchool', null, { teamId: TEAM, schoolId: DEST });
  note('unauthenticated caller is denied', anon.status === 401, `${anon.error?.status || anon.status}`);

  // Failed attempts must not have moved anything.
  const afterAttempts = await consistent(ad.idToken);
  note('denied attempts left ownership unchanged', afterAttempts.schoolId === homeSchool && afterAttempts.ok,
    `school=${afterAttempts.schoolId}, consistent=${afterAttempts.ok}`);

  // ---------- D. the real transfer ----------
  const beforeAd = await storage(m, ad.idToken, media);
  const beforeAd2 = await storage(m, ad2.idToken, media);
  note('former-school AD can read team media before the transfer', beforeAd === 404, `HTTP ${beforeAd}`);
  note('destination AD is refused before the transfer', beforeAd2 === 403, `HTTP ${beforeAd2}`);

  const t0 = Date.now();
  const move = await call('reassignTeamSchool', ad.idToken, { teamId: TEAM, schoolId: DEST });
  const tMoved = Date.now();
  note('current-school AD transfers the team', move.status === 200 && move.result?.toSchoolId === DEST,
    `HTTP ${move.status}, ${tMoved - t0} ms`);
  note('the returned index names the destination AD and not the old one',
    arr({ arrayValue: { values: (move.result?.managerUserIds || []).map((s) => ({ stringValue: s })) } }).includes(dest.adUserId)
      && !(move.result?.managerUserIds || []).includes(ad.uid),
    JSON.stringify(move.result?.managerUserIds));

  const afterAd = await storage(m, ad.idToken, media);
  show('former-school AD is denied immediately', afterAd === 403,
    `before ${beforeAd}, after ${afterAd}, ${Date.now() - tMoved} ms after the callable returned`);
  const afterAd2 = await storage(m, ad2.idToken, media);
  show('destination AD has access immediately', afterAd2 === 404, `before ${beforeAd2}, after ${afterAd2}`);
  const coachAfter = await storage(m, coach.idToken, media);
  show('the team coach retains access', coachAfter === 404, `HTTP ${coachAfter}`);

  const state = await consistent(ad2.idToken);
  note('ownership and index agree after the transfer', state.schoolId === DEST && state.ok && state.adId === dest.adUserId,
    `school=${state.schoolId}, ad=${state.adId.slice(0, 6)}, managers=${state.managers.length}`);

  // ---------- E. duplicate and concurrent ----------
  const dup = await call('reassignTeamSchool', ad2.idToken, { teamId: TEAM, schoolId: DEST });
  note('a duplicate request is refused and changes nothing',
    dup.error?.status === 'FAILED_PRECONDITION' && (await consistent(ad2.idToken)).schoolId === DEST,
    `${dup.error?.status}`);

  const [r1, r2] = await Promise.all([
    call('reassignTeamSchool', ad2.idToken, { teamId: TEAM, schoolId: homeSchool }),
    call('reassignTeamSchool', ad2.idToken, { teamId: TEAM, schoolId: homeSchool }),
  ]);
  const wins = [r1, r2].filter((r) => r.status === 200).length;
  const rest = await consistent(ad.idToken);
  note('concurrent reassignments apply once and leave a consistent state',
    wins === 1 && rest.schoolId === homeSchool && rest.ok,
    `${wins} succeeded, school=${rest.schoolId}, consistent=${rest.ok}`);

  const homeAdBack = await storage(m, ad.idToken, media);
  const destAdBack = await storage(m, ad2.idToken, media);
  note('after the team returns home the old AD is restored and the other AD is out',
    homeAdBack === 404 && destAdBack === 403, `home ${homeAdBack}, dest ${destAdBack}`);

  const failed = rows.filter((r) => !r.ok);
  console.log(`\n${rows.length - failed.length}/${rows.length} reassignment + lifecycle cases behaved as required.`);
  process.exit(failed.length ? 1 : 0);
}

function show(n, ok, d) { note(n, ok, d); }

main().catch((e) => { console.error('reassign harness error:', e.message); process.exit(1); });
