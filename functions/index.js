const functions = require('firebase-functions');
const admin = require('firebase-admin');
const nodemailer = require('nodemailer');

admin.initializeApp();

// ---------------------------------------------------------------------------
// 1. Sync the user's role from Firestore `users/{userId}.role` into their
//    Firebase Auth custom claim, so security rules can trust the token.
// ---------------------------------------------------------------------------
exports.syncUserRoleClaims = functions.firestore
  .document('users/{userId}')
  .onWrite(async (change, context) => {
    const userId = context.params.userId;
    const role = change.after.exists ? change.after.get('role') : null;
    if (!role) return null;

    try {
      await admin.auth().setCustomUserClaims(userId, { role });
      console.log(`[claims] ${userId} -> role=${role}`);
    } catch (err) {
      console.error(`[claims] failed for ${userId}`, err);
    }
    return null;
  });

// ---------------------------------------------------------------------------
// 2. grantRole — an AD assigns a role to another user (server-side, validated).
//    Writes the role to Firestore; the sync trigger above sets the claim.
// ---------------------------------------------------------------------------
const ALLOWED_ROLES = ['ad', 'coach', 'staff', 'player', 'parent', 'follower'];

exports.grantRole = functions.https.onCall(async (data, context) => {
  if (!context.auth) {
    throw new functions.https.HttpsError('unauthenticated', 'You must be signed in.');
  }

  const { targetUid, role } = data || {};
  if (!targetUid || !role) {
    throw new functions.https.HttpsError('invalid-argument', 'targetUid and role are required.');
  }
  if (!ALLOWED_ROLES.includes(role)) {
    throw new functions.https.HttpsError('invalid-argument', `Invalid role: ${role}`);
  }

  // Only an AD can grant roles.
  const callerSnap = await admin.firestore().collection('users').doc(context.auth.uid).get();
  const callerRole = callerSnap.exists ? callerSnap.get('role') : null;
  if (callerRole !== 'ad') {
    throw new functions.https.HttpsError('permission-denied', 'Only an Athletic Director can grant roles.');
  }

  await admin.firestore().collection('users').doc(targetUid).set({ role }, { merge: true });
  console.log(`[roles] ${context.auth.uid} granted ${role} to ${targetUid}`);
  return { ok: true, targetUid, role };
});

// ---------------------------------------------------------------------------
// 3. onInvitationCreated — send the invite email when an AD invites someone.
//    Uses SMTP if configured; otherwise just logs (so deploy works without it).
// ---------------------------------------------------------------------------
exports.onInvitationCreated = functions.firestore
  .document('invitations/{invitationId}')
  .onCreate(async (snap) => {
    const inv = snap.data() || {};
    const email = inv.email;
    const schoolName = inv.schoolName || 'your school';
    const role = inv.role || 'coach';

    const { SMTP_HOST, SMTP_USER, SMTP_PASS } = process.env;
    if (!SMTP_HOST || !SMTP_USER || !SMTP_PASS) {
      console.log(`[invite] invitation for ${email} (${role} @ ${schoolName}) — configure SMTP env to send email.`);
      return null;
    }

    const transporter = nodemailer.createTransport({
      host: SMTP_HOST,
      port: Number(process.env.SMTP_PORT || 587),
      secure: false,
      auth: { user: SMTP_USER, pass: SMTP_PASS },
    });

    await transporter.sendMail({
      from: SMTP_USER,
      to: email,
      subject: `You've been invited to ${schoolName} on RockLab Athletics`,
      text: [
        `You've been invited as a ${role} for ${schoolName} on RockLab Athletics.`,
        '',
        'Download the app and sign up with this email address to accept the invitation.',
      ].join('\n'),
    });

    console.log(`[invite] email sent to ${email}`);
    return null;
  });
