import { useEffect, useMemo, useState } from 'react';
import { addDoc, collection, deleteDoc, doc, getDocs, setDoc } from 'firebase/firestore';
import { db } from '../lib/firebase';
import { useAuth } from './index';
import AppShell from '../components/AppShell';
import {
  SPORT_RECORDS,
  SPORT_LABELS,
  LEVELS,
  buildStatList,
  sortRecords,
  bestRecord,
  formatRecordValue,
  filterRecords,
  validateRecord,
  recordDoc,
  customStatDoc,
} from '../lib/records';

/// The school record book.
///
/// Two collections, both under the school:
///
///   schools/{id}/records/{recordId}      one mark: who, what, how much, which year
///   schools/{id}/recordStats/{statKey}   a stat this school invented
///
/// The default stats are code (lib/records.js), not data, so the book is usable the first
/// time this page loads and needs no seeding. Custom stats are stored because they are the
/// school's own invention and must survive a deploy.
///
/// Ordering happens in the browser deliberately: Firestore cannot sort "best" when best
/// means down for a golf round and up for points, and a record book is tens of rows.
export default function Records() {
  const { loading, user, profile } = useAuth();
  const schoolId = profile?.schoolId || '';
  const canWrite = Boolean(user) && ['ad', 'coach', 'staff'].includes(profile?.role);

  const [records, setRecords] = useState([]);
  const [customStats, setCustomStats] = useState([]);
  const [loadError, setLoadError] = useState('');
  const [busy, setBusy] = useState('');

  // Filters
  const [fSport, setFSport] = useState('');
  const [fStat, setFStat] = useState('');
  const [fLevel, setFLevel] = useState('');
  const [fQuery, setFQuery] = useState('');

  // Add-record form
  const [sport, setSport] = useState('basketball');
  const [statKey, setStatKey] = useState('');
  const [value, setValue] = useState('');
  const [playerName, setPlayerName] = useState('');
  const [gradYear, setGradYear] = useState('');
  const [season, setSeason] = useState('');
  const [level, setLevel] = useState('Varsity');
  const [note, setNote] = useState('');
  const [formError, setFormError] = useState('');
  const [notice, setNotice] = useState('');

  // "Add a stat that isn't listed"
  const [showNewStat, setShowNewStat] = useState(false);
  const [newLabel, setNewLabel] = useState('');
  const [newUnit, setNewUnit] = useState('count');
  const [newDirection, setNewDirection] = useState('high');

  useEffect(() => {
    if (!schoolId) return;
    let alive = true;
    (async () => {
      try {
        const [r, s] = await Promise.all([
          getDocs(collection(db, 'schools', schoolId, 'records')),
          getDocs(collection(db, 'schools', schoolId, 'recordStats')).catch(() => null),
        ]);
        if (!alive) return;
        setRecords(r.docs.map((d) => ({ id: d.id, ...d.data() })));
        setCustomStats((s?.docs || []).map((d) => ({ key: d.id, ...d.data() })));
      } catch (err) {
        if (alive) setLoadError(err?.message || 'Could not load the record book.');
      }
    })();
    return () => { alive = false; };
  }, [schoolId]);

  const addStatOptions = useMemo(() => buildStatList(sport, customStats), [sport, customStats]);
  const filterStatOptions = useMemo(() => buildStatList(fSport, customStats), [fSport, customStats]);

  /// Groups the filtered records by sport + stat, each group sorted best-first.
  const groups = useMemo(() => {
    const filtered = filterRecords(records, {
      sportId: fSport || undefined,
      statKey: fStat || undefined,
      level: fLevel || undefined,
      query: fQuery,
    });
    const byKey = new Map();
    filtered.forEach((r) => {
      const key = `${r.sportId}:${r.statKey}`;
      if (!byKey.has(key)) byKey.set(key, []);
      byKey.get(key).push(r);
    });
    return [...byKey.values()]
      .map((list) => {
        const first = list[0];
        const direction = first.direction === 'low' ? 'low' : 'high';
        return {
          key: `${first.sportId}:${first.statKey}`,
          sportId: first.sportId,
          label: first.statLabel || first.statKey,
          unit: first.unit || 'count',
          direction,
          best: bestRecord(list, direction),
          sorted: sortRecords(list, direction),
        };
      })
      .sort((a, b) => {
        const sportDiff = String(SPORT_LABELS[a.sportId] || a.sportId)
          .localeCompare(String(SPORT_LABELS[b.sportId] || b.sportId));
        return sportDiff !== 0 ? sportDiff : String(a.label).localeCompare(String(b.label));
      });
  }, [records, fSport, fStat, fLevel, fQuery]);

  async function createCustomStat() {
    if (!newLabel.trim()) { setFormError('Give the stat a name.'); return; }
    setBusy('stat');
    setFormError('');
    try {
      const statDoc = customStatDoc({
        schoolId, sportId: sport, label: newLabel, unit: newUnit, direction: newDirection,
        createdBy: user.uid,
      });
      // Deterministic id: two people adding "Charges taken" must not create two stats that
      // mean the same thing under different keys.
      await setDoc(doc(db, 'schools', schoolId, 'recordStats', statDoc.key), statDoc);
      setCustomStats((prev) => [...prev.filter((s) => s.key !== statDoc.key), statDoc]);
      setStatKey(statDoc.key);
      setShowNewStat(false);
      setNewLabel('');
      setNotice(`"${statDoc.label}" added for ${SPORT_LABELS[sport] || sport}.`);
    } catch (err) {
      setFormError(err?.message || 'That stat could not be saved.');
    } finally {
      setBusy('');
    }
  }

  async function saveRecord(event) {
    event.preventDefault();
    setFormError('');
    setNotice('');
    const chosen = addStatOptions.find((s) => s.key === statKey);
    const problem = validateRecord({ sportId: sport, statKey, value, playerName, level });
    if (problem) { setFormError(problem); return; }

    setBusy('record');
    try {
      const payload = recordDoc({
        schoolId,
        sportId: sport,
        statKey,
        statLabel: chosen?.label || statKey,
        value,
        unit: chosen?.unit || 'count',
        direction: chosen?.direction || 'high',
        playerName,
        gradYear,
        season,
        level,
        note,
        createdBy: user.uid,
      });
      const ref = await addDoc(collection(db, 'schools', schoolId, 'records'), payload);
      setRecords((prev) => [...prev, { id: ref.id, ...payload }]);
      setNotice(`${payload.playerName} recorded for ${payload.statLabel}.`);
      setValue(''); setPlayerName(''); setGradYear(''); setSeason(''); setNote('');
    } catch (err) {
      setFormError(err?.message || 'That record could not be saved.');
    } finally {
      setBusy('');
    }
  }

  async function removeRecord(record) {
    const ok = window.confirm(`Remove ${record.playerName}'s ${record.statLabel || record.statKey}?`);
    if (!ok) return;
    setBusy(`del:${record.id}`);
    try {
      await deleteDoc(doc(db, 'schools', schoolId, 'records', record.id));
      setRecords((prev) => prev.filter((r) => r.id !== record.id));
    } catch (err) {
      setLoadError(err?.message || 'That record could not be removed.');
    } finally {
      setBusy('');
    }
  }

  if (loading) return <main className="page"><p>Loading…</p></main>;
  if (!user) return <main className="page"><p className="muted">Sign in to see the record book.</p></main>;
  if (!schoolId) {
    return (
      <AppShell title="Records" profile={profile} user={user}>
        <p className="muted">No school attached to this account.</p>
      </AppShell>
    );
  }

  return (
    <AppShell title="School records" profile={profile} user={user}>
      <h1>School records</h1>
      <p className="muted small">
        Best-ever marks by sport.
        {canWrite ? ' Add one below, or invent a stat your school keeps.' : ' Ask a coach to add a record.'}
      </p>
      {loadError && <p className="error">{loadError}</p>}
      {notice && <p className="notice">{notice}</p>}
      <section className="card">
        <h2>Find a record</h2>
        <div className="row">
          <label>
            Sport
            <select value={fSport} onChange={(e) => { setFSport(e.target.value); setFStat(''); }}>
              <option value="">All sports</option>
              {Object.keys(SPORT_RECORDS).map((id) => (
                <option key={id} value={id}>{SPORT_LABELS[id]}</option>
              ))}
            </select>
          </label>
          <label>
            Stat
            <select value={fStat} onChange={(e) => setFStat(e.target.value)} disabled={!fSport}>
              <option value="">{fSport ? 'All stats' : 'Pick a sport first'}</option>
              {filterStatOptions.map((s) => (
                <option key={s.key} value={s.key}>{s.label}</option>
              ))}
            </select>
          </label>
          <label>
            Level
            <select value={fLevel} onChange={(e) => setFLevel(e.target.value)}>
              <option value="">All levels</option>
              {LEVELS.map((l) => <option key={l} value={l}>{l}</option>)}
            </select>
          </label>
          <label>
            Player or year
            <input
              value={fQuery}
              onChange={(e) => setFQuery(e.target.value)}
              placeholder="Name, season, class of"
            />
          </label>
        </div>
        <p className="muted small">{groups.length} stat(s) with records</p>
      </section>

      {groups.length === 0 && (
        <section className="card">
          <p className="muted">No records yet for that filter.</p>
        </section>
      )}

      {groups.map((g) => (
        <section className="card" key={g.key}>
          <h2>{SPORT_LABELS[g.sportId] || g.sportId} · {g.label}</h2>
          {g.best && (
            <p className="ok">
              Record: {formatRecordValue(g.best.value, g.unit)} — {g.best.playerName}
              {g.best.season ? ` (${g.best.season})` : ''}
            </p>
          )}
          <table>
            <thead>
              <tr>
                <th>#</th><th>Player</th><th>Mark</th><th>Level</th><th>Season</th><th>Class</th>
                {canWrite && <th />}
              </tr>
            </thead>
            <tbody>
              {g.sorted.map((r, i) => (
                <tr key={r.id}>
                  <td className="small muted">{i + 1}</td>
                  <td>{r.playerName}</td>
                  <td><strong>{formatRecordValue(r.value, g.unit)}</strong></td>
                  <td className="small">{r.level}</td>
                  <td className="small">{r.season || '—'}</td>
                  <td className="small">{r.gradYear || '—'}</td>
                  {canWrite && (
                    <td>
                      <button
                        type="button"
                        className="link"
                        onClick={() => removeRecord(r)}
                        disabled={busy === `del:${r.id}`}
                      >
                        {busy === `del:${r.id}` ? '…' : 'Remove'}
                      </button>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      ))}

      {canWrite && (
        <section className="card">
          <h2>Add a record</h2>
          <form onSubmit={saveRecord}>
            <div className="row">
              <label>
                Sport
                <select
                  value={sport}
                  onChange={(e) => { setSport(e.target.value); setStatKey(''); }}
                >
                  {Object.keys(SPORT_RECORDS).map((id) => (
                    <option key={id} value={id}>{SPORT_LABELS[id]}</option>
                  ))}
                </select>
              </label>
              <label>
                Stat
                <select value={statKey} onChange={(e) => setStatKey(e.target.value)}>
                  <option value="">Choose a stat</option>
                  {addStatOptions.map((s) => (
                    <option key={s.key} value={s.key}>{s.label}{s.custom ? ' (school stat)' : ''}</option>
                  ))}
                </select>
              </label>
              <button
                type="button"
                className="link"
                onClick={() => setShowNewStat((v) => !v)}
              >
                {showNewStat ? 'Cancel new stat' : '+ Add a stat that is not listed'}
              </button>
            </div>

            {showNewStat && (
              <div className="row" style={{ alignItems: 'flex-end' }}>
                <label>
                  Stat name
                  <input
                    value={newLabel}
                    onChange={(e) => setNewLabel(e.target.value)}
                    placeholder="Charges taken"
                    maxLength={60}
                  />
                </label>
                <label>
                  Unit
                  <select value={newUnit} onChange={(e) => setNewUnit(e.target.value)}>
                    <option value="count">Count</option>
                    <option value="yards">Yards</option>
                    <option value="seconds">Seconds</option>
                    <option value="strokes">Strokes</option>
                    <option value="points">Points</option>
                  </select>
                </label>
                <label>
                  Better when
                  <select value={newDirection} onChange={(e) => setNewDirection(e.target.value)}>
                    <option value="high">Higher</option>
                    <option value="low">Lower</option>
                  </select>
                </label>
                <button type="button" onClick={createCustomStat} disabled={busy === 'stat' || !newLabel.trim()}>
                  {busy === 'stat' ? 'Saving…' : 'Create stat'}
                </button>
              </div>
            )}
            {showNewStat && (
              <p className="muted small">
                A new stat is added to {SPORT_LABELS[sport] || sport} for this school only. Pick
                &ldquo;Better when&rdquo; carefully: a golf score and a sprint time are records
                when they are <strong>lower</strong>, and the directory ranks on this.
              </p>
            )}

            <div className="row">
              <label>
                Record value
                <input
                  value={value}
                  onChange={(e) => setValue(e.target.value)}
                  placeholder="1845"
                  inputMode="decimal"
                />
              </label>
              <label>
                Who holds it
                <input
                  value={playerName}
                  onChange={(e) => setPlayerName(e.target.value)}
                  placeholder="Jordan Smith"
                />
              </label>
              <label>
                Class of
                <input
                  value={gradYear}
                  onChange={(e) => setGradYear(e.target.value)}
                  placeholder="2020"
                  inputMode="numeric"
                  maxLength={4}
                />
              </label>
              <label>
                Season
                <input
                  value={season}
                  onChange={(e) => setSeason(e.target.value)}
                  placeholder="2019-20"
                />
              </label>
              <label>
                Level
                <select value={level} onChange={(e) => setLevel(e.target.value)}>
                  {LEVELS.map((l) => <option key={l} value={l}>{l}</option>)}
                </select>
              </label>
            </div>
            <label>
              Note (optional)
              <input
                value={note}
                onChange={(e) => setNote(e.target.value)}
                placeholder="Broke a 22-year-old record"
                maxLength={300}
              />
            </label>

            <button type="submit" disabled={busy === 'record'}>
              {busy === 'record' ? 'Saving…' : 'Save record'}
            </button>
            {formError && <p className="error">{formError}</p>}
          </form>
        </section>
      )}

      <p className="muted small">
        Records are kept by hand for now. Games scored in the app feed career stats; nothing
        writes into this book automatically, so a mark only appears here once it is entered.
      </p>
    </AppShell>
  );
}

