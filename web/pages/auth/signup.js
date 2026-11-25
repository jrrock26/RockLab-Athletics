import { useState } from 'react';
import Head from 'next/head';
import Link from 'next/link';
import { useRouter } from 'next/router';
import { signUp } from '../../lib/auth';
import { createUser } from '../../lib/users';

/// Exactly the roles `firestore.rules` accepts on a self-signup:
/// follower, player, parent, coach. `staff` is deliberately absent — staff are
/// appointed by the school, not self-declared.
const ROLES = [
  { value: 'follower', label: 'Follower / community member' },
  { value: 'parent', label: 'Parent / guardian' },
  { value: 'coach', label: 'Coach' },
];

function messageFor(err) {
  switch (err?.code) {
    case 'auth/email-already-in-use':
      return 'That email already has an account. Sign in instead, or reset the password.';
    case 'auth/invalid-email':
      return 'That does not look like an email address.';
    case 'auth/weak-password':
      return 'Use at least 8 characters.';
    case 'auth/network-request-failed':
      return 'No connection. Check your network and try again.';
    case 'permission-denied':
      return 'The account was created but its profile was refused. Ask your athletic director to add you.';
    default:
      return 'Could not create the account. Try again.';
  }
}

export default function SignUp() {
  const router = useRouter();
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [role, setRole] = useState('follower');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  async function submit(e) {
    e.preventDefault();
    setError('');

    if (!name.trim() || !email.trim()) {
      setError('Enter your name and email address.');
      return;
    }
    if (password !== confirm) {
      setError('The two passwords do not match.');
      return;
    }
    if (password.length < 8) {
      setError('Use at least 8 characters.');
      return;
    }

    setBusy(true);
    try {
      const uid = await signUp(email, password);
      // createUser writes only email/displayName/role. It must not write schoolId:
      // the create rule accepts an absent or empty schoolId, and membership of a
      // school is assigned by that school, never chosen by the account.
      await createUser(uid, email.trim().toLowerCase(), name.trim(), role);
      router.replace('/auth/verify');
    } catch (err) {
      setError(messageFor(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <Head>
        <title>Create account · RockLab Athletics</title>
      </Head>
      <main className="page" style={{ maxWidth: 420 }}>
        <h1>Create an account</h1>
        <p className="muted">
          Use the exact email address your school or invitation used, or your team will
          not appear.
        </p>

        <div className="card">
          <form onSubmit={submit}>
            <label>
              Full name
              <input
                type="text"
                value={name}
                autoComplete="name"
                required
                onChange={(e) => setName(e.target.value)}
              />
            </label>
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
              I am a…
              <select value={role} onChange={(e) => setRole(e.target.value)}>
                {ROLES.map((r) => (
                  <option key={r.value} value={r.value}>
                    {r.label}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Password
              <input
                type="password"
                value={password}
                autoComplete="new-password"
                required
                onChange={(e) => setPassword(e.target.value)}
              />
            </label>
            <label>
              Confirm password
              <input
                type="password"
                value={confirm}
                autoComplete="new-password"
                required
                onChange={(e) => setConfirm(e.target.value)}
              />
            </label>
            <button type="submit" disabled={busy}>
              {busy ? 'Creating account…' : 'Create account'}
            </button>
            {error && <p className="error">{error}</p>}
          </form>

          <p className="small muted">
            A verification email is sent before you can use the account. Already have
            one? <Link href="/auth/signin">Sign in</Link>.
          </p>
        </div>
      </main>
    </>
  );
}
