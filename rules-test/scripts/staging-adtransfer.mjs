#!/usr/bin/env node
/**
 * AD handoff on staging: inviteAdSuccessor -> acceptAdTransfer, and back again.
 *
 *   node rules-test/scripts/staging-adtransfer.mjs
 *
 * The handoff is the one place where being an AD is taken away from someone. It runs in a
 * single Firestore transaction that also rewrites the manager index for every team the
 * school owns, so the outgoing AD must lose the bucket at commit — not when a trigger fires.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const MANIFEST = path.join(ROOT, '.local-test-accounts.staging.json');
const P = 'rocklab-athletics-staging';
const FN = `https://us-central1-${P}.cloudfunctions.net`;
const FS = `https://firestore.googleapis.com/v1/projects/${P}/databases/(default)/documents`;
const SCHOOL = 'qa-school';
const TEAM = 'qa-team';
const rows = [];
const note = (n, ok, d) => { rows.push({ n, ok }); console.log(`${ok ? 'PASS' : 'FAIL'}  ${n}  ${d}`); };

async function signIn(m, key) {
  const a = m.accounts[key];
  const b = await fetch(`https://identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=${m.apiKey}`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: a.email, password: a.password, returnSecureToken: true }),
  }).then((r) => r.json());
  return { idToken: b.idToken, uid: b.localId };
}

async function signUp(apiKey, email, password) {
  const b = await fetch(`https://identitytoolkit.googleapis.com/v1/accounts:signUp?key=${apiKey}`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password, returnSecureToken: true }),
  }).then((r) => r.json());
  return { idToken: b.idToken, uid: b.localId, email };
}

let frontDoor401 = 0;
const call = async (name, tok, data) => {
  for (let attempt = 0; attempt < 4; attempt += 1) {
    const r = await fetch(`${FN}/${name}`, {
      method: 'POST',
      headers: { ...(tok ? { Authorization: `Bearer ${tok}` } : {}), 'Content-Type': 'application/json' },
      body: JSON.stringify({ data }),
    });
    const text = await r.text();
    let b = {};
    try { b = JSON.parse(text); } catch (e) { /* HTML body = invocation layer, not the callable */ }
    // A 401 with no callable error body means the request never reached the handler. That is
    // the front door during revision rollout, and it is retried rather than counted as a
    // policy decision — and reported, never hidden.
    if (r.status === 401 && tok && !b.error) {
      frontDoor401 += 1;
      await new Promise((res) => setTimeout(res, 2500));
      continue;
    }
    return { status: r.status, result: b.result, error: b.error };
  }
  return { status: 401, result: undefined, error: undefined };
};

const storage = (m, tok, name) => fetch(
  `https://firebasestorage.googleapis.com/v0/b/${m.bucket}/o/${encodeURIComponent(name)}?alt=media`,
  tok ? { headers: { Authorization: `Bearer ${tok}` } } : {},
).then((r) => r.status);

const get = (tok, p) => fetch(`${FS}/${p}`, { headers: { Authorization: `Bearer ${tok}` } }).then((r) => r.json());
const str = (d, k) => d?.fields?.[k]?.stringValue || '';
const arr = (d, k) => (d?.fields?.[k]?.arrayValue?.values || []).map((v) => v.stringValue);

