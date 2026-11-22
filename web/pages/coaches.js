import { useEffect, useState } from 'react';
import Link from 'next/link';
import { collection, getDocs, query, where } from 'firebase/firestore';
import { db } from '../lib/firebase';
import { useAuth } from './index';
import AppShell from '../components/AppShell';

/// Coaches and their assignments.
///
/// Reads `teams` by school, then `teams/{id}/members` as a direct path. That path is what
/// makes this screen safe to build: the rules authorise membership from the collection
/// path, whereas a list query across `users` would need exists() and be refused.
///
/// Assigning a coach is not here. There is no assign callable -- ensureTeamCoachMembership
/// only repairs the HEAD coach's own membership -- so adding a coach means an invitation,
/// which is what the link below goes to.
export default function Coaches() {
  const { loading: authLoading, user, profile } = useAuth();
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const isAd = profile?.role === 'ad';

  useEffect(() => {
    if (authLoading || !user) { setLoading(false); return; }
    if (!profile) return;
    if (!isAd) { setLoading(false); return; }
    if (!profile.schoolId) { setLoading(false); return; }

    let alive = true;
    (async () => {
      try {
        const teamsSnap = await getDocs(
          query(collection(db, 'teams'), where('schoolId', '==', profile.schoolId)),
        );
        const teams = teamsSnap.docs.map((d) => ({ id: d.id, ...d.data() }));

        const withMembers = await Promise.all(teams.map(async (t) => {
          const m = await getDocs(collection(db, 'teams', t.id, 'members')).catch(() => null);
          return { ...t, members: (m?.docs || []).map((d) => ({ id: d.id, ...d.data() })) };
        }));

        if (alive) {
          withMembers.sort((a, b) => label(a).localeCompare(label(b)));
          setRows(withMembers);
        }
      } catch (err) {
        if (alive) setError(err?.message || 'Could not load coaches.');
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => { alive = false; };
  }, [authLoading, user, profile, isAd]);

  if (authLoading) return <main className="page"><p>Loading…</p></main>;
  if (!user) return <main className="page"><p className="muted"><Link href="/">Sign in</Link> first.</p></main>;

  return (
    <AppShell title="Coaches" profile={profile} user={user}>
      <h1>Coaches</h1>
      <p className="muted small">
        Who runs each team. A team with no coach is one nobody can score, post, or approve
        for.
      </p>

      {!isAd && <p className="error">Only an athletic director can see every team's staff.</p>}
      {error && <p className="error">{error}</p>}
      {isAd && loading && <p className="muted">Loading…</p>}
      {isAd && !loading && rows.length === 0 && (
        <section className="card">
          <p className="muted">No teams yet. <Link href="/dashboard">Start one</Link> first.</p>
        </section>
      )}

      {rows.map((t) => {
        const coaches = t.members.filter((m) => m.role === 'coach');
        const staff = t.members.filter((m) => m.role === 'staff');
        return (
          <section className="card" key={t.id}>
            <h2>{label(t)}</h2>
            {coaches.length === 0 ? (
              <p className="small warn-text">
                No coach assigned. <Link href="/import">Invite one</Link>.
              </p>
            ) : (
              <ul className="req-list">
                {coaches.map((c) => (
                  <li key={c.id} className="roster-row">
                    <span className="avatar">
                      {String(c.name || c.email || '?').slice(0, 1).toUpperCase()}
                    </span>
                    <span>
                      <strong>{c.name || c.email || 'Unnamed coach'}</strong>
                      {t.headCoachId === c.userId
                        ? <span className="pill">head</span>
                        : <span className="muted small"> · assistant</span>}
                      {c.email ? <span className="muted small"> · {c.email}</span> : null}
                    </span>
                  </li>
                ))}
              </ul>
            )}
            {staff.length > 0 && (
              <p className="small muted">
                Staff: {staff.map((s) => s.name || s.email).join(', ')}
              </p>
            )}
            <p className="small">
              <Link href={`/team?id=${t.id}`}>Open team →</Link>
            </p>
          </section>
        );
      })}
    </AppShell>
  );
}

function label(t) {
  const g = t.gender ? `${String(t.gender).charAt(0).toUpperCase()}${String(t.gender).slice(1)}` : 'Team';
  return [g, t.level, t.sportName].filter(Boolean).join(' · ');
}
