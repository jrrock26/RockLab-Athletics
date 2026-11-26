import { useCallback, useEffect, useRef, useState } from 'react';
import Head from 'next/head';
import Link from 'next/link';
import AppShell from '../components/AppShell';
import Notifications from '../components/parent/Notifications';
import LinkAthlete from '../components/parent/LinkAthlete';
import AthleteCard from '../components/parent/AthleteCard';
import TeamForms from '../components/parent/TeamForms';
import Messages from '../components/parent/Messages';
import Account from '../components/parent/Account';
import {
  createUserWithEmailAndPassword,
  onAuthStateChanged,
  signInWithEmailAndPassword,
  updateProfile,
} from 'firebase/auth';
import {
  collection,
  doc,
  getDoc,
  getDocs,
  onSnapshot,
  query,
  serverTimestamp,
  setDoc,
  where,
} from 'firebase/firestore';
import { httpsCallable } from 'firebase/functions';
import { auth, db, functions } from '../lib/firebase';
import {
  eventTypesFor,
  normalizeRole,
  rsvpId,
  myAthletes,
  normalizeEmail,
  partitionEvents,
  recordFromGames,
  formatRecord,
  displayName,
  formatWhen,
  formLabel,
  personName,
  requirementStatus,
  RSVP_CHOICES,
  toMillis,
} from '../lib/portal.mjs';
// The roster, team, event and requirement queries live in lib/myTeams.js, shared with the
// rail's Teams/Schedule/Messages/Forms pages. Each of those queries has a shape
// firestore.rules depends on (the guardian fallback, the event type filter), so a second
// copy is a second thing to break when a rule moves.
import { loadMyTeams, loadRequirementsFor } from '../lib/myTeams';
import { buildNotifications } from '../lib/parent.mjs';

