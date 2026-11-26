import { createUserWithEmailAndPassword, signInWithEmailAndPassword, sendPasswordResetEmail, reload } from 'firebase/auth';
import { auth } from './firebase';

/**
 * AuthService - mirrors iOS AuthService.swift
 * Thin wrapper around Firebase Authentication for the web app.
 */

// Internal test/staff accounts on these domains are exempt from the
// email-verification gate so dev logins keep working.
export const DEV_EMAIL_DOMAINS = new Set(['rocklabathletics.com']);

export const getCurrentEmail = () => {
  const user = auth.currentUser;
  return user ? user.email : null;
};

export const isEmailVerified = () => {
  const user = auth.currentUser;
  return user ? user.isEmailVerified : false;
};

/**
 * Sign up a new user. Sends verification email immediately.
 * Failure to send verification shouldn't block account creation.
 */
export const signUp = async (email, password) => {
  const trimmedEmail = email.trim().toLowerCase();
  const result = await createUserWithEmailAndPassword(auth, trimmedEmail, password);
  try {
    await result.user.sendEmailVerification();
  } catch (e) {
    // Non-fatal — user can resend from verify screen
    console.warn('[auth] verification email failed to send', e);
  }
  return result.user.uid;
};

/**
 * Sign in an existing user.
 */
export const signIn = async (email, password) => {
  const trimmedEmail = email.trim().toLowerCase();
  const result = await signInWithEmailAndPassword(auth, trimmedEmail, password);
  return result.user.uid;
};

/**
 * Send a password-reset email.
 */
export const sendPasswordReset = async (email) => {
  const trimmedEmail = email.trim().toLowerCase();
  await sendPasswordResetEmail(auth, trimmedEmail);
};

/**
 * Re-send the verification email to the signed-in user.
 */
export const resendVerificationEmail = async () => {
  const user = auth.currentUser;
  if (!user) throw new Error('You are not signed in.');
  await user.sendEmailVerification();
};

/**
 * Reload the Firebase user so isEmailVerified reflects latest state.
 */
export const reloadCurrentUser = async () => {
  const user = auth.currentUser;
  if (!user) return false;
  await reload(user);
  return auth.currentUser ? auth.currentUser.isEmailVerified : false;
};

/**
 * True for internal test accounts (by email domain).
 */
export const isDevEmail = (email) => {
  if (!email) return false;
  const domain = email.toLowerCase().split('@').pop();
  return DEV_EMAIL_DOMAINS.has(domain);
};