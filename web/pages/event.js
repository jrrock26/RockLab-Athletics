import { useEffect, useState } from 'react';
import { useRouter } from 'next/router';
import Link from 'next/link';
import { collection, doc, onSnapshot, serverTimestamp, setDoc } from 'firebase/firestore';
import { db } from '../lib/firebase';
import { useAuth } from './index';
import AppShell from '../components/AppShell';
import { personName, activeRoster } from '../lib/portal.mjs';

/// Taking attendance at one event.
///
/// Writes `events/{eventId}/attendance/{rosterEntryId}` with `status` -- the exact shape
/// iOS `setAttendance` already uses, keyed by roster entry id so it joins to an athlete
/// without a second lookup. Matching that shape matters: a coach may start here and
/// finish on a phone, and the two must be the same records.
const OPTIONS = [
  { key: 'present', label: 'Present' },
  { key: 'excused', label: 'Excused' },
  { key: 'unexcused', label: 'Unexcused' },
];

export default function EventAttendance() {
  const router = useRouter();
  const { team, id } = router.query;
  const { loading: authLoading, user, profile } = useAuth();

  const [event, setEvent] = useState(null);
  const [roster, setRoster] = useState([]);
  const [marks, setMarks] = useState({});
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  const canTake = ['ad', 'coach', 'staff'].includes(profile?.role || '');

  useEffect(() => {
    if (authLoading || !user || !team || !id) return;
    let alive = true;
    const unsubs = [];

    // Live marks, not a snapshot at open. Attendance is the screen two people use at
    // once -- a head coach and an assistant on the sideline, or an AD watching from the
    // office -- and a stale board is worse than no board, because it looks authoritative.
    unsubs.push(onSnapshot(
      doc(db, 'events', id),
      (snap) => {
        if (!alive) return;
        if (!snap.exists()) { setError('That event does not exist.'); setLoading(false); return; }
        setEvent({ id: snap.id, ...snap.data() });
      },
      (err) => {
        if (!alive) return;
        setError(err?.message || 'Could not open that event.');
        setLoading(false);
      },
    ));

    // Unordered and sorted here: `orderBy('playerName')` silently drops entries that
    // have no name yet, which is exactly the half-added athlete a coach is looking for.
    unsubs.push(onSnapshot(
      collection(db, 'teams', team, 'roster'),
      (snap) => {
        if (!alive) return;
        const rows = activeRoster(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
        setRoster(rows.sort((a, b) =>
          String(personName(a, '')).localeCompare(String(personName(b, '')))));
        setLoading(false);
      },
      () => { if (alive) setLoading(false); },
    ));

    unsubs.push(onSnapshot(
      collection(db, 'events', id, 'attendance'),
      (snap) => {
        if (!alive) return;
        const map = {};
        snap.docs.forEach((d) => { map[d.id] = d.data().status; });
        setMarks(map);
      },
      () => {},
    ));

    return () => { alive = false; unsubs.forEach((u) => u()); };
  }, [authLoading, user, team, id]);

  async function mark(entryId, status) {
    const previous = marks[entryId];
    setMarks((m) => ({ ...m, [entryId]: status }));
    setBusy(entryId);
    setError('');
    setNotice('');
    try {
      await setDoc(doc(db, 'events', id, 'attendance', entryId), {
        eventId: id,
        rosterEntryId: entryId,
        status,
        updatedAt: serverTimestamp(),
        recordedBy: user.uid,
      });
    } catch (err) {
      // Put the mark back rather than leave the screen showing a record that was refused.
      setMarks((m) => {
        const next = { ...m };
        if (previous) next[entryId] = previous; else delete next[entryId];
        return next;
      });
      setError(err?.message || 'That mark could not be saved.');
    } finally {
      setBusy('');
    }
  }

  async function markAllPresent() {
    setBusy('all');
    setNotice('');
    setError('');
    try {
      await Promise.all(roster.map((p) => setDoc(
        doc(db, 'events', id, 'attendance', p.id),
        {
          eventId: id,
          rosterEntryId: p.id,
          status: 'present',
          updatedAt: serverTimestamp(),
          recordedBy: user.uid,
        },
      )));
      const next = { ...marks };
      roster.forEach((p) => { next[p.id] = 'present'; });
      setMarks(next);
      setNotice('Everyone marked present.');
    } catch (err) {
      setError(err?.message || 'Could not mark everyone present.');
    } finally {
      setBusy('');
    }
  }

  if (authLoading || loading) return <main className="page"><p>Loading…</p></main>;
  if (!user) return <main className="page"><p className="muted"><Link href="/">Sign in</Link> first.</p></main>;

  const taken = Object.keys(marks).length;

  return (
    <AppShell title={event?.title || 'Attendance'} profile={profile} user={user}>
      <p className="small muted"><Link href={`/team?id=${team}`}>← Back to team</Link></p>
      {error && <p className="error">{error}</p>}
      {notice && <p className="notice">{notice}</p>}

      {event && (
        <>
          <h1>{event.title || 'Event'}</h1>
          <p className="muted small">
            {event.date ? new Date(Number(event.date) * 1000).toLocaleString() : ''}
            {event.location ? ` · ${event.location}` : ''}
            {event.type ? ` · ${event.type}` : ''}
          </p>

          {!canTake && (
            <p className="error">
              Only a coach, staff member, or athletic director takes attendance.
            </p>
          )}

          {canTake && (
            <>
              <p className="small muted">
                {taken} of {roster.length} recorded. An unmarked player stays blank, not
                absent — a blank means &ldquo;not yet&rdquo;, which is a different fact from
                &ldquo;did not show&rdquo;.
              </p>
              <button type="button" onClick={markAllPresent}
                disabled={busy === 'all' || roster.length === 0}>
                {busy === 'all' ? 'Marking…' : 'Mark everyone present'}
              </button>

              {roster.length === 0 && <p className="muted">No athletes on this roster.</p>}

              <ul className="req-list">
                {roster.map((p) => {
                  const current = marks[p.id];
                  const name = personName(p, 'Athlete');
                  return (
                    <li key={p.id} className="attend-row">
                      <span className="roster-link">
                        <span className="avatar">{String(name).slice(0, 1).toUpperCase()}</span>
                        <span>
                          <strong>{name}</strong>
                          {p.jerseyNumber
                            ? <span className="muted small"> · #{p.jerseyNumber}</span>
                            : null}
                        </span>
                      </span>
                      <span className="attend-options">
                        {OPTIONS.map((o) => (
                          <button
                            key={o.key}
                            type="button"
                            className={current === o.key ? `choice on ${o.key}` : `choice ${o.key}`}
                            disabled={busy === p.id}
                            onClick={() => mark(p.id, o.key)}
                          >
                            {o.label}
                          </button>
                        ))}
                      </span>
                    </li>
                  );
                })}
              </ul>
            </>
          )}
        </>
      )}
    </AppShell>
  );
}