/// The family web app.
///
/// One page, four tabs per team, because a parent with two children needs one place
/// where "what do I owe, when is the next game, and how do I reach the coach" are all
/// answerable without installing an iPhone app. iOS remains the place for scoring and
/// compliance review; nothing here writes anything a coach has not authorised.
///
/// Every read is settled independently. An earlier version used `Promise.all`, and a
/// single 403 on the roster blanked the whole page — which is exactly the failure a
/// family reports as "the app is broken".
export default function Portal() {
  const [user, setUser] = useState(null);
  const [profile, setProfile] = useState(null);
  const [loading, setLoading] = useState(true);

  const [mode, setMode] = useState('signin');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const [invitations, setInvitations] = useState([]);
  const [teams, setTeams] = useState([]);
  const [notice, setNotice] = useState('');

  /// Requirements per athlete, keyed `${teamId}:${rosterEntryId}`. One record per
  /// athlete, never one per team: two children on the same team must not share a row.
  const [requirements, setRequirements] = useState({});
  const requested = useRef({});

  /// Answers keyed `${eventId}:${rosterEntryId}` so each child holds their own answer.
  const [rsvps, setRsvps] = useState({});
  const [savingRsvp, setSavingRsvp] = useState('');
  const rsvpRequested = useRef({});

  const [announcements, setAnnouncements] = useState({});

  /// Which tab is open per team. Local state, so switching teams does not reset all of
  /// them and a reload never loses more than the open tab.
  const [tabByTeam, setTabByTeam] = useState({});

  /// When this device last acknowledged notifications. Deliberately localStorage: the
  /// server has no per-device read state, and inventing one would need a schema the
  /// iOS client does not share.
  const [seenAt, setSeenAt] = useState(0);

  useEffect(() => {
    try {
      const stored = Number(window.localStorage.getItem('rocklab.notificationsSeen') || 0);
      if (Number.isFinite(stored)) setSeenAt(stored);
    } catch {
      // Private mode, storage disabled: notifications simply never look "seen".
    }
  }, []);

  const markSeen = useCallback(() => {
    const now = Date.now();
    setSeenAt(now);
    try {
      window.localStorage.setItem('rocklab.notificationsSeen', String(now));
    } catch {
      // Ignore: the state above still suppresses them for this session.
    }
  }, []);

  const setRsvp = useCallback(async (eventId, entryId, status) => {
    const key = `${eventId}:${entryId}`;
    setSavingRsvp(key);
    setError('');
    try {
      await setDoc(doc(db, 'events', eventId, 'rsvps', rsvpId(auth.currentUser.uid, entryId)), {
        eventId,
        userId: auth.currentUser.uid,
        respondentUserId: auth.currentUser.uid,
        athleteEntryId: entryId,
        status,
        updatedAt: serverTimestamp(),
      });
      setRsvps((prev) => ({ ...prev, [key]: status }));
    } catch (err) {
      setError(err?.message || 'That answer could not be saved.');
    } finally {
      setSavingRsvp('');
    }
  }, []);

  /// Pending invitations addressed to this exact address. The rule permits this query
  /// because it filters on email, matching the invitee clause.
  const loadInvitations = useCallback(async (account) => {
    if (!account || !account.email) return [];
    const snap = await getDocs(query(
      collection(db, 'invitations'),
      where('email', '==', normalizeEmail(account.email)),
      where('status', '==', 'pending'),
    ));
    const rows = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
    setInvitations(rows);
    return rows;
  }, []);

  /// One athlete's requirements. The per-player form documents under the roster entry
  /// ARE the record of what this family owes and has signed.
  const loadRequirements = useCallback(async (teamId, entryId, key) => {
    try {
      const forms = await loadRequirementsFor(teamId, entryId);
      const now = Date.now();
      // The query is shared; the row shape below is this page's presentation and stays
      // here, because the portal renders a due date and a status badge that the other
      // pages do not.
      const rows = forms.map((form) => ({
        id: form.id,
        raw: form,
        label: formLabel(form),
        status: requirementStatus(form, null, now),
        dueAt: form.dueDate,
        expiresAt: form.expiresAt,
      }));
      setRequirements((prev) => ({ ...prev, [key]: { rows, error: '' } }));
    } catch (err) {
      setRequirements((prev) => ({
        ...prev,
        [key]: { rows: [], error: err && err.message ? err.message : 'Requirements could not be loaded.' },
      }));
    }
  }, []);

  const refresh = useCallback(async (account) => {
    const snap = await getDoc(doc(db, 'users', account.uid));
    const data = snap.exists() ? snap.data() : null;
    setProfile(data);
    await loadInvitations(account);
    setTeams(await loadMyTeams(data));
  }, [loadInvitations]);

  useEffect(() => {
    return onAuthStateChanged(auth, async (account) => {
      setUser(account);
      if (!account) {
        setProfile(null);
        setInvitations([]);
        setTeams([]);
        setRequirements({});
        setLoading(false);
        return;
      }
      try {
        await refresh(account);
      } catch (err) {
        setError(err.message);
      } finally {
        setLoading(false);
      }
    });
  }, [refresh]);

  /// Fetch requirements once per athlete, after the teams resolve. The ref guard
  /// matters: this effect depends on `teams`, a new array on every load.
  useEffect(() => {
    if (!user || !teams.length) return;
    teams.forEach((t) => {
      myAthletes(t.roster, { uid: user.uid, linkedPlayerIds: profile && profile.linkedPlayerIds })
        .forEach((a) => {
          const key = `${t.id}:${a.id}`;
          if (requested.current[key]) return;
          requested.current[key] = true;
          loadRequirements(t.id, a.id, key);
        });
    });
  }, [teams, user, profile, loadRequirements]);

  const reloadAthlete = useCallback((teamId, entryId) => {
    loadRequirements(teamId, entryId, `${teamId}:${entryId}`);
  }, [loadRequirements]);

  const announceRequested = useRef({});

  useEffect(() => {
    if (!user || !teams.length) return;
    teams.forEach(async (t) => {
      if (announceRequested.current[t.id]) return;
      announceRequested.current[t.id] = true;
      try {
        // Read the board by id rather than querying the collection: the chats rule
        // decides access with a membership lookup, so a direct get is the reliable path.
        const chatSnap = await getDoc(doc(db, 'chats', `${t.id}_commBoard`));
        if (!chatSnap.exists()) return;
        const isFollower = normalizeRole(profile && profile.role) === 'follower';
        const byCategory = (categories) => getDocs(query(
          collection(db, 'chats', chatSnap.id, 'messages'),
          where('category', 'in', categories),
        ));
        const snap = await (isFollower
          ? byCategory(PUBLIC_COMM_CATEGORIES)
          : byCategory(ALL_COMM_CATEGORIES).catch(() => byCategory(PUBLIC_COMM_CATEGORIES)));
        const rows = snap.docs
          .map((d) => ({ id: d.id, teamId: t.id, chatId: chatSnap.id, ...d.data() }))
          .sort((a, b) => (Number(b.createdAt) || 0) - (Number(a.createdAt) || 0))
          .slice(0, 5);
        setAnnouncements((prev) => ({ ...prev, [t.id]: rows }));
      } catch {
        // Not permitted, or no board yet: the section simply does not appear.
      }
    });
  }, [teams, user, profile]);

  useEffect(() => {
    if (!user || !teams.length) return;
    teams.forEach((t) => {
      (t.events || []).forEach(async (e) => {
        if (rsvpRequested.current[e.id]) return;
        rsvpRequested.current[e.id] = true;
        try {
          const snap = await getDocs(query(
            collection(db, 'events', e.id, 'rsvps'),
            where('respondentUserId', '==', user.uid),
          ));
          const next = {};
          snap.docs.forEach((d) => {
            const data = d.data();
            if (data.athleteEntryId && data.status) {
              next[`${e.id}:${data.athleteEntryId}`] = data.status;
            }
          });
          if (Object.keys(next).length) setRsvps((prev) => ({ ...prev, ...next }));
        } catch {
          // No answers yet, or not permitted: say nothing rather than alarm.
        }
      });
    });
  }, [teams, user]);

  /// Live calendar, so a moved or cancelled event reaches the family without a reload.
  useEffect(() => {
    if (!user || teams.length === 0) return undefined;
    const types = eventTypesFor(normalizeRole(profile && profile.role));
    const unsubs = teams.map((t) => onSnapshot(
      query(
        collection(db, 'events'),
        where('teamId', '==', t.id),
        where('type', 'in', types),
      ),
      (snap) => {
        const rows = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
        setTeams((prev) => prev.map((x) => (x.id === t.id ? { ...x, events: rows } : x)));
      },
      () => { /* keep what was already fetched */ },
    ));
    return () => unsubs.forEach((u) => u());
  }, [user, teams.length, profile]);

  async function signIn(e) {
    e.preventDefault();
    setError('');
    setBusy(true);
    try {
      await signInWithEmailAndPassword(auth, email, password);
    } catch (err) {
      setError(humanAuthError(err));
    } finally {
      setBusy(false);
    }
  }

  async function signUp(e) {
    e.preventDefault();
    setError('');
    setBusy(true);
    try {
      const cred = await createUserWithEmailAndPassword(auth, email, password);
      if (name) await updateProfile(cred.user, { displayName: name });
      // An unprivileged record only. The invitation decides the real role, and
      // acceptance writes it server-side; a client must never choose its own.
      await setDoc(doc(db, 'users', cred.user.uid), {
        email: normalizeEmail(cred.user.email),
        name: name || '',
        role: 'follower',
      }, { merge: true });
    } catch (err) {
      setError(humanAuthError(err));
    } finally {
      setBusy(false);
    }
  }

  async function accept(invitation) {
    setBusy(true);
    setError('');
    setNotice('');
    try {
      await httpsCallable(functions, 'acceptInvitation')({
        invitationId: invitation.id,
        name: name || (user && user.displayName) || invitation.email,
      });
      setNotice(
        `You're in. ${invitation.teamName || invitation.schoolName || 'Your team'} is now on your account.`,
      );
      if (user) await refresh(user);
    } catch (err) {
      setError(err.message || 'That invitation could not be accepted.');
    } finally {
      setBusy(false);
    }
  }

  if (loading) return <main className="page"><p>Loading…</p></main>;

  if (!user) {
    return (
      <>
        <Head><title>Sign in · RockLab Athletics</title></Head>
        <main className="page">
          <h1>RockLab Athletics</h1>
          <p className="muted">
            Follow your athlete&apos;s team from any phone or computer — schedules, forms,
            documents, and a direct line to the coach. No app install needed.
          </p>

          <form className="card" onSubmit={mode === 'signin' ? signIn : signUp}>
            <h2>{mode === 'signin' ? 'Sign in' : 'Create your account'}</h2>
            {mode === 'signup' && (
              <label>
                Your name
                <input value={name} onChange={(e) => setName(e.target.value)} autoComplete="name" />
              </label>
            )}
            <label>
              Email
              <input
                type="email" value={email} required autoComplete="email"
                onChange={(e) => setEmail(e.target.value)}
              />
            </label>
            <label>
              Password
              <input
                type="password" value={password} required minLength={6}
                autoComplete={mode === 'signin' ? 'current-password' : 'new-password'}
                onChange={(e) => setPassword(e.target.value)}
              />
            </label>
            <button type="submit" disabled={busy}>
              {busy ? 'Working…' : mode === 'signin' ? 'Sign in' : 'Create account'}
            </button>
            {error && <p className="error">{error}</p>}
            <p className="small muted">
              {mode === 'signin' ? (
                <button type="button" className="link" onClick={() => { setMode('signup'); setError(''); }}>
                  I have an invitation and no account yet
                </button>
              ) : (
                <button type="button" className="link" onClick={() => { setMode('signin'); setError(''); }}>
                  I already have an account
                </button>
              )}
            </p>
            <p className="small muted">
              Use the exact email address your school invited — the match is exact.
              Forgot your password? <Link href="/auth/signin">Reset it</Link>.
            </p>
          </form>

          <p className="muted small">
            <Link href="/privacy">Privacy</Link> · <Link href="/support">Support</Link>
          </p>
        </main>
      </>
    );
  }

  const hasInvitations = invitations.length > 0;
  const nowMs = Date.now();

  /// One athlete list across every team, for the account panel's read-only view of what
  /// the school holds.
  const allAthletes = [];
  teams.forEach((t) => {
    myAthletes(t.roster, { uid: user.uid, linkedPlayerIds: profile && profile.linkedPlayerIds })
      .forEach((a) => {
        allAthletes.push({ teamId: t.id, entry: a, name: displayName(a) });
      });
  });

  /// Everything time-sensitive, across every athlete. Requirements feed both the
  /// "needs attention" block and the notification list, so they are assembled once.
  const requirementRows = [];
  const eventRows = [];
  teams.forEach((t) => {
    const athletes = myAthletes(t.roster, {
      uid: user.uid, linkedPlayerIds: profile && profile.linkedPlayerIds,
    });
    athletes.forEach((a) => {
      const rec = requirements[`${t.id}:${a.id}`];
      ((rec && rec.rows) || []).forEach((r) => {
        requirementRows.push({
          teamId: t.id,
          entryId: a.id,
          athleteName: displayName(a),
          formId: r.id,
          label: r.label,
          status: r.status,
          dueAt: r.dueAt,
          expiresAt: r.expiresAt,
        });
      });
    });
    (t.events || []).forEach((e) => {
      eventRows.push({ ...e, athleteEntryIds: athletes.map((a) => a.id) });
    });
  });

  const announcementRows = [];
  Object.keys(announcements).forEach((teamId) => {
    (announcements[teamId] || []).forEach((m) => {
      announcementRows.push({ ...m, teamId });
    });
  });

  const notifications = buildNotifications({
    nowMs,
    invitations,
    requirements: requirementRows,
    events: eventRows,
    announcements: announcementRows,
    rsvps,
    seenAt,
  });

  return (
    <AppShell title="Family portal" profile={profile} user={user}>
      <h1>{personName(profile, 'Your account')}</h1>
      <p className="muted small">
        {user.email}
        {profile && profile.role ? ` · ${profile.role}` : ''}
      </p>

      {notice && <p className="notice">{notice}</p>}
      {error && <p className="error">{error}</p>}

      <Notifications items={notifications} onMarkSeen={markSeen} />

      {hasInvitations && (
        <section className="card">
          <h2>Invitations waiting for you</h2>
          <ul>
            {invitations.map((inv) => (
              <li key={inv.id}>
                <strong>{inv.teamName || inv.schoolName || 'Your school'}</strong>
                <span className="muted">
                  {' · '}{inv.role}
                  {inv.expiresAt ? ` · expires ${formatWhen(toMillis(inv.expiresAt))}` : ''}
                </span>
                <button onClick={() => accept(inv)} disabled={busy} style={{ marginLeft: 12 }}>
                  Accept
                </button>
              </li>
            ))}
          </ul>
        </section>
      )}

      {teams.map((t) => {
        const athletes = myAthletes(t.roster, {
          uid: user.uid, linkedPlayerIds: profile && profile.linkedPlayerIds,
        });
        const { upcoming, past } = partitionEvents(t.events, nowMs);
        const record = formatRecord(recordFromGames(t.games));
        const label = [t.team.sportName, t.team.level].filter(Boolean).join(' ') || 'Team';
        const tab = tabByTeam[t.id] || 'overview';
        const teamAnnouncements = announcements[t.id] || [];

        const setTab = (next) => setTabByTeam((prev) => ({ ...prev, [t.id]: next }));

        return (
          <section className="card" key={t.id}>
            <h2>{label}</h2>
            <p className="muted small">
              {[t.team.season, t.team.gender].filter(Boolean).join(' · ')}
              {' · '}Record {record}
            </p>

            <nav className="tabs" aria-label={`${label} sections`}>
              {[
                { key: 'overview', text: `My athletes${athletes.length ? ` (${athletes.length})` : ''}` },
                { key: 'schedule', text: 'Schedule' },
                { key: 'forms', text: 'Forms' },
                { key: 'messages', text: 'Messages' },
              ].map((item) => (
                <button
                  key={item.key}
                  type="button"
                  className={tab === item.key ? 'tab on' : 'tab'}
                  onClick={() => setTab(item.key)}
                >
                  {item.text}
                </button>
              ))}
            </nav>

            {tab === 'overview' && (
              <>
                {athletes.length === 0 ? (
                  <p className="muted">
                    No athlete is linked to this account on this team yet.
                  </p>
                ) : (
                  <ul className="athletes">
                    {athletes.map((a) => (
                      <AthleteCard
                        key={a.id}
                        teamId={t.id}
                        athlete={a}
                        requirements={(requirements[`${t.id}:${a.id}`] || {}).rows || []}
                        uid={user.uid}
                        isGuardian={normalizeRole(profile && profile.role) === 'parent'}
                        onChanged={() => reloadAthlete(t.id, a.id)}
                      />
                    ))}
                  </ul>
                )}

                <LinkAthlete
                  teamId={t.id}
                  alreadyLinked={athletes}
                  disabled={normalizeRole(profile && profile.role) === 'follower'}
                />

                {teamAnnouncements.length > 0 && (
                  <>
                    <h3>From your coach</h3>
                    <ul className="announcements">
                      {teamAnnouncements.map((m) => (
                        <li key={m.id}>
                          <span className="muted small">
                            {m.senderName || 'Coach'} · {formatWhen(toMillis(m.createdAt))}
                          </span>
                          <div>{m.text}</div>
                        </li>
                      ))}
                    </ul>
                  </>
                )}
              </>
            )}

            {tab === 'schedule' && (
              <>
                <h3>Next up</h3>
                {upcoming.length === 0 ? (
                  <p className="muted">Nothing scheduled yet.</p>
                ) : (
                  <ul>
                    {upcoming.slice(0, 10).map((e) => (
                      <li key={e.id}>
                        <strong>{e.title || e.type}</strong>
                        <span className="muted"> · {formatWhen(toMillis(e.date))}</span>
                        {e.location ? <span className="muted"> · {e.location}</span> : null}
                        {e.notes ? <div className="small muted">{e.notes}</div> : null}

                        {athletes.length > 0 && (
                          <div className="rsvp">
                            {athletes.map((a) => {
                              const key = `${e.id}:${a.id}`;
                              const current = rsvps[key];
                              return (
                                <div className="rsvp-row" key={a.id}>
                                  <span className="muted small">{displayName(a)}</span>
                                  {RSVP_CHOICES.map((c) => (
                                    <button
                                      key={c.value}
                                      type="button"
                                      className={current === c.value ? 'choice on' : 'choice'}
                                      disabled={savingRsvp === key}
                                      onClick={() => setRsvp(e.id, a.id, c.value)}
                                    >
                                      {c.label}
                                    </button>
                                  ))}
                                </div>
                              );
                            })}
                          </div>
                        )}
                      </li>
                    ))}
                  </ul>
                )}

                {past.length > 0 && (
                  <>
                    <h3>Recently</h3>
                    <ul>
                      {past.slice(0, 5).map((e) => (
                        <li key={e.id}>
                          <span>{e.title || e.type}</span>
                          <span className="muted"> · {formatWhen(toMillis(e.date))}</span>
                        </li>
                      ))}
                    </ul>
                  </>
                )}

                <p className="small muted">
                  Times and locations come straight from your coach&apos;s schedule.
                </p>
              </>
            )}

            {tab === 'forms' && (
              <TeamForms teamId={t.id} athletes={athletes} uid={user.uid} />
            )}

            {tab === 'messages' && (
              <Messages
                teamId={t.id}
                uid={user.uid}
                senderName={personName(profile, 'Guardian')}
              />
            )}
          </section>
        );
      })}

      {!hasInvitations && profile && teams.length === 0 && (
        <section className="card">
          <h2>You&apos;re set up</h2>
          <p className="muted">
            Your account is active, but no team has been shared with you yet. Your coach
            or athletic director can add you from their side.
          </p>
        </section>
      )}

      <Account profile={profile} user={user} athletes={allAthletes} />

      <p className="muted small">
        <Link href="/privacy">Privacy</Link> · <Link href="/support">Support</Link>
      </p>
    </AppShell>
  );
}

