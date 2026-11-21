import { useEffect, useState } from 'react';
import { onAuthStateChanged, signInWithEmailAndPassword, signOut } from 'firebase/auth';
import { doc, getDoc } from 'firebase/firestore';
import { auth, db } from '../lib/firebase';
import { useRouter } from 'next/router';
import Link from 'next/link';

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

export default function Login() {
  const { loading, user, profile } = useAuth();
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    if (!loading && user) {
      // ADs get the console. Everyone else — parents, players, coaches,
      // followers — belongs in the portal, which works on Android and the web.
      // Sending them to the App Store was a dead end for half of families.
      if (profile?.role === 'ad') router.replace('/dashboard');
      else router.replace('/portal');
    }
  }, [loading, user, profile, router]);

  async function submit(e) {
    e.preventDefault();
    setError('');
    try {
      await signInWithEmailAndPassword(auth, email, password);
    } catch (err) {
      setError(err.message);
    }
  }

  return (
    <main className="page">
      <h1>RockLab Athletics</h1>
      <p className="muted">Athletic director console</p>
      <p className="small muted">
        Family or player? <Link href="/portal">Sign in to the team portal</Link> — works on
        any phone or computer, no app needed.
      </p>
      <form onSubmit={submit} className="card">
        <label>Email<input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required /></label>
        <label>Password<input type="password" value={password} onChange={(e) => setPassword(e.target.value)} required /></label>
        <button type="submit">Sign in</button>
        {error && <p className="error">{error}</p>}
      </form>
      <p className="muted small">
        <Link href="/privacy">Privacy</Link> · <Link href="/support">Support</Link> ·{" "}
        <a href="https://www.rocklabtechnologies.com">RockLab Technologies</a>
      </p>
      {user && <button className="link" onClick={() => signOut(auth)}>Sign out</button>}
    </main>
  );
}
