import { useEffect, useState } from 'react';
import Head from 'next/head';
import Link from 'next/link';
import { useRouter } from 'next/router';
import {
  getCurrentEmail,
  isDevEmail,
  reloadCurrentUser,
  resendVerificationEmail,
} from '../../lib/auth';

/// Sits between sign-up and the app while Firebase confirms the address.
///
/// It polls rather than asking the user to click "I've verified": the email link
/// usually opens in another tab, and a person who returns to this one should find
/// themselves already through. `reload()` is what refreshes `emailVerified`;
/// reading the cached flag alone would never change.
export default function Verify() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const address = getCurrentEmail();
    setEmail(address || '');
    if (!address) {
      router.replace('/auth/signin');
    }
  }, [router]);

  useEffect(() => {
    if (!email) return undefined;

    // Internal accounts bypass the gate, the same way the iOS client does.
    if (isDevEmail(email)) return undefined;

    let cancelled = false;
    let timer;

    const tick = async () => {
      if (cancelled) return;
      try {
        const verified = await reloadCurrentUser();
        if (cancelled) return;
        if (verified) {
          router.replace('/');
          return;
        }
      } catch {
        // A failed reload is not fatal; keep waiting.
      }
      if (!cancelled) timer = setTimeout(tick, 3000);
    };

    tick();
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [email, router]);

  async function resend() {
    setError('');
    setNotice('');
    setBusy(true);
    try {
      await resendVerificationEmail();
      setNotice('Sent. Check the inbox and the spam folder for that address.');
    } catch (err) {
      setError(
        err?.code === 'auth/too-many-requests'
          ? 'Too many emails requested. Wait a few minutes.'
          : 'Could not send the email. Try again shortly.',
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <Head>
        <title>Verify your email · RockLab Athletics</title>
      </Head>
      <main className="page" style={{ maxWidth: 420 }}>
        <h1>Verify your email</h1>
        <p className="muted">
          We sent a verification link{email ? ' to ' : ''}
          {email && <strong>{email}</strong>}. This page updates by itself once the
          address is confirmed.
        </p>

        <div className="card">
          {isDevEmail(email) ? (
            <>
              <p className="ok">Internal account: verification is not required.</p>
              <button type="button" onClick={() => router.replace('/')}>
                Continue to the app
              </button>
            </>
          ) : (
            <>
              <button type="button" onClick={resend} disabled={busy}>
                {busy ? 'Sending…' : 'Resend verification email'}
              </button>
              {notice && <p className="ok">{notice}</p>}
              {error && <p className="error">{error}</p>}
              <p className="small muted">
                Nothing arriving? Check spam, then ask your athletic director to confirm
                the address on file matches exactly.
              </p>
            </>
          )}

          <hr className="rule" />
          <p className="small muted">
            Wrong address? <Link href="/auth/signin">Sign in</Link> with another account.
          </p>
        </div>
      </main>
    </>
  );
}
