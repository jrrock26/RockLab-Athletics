#!/usr/bin/env node
/**
 * Controlled create-versus-update test for Storage rules.
 *
 *   node rules-test/scripts/storage-create-vs-update.mjs [--bucket <name>]
 *
 * WHY THIS IS A SEPARATE SCRIPT: the Storage emulator cannot tell the two cases
 * apart. It reports every upload as `create`, including the one that overwrites an
 * existing object, so a rule pair like
 *
 *     allow create: if (staffOfTeam() || guardianOfEntry());
 *     allow update: if staffOfTeam();
 *
 * cannot be exercised locally -- the guardian's overwrite is evaluated as a create
 * and passes. The distinction only exists against a real bucket. So this script must
 * run against a staging project or a canary deploy, never as the reason to deploy.
 *
 * The check it performs is exactly that pair, with the strongest available actor:
 * a guardian uploads a roster document (create: allowed), then uploads over the same
 * path again (update: must be denied). If the second upload succeeds, the rules do
 * not distinguish the cases and the candidate rules are wrong.
 *
 * Credentials come from .local-test-accounts.json; nothing is printed.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const MANIFEST = path.join(ROOT, '.local-test-accounts.json');

const arg = (name, fallback) => {
  const i = process.argv.indexOf(name);
  return i !== -1 && process.argv[i + 1] ? process.argv[i + 1] : fallback;
};
const BUCKET = arg('--bucket', process.env.FIREBASE_STORAGE_BUCKET || 'rocklab-athletics.firebasestorage.app');
const PROJECT = 'rocklab-athletics';

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
  if (!res.ok) throw new Error(`sign-in failed: ${body?.error?.message || res.status}`);
  return body.idToken;
}

/// Returns the HTTP status of one upload to the given object name.
async function upload(token, objectName, contents) {
  const res = await fetch(
    `https://firebasestorage.googleapis.com/v0/b/${BUCKET}/o?name=${encodeURIComponent(objectName)}&uploadType=media`,
    {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'text/plain' },
      body: contents,
    },
  );
  return res.status;
}

async function main() {
  if (!fs.existsSync(MANIFEST)) {
    console.log('NOT RUN: .local-test-accounts.json is missing. Nothing was tested.');
    process.exit(2);
  }
  const key = apiKey();
  if (!key) {
    console.log('NOT RUN: no Firebase web API key available. Nothing was tested.');
    process.exit(2);
  }

  const manifest = JSON.parse(fs.readFileSync(MANIFEST, 'utf8'));
  const parent = manifest.accounts.parent;
  const token = await signIn(key, parent.email, parent.password);
  console.log(`bucket: ${BUCKET}`);
  console.log('acting as: the QA guardian\n');

  const objectName = `teams/qa-team/roster/qa-entry/documents/probe-${Date.now()}.txt`;

  const created = await upload(token, objectName, 'first version');
  const createdOk = created === 200;
  console.log(`${createdOk ? 'PASS' : 'FAIL'}  guardian CREATE roster document      (HTTP ${created}, expected 200)`);

  const overwritten = await upload(token, objectName, 'second version');
  const updateDenied = overwritten === 403;
  console.log(`${updateDenied ? 'PASS' : 'FAIL'}  guardian UPDATE same object          (HTTP ${overwritten}, expected 403)`);

  if (created === 200 && overwritten === 200) {
    console.log('\nRESULT: the bucket treats both writes the same way — the candidate rules do not');
    console.log('        distinguish create from update on this path. Do not deploy storage.rules.');
    process.exit(1);
  }
  if (!createdOk) {
    console.log('\nRESULT: the create itself was denied; check the fixture path and membership first.');
    process.exit(1);
  }
  console.log('\nRESULT: create and update are distinguished as the candidate rules intend.');
  process.exit(updateDenied ? 0 : 1);
}

main().catch((err) => {
  console.error('probe error:', err.message);
  process.exit(1);
});
