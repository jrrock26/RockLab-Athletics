/**
 * The team authorization index.
 *
 * `teams/{teamId}.managerUserIds` is the single document a Storage rule reads to decide
 * whether the caller manages that team. It exists because Cloud Storage Security Rules
 * may access at most TWO Firestore documents per evaluation, and resolving "is this
 * caller an AD of the school that owns this team" the direct way costs three
 * (users + teams + schools). Every legitimate AD was therefore denied on media, film and
 * paperwork — not by a policy decision, by a budget.
 *
 * The index is derived, never authored. It is rebuilt from relationships that already
 * exist and are already trusted:
 *
 *   - `teams/{teamId}.schoolId`            the ownership record (authoritative)
 *   - `schools/{schoolId}.adUserId`        who is the AD of that school
 *   - `teams/{teamId}/members/{uid}.role`  'coach' or 'staff'
 *
 * Rules of construction:
 *   - A team with no `schoolId`, or a `schoolId` pointing at no school, yields NO AD.
 *     Ownership is never inferred.
 *   - The AD must be the one named by the school that owns THIS team. Being an AD
 *     somewhere contributes nothing.
 *   - Only membership documents confer coach/staff standing. `headCoachId` alone does
 *     not, because it is a team field, not a verified relationship — if it names
 *     someone with no membership row, that is reported as a warning instead.
 *   - Output is sorted and de-duplicated so the same inputs always produce the same
 *     array, which lets the trigger skip a no-op write.
 */

/**
 * @param {object} input
 * @param {object|null} input.team    teams/{teamId} data
 * @param {object|null} input.school  schools/{team.schoolId} data
 * @param {Array<{id: string, role?: string}>} input.members membership documents
 * @returns {{managerUserIds: string[], warnings: string[]}}
 */
function computeManagers({ team, school, members }) {
  const warnings = [];
  const managers = new Set();

  const schoolId = team && typeof team.schoolId === 'string' ? team.schoolId : '';
  if (!schoolId) {
    warnings.push('team has no schoolId: no AD can be resolved, index stays empty');
  } else if (!school) {
    warnings.push(`team names school ${schoolId} which does not exist: no AD can be resolved`);
  } else {
    const ad = school.adUserId;
    if (typeof ad === 'string' && ad !== '') {
      managers.add(ad);
    } else {
      warnings.push(`school ${schoolId} has no adUserId: the team has no AD`);
    }
  }

  for (const m of members || []) {
    if (!m || typeof m.id !== 'string' || m.id === '') continue;
    if (m.role === 'coach' || m.role === 'staff') managers.add(m.id);
  }

  const headCoachId = team && typeof team.headCoachId === 'string' ? team.headCoachId : '';
  if (headCoachId && !managers.has(headCoachId)) {
    warnings.push(
      `headCoachId ${headCoachId} has no coach membership on this team: not indexed`,
    );
  }

  return { managerUserIds: Array.from(managers).sort(), warnings };
}

module.exports = { computeManagers };
