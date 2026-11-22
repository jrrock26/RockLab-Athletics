import { useCallback, useEffect, useState } from 'react';
import Head from 'next/head';
import Link from 'next/link';
import { onAuthStateChanged } from 'firebase/auth';
import { collection, doc, getDoc, getDocs, query, setDoc, where } from 'firebase/firestore';
import { httpsCallable } from 'firebase/functions';
import { auth, db, functions } from '../lib/firebase';

/// The coach's approval queue. Without this the join page files requests into a list
/// nobody can see, which is worse than no join page at all.
///
/// Teams are found by head coach id plus the profile's teamIds. A collection-group query
/// over joinRequests would be denied: the read rule resolves membership with exists(),
/// which Firestore cannot evaluate for a list query -- the same trap that broke the
/// announcements query.
export default function Requests() {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [rows, setRows] = useState([]);
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  const load = useCallback(async (account) => {
    setLoading(true);
    setError('');
    try {
      const me = await getDoc(doc(db, 'users', account.uid));
      const profile = me.exists() ? me.data() : {};

      // Teams this account coaches, either as head coach or by membership list.
      const ids = new Set(Array.isArray(profile.teamIds) ? profile.teamIds : []);
      const headed = await getDocs(query(collection(db, 'teams'), where('headCoachId', '==', account.uid)))
        .catch(() => null);
      (headed?.docs || []).forEach((d) => ids.add(d.id));

      const collected = [];
      for (const teamId of ids) {
        // teamId is a PATH segment here, so the membership lookup inside the rule is a
        // fixed path and the query can be authorised.
        const snap = await getDocs(query(
          collection(db, 'teams', teamId, 'joinRequests'),
          where('status', '==', 'pending'),
        )).catch(() => null);
        (snap?.docs || []).forEach((d) => {
          collected.push({ id: d.id, teamId, ...d.data() });
        });
      }
      collected.sort((a, b) => String(a.athleteName).localeCompare(String(b.athleteName)));
      setRows(collected);
    } catch (err) {
      setError(err?.message || 'Could not load requests.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => onAuthStateChanged(auth, (account) => {
    setUser(account);
    if (account) load(account); else { setRows([]); setLoading(false); }
  }), [load]);

  async function approve(row) {
    setBusy(row.id);
    setError('');
    setNotice('');
    try {
      await httpsCallable(functions, 'approveTeamJoin')({ teamId: row.teamId, requestId: row.id });
      setNotice(`${row.athleteName} approved.`);
      setRows((prev) => prev.filter((r) => r.id !== row.id));
    } catch (err) {
      setError(err?.message || 'That request could not be approved.');
    } finally {
      setBusy('');
    }
  }

  /// Rejecting is a status write, not a callable: the rules already permit a coach to
  /// update a request on their own team, and no downstream document needs creating.
  async function reject(row) {
    setBusy(row.id);
    setError('');
    setNotice('');
    try {
      await setDoc(
        doc(db, 'teams', row.teamId, 'joinRequests', row.id),
        { status: 'rejected', reviewedBy: user.uid, reviewedAt: new Date() },
        { merge: true },
      );
      setNotice(`${row.athleteName} rejected.`);
      setRows((prev) => prev.filter((r) => r.id !== row.id));
    } catch (err) {
      setError(err?.message || 'That request could not be rejected.');
    } finally {
      setBusy('');
    }
  }

  return (
    <>
      <Head><title>Join requests · RockLab Athletics</title></Head>
      <main className="page">
        <h1>Join requests</h1>
        <p className="muted small">
          Approving links that family to the athlete. Rejecting tells them to ask again.
        </p>

        {notice && <p className="notice">{notice}</p>}
        {error && <p className="error">{error}</p>}

        {!user && <p className="muted">Sign in to see requests.</p>}
        {user && loading && <p className="muted">Loading…</p>}
        {user && !loading && rows.length === 0 && (
          <section className="card"><p className="muted">Nothing waiting. </p></section>
        )}

        {rows.map((row) => (
          <section className="card" key={`${row.teamId}:${row.id}`}>
            <h2>{row.athleteName || 'Unnamed athlete'}</h2>
            <p className="muted small">
              {(row.requesterName || row.requesterEmail || 'Someone')}
              {' · wants to join as '}
              {row.role === 'player' ? 'the athlete' : 'a parent or guardian'}
            </p>
            <div className="actions">
              <button type="button" onClick={() => approve(row)} disabled={busy === row.id}>
                {busy === row.id ? 'Working…' : 'Approve'}
              </button>
              <button type="button" className="link" onClick={() => reject(row)} disabled={busy === row.id}>
                Reject
              </button>
            </div>
          </section>
        ))}

        <p className="muted small">
          <Link href="/portal">Family view</Link> · <Link href="/support">Support</Link>
        </p>
      </main>
    </>
  );
}
