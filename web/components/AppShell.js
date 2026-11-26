import Link from 'next/link';
import Head from 'next/head';
import { useRouter } from 'next/router';
import { signOut } from 'firebase/auth';
import { auth } from '../lib/firebase';
import { personName } from '../lib/portal.mjs';
import { homeFor, railFor, roleLabel } from '../lib/nav';

/// The frame every signed-in screen sits in.
///
/// An athletic director works a desk for eight hours and touches the app at events, so
/// the web gets a persistent rail: every part of the organization one click away instead
/// of two. Coaches, staff, players and parents get the same frame carrying the links
/// their role is entitled to — the console is not the only role with more than one
/// screen worth visiting, and until this existed only the AD had a rail at all.
///
/// The rail collapses to a horizontal row below 900px so a coach checking a roster on a
/// phone is not squeezed.
export default function AppShell({ title, profile, user, children, art = 'arena.png' }) {
  const router = useRouter();
  const role = profile?.role || '';
  const name = personName(profile) || user?.email || '';
  const isAd = role === 'ad';
  const items = railFor(role);

  // trailingSlash is on, so /dashboard/ and /dashboard must both count as current.
  const here = (path) => {
    const p = (router.pathname || '/').replace(/\/$/, '');
    const t = path.replace(/\/$/, '');
    return p === t || (t !== '' && p.startsWith(`${t}/`));
  };
  const cls = (path) => (here(path) ? 'on' : undefined);

  // A back control on every page, because the browser button is the wrong size and in
  // the wrong place when you are clicking through a roster on a laptop. Hidden on the
  // landing page, where there is nothing to go back to.
  const canGoBack = (router.pathname || '/') !== '/';

  return (
    <>
      <Head><title>{title ? `${title} · RockLab Athletics` : 'RockLab Athletics'}</title></Head>
      <div className="app-bg" style={{ '--art': `url('/img/${art}')` }} />

      <header className="nav">
        {canGoBack && (
          <button type="button" className="back" onClick={() => router.back()} aria-label="Go back">
            ←
          </button>
        )}
        <Link href={homeFor(role)} className="brand">
          <span className="brand-mark">RL</span>
          <span className="brand-text">RockLab</span>
        </Link>

        <div className="nav-user">
          <Link href="/profile" className="who" title={name}>{name}</Link>
          {role && <span className="pill">{roleLabel(role)}</span>}
          <button type="button" className="link" onClick={() => signOut(auth)}>Sign out</button>
        </div>
      </header>

      {items.length > 0 ? (
        <div className="with-rail">
          <nav className="rail" aria-label="Sections">
            {items.map((item) => (
              <Link
                key={`${item.href}-${item.label}`}
                href={item.href}
                className={cls(item.href)}
              >
                {item.label}
              </Link>
            ))}
          </nav>
          <main className="page app-page">{children}</main>
        </div>
      ) : (
        <main className="page app-page">{children}</main>
      )}
    </>
  );
}
