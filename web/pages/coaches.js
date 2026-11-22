import { useEffect, useState } from 'react';
import Link from 'next/link';
import { collection, getDocs, query, where } from 'firebase/firestore';
import { db, functions } from '../lib/firebase';
import { httpsCallable } from 'firebase/functions';
import { useAuth } from './index';
import AppShell from '../components/AppShell';
import { personName } from '../lib/portal.mjs';

/// Coaches and their assignments.
///
/// Reads `teams` by school, then `teams/{id}/members` as a direct path. That path is what
/// makes this screen safe to build: the rules authorise membership from the collection
/// path, whereas a list query across `users` would need exists() and be refused.
///
/// Assigning a coach goes through assignCoachToTeam: membership decides who can see a
/// roster, so the school check lives in a callable. A coach with no account still needs an
/// invitation, which is the path the iOS app uses.
export default function Coaches() {
  const { loading: authLoading, user, profile } = useAuth();
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const [people, setPeople] = useState([]);
  const [coachId, setCoachId] = useState('');
  const [assignTeamId, setAssignTeamId] = useState('');
  const [makeHead, setMakeHead] = useState(false);
  const [assignBusy, setAssignBusy] = useState(false);
  const [assignError, setAssignError] = useState('');
  const [assignNotice, setAssignNotice] = useState('');
  const [reloadKey, setReloadKey] = useState(0);

  // users/{id} is readable by an AD through a branch that never touches the document, so
  // this list query is authorisable. Same-school is enforced in memory as well, because a
  // rule change elsewhere should not silently widen this screen.
  useEffect(() => {
    // `profile?.role` directly rather than the `isAd` constant: isAd is declared further
    // down, so reading it here hits the temporal dead zone and throws on first render --
    // which is exactly the white screen this caused.
    if (profile?.role !== 'ad' || !profile?.schoolId) return;
    let alive = true;
    (async () => {
      const snap = await getDocs(
        query(collection(db, 'users'), where('schoolId', '==', profile.schoolId)),
      ).catch(() => null);
      if (!alive || !snap) return;
      setPeople(
        snap.docs
          .map((d) => ({ id: d.id, ...d.data() }))
          .filter((u) => ['coach', 'staff', 'ad'].includes(u.role))
          .sort((a, b) => personName(a).localeCompare(personName(b))),
      );
    })();
    return () => { alive = false; };
  }, [profile?.role, profile?.schoolId]);

  async function assign() {
    setAssignBusy(true);
    setAssignError('');
    setAssignNotice('');
    try {
      const res = await httpsCallable(functions, 'assignCoachToTeam')({
        teamId: assignTeamId, userId: coachId, makeHead,
      });
      const person = people.find((p) => p.id === coachId);
      const team = rows.find((t) => t.id === assignTeamId);
      setAssignNotice(
        `${personName(person) || 'Coach'} assigned to ${team ? label(team) : 'the team'}`
        + `${res.data?.headCoach ? ' as head coach' : ''}.`,
      );
      setCoachId('');
      setMakeHead(false);
      // Re-read the staff lists instead of reloading the page, which would also throw away
      // the confirmation above.
      setReloadKey((k) => k + 1);
    } catch (err) {
      setAssignError(err?.message || 'That assignment did not go through.');
    } finally {
      setAssignBusy(false);
    }
  }

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
  }, [authLoading, user, profile, isAd, reloadKey]);

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

      {isAd && (
        <section className="card">
          <h2>Assign a coach</h2>
          <p className="small muted">
            Picks an account that already exists in your school. A coach without an account
            still needs an invitation — that is the path the app uses.
          </p>
          <div className="form-grid">
            <label>
              Coach
              <select value={coachId} onChange={(e) => setCoachId(e.target.value)}>
                <option value="">Choose a person…</option>
                {people.map((p) => (
                  <option key={p.id} value={p.id}>
                    {personName(p)} ({p.role})
                  </option>
                ))}
              </select>
            </label>
            <label>
              Team
              <select value={assignTeamId} onChange={(e) => setAssignTeamId(e.target.value)}>
                <option value="">Choose a team…</option>
                {rows.map((t) => (
                  <option key={t.id} value={t.id}>{label(t)}</option>
                ))}
              </select>
            </label>
            <label className="checkbox-row">
              <input type="checkbox" checked={makeHead} onChange={(e) => setMakeHead(e.target.checked)} />
              <span>Make head coach</span>
            </label>
          </div>
          <button
            type="button"
            onClick={assign}
            disabled={assignBusy || !coachId || !assignTeamId}
          >
            {assignBusy ? 'Assigning…' : 'Assign'}
          </button>
          {assignError && <p className="error">{assignError}</p>}
          {assignNotice && <p className="ok">{assignNotice}</p>}
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
                      {String(personName(c, '?')).slice(0, 1).toUpperCase()}
                    </span>
                    <span>
                      <strong>{personName(c, 'Unnamed coach')}</strong>
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
                Staff: {staff.map((s) => personName(s)).join(', ')}
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
