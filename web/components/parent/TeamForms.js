import { useEffect, useState } from 'react';
import { fetchSubmissions, fetchTeamForms, submitTeamForm } from '../../lib/parentData';
import { missingRequiredFields, teamFormStatus } from '../../lib/parent.mjs';
import { displayName, formatWhen, isOutstanding, REQUIREMENT_LABELS, toMillis } from '../../lib/portal.mjs';

/// The forms a coach has published for the team, and this family's part in them.
///
/// Per-athlete forms live under the roster entry; team forms live on the team and are
/// completed once per child (`submissions/{rosterEntryId}`). A family with two
/// athletes on one team fills it in twice, which is why the UI is per athlete rather
/// than per form.
export default function TeamForms({ teamId, athletes, uid }) {
  const [forms, setForms] = useState([]);
  const [submissions, setSubmissions] = useState({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [responses, setResponses] = useState({});
  const [signatures, setSignatures] = useState({});
  const [busyKey, setBusyKey] = useState('');
  const [notice, setNotice] = useState('');

  const roster = Array.isArray(athletes) ? athletes : [];
  const entryIds = roster.map((a) => a && a.id).filter(Boolean);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      setLoading(true);
      setError('');
      try {
        const loaded = await fetchTeamForms(teamId);
        if (cancelled) return;
        setForms(loaded);

        const byForm = {};
        for (const form of loaded) {
          byForm[form.id] = await fetchSubmissions(teamId, form.id, entryIds);
          if (cancelled) return;
        }
        setSubmissions(byForm);
      } catch (err) {
        if (!cancelled) setError(err?.message || 'Forms could not be loaded.');
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    load();
    return () => { cancelled = true; };
    // entryIds is derived from the roster; joining it keeps this from re-running on
    // every render while still reacting to a new athlete appearing.
  }, [teamId, entryIds.join(',')]); // eslint-disable-line react-hooks/exhaustive-deps

  function setResponse(formId, entryId, fieldId, value) {
    setResponses((prev) => ({
      ...prev,
      [`${formId}:${entryId}`]: { ...(prev[`${formId}:${entryId}`] || {}), [fieldId]: value },
    }));
  }

  async function submit(form, athlete) {
    const key = `${form.id}:${athlete.id}`;
    const answers = responses[key] || {};
    const signerName = String(signatures[key] || '').trim();

    setError('');
    setNotice('');
    const missing = missingRequiredFields(form, answers);
    if (missing.length) {
      setError(`Still blank: ${missing.map((f) => f.label).join(', ')}`);
      return;
    }
    if (!signerName) {
      setError('Type your name to sign this form.');
      return;
    }

    setBusyKey(key);
    try {
      const saved = await submitTeamForm({
        teamId,
        form,
        entryId: athlete.id,
        athleteName: displayName(athlete),
        uid,
        signedByName: signerName,
        responses: answers,
      });
      setSubmissions((prev) => ({
        ...prev,
        [form.id]: { ...(prev[form.id] || {}), [athlete.id]: saved },
      }));
      setNotice(`${form.title} submitted for ${displayName(athlete)}.`);
    } catch (err) {
      setError(err?.message || 'That form could not be submitted.');
    } finally {
      setBusyKey('');
    }
  }

  if (loading) return <p className="muted small">Loading forms…</p>;
  if (error && forms.length === 0) return <p className="error small">{error}</p>;
  if (forms.length === 0) return <p className="muted">Your coach has not published any team forms.</p>;

  const now = Date.now();

  return (
    <>
      {error && <p className="error small">{error}</p>}
      {notice && <p className="ok small">{notice}</p>}

      {forms.map((form) => (
        <div className="card" key={form.id}>
          <h3>{form.title}</h3>
          {form.description ? <p className="muted small">{form.description}</p> : null}
          {form.dueDate ? (
            <p className="muted small">Due {formatWhen(toMillis(form.dueDate))}</p>
          ) : null}
          {form.body ? <div className="prose form-body">{form.body}</div> : null}

          <ul className="athletes">
            {roster.map((athlete) => {
              const sub = (submissions[form.id] || {})[athlete.id] || null;
              const status = teamFormStatus(form, sub, now);
              const answerable = isOutstanding(status);
              const key = `${form.id}:${athlete.id}`;
              const answers = responses[key] || {};

              return (
                <li key={athlete.id}>
                  <strong>{displayName(athlete)}</strong>{' '}
                  <span className={`badge ${status}`}>{REQUIREMENT_LABELS[status] || status}</span>

                  {answerable && (
                    <form
                      onSubmit={(e) => {
                        e.preventDefault();
                        submit(form, athlete);
                      }}
                    >
                      {(form.fields || []).map((field) => (
                        <label key={field.id}>
                          {field.label}{field.required === false ? ' (optional)' : ''}
                          {field.type === 'checkbox' ? (
                            <input
                              type="checkbox"
                              checked={answers[field.id] === 'true'}
                              onChange={(e) =>
                                setResponse(form.id, athlete.id, field.id, e.target.checked ? 'true' : 'false')
                              }
                            />
                          ) : (
                            <input
                              type="text"
                              value={answers[field.id] || ''}
                              onChange={(e) => setResponse(form.id, athlete.id, field.id, e.target.value)}
                            />
                          )}
                        </label>
                      ))}

                      <label>
                        {form.requiresParentSignature ? 'Your signature (guardian)' : 'Sign as'}
                        <input
                          value={signatures[key] || ''}
                          onChange={(e) =>
                            setSignatures((prev) => ({ ...prev, [key]: e.target.value }))
                          }
                          placeholder="Your full name"
                          autoComplete="name"
                        />
                      </label>
                      <button type="submit" disabled={busyKey === key}>
                        {busyKey === key ? 'Submitting…' : 'Submit'}
                      </button>
                    </form>
                  )}

                  {!answerable && sub ? (
                    <p className="small muted">
                      Signed {sub.signedByName || ''}
                      {sub.signedAt ? ` · ${formatWhen(toMillis(sub.signedAt))}` : ''}
                    </p>
                  ) : null}
                </li>
              );
            })}
          </ul>
        </div>
      ))}
    </>
  );
}
