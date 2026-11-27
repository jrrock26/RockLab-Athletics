#!/usr/bin/env node
/**
 * Production cross-school probe. Runs the five checks that must be true of the
 * DEPLOYED rules, as real signed-in accounts, against the real project.
 *
 *   node rules-test/scripts/prod-probe.mjs
 *
 * Needs .local-test-accounts.json from functions/scripts/create-test-accounts.js.
 * Credentials are read from that file and never printed. The Firebase web API key
 * is read from web/.env (NEXT_PUBLIC_FIREBASE_API_KEY) or FIREBASE_API_KEY.
 *
 * Each check states what the rules are supposed to do; a mismatch exits non-zero.
 * This deliberately reports NOT RUN rather than passing when accounts are missing.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const MANIFEST = path.join(ROOT, '.local-test-accounts.json');
/// The probe names its target explicitly. Production requires a second flag, so a
/// copy-pasted staging command can never write to real families by omission.
const PROJECT = (() => {
  const i = process.argv.indexOf('--project');
  return i !== -1 && process.argv[i + 1] ? process.argv[i + 1] : 'rocklab-athletics-staging';
})();
const ALLOW_PRODUCTION = process.argv.includes('--allow-production');
if (PROJECT === 'rocklab-athletics' && !ALLOW_PRODUCTION) {
  console.log('REFUSING: --project rocklab-athletics needs --allow-production as well.');
  console.log('          Nothing was tested.');
  process.exit(2);
}
const BASE = () => `https://firestore.googleapis.com/v1/projects/${PROJECT}/databases/(default)/documents`;

function apiKey() {
  if (process.env.FIREBASE_API_KEY) return process.env.FIREBASE_API_KEY;
  for (const file of ['.env.local', '.env.production', '.env']) {
    const p = path.join(ROOT, 'web', file);
    if (!fs.existsSync(p)) continue;
    const line = fs.readFileSync(p, 'utf8').split('\n').find((l) => l.startsWith('NEXT_PUBLIC_FIREBASE_API_KEY='));
    if (line) return line.split('=')[1].trim().replace(/^["']|["']$/g, '');
  }
  return null;
}

async function signIn(key, email, password) {
  const res = await fetch(`https://identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=${key}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password, returnSecureToken: true }),
  });
  const body = await res.json();
  if (!res.ok) throw new Error(`sign-in failed for ${email}: ${body?.error?.message || res.status}`);
  return body.idToken;
}

/// Firestore REST calls return the HTTP status; the rules decision is 200 vs 403.
async function get(token, docPath) {
  const res = await fetch(`${BASE()}/${docPath}`, { headers: { Authorization: `Bearer ${token}` } });
  return res.status;
}

async function patch(token, docPath, fields) {
  const mask = Object.keys(fields).map((f) => `updateMask.fieldPaths=${f}`).join('&');
  const res = await fetch(`${BASE()}/${docPath}?${mask}`, {
    method: 'PATCH',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ fields }),
  });
  return res.status;
}

async function create(token, collectionPath, docId, fields) {
  const res = await fetch(`${BASE()}/${collectionPath}?documentId=${docId}`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ fields }),
  });
  return res.status;
}

const str = (v) => ({ stringValue: v });
const bool = (v) => ({ booleanValue: v });

async function main() {
  if (!fs.existsSync(MANIFEST)) {
    console.log('NOT RUN: .local-test-accounts.json is missing.');
    console.log('         Create the QA fixtures first (functions/scripts/create-test-accounts.js),');
    console.log('         or point this probe at a staging project. Nothing was tested.');
    process.exit(2);
  }

  const key = apiKey();
  if (!key) {
    console.log('NOT RUN: no Firebase web API key found (web/.env NEXT_PUBLIC_FIREBASE_API_KEY or FIREBASE_API_KEY).');
    process.exit(2);
  }

  const manifest = JSON.parse(fs.readFileSync(MANIFEST, 'utf8'));
  const accounts = manifest.accounts;
  const tokens = {};
  for (const [role, account] of Object.entries(accounts)) {
    if (!account.password) {
      console.log(`NOT RUN: ${role} has no password in the manifest (created elsewhere?).`);
      process.exit(2);
    }
    tokens[role] = await signIn(key, account.email, account.password);
  }
  console.log(`project: ${PROJECT}`);
  console.log('signed in as: ' + Object.keys(tokens).join(', ') + '\n');

  const parentUid = accounts.parent.uid;
  const checks = [
    {
      name: 'AD of school A manages their own team',
      run: () => patch(tokens.ad, 'teams/qa-team', { name: str('QA Varsity Basketball') }),
      expect: 200,
    },
    {
      name: 'Coach creates an event on their own team',
      run: () => create(tokens.coach, 'events', `qa-probe-${Date.now()}`, { teamId: str('qa-team'), type: str('practice'), title: str('QA probe practice') }),
      expect: 200,
    },
    {
      name: 'Parent submits an RSVP for their own athlete on that team',
      run: () => patch(tokens.parent, `events/qa-event/rsvps/${parentUid}__qa-entry`, {
        respondentUserId: str(parentUid), athleteEntryId: str('qa-entry'), answer: str('yes'),
      }),
      expect: 200,
    },
    {
      name: 'AD of school B CANNOT read school A roster',
      run: () => get(tokens.ad2, 'teams/qa-team/roster/qa-entry'),
      expect: 403,
    },
    {
      name: 'AD of school B CANNOT rewrite school A team',
      run: () => patch(tokens.ad2, 'teams/qa-team', { name: str('taken by B') }),
      expect: 403,
    },
    {
      name: 'AD of school B CANNOT read school A audit log',
      run: () => get(tokens.ad2, 'auditLogs/probe'),
      expect: 403,
    },
  ];

  let failures = 0;
  for (const check of checks) {
    const status = await check.run();
    const ok = status === check.expect;
    if (!ok) failures += 1;
    console.log(`${ok ? 'PASS' : 'FAIL'}  ${check.name}  (HTTP ${status}, expected ${check.expect})`);
  }

  console.log(`\n${checks.length - failures}/${checks.length} checks behaved as the rules require.`);
  process.exit(failures === 0 ? 0 : 1);
}

main().catch((err) => {
  console.error('probe error:', err.message);
  process.exit(1);
});