/// Comm-board categories a school-level follower may read. Mirrors the follower branch
/// of `messageReadAllowed` in firestore.rules; drift here is not cosmetic, because
/// these values become an `in` filter and a value the rule rejects fails the query.
const PUBLIC_COMM_CATEGORIES = ['liveGame', 'gameday', 'fundraiser'];

/// Every comm-board category, in the order iOS stores them (`CommCategory`).
const ALL_COMM_CATEGORIES = ['general', 'liveGame', 'gameday', 'fundraiser'];

/// Firebase auth errors are written for developers. Say what to do instead.
function humanAuthError(err) {
  const code = String(err && err.code ? err.code : '');
  if (code.includes('invalid-credential') || code.includes('wrong-password')) {
    return 'That email and password don\u2019t match an account.';
  }
  if (code.includes('user-not-found')) return 'No account uses that email yet. Create one first.';
  if (code.includes('email-already-in-use')) return 'An account already exists for that email. Sign in instead.';
  if (code.includes('weak-password')) return 'Choose a password with at least 6 characters.';
  if (code.includes('invalid-email')) return 'That email address doesn\u2019t look right.';
  if (code.includes('too-many-requests')) return 'Too many attempts. Wait a moment and try again.';
  return err && err.message ? err.message : 'Something went wrong. Try again.';
}
