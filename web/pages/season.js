import { useEffect, useState } from 'react';
import { useRouter } from 'next/router';
import Link from 'next/link';
import { collection, doc, getDoc, getDocs, query, where } from 'firebase/firestore';
import { db } from '../lib/firebase';
import { useAuth } from './index';
import AppShell from '../components/AppShell';

/// One season, opened from /seasons.
///
/// `?id=` and not /season/[id]: this site is a static export, and a dynamic route with no
/// getStaticPaths has no file to serve, which is the bug that made team pages look like
/// they needed a refresh.
///
/// A season shows the teams stamped with its id and the roster entries stamped with its
/// id. Today nothing carries a seasonId, so this page will report zero of both -- and it
/// says why instead of looking broken. The moment the stamping migration lands, this view
/// becomes real without another line of UI.
export default function SeasonPage() {
  const router = useRouter();
  const id = router.query.id;
  const { loading: authLoading, user, profile } = useAuth();
  const [season, setSeason] = useState(null);
  const [teams, setTeams] = useState([]);
  const [entries, setEntries] = useState({ active: 0, archived: 0 });
  const [loading, setLoading] = useState(true);
  const [missing, setMissing] = useState(false);

  const schoolId = profile?.schoolId;

  useEffect(() => {
    if (!id || !schoolId || authLoading || !user) return;
    let alive = true;
    (async () => {
      try {
        const snap = await getDoc(doc(db, 'schools', schoolId, 'seasons', id));
        if (!alive) return;
        if (!snap.exists()) { setMissing(true); setLoading(false); return; }
        setSeason({ id: snap.id, ...snap.data() });

        const all = await getDocs(query(collection(db, 'teams'), where('schoolId', '==', schoolId)))
          .catch(() => null);
        const stamped = (all?.docs || [])
          .map((d) => ({ id: d.id, ...d.data() }))
          .filter((t) => t.seasonId === id);

        let active = 0;
        let archived = 0;
        for (const t of stamped) {
          const r = await getDocs(query(
            collection(db, 'teams', t.id, 'roster'),
            where('seasonId', '==', id),
          )).catch(() => null);
          (r?.docs || []).forEach((d) => {
            if (d.data().state === 'archived') archived += 1; else active += 1;
          });
        }
        if (!alive) return;
        setTeams(stamped);
        setEntries({ active, archived });
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => { alive = false; };
  }, [id, schoolId, authLoading, user]);

  if (authLoading || loading) return <main className="page"><p>Loading…</p></main>;
  if (!user) return <main className="page"><p className="muted"><Link href="/">Sign in</Link> first.</p></main>;

  return (
    <AppShell title={season?.name || 'Season'} profile={profile} user={user}>
      <p className="small muted"><Link href="/seasons">← All seasons</Link></p>

      {missing && <p className="error">That season does not exist.</p>}

      {season && (
        <>
          <h1>{season.name || season.id}</h1>
          <p className="muted">
            <span className={season.state === 'closed' ? 'pill' : 'pill warn'}>{season.state}</span>
            {season.startsAt?.toDate ? ` · ${season.startsAt.toDate().toLocaleDateString()}` : ''}
            {season.endsAt?.toDate ? ` – ${season.endsAt.toDate().toLocaleDateString()}` : ''}
          </p>

          <div className="stat-row">
            <div className="stat-card">
              <strong>{teams.length}</strong>
              <span className="small muted">teams in this season</span>
            </div>
            <div className="stat-card">
              <strong>{entries.active}</strong>
              <span className="small muted">active roster entries</span>
            </div>
            <div className="stat-card">
              <strong>{entries.archived}</strong>
              <span className="small muted">archived entries</span>
            </div>
          </div>

          {teams.length === 0 ? (
            <section className="card">
              <h2>Nothing stamped yet</h2>
              <p className="muted small">
                No team carries this season&apos;s id. Teams and roster entries start
                carrying a season once the stamping migration runs; until then every season
                opens empty, including a closed one.
              </p>
              <p className="muted small">
                This is expected, not a fault. Archiving a season that has nothing stamped
                archives nothing.
              </p>
            </section>
          ) : (
            <section className="card">
              <h2>Teams</h2>
              <ul className="req-list">
                {teams.map((t) => (
                  <li key={t.id}>
                    <Link className="team-card" href={`/team?id=${t.id}`}>
                      <strong>
                        {[t.gender, t.level, t.sportName].filter(Boolean).join(' · ')}
                      </strong>
                      <span className="small accent">Open team →</span>
                    </Link>
                  </li>
                ))}
              </ul>
            </section>
          )}
        </>
      )}
    </AppShell>
  );
}
