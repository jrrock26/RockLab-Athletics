import { useEffect, useMemo, useState } from 'react';
import { collection, getDocs, limit, query, where } from 'firebase/firestore';
import Link from 'next/link';
import { db } from '../lib/firebase';
import { useAuth } from './index';

function stamp(value) {
  if (!value) return '';
  try {
    const d = typeof value.toDate === 'function' ? value.toDate() : new Date(value);
    return d.toISOString();
  } catch (e) {
    return '';
  }
}

function toCsv(rows) {
  const header = ['createdAt', 'actorName', 'actorRole', 'action', 'targetType', 'targetId', 'detail'];
  const escape = (v) => `"${String(v == null ? '' : v).replace(/"/g, '""')}"`;
  return [header.join(','), ...rows.map((r) => header.map((h) => escape(r[h])).join(','))].join('\n');
}

export default function Audit() {
  const { loading, user, profile } = useAuth();
  const [rows, setRows] = useState([]);
  const [filter, setFilter] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(true);

  useEffect(() => {
    if (!profile?.schoolId) return;
    (async () => {
      try {
        // Deliberately no orderBy: this avoids requiring a composite index on
        // (schoolId, createdAt). Sorting happens here instead.
        const snap = await getDocs(
          query(collection(db, 'auditLogs'), where('schoolId', '==', profile.schoolId), limit(500))
        );
        const list = snap.docs
          .map((d) => {
            const data = d.data();
            return {
              id: d.id,
              createdAt: stamp(data.createdAt),
              actorName: data.actorName || '',
              actorRole: data.actorRole || '',
              action: data.action || '',
              targetType: data.targetType || '',
              targetId: data.targetId || '',
              detail: data.detail || '',
            };
          })
          .sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));
        setRows(list);
      } catch (err) {
        setError(err.message);
      } finally {
        setBusy(false);
      }
    })();
  }, [profile?.schoolId]);

  const visible = useMemo(() => {
    const term = filter.trim().toLowerCase();
    if (!term) return rows;
    return rows.filter((r) =>
      [r.action, r.actorName, r.targetType, r.detail].join(' ').toLowerCase().includes(term)
    );
  }, [rows, filter]);

  function download() {
    const blob = new Blob([toCsv(visible)], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `rocklab-audit-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  if (loading) return <main className="page"><p>Loading…</p></main>;
  if (!user || profile?.role !== 'ad') {
    return (
      <main className="page">
        <p>Sign in as an athletic director to view the audit log.</p>
        <Link href="/">Go to sign in</Link>
      </main>
    );
  }

  return (
    <main className="page">
      <h1>Audit log</h1>
      <p className="muted small">
        Append-only record of privileged actions and staff access to protected
        records. Entries cannot be edited or deleted from any client.
      </p>

      <div className="card">
        <label>
          Filter
          <input
            type="text"
            value={filter}
            placeholder="action, person, record, or detail"
            onChange={(e) => setFilter(e.target.value)}
          />
        </label>
        <p className="muted small">
          Showing {visible.length} of the {rows.length} most recent entries.
        </p>
        <button onClick={download} disabled={visible.length === 0}>
          Download CSV
        </button>
        {error && <p className="error">{error}</p>}
      </div>

      <section className="card">
        {busy && <p className="muted">Loading entries…</p>}
        {!busy && rows.length === 0 && (
          <p className="muted">
            No entries yet. Actions such as assigning roles, inviting parents, and
            opening protected records are recorded here.
          </p>
        )}
        {visible.length > 0 && (
          <table>
            <thead>
              <tr>
                <th>When (UTC)</th>
                <th>Who</th>
                <th>Action</th>
                <th>Record</th>
                <th>Detail</th>
              </tr>
            </thead>
            <tbody>
              {visible.map((r) => (
                <tr key={r.id}>
                  <td className="small">{r.createdAt.replace('T', ' ').slice(0, 19)}</td>
                  <td className="small">{r.actorName || '—'}{r.actorRole ? ` (${r.actorRole})` : ''}</td>
                  <td className="small"><code>{r.action}</code></td>
                  <td className="small">{r.targetType}{r.targetId ? `: ${r.targetId}` : ''}</td>
                  <td className="small">{r.detail}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>

      <p className="muted"><Link href="/dashboard">Back to dashboard</Link></p>
    </main>
  );
}
