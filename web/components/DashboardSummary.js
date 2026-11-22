import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { collection, doc, getDoc, getDocs, query, where } from 'firebase/firestore';
import { db } from '../lib/firebase';

/// The daily view: what needs the athletic director today.
///
/// Everything above the admin cards answers one of three questions an AD actually opens
/// the app for -- did anything land that I have to approve, is anything happening today,
/// and is my organization complete. The admin links are below, because they are the same
/// every day and therefore the least urgent thing on the screen.
///
/// Every read here is already proven: `schools` is signedIn-readable, `events` is
/// authorisable for an AD because isAd() does not read the document, and join requests are
/// read per team on a known path.
const dayKey = (d) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

export default function DashboardSummary({ schoolId, teams, profile }) {
  const [school, setSchool] = useState(null);
  const [events, setEvents] = useState([]);
  const [pending, setPending] = useState(null);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!schoolId) return;
    let alive = true;
    (async () => {
      try {
        const snap = await getDoc(doc(db, 'schools', schoolId));
        if (!alive) return;
        setSchool(snap.exists() ? snap.data() : null);
      } catch (e) {
        // A missing school must not blank the dashboard; the name falls back to the profile.
      }
    })();
    return () => { alive = false; };
  }, [schoolId]);

  useEffect(() => {
    if (!teams.length) { setEvents([]); setPending(0); return; }
    let alive = true;
    (async () => {
      const ids = teams.map((t) => t.id);
      const chunks = [];
      for (let i = 0; i < ids.length; i += 10) chunks.push(ids.slice(i, i + 10));

      const foundEvents = [];
      let pendingCount = 0;
      for (const chunk of chunks) {
        const ev = await getDocs(query(collection(db, 'events'), where('teamId', 'in', chunk)))
          .catch(() => null);
        (ev?.docs || []).forEach((d) => foundEvents.push({ id: d.id, ...d.data() }));

        // Join requests are per team: a collection-group query would be refused because
        // the rule resolves membership with exists().
        for (const teamId of chunk) {
          const jr = await getDocs(
            query(collection(db, 'teams', teamId, 'joinRequests'), where('status', '==', 'pending')),
          ).catch(() => null);
          pendingCount += (jr?.docs || []).length;
        }
      }
      if (!alive) return;
      setEvents(foundEvents);
      setPending(pendingCount);
    })();
    return () => { alive = false; };
  }, [teams]);

  const today = dayKey(new Date());
  const todays = useMemo(() => events
    .map((e) => ({ ...e, when: e.date ? new Date(Number(e.date) * 1000) : null }))
    .filter((e) => e.when && !Number.isNaN(e.when.getTime()) && dayKey(e.when) === today)
    .sort((a, b) => a.when - b.when), [events, today]);

  const noCoach = teams.filter((t) => !t.headCoachId).length;
  const name = school?.name || profile?.schoolName || 'Your school';

  return (
    <>
      <section className="dash-head">
        {school?.logoURL ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img className="dash-logo" src={school.logoURL} alt="" />
        ) : (
          <span className="dash-logo placeholder">{String(name).slice(0, 1)}</span>
        )}
        <div>
          <h1>{name}</h1>
          <p className="muted small">
            {school?.mascot ? `${school.mascot}` : ''}
            {school?.district ? ` · ${school.district}` : ''}
            {school?.zipCode ? ` · ${school.zipCode}` : ''}
          </p>
        </div>
      </section>

      {error && <p className="error">{error}</p>}

      <div className="stat-row">
        <Link className={`stat-card${pending > 0 ? ' attention' : ''}`} href="/requests">
          <strong>{pending === null ? '–' : pending}</strong>
          <span className="small muted">join requests waiting</span>
        </Link>
        <div className="stat-card">
          <strong>{todays.length}</strong>
          <span className="small muted">events today</span>
        </div>
        <div className={`stat-card${teams.length === 0 ? ' attention' : ''}`}>
          <strong>{teams.length}</strong>
          <span className="small muted">teams</span>
        </div>
        <Link className={`stat-card${noCoach > 0 ? ' attention' : ''}`} href="/coaches">
          <strong>{noCoach}</strong>
          <span className="small muted">teams without a head coach</span>
        </Link>
      </div>

      <section className="card">
        <h2>Today</h2>
        {todays.length === 0 ? (
          <p className="muted">Nothing on the schedule today.</p>
        ) : (
          <ul className="req-list">
            {todays.map((ev) => (
              <li key={ev.id} className="roster-row">
                <span className="muted small">
                  {ev.when.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })}
                </span>
                <span>
                  <strong>{ev.title || 'Event'}</strong>
                  {ev.location ? <span className="muted small"> · {ev.location}</span> : null}
                </span>
              </li>
            ))}
          </ul>
        )}
        <p className="small"><Link href="/calendar">Full calendar →</Link></p>
      </section>

      {pending > 0 && (
        <section className="card attention-card">
          <h2>Waiting on you</h2>
          <p className="small">
            {pending} {pending === 1 ? 'family has' : 'families have'} asked to join a team.
            Nobody sees anything until you approve.
          </p>
          <Link href="/requests">Review requests →</Link>
        </section>
      )}
    </>
  );
}
