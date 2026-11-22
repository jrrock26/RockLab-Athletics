import { useEffect, useState } from 'react';
import { useRouter } from 'next/router';
import Link from 'next/link';
import { collection, doc, getDoc, getDocs, limit, query } from 'firebase/firestore';
import { db } from '../../lib/firebase';
import { useAuth } from '../index';
import AppShell from '../../components/AppShell';

/// A team, as the AD sees it on the web: who is on it, what is attached to it, and the
/// doors into each part. Read-only by design -- editing a roster on the web is a
/// destructive form, and the app already does it with the athlete's record in view.
export default function TeamPage() {
  const router = useRouter();
  const { id } = router.query;
  const { loading: authLoading, user, profile } = useAuth();
  const [team, setTeam] = useState(null);
  const [roster, setRoster] = useState([]);
  const [forms, setForms] = useState([]);
  const [events, setEvents] = useState([]);
  const [missing, setMissing] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!id || authLoading || !user) return;
    (async () => {
      try {
        const snap = await getDoc(doc(db, 'teams', id));
        if (!snap.exists()) { setMissing(true); return; }
        setTeam({ id: snap.id, ...snap.data() });

        // Direct collection reads on a known team path: the rules resolve membership
        // from the path, which a list query over many teams could not do.
        const [r, f, e] = await Promise.all([
          getDocs(query(collection(db, 'teams', id, 'roster'), limit(200))).catch(() => null),
          getDocs(query(collection(db, 'teams', id, 'forms'), limit(50))).catch(() => null),
          getDocs(query(collection(db, 'teams', id, 'events'), limit(50))).catch(() => null),
        ]);
        setRoster((r?.docs || []).map((d) => ({ id: d.id, ...d.data() })));
        setForms((f?.docs || []).map((d) => ({ id: d.id, ...d.data() })));
        setEvents((e?.docs || []).map((d) => ({ id: d.id, ...d.data() })));
      } catch (err) {
        setError(err?.message || 'Could not open that team.');
      }
    })();
  }, [id, authLoading, user]);

  if (authLoading) return <main className="page"><p>Loading…</p></main>;
  if (!user) return <main className="page"><p className="muted"><Link href="/">Sign in</Link> to view this team.</p></main>;

  return (
    <AppShell title={team ? `${team.sportName} ${team.level}` : 'Team'} profile={profile} user={user}>
      <p className="small muted"><Link href="/dashboard">← All teams</Link></p>

      {missing && <p className="error">That team does not exist, or you cannot see it.</p>}
      {error && <p className="error">{error}</p>}

      {team && (
        <>
          <h1>{team.sportName} {team.level}</h1>
          <p className="muted">
            {team.season} {team.gender}
            {team.schoolName ? ` · ${team.schoolName}` : ''}
          </p>

          <nav className="row">
            <Link className="card link-card" href={`/requests`}>
              Join requests
            </Link>
            <Link className="card link-card" href="/import">
              Import roster
            </Link>
            <div className="card link-card static">
              <strong>{roster.length}</strong>
              <span className="muted small"> athletes</span>
            </div>
          </nav>

          <section className="card">
            <h2>Roster</h2>
            {roster.length === 0 && <p className="muted">No athletes on this roster yet.</p>}
            <ul className="req-list">
              {roster.map((p) => (
                <li key={p.id} className="roster-row">
                  <span className="avatar">
                    {String(p.displayName || p.name || '?').slice(0, 1).toUpperCase()}
                  </span>
                  <span>
                    <strong>{p.displayName || p.name || 'Unnamed athlete'}</strong>
                    {p.jerseyNumber ? <span className="muted"> · #{p.jerseyNumber}</span> : null}
                    {p.position ? <span className="muted"> · {p.position}</span> : null}
                  </span>
                  {p.injuryStatus && p.injuryStatus !== 'healthy'
                    ? <span className="pill warn">{p.injuryStatus}</span>
                    : null}
                </li>
              ))}
            </ul>
          </section>

          <section className="card">
            <h2>Forms</h2>
            {forms.length === 0 && <p className="muted">No forms published.</p>}
            <ul>
              {forms.map((f) => (
                <li key={f.id}>
                  <strong>{f.title || 'Untitled form'}</strong>
                  {f.dueAt ? <span className="muted small"> · due {new Date(f.dueAt).toLocaleDateString()}</span> : null}
                </li>
              ))}
            </ul>
          </section>

          <section className="card">
            <h2>Schedule</h2>
            {events.length === 0 && <p className="muted">Nothing scheduled.</p>}
            <ul>
              {events.map((ev) => (
                <li key={ev.id}>
                  <strong>{ev.title || ev.opponent || 'Event'}</strong>
                  {ev.startAt ? <span className="muted small"> · {new Date(ev.startAt).toLocaleString()}</span> : null}
                </li>
              ))}
            </ul>
          </section>
        </>
      )}
    </AppShell>
  );
}
