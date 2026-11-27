#!/usr/bin/env node
/**
 * Manager index maintenance on staging, with real users and real latency.
 *
 *   node rules-test/scripts/staging-managers.mjs
 *
 * Every grant and revocation here is performed by writing the SOURCE records (team,
 * membership, school) and then watching the deployed triggers rebuild
 * `managerUserIds`. Storage access is then tested with the affected account's own ID
 * token, because a function returning successfully says nothing about what the bucket
 * will actually allow.
 *
 * Firestore triggers are asynchronous: each case measures how long the index took to
 * converge, so revocation latency is reported rather than assumed.
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const MANIFEST = path.join(ROOT, '.local-test-accounts.staging.json');
const PROJECT = 'rocklab-athletics-staging';
const FS = `https://firestore.googleapis.com/v1/projects/${PROJECT}/databases/(default)/documents`;

const s = (v) => ({ stringValue: v });
const results = [];
const note = (name, ok, detail) => {
  results.push({ name, ok, detail });
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}  ${detail}`);
};

function operator() {
  const c = JSON.parse(fs.readFileSync(path.join(os.homedir(), '.config/configstore/firebase-tools.json'), 'utf8'));
  return c.tokens.access_token;
}

async function patch(t, docPath, fields, mask) {
  const q = mask ? `?${mask.map((m) => `updateMask.fieldPaths=${m}`).join('&')}` : '';
  const r = await fetch(`${FS}/${docPath}${q}`, {
    method: 'PATCH',
    headers: { Authorization: `Bearer ${t}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ fields }),
  });
  if (!r.ok) throw new Error(`patch ${docPath}: ${r.status} ${(await r.text()).slice(0, 120)}`);
}
async function read(t, docPath) {
  const r = await fetch(`${FS}/${docPath}`, { headers: { Authorization: `Bearer ${t}` } });
  if (r.status === 404) return null;
  const j = await r.json();
  return j.fields || null;
}
async function del(t, docPath) {
  await fetch(`${FS}/${docPath}`, { method: 'DELETE', headers: { Authorization: `Bearer ${t}` } });
}
const managers = (doc) => (doc?.managerUserIds?.arrayValue?.values || []).map((v) => v.stringValue);

/// Waits until the index matches `want`, returning the elapsed time. 30s ceiling: a
/// trigger that never converges must be a recorded failure, not a hang.
async function waitFor(t, docPath, want, label) {
  const start = Date.now();
  let last = null;
  while (Date.now() - start < 30000) {
    const doc = await read(t, docPath);
    last = managers(doc);
    if (last.length === want.length && last.every((v, i) => v === want[i])) {
      return { ok: true, ms: Date.now() - start, got: last };
    }
    await new Promise((r) => setTimeout(r, 200));
  }
  return { ok: false, ms: 30000, got: last };
}

async function token(m, key) {
  const r = await fetch(`https://identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=${m.apiKey}`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: m.accounts[key].email, password: m.accounts[key].password, returnSecureToken: true }),
  });
  const b = await r.json();
  return { idToken: b.idToken, uid: b.localId };
}

const upload = (m, t, name, ct = 'image/jpeg') =>
  fetch(`https://firebasestorage.googleapis.com/v0/b/${m.bucket}/o?name=${encodeURIComponent(name)}&uploadType=media`, {
    method: 'POST', headers: { Authorization: `Bearer ${t}`, 'Content-Type': ct }, body: 'x',
  }).then((r) => r.status);

async function main() {
  if (!fs.existsSync(MANIFEST)) { console.log('NOT RUN: no staging manifest'); process.exit(2); }
  const m = JSON.parse(fs.readFileSync(MANIFEST, 'utf8'));
  if (m.project !== PROJECT) { console.log(`REFUSED: manifest is for ${m.project}`); process.exit(2); }

  const op = operator();
  const ad = await token(m, 'ad');
  const ad2 = await token(m, 'ad2');
  const coach = await token(m, 'coach');
  const team = 'qa-trigger-team';
  const stamp = Date.now();
  console.log(`project: ${PROJECT}\nteam under test: ${team}\n`);

  // 1. New team: trigger derives the school AD, nobody else.
  await patch(op, `teams/${team}`, { name: s('Trigger Test Team'), schoolId: s('qa-school'), isQaFixture: { booleanValue: true } });
  let r = await waitFor(op, `teams/${team}`, [ad.uid], 'create');
  note('new team creation derives the owning AD', r.ok, `${r.ms}ms managers=[${r.got}]`);

  // 2. Coach grant: membership row appears, index follows, and the coach can upload.
  await patch(op, `teams/${team}/members/${coach.uid}`, { role: s('coach'), userId: s(coach.uid) });
  r = await waitFor(op, `teams/${team}`, [ad.uid, coach.uid].sort(), 'coach grant');
  note('coach membership grants index entry', r.ok, `${r.ms}ms managers=[${r.got}]`);
  note('granted coach uploads team media', (await upload(m, coach.idToken, `teams/${team}/media/g-${stamp}.jpg`)) === 200, 'HTTP 200');

  // 3. Staff grant/removal, throttled to keep the harness short.
  await patch(op, `teams/${team}/members/staffqa`, { role: s('staff'), userId: s('staffqa') });
  r = await waitFor(op, `teams/${team}`, [ad.uid, coach.uid, 'staffqa'].sort(), 'staff grant');
  note('staff membership grants index entry', r.ok, `${r.ms}ms managers=[${r.got}]`);
  await del(op, `teams/${team}/members/staffqa`);
  r = await waitFor(op, `teams/${team}`, [ad.uid, coach.uid].sort(), 'staff removal');
  note('staff removal revokes index entry', r.ok, `${r.ms}ms managers=[${r.got}]`);

  // 4. Duplicate and out-of-order writes must not duplicate entries.
  await patch(op, `teams/${team}/members/${coach.uid}`, { role: s('coach'), userId: s(coach.uid) });
  await patch(op, `teams/${team}/members/${coach.uid}`, { role: s('coach'), userId: s(coach.uid) });
  r = await waitFor(op, `teams/${team}`, [ad.uid, coach.uid].sort(), 'duplicate');
  const noDupes = r.got.length === new Set(r.got).size;
  note('duplicate events produce no duplicate ids', r.ok && noDupes, `${r.ms}ms managers=[${r.got}]`);

  // 5. Self-heal after a corrupted index (stands in for a failed/partial update).
  await patch(op, `teams/${team}`, { managerUserIds: { arrayValue: { values: [s('intruder')] } } }, ['managerUserIds']);
  r = await waitFor(op, `teams/${team}`, [ad.uid, coach.uid].sort(), 'self-heal');
  note('a corrupted index is rebuilt from source', r.ok, `${r.ms}ms managers=[${r.got}]`);

  // 6. Coach revocation, with the measured delay and the bucket's answer afterwards.
  await del(op, `teams/${team}/members/${coach.uid}`);
  const revoke = await waitFor(op, `teams/${team}`, [ad.uid], 'coach removal');
  note('coach removal revokes index entry', revoke.ok, `${revoke.ms}ms managers=[${revoke.got}]`);
  const afterRevoke = await upload(m, coach.idToken, `teams/${team}/media/rev-${stamp}.jpg`);
  note('revoked coach is refused by the bucket', afterRevoke === 403, `HTTP ${afterRevoke}`);
  console.log(`      measured revocation latency: ${revoke.ms}ms`);

  // 7. AD replacement on the school: outgoing AD loses every team of that school.
  await patch(op, 'schools/qa-school', { adUserId: s(ad2.uid) }, ['adUserId']);
  const swapped = await waitFor(op, `teams/${team}`, [ad2.uid], 'AD replaced');
  note('AD replacement rewrites the index', swapped.ok, `${swapped.ms}ms managers=[${swapped.got}]`);
  note('outgoing AD is refused by the bucket', (await upload(m, ad.idToken, `teams/${team}/media/old-${stamp}.jpg`)) === 403, 'HTTP 403');
  note('incoming AD is allowed by the bucket', (await upload(m, ad2.idToken, `teams/${team}/media/new-${stamp}.jpg`)) === 200, 'HTTP 200');
  await patch(op, 'schools/qa-school', { adUserId: s(ad.uid) }, ['adUserId']);
  await waitFor(op, `teams/${team}`, [ad.uid], 'AD restored');

  // 8. School reassignment: the old school's AD leaves, the new one enters.
  await patch(op, `teams/${team}`, { schoolId: s('qa-school-2') }, ['schoolId']);
  const moved = await waitFor(op, `teams/${team}`, [ad2.uid], 'school reassignment');
  note('school reassignment swaps the owning AD', moved.ok, `${moved.ms}ms managers=[${moved.got}]`);
  await patch(op, `teams/${team}`, { schoolId: s('qa-school') }, ['schoolId']);
  await waitFor(op, `teams/${team}`, [ad.uid], 'school restored');

  // 9. Unowned and ghost-school teams stay empty.
  const unowned = managers(await read(op, 'teams/qa-team-unowned'));
  note('unowned team remains without managers', unowned.length === 0, `managers=[${unowned}]`);
  await patch(op, `teams/${team}`, { schoolId: s('qa-school-ghost') }, ['schoolId']);
  const ghost = await waitFor(op, `teams/${team}`, [], 'ghost school');
  note('team naming a nonexistent school gets no managers', ghost.ok, `${ghost.ms}ms managers=[${ghost.got}]`);
  note('ghost-school team is refused by the bucket', (await upload(m, ad.idToken, `teams/${team}/media/ghost-${stamp}.jpg`)) === 403, 'HTTP 403');
  await patch(op, `teams/${team}`, { schoolId: s('qa-school') }, ['schoolId']);
  await waitFor(op, `teams/${team}`, [ad.uid], 'final restore');

  const failed = results.filter((x) => !x.ok);
  console.log(`\n${results.length - failed.length}/${results.length} manager cases behaved as required.`);
  process.exit(failed.length ? 1 : 0);
}

main().catch((e) => { console.error('manager harness error:', e.message); process.exit(1); });
