#!/usr/bin/env node
/**
 * Server-mediated paperwork uploads on staging.
 *
 *   node rules-test/scripts/staging-uploads.mjs
 *
 * The function performs the GCS write itself with `ifGenerationMatch: 0`, so identity is
 * established at upload time and possession of a URL is worth nothing. Every check below
 * is a live call to the deployed function.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const MANIFEST = path.join(ROOT, '.local-test-accounts.staging.json');
const PROJECT = 'rocklab-athletics-staging';
const CALL = `https://us-central1-${PROJECT}.cloudfunctions.net/uploadPaperwork`;
const OLD = `https://us-central1-${PROJECT}.cloudfunctions.net/createPaperworkUpload`;
const rows = [];
const note = (n, ok, d) => { rows.push({ n, ok }); console.log(`${ok ? 'PASS' : 'FAIL'}  ${n}  ${d}`); };

const PDF = Buffer.concat([Buffer.from('%PDF-1.4 '), Buffer.alloc(64, 0x20)]);

async function signIn(m, key) {
  const r = await fetch(`https://identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=${m.apiKey}`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: m.accounts[key].email, password: m.accounts[key].password, returnSecureToken: true }),
  });
  const b = await r.json();
  return { idToken: b.idToken, uid: b.localId };
}

async function call(tok, data, url = CALL) {
  const r = await fetch(url, {
    method: 'POST',
    headers: { ...(tok ? { Authorization: `Bearer ${tok}` } : {}), 'Content-Type': 'application/json' },
    body: JSON.stringify({ data }),
  });
  const body = await r.json().catch(() => ({}));
  return { status: r.status, result: body.result, error: body.error };
}

const read = (m, tok, name) => fetch(
  `https://firebasestorage.googleapis.com/v0/b/${m.bucket}/o/${encodeURIComponent(name)}?alt=media`,
  tok ? { headers: { Authorization: `Bearer ${tok}` } } : {},
).then((r) => r.status);

async function main() {
  if (!fs.existsSync(MANIFEST)) { console.log('NOT RUN: no staging manifest'); process.exit(2); }
  const m = JSON.parse(fs.readFileSync(MANIFEST, 'utf8'));
  if (m.project !== PROJECT) { console.log(`REFUSED: manifest is for ${m.project}`); process.exit(2); }
  const parent = await signIn(m, 'parent');
  const ad2 = await signIn(m, 'ad2');
  const coach = await signIn(m, 'coach');
  const base = {
    teamId: 'qa-team', entryId: 'qa-entry', contentType: 'application/pdf',
    category: 'physical', contentBase64: PDF.toString('base64'),
  };
  const stamp = Date.now();

  // 1. Authorized guardian.
  const ok = await call(parent.idToken, { ...base, fileName: `server-${stamp}.pdf` });
  note('authenticated guardian uploads a new document', ok.status === 200 && ok.result?.objectPath,
    `HTTP ${ok.status}, generation ${ok.result?.generation}`);
  const objectPath = ok.result?.objectPath;

  // 2. Duplicate request (same path, second time).
  const dup = await call(parent.idToken, { ...base, fileName: `server-${stamp}.pdf` });
  note('a duplicate request cannot overwrite', dup.error?.status === 'ALREADY_EXISTS', `${dup.error?.status}`);

  // 3. Retry of the original payload.
  const retry = await call(parent.idToken, { ...base, fileName: `server-${stamp}.pdf` });
  note('a retry cannot overwrite', retry.error?.status === 'ALREADY_EXISTS', `${retry.error?.status}`);

  // 4. Concurrency: two simultaneous writes to one new path.
  const racePath = `race-${stamp}.pdf`;
  const [a, b] = await Promise.all([
    call(parent.idToken, { ...base, fileName: racePath }),
    call(parent.idToken, { ...base, fileName: racePath }),
  ]);
  const won = [a, b].filter((r) => r.status === 200).length;
  const lost = [a, b].filter((r) => r.error?.status === 'ALREADY_EXISTS').length;
  note('concurrent uploads create exactly one object', won === 1 && lost === 1, `${won} created, ${lost} rejected`);

  // 5. Identity at upload time.
  const anon = await call(null, { ...base, fileName: `anon-${stamp}.pdf` });
  note('anonymous caller is refused', anon.status === 401, `${anon.error?.status || anon.status}`);
  const crossSchool = await call(ad2.idToken, { ...base, fileName: `x-${stamp}.pdf` });
  note('cross-school AD is refused', crossSchool.error?.status === 'PERMISSION_DENIED', `${crossSchool.error?.status}`);
  const otherFamily = await call(parent.idToken, { ...base, entryId: 'qa-entry-other', fileName: `x-${stamp}.pdf` });
  note('other-family guardian is refused', otherFamily.error?.status === 'PERMISSION_DENIED', `${otherFamily.error?.status}`);

  // 6. Content rules.
  const badType = await call(parent.idToken, { ...base, contentType: 'text/plain', fileName: `t-${stamp}.txt` });
  note('disallowed MIME type is rejected', badType.error?.status === 'INVALID_ARGUMENT', `${badType.error?.status}`);
  const spoofed = await call(parent.idToken, { ...base, fileName: `spoof-${stamp}.pdf`, contentBase64: Buffer.from('MZ\x90\x00 not a pdf').toString('base64') });
  note('content that is not the declared type is rejected', spoofed.error?.status === 'INVALID_ARGUMENT', `${spoofed.error?.status}`);
  const big = Buffer.concat([Buffer.from('%PDF-1.4 '), Buffer.alloc(11 * 1024 * 1024, 0x20)]);
  const oversized = await call(parent.idToken, { ...base, fileName: `big-${stamp}.pdf`, contentBase64: big.toString('base64') });
  note('oversized upload is rejected', oversized.error?.status === 'INVALID_ARGUMENT', `${oversized.error?.status}`);
  const traversal = await call(parent.idToken, { ...base, fileName: '../escape.pdf' });
  note('path traversal is rejected', traversal.error?.status === 'INVALID_ARGUMENT', `${traversal.error?.status}`);

  // 6b. Overwrite attempt with DIFFERENT bytes: must be refused and the original must survive.
  const other = Buffer.concat([Buffer.from('%PDF-1.7 '), Buffer.alloc(32, 0x41)]).toString('base64');
  const overwrite = await call(parent.idToken, { ...base, fileName: `server-${stamp}.pdf`, contentBase64: other });
  const survived = await fetch(
    `https://firebasestorage.googleapis.com/v0/b/${m.bucket}/o/${encodeURIComponent(objectPath)}?alt=media`,
    { headers: { Authorization: `Bearer ${parent.idToken}` } },
  ).then((r) => r.text());
  note('overwrite is refused and original bytes survive',
    overwrite.error?.status === 'ALREADY_EXISTS' && survived === PDF.toString(),
    `${overwrite.error?.status}, original intact: ${survived === PDF.toString()}`);

  // 7. Reads still behave.
  const gRead = await read(m, parent.idToken, objectPath);
  const mRead = await read(m, coach.idToken, objectPath);
  note('guardian reads what was uploaded', gRead === 200, `HTTP ${gRead}`);
  note('manager reads what was uploaded', mRead === 200, `HTTP ${mRead}`);
  note('cross-school read is refused', (await read(m, ad2.idToken, objectPath)) === 403, 'HTTP 403');
  note('anonymous read is refused', (await read(m, null, objectPath)) === 403, 'HTTP 403');

  // 8. The signed-URL route must be gone.
  const old = await call(parent.idToken, { ...base, fileName: `old-${stamp}.pdf` }, OLD);
  note('the old signed-URL route no longer exists', old.status === 404, `HTTP ${old.status}`);

  const failed = rows.filter((r) => !r.ok);
  console.log(`\n${rows.length - failed.length}/${rows.length} server-mediated upload cases behaved as required.`);
  process.exit(failed.length ? 1 : 0);
}

main().catch((e) => { console.error('upload harness error:', e.message); process.exit(1); });
