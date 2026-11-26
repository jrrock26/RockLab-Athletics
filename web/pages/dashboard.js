import { useEffect, useState } from 'react';
import { collection, onSnapshot, query, where } from 'firebase/firestore';
import { httpsCallable } from 'firebase/functions';
import { db, functions } from '../lib/firebase';
import { useAuth } from './index';
import AppShell from '../components/AppShell';
import AddTeam from '../components/AddTeam';
import DashboardSummary from '../components/DashboardSummary';
import SchoolLogo from '../components/SchoolLogo';
import Link from 'next/link';

export default function Dashboard() {
  const { loading, user, profile } = useAuth();
  const [teams, setTeams] = useState([]);
  const [schoolName, setSchoolName] = useState('');
  const [teamsError, setTeamsError] = useState('');
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

  // Live teams, like the team page. A one-shot read here meant a team a coach had just
  // started stayed invisible to the AD until they reloaded, and two people looking at
  // "the teams" saw different lists.
  useEffect(() => {
    if (!profile?.schoolId) return;
    const unsub = onSnapshot(
      query(collection(db, 'teams'), where('schoolId', '==', profile.schoolId)),
      (snap) => {
        setTeams(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
        setTeamsError('');
      },
      (err) => setTeamsError(err?.message || 'Could not load teams.'),
    );
    return () => unsub();
  }, [profile?.schoolId]);

  // Entitlement is a callable, not a document, so it is fetched once per school rather
  // than listened to. A failed lookup leaves the plan line off the page, not broken.
  useEffect(() => {
    if (!profile?.schoolId) return;
    let alive = true;
    httpsCallable(functions, 'getEntitlement')()
      .then((res) => { if (alive) setEntitlement(res.data); })
      .catch(() => { if (alive) setEntitlement(null); });
    return () => { alive = false; };
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
    <AppShell title={schoolName || profile.schoolName || 'Your school'} profile={profile} user={user}>
      <DashboardSummary
        schoolId={profile.schoolId}
        teams={teams}
        profile={profile}
        onSchool={(data) => setSchoolName((data && data.name) || '')}
      />

      <p className="muted small">
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

      {profile.role === 'ad' && profile.schoolId && <SchoolLogo schoolId={profile.schoolId} />}

      <section className="card">
        <h2>Teams</h2>
        {teamsError && <p className="error">{teamsError}</p>}
        {teams.length === 0 && <p className="muted">No teams yet. Coaches who start a team will show up here.</p>}
        <ul className="team-grid">
          {teams.map((t) => (
            <li key={t.id}>
              <Link className="team-card" href={`/team?id=${t.id}`}>
                <strong>{t.sportName} {t.level}</strong>
                <span className="muted"> · {t.season} {t.gender}</span>
                <span className="small accent">Open team →</span>
              </Link>
            </li>
          ))}
        </ul>
        {teams.length === 0 && (
          <p className="small muted">Start the first team below — a roster needs a team to belong to.</p>
        )}
      </section>

      {/* No onCreated: the teams listener picks the new team up on its own. */}
      <AddTeam schoolId={profile.schoolId} />
    </AppShell>
  );
}
