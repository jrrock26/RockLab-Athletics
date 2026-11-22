import { useEffect, useState } from 'react';
import { collection, getDocs, query, where } from 'firebase/firestore';
import { httpsCallable } from 'firebase/functions';
import { db, functions } from '../lib/firebase';
import { useAuth } from './index';
import AppShell from '../components/AppShell';

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

  const [fileError, setFileError] = useState('');

  /// Read a chosen .csv into the same textarea the paste path uses, so there is one
  /// parser and one preview rather than two ways to import that can disagree.
  async function loadFile(e) {
    const file = e.target.files && e.target.files[0];
    setFileError('');
    if (!file) return;
    if (file.size > 2 * 1024 * 1024) {
      setFileError('That file is over 2 MB. Split it into smaller files.');
      return;
    }
    try {
      const text = await file.text();
      // A spreadsheet exported from Excel sometimes arrives tab-separated. Rewriting it
      // here is friendlier than telling a coach to re-export.
      const firstLine = text.split(/\r?\n/)[0] || '';
      const normalised = firstLine.includes('\t') && !firstLine.includes(',')
        ? text.split(/\r?\n/).map((line) => line.split('\t').join(',')).join('\n')
        : text;
      setCsv(normalised);
    } catch (err) {
      setFileError('That file could not be read.');
    } finally {
      // Allows choosing the same file twice after editing it.
      e.target.value = '';
    }
  }

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

  // Gender first: "Basketball Varsity" is two different teams at a school that fields
  // boys and girls. Without it the second one is impossible to pick.
  const [gender, setGender] = useState('all');

  const teamLabel = (t) => {
    const g = t.gender ? `${t.gender.charAt(0).toUpperCase()}${t.gender.slice(1)}` : 'Team';
    return [g, t.level, t.sportName].filter(Boolean).join(' · ');
  };
  const visibleTeams = teams
    .filter((t) => gender === 'all' || (t.gender || '').toLowerCase() === gender)
    .sort((a, b) => teamLabel(a).localeCompare(teamLabel(b)));
  const picked = teams.find((t) => t.id === teamId);

  const [rosterBusy, setRosterBusy] = useState(false);
  const [rosterResult, setRosterResult] = useState(null);

  /// Creating roster entries and emailing parents are different acts with different
  /// consequences, so they are two buttons, not one. importPlayers takes bare names --
  /// it creates the player and the roster entry, and does not send anything.
  async function addToRoster() {
    setRosterBusy(true);
    setError('');
    setRosterResult(null);
    try {
      const players = rows
        .filter((r) => r.name && String(r.name).trim().length >= 2)
        .map((r) => ({
          name: String(r.name).trim(),
          jerseyNumber: String(r.jersey ?? r.jerseyNumber ?? '').trim(),
          position: String(r.position ?? '').trim(),
        }));
      const res = await httpsCallable(functions, 'importPlayers')({ teamId, players });
      setRosterResult(res.data);
    } catch (err) {
      setError(err?.message || 'Those players could not be added.');
    } finally {
      setRosterBusy(false);
    }
  }

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
    <AppShell title="Import" profile={profile} user={user}>
      <h1>Import</h1>
      <p className="muted">
        Step 1 puts players on the roster. Step 2 emails their parents. Do them in that
        order — an invitation needs a roster entry to point at.
      </p>

      <div className="card">
        <label>
          Who
          <select
            value={gender}
            onChange={(e) => {
              const next = e.target.value;
              setGender(next);
              // Keep the pick valid: a team filtered out must not stay selected, or the
              // invites go to the wrong roster while the screen shows another.
              const still = teams.find(
                (t) => t.id === teamId && (next === 'all' || (t.gender || '').toLowerCase() === next),
              );
              if (!still) {
                const first = teams.find((t) => next === 'all' || (t.gender || '').toLowerCase() === next);
                setTeamId(first ? first.id : '');
              }
            }}
          >
            <option value="all">All teams</option>
            <option value="boys">Boys</option>
            <option value="girls">Girls</option>
            <option value="coed">Coed</option>
          </select>
        </label>

        <label>
          Team
          <select value={teamId} onChange={(e) => setTeamId(e.target.value)} disabled={visibleTeams.length === 0}>
            {visibleTeams.length === 0 && <option value="">No {gender === 'all' ? '' : `${gender} `}team yet</option>}
            {visibleTeams.map((t) => (
              <option key={t.id} value={t.id}>{teamLabel(t)}</option>
            ))}
          </select>
        </label>

        {visibleTeams.length === 0 && (
          <p className="small muted">
            No team matches that. A coach or the athletic director has to start the team
            before a roster can be imported into it.
          </p>
        )}
        {picked && (
          <p className="small muted">
            Importing into <strong>{teamLabel(picked)}</strong>
            {picked.season ? ` · ${picked.season}` : ''}
          </p>
        )}
        <label>
          CSV file
          <input type="file" accept=".csv,text/csv,text/plain" onChange={loadFile} />
        </label>
        <p className="small muted">Or paste it below.</p>
        {fileError && <p className="error">{fileError}</p>}

        <label>
          CSV
          <textarea rows={10} value={csv} onChange={(e) => setCsv(e.target.value)}
                    placeholder={'John Smith,12,QB,parent@email.com'} />
        </label>
        <p className="muted small">{rows.length} player(s) · {withEmail} with parent email</p>

        <div className="row">
          <button type="button" onClick={addToRoster}
            disabled={rosterBusy || !teamId || rows.length === 0}>
            {rosterBusy ? 'Adding…' : `Add ${rows.length} player(s) to roster`}
          </button>
          <button type="button" onClick={send} disabled={busy || !teamId || withEmail === 0}>
            {busy ? 'Sending…' : `Send ${withEmail} invitation(s)`}
          </button>
        </div>
        {rosterResult && (
          <p className="ok">
            Roster updated: {rosterResult.created ?? 0} added
            {rosterResult.skipped ? `, ${rosterResult.skipped} already on the roster` : ''}.
          </p>
        )}
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
    </AppShell>
  );
}
