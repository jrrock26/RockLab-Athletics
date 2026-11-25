import { useState } from 'react';
import UploadDocument from './UploadDocument';
import { signRosterRequirement, sendParentMessage } from '../../lib/parentData';
import { correctionMessage, parentChatId, rosterContact } from '../../lib/parent.mjs';
import {
  displayName,
  formatWhen,
  isOutstanding,
  REQUIREMENT_LABELS,
  toMillis,
} from '../../lib/portal.mjs';

/// One athlete, as their guardian sees them.
///
/// What a family may and may not change here is not a design choice: `firestore.rules`
/// gives guardians no write access to the roster entry at all (it carries injury
/// notes and other families' contact details). So contact details are shown
/// read-only, and a change is a message to the coach — which is also an audit trail.
export default function AthleteCard({ teamId, athlete, requirements, uid, isGuardian, onChanged }) {
  const rows = Array.isArray(requirements) ? requirements : [];
  const [signatures, setSignatures] = useState({});
  const [busyRow, setBusyRow] = useState('');
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  const [showCorrection, setShowCorrection] = useState(false);
  const [field, setField] = useState('jersey number');
  const [value, setValue] = useState('');
  const [correctionBusy, setCorrectionBusy] = useState(false);
  const [correctionError, setCorrectionError] = useState('');
  const [correctionNotice, setCorrectionNotice] = useState('');

  const contact = rosterContact(athlete);
  const injury = String(athlete.injuryStatus || 'healthy');
  const outstanding = rows.filter((r) => isOutstanding(r.status));

  async function complete(row) {
    const name = String(signatures[row.id] || '').trim();
    if (!name) {
      setError('Type your name to sign before completing this requirement.');
      return;
    }
    setBusyRow(row.id);
    setError('');
    setNotice('');
    try {
      await signRosterRequirement({
        teamId,
        entryId: athlete.id,
        formId: row.id,
        signedByName: name,
        uid,
        isGuardian,
      });
      setNotice(`${row.label} submitted. Your coach still has to approve it.`);
      if (onChanged) onChanged();
    } catch (err) {
      setError(
        err?.code === 'permission-denied'
          ? 'This account is not authorised for that athlete yet — your coach may still need to approve the link.'
          : err?.message || 'That requirement could not be submitted.',
      );
    } finally {
      setBusyRow('');
    }
  }

  async function requestCorrection(e) {
    e.preventDefault();
    setCorrectionError('');
    setCorrectionNotice('');
    if (!value.trim()) {
      setCorrectionError('Say what it should be changed to.');
      return;
    }
    setCorrectionBusy(true);
    try {
      await sendParentMessage({
        chatId: parentChatId(teamId),
        uid,
        senderName: 'Guardian',
        text: correctionMessage({
          athleteName: displayName(athlete),
          field,
          value,
          fromName: contact.name || 'guardian',
        }),
      });
      setCorrectionNotice('Sent to your coaches in the parent chat.');
      setValue('');
    } catch (err) {
      setCorrectionError(
        err?.code === 'permission-denied'
          ? 'The parent chat is not open for this team yet. Ask your coach to open it, or contact them directly.'
          : err?.message || 'That request could not be sent.',
      );
    } finally {
      setCorrectionBusy(false);
    }
  }

  return (
    <li className="athlete">
      <div className="athlete-head">
        <strong>{displayName(athlete)}</strong>
        {athlete.jerseyNumber ? <span className="muted"> · #{athlete.jerseyNumber}</span> : null}
        {athlete.position ? <span className="muted"> · {athlete.position}</span> : null}
        {injury !== 'healthy' ? (
          <span className={`badge ${injury}`}> {injury === 'injured' ? 'Injured' : 'Limited'}</span>
        ) : null}
      </div>

      <p className="small muted">
        School has: {contact.name || 'no guardian name'}
        {contact.phone ? ` · ${contact.phone}` : ''}
        {contact.email ? ` · ${contact.email}` : ''}
      </p>

      <div className="requirements">
        {error && <p className="error small">{error}</p>}
        {notice && <p className="ok small">{notice}</p>}

        {rows.length === 0 ? (
          <p className="muted small">Nothing to complete right now.</p>
        ) : (
          <>
            <h4>
              {outstanding.length > 0
                ? `${outstanding.length} still to do`
                : 'All requirements complete'}
            </h4>
            <ul className="req-list">
              {rows.map((r) => (
                <li key={r.id} className={`req ${r.status}`}>
                  <div>
                    <strong>{r.label}</strong>{' '}
                    <span className={`badge ${r.status}`}>{REQUIREMENT_LABELS[r.status]}</span>
                    {r.dueAt ? (
                      <span className="muted small"> · due {formatWhen(toMillis(r.dueAt))}</span>
                    ) : null}
                  </div>

                  {isOutstanding(r.status) && (
                    <form
                      onSubmit={(e) => {
                        e.preventDefault();
                        complete(r);
                      }}
                    >
                      <label>
                        Sign as
                        <input
                          value={signatures[r.id] || ''}
                          onChange={(e) =>
                            setSignatures((prev) => ({ ...prev, [r.id]: e.target.value }))
                          }
                          placeholder="Your full name"
                          autoComplete="name"
                        />
                      </label>
                      <button type="submit" disabled={busyRow === r.id}>
                        {busyRow === r.id ? 'Submitting…' : 'Complete'}
                      </button>
                    </form>
                  )}
                </li>
              ))}
            </ul>
          </>
        )}

        <UploadDocument
          teamId={teamId}
          entryId={athlete.id}
          athleteName={displayName(athlete)}
          requirements={rows}
          uid={uid}
          onUploaded={onChanged}
        />

        {!showCorrection ? (
          <button type="button" className="link" onClick={() => setShowCorrection(true)}>
            Ask the school to correct this athlete&apos;s details
          </button>
        ) : (
          <form className="correction" onSubmit={requestCorrection}>
            <h4>Request a correction</h4>
            <label>
              What needs changing?
              <select value={field} onChange={(e) => setField(e.target.value)}>
                <option value="jersey number">Jersey number</option>
                <option value="position">Position</option>
                <option value="name spelling">Name spelling</option>
                <option value="guardian name">Guardian name</option>
                <option value="guardian phone">Guardian phone</option>
                <option value="guardian email">Guardian email</option>
              </select>
            </label>
            <label>
              Correct value
              <input value={value} onChange={(e) => setValue(e.target.value)} />
            </label>
            <button type="submit" disabled={correctionBusy}>
              {correctionBusy ? 'Sending…' : 'Send to coaches'}
            </button>
            {correctionError && <p className="error small">{correctionError}</p>}
            {correctionNotice && <p className="ok small">{correctionNotice}</p>}
            <p className="small muted">
              Only the school can edit the roster. This posts your request in the parent
              chat so it is not lost.
            </p>
          </form>
        )}
      </div>
    </li>
  );
}
