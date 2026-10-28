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

// ---------------------------------------------------------------------------
// Push notifications (FCM)
// ---------------------------------------------------------------------------
async function sendToUser(userId, title, body) {
  const snap = await admin.firestore().collection('users').doc(userId).get();
  const token = snap.exists ? snap.get('fcmToken') : null;
  if (!token) return false;
  try {
    await admin.messaging().send({ token, notification: { title, body } });
    return true;
  } catch (err) {
    console.error('[push] send failed', err);
    return false;
  }
}

async function notifyTeam(teamId, title, body) {
  const teamSnap = await admin.firestore().collection('teams').doc(teamId).get();
  const team = teamSnap.exists ? teamSnap.data() : {};
  const ids = new Set();
  if (team.headCoachId) ids.add(team.headCoachId);
  const roster = await admin.firestore().collection('teams').doc(teamId).collection('roster').get();
  roster.docs.forEach((d) => {
    const uid = d.get('userId');
    if (uid) ids.add(uid);
  });
  for (const uid of ids) {
    await sendToUser(uid, title, body);
  }
}

exports.sendTestPush = functions.https.onCall(async (data, context) => {
  if (!context.auth) {
    throw new functions.https.HttpsError('unauthenticated', 'You must be signed in.');
  }
  const title = (data && data.title) || 'Test';
  const body = (data && data.body) || 'Push notifications are working!';
  const ok = await sendToUser(context.auth.uid, title, body);
  if (!ok) {
    throw new functions.https.HttpsError('not-found', 'No FCM token for this user yet. Register for push on a real device first.');
  }
  return { ok: true };
});

exports.onEventCreated = functions.firestore.document('events/{eventId}').onCreate(async (snap) => {
  const ev = snap.data() || {};
  if (ev.teamId) {
    await notifyTeam(ev.teamId, 'New event', ev.title || 'A new event was added');
  }
  return null;
});

exports.onCommBoardMessage = functions.firestore.document('chats/{chatId}/messages/{messageId}').onCreate(async (snap, context) => {
  const chatId = context.params.chatId;
  const chatSnap = await admin.firestore().collection('chats').doc(chatId).get();
  const chat = chatSnap.exists ? chatSnap.data() : {};
  if (chat.type !== 'commBoard') return null;
  const msg = snap.data() || {};
  if (chat.teamId) {
    await notifyTeam(chat.teamId, 'Announcement', msg.text || '');
  }
  return null;
});
