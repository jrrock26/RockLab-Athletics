#!/usr/bin/env node
/**
 * READ-ONLY production data audit for the authorization change.
 *
 *   node rules-test/scripts/prod-data-audit.mjs
 *
 * Reads with the operator's own credentials (Firestore REST, GET only). It never writes,
 * never infers ownership, and never follows a document reference to "fix" anything.
 * Output is counts and ids only — no emails, no names.
 */
import fs from 'node:fs';

const PROJECT = process.env.AUDIT_PROJECT || 'rocklab-athletics';
const TOK = JSON.parse(fs.readFileSync(process.env.HOME + '/.config/configstore/firebase-tools.json', 'utf8')).tokens.access_token;
const BASE = `https://firestore.googleapis.com/v1/projects/${PROJECT}/databases/(default)/documents`;
const H = { Authorization: 'Bearer ' + TOK };

async function listAll(path, pageSize = 300) {
  const out = []; let token = '';
  for (let i = 0; i < 40; i += 1) {
    const url = `${BASE}/${path}?pageSize=${pageSize}${token ? `&pageToken=${encodeURIComponent(token)}` : ''}`;
    const r = await fetch(url, { headers: H });
    if (!r.ok) return { error: `${r.status} ${(await r.text()).slice(0, 120)}`, docs: out };
    const b = await r.json();
    out.push(...(b.documents || []));
    token = b.nextPageToken || '';
    if (!token) break;
  }
  return { docs: out };
}
const s = (d, k) => (d.fields?.[k]?.stringValue ?? null);
const a = (d, k) => (d.fields?.[k]?.arrayValue?.values || []).map((v) => v.stringValue);

const run = async () => {
  const schools = await listAll('schools');
  const teams = await listAll('teams');
  if (schools.error || teams.error) {
    console.log('AUDIT BLOCKED:', schools.error || teams.error);
    process.exit(2);
  }
  const schoolById = new Map(schools.docs.map((d) => [d.name.split('/').pop(), d]));
  console.log(`project ${PROJECT}: ${schools.docs.length} schools, ${teams.docs.length} teams`);

  const badSchools = schools.docs.filter((d) => !s(d, 'adUserId'));
  console.log(`schools without adUserId: ${badSchools.length}${badSchools.length ? ' -> ' + badSchools.map((d) => d.name.split('/').pop()).join(',') : ''}`);

  const noSchool = teams.docs.filter((d) => !s(d, 'schoolId'));
  const missingSchoolDoc = teams.docs.filter((d) => s(d, 'schoolId') && !schoolById.has(s(d, 'schoolId')));
  const schoolWithoutAd = teams.docs.filter((d) => {
    const sc = schoolById.get(s(d, 'schoolId'));
    return sc && !s(sc, 'adUserId');
  });
  const emptyIndex = teams.docs.filter((d) => {
    const sc = schoolById.get(s(d, 'schoolId'));
    return sc && s(sc, 'adUserId') && a(d, 'managerUserIds').length === 0;
  });
  const hasIndex = teams.docs.filter((d) => a(d, 'managerUserIds').length > 0);

  console.log(`teams without schoolId: ${noSchool.length}${noSchool.length ? ' -> ' + noSchool.map((d) => d.name.split('/').pop()).join(',') : ''}`);
  console.log(`teams naming a school that does not exist: ${missingSchoolDoc.length}${missingSchoolDoc.length ? ' -> ' + missingSchoolDoc.map((d) => d.name.split('/').pop()).join(',') : ''}`);
  console.log(`teams whose school has no AD: ${schoolWithoutAd.length}`);
  console.log(`teams that WOULD have an AD but have an empty index: ${emptyIndex.length}`);
  console.log(`teams that already carry managerUserIds: ${hasIndex.length}`);

  const named = teams.docs.find((d) => d.name.split('/').pop() === 'test-team-basketball');
  if (named) {
    console.log(`test-team-basketball: schoolId=${s(named, 'schoolId') || '(none)'} headCoachId=${s(named, 'headCoachId') ? 'set' : '(none)'} managers=${a(named, 'managerUserIds').length} adoptionStatus=${s(named, 'adoptionStatus') || '(none)'}`);
  } else {
    console.log('test-team-basketball: not present in this project');
  }

  // Would the new rules lock anyone out? A team with a schoolId whose school has an AD is
  // repairable by the backfill; a team with no school at all is NOT, and stays fail-closed.
  const lockoutRisk = noSchool.length;
  console.log(`\nlockout risk under the new rules: ${lockoutRisk} team(s) with no owning school (fail-closed until adopted)`);
  console.log(`backfill needed for: ${emptyIndex.length} team(s) (index empty but derivable)`);
};

run().catch((e) => { console.error('audit error:', e.message); process.exit(1); });
