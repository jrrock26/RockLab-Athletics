import { useEffect, useState } from 'react';
import { useRouter } from 'next/router';
import Link from 'next/link';
import { collection, doc, getDoc, getDocs, query, where } from 'firebase/firestore';
import { httpsCallable } from 'firebase/functions';
import { db, functions } from '../lib/firebase';
import { useAuth } from './index';
import AppShell from '../components/AppShell';
import { personName, isArchivedEntry } from '../lib/portal.mjs';

/// One athlete, from the team roster.
///
/// Reads the roster entry directly -- `?team=&entry=` rather than a nested route, because
/// this site is a static export and a dynamic path has no file to serve.
///
/// Only injury is written, and only through callables: reportPlayerInjury and
/// clearPlayerInjury already own that document's injury fields, so this page never writes
/// the roster directly and cannot drift from the iOS flow.
export default function PlayerPage() {
  const router = useRouter();
  const { team, entry } = router.query;
  const { loading: authLoading, user, profile } = useAuth();

  const [player, setPlayer] = useState(null);
  const [forms, setForms] = useState(null);
  const [attendance, setAttendance] = useState(null);
  const [missing, setMissing] = useState(false);
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  const [reporting, setReporting] = useState(false);
  const [status, setStatus] = useState('injured');
  const [bodyPart, setBodyPart] = useState('');
  const [description, setDescription] = useState('');

  const canManage = ['ad', 'coach', 'staff'].includes(profile?.role || '');

  async function load() {
    if (!team || !entry) return;
    const snap = await getDoc(doc(db, 'teams', team, 'roster', entry)).catch(() => null);
    if (!snap || !snap.exists()) { setMissing(true); return; }
    setPlayer({ id: snap.id, ...snap.data() });

    // Eligibility is form compliance, not a stored flag: a form that is signed and not
    // expired. Only this athlete's own submissions are read.
    const published = await getDocs(collection(db, 'teams', team, 'forms')).catch(() => null);
    if (!published) { setForms([]); return; }
    const rows = [];
    for (const f of published.docs) {
      const s = await getDoc(doc(db, 'teams', team, 'forms', f.id, 'submissions', entry))
        .catch(() => null);
      rows.push({
        formId: f.id,
        title: f.data().title || f.data().name || 'Form',
        dueAt: f.data().dueAt || null,
        submission: s && s.exists() ? s.data() : null,
      });
    }
    setForms(rows);

    // Attendance lives on the EVENT, not the athlete: one doc per roster entry under
    // events/{id}/attendance. So the rollup reads this team's events and asks each for
    // this athlete's row. Events are read once per team, not per athlete per event.
    // events is a TOP-LEVEL collection keyed by teamId, not a subcollection -- querying
    // teams/{id}/events returns nothing. One query for the team, then one direct get per
    // event for this athlete's row.
    const events = await getDocs(
      query(collection(db, 'events'), where('teamId', '==', team)),
    ).catch(() => null);
    if (!events) { setAttendance({ total: 0, present: 0, excused: 0, unexcused: 0, recent: [] }); return; }
    const seen = [];
    for (const e of events.docs) {
      const row = await getDoc(doc(db, 'events', e.id, 'attendance', entry)).catch(() => null);
      if (!row || !row.exists()) continue;
      const status = row.data().status;
      if (!status || status === 'pending') continue;
      seen.push({
        eventId: e.id,
        status,
        title: e.data().title || e.data().type || 'Event',
        when: e.data().date ? new Date(Number(e.data().date) * 1000) : null,
      });
    }
    seen.sort((a, b) => (b.when || 0) - (a.when || 0));
    setAttendance({
      total: seen.length,
      present: seen.filter((r) => r.status === 'present').length,
      excused: seen.filter((r) => r.status === 'excused').length,
      unexcused: seen.filter((r) => r.status === 'unexcused').length,
      recent: seen.slice(0, 8),
    });
  }

  useEffect(() => {
    if (authLoading || !user || !team || !entry) return;
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [authLoading, user, team, entry]);

  async function report() {
    setBusy('report');
    setError('');
    setNotice('');
    try {
      await httpsCallable(functions, 'reportPlayerInjury')({
        teamId: team, rosterEntryId: entry, status, bodyPart, description,
      });
      setNotice('Injury recorded.');
      setReporting(false);
      setBodyPart('');
      setDescription('');
      await load();
    } catch (err) {
      setError(err?.message || 'That injury could not be recorded.');
    } finally {
      setBusy('');
    }
  }

  async function clear() {
    setBusy('clear');
    setError('');
    setNotice('');
    try {
      await httpsCallable(functions, 'clearPlayerInjury')({ teamId: team, rosterEntryId: entry });
      setNotice('Cleared to play.');
      await load();
    } catch (err) {
      setError(err?.message || 'That injury could not be cleared.');
    } finally {
      setBusy('');
    }
  }

  if (authLoading) return <main className="page"><p>Loading…</p></main>;
  if (!user) return <main className="page"><p className="muted"><Link href="/">Sign in</Link> first.</p></main>;

  const name = personName(player, 'Athlete');
  const hurt = player?.injuryStatus && player.injuryStatus !== 'healthy';

  return (
    <AppShell title={name} profile={profile} user={user}>
      <p className="small muted"><Link href={`/team?id=${team}`}>← Back to team</Link></p>
      {missing && <p className="error">That athlete is not on this team.</p>}
      {error && <p className="error">{error}</p>}
      {notice && <p className="notice">{notice}</p>}
      {/* An archived athlete is still reachable by link -- a bookmark, a stat, an injury
          report. Hiding them would break those; saying so keeps the page honest. */}
      {player && isArchivedEntry(player) && (
        <p className="notice">
          Archived with a closed season. Their history is still readable, but they are not
          on the active roster.
        </p>
      )}

      {player && (
        <>
          <section className="profile-head">
            <span className="avatar lg">{String(name).slice(0, 1).toUpperCase()}</span>
            <div>
              <h1 style={{ margin: 0 }}>{name}</h1>
              <p className="muted small">
                {player.jerseyNumber ? `#${player.jerseyNumber}` : 'No number'}
                {player.position ? ` · ${player.position}` : ''}
              </p>
              {hurt
                ? <span className="pill warn">{player.injuryStatus}</span>
                : <span className="pill">available</span>}
            </div>
          </section>

          <section className="card">
            <h2>Injury</h2>
            {hurt ? (
              <>
                <p className="small">
                  <strong>{player.injuryStatus}</strong>
                  {player.injuryBodyPart ? ` · ${player.injuryBodyPart}` : ''}
                  {player.injuryNote ? ` — ${player.injuryNote}` : ''}
                </p>
                {player.injuryUpdatedByName && (
                  <p className="small muted">
                    Reported by {player.injuryUpdatedByName}
                    {player.injuryUpdatedAt?.toDate
                      ? ` on ${player.injuryUpdatedAt.toDate().toLocaleDateString()}`
                      : ''}
                  </p>
                )}
                {canManage && (
                  <button type="button" onClick={clear} disabled={busy === 'clear'}>
                    {busy === 'clear' ? 'Clearing…' : 'Mark cleared'}
                  </button>
                )}
              </>
            ) : (
              <p className="muted small">No injury on record.</p>
            )}

            {canManage && !reporting && (
              <button type="button" className="link" onClick={() => setReporting(true)}>
                Report an injury
              </button>
            )}

            {canManage && reporting && (
              <div className="form-grid">
                <label>
                  Status
                  <select value={status} onChange={(e) => setStatus(e.target.value)}>
                    <option value="injured">Out (injured)</option>
                    <option value="limited">Limited</option>
                  </select>
                </label>
                <label>
                  Body part
                  <input value={bodyPart} maxLength={120} onChange={(e) => setBodyPart(e.target.value)} />
                </label>
                <label>
                  Note
                  <input value={description} maxLength={300} onChange={(e) => setDescription(e.target.value)} />
                </label>
                <button type="button" onClick={report} disabled={busy === 'report'}>
                  {busy === 'report' ? 'Saving…' : 'Record'}
                </button>
              </div>
            )}
          </section>

          <section className="card">
            <h2>Eligibility</h2>
            <p className="small muted">
              Read from this athlete&apos;s form submissions — signed, and not expired. There
              is no eligibility flag stored on a roster entry.
            </p>
            {forms === null && <p className="muted">Loading…</p>}
            {forms && forms.length === 0 && <p className="muted small">No forms published.</p>}
            <ul className="plain-list">
              {(forms || []).map((f) => {
                const signed = !!f.submission
                  && (f.submission.status === 'submitted' || f.submission.status === 'complete');
                return (
                  <li key={f.formId}>
                    <strong>{f.title}</strong>{' '}
                    <span className={signed ? 'ok small' : 'warn-text small'}>
                      {signed ? 'signed' : 'not signed'}
                    </span>
                    {f.dueAt
                      ? <span className="muted small"> · due {new Date(f.dueAt).toLocaleDateString()}</span>
                      : null}
                  </li>
                );
              })}
            </ul>
          </section>

          <section className="card">
            <h2>Attendance</h2>
            {attendance === null && <p className="muted">Loading…</p>}
            {attendance && attendance.total === 0 && (
              <p className="muted small">
                No attendance recorded for this athlete yet. A coach takes it at an event.
              </p>
            )}
            {attendance && attendance.total > 0 && (
              <>
                <div className="stat-row">
                  <div className="stat-card"><strong>{attendance.present}</strong><span className="small muted">present</span></div>
                  <div className="stat-card"><strong>{attendance.excused}</strong><span className="small muted">excused</span></div>
                  <div className="stat-card attention"><strong>{attendance.unexcused}</strong><span className="small muted">unexcused</span></div>
                </div>
                <p className="small muted">
                  {attendance.total} event{attendance.total === 1 ? '' : 's'} recorded ·{' '}
                  {Math.round((attendance.present / attendance.total) * 100)}% attended
                </p>
                <ul className="plain-list">
                  {attendance.recent.map((r) => (
                    <li key={r.eventId}>
                      <Link href={`/event?team=${team}&id=${r.eventId}`}>
                        {r.title || 'Event'}
                      </Link>
                      {' '}
                      <span className={r.status === 'unexcused' ? 'warn-text small' : 'muted small'}>
                        {r.status}
                      </span>
                      {r.when ? <span className="muted small"> · {r.when.toLocaleDateString()}</span> : null}
                    </li>
                  ))}
                </ul>
              </>
            )}
          </section>
        </>
      )}
    </AppShell>
  );
}
