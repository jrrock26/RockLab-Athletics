import { useEffect, useState } from 'react';
import { collection, getDocs, orderBy, query, where } from 'firebase/firestore';
import { db } from '../lib/firebase';
import { useAuth } from './index';

export default function Reports() {
  const { loading, profile } = useAuth();
  const [reports, setReports] = useState([]);
  const [error, setError] = useState('');

  useEffect(() => {
    if (profile?.role !== 'ad' || !profile?.schoolId) return;
    (async () => {
      try {
        // School-scoped: filter to teams in this school, newest first.
        const teamsSnap = await getDocs(
          query(collection(db, 'teams'), where('schoolId', '==', profile.schoolId))
        );
        const teamIds = new Set(teamsSnap.docs.map((d) => d.id));
        const snap = await getDocs(query(collection(db, 'reports'), orderBy('createdAt', 'desc')));
        setReports(
          snap.docs
            .map((d) => ({ id: d.id, ...d.data() }))
            .filter((r) => teamIds.has(r.teamId))
        );
      } catch (err) {
        setError(err.message);
      }
    })();
  }, [profile?.role, profile?.schoolId]);

  if (loading) return <main className="page"><p>Loading…</p></main>;
  if (profile?.role !== 'ad') return <main className="page"><p>AD access required.</p></main>;

  return (
    <main className="page">
      <h1>Moderation reports</h1>
      {error && <p className="error">{error}</p>}
      {reports.length === 0 && <p className="muted">Nothing reported. </p>}
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
    </main>
  );
}
