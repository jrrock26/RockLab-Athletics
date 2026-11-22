import { useEffect, useState } from 'react';
import { collection, getDocs, query, where } from 'firebase/firestore';
import { httpsCallable } from 'firebase/functions';
import { db, functions } from '../lib/firebase';
import { useAuth } from './index';
import AppShell from '../components/AppShell';
import Link from 'next/link';

export default function Dashboard() {
  const { loading, user, profile } = useAuth();
  const [teams, setTeams] = useState([]);
  const [entitlement, setEntitlement] = useState(null);
  const [exporting, setExporting] = useState(false);
  const [exportError, setExportError] = useState('');

  async function exportData() {
    setExporting(true);
    setExportError('');
    try {
      const res = await httpsCallable(functions, 'exportSchoolData')({
        schoolId: profile.schoolId,
      });
      const blob = new Blob([JSON.stringify(res.data, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `rocklab-export-${new Date().toISOString().slice(0, 10)}.json`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      setExportError(err.message);
    } finally {
      setExporting(false);
    }
  }

  useEffect(() => {
    if (!profile?.schoolId) return;
    (async () => {
      const snap = await getDocs(
        query(collection(db, 'teams'), where('schoolId', '==', profile.schoolId))
      );
      setTeams(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
      try {
        const res = await httpsCallable(functions, 'getEntitlement')();
        setEntitlement(res.data);
      } catch (e) {
        setEntitlement(null);
      }
    })();
  }, [profile?.schoolId]);

  if (loading) return <main className="page"><p>Loading…</p></main>;
  if (!user || profile?.role !== 'ad') {
    return (
      <main className="page">
        <p>Sign in as an athletic director to use this console.</p>
        <Link href="/">Go to sign in</Link>
      </main>
    );
  }

  return (
    <AppShell title={profile.schoolName || 'Your school'} profile={profile} user={user}>
      <h1>{profile.schoolName || 'Your school'}</h1>
      <p className="muted">
        Plan: <strong>{entitlement?.plan || 'free'}</strong>
        {entitlement && ` · ${teams.length}/${entitlement.limits.teams} teams`}
      </p>

      <nav className="row">
        <Link className="card link-card" href="/import">Import roster &amp; invite parents</Link>
        <Link className="card link-card" href="/reports">Reports</Link>
        <Link className="card link-card" href="/audit">Audit log</Link>
        <Link className="card link-card" href="/records">Records &amp; career stats</Link>
        <button className="card link-card" onClick={exportData} disabled={exporting}>
          {exporting ? 'Preparing export…' : 'Export school data'}
        </button>
      </nav>
      {exportError && <p className="error">{exportError}</p>}

      <section className="card">
        <h2>Teams</h2>
        {teams.length === 0 && <p className="muted">No teams yet. Coaches who start a team will show up here.</p>}
        <ul className="team-grid">
          {teams.map((t) => (
            <li key={t.id}>
              <Link className="team-card" href={`/team/${t.id}`}>
                <strong>{t.sportName} {t.level}</strong>
                <span className="muted"> · {t.season} {t.gender}</span>
                <span className="small accent">Open team →</span>
              </Link>
            </li>
          ))}
        </ul>
      </section>
    </AppShell>
  );
}
