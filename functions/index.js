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

exports.manageUserRole = functions.https.onCall(async (data, context) => {
  if (!context.auth) {
    throw new functions.https.HttpsError('unauthenticated', 'You must be signed in.');
  }
  const callerId = context.auth.uid;
  const { targetUid, action, newRole } = data || {};
  if (!targetUid || !action) {
    throw new functions.https.HttpsError('invalid-argument', 'targetUid and action are required.');
  }

  const db = admin.firestore();
  const [callerSnap, targetSnap] = await Promise.all([
    db.collection('users').doc(callerId).get(),
    db.collection('users').doc(targetUid).get(),
  ]);
  if (!targetSnap.exists) {
    throw new functions.https.HttpsError('not-found', 'User not found.');
  }
  const callerRole = callerSnap.exists ? callerSnap.get('role') : null;
  const targetRole = targetSnap.get('role') || 'follower';

  const isAd = callerRole === 'ad';
  const isCoach = callerRole === 'coach';
  if (!isAd && !isCoach) {
    throw new functions.https.HttpsError('permission-denied', 'Only an AD or coach can manage users.');
  }

  if (action === 'setRole') {
    const allowed = ['ad', 'coach', 'staff', 'player', 'parent', 'follower'];
    if (!allowed.includes(newRole)) {
      throw new functions.https.HttpsError('invalid-argument', 'Invalid role.');
    }
    if (newRole === 'ad' && !isAd) {
      throw new functions.https.HttpsError('permission-denied', 'Only an AD can assign the AD role.');
    }
    if (newRole === 'coach' && !isAd) {
      throw new functions.https.HttpsError('permission-denied', 'Only an AD can assign the coach role.');
    }
    await db.collection('users').doc(targetUid).set({ role: newRole }, { merge: true });
    console.log(`[roles] ${callerId} set ${targetUid} role to ${newRole}`);
    return { ok: true, targetUid, role: newRole };
  }

  if (action === 'remove') {
    if (targetRole === 'ad') {
      throw new functions.https.HttpsError('permission-denied', 'An AD cannot be removed.');
    }
    if (targetRole === 'coach' && !isAd) {
      throw new functions.https.HttpsError('permission-denied', 'Only an AD can remove a coach.');
    }
    // Remove from the school: clear schoolId and demote to follower.
    await db.collection('users').doc(targetUid).set({ role: 'follower', schoolId: null }, { merge: true });
    // Clear any head-coach assignment.
    const teams = await db.collection('teams').where('headCoachId', '==', targetUid).get();
    await Promise.all(teams.docs.map((d) => d.ref.set({ headCoachId: '' }, { merge: true })));
    console.log(`[roles] ${callerId} removed ${targetUid}`);
    return { ok: true, targetUid, removed: true };
  }

  throw new functions.https.HttpsError('invalid-argument', 'Unknown action.');
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

// One-off test-user seeder (protected by a secret). Deploy, call, then delete.
exports.seedTestUsers = functions.https.onRequest(async (req, res) => {
  if (req.query.secret !== 'rocklab-seed-2026') {
    res.status(403).send('forbidden');
    return;
  }
  const db = admin.firestore();
  const password = 'RockLabDev!2026';
  const users = [
    { email: 'coach@rocklabathletics.com', role: 'coach', name: 'Coach Test' },
    { email: 'player@rocklabathletics.com', role: 'player', name: 'Player Test' },
    { email: 'parent@rocklabathletics.com', role: 'parent', name: 'Parent Test' },
    { email: 'follower@rocklabathletics.com', role: 'follower', name: 'Follower Test' },
  ];

  const schools = await db.collection('schools').limit(1).get();
  const schoolId = schools.docs.length ? schools.docs[0].id : null;
  const teams = schoolId
    ? await db.collection('teams').where('schoolId', '==', schoolId).limit(1).get()
    : { docs: [] };
  const teamId = teams.docs.length ? teams.docs[0].id : null;

  const results = [];
  for (const u of users) {
    try {
      let uid;
      try {
        const existing = await admin.auth().getUserByEmail(u.email);
        uid = existing.uid;
      } catch (e) {
        const created = await admin.auth().createUser({ email: u.email, password });
        uid = created.uid;
      }
      await db.collection('users').doc(uid).set({
        email: u.email, displayName: u.name, role: u.role, schoolId: schoolId, linkedPlayerIds: []
      }, { merge: true });
      await admin.auth().setCustomUserClaims(uid, { role: u.role });

      if (u.role === 'coach' && teamId) {
        await db.collection('teams').doc(teamId).set({ headCoachId: uid }, { merge: true });
      }
      if (u.role === 'player' && teamId) {
        await db.collection('teams').doc(teamId).collection('roster').add({
          teamId, playerName: u.name, jerseyNumber: '', position: '', userId: uid,
          parentEmail: '', parentName: '', createdAt: admin.firestore.FieldValue.serverTimestamp()
        });
      }
      results.push({ email: u.email, role: u.role, uid });
    } catch (err) {
      results.push({ email: u.email, error: String(err) });
    }
  }
  res.json({ ok: true, schoolId, teamId, results });
});
