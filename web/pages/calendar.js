import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { collection, getDocs, query, where } from 'firebase/firestore';
import { db } from '../lib/firebase';
import { useAuth } from './index';
import AppShell from '../components/AppShell';

/// The school calendar.
///
/// `events` is a TOP-LEVEL collection keyed by teamId, and its read rule is
/// `isAd() || isTeamMember(resource.data.teamId) || ...`. A list query is only
/// authorisable if one branch does not depend on the document -- `isAd()` is that branch,
/// which is why a school-wide read works for an AD and not for anyone else.
///
/// Team ids are asked for in chunks of ten because `in` takes at most ten values.
const TYPES = {
  game: { tone: 'game' },
  practice: { tone: 'practice' },
  meeting: { tone: 'meeting' },
  meal: { tone: 'other' },
  travel: { tone: 'other' },
};

const dayKey = (d) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

function monthCells(year, month) {
  const start = new Date(year, month, 1).getDay();
  const days = new Date(year, month + 1, 0).getDate();
  const cells = [];
  for (let i = 0; i < start; i += 1) cells.push(null);
  for (let d = 1; d <= days; d += 1) cells.push(new Date(year, month, d));
  while (cells.length % 7 !== 0) cells.push(null);
  return cells;
}

export default function Calendar() {
  const { loading: authLoading, user, profile } = useAuth();
  const [events, setEvents] = useState([]);
  const [teams, setTeams] = useState({});
  const [cursor, setCursor] = useState(() => new Date());
  const [selected, setSelected] = useState(() => dayKey(new Date()));
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const isAd = profile?.role === 'ad';

  useEffect(() => {
    if (authLoading || !user || !profile) return;
    if (!isAd || !profile.schoolId) { setLoading(false); return; }

    let alive = true;
    (async () => {
      try {
        const teamsSnap = await getDocs(
          query(collection(db, 'teams'), where('schoolId', '==', profile.schoolId)),
        );
        const list = teamsSnap.docs.map((d) => ({ id: d.id, ...d.data() }));
        const byId = {};
        list.forEach((t) => { byId[t.id] = t; });

        const chunks = [];
        for (let i = 0; i < list.length; i += 10) {
          chunks.push(list.slice(i, i + 10).map((t) => t.id));
        }

        const found = [];
        for (const ids of chunks) {
          const snap = await getDocs(query(collection(db, 'events'), where('teamId', 'in', ids)))
            .catch(() => null);
          (snap?.docs || []).forEach((d) => found.push({ id: d.id, ...d.data() }));
        }

        if (!alive) return;
        setTeams(byId);
        setEvents(found);
      } catch (err) {
        if (alive) setError(err?.message || 'Could not load the calendar.');
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => { alive = false; };
  }, [authLoading, user, profile, isAd]);

  const byDay = useMemo(() => {
    const map = {};
    events.forEach((ev) => {
      const when = ev.date ? new Date(Number(ev.date) * 1000) : null;
      if (!when || Number.isNaN(when.getTime())) return;
      const k = dayKey(when);
      (map[k] = map[k] || []).push({ ...ev, when });
    });
    Object.values(map).forEach((arr) => arr.sort((a, b) => a.when - b.when));
    return map;
  }, [events]);

  const cells = monthCells(cursor.getFullYear(), cursor.getMonth());
  const monthName = cursor.toLocaleString(undefined, { month: 'long', year: 'numeric' });
  const todaysKey = dayKey(new Date());
  const shown = byDay[selected] || [];

  if (authLoading) return <main className="page"><p>Loading…</p></main>;
  if (!user) {
    return <main className="page"><p className="muted"><Link href="/">Sign in</Link> first.</p></main>;
  }

  return (
    <AppShell title="Calendar" profile={profile} user={user}>
      <h1>Calendar</h1>

      {!isAd ? (
        <section className="card">
          <p className="muted">
            The school-wide calendar is for athletic directors. Your team&apos;s schedule is
            on <Link href="/portal">your portal</Link>.
          </p>
        </section>
      ) : (
        <>
          <div className="cal-bar">
            <button type="button" className="link"
              onClick={() => setCursor(new Date(cursor.getFullYear(), cursor.getMonth() - 1, 1))}>←</button>
            <strong>{monthName}</strong>
            <button type="button" className="link"
              onClick={() => setCursor(new Date(cursor.getFullYear(), cursor.getMonth() + 1, 1))}>→</button>
            <button type="button" className="link" onClick={() => setCursor(new Date())}>Today</button>
          </div>

          {error && <p className="error">{error}</p>}
          {loading && <p className="muted">Loading…</p>}
          {!loading && events.length === 0 && !error && (
            <p className="small muted">
              No events yet. Games and practices are added from a team&apos;s schedule.
            </p>
          )}

          <section className="card">
            <div className="cal-grid">
              {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map((d) => (
                <div key={d} className="cal-dow">{d}</div>
              ))}
              {cells.map((d, i) => {
                if (!d) return <div key={`b${i}`} className="cal-cell empty" />;
                const k = dayKey(d);
                const list = byDay[k] || [];
                const classes = ['cal-cell', k === todaysKey ? 'today' : '', k === selected ? 'selected' : '']
                  .filter(Boolean).join(' ');
                return (
                  <button type="button" key={k} className={classes} onClick={() => setSelected(k)}>
                    <span className="cal-date">{d.getDate()}</span>
                    <span className="cal-dots">
                      {list.slice(0, 3).map((ev) => (
                        <span key={ev.id} className={`dot ${(TYPES[ev.type] || {}).tone || 'other'}`} />
                      ))}
                      {list.length > 3 && <span className="cal-more">+{list.length - 3}</span>}
                    </span>
                  </button>
                );
              })}
            </div>
          </section>

          <section className="card">
            <h2>
              {new Date(`${selected}T12:00:00`).toLocaleDateString(undefined, {
                weekday: 'long', month: 'long', day: 'numeric',
              })}
            </h2>
            {shown.length === 0 && <p className="muted">Nothing scheduled.</p>}
            <ul className="req-list">
              {shown.map((ev) => {
                const t = teams[ev.teamId] || {};
                const teamLabel = [t.gender, t.level, t.sportName].filter(Boolean).join(' ');
                return (
                  <li key={ev.id} className="roster-row">
                    <span className={`dot ${(TYPES[ev.type] || {}).tone || 'other'}`} />
                    <span>
                      <strong>{ev.title || 'Event'}</strong>
                      <span className="muted small">
                        {' · '}
                        {ev.when.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })}
                        {teamLabel ? ` · ${teamLabel}` : ''}
                        {ev.location ? ` · ${ev.location}` : ''}
                      </span>
                      <br />
                      <span className="small"><Link href={`/team?id=${ev.teamId}`}>Open team</Link></span>
                    </span>
                  </li>
                );
              })}
            </ul>
          </section>
        </>
      )}
    </AppShell>
  );
}
