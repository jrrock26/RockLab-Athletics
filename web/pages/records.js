import { useEffect, useState } from 'react';
import { httpsCallable } from 'firebase/functions';
import Link from 'next/link';
import { functions } from '../lib/firebase';
import { useAuth } from './index';

function parseStats(text) {
  const out = {};
  text.split(/[,\n]/).forEach((pair) => {
    const [k, v] = pair.split(':');
    if (!k || v === undefined) return;
    const key = k.trim();
    const num = Number(v.trim());
    if (key && Number.isFinite(num) && num !== 0) out[key] = num;
  });
  return out;
}

export default function Records() {
  const { loading, user, profile } = useAuth();

  const [watch, setWatch] = useState(null);
  const [watchError, setWatchError] = useState('');
  const [busy, setBusy] = useState(false);

  const [rSport, setRSport] = useState('');
  const [rStat, setRStat] = useState('');
  const [rValue, setRValue] = useState('');
  const [rHolder, setRHolder] = useState('');
  const [rSeason, setRSeason] = useState('');
  const [recordMsg, setRecordMsg] = useState('');

  const [hName, setHName] = useState('');
  const [hSport, setHSport] = useState('');
  const [hSeason, setHSeason] = useState('');
  const [hStats, setHStats] = useState('');
  const [historyMsg, setHistoryMsg] = useState('');

  async function loadWatch() {
    setWatchError('');
    try {
      const res = await httpsCallable(functions, 'recordProximity')({
        schoolId: profile.schoolId,
        within: 0.15,
      });
      setWatch(res.data);
    } catch (err) {
      setWatchError(err.message);
    }
  }

  useEffect(() => {
    if (profile?.schoolId) loadWatch();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [profile?.schoolId]);

  async function saveRecord() {
    setBusy(true);
    setRecordMsg('');
    try {
      await httpsCallable(functions, 'setSchoolRecord')({
        sportId: rSport.trim(),
        statKey: rStat.trim(),
        value: Number(rValue),
        holderName: rHolder.trim(),
        season: rSeason.trim(),
      });
      setRecordMsg('Record saved.');
      setRSport(''); setRStat(''); setRValue(''); setRHolder(''); setRSeason('');
      await loadWatch();
    } catch (err) {
      setRecordMsg(err.message);
    } finally {
      setBusy(false);
    }
  }

  async function saveHistory() {
    setBusy(true);
    setHistoryMsg('');
    try {
      const stats = parseStats(hStats);
      if (Object.keys(stats).length === 0) {
        throw new Error('Enter at least one stat as key: value, e.g. points: 412');
      }
      await httpsCallable(functions, 'addCareerStatLine')({
        athleteName: hName.trim(),
        sportId: hSport.trim(),
        season: hSeason.trim(),
        stats,
      });
      setHistoryMsg('Historical stats added.');
      setHName(''); setHSport(''); setHSeason(''); setHStats('');
      await loadWatch();
    } catch (err) {
      setHistoryMsg(err.message);
    } finally {
      setBusy(false);
    }
  }

  if (loading) return <main className="page"><p>Loading…</p></main>;
  if (!user || profile?.role !== 'ad') {
    return (
      <main className="page">
        <p>Sign in as an athletic director to manage records.</p>
        <Link href="/">Go to sign in</Link>
      </main>
    );
  }

  return (
    <main className="page">
      <h1>Records &amp; career stats</h1>
      <p className="muted small">
        Career totals come only from stats a coach or staff member verified after
        the game, plus historical entries you add here.
      </p>

      <section className="card">
        <h2>Record watch</h2>
        {watchError && <p className="error">{watchError}</p>}
        {!watch && !watchError && <p className="muted">Loading…</p>}
        {watch && watch.records.length === 0 && (
          <p className="muted">No school records set yet. Add one below.</p>
        )}
        {watch && watch.records.map((r) => (
          <div key={`${r.sportId}-${r.statKey}`} className="report">
            <strong>{r.sportId} · {r.statKey}</strong>
            <span className="muted small">
              {' '}— {r.recordValue} by {r.holderName}
              {r.season ? ` (${r.season})` : ''}
            </span>

            {r.broken.length > 0 && (
              <p className="ok">
                Record broken: {r.broken.map((b) => `${b.athleteName} (${b.total})`).join(', ')}
              </p>
            )}
            {r.chasing.length > 0 ? (
              <ul>
                {r.chasing.map((c) => (
                  <li key={c.athleteKey}>
                    {c.athleteName} — needs <strong>{c.remaining}</strong> more
                    {' '}({c.total} of {r.recordValue})
                  </li>
                ))}
              </ul>
            ) : r.broken.length === 0 ? (
              <p className="muted small">Nobody within 15% yet.</p>
            ) : null}
          </div>
        ))}
        {watch && (
          <p className="muted small">{watch.athletesTracked} athlete(s) with verified stats.</p>
        )}
      </section>

      <section className="card">
        <h2>Set a school record</h2>
        <label>Sport <input value={rSport} onChange={(e) => setRSport(e.target.value)} placeholder="basketball" /></label>
        <label>Stat <input value={rStat} onChange={(e) => setRStat(e.target.value)} placeholder="points" /></label>
        <label>Record value <input value={rValue} onChange={(e) => setRValue(e.target.value)} placeholder="1845" /></label>
        <label>Holder <input value={rHolder} onChange={(e) => setRHolder(e.target.value)} placeholder="Jordan Smith" /></label>
        <label>Season <input value={rSeason} onChange={(e) => setRSeason(e.target.value)} placeholder="2019-20" /></label>
        <button onClick={saveRecord} disabled={busy || !rSport || !rStat || !rValue || !rHolder}>
          {busy ? 'Saving…' : 'Save record'}
        </button>
        {recordMsg && <p className={recordMsg === 'Record saved.' ? 'ok' : 'error'}>{recordMsg}</p>}
      </section>

      <section className="card">
        <h2>Add historical career stats</h2>
        <p className="muted small">
          For athletes whose earlier seasons predate the app. These merge into their
          career totals.
        </p>
        <label>Athlete name <input value={hName} onChange={(e) => setHName(e.target.value)} placeholder="Jordan Smith" /></label>
        <label>Sport <input value={hSport} onChange={(e) => setHSport(e.target.value)} placeholder="basketball" /></label>
        <label>Season <input value={hSeason} onChange={(e) => setHSeason(e.target.value)} placeholder="2023-24" /></label>
        <label>
          Stats
          <textarea
            rows={4}
            value={hStats}
            onChange={(e) => setHStats(e.target.value)}
            placeholder="points: 412, rebounds: 180, assists: 96"
          />
        </label>
        <button onClick={saveHistory} disabled={busy || !hName || !hSport || !hStats}>
          {busy ? 'Saving…' : 'Add historical stats'}
        </button>
        {historyMsg && <p className={historyMsg === 'Historical stats added.' ? 'ok' : 'error'}>{historyMsg}</p>}
      </section>

      <p className="muted"><Link href="/dashboard">Back to dashboard</Link></p>
    </main>
  );
}

