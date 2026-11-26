import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useAuth } from './index';
import AppShell from '../components/AppShell';
import Messages from '../components/parent/Messages';
import { loadMyTeams, teamLabel, teamSubtitle } from '../lib/myTeams';
import { personName } from '../lib/portal.mjs';

/// Messages, one channel per team.
///
/// iOS has a Chat tab with three channels per team (team, parent, staff). The web has
/// the parent channel wired end to end — `Messages` + `parentData` satisfy the chats
/// rules and write the same documents iOS reads — so that is what this page exposes,
/// rather than inventing a second composer for the other two channels. A family that
/// needs the coach uses this; team and staff chat stay on the phone until the web has a
/// chat surface worth using.
export default function MessagesPage() {
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
        if (alive) setError(err?.message || 'Your messages could not be loaded.');
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
        <p className="muted"><Link href="/">Sign in</Link> to see your messages.</p>
      </main>
    );
  }

  // The sender name is what other people in the channel see, so it falls back the same
  // way the server-side writes do: profile name, then Auth display name, then a role.
  const senderName = personName(profile, '') || user.displayName || 'Team member';

  return (
    <AppShell title="Messages" profile={profile} user={user}>
      <h1>Messages</h1>
      <p className="muted small">
        One channel per team. Your coach opens the channel; until then, announcements
        still appear on the portal.
      </p>

      {error && <p className="error">{error}</p>}
      {busy && <p className="muted">Loading your channels…</p>}

      {!busy && !error && teams.length === 0 && (
        <section className="card">
          <p className="muted">No team is on this account yet, so there is nothing to read.</p>
          <p className="small"><Link href="/portal">Go to the portal</Link></p>
        </section>
      )}

      {teams.map((t) => (
        <section className="card" key={t.id}>
          <h2>{teamLabel(t.team)}</h2>
          <p className="muted small">{teamSubtitle(t.team)}</p>
          <Messages
            teamId={t.id}
            uid={user.uid}
            senderName={senderName}
          />
          <p className="small">
            <Link href={`/team?id=${t.id}`}>Open team →</Link>
          </p>
        </section>
      ))}
    </AppShell>
  );
}
