import { doc, setDoc, getDoc, updateDoc, arrayUnion, arrayRemove } from 'firebase/firestore';
import { db } from './firebase';

/**
 * UsersService - mirrors iOS FirestoreService user methods
 * Thin wrapper around Firestore for the `users` collection.
 */

export const createUser = async (id, email, name, role = 'follower', zipCode = '', phone = '') => {
  // No `schoolId` key at all. firestore.rules accepts a self-signup only when
  // schoolId is absent or empty -- `null` is neither, so writing one made every
  // web sign-up fail with permission-denied. Membership of a school is assigned
  // by that school (invitation, join request, or an AD), never chosen here.
  await setDoc(doc(db, 'users', id), {
    email,
    displayName: name,
    role,
    zipCode,
    phone,
    linkedPlayerIds: [],
    createdAt: new Date(),
  }, { merge: true });
};

export const ensureUser = async (id, email, name) => {
  await setDoc(doc(db, 'users', id), {
    email,
    displayName: name,
  }, { merge: true });
};

export const updateUserPhoto = async (userId, photoURL) => {
  await updateDoc(doc(db, 'users', userId), { photoURL });
};

export const fetchUser = async (id) => {
  const snap = await getDoc(doc(db, 'users', id));
  if (!snap.exists()) return null;
  return { id: snap.id, ...snap.data() };
};

export const updateUserRoleAndSchool = async (id, role, schoolId) => {
  await updateDoc(doc(db, 'users', id), {
    role,
    schoolId,
  }, { merge: true });
};

export const addTeamId = async (userId, teamId) => {
  await updateDoc(doc(db, 'users', userId), {
    teamIds: arrayUnion(teamId),
  }, { merge: true });
};

export const removeTeamId = async (userId, teamId) => {
  await updateDoc(doc(db, 'users', userId), {
    teamIds: arrayRemove(teamId),
  }, { merge: true });
};

export const addLinkedPlayerId = async (userId, playerId) => {
  await updateDoc(doc(db, 'users', userId), {
    linkedPlayerIds: arrayUnion(playerId),
  }, { merge: true });
};

export const fetchSchoolUsers = async (schoolId) => {
  // Note: Firestore doesn't support collection group queries across users
  // easily without an index. This is a placeholder; ADs query by schoolId.
  const snap = await getDoc(doc(db, 'users', schoolId));
  return snap.exists() ? [{ id: snap.id, ...snap.data() }] : [];
};