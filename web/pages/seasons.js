import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { collection, getDocs } from 'firebase/firestore';
import { httpsCallable } from 'firebase/functions';
import { db, functions } from '../lib/firebase';
import { useAuth } from './index';
import AppShell from '../components/AppShell';

/// Seasons.
///
/// Closing a season is the operation that makes it a season: it archives every roster
/// entry stamped to it, and never deletes one, because stats, injuries, submissions and
/// RSVPs point at those documents. Both writes are callables -- seasons/{id} is
/// `allow write: if false`, so this page cannot write directly and does not try.
export default function Seasons() {
  const { loading: authLoading, user, profile } = useAuth();
  const [seasons, setSeasons] = useState([]);
  const [year, setYear] = useState(new Date().getFullYear());
  const [term, setTerm] = useState('fall');
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  const isAd = profile?.role === 'ad';
  const schoolId = profile?.schoolId;

  const load = useCallback(async () => {
    if (!schoolId) return;
    const snap = await getDocs(collection(db, 'schools', schoolId, 'seasons')).catch(() => null);
    const list = (snap?.docs || []).map((d) => ({ id: d.id, ...d.data() }));
    list.sort((a, b) => (b.year - a.year) || String(a.term).localeCompare(String(b.term)));
    setSeasons(list);
  }, [schoolId]);

  useEffect(() => {
    if (authLoading || !user || !isAd) return;
    load();
  }, [authLoading, user, isAd, load]);

  async function create() {
    setBusy('create');
    setError('');
    setNotice('');
    try {
      await httpsCallable(functions, 'createSeason')({ schoolId, year: Number(year), term });
      setNotice(`Season created.`);
      await load();
    } catch (err) {
      setError(err?.message || 'That season could not be created.');
    } finally {
      setBusy('');
    }
  }

  async function close(season) {
    const ok = window.confirm(
      `Close ${season.name}?\n\nEvery roster entry stamped to it is archived. Nothing is `
      + `deleted, but those athletes will no longer appear on an active roster.`,
    );
    if (!ok) return;
    setBusy(season.id);
    setError('');
    setNotice('');
    try {
      const res = await httpsCallable(functions, 'closeSeason')({ schoolId, seasonId: season.id });
      setNotice(
        res.data?.alreadyClosed
          ? 'That season was already closed.'
          : `Closed. ${res.data?.archived ?? 0} roster entries archived.`,
      );
      await load();
    } catch (err) {
      setError(err?.message || 'That season could not be closed.');
    } finally {
      setBusy('');
    }
  }

  async function reopen(season) {
    const ok = window.confirm(
      `Reopen ${season.name}?\n\nEntries this season archived go back on the active roster. `
      + `Nothing was deleted, so this is a restore rather than a re-import.`,
    );
    if (!ok) return;
    setBusy(season.id);
    setError('');
    setNotice('');
    try {
      const res = await httpsCallable(functions, 'reopenSeason')({ schoolId, seasonId: season.id });
      setNotice(
        res.data?.alreadyOpen
          ? 'That season is already open.'
          : `Reopened. ${res.data?.restored ?? 0} roster entries restored.`,
      );
      await load();
    } catch (err) {
      setError(err?.message || 'That season could not be reopened.');
    } finally {
      setBusy('');
    }
  }

  if (authLoading) return <main className="page"><p>Loading…</p></main>;
  if (!user) return <main className="page"><p className="muted"><Link href="/">Sign in</Link> first.</p></main>;

  return (
    <AppShell title="Seasons" profile={profile} user={user}>
      <h1>Seasons</h1>
      <p className="muted small">
        A season is what makes last year answerable. Closing one archives its rosters; it
        never deletes them, because career stats live on those entries.
      </p>

      {!isAd && <p className="error">Only an athletic director manages seasons.</p>}
      {notice && <p className="notice">{notice}</p>}
      {error && <p className="error">{error}</p>}

      {isAd && (
        <section className="card">
          <h2>Open a season</h2>
          <div className="form-grid">
            <label>
              Year
              <input type="number" value={year} min={2000} max={2100}
                onChange={(e) => setYear(e.target.value)} />
            </label>
            <label>
              Term
              <select value={term} onChange={(e) => setTerm(e.target.value)}>
                <option value="fall">Fall</option>
                <option value="winter">Winter</option>
                <option value="spring">Spring</option>
              </select>
            </label>
          </div>
          <button type="button" onClick={create} disabled={busy === 'create' || !schoolId}>
            {busy === 'create' ? 'Creating…' : `Open ${term} ${year}`}
          </button>
        </section>
      )}

      <section className="card">
        <h2>All seasons</h2>
        {seasons.length === 0 && <p className="muted">No seasons yet.</p>}
        <ul className="req-list">
          {seasons.map((s) => (
            <li key={s.id} className="roster-row">
              <span className={s.state === 'closed' ? 'pill' : 'pill warn'}>{s.state}</span>
              <span>
                <Link href={`/season?id=${s.id}`}><strong>{s.name || s.id}</strong></Link>
                {s.startsAt?.toDate ? (
                  <span className="muted small">
                    {' · '}
                    {s.startsAt.toDate().toLocaleDateString()}
                    {s.endsAt?.toDate ? ` – ${s.endsAt.toDate().toLocaleDateString()}` : ''}
                  </span>
                ) : null}
              </span>
              {isAd && s.state !== 'closed' && (
                <button type="button" className="link" onClick={() => close(s)} disabled={busy === s.id}>
                  {busy === s.id ? 'Closing…' : 'Close season'}
                </button>
              )}
              {isAd && s.state === 'closed' && (
                <button type="button" className="link" onClick={() => reopen(s)} disabled={busy === s.id}>
                  {busy === s.id ? 'Reopening…' : 'Reopen season'}
                </button>
              )}
            </li>
          ))}
        </ul>
      </section>

      <p className="small muted">
        Closing a season archives the roster entries stamped to it and reopening restores
        them. Nothing is ever deleted, which is why a close can be undone.
      </p>
    </AppShell>
  );
}
