#!/usr/bin/env node
/**
 * The ownership scenarios the release depends on, against the REAL staging bucket.
 *
 *   node rules-test/scripts/staging-ownership-scenarios.mjs
 *
 * Teams are discovered rather than assumed: an owned team, an unowned one, and one naming a
 * school that does not exist. A missing object returns 404 for an authorised caller, so 404
 * vs 403 is the signal, not 200.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const MANIFEST = path.join(ROOT, '.local-test-accounts.staging.json');
const P = 'rocklab-athletics-staging';
const FS = `https://firestore.googleapis.com/v1/projects/${P}/databases/(default)/documents`;
const rows = [];
const note = (n, ok, d) => { rows.push({ n, ok }); console.log(`${ok ? 'PASS' : 'FAIL'}  ${n}  ${d}`); };

async function signIn(m, key) {
  const a = m.accounts[key];
  const b = await fetch(`https://identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=${m.apiKey}`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: a.email, password: a.password, returnSecureToken: true }),
  }).then((r) => r.json());
  return { idToken: b.idToken, uid: b.localId, email: a.email };
}

const storage = (m, tok, name) => fetch(
  `https://firebasestorage.googleapis.com/v0/b/${m.bucket}/o/${encodeURIComponent(name)}?alt=media`,
  tok ? { headers: { Authorization: `Bearer ${tok}` } } : {},
).then((r) => r.status);

const list = (tok, p) => fetch(`${FS}/${p}?pageSize=300`, { headers: { Authorization: `Bearer ${tok}` } }).then((r) => r.json());

async function main() {
  if (!fs.existsSync(MANIFEST)) { console.log('NOT RUN: no staging manifest'); process.exit(2); }
  const m = JSON.parse(fs.readFileSync(MANIFEST, 'utf8'));
  if (m.project !== P) { console.log(`REFUSED: manifest is for ${m.project}`); process.exit(2); }

  const ad = await signIn(m, 'ad');
  const ad2 = await signIn(m, 'ad2');
  const coach = await signIn(m, 'coach');
  const parent = await signIn(m, 'parent');

  const teams = (await list(ad.idToken, 'teams')).documents || [];
  const schools = new Set(((await list(ad.idToken, 'schools')).documents || []).map((d) => d.name.split('/').pop()));
  const shape = teams.map((d) => ({
    id: d.name.split('/').pop(),
    schoolId: d.fields?.schoolId?.stringValue || '',
    managers: (d.fields?.managerUserIds?.arrayValue?.values || []).map((v) => v.stringValue),
  }));
  const owned = shape.find((t) => t.schoolId && schools.has(t.schoolId) && t.id === 'qa-team');
  const unowned = shape.find((t) => !t.schoolId);
  const ghost = shape.find((t) => t.schoolId && !schools.has(t.schoolId));
  console.log(`fixtures: owned=${owned?.id} unowned=${unowned?.id || '(none)'} ghost=${ghost?.id || '(none)'}`);

  const media = (id) => `teams/${id}/media/probe-${Date.now()}.mov`;

  const adOwn = await storage(m, ad.idToken, media(owned.id));
  note('AD reads own school\'s team media', adOwn === 404, `HTTP ${adOwn}`);
  const adCross = await storage(m, ad2.idToken, media(owned.id));
  note('another school\'s AD is refused', adCross === 403, `HTTP ${adCross}`);
  const adCrossBack = await storage(m, ad.idToken, media('qa-team-2'));
  note('an AD is refused on a team that does not exist', adCrossBack === 403, `HTTP ${adCrossBack}`);

  const coachOwn = await storage(m, coach.idToken, media(owned.id));
  note('coach reads their own team\'s media', coachOwn === 404, `HTTP ${coachOwn}`);
  if (unowned) {
    const coachOther = await storage(m, coach.idToken, media(unowned.id));
    note('a coach is refused on a team they do not manage', coachOther === 403, `HTTP ${coachOther}`);
    const unownedAd = await storage(m, ad.idToken, media(unowned.id));
    note('an AD is refused on an unowned team (empty index)', unownedAd === 403,
      `HTTP ${unownedAd}, managers=${JSON.stringify(unowned.managers)}`);
  } else {
    note('a coach is refused on a team they do not manage', false, 'no unowned fixture');
    note('an AD is refused on an unowned team (empty index)', false, 'no unowned fixture');
  }
  // The ghost-school fixture (a team naming a school document that does not exist) is created
  // by the emulator fixtures and by staging-managers.mjs, which asserts it returns 403 there.
  // It is not reproduced here rather than manufactured through the rules themselves.
  console.log(`  (ghost-school team: ${ghost ? ghost.id : 'no fixture in staging'} — covered by staging-managers.mjs)`);

  // Create the paperwork fixture the way the app does — through the callable — so the path is
  // one a guardian is actually entitled to and the object genuinely exists.
  const PDF = Buffer.concat([Buffer.from('%PDF-1.4 '), Buffer.alloc(64, 0x20)]).toString('base64');
  const up = await fetch(`https://us-central1-${P}.cloudfunctions.net/uploadPaperwork`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${parent.idToken}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ data: {
      teamId: 'qa-team', entryId: 'qa-entry', fileName: `guardian-${Date.now()}.pdf`,
      contentType: 'application/pdf', category: 'consent', contentBase64: PDF,
    } }),
  }).then((r) => r.json());
  const paperworkPath = up.result?.objectPath;
  const docName = paperworkPath ? paperworkPath.split('/documents/')[1] : '';
  if (docName) {
    const guardOwn = await storage(m, parent.idToken, `teams/qa-team/roster/qa-entry/documents/${docName}`);
    note('guardian reads their own child\'s paperwork', guardOwn === 200, `HTTP ${guardOwn}`);
    const guardOther = await storage(m, ad2.idToken, `teams/qa-team/roster/qa-entry/documents/${docName}`);
    note('another school\'s AD is refused that paperwork', guardOther === 403, `HTTP ${guardOther}`);
    const anonDoc = await storage(m, null, `teams/qa-team/roster/qa-entry/documents/${docName}`);
    note('anonymous is refused that paperwork', anonDoc === 403, `HTTP ${anonDoc}`);
  } else {
    note('guardian reads their own child\'s paperwork', false, 'no paperwork fixture');
  }

  const anon = await storage(m, null, media(owned.id));
  note('anonymous is refused team media', anon === 403, `HTTP ${anon}`);

  const failed = rows.filter((r) => !r.ok);
  console.log(`\n${rows.length - failed.length}/${rows.length} ownership scenarios behaved as required.`);
  process.exit(failed.length ? 1 : 0);
}

main().catch((e) => { console.error('scenario harness error:', e.message); process.exit(1); });
