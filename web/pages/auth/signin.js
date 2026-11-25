import { useState } from 'react';
import Head from 'next/head';
import Link from 'next/link';
import { useRouter } from 'next/router';
import { signIn, sendPasswordReset, isEmailVerified } from '../../lib/auth';

/// Firebase's default error strings leak whether an address exists. Restate them
/// in plain language without confirming which half was wrong.
function messageFor(err) {
  switch (err?.code) {
    case 'auth/invalid-credential':
    case 'auth/wrong-password':
    case 'auth/user-not-found':
      return 'That email and password do not match.';
    case 'auth/invalid-email':
      return 'That does not look like an email address.';
    case 'auth/too-many-requests':
      return 'Too many attempts. Wait a minute and try again.';
    case 'auth/network-request-failed':
      return 'No connection. Check your network and try again.';
    default:
      return 'Could not sign in. Check the address and try again.';
  }
}

export default function SignIn() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [busy, setBusy] = useState(false);

  async function submit(e) {
    e.preventDefault();
    setError('');
    setNotice('');
    setBusy(true);
    try {
      await signIn(email, password);
      // Unverified accounts go to the verification screen; index.js routes the rest.
      router.replace(isEmailVerified() ? '/' : '/auth/verify');
    } catch (err) {
      setError(messageFor(err));
    } finally {
      setBusy(false);
    }
  }

  async function reset() {
    setError('');
    setNotice('');
    if (!email.trim()) {
      setError('Enter your email address above, then choose “Forgot password”.');
      return;
    }
    setBusy(true);
    try {
      await sendPasswordReset(email);
      setNotice(
        'If that address has an account, a reset link is on its way. Check spam as well as the inbox.',
      );
    } catch (err) {
      setError(messageFor(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <Head>
        <title>Sign in · RockLab Athletics</title>
      </Head>
      <main className="page" style={{ maxWidth: 420 }}>
        <h1>Sign in</h1>
        <p className="muted">
          Athletic directors, coaches, staff, players and parents.
        </p>

        <div className="card">
          <form onSubmit={submit}>
            <label>
              Email
              <input
                type="email"
                value={email}
                autoComplete="email"
                required
                onChange={(e) => setEmail(e.target.value)}
              />
            </label>
            <label>
              Password
              <input
                type="password"
                value={password}
                autoComplete="current-password"
                required
                onChange={(e) => setPassword(e.target.value)}
              />
            </label>
            <button type="submit" disabled={busy}>
              {busy ? 'Signing in…' : 'Sign in'}
            </button>
            {error && <p className="error">{error}</p>}
            {notice && <p className="ok">{notice}</p>}
          </form>

          <button type="button" className="link" onClick={reset} disabled={busy}>
            Forgot password?
          </button>

          <hr className="rule" />

          <p className="small muted">
            No account yet? <Link href="/auth/signup">Create one</Link>. Invited by your
            school? Use the exact email address the invitation was sent to.
          </p>
          <p className="small muted">
            <Link href="/">Back to sign in</Link> · <Link href="/support">Support</Link>
          </p>
        </div>
      </main>
    </>
  );
}
