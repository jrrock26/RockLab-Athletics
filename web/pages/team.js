import { useEffect, useState } from 'react';
import { useRouter } from 'next/router';
import Link from 'next/link';
import { collection, doc, limit, onSnapshot, query, where } from 'firebase/firestore';
import { db } from '../lib/firebase';
import { useAuth } from './index';
import AppShell from '../components/AppShell';
import { personName, activeRoster } from '../lib/portal.mjs';

/// A team, as the AD sees it on the web.
///
/// `?id=` rather than `/team/[id]` on purpose. This site is a static export
/// (output: 'export'), and a static export cannot serve an arbitrary dynamic route: with
/// no getStaticPaths there is no file for /team/abc123, so the catch-all rewrite answers
/// with index.html and the client router appears to need a reload. A query string always
/// resolves to the one real file.
export default function TeamPage() {
  const router = useRouter();
  const id = router.query.id;
  const { loading: authLoading, user, profile } = useAuth();
  const [team, setTeam] = useState(null);
  const [roster, setRoster] = useState([]);
  const [forms, setForms] = useState([]);
  const [events, setEvents] = useState([]);
  const [missing, setMissing] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    // router.query is empty on the first render of a statically exported page; waiting
    // for `id` is what stops this from showing "does not exist" before it has looked.
    if (!id || authLoading || !user) return;
    let alive = true;
    const unsubs = [];
    setMissing(false);

    // Live listeners, not one-shot reads. A coach adding a player, publishing a form or
    // moving a game while the AD has this page open used to require a manual refresh --
    // two people looking at "the same team" saw different states. The queries are the
    // same ones the reads used, so the rules that admitted them still admit the listener.
    unsubs.push(onSnapshot(
      doc(db, 'teams', id),
      (snap) => {
        if (!alive) return;
        if (!snap.exists()) { setMissing(true); setTeam(null); return; }
        setTeam({ id: snap.id, ...snap.data() });
      },
      (err) => { if (alive) setError(err?.message || 'Could not open that team.'); },
    ));

    // A closed season archives entries rather than deleting them, so the roster this
    // page means is the unarchived one. Without this, September opens on last
    // season's names alongside this season's.
    unsubs.push(onSnapshot(
      query(collection(db, 'teams', id, 'roster'), limit(200)),
      (snap) => { if (alive) setRoster(activeRoster(snap.docs.map((d) => ({ id: d.id, ...d.data() })))); },
      () => {},
    ));

    unsubs.push(onSnapshot(
      query(collection(db, 'teams', id, 'forms'), limit(50)),
      (snap) => { if (alive) setForms(snap.docs.map((d) => ({ id: d.id, ...d.data() }))); },
      () => {},
    ));

    unsubs.push(onSnapshot(
      query(collection(db, 'events'), where('teamId', '==', id), limit(50)),
      (snap) => { if (alive) setEvents(snap.docs.map((d) => ({ id: d.id, ...d.data() }))); },
      () => {},
    ));

    return () => { alive = false; unsubs.forEach((u) => u()); };
  }, [id, authLoading, user]);

  if (authLoading) return <main className="page"><p>Loading…</p></main>;
  if (!user) {
    return (
      <main className="page">
        <p className="muted"><Link href="/">Sign in</Link> to view this team.</p>
      </main>
    );
  }

  return (
    <AppShell title={team ? `${team.sportName} ${team.level}` : 'Team'} profile={profile} user={user}>
      <p className="small muted"><Link href="/dashboard">← All teams</Link></p>

      {missing && <p className="error">That team does not exist, or you cannot see it.</p>}
      {error && <p className="error">{error}</p>}
      {!team && !missing && !error && <p className="muted">Loading team…</p>}

      {team && (
        <>
          <h1>{team.sportName} {team.level}</h1>
          <p className="muted">
            {team.season} {team.gender}
            {team.schoolName ? ` · ${team.schoolName}` : ''}
          </p>

          <nav className="row">
            <Link className="card link-card" href="/requests">Join requests</Link>
            <Link className="card link-card" href="/import">Import roster</Link>
            <div className="card link-card static">
              <strong>{roster.length}</strong>
              <span className="muted small"> athletes</span>
            </div>
          </nav>

          <section className="card">
            <h2>Roster</h2>
            {roster.length === 0 && <p className="muted">No athletes on this roster yet.</p>}
            <ul className="req-list">
              {roster.map((p) => {
                // Roster entries carry `playerName`, user profiles `displayName`, durable
                // players documents `name`. personName reads all of them, so this row does
                // not have to know which document it is looking at.
                const fullName = personName(p, 'Unnamed athlete');
                return (
                  <li key={p.id} className="roster-row">
                    <Link href={`/player?team=${id}&entry=${p.id}`} className="roster-link">
                      <span className="avatar">
                        {fullName ? fullName.slice(0, 1).toUpperCase() : '?'}
                      </span>
                      <span>
                        <strong>{fullName || 'Unnamed athlete'}</strong>
                        {p.jerseyNumber ? <span className="muted"> · #{p.jerseyNumber}</span> : null}
                        {p.position ? <span className="muted"> · {p.position}</span> : null}
                      </span>
                    </Link>
                    {p.injuryStatus && p.injuryStatus !== 'healthy'
                      ? <span className="pill warn">{p.injuryStatus}</span>
                      : null}
                  </li>
                );
              })}
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
                  <Link href={`/event?team=${id}&id=${ev.id}`}>
                    <strong>{ev.title || ev.opponent || 'Event'}</strong>
                  </Link>
                  {ev.date
                    ? <span className="muted small"> · {new Date(Number(ev.date) * 1000).toLocaleString()}</span>
                    : null}
                </li>
              ))}
            </ul>
          </section>
        </>
      )}
    </AppShell>
  );
}
