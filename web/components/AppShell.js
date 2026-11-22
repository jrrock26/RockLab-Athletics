import Link from 'next/link';
import Head from 'next/head';
import { useRouter } from 'next/router';
import { signOut } from 'firebase/auth';
import { auth } from '../lib/firebase';

/// The frame every signed-in screen sits in.
///
/// An athletic director works a desk for eight hours and touches the app at events, so
/// the web gets a persistent rail: every part of the organization one click away instead
/// of two. Everyone else gets the top tabs, which suit a phone. The rail collapses to
/// tabs below 900px so a coach checking a roster on a laptop is not squeezed.
const RAIL = [
  { href: '/dashboard', label: 'Teams' },
  { href: '/coaches', label: 'Coaches' },
  { href: '/calendar', label: 'Calendar' },
  { href: '/directory', label: 'Directory' },
  { href: '/import', label: 'Import' },
  { href: '/requests', label: 'Requests' },
  { href: '/reports', label: 'Reports' },
  { href: '/records', label: 'Records' },
  { href: '/audit', label: 'Audit log' },
  { href: '/portal', label: 'Team portal' },
  { href: '/profile', label: 'Profile' },
];

export default function AppShell({ title, profile, user, children, art = 'arena.png' }) {
  const router = useRouter();
  const role = profile?.role || '';
  const name = profile?.name || user?.email || '';
  const isAd = role === 'ad';

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
          {!isAd && (
            <>
              {(role === 'coach') && (
                <Link href="/requests" className={cls('/requests')}>Requests</Link>
              )}
              <Link href="/portal" className={cls('/portal')}>Portal</Link>
              <Link href="/profile" className={cls('/profile')}>Profile</Link>
            </>
          )}
        </nav>

        <div className="nav-user">
          <Link href="/profile" className="who" title={name}>{name}</Link>
          {role && <span className="pill">{role}</span>}
          <button type="button" className="link" onClick={() => signOut(auth)}>Sign out</button>
        </div>
      </header>

      {isAd ? (
        <div className="with-rail">
          <nav className="rail">
            {RAIL.map((item) => (
              <Link key={item.href} href={item.href} className={cls(item.href)}>
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
