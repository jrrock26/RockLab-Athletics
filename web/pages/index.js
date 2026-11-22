import { useEffect, useState } from 'react';
import { onAuthStateChanged, signInWithEmailAndPassword, signOut } from 'firebase/auth';
import { doc, getDoc } from 'firebase/firestore';
import { auth, db } from '../lib/firebase';
import { useRouter } from 'next/router';
import Head from 'next/head';
import Link from 'next/link';
import { personName } from '../lib/portal.mjs';

export function useAuth() {
  const [state, setState] = useState({ loading: true, user: null, profile: null });

  useEffect(() => {
    return onAuthStateChanged(auth, async (user) => {
      if (!user) {
        setState({ loading: false, user: null, profile: null });
        return;
      }
      const snap = await getDoc(doc(db, 'users', user.uid));
      setState({ loading: false, user, profile: snap.exists() ? snap.data() : null });
    });
  }, []);

  return state;
}

/// One door. Student-athletes, parents, coaches, staff and athletic directors all sign
/// in here, and the role decides where they land -- the console for an AD, the team
/// portal for everyone else. Splitting the web app into "the console" and "the family
/// portal" made families feel like guests at their own school.
export default function Login() {
  const { loading, user, profile } = useAuth();
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (loading || !user) return;
    if (profile?.role === 'ad') router.replace('/dashboard');
    else if (profile) router.replace('/portal');
  }, [loading, user, profile, router]);

  async function submit(e) {
    e.preventDefault();
    setError('');
    setBusy(true);
    try {
      await signInWithEmailAndPassword(auth, email, password);
    } catch (err) {
      // Firebase's default strings leak whether an address exists. Do not repeat them.
      setError(
        err?.code === 'auth/invalid-credential' || err?.code === 'auth/wrong-password'
          ? 'That email and password do not match.'
          : err?.code === 'auth/too-many-requests'
            ? 'Too many attempts. Wait a minute and try again.'
            : 'Could not sign in. Check the address and try again.',
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <Head><title>RockLab Athletics</title></Head>
      <div className="shell">
        <section className="hero">
          <div className="hero-inner">
            <p className="eyebrow">RockLab Athletics</p>
            <h1 className="hero-title">
              Every team.<br />One place.
            </h1>
            <p className="hero-sub">
              Rosters, schedules, forms, and scores — the same records the mobile app uses,
              visible to the people who need them.
            </p>
          </div>
        </section>

        <main className="auth-col">
          <div className="card auth-card">
            <h2>Sign in</h2>
            <p className="small muted">
              Athletic directors, coaches, staff, players and parents.
            </p>

            {user ? (
              <>
                <p className="ok">
                  Signed in as {personName(profile) || user.email}
                  {profile?.role ? ` · ${profile.role}` : ''}
                </p>
                <button type="button" onClick={() => signOut(auth)}>Sign out</button>
              </>
            ) : (
              <form onSubmit={submit}>
                <label>
                  Email
                  <input type="email" value={email} autoComplete="email" required
                    onChange={(e) => setEmail(e.target.value)} />
                </label>
                <label>
                  Password
                  <input type="password" value={password} autoComplete="current-password" required
                    onChange={(e) => setPassword(e.target.value)} />
                </label>
                <button type="submit" disabled={busy}>
                  {busy ? 'Signing in…' : 'Sign in'}
                </button>
                {error && <p className="error">{error}</p>}
              </form>
            )}

            <hr className="rule" />
            <p className="small muted">
              Joining a team for the first time?{' '}
              <Link href="/join">Use your coach&apos;s code</Link>.
            </p>
            <p className="small muted">
              <Link href="/privacy">Privacy</Link> · <Link href="/support">Support</Link> ·{' '}
              <a href="https://www.rocklabtechnologies.com">RockLab Technologies</a>
            </p>
          </div>
        </main>
      </div>
    </>
  );
}
