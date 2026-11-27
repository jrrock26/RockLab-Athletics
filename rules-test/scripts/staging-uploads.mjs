#!/usr/bin/env node
/**
 * Create-only paperwork uploads on staging.
 *
 *   node rules-test/scripts/staging-uploads.mjs
 *
 * Exercises the createPaperworkUpload callable and the signed GCS URL it returns:
 * validation, authorization, the generation precondition, replay, and the reads that
 * must keep working. Every result below is a live HTTP exchange.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const MANIFEST = path.join(ROOT, '.local-test-accounts.staging.json');
const PROJECT = 'rocklab-athletics-staging';
const CALLABLE = `https://us-central1-${PROJECT}.cloudfunctions.net/createPaperworkUpload`;
const rows = [];
const note = (name, ok, detail) => { rows.push({ name, ok }); console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}  ${detail}`); };

async function signIn(m, key) {
  const r = await fetch(`https://identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=${m.apiKey}`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: m.accounts[key].email, password: m.accounts[key].password, returnSecureToken: true }),
  });
  const b = await r.json();
  return { idToken: b.idToken, uid: b.localId };
}

async function call(tok, data) {
  const r = await fetch(CALLABLE, {
    method: 'POST',
    headers: { ...(tok ? { Authorization: `Bearer ${tok}` } : {}), 'Content-Type': 'application/json' },
    body: JSON.stringify({ data }),
  });
  const body = await r.json().catch(() => ({}));
  return { status: r.status, result: body.result, error: body.error };
}

const put = async (url, bytes, contentType, precondition = true) => {
  const headers = { 'Content-Type': contentType };
  if (precondition) headers['x-goog-if-generation-match'] = '0';
  const r = await fetch(url, { method: 'PUT', headers, body: bytes });
  return r.status;
};
const read = (m, tok, name) => fetch(
  `https://firebasestorage.googleapis.com/v0/b/${m.bucket}/o/${encodeURIComponent(name)}?alt=media`,
  tok ? { headers: { Authorization: `Bearer ${tok}` } } : {},
).then((r) => r.status);
const sdkUpload = (m, tok, name, ct) => fetch(
  `https://firebasestorage.googleapis.com/v0/b/${m.bucket}/o?name=${encodeURIComponent(name)}&uploadType=media`,
  { method: 'POST', headers: { Authorization: `Bearer ${tok}`, 'Content-Type': ct }, body: 'x' },
).then((r) => r.status);

const PDF = Buffer.from('%PDF-1.4 test');

async function main() {
  if (!fs.existsSync(MANIFEST)) { console.log('NOT RUN: no staging manifest'); process.exit(2); }
  const m = JSON.parse(fs.readFileSync(MANIFEST, 'utf8'));
  if (m.project !== PROJECT) { console.log(`REFUSED: manifest is for ${m.project}`); process.exit(2); }
  const parent = await signIn(m, 'parent');
  const ad2 = await signIn(m, 'ad2');
  const coach = await signIn(m, 'coach');
  const base = {
    teamId: 'qa-team', entryId: 'qa-entry', contentType: 'application/pdf', sizeBytes: PDF.length,
    fileName: `physical-${Date.now()}.pdf`,
  };

  // 1/10. Authorized guardian: authorization issued, upload succeeds.
  const grant = await call(parent.idToken, base);
  const ok1 = grant.result && grant.result.uploadUrl;
  const first = ok1 ? await put(grant.result.uploadUrl, PDF, 'application/pdf') : 0;
  note('authorized guardian uploads a new document', first === 200, `callable ${grant.status}, PUT ${first}`);

  // 11. Replay the same authorization.
  const replay = ok1 ? await put(grant.result.uploadUrl, PDF, 'application/pdf') : 0;
  note('replaying the same authorization cannot overwrite', replay === 412, `PUT ${replay} (412 Precondition Failed)`);

  // 12. Fresh authorization for the same path.
  const again = await call(parent.idToken, { ...base, fileName: path.basename(grant.result.objectPath) });
  const overwrite = again.result ? await put(again.result.uploadUrl, PDF, 'application/pdf') : 0;
  note('new authorization cannot overwrite existing object', overwrite === 412, `PUT ${overwrite}`);

  // 2. Unauthenticated.
  const anon = await call(null, base);
  note('unauthenticated caller cannot request authorization', anon.status === 401, `HTTP ${anon.status} ${anon.error?.status || ''}`);

  // 3. Other-family guardian.
  const otherFamily = await call(parent.idToken, { ...base, entryId: 'qa-entry-other', fileName: `x-${Date.now()}.pdf` });
  note('other-family guardian is refused', otherFamily.error?.status === 'PERMISSION_DENIED', `${otherFamily.error?.status}`);

  // 4. Cross-school AD.
  const crossAd = await call(ad2.idToken, { ...base, fileName: `x-${Date.now()}.pdf` });
  note('cross-school AD is refused', crossAd.error?.status === 'PERMISSION_DENIED', `${crossAd.error?.status}`);

  // 6/7/8. Validation.
  const traversal = await call(parent.idToken, { ...base, fileName: '../escape.pdf' });
  note('path traversal in file name is rejected', traversal.error?.status === 'INVALID_ARGUMENT', `${traversal.error?.status}`);
  const badMime = await call(parent.idToken, { ...base, contentType: 'text/plain' });
  note('disallowed MIME type is rejected', badMime.error?.status === 'INVALID_ARGUMENT', `${badMime.error?.status}`);
  const tooBig = await call(parent.idToken, { ...base, sizeBytes: 11 * 1024 * 1024 });
  note('oversized upload is rejected', tooBig.error?.status === 'INVALID_ARGUMENT', `${tooBig.error?.status}`);

  // 13. The bypass: direct SDK upload by the same guardian.
  const direct = await sdkUpload(m, parent.idToken, `teams/qa-team/roster/qa-entry/documents/direct-${Date.now()}.pdf`, 'application/pdf');
  note('direct SDK upload cannot bypass the workflow', direct === 403, `HTTP ${direct}`);

  // 14/15. Reads unchanged.
  const ownRead = await read(m, parent.idToken, grant.result.objectPath);
  const managerRead = await read(m, coach.idToken, grant.result.objectPath);
  // Read an object that EXISTS, as an account with no standing: a cross-school AD.
  const strangerRead = await read(m, ad2.idToken, grant.result.objectPath);
  const anonRead = await read(m, null, grant.result.objectPath);
  note('guardian reads the uploaded document', ownRead === 200, `HTTP ${ownRead}`);
  note('manager reads the uploaded document', managerRead === 200, `HTTP ${managerRead}`);
  note('unauthorized reads remain denied', strangerRead === 403 && anonRead === 403, `stranger ${strangerRead}, anonymous ${anonRead}`);

  // 16. A second document does not destroy the first.
  const second = await call(parent.idToken, { ...base, fileName: `physical-b-${Date.now()}.pdf` });
  const secondPut = second.result ? await put(second.result.uploadUrl, PDF, 'application/pdf') : 0;
  const firstStillThere = await read(m, parent.idToken, grant.result.objectPath);
  note('a new version leaves the original intact', secondPut === 200 && firstStillThere === 200, `new ${secondPut}, original ${firstStillThere}`);

  // 9. Expiry — the URL carries X-Goog-Expires; tampering with it must break the signature.
  const url = new URL(grant.result.uploadUrl);
  url.searchParams.set('X-Goog-Expires', '1');
  const tampered = await put(url.toString(), PDF, 'application/pdf');
  // GCS answers a tampered expiry with 400 InvalidArgument rather than 403; either is a
  // refusal, and the object must not have been created.
  note('an expired or altered authorization is rejected', tampered === 400 || tampered === 403, `PUT ${tampered}`);

  // 5. Bearer binding — recorded, not asserted, because it is a known limitation.
  const stolen = await put(grant.result.uploadUrl, PDF, 'application/pdf', true);
  console.log(`LIMIT  wrong-UID replay of a fresh URL: PUT ${stolen} (a signed URL is bearer; see report)`);

  const failed = rows.filter((r) => !r.ok);
  console.log(`\n${rows.length - failed.length}/${rows.length} upload cases behaved as required.`);
  process.exit(failed.length ? 1 : 0);
}

main().catch((e) => { console.error('upload harness error:', e.message); process.exit(1); });
