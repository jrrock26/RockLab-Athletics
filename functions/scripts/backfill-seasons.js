#!/usr/bin/env node
/**
 * Phase 2, part 1: backfill seasonId onto teams and roster entries.
 *
 * Background: seasons exist as objects now (schools/{id}/seasons/{year}-{term}), but a
 * team and a roster entry still carry only a free-text `season` label. Until they carry a
 * seasonId, closeSeason finds nothing to archive and every season opens empty.
 *
 * This is additive. It writes `seasonId` and `state` and deletes nothing, so the rollback
 * is simply "stop running it". It is also idempotent: an entry that already has a
 * seasonId is skipped, never rewritten, so a second run cannot move a 2026 athlete into
 * 2025.
 *
 * The season is DERIVED, not guessed arbitrarily: from the team's own season field plus
 * the year on the team. A team with no season label falls back to the current term, and
 * every derived season is reported so you can check the inference before applying.
 *
 * Usage (from the `functions` directory):
 *   GOOGLE_APPLICATION_CREDENTIALS=./serviceAccount.json node scripts/backfill-seasons.js --dry-run
 *   GOOGLE_APPLICATION_CREDENTIALS=./serviceAccount.json node scripts/backfill-seasons.js
 */
const admin = require('firebase-admin');

const DRY_RUN = process.argv.includes('--dry-run');
const BATCH_LIMIT = 400;

const TERMS = ['fall', 'winter', 'spring'];

/// "Fall" -> "fall", "Winter 2026" -> "winter", "" -> derived from the month.
function termOf(label) {
  const s = String(label || '').toLowerCase();
  if (s.includes('fall')) return 'fall';
  if (s.includes('winter')) return 'winter';
  if (s.includes('spring')) return 'spring';
  const month = new Date().getMonth(); // 0-based
  if (month >= 7) return 'fall';
  if (month <= 1) return 'winter';
  return 'spring';
}

/// A season label may already carry a year ("Fall 2025"); trust it over the clock.
function yearOf(label, fallback) {
  const m = String(label || '').match(/(19|20)\d{2}/);
  return m ? Number(m[0]) : fallback;
}

async function main() {
  if (!admin.apps.length) {
    admin.initializeApp({ projectId: 'rocklab-athletics' });
  }
  const db = admin.firestore();
  const nowYear = new Date().getFullYear();

  const schools = await db.collection('schools').get();
  const report = [];
  let teamsStamped = 0;
  let teamsSkipped = 0;
  let entriesStamped = 0;
  let entriesSkipped = 0;
  const seasonsToCreate = new Map();

  for (const school of schools.docs) {
    const schoolId = school.id;
    const teams = await db.collection('teams').where('schoolId', '==', schoolId).get();

    for (const team of teams.docs) {
      if (team.get('seasonId')) {
        teamsSkipped += 1;
        continue;
      }

      const term = termOf(team.get('season'));
      const year = yearOf(team.get('season'), nowYear);
      const seasonId = `${year}-${term}`;
      seasonsToCreate.set(`${schoolId}/${seasonId}`, { schoolId, year, term, seasonId });

      const roster = await team.ref.collection('roster').get();
      const pending = [];

      for (const entry of roster.docs) {
        if (entry.get('seasonId')) {
          entriesSkipped += 1;
          continue;
        }
        pending.push(entry);
      }

      report.push(
        `${schoolId} · ${[team.get('gender'), team.get('level'), team.get('sportName')]
          .filter(Boolean).join(' ')} -> ${seasonId} (${pending.length} entries)`,
      );

      if (DRY_RUN) {
        teamsStamped += 1;
        entriesStamped += pending.length;
        continue;
      }

      // Teams are stamped first so a partially-applied run still leaves each entry's
      // season discoverable through its team.
      await team.ref.update({ seasonId });

      for (let i = 0; i < pending.length; i += BATCH_LIMIT) {
        const batch = db.batch();
        pending.slice(i, i + BATCH_LIMIT).forEach((entry) => {
          batch.update(entry.ref, { seasonId, state: 'active' });
        });
        await batch.commit();
      }

      teamsStamped += 1;
      entriesStamped += pending.length;
    }
  }

  // A season document must exist before anything claims to belong to it, or the archive
  // view reports teams in a season that has no record.
  for (const season of seasonsToCreate.values()) {
    const ref = db.collection('schools').doc(season.schoolId)
      .collection('seasons').doc(season.seasonId);
    const existing = await ref.get();
    if (existing.exists) continue;
    if (!DRY_RUN) {
      await ref.set({
        schoolId: season.schoolId,
        year: season.year,
        term: season.term,
        name: `${season.term.charAt(0).toUpperCase()}${season.term.slice(1)} ${season.year}`,
        state: 'active',
        closedAt: null,
        openedBy: 'backfill',
        closedBy: null,
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
      });
    }
    report.push(`+ season ${season.schoolId}/${season.seasonId}`);
  }

  console.log(DRY_RUN ? 'DRY RUN — nothing written' : 'APPLIED');
  report.forEach((line) => console.log(`  ${line}`));
  console.log('');
  console.log(`teams stamped:   ${teamsStamped} (skipped ${teamsSkipped})`);
  console.log(`entries stamped: ${entriesStamped} (skipped ${entriesSkipped})`);
  if (DRY_RUN) console.log('\nRe-run without --dry-run to write.');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
