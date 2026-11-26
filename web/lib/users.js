import { doc, setDoc } from 'firebase/firestore';
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
