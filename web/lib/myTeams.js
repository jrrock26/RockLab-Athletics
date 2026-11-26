import { collection, doc, getDoc, getDocs, query, where } from 'firebase/firestore';
import { auth, db } from './firebase';
import { activeRoster, eventTypesFor, normalizeRole, VISIBLE_EVENT_TYPES } from './portal.mjs';

/// Everything a member's screens need about their own teams.
///
/// The portal already loads this per team inside its own page; the rail's Teams,
/// Schedule, Messages and Forms pages need the same three reads, so the shape lives here
/// instead of being copied four times. Portal remains untouched and keeps working: this
/// is an additive loader, not a replacement.
///
/// Rules that shape it, and why each read looks the way it does:
///
///   teams/{id}                  — readable by a team member.
///   teams/{id}/roster           — staff-only as a list. A guardian falls back to the
///                                 guardianUserIds query plus direct gets, which the same
///                                 rule authorises per document.
///   events (top-level, teamId)  — a list query is only authorisable when one branch of
///                                 the rule does not read the document, so the type filter
///                                 has to match the role exactly (`eventTypesFor`). Asking
///                                 for a type the rule withholds rejects the whole query.
///   games (top-level, teamId)   — same shape, no extra filter.

async function loadRoster(teamId, linkedIds) {
  try {
    const snap = await getDocs(collection(db, 'teams', teamId, 'roster'));
    return { entries: activeRoster(snap.docs.map((d) => ({ id: d.id, ...d.data() }))), restricted: false };
  } catch {
    const uid = auth.currentUser ? auth.currentUser.uid : '';
    const ids = Array.isArray(linkedIds) ? linkedIds : [];
    const [named, ...individual] = await Promise.all([
      uid
        ? getDocs(query(
          collection(db, 'teams', teamId, 'roster'),
          where('guardianUserIds', 'array-contains', uid),
        )).catch(() => null)
        : null,
      ...ids.map((entryId) => getDoc(doc(db, 'teams', teamId, 'roster', entryId)).catch(() => null)),
    ]);

    const byId = new Map();
    (named && named.docs ? named.docs : []).forEach((d) => byId.set(d.id, { id: d.id, ...d.data() }));
    individual.forEach((snap) => {
      if (snap && snap.exists()) byId.set(snap.id, { id: snap.id, ...snap.data() });
    });
    return { entries: activeRoster([...byId.values()]), restricted: true };
  }
}

/// One team, fully loaded. Every read settles on its own: a single refused roster must
/// not blank the page, which is the failure a family reports as "the app is broken".
export async function loadTeamBundle(teamId, { linkedIds, role } = {}) {
  const [teamSnap, roster, eventsSnap, gamesSnap] = await Promise.all([
    getDoc(doc(db, 'teams', teamId)).catch(() => null),
    loadRoster(teamId, linkedIds),
    (async () => {
      const wide = await getDocs(query(
        collection(db, 'events'),
        where('teamId', '==', teamId),
        where('type', 'in', eventTypesFor(normalizeRole(role))),
      )).catch(() => null);
      if (wide) return wide;
      // Narrower retry, not a different question: a follower's list is the public part of
      // the calendar, and asking for a type the rule withholds rejects the whole query.
      return getDocs(query(
        collection(db, 'events'),
        where('teamId', '==', teamId),
        where('type', 'in', VISIBLE_EVENT_TYPES),
      )).catch(() => null);
    })(),
    getDocs(query(collection(db, 'games'), where('teamId', '==', teamId))).catch(() => null),
  ]);

  return {
    id: teamId,
    team: teamSnap && teamSnap.exists() ? teamSnap.data() : {},
    roster: roster.entries,
    rosterRestricted: roster.restricted,
    events: eventsSnap ? eventsSnap.docs.map((d) => ({ id: d.id, ...d.data() })) : [],
    games: gamesSnap ? gamesSnap.docs.map((d) => ({ id: d.id, ...d.data() })) : [],
  };
}

/// The teams on this account: `users/{uid}.teamIds`, which every membership write keeps
/// up to date (invitation acceptance, coach assignment, roster import).
export async function loadMyTeams(profile) {
  const ids = Array.isArray(profile && profile.teamIds) ? profile.teamIds : [];
  if (!ids.length) return [];
  const linkedIds = profile ? profile.linkedPlayerIds : [];
  const role = profile ? profile.role : '';
  return Promise.all(ids.map((id) => loadTeamBundle(id, { linkedIds, role })));
}

/// One athlete's requirement documents under their roster entry — the record of what
/// this family owes and has signed. Read by collection, which the rules allow for the
/// guardians of that entry.
export async function loadRequirementsFor(teamId, entryId) {
  const snap = await getDocs(collection(db, 'teams', teamId, 'roster', entryId, 'forms'));
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
}

/// A readable label for a team, from whichever fields the document carries. Squads are
/// stored inside `level` ("7th Grade A"), so it is not split here.
export function teamLabel(team) {
  const parts = [team && team.sportName, team && team.level].filter(Boolean);
  return parts.join(' ') || 'Team';
}

/// The line under a team name: season, gender, and who plays it.
export function teamSubtitle(team) {
  return [team && team.season, team && team.gender].filter(Boolean).join(' · ');
}
