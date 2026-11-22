import { useState } from 'react';
import Link from 'next/link';
import { httpsCallable } from 'firebase/functions';
import { functions } from '../lib/firebase';
import { useAuth } from './index';
import AppShell from '../components/AppShell';

/// Claiming a player profile.
///
/// The athlete has an account; the profile already exists, created by the school. This page
/// asks for the code that links them. It is a page rather than a field on the portal because
/// it is used once in a child's life, at the moment they stop being a name on a roster and
/// become the owner of their own record -- and because putting it in the portal would put a
/// code box in front of every parent every day.
///
/// What this page does NOT do: show a list of athletes to pick from. There is no search by
/// name anywhere in the product, so a stranger cannot find a child here or anywhere else.
///
/// Filing a request grants nothing. Nothing is visible until a guardian or the school
/// approves, and the copy says so, because a screen that looks like success and then shows
/// nothing is how people conclude the app is broken.
export default function Claim() {
  const { loading, user, profile } = useAuth();
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState(null);
  const [error, setError] = useState('');

  async function submit(event) {
    event.preventDefault();
    setBusy(true);
    setError('');
    setResult(null);
    try {
      const res = await httpsCallable(functions, 'requestPlayerClaim')({ claimCode: code });
      setResult(res.data || {});
      setCode('');
    } catch (err) {
      setError(err?.message || 'That code could not be used.');
    } finally {
      setBusy(false);
    }
  }

  if (loading) return <main className="page"><p>Loading…</p></main>;
  if (!user) {
    return (
      <main className="page">
        <p className="muted"><Link href="/">Sign in</Link> to claim your profile.</p>
      </main>
    );
  }

  return (
    <AppShell title="Claim your profile" profile={profile} user={user}>
      <section className="card">
        <h2>Claim your profile</h2>
        <p className="small">
          Your coach or guardian has a claim code for your athlete profile. Enter it here to
          ask them to link the profile to this account.
        </p>
        <p className="small muted">
          A parent or guardian can use this page too, to hold a profile for a child who does
          not have an account yet. That claim is recorded as a guardian claim, and the athlete
          can take ownership themselves later — it is not a permanent handover.
        </p>

        <form onSubmit={submit} className="row">
          <label>
            Claim code
            <input
              type="text"
              value={code}
              onChange={(e) => setCode(e.target.value)}
              placeholder="ABCD2345"
              autoCapitalize="characters"
              autoCorrect="off"
              spellCheck={false}
              maxLength={16}
              required
            />
          </label>
          <button type="submit" disabled={busy || !code.trim()}>
            {busy ? 'Sending…' : 'Request claim'}
          </button>
        </form>

        {result && !result.alreadyPending && (
          <p className="notice">
            Request sent{result.playerName ? ` for ${result.playerName}` : ''}. A guardian or
            your school has to approve it before anything appears on this account.
          </p>
        )}
        {result?.alreadyPending && (
          <p className="notice">
            You already have a request waiting for approval
            {result.playerName ? ` for ${result.playerName}` : ''}.
          </p>
        )}
        {error && <p className="error">{error}</p>}

        <p className="small muted">
          Nothing is shared with this account until the request is approved. If you do not
          have a code, ask your coach — the code is not your name, and nobody can look you up
          by name here.
        </p>
      </section>
    </AppShell>
  );
}
