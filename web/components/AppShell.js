import Link from 'next/link';
import Head from 'next/head';
import { useRouter } from 'next/router';
import { signOut } from 'firebase/auth';
import { auth } from '../lib/firebase';

/// The frame every signed-in screen sits in.
///
/// The first version of the web app had no frame at all: each page rendered a bare
/// <main> with no way to tell who you were signed in as and no way out except
/// navigating to the root and finding a sign-out button there. This gives every page the
/// same header (identity, role, navigation, sign out) over the app's arena artwork, so
/// the web feels like the same product as the iOS app rather than a form.
///
/// The active page is marked. Without it, clicking a link to the page you are already on
/// does nothing visible and reads as a broken tab.
export default function AppShell({ title, profile, user, children, art = 'arena.png' }) {
  const router = useRouter();
  const role = profile?.role || '';
  const name = profile?.name || user?.email || '';

  // trailingSlash is on, so /dashboard/ and /dashboard must both count as current.
  const here = (path) => {
    const p = (router.pathname || '/').replace(/\/$/, '');
    const t = path.replace(/\/$/, '');
    return p === t || (t !== '' && p.startsWith(`${t}/`));
  };
  const cls = (path) => (here(path) ? 'on' : undefined);

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
          {role === 'ad' && <Link href="/dashboard" className={cls('/dashboard')}>Teams</Link>}
          {role === 'ad' && <Link href="/import" className={cls('/import')}>Import</Link>}
          {(role === 'ad' || role === 'coach') && (
            <Link href="/requests" className={cls('/requests')}>Requests</Link>
          )}
          <Link href="/portal" className={cls('/portal')}>Portal</Link>
          <Link href="/profile" className={cls('/profile')}>Profile</Link>
        </nav>

        <div className="nav-user">
          <Link href="/profile" className="who" title={name}>{name}</Link>
          {role && <span className="pill">{role}</span>}
          <button type="button" className="link" onClick={() => signOut(auth)}>Sign out</button>
        </div>
      </header>

      <main className="page app-page">{children}</main>
    </>
  );
}
