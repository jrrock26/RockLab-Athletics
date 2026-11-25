import { useEffect, useState } from 'react';
import { signOut } from 'firebase/auth';
import { auth } from '../../lib/firebase';
import { sendPasswordReset } from '../../lib/auth';
import { updateAccount } from '../../lib/parentData';
import { accountUpdate, rosterContact } from '../../lib/parent.mjs';

/// The guardian's own account.
///
/// Only their own fields are editable, because the rules freeze `role` and
/// `schoolId`: an account cannot promote itself or claim a school. Contact details
/// the SCHOOL holds live on the roster entry, which a family may not write — that is
/// shown per athlete with a correction request instead.
export default function Account({ profile, user, athletes }) {
  const [displayName, setDisplayName] = useState('');
  const [phone, setPhone] = useState('');
  const [zipCode, setZipCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  useEffect(() => {
    setDisplayName((profile && profile.displayName) || '');
    setPhone((profile && profile.phone) || '');
    setZipCode((profile && profile.zipCode) || '');
  }, [profile]);

  async function save(e) {
    e.preventDefault();
    setError('');
    setNotice('');
    const patch = accountUpdate({ displayName, phone, zipCode });
    if (!Object.keys(patch).length) {
      setError('Nothing to save.');
      return;
    }
    setBusy(true);
    try {
      await updateAccount(user.uid, patch);
      setNotice('Saved.');
    } catch (err) {
      setError(
        err?.code === 'permission-denied'
          ? 'Only your own contact details can be changed here.'
          : err?.message || 'That could not be saved.',
      );
    } finally {
      setBusy(false);
    }
  }

  async function resetPassword() {
    setError('');
    setNotice('');
    if (!user.email) {
      setError('This account has no email address on file.');
      return;
    }
    setBusy(true);
    try {
      await sendPasswordReset(user.email);
      setNotice(`A password reset link is on its way to ${user.email}.`);
    } catch (err) {
      setError(err?.message || 'The reset email could not be sent.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="card" id="account">
      <h2>Your account</h2>
      <p className="muted small">
        {user.email} · {profile?.role || 'follower'}
      </p>

      <form onSubmit={save}>
        <label>
          Your name
          <input
            value={displayName}
            onChange={(e) => setDisplayName(e.target.value)}
            autoComplete="name"
          />
        </label>
        <label>
          Phone
          <input
            type="tel"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            autoComplete="tel"
          />
        </label>
        <label>
          Home ZIP
          <input
            value={zipCode}
            onChange={(e) => setZipCode(e.target.value)}
            autoComplete="postal-code"
          />
        </label>
        <button type="submit" disabled={busy}>
          {busy ? 'Saving…' : 'Save changes'}
        </button>
        {error && <p className="error small">{error}</p>}
        {notice && <p className="ok small">{notice}</p>}
      </form>

      {(athletes || []).length > 0 && (
        <>
          <h3>Contact the school holds</h3>
          <p className="small muted">
            These are on your athlete&apos;s record and only the school can change them.
            Ask for a correction from the athlete card.
          </p>
          <ul className="plain-list">
            {(athletes || []).map((a) => {
              const c = rosterContact(a.entry);
              return (
                <li key={`${a.teamId}:${a.entry.id}`}>
                  <strong>{a.name}</strong>
                  <span className="muted small">
                    {' '}· {c.name || 'no name'}{c.email ? ` · ${c.email}` : ''}
                    {c.phone ? ` · ${c.phone}` : ''}
                  </span>
                </li>
              );
            })}
          </ul>
        </>
      )}

      <hr className="rule" />
      <div className="row">
        <button type="button" className="secondary" onClick={resetPassword} disabled={busy}>
          Email me a password reset
        </button>
        <button type="button" className="secondary" onClick={() => signOut(auth)}>
          Sign out
        </button>
      </div>
    </section>
  );
}
