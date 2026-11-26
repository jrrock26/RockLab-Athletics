import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useAuth } from './index';
import AppShell from '../components/AppShell';
import { loadMyTeams, teamLabel, teamSubtitle } from '../lib/myTeams';
import { displayName, formatRecord, myAthletes, recordFromGames } from '../lib/portal.mjs';

/// My teams — the screen every other member page hangs off.
///
/// iOS has a Teams tab because a coach, player and parent all start from "which teams am
/// I on". The portal rendered each team as a long card with its own tabs and nothing
/// above it, so a parent with two children on three teams scrolled one page to find the
/// third. This is that list, one card per team, with the portal still one click away for
/// the detail.
export default function MyTeams() {
  const { loading, user, profile } = useAuth();
  const [teams, setTeams] = useState([]);
  const [busy, setBusy] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    if (loading || !user || !profile) return undefined;
    let alive = true;
    (async () => {
      setBusy(true);
      try {
        const rows = await loadMyTeams(profile);
        if (alive) setTeams(rows);
      } catch (err) {
        if (alive) setError(err?.message || 'Your teams could not be loaded.');
      } finally {
        if (alive) setBusy(false);
      }
    })();
    return () => { alive = false; };
  }, [loading, user, profile]);

  if (loading) return <main className="page"><p>Loading…</p></main>;
  if (!user) {
    return (
      <main className="page">
        <p className="muted"><Link href="/">Sign in</Link> to see your teams.</p>
      </main>
    );
  }

  return (
    <AppShell title="My teams" profile={profile} user={user}>
      <h1>My teams</h1>

      {error && <p className="error">{error}</p>}
      {busy && <p className="muted">Loading your teams…</p>}

      {!busy && !error && teams.length === 0 && (
        <section className="card">
          <h2>No team yet</h2>
          <p className="muted">
            Your account is active, but no team has been shared with you. Your coach or
            athletic director adds you from their side.
          </p>
          <p className="small">
            <Link href="/join">Have a team code? Join a team</Link>.
          </p>
        </section>
      )}

      <ul className="team-grid">
        {teams.map((t) => {
          // The people this account is responsible for on this team: a guardian's
          // children, a player's own entry, empty for staff who follow the whole roster.
          const mine = myAthletes(t.roster, {
            uid: user.uid,
            linkedPlayerIds: profile && profile.linkedPlayerIds,
          });
          const record = formatRecord(recordFromGames(t.games));
          return (
            <li key={t.id}>
              <section className="card">
                <h2>{teamLabel(t.team)}</h2>
                <p className="muted small">
                  {[teamSubtitle(t.team), `Record ${record}`].filter(Boolean).join(' · ')}
                </p>

                {mine.length > 0 && (
                  <p className="small">
                    {mine.length === 1 ? 'Athlete' : 'Athletes'}:{' '}
                    {mine.map((a) => displayName(a)).join(', ')}
                  </p>
                )}

                {t.rosterRestricted && mine.length === 0 && (
                  <p className="small muted">
                    No athlete on this team is linked to your account yet.
                  </p>
                )}

                <nav className="row">
                  <Link className="link-card" href={`/team?id=${t.id}`}>Open team →</Link>
                  <Link className="link-card" href="/portal">Portal</Link>
                  <Link className="link-card" href="/schedule">Schedule</Link>
                </nav>
              </section>
            </li>
          );
        })}
      </ul>
    </AppShell>
  );
}
