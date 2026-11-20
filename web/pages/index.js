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
    if (!loading && user && profile) {
      if (profile.role === 'ad') router.replace('/dashboard');
      else setError('This console is for athletic directors. Use the app for everything else.');
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
      <form onSubmit={submit} className="card">
        <label>Email<input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required /></label>
        <label>Password<input type="password" value={password} onChange={(e) => setPassword(e.target.value)} required /></label>
        <button type="submit">Sign in</button>
        {error && <p className="error">{error}</p>}
      </form>
      <p className="muted small">
        <Link href="/privacy">Privacy</Link> · <Link href="/support">Support</Link>
      </p>
      {user && <button className="link" onClick={() => signOut(auth)}>Sign out</button>}
    </main>
  );
}
