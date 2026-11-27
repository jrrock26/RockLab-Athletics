#!/usr/bin/env node
/**
 * Backfill `teams/{teamId}.managerUserIds` on staging.
 *
 *   node functions/scripts/backfill-managers.js            # preview only (default)
 *   node functions/scripts/backfill-managers.js --apply    # write
 *
 * STAGING ONLY. The guard refuses any other project unless --allow-production is passed
 * explicitly. Ownership is never inferred: a team with no schoolId, or one naming a
 * school that does not exist, is left EXACTLY as it is and reported as unresolvable.
 *
 * In production the same values are maintained by the syncTeamManagers triggers; this
 * script exists to seed the teams that predate them.
 */
const fs = require('fs');
const os = require('os');
const path = require('path');
const { computeManagers } = require('../teamManagers');

const STAGING = 'rocklab-athletics-staging';
const arg = (n, d) => { const i = process.argv.indexOf(n); return i !== -1 && process.argv[i + 1] ? process.argv[i + 1] : d; };
const PROJECT = arg('--project', STAGING);
const APPLY = process.argv.includes('--apply');
const ALLOW_PROD = process.argv.includes('--allow-production');

function token() {
  const c = JSON.parse(fs.readFileSync(path.join(os.homedir(), '.config/configstore/firebase-tools.json'), 'utf8'));
  return c.tokens.access_token;
}

const BASE = () => `https://firestore.googleapis.com/v1/projects/${PROJECT}/databases/(default)/documents`;

async function listCollection(t, p) {
  const out = [];
  let pageToken = '';
  do {
    const r = await fetch(`${BASE()}/${p}?pageSize=200${pageToken ? `&pageToken=${pageToken}` : ''}`, { headers: { Authorization: `Bearer ${t}` } });
    if (!r.ok) throw new Error(`list ${p}: ${r.status}`);
    const j = await r.json();
    for (const d of j.documents || []) out.push({ id: d.name.split('/').pop(), fields: d.fields || {} });
    pageToken = j.nextPageToken || '';
  } while (pageToken);
  return out;
}

const unstring = (f) => (f && f.stringValue !== undefined ? f.stringValue : '');

async function main() {
  if (PROJECT !== STAGING && !ALLOW_PROD) {
    console.log(`REFUSED: ${PROJECT} is not ${STAGING}. Pass --allow-production to override.`);
    process.exit(2);
  }
  const t = token();
  const teams = await listCollection(t, 'teams');
  const schools = new Map((await listCollection(t, 'schools')).map((s) => [s.id, s.fields]));

  console.log(`project: ${PROJECT}   mode: ${APPLY ? 'APPLY' : 'PREVIEW (no writes)'}`);
  console.log(`teams: ${teams.length}   schools: ${schools.size}\n`);

  const plan = [];
  const unresolved = [];
  for (const team of teams) {
    const members = await listCollection(t, `teams/${team.id}/members`);
    const schoolId = unstring(team.fields.schoolId);
    const school = schoolId ? (schools.get(schoolId) || null) : null;
    const { managerUserIds, warnings } = computeManagers({
      team: { schoolId, headCoachId: unstring(team.fields.headCoachId) },
      school: school ? { adUserId: unstring(school.adUserId) } : null,
      members: members.map((m) => ({ id: m.id, role: unstring(m.fields.role) })),
    });
    const current = (team.fields.managerUserIds?.arrayValue?.values || []).map((v) => v.stringValue);
    const same = current.length === managerUserIds.length && current.every((v, i) => v === managerUserIds[i]);
    const row = { teamId: team.id, schoolId, managerUserIds, current, change: same ? 'unchanged' : (current.length ? 'update' : 'add') };
    plan.push(row);
    if (warnings.length) unresolved.push({ teamId: team.id, warnings });
    console.log(`${row.change.padEnd(9)} ${team.id.padEnd(28)} school=${(schoolId || '(none)').padEnd(14)} managers=[${managerUserIds.join(', ')}]`);
    for (const w of warnings) console.log(`            ! ${w}`);
  }

  console.log(`\nsummary: ${plan.filter((r) => r.change === 'add').length} add, ${plan.filter((r) => r.change === 'update').length} update, ${plan.filter((r) => r.change === 'unchanged').length} unchanged, ${unresolved.length} with warnings`);
  if (unresolved.length) {
    console.log('\nUNRESOLVED (left exactly as they are — no inferred ownership):');
    for (const u of unresolved) console.log(`  ${u.teamId}: ${u.warnings.join('; ')}`);
  }

  if (!APPLY) {
    console.log('\npreview only. Re-run with --apply to write these lists.');
    return;
  }

  let written = 0;
  for (const row of plan) {
    if (row.change === 'unchanged') continue;
    if (!row.managerUserIds.length && !row.current.length) continue;
    const mask = 'updateMask.fieldPaths=managerUserIds';
    const r = await fetch(`${BASE()}/teams/${row.teamId}?${mask}`, {
      method: 'PATCH',
      headers: { Authorization: `Bearer ${t}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ fields: { managerUserIds: { arrayValue: { values: row.managerUserIds.map((v) => ({ stringValue: v })) } } } }),
    });
    if (!r.ok) throw new Error(`write ${row.teamId}: ${r.status}`);
    written++;
    console.log(`wrote ${row.teamId}`);
  }
  console.log(`\n${written} team(s) written.`);
}

main().catch((e) => { console.error('backfill error:', e.message); process.exit(1); });
