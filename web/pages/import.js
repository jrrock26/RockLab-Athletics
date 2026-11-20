import { useEffect, useState } from 'react';
import { collection, getDocs, query, where } from 'firebase/firestore';
import { httpsCallable } from 'firebase/functions';
import { db, functions } from '../lib/firebase';
import { useAuth } from './index';

function parseCsv(text) {
  return text
    .split(/\r?\n/)
    .map((row) => row.split(',').map((c) => c.trim()))
    .filter((cols) => cols.length > 0 && cols[0])
    .map((cols) => ({
      name: cols[0],
      jersey: cols[1] || '',
      position: cols[2] || '',
      email: cols[3] || '',
    }));
}

export default function Import() {
  const { loading, profile } = useAuth();
  const [teams, setTeams] = useState([]);
  const [teamId, setTeamId] = useState('');
  const [csv, setCsv] = useState('');
  const [result, setResult] = useState(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState('');

  async function copy(text, marker) {
    try {
      await navigator.clipboard.writeText(text);
    } catch (e) {
      // Clipboard API needs a secure context; fall back to a prompt.
      window.prompt('Copy this link', text);
    }
    setCopied(marker);
    setTimeout(() => setCopied(''), 1500);
  }

  useEffect(() => {
    if (!profile?.schoolId) return;
    (async () => {
      const snap = await getDocs(query(collection(db, 'teams'), where('schoolId', '==', profile.schoolId)));
      const list = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
      setTeams(list);
      if (list.length) setTeamId(list[0].id);
    })();
  }, [profile?.schoolId]);

  const rows = parseCsv(csv);
  const withEmail = rows.filter((r) => r.email).length;

  async function send() {
    setBusy(true);
    setError('');
    setResult(null);
    try {
      const res = await httpsCallable(functions, 'bulkInviteParents')({
        teamId,
        invites: rows.filter((r) => r.email).map((r) => ({ email: r.email, name: r.name })),
      });
      setResult(res.data);
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  if (loading) return <main className="page"><p>Loading…</p></main>;
  if (profile?.role !== 'ad') return <main className="page"><p>AD access required.</p></main>;

  return (
    <main className="page">
      <h1>Import &amp; invite</h1>
      <p className="muted">Paste a CSV: Name, Jersey, Position, Parent Email</p>

      <div className="card">
        <label>
          Team
          <select value={teamId} onChange={(e) => setTeamId(e.target.value)}>
            {teams.map((t) => (
              <option key={t.id} value={t.id}>{t.sportName} {t.level}</option>
            ))}
          </select>
        </label>
        <label>
          CSV
          <textarea rows={10} value={csv} onChange={(e) => setCsv(e.target.value)}
                    placeholder={'John Smith,12,QB,parent@email.com'} />
        </label>
        <p className="muted small">{rows.length} player(s) · {withEmail} with parent email</p>
        <button onClick={send} disabled={busy || !teamId || withEmail === 0}>
          {busy ? 'Sending…' : `Send ${withEmail} invitation(s)`}
        </button>
        {error && <p className="error">{error}</p>}
        {result && (
          <>
            <p className="ok">
              {result.created} invitation(s) created
              {result.skipped ? `, ${result.skipped} already invited` : ''}
              {result.invalid ? `, ${result.invalid} invalid` : ''}.
            </p>

            {result.emailConfigured === false && (
              <p className="muted small">
                <strong>Email delivery isn&apos;t configured.</strong> The invitations
                still work — copy the links below and send them however your school
                already reaches parents. Nothing was lost.
              </p>
            )}

            {result.links?.length > 0 && (
              <>
                <div className="row">
                  <button
                    onClick={() =>
                      copy(
                        result.links.map((l) => `${l.email}\t${l.inviteUrl}`).join('\n'),
                        'all'
                      )
                    }
                  >
                    {copied === 'all' ? 'Copied all' : 'Copy all links'}
                  </button>
                </div>
                <table>
                  <thead>
                    <tr>
                      <th>Parent email</th>
                      <th>Invite link</th>
                      <th />
                    </tr>
                  </thead>
                  <tbody>
                    {result.links.map((l) => (
                      <tr key={l.invitationId}>
                        <td className="small">{l.email}</td>
                        <td className="small">
                          <a href={l.inviteUrl} target="_blank" rel="noreferrer">
                            {l.inviteUrl}
                          </a>
                        </td>
                        <td>
                          <button onClick={() => copy(l.inviteUrl, l.invitationId)}>
                            {copied === l.invitationId ? 'Copied' : 'Copy'}
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </>
            )}
          </>
        )}
      </div>
    </main>
  );
}
