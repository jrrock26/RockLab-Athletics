import Link from 'next/link';
import { signOut } from 'firebase/auth';
import { auth } from '../lib/firebase';
import { useAuth } from './index';
import AppShell from '../components/AppShell';
import { personName } from '../lib/portal.mjs';

/// Profile: who you are, what you can reach, and the way out.
///
/// The iOS app has had ProfileView since the start; the web had no destination for it at
/// all, so the identity in the header was a dead label. Editing a name or a phone number
/// is not here yet -- the iOS profile writes to fields the web has no validated form for,
/// and a half-validated write is worse than a read-only page.
export default function Profile() {
  const { loading, user, profile } = useAuth();

  if (loading) return <main className="page"><p>Loading…</p></main>;
  if (!user) {
    return (
      <main className="page">
        <p className="muted"><Link href="/">Sign in</Link> to see your profile.</p>
      </main>
    );
  }

  const initials = String(personName(profile) || user.email || '?')
    .split(/\s+/)
    .slice(0, 2)
    .map((p) => p[0])
    .join('')
    .toUpperCase();

  const teams = Array.isArray(profile?.teamIds) ? profile.teamIds : [];

  return (
    <AppShell title="Profile" profile={profile} user={user}>
      <h1>Profile</h1>

      <section className="card profile-head">
        <span className="avatar lg">{initials}</span>
        <div>
          <h2>{personName(profile, 'Unnamed account')}</h2>
          <p className="muted small">{user.email}</p>
          {profile?.role && <span className="pill">{profile.role}</span>}
        </div>
      </section>

      <section className="card">
        <h2>School</h2>
        {profile?.schoolName || profile?.schoolId ? (
          <p>{profile.schoolName || profile.schoolId}</p>
        ) : (
          <p className="muted">
            No school attached. An athletic director adds coaches and staff to a school.
          </p>
        )}
        {teams.length > 0 && (
          <p className="muted small">{teams.length} team{teams.length === 1 ? '' : 's'} attached</p>
        )}
      </section>

      <section className="card">
        <h2>Account</h2>
        <ul className="plain-list">
          <li><Link href="/portal">Team portal</Link></li>
          <li><Link href="/privacy">Privacy</Link></li>
          <li><Link href="/support">Support</Link></li>
          {profile?.role === 'ad' && <li><Link href="/billing">Plan and billing</Link></li>}
        </ul>
        <button type="button" onClick={() => signOut(auth)}>Sign out</button>
      </section>

      <p className="muted small">
        Need the account itself removed? Account deletion is in the iOS app under
        Settings, where it can confirm what will be erased. Doing it from a browser
        without that confirmation would be too easy to trigger by accident.
      </p>
    </AppShell>
  );
}