async function main() {
  if (!fs.existsSync(MANIFEST)) { console.log('NOT RUN: no staging manifest'); process.exit(2); }
  const m = JSON.parse(fs.readFileSync(MANIFEST, 'utf8'));
  if (m.project !== P) { console.log(`REFUSED: manifest is for ${m.project}`); process.exit(2); }

  const ad = await signIn(m, 'ad');
  const coach = await signIn(m, 'coach');
  const successor = await signUp(m.apiKey, `qa-successor-${Date.now()}@rocklab.test`, `Qa-${Math.random().toString(36).slice(2)}!9x`);
  const media = `teams/${TEAM}/media/probe-${Date.now()}.mov`;

  const before = await get(ad.idToken, `schools/${SCHOOL}`);
  note('qa-school is owned by the incumbent AD', str(before, 'adUserId') === ad.uid, `owner=${str(before, 'adUserId').slice(0, 6)}`);
  const adBefore = await storage(m, ad.idToken, media);
  note('incumbent AD reads team media before the handoff', adBefore === 404, `HTTP ${adBefore}`);

  // Someone who is not the AD cannot hand the school over.
  const outsider = await call('inviteAdSuccessor', coach.idToken, { schoolId: SCHOOL, email: successor.email });
  note('a coach cannot invite an AD successor', outsider.error?.status === 'PERMISSION_DENIED', `${outsider.error?.status}`);

  const invite = await call('inviteAdSuccessor', ad.idToken, { schoolId: SCHOOL, email: successor.email });
  note('incumbent AD invites a successor', invite.status === 200 && invite.result?.invitationId, `HTTP ${invite.status}`);

  const wrongAccount = await call('acceptAdTransfer', coach.idToken, { invitationId: invite.result?.invitationId });
  note('the invitation cannot be accepted by a different account', wrongAccount.error?.status === 'PERMISSION_DENIED', `${wrongAccount.error?.status}`);

  const accept = await call('acceptAdTransfer', successor.idToken, { invitationId: invite.result?.invitationId });
  note('the invited successor accepts', accept.status === 200, `HTTP ${accept.status}`);

  const after = await get(successor.idToken, `schools/${SCHOOL}`);
  note('ownership moved to the successor', str(after, 'adUserId') === successor.uid, `owner=${str(after, 'adUserId').slice(0, 6)}`);

  const team = await get(successor.idToken, `teams/${TEAM}`);
  const managers = arr(team, 'managerUserIds');
  note('the manager index names the successor and no longer the old AD',
    managers.includes(successor.uid) && !managers.includes(ad.uid), JSON.stringify(managers));

  const successorRead = await storage(m, successor.idToken, media);
  note('the successor AD has access immediately', successorRead === 404, `HTTP ${successorRead}`);
  const oldRead = await storage(m, ad.idToken, media);
  note('the outgoing AD is denied immediately', oldRead === 403, `previous ${adBefore}, now ${oldRead}`);
  const coachRead = await storage(m, coach.idToken, media);
  note('the team coach is unaffected', coachRead === 404, `HTTP ${coachRead}`);

  const replay = await call('acceptAdTransfer', successor.idToken, { invitationId: invite.result?.invitationId });
  note('a replayed acceptance is refused', replay.error?.status === 'FAILED_PRECONDITION', `${replay.error?.status}`);

  // Hand it back, so the fixture ends where it started.
  const back = await call('inviteAdSuccessor', successor.idToken, { schoolId: SCHOOL, email: m.accounts.ad.email });
  const backAccept = await call('acceptAdTransfer', ad.idToken, { invitationId: back.result?.invitationId });
  const restored = await get(ad.idToken, `schools/${SCHOOL}`);
  const restoredTeam = await get(ad.idToken, `teams/${TEAM}`);
  const adBack = await storage(m, ad.idToken, media);
  note('the school can be handed back and the original AD regains access',
    backAccept.status === 200 && str(restored, 'adUserId') === ad.uid
      && arr(restoredTeam, 'managerUserIds').includes(ad.uid) && adBack === 404,
    `owner=${str(restored, 'adUserId').slice(0, 6)}, storage ${adBack}`);

  if (frontDoor401) console.log(`note: ${frontDoor401} request(s) were 401 with no callable body (front door during rollout), retried`);
  const failed = rows.filter((r) => !r.ok);
  console.log(`\n${rows.length - failed.length}/${rows.length} AD handoff cases behaved as required.`);
  process.exit(failed.length ? 1 : 0);
}

main().catch((e) => { console.error('ad transfer harness error:', e.message); process.exit(1); });
