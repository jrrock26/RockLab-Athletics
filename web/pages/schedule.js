import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { collection, doc, getDocs, query, serverTimestamp, setDoc, where } from 'firebase/firestore';
import { db } from '../lib/firebase';
import { useAuth } from './index';
import AppShell from '../components/AppShell';
import { loadMyTeams, teamLabel } from '../lib/myTeams';
import {
  displayName,
  formatWhen,
  myAthletes,
  normalizeRole,
  partitionEvents,
  rsvpId,
  RSVP_CHOICES,
  toMillis,
} from '../lib/portal.mjs';

/// Everything on my calendar, across every team, in one list.
///
/// iOS has a Schedule tab; the web only had the school-wide calendar, which is AD-only
/// by rule, and the portal's per-team schedule buried inside each team card. A parent
/// with two children on two teams could not answer "what is this week" without opening
/// both.
///
/// The RSVP writes the same document iOS and the portal write, via `rsvpId`, because a
/// guardian answers per child and a mismatch in that id is why coaches never saw answers.
const TYPE_TONE = {
  game: 'game', practice: 'practice', meeting: 'meeting', meal: 'other', travel: 'other',
};

export default function Schedule() {
  const { loading, user, profile } = useAuth();
  const [teams, setTeams] = useState([]);
  const [rsvps, setRsvps] = useState({});
  const [busy, setBusy] = useState(true);
  const [saving, setSaving] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    if (loading || !user || !profile) return undefined;
    let alive = true;
    (async () => {
      setBusy(true);
      try {
        const rows = await loadMyTeams(profile);
        if (alive) setTeams(rows);
      } catch (err) {
        if (alive) setError(err?.message || 'Your schedule could not be loaded.');
      } finally {
        if (alive) setBusy(false);
      }
    })();
    return () => { alive = false; };
  }, [loading, user, profile]);

  /// One flat list of events, each carrying the team it belongs to and the athletes this
  /// account answers for. Computed once per load rather than per row.
  const events = useMemo(() => {
    const rows = [];
    teams.forEach((t) => {
      const mine = myAthletes(t.roster, {
        uid: user ? user.uid : '',
        linkedPlayerIds: profile && profile.linkedPlayerIds,
      });
      (t.events || []).forEach((e) => {
        rows.push({ ...e, teamId: t.id, label: teamLabel(t.team), athletes: mine });
      });
    });
    return rows;
  }, [teams, user, profile]);

  const nowMs = Date.now();
  const { upcoming, past } = partitionEvents(events, nowMs);
  const canManage = ['ad', 'coach', 'staff'].includes(normalizeRole(profile && profile.role));

  /// Existing answers, for the events still ahead. Keyed `${eventId}:${entryId}` exactly
  /// like the portal, so the two screens agree on what this family already said.
  const upcomingIds = upcoming.map((e) => e.id).join(',');
  useEffect(() => {
    if (!user || !upcomingIds) return undefined;
    let alive = true;
    (async () => {
      const next = {};
      for (const eventId of upcomingIds.split(',')) {
        const snap = await getDocs(query(
          collection(db, 'events', eventId, 'rsvps'),
          where('respondentUserId', '==', user.uid),
        )).catch(() => null);
        (snap ? snap.docs : []).forEach((d) => {
          const data = d.data();
          if (data.athleteEntryId && data.status) {
            next[`${eventId}:${data.athleteEntryId}`] = data.status;
          }
        });
      }
      if (alive) setRsvps((prev) => ({ ...prev, ...next }));
    })();
    return () => { alive = false; };
  }, [user, upcomingIds]);

  async function answer(eventId, entryId, status) {
    const key = `${eventId}:${entryId}`;
    setSaving(key);
    setError('');
    try {
      await setDoc(doc(db, 'events', eventId, 'rsvps', rsvpId(user.uid, entryId)), {
        eventId,
        userId: user.uid,
        respondentUserId: user.uid,
        athleteEntryId: entryId,
        status,
        updatedAt: serverTimestamp(),
      });
      setRsvps((prev) => ({ ...prev, [key]: status }));
    } catch (err) {
      setError(err?.message || 'That answer could not be saved.');
    } finally {
      setSaving('');
    }
  }

  if (loading) return <main className="page"><p>Loading…</p></main>;
  if (!user) {
    return (
      <main className="page">
        <p className="muted"><Link href="/">Sign in</Link> to see your schedule.</p>
      </main>
    );
  }

  return (
    <AppShell title="Schedule" profile={profile} user={user}>
      <h1>Schedule</h1>

      {error && <p className="error">{error}</p>}
      {busy && <p className="muted">Loading your schedule…</p>}

      {!busy && events.length === 0 && !error && (
        <section className="card">
          <p className="muted">
            Nothing scheduled yet. Games and practices your coach adds appear here.
          </p>
        </section>
      )}

      {upcoming.length > 0 && (
        <section className="card">
          <h2>Coming up</h2>
          <ul className="req-list">
            {upcoming.slice(0, 20).map((ev) => (
              <li key={ev.id} className="roster-row">
                <span className={`dot ${TYPE_TONE[ev.type] || 'other'}`} />
                <span>
                  <strong>{ev.title || ev.type || 'Event'}</strong>
                  <span className="muted small">
                    {' · '}{formatWhen(toMillis(ev.date))}
                    {ev.label ? ` · ${ev.label}` : ''}
                    {ev.location ? ` · ${ev.location}` : ''}
                  </span>
                  {ev.notes ? <div className="small muted">{ev.notes}</div> : null}

                  {ev.athletes.length > 0 && (
                    <div className="rsvp">
                      {ev.athletes.map((a) => {
                        const key = `${ev.id}:${a.id}`;
                        const current = rsvps[key];
                        return (
                          <div className="rsvp-row" key={a.id}>
                            <span className="muted small">{displayName(a)}</span>
                            {RSVP_CHOICES.map((c) => (
                              <button
                                key={c.value}
                                type="button"
                                className={current === c.value ? 'choice on' : 'choice'}
                                disabled={saving === key}
                                onClick={() => answer(ev.id, a.id, c.value)}
                              >
                                {c.label}
                              </button>
                            ))}
                          </div>
                        );
                      })}
                    </div>
                  )}

                  <span className="small">
                    <Link href={`/team?id=${ev.teamId}`}>Open team</Link>
                    {canManage && (
                      <>
                        {' · '}
                        <Link href={`/event?team=${ev.teamId}&id=${ev.id}`}>Attendance</Link>
                      </>
                    )}
                  </span>
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}

      {past.length > 0 && (
        <section className="card">
          <h2>Recently</h2>
          <ul className="req-list">
            {past.slice(0, 10).map((ev) => (
              <li key={ev.id} className="roster-row">
                <span className={`dot ${TYPE_TONE[ev.type] || 'other'}`} />
                <span>
                  <span>{ev.title || ev.type || 'Event'}</span>
                  <span className="muted small">
                    {' · '}{formatWhen(toMillis(ev.date))}
                    {ev.label ? ` · ${ev.label}` : ''}
                  </span>
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}
    </AppShell>
  );
}
