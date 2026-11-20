import { useEffect, useState } from 'react';
import { collection, getDocs, query, where } from 'firebase/firestore';
import { httpsCallable } from 'firebase/functions';
import { db, functions } from '../lib/firebase';
import { useAuth } from './index';
import Link from 'next/link';

export default function Dashboard() {
  const { loading, user, profile } = useAuth();
  const [teams, setTeams] = useState([]);
  const [entitlement, setEntitlement] = useState(null);

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
    <main className="page">
      <h1>{profile.schoolName || 'Your school'}</h1>
      <p className="muted">
        Plan: <strong>{entitlement?.plan || 'free'}</strong>
        {entitlement && ` · ${teams.length}/${entitlement.limits.teams} teams`}
      </p>

      <nav className="row">
        <Link className="card link-card" href="/import">Import roster &amp; invite parents</Link>
        <Link className="card link-card" href="/reports">Reports</Link>
      </nav>

      <section className="card">
        <h2>Teams</h2>
        {teams.length === 0 && <p className="muted">No teams yet. Coaches who start a team will show up here.</p>}
        <ul>
          {teams.map((t) => (
            <li key={t.id}>
              <strong>{t.sportName} {t.level}</strong>
              <span className="muted"> · {t.season} {t.gender}</span>
            </li>
          ))}
        </ul>
      </section>
    </main>
  );
}
