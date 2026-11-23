import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { collection, getDocs } from 'firebase/firestore';
import { httpsCallable } from 'firebase/functions';
import { db, functions } from '../lib/firebase';
import { useAuth } from './index';
import AppShell from '../components/AppShell';
import { SPORT_RECORDS, SPORT_LABELS, LEVELS, formatRecordValue } from '../lib/records';
import { buildPlan, recordKey } from '../lib/records-import';

/// Importing a record book a school already keeps.
///
/// Two shapes of file, both supported: one that names the sport on every row, and one that is
/// a single sport's records with the sport chosen here. The preview is the point of the page
/// -- it resolves each row to the canonical sport and stat and shows what it decided, so a
/// bad mapping is caught by a person before it is written rather than by an AD finding
/// basketball points filed under volleyball.
export default function RecordsImport() {
  const { loading, user, profile } = useAuth();
  const schoolId = profile?.schoolId || '';
  const canWrite = Boolean(user) && ['ad', 'coach', 'staff'].includes(profile?.role);

  const [text, setText] = useState('');
  const [fileName, setFileName] = useState('');
  const [defaultSportId, setDefaultSportId] = useState('');
  const [defaultLevel, setDefaultLevel] = useState('Varsity');
  const [customStats, setCustomStats] = useState([]);
  const [existingKeys, setExistingKeys] = useState(new Set());
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');
  const [result, setResult] = useState(null);

  useEffect(() => {
    if (!schoolId) return;
    let alive = true;
    (async () => {
      const [s, r] = await Promise.all([
        getDocs(collection(db, 'schools', schoolId, 'recordStats')).catch(() => null),
        getDocs(collection(db, 'schools', schoolId, 'records')).catch(() => null),
      ]);
      if (!alive) return;
      setCustomStats((s?.docs || []).map((d) => ({ key: d.id, ...d.data() })));
      setExistingKeys(new Set((r?.docs || []).map((d) => recordKey(d.data()))));
    })();
    return () => { alive = false; };
  }, [schoolId]);

  const plan = useMemo(
    () => (text.trim() ? buildPlan({ text, defaultSportId, defaultLevel, customStats }) : null),
    [text, defaultSportId, defaultLevel, customStats],
  );

  const fresh = useMemo(
    () => (plan ? plan.ready.filter((r) => !existingKeys.has(recordKey(r))) : []),
    [plan, existingKeys],
  );
  const alreadyThere = plan ? plan.ready.length - fresh.length : 0;

  async function loadFile(event) {
    const file = event.target.files?.[0];
    setError('');
    setResult(null);
    if (!file) return;
    if (file.size > 2 * 1024 * 1024) {
      setError('That file is over 2 MB. Split it into smaller files.');
      return;
    }
    try {
      const content = await file.text();
      setText(content);
      setFileName(file.name);
    } catch (err) {
      setError('That file could not be read.');
    } finally {
      event.target.value = '';
    }
  }

  async function runImport() {
    if (!fresh.length) return;
    setBusy('import');
    setError('');
    setResult(null);
    try {
      const res = await httpsCallable(functions, 'importSchoolRecords')({ schoolId, records: fresh });
      setResult(res.data || {});
      // The rows just written are now "already there", so pressing import again is a no-op
      // that reports duplicates instead of doubling the book.
      setExistingKeys(new Set([...existingKeys, ...fresh.map((r) => recordKey(r))]));
    } catch (err) {
      setError(err?.message || 'Those records could not be imported.');
    } finally {
      setBusy('');
    }
  }

  if (loading) return <main className="page"><p>Loading…</p></main>;
  if (!user) return <main className="page"><p className="muted">Sign in to import records.</p></main>;
  if (!canWrite) {
    return (
      <AppShell title="Import records" profile={profile} user={user}>
        <p className="muted">Only an athletic director, coach or staff member can import records.</p>
      </AppShell>
    );
  }
  return (
    <AppShell title="Import records" profile={profile} user={user}>
      <h1>Import an existing record book</h1>
      <p className="muted small">
        A CSV, or a spreadsheet saved as CSV. The first row should name the columns — sport,
        stat, player, value, and ideally the year. Nothing is written until you confirm the
        preview.
      </p>

      <section className="card">
        <h2>The file</h2>
        <label>
          Choose a file
          <input type="file" accept=".csv,.tsv,.txt,text/csv,text/plain" onChange={loadFile} />
        </label>
        {fileName && <p className="muted small">Reading {fileName}</p>}
        <p className="small muted">Or paste it below.</p>
        <label>
          CSV
          <textarea
            rows={8}
            value={text}
            onChange={(e) => { setText(e.target.value); setResult(null); }}
            placeholder={'Sport,Stat,Player,Value,Year\nBoys Basketball,Points,Ada Byron,1845,2019-20'}
          />
        </label>

        <div className="row">
          <label>
            Sport (leave blank to use the sport column)
            <select value={defaultSportId} onChange={(e) => setDefaultSportId(e.target.value)}>
              <option value="">Use the file&rsquo;s sport column</option>
              {Object.keys(SPORT_RECORDS).map((id) => (
                <option key={id} value={id}>{SPORT_LABELS[id]}</option>
              ))}
            </select>
          </label>
          <label>
            Default level
            <select value={defaultLevel} onChange={(e) => setDefaultLevel(e.target.value)}>
              {LEVELS.map((l) => <option key={l} value={l}>{l}</option>)}
            </select>
          </label>
        </div>
        {defaultSportId && (
          <p className="muted small">
            Every row is filed under {SPORT_LABELS[defaultSportId]} unless it names another sport.
          </p>
        )}
      </section>

      {error && <p className="error">{error}</p>}

      {plan && (
        <section className="card">
          <h2>What will be imported</h2>
          <p className="small">
            <strong>{plan.ready.length}</strong> row(s) read
            {alreadyThere > 0 ? `, ${alreadyThere} already in the book` : ''}
            {fresh.length > 0 ? `, ${fresh.length} new` : ''}.
            {plan.problems.length > 0 ? ` ${plan.problems.length} row(s) cannot be read.` : ''}
          </p>

          {plan.ready.length > 0 && (
            <table>
              <thead>
                <tr>
                  <th>Line</th><th>Sport</th><th>Stat</th><th>Player</th>
                  <th>Mark</th><th>Season</th><th>Level</th>
                </tr>
              </thead>
              <tbody>
                {plan.ready.slice(0, 60).map((row) => (
                  <tr key={`${row.line}-${row.sportId}-${row.statKey}`}>
                    <td className="small muted">{row.line}</td>
                    <td className="small">
                      {SPORT_LABELS[row.sportId] || row.sportId}
                      {row.gender ? ` · ${row.gender}` : ''}
                    </td>
                    <td className="small">{row.statLabel}</td>
                    <td className="small">{row.playerName}</td>
                    <td className="small"><strong>{formatRecordValue(row.value, row.unit)}</strong></td>
                    <td className="small">{row.season || '—'}</td>
                    <td className="small">{row.level}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
          {plan.ready.length > 60 && (
            <p className="muted small">Showing the first 60 of {plan.ready.length}.</p>
          )}

          {plan.problems.length > 0 && (
            <>
              <h3>Rows that will be skipped</h3>
              <p className="muted small">
                These are not imported. Fix the file and load it again, or add them by hand in
                the record book.
              </p>
              <ul className="req-list">
                {plan.problems.slice(0, 40).map((problem) => (
                  <li key={`p-${problem.line}`} className="small">
                    <strong>Line {problem.line}</strong> — {problem.reason}
                    {problem.raw ? <span className="muted"> ({problem.raw})</span> : null}
                  </li>
                ))}
              </ul>
              {plan.problems.length > 40 && (
                <p className="muted small">{plan.problems.length - 40} more not shown.</p>
              )}
            </>
          )}

          <div className="row">
            <button type="button" onClick={runImport} disabled={busy === 'import' || fresh.length === 0}>
              {busy === 'import' ? 'Importing…' : `Import ${fresh.length} record(s)`}
            </button>
            <Link className="card link-card" href="/records">View the record book</Link>
          </div>
          {fresh.length === 0 && plan.ready.length > 0 && (
            <p className="muted small">
              Everything in this file is already in the book, so there is nothing to import.
              That is the intended result of running the same file twice.
            </p>
          )}
        </section>
      )}

      {result && (
        <section className="card">
          <h2>Imported</h2>
          <p className="ok">
            {result.created} record(s) added
            {result.skippedDuplicates ? `, ${result.skippedDuplicates} already present` : ''}
            {result.invalid?.length ? `, ${result.invalid.length} rejected` : ''}.
          </p>
          {result.invalid?.length > 0 && (
            <ul className="req-list">
              {result.invalid.map((row) => (
                <li key={`inv-${row.index}`} className="small">
                  Row {row.index + 1} — {row.reason}
                </li>
              ))}
            </ul>
          )}
          <Link className="card link-card" href="/records">Open the record book</Link>
        </section>
      )}
    </AppShell>
  );
}

