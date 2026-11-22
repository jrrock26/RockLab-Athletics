import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { collection, doc, getDoc, getDocs, limit, query } from 'firebase/firestore';
import { db } from '../lib/firebase';
import { useAuth } from './index';
import AppShell from '../components/AppShell';

/// The athletic-director directory.
///
/// This is the one organization read that needs no cleverness: `schools` is
/// `allow read: if signedIn()`, so a real list query works for anyone. Each school names
/// its AD by `adUserId`; the AD's own user document is a DIRECT get, because `users` is
/// self-or-AD and a list query there would be refused.
///
/// Search covers what the field actually holds -- name, district, zip -- rather than an
/// address or city that the model does not have.
export default function Directory() {
  const { loading: authLoading, user, profile } = useAuth();
  const [schools, setSchools] = useState([]);
  const [adBySchool, setAdBySchool] = useState({});
  const [term, setTerm] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    if (authLoading || !user) return;
    let alive = true;
    (async () => {
      try {
        const snap = await getDocs(query(collection(db, 'schools'), limit(300)));
        const list = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
        if (!alive) return;
        setSchools(list);
        setLoading(false);

        // Direct gets only: one per school, resolved after the list renders so the
        // directory is usable even if some of these are refused.
        const entries = await Promise.all(list.map(async (s) => {
          if (!s.adUserId) return [s.id, null];
          const u = await getDoc(doc(db, 'users', s.adUserId)).catch(() => null);
          if (!u || !u.exists()) return [s.id, null];
          const d = u.data();
          return [s.id, { name: d.name || '', email: d.email || '' }];
        }));
        if (!alive) return;
        setAdBySchool(Object.fromEntries(entries));
      } catch (err) {
        if (alive) { setError(err?.message || 'Could not load the directory.'); setLoading(false); }
      }
    })();
    return () => { alive = false; };
  }, [authLoading, user]);

  const shown = useMemo(() => {
    const t = term.trim().toLowerCase();
    if (!t) return schools;
    return schools.filter((s) =>
      [s.name, s.district, s.zipCode, s.mascot]
        .filter(Boolean)
        .some((v) => String(v).toLowerCase().includes(t)),
    );
  }, [schools, term]);

  if (authLoading) return <main className="page"><p>Loading…</p></main>;
  if (!user) return <main className="page"><p className="muted"><Link href="/">Sign in</Link> first.</p></main>;

  return (
    <AppShell title="Directory" profile={profile} user={user}>
      <h1>AD directory</h1>
      <p className="muted small">
        Find a school by name, district, or zip and reach its athletic director.
      </p>

      <label className="search">
        <input
          type="search"
          value={term}
          onChange={(e) => setTerm(e.target.value)}
          placeholder="School, district, or zip"
          autoComplete="off"
        />
      </label>

      {error && <p className="error">{error}</p>}
      {loading && <p className="muted">Loading…</p>}
      {!loading && shown.length === 0 && (
        <section className="card">
          <p className="muted">
            {schools.length === 0
              ? 'No schools registered yet.'
              : 'Nothing matches that. Try a shorter search.'}
          </p>
        </section>
      )}

      <ul className="req-list">
        {shown.map((s) => {
          const ad = adBySchool[s.id];
          return (
            <li key={s.id} className="school-row">
              <span className="avatar">{String(s.name || '?').slice(0, 1).toUpperCase()}</span>
              <span className="school-main">
                <strong>{s.name || 'Unnamed school'}</strong>
                <span className="muted small">
                  {s.mascot ? ` · ${s.mascot}` : ''}
                  {s.district ? ` · ${s.district}` : ''}
                  {s.zipCode ? ` · ${s.zipCode}` : ''}
                </span>
                <br />
                <span className="small muted">
                  {ad?.name ? `AD: ${ad.name}` : 'Athletic director not listed'}
                  {ad?.email ? ` · ${ad.email}` : ''}
                </span>
              </span>
              {ad?.email && (
                <a className="link" href={`mailto:${ad.email}`}>Email</a>
              )}
            </li>
          );
        })}
      </ul>

      <p className="muted small">
        Messaging inside the app is not on the web yet — it needs a conversation model the
        backend does not have. Email is the reliable route today.
      </p>
    </AppShell>
  );
}
