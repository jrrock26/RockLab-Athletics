import Link from 'next/link';
import Head from 'next/head';
import { signOut } from 'firebase/auth';
import { auth } from '../lib/firebase';

/// The frame every signed-in screen sits in.
///
/// The first version of the web app had no frame at all: each page rendered a bare
/// <main> with no way to tell who you were signed in as and no way out except
/// navigating to the root and finding a sign-out button there. This gives every page the
/// same header (identity, role, navigation, sign out) over the app's arena artwork, so
/// the web feels like the same product as the iOS app rather than a form.
export default function AppShell({ title, profile, user, children, art = 'arena.png' }) {
  const role = profile?.role || '';
  const name = profile?.name || user?.email || '';

  return (
    <>
      <Head><title>{title ? `${title} · RockLab Athletics` : 'RockLab Athletics'}</title></Head>
      <div className="app-bg" style={{ '--art': `url('/img/${art}')` }} />

      <header className="nav">
        <Link href="/" className="brand">
          <span className="brand-mark">RL</span>
          <span className="brand-text">RockLab</span>
        </Link>

        <nav className="nav-links">
          {role === 'ad' && <Link href="/dashboard">Teams</Link>}
          {role === 'ad' && <Link href="/import">Import</Link>}
          {role === 'ad' && <Link href="/requests">Requests</Link>}
          <Link href="/portal">Portal</Link>
        </nav>

        <div className="nav-user">
          <span className="who" title={name}>{name}</span>
          {role && <span className="pill">{role}</span>}
          <button type="button" className="link" onClick={() => signOut(auth)}>Sign out</button>
        </div>
      </header>

      <main className="page app-page">{children}</main>
    </>
  );
}
