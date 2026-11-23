import { useCallback, useEffect, useState } from 'react';
import Head from 'next/head';
import Link from 'next/link';
import { useRouter } from 'next/router';
import { createUserWithEmailAndPassword, onAuthStateChanged, signInWithEmailAndPassword } from 'firebase/auth';
import { doc, setDoc } from 'firebase/firestore';
import { httpsCallable } from 'firebase/functions';
import { auth, db, functions } from '../lib/firebase';
import { normalizeEmail } from '../lib/portal.mjs';

/// The public front door. A family gets a team code by text or printed sheet, enters it,
/// types their child's name and picks them from the filtered list. The page never lists a
/// roster, and the request it files grants nothing until a coach approves it.
export default function Join() {
  const router = useRouter();
  const { code: codeParam = '' } = router.query;

  const [user, setUser] = useState(null);
  const [mode, setMode] = useState('signin');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');

  const [code, setCode] = useState('');
  const [query, setQuery] = useState('');
  const [results, setResults] = useState([]);
  const [selected, setSelected] = useState(null);
  const [role, setRole] = useState('parent');

  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  useEffect(() => {
    if (typeof codeParam === 'string' && codeParam) setCode(codeParam.toUpperCase());
  }, [codeParam]);

  useEffect(() => onAuthStateChanged(auth, (account) => setUser(account)), []);

  async function signIn(e) {
    e.preventDefault();
    setError('');
    setBusy('auth');
    try {
      await signInWithEmailAndPassword(auth, email, password);
    } catch (err) {
      setError(err?.message || 'That did not work.');
    } finally {
      setBusy('');
    }
  }

  async function signUp(e) {
    e.preventDefault();
    setError('');
    setBusy('auth');
    try {
      const cred = await createUserWithEmailAndPassword(auth, email, password);
      // An unprivileged record only; the coach's approval decides the real role.
      await setDoc(doc(db, 'users', cred.user.uid), {
        email: normalizeEmail(cred.user.email), name: name || '', role: 'follower',
      }, { merge: true });
    } catch (err) {
      setError(err?.message || 'That did not work.');
    } finally {
      setBusy('');
    }
  }

  /// Fires at three characters, matching the server floor: shorter queries would only
  /// spend the rate-limit budget on rejections.
  const search = useCallback(async () => {
    const q = query.trim();
    if (code.trim().length < 4 || q.length < 3) return;
    setBusy('search');
    setError('');
    setNotice('');
    try {
      const res = await httpsCallable(functions, 'searchTeamRoster')({
        code: code.trim().toUpperCase(), query: q,
      });
      setResults(res.data?.results || []);
      setSelected(null);
      if (!res.data?.count) setNotice('No match yet. Check the spelling, or ask your coach.');
    } catch (err) {
      setError(err?.message || 'Search failed.');
      setResults([]);
    } finally {
      setBusy('');
    }
  }, [code, query]);

  async function submit() {
    if (!selected) return;
    setBusy('submit');
    setError('');
    setNotice('');
    try {
      const res = await httpsCallable(functions, 'requestTeamJoin')({
        code: code.trim().toUpperCase(), role, rosterEntryId: selected.rosterEntryId,
      });
      setNotice(res.data?.alreadyPending
        ? 'You already have a request waiting with your coach.'
        : `Sent. Your coach has to approve ${selected.displayName} before anything is shared.`);
      setResults([]);
      setSelected(null);
      setQuery('');
    } catch (err) {
      setError(err?.message || 'That request could not be sent.');
    } finally {
      setBusy('');
    }
  }

  return (
    <>
      <Head><title>Join a team · RockLab Athletics</title></Head>
      <main className="page">
        <h1>Join your team</h1>
        <p className="muted">
          Enter the team code from your coach, then find your athlete. Your coach confirms
          who is who before anything is shared.
        </p>

        {notice && <p className="notice">{notice}</p>}
        {error && <p className="error">{error}</p>}

        {!user ? (
          <form className="card" onSubmit={mode === 'signin' ? signIn : signUp}>
            <h2>{mode === 'signin' ? 'Sign in' : 'Create your account'}</h2>
            {mode === 'signup' && (
              <label>
                Your name
                <input value={name} onChange={(e) => setName(e.target.value)} autoComplete="name" />
              </label>
            )}
            <label>
              Email
              <input type="email" required value={email} autoComplete="email"
                onChange={(e) => setEmail(e.target.value)} />
            </label>
            <label>
              Password
              <input type="password" required minLength={6} value={password}
                autoComplete={mode === 'signin' ? 'current-password' : 'new-password'}
                onChange={(e) => setPassword(e.target.value)} />
            </label>
            <button type="submit" disabled={busy === 'auth'}>
              {busy === 'auth' ? 'Working…' : mode === 'signin' ? 'Sign in' : 'Create account'}
            </button>
            <p className="small muted">
              <button type="button" className="link"
                onClick={() => { setMode(mode === 'signin' ? 'signup' : 'signin'); setError(''); }}>
                {mode === 'signin' ? 'I need an account' : 'I already have one'}
              </button>
            </p>
          </form>
        ) : (
          <section className="card">
            <label>
              Team code
              <input value={code} onChange={(e) => setCode(e.target.value.toUpperCase())}
                placeholder="example: GPRYW5" autoCapitalize="characters" />
            </label>

            <label>
              Athlete name
              <input value={query} onChange={(e) => setQuery(e.target.value)}
                placeholder="Start typing a name" autoComplete="off" />
            </label>
            <button type="button" onClick={search} disabled={busy === 'search' || query.trim().length < 3}>
              {busy === 'search' ? 'Searching…' : 'Find athlete'}
            </button>

            {results.length > 0 && (
              <>
                <h3>Select your athlete</h3>
                <ul className="req-list">
                  {results.map((r) => (
                    <li key={r.rosterEntryId} className="req">
                      <button type="button"
                        className={selected?.rosterEntryId === r.rosterEntryId ? 'choice on' : 'choice'}
                        onClick={() => setSelected(r)}>
                        {r.displayName}{r.gradYear ? ` · ${r.gradYear}` : ''}
                      </button>
                    </li>
                  ))}
                </ul>

                <label>
                  I am
                  <select value={role} onChange={(e) => setRole(e.target.value)}>
                    <option value="parent">A parent or guardian</option>
                    <option value="player">This athlete</option>
                  </select>
                </label>

                <button type="button" onClick={submit} disabled={!selected || busy === 'submit'}>
                  {busy === 'submit' ? 'Sending…' : 'Request to join'}
                </button>
              </>
            )}
          </section>
        )}

        <p className="muted small">
          <Link href="/privacy">Privacy</Link> · <Link href="/support">Support</Link>
        </p>
      </main>
    </>
  );
}
