#!/usr/bin/env node
/**
 * Backfill schema drift on teams: missing schoolId, sportId, headCoachId.
 *
 * Uses the Firestore REST API with the firebase-tools access token (no service
 * account file required).
 *
 * Interactive mode: for each drift team, prompts the AD to assign a schoolId
 * (from the school list), a sportId (e.g. basketball), and a headCoachId (coach
 * uid, or press enter to skip).
 *
 * Idempotent: teams that already have all three fields are skipped.
 *
 * Usage:
 *   node scripts/backfill-team-schema.js --dry-run
 *   node scripts/backfill-team-schema.js --interactive
 */
const fs = require('fs');
const readline = require('readline');

// Read the firebase-tools access token from the local config store.
function accessToken() {
  const cfgPath = require('os').homedir() + '/.config/configstore/firebase-tools.json';
  const cfg = JSON.parse(fs.readFileSync(cfgPath, 'utf8'));
  return cfg.tokens.access_token;
}

const PROJECT = 'rocklab-athletics';
const BASE = `https://firestore.googleapis.com/v1/projects/${PROJECT}/databases/(default)/documents`;

// Single-request wrapper: GET with Bearer auth
async function fetchDoc(path) {
  // Callers pass a bare collection name; BASE already ends in /documents. Joining
  // without the slash produced `documentsteams`, which Firestore answers with a 404.
  const clean = String(path).replace(/^\/+/, '');
  const res = await fetch(`${BASE}/${clean}?pageSize=500`, {
    headers: { Authorization: `Bearer ${accessToken()}` },
  });
  if (!res.ok) throw new Error(`${res.status} ${await res.text()}`);
  return res.json();
}

// PATCH with field mask
async function patchDoc(path, fields) {
  const fieldUpdates = {};
  for (const [k, v] of Object.entries(fields)) {
    fieldUpdates[k] = { stringValue: v };
  }
  const mask = Object.keys(fields).join(',');
  const res = await fetch(`${BASE}/${path}?updateMask.fieldPaths=${mask}`, {
    method: 'PATCH',
    headers: {
      Authorization: `Bearer ${accessToken()}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ fields }),
  });
  if (!res.ok) throw new Error(`${res.status} ${await res.text()}`);
  return res.json();
}

// Pretty print helpers
function fmt(doc) {
  const f = doc.fields || {};
  return `${doc.name.split('/').pop()}: { ${Object.keys(f).join(', ')} }`;
}

// ---------- Main ----------

async function main() {
  const DRY_RUN = process.argv.includes('--dry-run');
  const INTERACTIVE = process.argv.includes('--interactive');

  // 1. Fetch all teams
  const teamsData = await fetchDoc('teams');
  const teams = teamsData.documents || [];

  // 2. Fetch all schools
  const schoolsData = await fetchDoc('schools');
  const schools = (schoolsData.documents || []).map(d => ({
    id: d.name.split('/').pop(),
    name: d.fields?.name?.stringValue || '?',
    district: d.fields?.district?.stringValue || '—',
    adUserId: d.fields?.adUserId?.stringValue || '—',
  }));

  // 3. Find drift: teams missing schoolId / sportId / headCoachId
  const drift = [];
  for (const t of teams) {
    const f = t.fields || {};
    const missing = [];
    if (!f.schoolId?.stringValue) missing.push('schoolId');
    if (!f.sportId?.stringValue) missing.push('sportId');
    if (!f.headCoachId?.stringValue) missing.push('headCoachId');
    if (missing.length > 0) {
      drift.push({ id: t.name.split('/').pop(), data: f, missing });
    }
  }

  if (drift.length === 0) {
    console.log('[team-schema] no drift found — every team has schoolId, sportId, headCoachId');
    return;
  }

  console.log(`[team-schema] ${drift.length} team(s) missing required fields:`);
  for (const t of drift) {
    console.log(`  ${t.id}: missing [${t.missing.join(', ')}]`);
  }

  if (DRY_RUN) {
    console.log('\n[team-schema] dry-run — no writes made. Re-run without --dry-run to apply.');
    return;
  }

  if (INTERACTIVE) {
    const updates = {};
    for (const t of drift) {
      console.log(`\n--- Team ${t.id} ---`);
      console.log(`  Existing: { ${t.missing.join(', ').split(',').map(m => `${m}: missing`).join(' ')} }`);
      console.log(`  Available schools:`);
      for (const s of schools) {
        console.log(`    ${s.id}: ${s.name} (district: ${s.district}, ad: ${s.adUserId})`);
      }

      const schoolId = await ask(`  schoolId (press enter to skip): `);
      const sportId = await ask('  sportId (e.g. basketball): ');
      const headCoachId = await ask('  headCoachId (coach uid, or enter to skip): ');

      if (schoolId) updates[t.id] = { ...updates[t.id], schoolId };
      if (sportId) updates[t.id] = { ...updates[t.id], sportId };
      if (headCoachId) updates[t.id] = { ...updates[t.id], headCoachId };
    }

    // Apply each update
    for (const t of drift) {
      const u = updates[t.id] || {};
      const fields = {};
      if (u.schoolId) fields.schoolId = { stringValue: u.schoolId };
      if (u.sportId) fields.sportId = { stringValue: u.sportId };
      if (u.headCoachId) fields.headCoachId = { stringValue: u.headCoachId };

      if (Object.keys(fields).length > 0) {
        await patchDoc(t.id, fields);
        console.log(`  ✅ ${t.id}: ${JSON.stringify(fields)}`);
      } else {
        console.log(`  ⏭️ ${t.id}: skipped`);
      }
    }

    console.log('\n[team-schema] backfill complete.');
  } else {
    console.log('\n[team-schema] Use --interactive to assign schools/sport/coach to drift teams.');
  }
}

// NOTE: a local helper named `fetch` used to live here and shadowed the global one,
// so `fetchDoc` recursed into itself until the stack blew. Upload and patch both use
// the global `fetch` directly now; keep it that way and do not re-introduce the name.

// ---------- Run ----------
main().catch((err) => { console.error('[team-schema] failed:', err && err.message ? err.message : err); process.exit(1); });