import { useEffect, useState } from 'react';
import { onAuthStateChanged } from 'firebase/auth';
import { doc, getDoc } from 'firebase/firestore';
import { auth, db } from './firebase';

/// The signed-in user, resolved once per tab rather than once per page.
///
/// Every page used to call `useAuth` from pages/index.js, which meant every click
/// resubscribed to auth, re-read `users/{uid}` and started its render on
/// `loading: true` — a "Loading…" flash on navigation that looked like the page had
/// failed. A page that arrived during a slow or failing profile read stayed on that
/// flash indefinitely, and only a reload cleared it.
///
/// One listener and one cached profile live here instead. The first page of a session
/// still waits for the profile; every later navigation renders immediately from the
/// cache and refreshes it in the background.

const EMPTY = { loading: true, user: null, profile: null, error: null };

let snapshot = EMPTY;
let started = false;
let currentUid = null;
const subscribers = new Set();

function publish(next) {
  snapshot = { ...snapshot, ...next };
  subscribers.forEach((notify) => notify());
}

function start() {
  if (started) return;
  started = true;

  onAuthStateChanged(auth, async (firebaseUser) => {
    if (!firebaseUser) {
      currentUid = null;
      publish({ ...EMPTY, loading: false });
      return;
    }

    const user = {
      uid: firebaseUser.uid,
      email: firebaseUser.email,
      displayName: firebaseUser.displayName,
      emailVerified: firebaseUser.emailVerified,
    };

    const sameUser = currentUid === firebaseUser.uid;
    currentUid = firebaseUser.uid;

    // A navigation inside one session: keep the cached profile on screen, and only
    // hold the page while the profile is genuinely unknown.
    if (sameUser && snapshot.profile) {
      publish({ loading: false, user, error: null });
      return;
    }
    publish({ loading: true, user, profile: sameUser ? snapshot.profile : null, error: null });

    try {
      const snap = await getDoc(doc(db, 'users', firebaseUser.uid));
      publish({
        loading: false,
        user,
        profile: snap.exists() ? { id: snap.id, ...snap.data() } : null,
        error: null,
      });
    } catch (err) {
      // A denied or unreachable read must not leave the page on a spinner forever.
      publish({
        loading: false,
        user,
        profile: sameUser ? snapshot.profile : null,
        error: err && err.message ? err.message : 'Could not load your profile.',
      });
    }
  });
}

export function useAuth() {
  const [, forceRender] = useState(0);

  useEffect(() => {
    start();
    const notify = () => forceRender((n) => n + 1);
    subscribers.add(notify);
    // A page can mount after auth already resolved (the common case on navigation),
    // so hand it the current snapshot instead of waiting for the next event.
    notify();
    return () => {
      subscribers.delete(notify);
    };
  }, []);

  return snapshot;
}

/// Sign-out, role changes and school moves all arrive through onAuthStateChanged, so the
/// cache is dropped there. Nothing here is persisted: a reload starts clean.
export function resetAuthCache() {
  snapshot = EMPTY;
  currentUid = null;
  subscribers.forEach((notify) => notify());
}

export default useAuth;
