import { useState } from 'react';
import { listLinkableAthletes, requestAthleteLink } from '../../lib/parentData';
import { displayName } from '../../lib/portal.mjs';

/// Ask a coach to confirm this account is the guardian of an athlete on the roster.
///
/// The web deliberately cannot complete this itself. `approveParentLink` is what
/// writes the guardian's role, `linkedPlayerIds` and their contact details onto the
/// roster entry, and it runs with coach authority — a family that could do that
/// could attach itself to any child.
export default function LinkAthlete({ teamId, alreadyLinked = [], disabled = false }) {
  const [open, setOpen] = useState(false);
  const [players, setPlayers] = useState([]);
  const [loading, setLoading] = useState(false);
  const [busyId, setBusyId] = useState('');
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  const linkedIds = new Set(
    (alreadyLinked || []).map((a) => a && a.id).filter(Boolean),
  );

  async function load() {
    setOpen(true);
    setError('');
    setNotice('');
    setLoading(true);
    try {
      setPlayers(await listLinkableAthletes(teamId));
    } catch (err) {
      setError(
        err?.message
          || 'The roster could not be read. Your athletic director may need to add you to the team first.',
      );
    } finally {
      setLoading(false);
    }
  }

  async function request(entryId) {
    setBusyId(entryId);
    setError('');
    setNotice('');
    try {
      const res = await requestAthleteLink(teamId, entryId);
      setNotice(
        res.alreadyPending
          ? 'A request for that athlete is already waiting on your coach.'
          : 'Request sent. Your coach or athletic director has to approve it before the athlete appears here.',
      );
    } catch (err) {
      setError(err?.message || 'That request could not be sent.');
    } finally {
      setBusyId('');
    }
  }

  return (
    <div className="link-athlete">
      {!open ? (
        <button type="button" className="link" onClick={load} disabled={disabled}>
          Add another athlete to my account
        </button>
      ) : (
        <>
          <h4>Which athlete is yours?</h4>
          {loading && <p className="muted small">Reading the roster…</p>}
          {error && <p className="error small">{error}</p>}
          {notice && <p className="ok small">{notice}</p>}
          {!loading && players.length === 0 && !error && (
            <p className="muted small">This team has no athletes on its roster yet.</p>
          )}
          <ul className="plain-list">
            {players.map((p) => {
              const mine = linkedIds.has(p.entryId);
              return (
                <li key={p.entryId}>
                  <span>
                    {displayName({ playerName: p.playerName })}
                    {p.jerseyNumber ? ` · #${p.jerseyNumber}` : ''}
                  </span>
                  {mine ? (
                    <span className="ok small"> Already linked</span>
                  ) : (
                    <button
                      type="button"
                      className="small-button"
                      disabled={busyId === p.entryId}
                      onClick={() => request(p.entryId)}
                    >
                      {busyId === p.entryId ? 'Sending…' : 'Request link'}
                    </button>
                  )}
                </li>
              );
            })}
          </ul>
          <button type="button" className="link" onClick={() => setOpen(false)}>
            Close
          </button>
        </>
      )}
    </div>
  );
}
