import { useCallback, useEffect, useRef, useState } from 'react';
import Head from 'next/head';
import Link from 'next/link';
import {
  createUserWithEmailAndPassword,
  onAuthStateChanged,
  signInWithEmailAndPassword,
  signOut,
  updateProfile,
} from 'firebase/auth';
import { collection, doc, getDoc, getDocs, limit, orderBy, query, serverTimestamp, setDoc, where } from 'firebase/firestore';
import { httpsCallable } from 'firebase/functions';
import { auth, db, functions } from '../lib/firebase';
import {
  VISIBLE_EVENT_TYPES,
  REQUIREMENT_LABELS,
  isAwaitingReview,
  isOutstanding,
  myAthletes,
  normalizeEmail,
  outstandingRequirements,
  partitionEvents,
  recordFromGames,
  formatRecord,
  displayName,
  formatWhen,
  requirementStatus,
  toMillis,
} from '../lib/portal.mjs';

/// The parent-facing web app. Exists so a family without an iPhone can still take
/// part: sign in (or create an account), accept the invitation the school sent,
/// and see their athlete's team. iOS remains the place for scoring; this is the
/// reach fix, not a second product.
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
  /// athlete, never one per team: two children on the same team must not share a
  /// row, which is the entire point of a multi-athlete view.
  const [requirements, setRequirements] = useState({});
  const [signatures, setSignatures] = useState({});
  const [submitting, setSubmitting] = useState('');
  const requested = useRef({});

  /// Answers keyed `${eventId}:${rosterEntryId}` so two children on one team each
  /// hold their own answer — the whole point of the composite document id.
  const [rsvps, setRsvps] = useState({});
  const [savingRsvp, setSavingRsvp] = useState('');
  const rsvpRequested = useRef({});

  const setRsvp = useCallback(async (eventId, entryId, status) => {
    const key = `${eventId}:${entryId}`;
    setSavingRsvp(key);
    setError('');
    try {
      await setDoc(doc(db, 'events', eventId, 'rsvps', `${auth.currentUser.uid}__${entryId}`), {
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

  /// Pending invitations addressed to this exact address. The rule permits this
  /// query because it filters on email, matching the invitee clause.
  const loadInvitations = useCallback(async (account) => {
    if (!account?.email) return [];
    const snap = await getDocs(query(
      collection(db, 'invitations'),
      where('email', '==', normalizeEmail(account.email)),
      where('status', '==', 'pending'),
    ));
    const rows = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
    setInvitations(rows);
    return rows;
  }, []);

  /// The roster a guardian is allowed to see. Listing the whole roster is
  /// staff-only (entries carry other families' contact details), so a follower
  /// falls back to reading just the entries that name them. Doing this per
  /// document keeps the rule checkable and the exposure minimal.
  const loadRoster = useCallback(async (teamId, linkedIds) => {
    try {
      const snap = await getDocs(collection(db, 'teams', teamId, 'roster'));
      return { entries: snap.docs.map((d) => ({ id: d.id, ...d.data() })), restricted: false };
    } catch (err) {
      // A follower may not list the roster, so ask for exactly what is permitted:
      // entries that name this account, plus any ids the profile links. Querying
      // guardianUserIds is essential — driving this off linkedPlayerIds alone made
      // a second child invisible, because that field is client-written and only
      // ever held the first invitation's entry.
      const uid = auth.currentUser?.uid;
      const ids = Array.isArray(linkedIds) ? linkedIds : [];
      const [named, ...individual] = await Promise.all([
        uid
          ? getDocs(query(
              collection(db, 'teams', teamId, 'roster'),
              where('guardianUserIds', 'array-contains', uid),
            )).catch(() => null)
          : null,
        ...ids.map((entryId) => getDoc(doc(db, 'teams', teamId, 'roster', entryId)).catch(() => null)),
      ]);

      const byId = new Map();
      (named?.docs || []).forEach((d) => byId.set(d.id, { id: d.id, ...d.data() }));
      individual.forEach((snap) => {
        if (snap && snap.exists()) byId.set(snap.id, { id: snap.id, ...snap.data() });
      });
      return { entries: [...byId.values()], restricted: true };
    }
  }, []);

  /// Everything the portal displays for one team. The event query carries the
  /// type filter deliberately: the rule grants a follower the calendar except
  /// practices, and an unfiltered query is rejected outright. Each read is
  /// settled independently so one denied collection cannot blank the page.
  const loadTeam = useCallback(async (teamId, linkedIds) => {
    const [teamSnap, roster, eventsSnap, gamesSnap] = await Promise.all([
      getDoc(doc(db, 'teams', teamId)).catch(() => null),
      loadRoster(teamId, linkedIds),
      getDocs(query(
        collection(db, 'events'),
        where('teamId', '==', teamId),
        where('type', 'in', VISIBLE_EVENT_TYPES),
      )).catch(() => null),
      getDocs(query(collection(db, 'games'), where('teamId', '==', teamId))).catch(() => null),
    ]);
    return {
      id: teamId,
      team: teamSnap && teamSnap.exists() ? teamSnap.data() : {},
      roster: roster.entries,
      rosterRestricted: roster.restricted,
      events: eventsSnap ? eventsSnap.docs.map((d) => ({ id: d.id, ...d.data() })) : [],
      games: gamesSnap ? gamesSnap.docs.map((d) => ({ id: d.id, ...d.data() })) : [],
    };
  }, [loadRoster]);

  const loadTeams = useCallback(async (account, profileData) => {
    const ids = Array.isArray(profileData?.teamIds) ? profileData.teamIds : [];
    if (!ids.length) {
      setTeams([]);
      return;
    }
    const linked = profileData?.linkedPlayerIds;
    setTeams(await Promise.all(ids.map((id) => loadTeam(id, linked))));
  }, [loadTeam]);

  /// One athlete's requirements. The per-player form documents under the roster
  /// entry ARE the record of what this family owes and has signed, so this needs no
  /// second read of the team-level submissions collection. A denial is caught here
  /// and shown per athlete rather than blanking the page.
  const loadRequirements = useCallback(async (teamId, entryId, key) => {
    try {
      const snap = await getDocs(collection(db, 'teams', teamId, 'roster', entryId, 'forms'));
      const now = Date.now();
      const rows = snap.docs.map((d) => {
        const form = { id: d.id, ...d.data() };
        return {
          id: d.id,
          raw: form,
          label: FORM_LABELS[form.type] || form.type || 'Requirement',
          status: requirementStatus(form, null, now),
          dueAt: form.dueDate,
        };
      });
      setRequirements((prev) => ({ ...prev, [key]: { rows, error: '' } }));
    } catch (err) {
      setRequirements((prev) => ({
        ...prev,
        [key]: { rows: [], error: err?.message || 'Requirements could not be loaded.' },
      }));
    }
  }, []);

  /// Signing is the guardian's own act, so the name is typed rather than defaulted
  /// from the profile — a prefilled signature is not a signature. The write names
  /// the guardian's uid, so the stored record says who actually signed; the roster
  /// form is already the guardian's own document, and the rules pin the status to
  /// `submitted` so this can never self-approve.
  const submitRequirement = useCallback(async (teamId, entryId, row, key) => {
    const signedByName = String(signatures[key] || '').trim();
    if (!signedByName) {
      setError('Type your name to sign before completing this requirement.');
      return;
    }
    setSubmitting(key);
    setError('');
    try {
      const isGuardian = profile?.role === 'parent';
      await setDoc(
        doc(db, 'teams', teamId, 'roster', entryId, 'forms', row.id),
        {
          formId: row.id,
          rosterEntryId: entryId,
          teamId,
          status: 'submitted',
          signedByName,
          // Epoch SECONDS, matching how iOS writes signedAt and how toMillis reads it.
          signedAt: Date.now() / 1000,
          submittedBy: user.uid,
          ...(isGuardian ? { parentSignedByName: signedByName } : {}),
          updatedAt: serverTimestamp(),
        },
        { merge: true },
      );
      // Show it immediately: a submission that vanishes until reload looks lost.
      const reqKey = `${teamId}:${entryId}`;
      setRequirements((prev) => ({
        ...prev,
        [reqKey]: {
          rows: (prev[reqKey]?.rows || []).map((r) =>
            r.id === row.id ? { ...r, status: 'pending_approval' } : r,
          ),
          error: '',
        },
      }));
      setNotice(`${row.label} submitted. Your coach still has to approve it.`);
    } catch (err) {
      setError(err?.message || 'That requirement could not be submitted.');
    } finally {
      setSubmitting('');
    }
  }, [signatures, profile, user]);

  const refresh = useCallback(async (account) => {
    const snap = await getDoc(doc(db, 'users', account.uid));
    const data = snap.exists() ? snap.data() : null;
    setProfile(data);
    await loadInvitations(account);
    await loadTeams(account, data);
  }, [loadInvitations, loadTeams]);

  useEffect(() => {
    return onAuthStateChanged(auth, async (account) => {
      setUser(account);
      if (!account) {
        setProfile(null);
        setInvitations([]);
        setTeams([]);
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
  /// matters: this effect depends on `teams`, which is a new array on every load,
  /// so without it each render would start another identical read.
  useEffect(() => {
    if (!user || !teams.length) return;
    teams.forEach((t) => {
      myAthletes(t.roster, { uid: user.uid, linkedPlayerIds: profile?.linkedPlayerIds })
        .forEach((a) => {
          const key = `${t.id}:${a.id}`;
          if (requested.current[key]) return;
          requested.current[key] = true;
          loadRequirements(t.id, a.id, key);
        });
    });
  }, [teams, user, profile, loadRequirements]);

  /// Recent comm-board posts, per team. Read-only on web by design: posting stays in
  /// the app where moderation and reporting already live, but a guardian must be able
  /// to see what the coach announced without installing anything.
  const [announcements, setAnnouncements] = useState({});
  const announceRequested = useRef({});

  useEffect(() => {
    if (!user || !teams.length) return;
    teams.forEach(async (t) => {
      if (announceRequested.current[t.id]) return;
      announceRequested.current[t.id] = true;
      try {
        // Read the board by id rather than querying the collection: the chats rule
        // decides access with an exists() lookup on the caller's membership, and
        // Firestore cannot satisfy that for a list query, so the query is denied
        // even when the caller is entitled. A direct get has no such problem.
        const chatSnap = await getDoc(doc(db, 'chats', `${t.id}_commBoard`));
        if (!chatSnap.exists()) return;
        // Under the "only categorised posts are public" rule, a follower may read
        // comm-board posts carrying a public category and nothing else. Filtering on
        // `category` is what makes the query admissible; sorting in memory avoids a
        // composite index on category + createdAt, which would otherwise fail with a
        // missing-index error that the catch below would swallow.
        const snap = await getDocs(query(
          collection(db, 'chats', chatSnap.id, 'messages'),
          where('category', 'in', PUBLIC_COMM_CATEGORIES),
        ));
        const rows = snap.docs
          .map((d) => ({ id: d.id, ...d.data() }))
          .sort((a, b) => (Number(b.createdAt) || 0) - (Number(a.createdAt) || 0))
          .slice(0, 5);
        setAnnouncements((prev) => ({ ...prev, [t.id]: rows }));
      } catch (err) {
        // Not permitted, or no board yet: the section simply does not appear.
      }
    });
  }, [teams, user]);
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
        } catch (err) {
          // No answers yet, or not permitted: say nothing rather than alarm.
        }
      });
    });
  }, [teams, user]);


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
        name: name || user?.displayName || invitation.email,
      });
      setNotice(
        `You're in. ${invitation.teamName || invitation.schoolName || 'Your team'} is now on your account.`,
      );
      if (user) await refresh(user);
    } catch (err) {
      // The callable returns plain-language reasons (expired, cancelled, already
      // accepted), so show them rather than a generic failure.
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
            Follow your athlete&apos;s team from any phone or computer — schedules, results
            and roster. No app install needed.
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

  return (
    <>
      <Head><title>Your teams · RockLab Athletics</title></Head>
      <main className="page">
        <h1>{profile?.name || user.displayName || 'Your account'}</h1>
        <p className="muted small">
          {normalizeEmail(user.email)}
          {' · '}
          <button className="link" onClick={() => signOut(auth)}>Sign out</button>
        </p>

        {notice && <p className="notice">{notice}</p>}
        {error && <p className="error">{error}</p>}

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

        {!hasInvitations && !profile && (
          <section className="card">
            <h2>No invitation found yet</h2>
            <p className="muted">
              You&apos;re signed in as <strong>{normalizeEmail(user.email)}</strong>, but nothing
              has been sent to this address. Ask your athletic director to invite this exact
              address — a different spelling won&apos;t match.
            </p>
          </section>
        )}

        {teams.map((t) => {
          const athletes = myAthletes(t.roster, {
            uid: user.uid,
            linkedPlayerIds: profile?.linkedPlayerIds,
          });
          const { upcoming, past } = partitionEvents(t.events, Date.now());
          const record = formatRecord(recordFromGames(t.games));
          const label = [t.team.sportName, t.team.level].filter(Boolean).join(' ') || 'Team';

          return (
            <section className="card" key={t.id}>
              <h2>{label}</h2>
              <p className="muted small">
                {[t.team.season, t.team.gender].filter(Boolean).join(' · ')}
                {' · '}Record {record}
              </p>

              {athletes.length > 0 && (
                <>
                  <h3>Your athlete{athletes.length > 1 ? 's' : ''}</h3>
                  <ul className="athletes">
                    {athletes.map((a) => {
                      const reqKey = `${t.id}:${a.id}`;
                      const reqRecord = requirements[reqKey];
                      const rows = reqRecord?.rows || [];
                      const outstanding = outstandingRequirements(rows);
                      // "All requirements complete" above three Pending approval badges
                      // read as a flat contradiction in the live screenshot. Waiting on
                      // staff is its own state, so it gets its own words.
                      const awaitingCount = rows.filter((r) => isAwaitingReview(r.status)).length;
                      return (
                        <li key={a.id}>
                          <strong>{displayName(a)}</strong>
                          {a.jerseyNumber ? <span className="muted"> · #{a.jerseyNumber}</span> : null}
                          {a.position ? <span className="muted"> · {a.position}</span> : null}

                          <div className="requirements">
                            {reqRecord?.error && <p className="error small">{reqRecord.error}</p>}
                            {!reqRecord && <p className="muted small">Checking requirements…</p>}
                            {reqRecord && rows.length === 0 && !reqRecord.error && (
                              <p className="muted small">Nothing to complete right now.</p>
                            )}
                            {rows.length > 0 && (
                              <>
                                <h4>
                                  {outstanding.length > 0
                                    ? `${outstanding.length} still to do`
                                    : awaitingCount > 0
                                      ? 'Waiting on your coach'
                                      : 'All requirements complete'}
                                </h4>
                                <ul className="req-list">
                                  {rows.map((r) => {
                                    const rowKey = `${reqKey}:${r.id}`;
                                    return (
                                      <li key={r.id} className={`req ${r.status}`}>
                                        <div>
                                          <strong>{r.label}</strong>{' '}
                                          <span className={`badge ${r.status}`}>
                                            {REQUIREMENT_LABELS[r.status]}
                                          </span>
                                          {r.dueAt ? (
                                            <span className="muted small">
                                              {' · due '}{formatWhen(toMillis(r.dueAt))}
                                            </span>
                                          ) : null}
                                        </div>
                                        {isOutstanding(r.status) && (
                                          <form
                                            onSubmit={(e) => {
                                              e.preventDefault();
                                              submitRequirement(t.id, a.id, r, rowKey);
                                            }}
                                          >
                                            <label>
                                              Sign as
                                              <input
                                                value={signatures[rowKey] || ''}
                                                onChange={(e) =>
                                                  setSignatures((prev) => ({
                                                    ...prev,
                                                    [rowKey]: e.target.value,
                                                  }))
                                                }
                                                placeholder="Your full name"
                                                autoComplete="name"
                                              />
                                            </label>
                                            <button type="submit" disabled={submitting === rowKey}>
                                              {submitting === rowKey ? 'Submitting…' : 'Complete'}
                                            </button>
                                          </form>
                                        )}
                                      </li>
                                    );
                                  })}
                                </ul>
                              </>
                            )}
                          </div>
                        </li>
                      );
                    })}
                  </ul>
                </>
              )}

              {(announcements[t.id] || []).length > 0 && (
                <>
                  <h3>From your coach</h3>
                  <ul className="announcements">
                    {announcements[t.id].map((m) => (
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

              <h3>Next up</h3>
              {upcoming.length === 0 ? (
                <p className="muted">Nothing scheduled yet.</p>
              ) : (
                <ul>
                  {upcoming.slice(0, 5).map((e) => (
                    <li key={e.id}>
                      <strong>{e.title || e.type}</strong>
                      <span className="muted"> · {formatWhen(toMillis(e.date))}</span>
                      {e.location ? <span className="muted"> · {e.location}</span> : null}

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
                    {past.slice(0, 3).map((e) => (
                      <li key={e.id}>
                        <span>{e.title || e.type}</span>
                        <span className="muted"> · {formatWhen(toMillis(e.date))}</span>
                      </li>
                    ))}
                  </ul>
                </>
              )}

              <p className="small muted">
                Practice times and locations aren&apos;t shown on the family view — ask
                your coach in the app if you need them.
              </p>
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

        <p className="muted small">
          <Link href="/privacy">Privacy</Link> · <Link href="/support">Support</Link>
        </p>
      </main>
    </>
  );
}

/// Comm-board categories a school-level follower may read. Mirrors the follower
/// branch of `messageReadAllowed` in firestore.rules; drift here is not cosmetic,
/// because these values become an `in` filter and a value the rule rejects fails
/// the entire query.
const PUBLIC_COMM_CATEGORIES = ['liveGame', 'gameday', 'fundraiser'];

/// The exact raw values iOS writes (Models/Event.swift RSVPStatus). Inventing
/// "going" here would have stored answers the coach's roster could not parse.
const RSVP_CHOICES = [
  { value: 'attending', label: 'Attending' },
  { value: 'notAttending', label: 'Not attending' },
];

/// Form types as a family would name them. The stored values are camelCase enum
/// cases; showing `concussionWaiver` to a parent would be a small insult.
const FORM_LABELS = {
  physical: 'Sports physical',
  codeOfConduct: 'Code of conduct',
  concussionWaiver: 'Concussion waiver',
};

/// Firebase auth errors are written for developers. Say what to do instead.
function humanAuthError(err) {
  const code = String(err?.code || '');
  if (code.includes('invalid-credential') || code.includes('wrong-password')) {
    return 'That email and password don\u2019t match an account.';
  }
  if (code.includes('user-not-found')) return 'No account uses that email yet. Create one first.';
  if (code.includes('email-already-in-use')) return 'An account already exists for that email. Sign in instead.';
  if (code.includes('weak-password')) return 'Choose a password with at least 6 characters.';
  if (code.includes('invalid-email')) return 'That email address doesn\u2019t look right.';
  if (code.includes('too-many-requests')) return 'Too many attempts. Wait a moment and try again.';
  return err?.message || 'Something went wrong. Try again.';
}

