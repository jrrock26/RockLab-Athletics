import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useAuth } from './index';
import AppShell from '../components/AppShell';
import TeamForms from '../components/parent/TeamForms';
import { loadMyTeams, loadRequirementsFor, teamLabel } from '../lib/myTeams';
import {
  displayName,
  formatWhen,
  formLabel,
  isOutstanding,
  myAthletes,
  requirementStatus,
  REQUIREMENT_LABELS,
  toMillis,
} from '../lib/portal.mjs';

/// What this family still owes, in one place.
///
/// iOS has MyFormsView for the same reason: a physical, a code of conduct and a
/// concussion waiver live under each roster entry, and a guardian with two athletes on
/// two teams was reading them from inside each team's card in the portal. The signing a
/// family can actually do is the team-form section below — the per-athlete paperwork is
/// listed here with its state and a link into the portal, because that panel already
/// owns the upload and signature flow and duplicating it would give two places to fix
/// when a rule changes.
export default function FormsPage() {
  const { loading, user, profile } = useAuth();
  const [teams, setTeams] = useState([]);
  const [requirements, setRequirements] = useState({});
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

        // One requirements read per athlete, keyed the same way the portal keys it, so
        // two children on one team never share a row.
        const loaded = {};
        for (const t of rows) {
          const mine = myAthletes(t.roster, {
            uid: user.uid,
            linkedPlayerIds: profile.linkedPlayerIds,
          });
          for (const athlete of mine) {
            const key = `${t.id}:${athlete.id}`;
            try {
              const forms = await loadRequirementsFor(t.id, athlete.id);
              loaded[key] = forms;
            } catch {
              loaded[key] = [];
            }
          }
        }
        if (alive) setRequirements(loaded);
      } catch (err) {
        if (alive) setError(err?.message || 'Your forms could not be loaded.');
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
        <p className="muted"><Link href="/">Sign in</Link> to see your forms.</p>
      </main>
    );
  }

  const now = Date.now();
  const withAthletes = teams
    .map((t) => ({
      team: t,
      athletes: myAthletes(t.roster, {
        uid: user.uid,
        linkedPlayerIds: profile && profile.linkedPlayerIds,
      }),
    }))
    .filter((row) => row.athletes.length > 0);

  return (
    <AppShell title="Forms" profile={profile} user={user}>
      <h1>Forms</h1>
      <p className="muted small">
        Paperwork your school keeps for each athlete. Anything outstanding is listed
        first, with the date it is due.
      </p>

      {error && <p className="error">{error}</p>}
      {busy && <p className="muted">Loading your forms…</p>}

      {!busy && !error && withAthletes.length === 0 && (
        <section className="card">
          <p className="muted">
            No athlete is linked to this account yet. Once your coach confirms you, the
            forms for that athlete appear here.
          </p>
          <p className="small"><Link href="/portal">Go to the portal</Link></p>
        </section>
      )}

      {withAthletes.map(({ team, athletes }) => {
        const paperwork = [];
        athletes.forEach((athlete) => {
          const rows = requirements[`${team.id}:${athlete.id}`] || [];
          rows.forEach((form) => {
            const status = requirementStatus(form, null, now);
            paperwork.push({
              key: `${athlete.id}:${form.id}`,
              athlete: displayName(athlete),
              label: formLabel(form),
              status,
              dueAt: form.dueDate,
            });
          });
        });
        // Outstanding first, then whatever is already done, each by deadline.
        paperwork.sort((a, b) => {
          const aOut = isOutstanding(a.status) ? 0 : 1;
          const bOut = isOutstanding(b.status) ? 0 : 1;
          if (aOut !== bOut) return aOut - bOut;
          return (toMillis(a.dueAt) || Number.MAX_SAFE_INTEGER)
            - (toMillis(b.dueAt) || Number.MAX_SAFE_INTEGER);
        });

        return (
          <section key={team.id}>
            <h2>{teamLabel(team.team)}</h2>

            {paperwork.length > 0 && (
              <section className="card">
                <h3>Paperwork</h3>
                <ul className="req-list">
                  {paperwork.map((row) => (
                    <li key={row.key} className="roster-row">
                      <span>
                        <strong>{row.label}</strong>
                        <span className="muted small"> · {row.athlete}</span>
                        {row.dueAt ? (
                          <span className="muted small"> · due {formatWhen(toMillis(row.dueAt))}</span>
                        ) : null}
                        <span className={`badge ${row.status}`}>
                          {REQUIREMENT_LABELS[row.status] || row.status}
                        </span>
                      </span>
                    </li>
                  ))}
                </ul>
                <p className="small">
                  <Link href="/portal">Sign or upload in the portal →</Link>
                </p>
              </section>
            )}

            <TeamForms teamId={team.id} athletes={athletes} uid={user.uid} />
          </section>
        );
      })}
    </AppShell>
  );
}
