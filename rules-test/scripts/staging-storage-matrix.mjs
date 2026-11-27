#!/usr/bin/env node
/**
 * Real Storage authorization matrix against the staging bucket.
 *
 *   node rules-test/scripts/staging-storage-matrix.mjs
 *
 * Every line is a live request to rocklab-athletics-staging.firebasestorage.app with a
 * real ID token. Read, create, update and delete are tested separately wherever the
 * rules define them separately -- the Storage emulator reports every write as create,
 * so it cannot exercise `allow update` at all.
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const MANIFEST = path.join(ROOT, '.local-test-accounts.staging.json');
const PROJECT = 'rocklab-athletics-staging';
const FS = `https://firestore.googleapis.com/v1/projects/${PROJECT}/databases/(default)/documents`;

const rows = [];
const log = (area, name, status, expect) => {
  const ok = status === expect;
  rows.push({ area, name, status, expect, ok });
  console.log(`${ok ? 'PASS' : 'FAIL'}  [${area}] ${name}  (HTTP ${status}, expected ${expect})`);
};

function operator() {
  const c = JSON.parse(fs.readFileSync(path.join(os.homedir(), '.config/configstore/firebase-tools.json'), 'utf8'));
  return c.tokens.access_token;
}

async function seed(token, docPath, fields) {
  const r = await fetch(`${FS}/${docPath}`, {
    method: 'PATCH',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ fields }),
  });
  if (!r.ok) throw new Error(`seed ${docPath}: ${r.status}`);
}

async function signIn(key, email, password) {
  const r = await fetch(`https://identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=${key}`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password, returnSecureToken: true }),
  });
  const b = await r.json();
  if (!r.ok) throw new Error(`sign-in ${email}: ${b?.error?.message}`);
  return b.idToken;
}

const b = (bucket) => `https://firebasestorage.googleapis.com/v0/b/${bucket}/o`;

function upload(token, bucket, name, body, contentType) {
  return fetch(`${b(bucket)}?name=${encodeURIComponent(name)}&uploadType=media`, {
    method: 'POST', headers: { Authorization: `Bearer ${token}`, 'Content-Type': contentType }, body,
  }).then((r) => r.status);
}
function read(token, bucket, name) {
  return fetch(`${b(bucket)}/${encodeURIComponent(name)}?alt=media`, { headers: { Authorization: `Bearer ${token}` } }).then((r) => r.status);
}
function remove(token, bucket, name) {
  return fetch(`${b(bucket)}/${encodeURIComponent(name)}`, { method: 'DELETE', headers: { Authorization: `Bearer ${token}` } }).then((r) => r.status);
}

async function main() {
  if (!fs.existsSync(MANIFEST)) { console.log('NOT RUN: no staging manifest.'); process.exit(2); }
  const m = JSON.parse(fs.readFileSync(MANIFEST, 'utf8'));
  if (m.project !== PROJECT) { console.log(`REFUSED: manifest project is ${m.project}, not ${PROJECT}.`); process.exit(2); }
  const bucket = m.bucket;
  const t = {};
  for (const [k, v] of Object.entries(m.accounts)) t[k] = await signIn(m.apiKey, v.email, v.password);
  console.log(`bucket: ${bucket}`);
  console.log(`actors: ${Object.keys(t).join(', ')}\n`);

  // An unowned team: no schoolId, no members. Nothing may reach it.
  const op = operator();
  await seed(op, 'teams/qa-team-unowned', { name: { stringValue: 'QA Unowned Team' }, sportId: { stringValue: 'basketball' }, isQaFixture: { booleanValue: true } });

  const png = 'image/png', pdf = 'application/pdf', jpg = 'image/jpeg', mp4 = 'video/mp4';
  const s = Date.now();

  // --- School media (logo): AD of that school writes, any signed-in account reads
  const logo = `schools/qa-school/logo-${s}.png`;
  log('school media', 'AD A creates own school logo', await upload(t.ad, bucket, logo, 'a', png), 200);
  log('school media', 'AD A overwrites own school logo', await upload(t.ad, bucket, logo, 'b', png), 200);
  log('school media', 'AD B writes school A logo', await upload(t.ad2, bucket, `schools/qa-school/x-${s}.png`, 'a', png), 403);
  log('school media', 'coach writes school A logo', await upload(t.coach, bucket, `schools/qa-school/c-${s}.png`, 'a', png), 403);
  log('school media', 'AD B reads school A logo (read is signedIn by design)', await read(t.ad2, bucket, logo), 200);
  log('school media', 'AD A deletes own school logo', await remove(t.ad, bucket, logo), 204);

  // --- Team media
  const media = `teams/qa-team/media/photo-${s}.jpg`;
  log('team media', 'AD A creates team media', await upload(t.ad, bucket, media, 'a', jpg), 200);
  log('team media', 'AD A overwrites team media', await upload(t.ad, bucket, media, 'b', jpg), 200);
  log('team media', 'coach creates team media', await upload(t.coach, bucket, `teams/qa-team/media/c-${s}.jpg`, 'a', jpg), 200);
  log('team media', 'parent creates team media', await upload(t.parent, bucket, `teams/qa-team/media/p-${s}.jpg`, 'a', jpg), 403);
  log('team media', 'parent reads team media', await read(t.parent, bucket, media), 200);
  log('team media', 'athlete reads team media', await read(t.athlete, bucket, media), 200);
  log('team media', 'AD B reads team A media', await read(t.ad2, bucket, media), 403);
  log('team media', 'AD B creates team A media', await upload(t.ad2, bucket, `teams/qa-team/media/x-${s}.jpg`, 'a', jpg), 403);
  log('team media', 'AD B deletes team A media', await remove(t.ad2, bucket, media), 403);
  log('team media', 'AD A deletes team media', await remove(t.ad, bucket, media), 204);

  // --- Game film
  const film = `teams/qa-team/videos/film-${s}.mp4`;
  log('team film', 'coach creates game film', await upload(t.coach, bucket, film, 'a', mp4), 200);
  log('team film', 'AD A reads game film', await read(t.ad, bucket, film), 200);
  log('team film', 'parent reads game film', await read(t.parent, bucket, film), 200);
  log('team film', 'parent creates game film', await upload(t.parent, bucket, `teams/qa-team/videos/p-${s}.mp4`, 'a', mp4), 403);
  log('team film', 'AD B reads school A film', await read(t.ad2, bucket, film), 403);
  log('team film', 'AD B creates school A film', await upload(t.ad2, bucket, `teams/qa-team/videos/x-${s}.mp4`, 'a', mp4), 403);
  log('team film', 'coach deletes game film', await remove(t.coach, bucket, film), 204);

  // --- Athlete paperwork: the create/update split
  const paper = `teams/qa-team/roster/qa-entry/documents/p-${s}.pdf`;
  log('paperwork', 'guardian CREATE own child paperwork', await upload(t.parent, bucket, paper, 'first', pdf), 200);
  log('paperwork', 'guardian UPDATE same paperwork denied', await upload(t.parent, bucket, paper, 'second', pdf), 403);
  log('paperwork', 'guardian create for another family denied', await upload(t.parent, bucket, `teams/qa-team/roster/qa-entry-other/documents/x-${s}.pdf`, 'a', pdf), 403);
  log('paperwork', 'guardian read another family denied', await read(t.parent, bucket, `teams/qa-team/roster/qa-entry-other/documents/x-${s}.pdf`), 403);
  log('paperwork', 'coach reads paperwork', await read(t.coach, bucket, paper), 200);
  log('paperwork', 'coach UPDATE paperwork allowed', await upload(t.coach, bucket, paper, 'third', pdf), 200);
  log('paperwork', 'athlete reads own paperwork denied', await read(t.athlete, bucket, paper), 403);
  log('paperwork', 'athlete creates own paperwork denied', await upload(t.athlete, bucket, `teams/qa-team/roster/qa-entry/documents/a-${s}.pdf`, 'a', pdf), 403);
  log('paperwork', 'AD B reads school A paperwork', await read(t.ad2, bucket, paper), 403);
  log('paperwork', 'AD B creates school A paperwork', await upload(t.ad2, bucket, `teams/qa-team/roster/qa-entry/documents/x-${s}.pdf`, 'a', pdf), 403);
  log('paperwork', 'text/plain at paperwork path denied', await upload(t.parent, bucket, `teams/qa-team/roster/qa-entry/documents/x-${s}.txt`, 'a', 'text/plain'), 403);
  log('paperwork', 'guardian deletes own paperwork', await remove(t.parent, bucket, paper), 204);

  // --- Unowned team: no schoolId, no members, must fail closed
  const un = `teams/qa-team-unowned/media/x-${s}.jpg`;
  log('unowned team', 'AD A reads unowned team media', await read(t.ad, bucket, un), 403);
  log('unowned team', 'AD A writes unowned team media', await upload(t.ad, bucket, un, 'a', jpg), 403);
  log('unowned team', 'coach writes unowned team media', await upload(t.coach, bucket, un, 'a', jpg), 403);
  log('unowned team', 'parent reads unowned team media', await read(t.parent, bucket, un), 403);

  // --- Unauthenticated
  log('anonymous', 'anonymous reads team media', await fetch(`${b(bucket)}/teams%2Fqa-team%2Fmedia%2Fphoto-1.jpg?alt=media`).then((r) => r.status), 403);

  const failed = rows.filter((r) => !r.ok);
  console.log(`\n${rows.length - failed.length}/${rows.length} staging Storage checks behaved as required.`);
  if (failed.length) for (const f of failed) console.log(`  FAILED [${f.area}] ${f.name} -> ${f.status} (expected ${f.expect})`);
  process.exit(failed.length ? 1 : 0);
}

main().catch((e) => { console.error('matrix error:', e.message); process.exit(1); });
