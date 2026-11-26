import { useEffect, useState } from 'react';
import Link from 'next/link';
import { collection, getDocs, query, where } from 'firebase/firestore';
import { db } from '../lib/firebase';
import { useAuth } from './index';
import AppShell from '../components/AppShell';

/// Firestore timestamps arrive as `{seconds, nanoseconds}`, but a report written by the
/// Cloud Function may still be a pending serverTimestamp — treat anything unreadable as 0
/// so the sort never throws on the page that shows moderation problems.
const stamp = (value) =>
  value && typeof value === 'object' && 'seconds' in value
    ? Number(value.seconds) * 1000
    : Number(value) || 0;

/// Moderation reports, inside the console frame.
///
/// This page used to render a bare `<main>`, which meant an AD who arrived from the rail
/// lost the rail: no way back to teams, no sign-out, only the browser's back button.
/// Every console screen belongs in AppShell for that reason, and the queue is read per
/// team because the rules authorise a report through the team it belongs to.
export default function Reports() {
  const { loading, user, profile } = useAuth();
  const [reports, setReports] = useState([]);
  const [error, setError] = useState('');

  useEffect(() => {
    if (profile?.role !== 'ad' || !profile?.schoolId) return;
    let alive = true;
    (async () => {
      try {
        const teamsSnap = await getDocs(
          query(collection(db, 'teams'), where('schoolId', '==', profile.schoolId))
        );
        // Per team, never one collection-wide query. The rule authorises a report with
        // `isAdOf(teamSchool(resource.data.teamId))`, and Firestore can only evaluate that
        // for a query which pins `teamId`. An unfiltered `reports` query is refused
        // outright, which is why this page used to answer "Missing or insufficient
        // permissions" instead of a queue.
        const rows = [];
        for (const team of teamsSnap.docs) {
          const snap = await getDocs(
            query(collection(db, 'reports'), where('teamId', '==', team.id))
          );
          snap.docs.forEach((d) => rows.push({ id: d.id, ...d.data() }));
        }
        // Sorted here, not with orderBy: a teamId + createdAt index would be a second
        // deployment step for a queue that is a handful of rows.
        rows.sort((a, b) => stamp(b.createdAt) - stamp(a.createdAt));
        if (alive) setReports(rows);
      } catch (err) {
        if (alive) setError(err?.message || 'Could not load reports.');
      }
    })();
    return () => { alive = false; };
  }, [profile?.role, profile?.schoolId]);

  if (loading) return <main className="page"><p>Loading…</p></main>;
  if (profile?.role !== 'ad') {
    return (
      <main className="page">
        <p className="muted">
          AD access required. <Link href="/">Go to sign in</Link>.
        </p>
      </main>
    );
  }

  return (
    <AppShell title="Moderation reports" profile={profile} user={user}>
      <h1>Moderation reports</h1>
      {error && <p className="error">{error}</p>}
      {!error && reports.length === 0 && <p className="muted">Nothing reported.</p>}
      <ul className="card">
        {reports.map((r) => (
          <li key={r.id} className="report">
            <strong>{r.reason}</strong>
            <span className="muted small"> · {r.contentType} · {r.status}</span>
            <p>{r.note || '(no excerpt)'}</p>
            <p className="muted small">Reported by {r.reportedByName || r.reportedBy}</p>
          </li>
        ))}
      </ul>
    </AppShell>
  );
}
