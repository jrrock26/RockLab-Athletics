const functions = require('firebase-functions');
const admin = require('firebase-admin');
const nodemailer = require('nodemailer');
const crypto = require('crypto');

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
// generateFormContent — produce a form title + description from a prompt.
// Uses OpenAI if OPENAI_API_KEY is configured; otherwise falls back to a
// keyword template matcher (so it always returns something useful).
// ---------------------------------------------------------------------------
// Standard high-school athletic form catalog (metadata + keyword aliases).
// The full document text lives in the iOS `FormLibrary`; the server only needs
// to identify which standard form the coach is asking for so the client can
// render the complete, populated document.
const FORM_CATALOG = [
  { id: 'concussion', title: 'Concussion Information & Acknowledgment', description: 'Annual concussion education and acknowledgment required before participation.', parent: true, kw: ['concussion', 'head injury', 'tbi', 'return to play', 'bell rung'] },
  { id: 'sca', title: 'Sudden Cardiac Arrest Awareness & Acknowledgment', description: 'Sudden cardiac arrest risk factors, warning signs, and required acknowledgment.', parent: true, kw: ['sudden cardiac', 'cardiac arrest', 'heart', 'aed', 'sca'] },
  { id: 'heat', title: 'Heat Illness & Hydration Awareness', description: 'Recognition, prevention, and emergency response for exertional heat illness.', parent: true, kw: ['heat illness', 'heat stroke', 'hydration', 'heat exhaustion'] },
  { id: 'physical', title: 'Pre-Participation Physical Examination', description: 'Medical history, physical exam, and provider clearance to participate.', parent: true, kw: ['physical', 'ppe', 'pre-participation', 'sports physical', 'exam'] },
  { id: 'medicalHistory', title: 'Athlete Medical & Emergency Information', description: 'Current conditions, allergies, medications, and emergency contacts on file.', parent: true, kw: ['medical history', 'health history', 'medical information', 'emergency contact', 'emergency information'] },
  { id: 'emergency', title: 'Emergency Medical Authorization', description: 'Consent to treat and transport in the event a parent cannot be reached.', parent: true, kw: ['emergency', 'consent to treat', 'medical authorization'] },
  { id: 'insurance', title: 'Proof of Medical Insurance', description: 'Verification of primary medical coverage required for participation.', parent: true, kw: ['insurance', 'coverage', 'policy'] },
  { id: 'code', title: 'Student-Athlete & Parent Code of Conduct', description: 'Behavioral expectations, sportsmanship standards, and consequences.', parent: true, kw: ['code of conduct', 'conduct', 'sportsmanship', 'behavior'] },
  { id: 'handbook', title: 'Athletic Handbook Acknowledgment', description: 'Receipt and acknowledgment of the athletic participation handbook.', parent: true, kw: ['handbook', 'acknowledgment', 'rules'] },
  { id: 'hazing', title: 'Anti-Hazing & Anti-Bullying Acknowledgment', description: 'Prohibition of hazing, bullying, harassment, and retaliation.', parent: true, kw: ['hazing', 'bullying', 'harassment', 'cyberbullying'] },
  { id: 'substance', title: 'Substance Use & Opioid Awareness Acknowledgment', description: 'Alcohol, tobacco, cannabis, opioid, and performance-enhancing drug policy.', parent: true, kw: ['substance', 'alcohol', 'drug', 'opioid', 'vaping', 'tobacco'] },
  { id: 'uniform', title: 'Uniform & Equipment Issuance Agreement', description: 'Issued items, care requirements, return deadlines, and replacement fees.', parent: true, kw: ['uniform', 'equipment', 'issuance', 'jersey'] },
  { id: 'risk', title: 'Assumption of Risk & Release of Liability', description: 'Acknowledgment of inherent risks and release of liability.', parent: true, kw: ['waiver', 'release', 'assumption of risk', 'liability'] },
  { id: 'media', title: 'Media & Broadcast Release', description: 'Consent to use photographs, video, and likeness in team media.', parent: true, kw: ['media', 'photo', 'likeness', 'broadcast', 'video'] },
  { id: 'ferpa', title: 'Authorization to Release Education Records (FERPA)', description: 'Authorization to share academic and eligibility records with athletic staff.', parent: true, kw: ['ferpa', 'records', 'release of information', 'privacy'] },
  { id: 'impact', title: 'Baseline Concussion Testing Consent', description: 'Consent to administer and store baseline neurocognitive testing results.', parent: true, kw: ['impact', 'baseline', 'neurocognitive', 'cognitive testing'] },
  { id: 'travel', title: 'Team Travel & Overnight Trip Consent', description: 'Supervision, itinerary, conduct, and consent to travel with the team.', parent: true, kw: ['travel', 'overnight', 'trip', 'hotel'] },
  { id: 'transport', title: 'Transportation Authorization', description: 'Permission to ride school transportation and release for alternate transport.', parent: true, kw: ['transportation', 'bus', 'ride', 'driving'] },
  { id: 'permission', title: 'Parent Permission Slip', description: 'Permission for a specific team activity, with medical and conduct consent.', parent: true, kw: ['permission', 'slip', 'field trip', 'activity'] },
  { id: 'fundraiser', title: 'Fundraiser Participation Agreement', description: 'Campaign expectations, handling of funds, deadlines, and opt-out option.', parent: true, kw: ['fundrais', 'fundraising', 'donation'] },
];

function matchTemplate(prompt) {
  const p = (prompt || '').toLowerCase();
  let best = null;
  for (const t of FORM_CATALOG) {
    let phraseLen = 0;
    let phraseScore = 0;
    let tokenScore = 0;
    if (p.includes(t.id.toLowerCase())) {
      phraseScore += 6;
      phraseLen = Math.max(phraseLen, t.id.length);
    }
    for (const kw of t.kw) {
      if (p.includes(kw)) {
        phraseScore += 4 + Math.min(kw.length, 24) / 4;
        phraseLen = Math.max(phraseLen, kw.length);
      }
    }
    for (const w of t.title.toLowerCase().split(/[^a-z]+/)) {
      if (w.length > 3 && p.includes(w)) tokenScore += 2;
    }
    if (phraseLen === 0 && tokenScore === 0) continue;
    if (!best) { best = { template: t, phraseLen, phraseScore, tokenScore }; continue; }
    if (phraseLen !== best.phraseLen) {
      if (phraseLen > best.phraseLen) best = { template: t, phraseLen, phraseScore, tokenScore };
    } else if (phraseScore !== best.phraseScore) {
      if (phraseScore > best.phraseScore) best = { template: t, phraseLen, phraseScore, tokenScore };
    } else if (tokenScore > best.tokenScore) {
      best = { template: t, phraseLen, phraseScore, tokenScore };
    }
  }
  return best ? best.template : null;
}


exports.generateFormContent = functions.https.onCall(async (data, context) => {
  if (!context.auth) {
    throw new functions.https.HttpsError('unauthenticated', 'You must be signed in.');
  }
  const prompt = (data && data.prompt ? String(data.prompt) : '').trim();
  if (!prompt) {
    throw new functions.https.HttpsError('invalid-argument', 'prompt is required.');
  }
  const teamId = data && data.teamId ? String(data.teamId) : '';

  let schoolName = '';
  let teamName = '';
  if (teamId) {
    try {
      const teamSnap = await admin.firestore().collection('teams').doc(teamId).get();
      if (teamSnap.exists) {
        teamName = [teamSnap.get('sportName') || '', teamSnap.get('level') || ''].filter(Boolean).join(' ');
        const schoolId = teamSnap.get('schoolId');
        if (schoolId) {
          const schoolSnap = await admin.firestore().collection('schools').doc(schoolId).get();
          if (schoolSnap.exists) schoolName = schoolSnap.get('name') || '';
        }
      }
    } catch (e) { /* ignore */ }
  }
  const hp = [];
  if (schoolName) hp.push('School: ' + schoolName);
  if (teamName) hp.push('Team: ' + teamName);
  const header = hp.join('\n');

  // 1) Prefer a standard form from the built-in catalog. The iOS client renders
  //    the complete document (real verbiage) from its FormLibrary, populated
  //    with the school and team.
  const matched = matchTemplate(prompt);
  if (matched) {
    return {
      title: matched.title,
      description: matched.description,
      requiresParentSignature: matched.parent === true,
      templateId: matched.id,
      body: '',
    };
  }

  // 2) Otherwise, generate a full document with AI when configured.
  const key = process.env.OPENAI_API_KEY;
  if (key) {
    try {
      const resp = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${key}` },
        body: JSON.stringify({
          model: 'gpt-4o-mini',
          messages: [
            { role: 'system', content: [
              'You draft complete, formal high-school athletic department documents.',
              'Respond with JSON only: {"title": string, "description": string, "body": string}.',
              'The body must be a full, ready-to-sign legal-style document written in numbered sections.',
              'Format the body using "## " at the start of each section heading and "• " for list items.',
              'Use realistic clauses (purpose, expectations, risks, procedures, consequences, acknowledgment).',
              'Do not output a signature block; the application adds signatures.',
            ].join(' ') },
            { role: 'user', content: 'School: ' + (schoolName || 'High School') + ' Team: ' + (teamName || 'Varsity team') + ' Form request: ' + prompt },
          ],
          temperature: 0.4,
        }),
      });
      if (resp.ok) {
        const json = await resp.json();
        const content = json.choices && json.choices[0] && json.choices[0].message.content;
        const parsed = JSON.parse(content);
        let body = parsed.body || '';
        if (header) body = header + '\n\n' + body;
        return {
          title: parsed.title || 'Team Form',
          description: parsed.description || '',
          requiresParentSignature: true,
          templateId: '',
          body: body,
        };
      }
    } catch (err) {
      console.error('[ai] OpenAI call failed', err);
    }
  }

  // 3) Nothing matched — return a titled blank document the coach can edit.
  return {
    title: 'Team Form',
    description: prompt,
    requiresParentSignature: true,
    templateId: '',
    body: '',
  };
});

// ---------------------------------------------------------------------------
// assignTeamRole — a coach (of that team) or AD adds a user to a team and
// sets their role, team membership, school, and auth claim atomically.
// ---------------------------------------------------------------------------
const ASSIGNABLE_ROLES = ['staff', 'player', 'parent', 'follower'];

exports.assignTeamRole = functions.https.onCall(async (data, context) => {
  if (!context.auth) {
    throw new functions.https.HttpsError('unauthenticated', 'You must be signed in.');
  }
  const callerId = context.auth.uid;
  const { teamId, targetUid, role } = data || {};
  if (!teamId || !targetUid || !role) {
    throw new functions.https.HttpsError('invalid-argument', 'teamId, targetUid, and role are required.');
  }
  if (!ASSIGNABLE_ROLES.includes(role)) {
    throw new functions.https.HttpsError('invalid-argument', 'Role must be staff, player, parent, or follower.');
  }

  const db = admin.firestore();
  const [callerSnap, memberSnap, teamSnap, targetSnap] = await Promise.all([
    db.collection('users').doc(callerId).get(),
    db.collection('teams').doc(teamId).collection('members').doc(callerId).get(),
    db.collection('teams').doc(teamId).get(),
    db.collection('users').doc(targetUid).get(),
  ]);

  const callerRole = callerSnap.exists ? callerSnap.get('role') : null;
  const isTeamCoach = memberSnap.exists && memberSnap.get('role') === 'coach';
  if (callerRole !== 'ad' && !isTeamCoach) {
    throw new functions.https.HttpsError('permission-denied', "Only the AD or this team's coach can assign members.");
  }
  if (!teamSnap.exists) {
    throw new functions.https.HttpsError('not-found', 'Team not found.');
  }
  const schoolId = teamSnap.get('schoolId');
  const targetEmail = targetSnap.exists ? targetSnap.get('email') : '';
  const targetName = targetSnap.exists ? targetSnap.get('displayName') : '';

  const batch = db.batch();
  batch.set(db.collection('teams').doc(teamId).collection('members').doc(targetUid), {
    teamId, userId: targetUid, role, name: targetName, email: targetEmail,
    permissions: [], createdAt: admin.firestore.FieldValue.serverTimestamp(),
  }, { merge: true });
  batch.set(db.collection('users').doc(targetUid), {
    teamIds: admin.firestore.FieldValue.arrayUnion(teamId),
    schoolId: schoolId,
    role: role,
  }, { merge: true });
  await batch.commit();

  if (role === 'player') {
    const existingRoster = await db.collection('teams').doc(teamId).collection('roster')
      .where('userId', '==', targetUid).limit(1).get();
    if (existingRoster.empty) {
      await db.collection('teams').doc(teamId).collection('roster').add({
        teamId: teamId,
        playerName: targetName || targetEmail,
        jerseyNumber: '',
        position: '',
        userId: targetUid,
        parentEmail: '',
        parentName: '',
        createdAt: admin.firestore.FieldValue.serverTimestamp()
      });
    }
  }

  await admin.auth().setCustomUserClaims(targetUid, { role });
  console.log(`[assign] ${callerId} assigned ${targetUid} as ${role} on team ${teamId}`);
  return { ok: true, teamId, targetUid, role };
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
      // Fail loudly in the record instead of silently pretending the invite was emailed.
      console.warn(`[invite] SMTP not configured — invitation for ${email} was created but NOT emailed.`);
      await snap.ref.set({
        deliveryStatus: 'not_configured',
        deliveryNote: 'SMTP is not configured; the invitation exists in-app only.',
      }, { merge: true });
      return null;
    }

    const transporter = nodemailer.createTransport({
      host: SMTP_HOST,
      port: Number(process.env.SMTP_PORT || 587),
      secure: false,
      auth: { user: SMTP_USER, pass: SMTP_PASS },
    });

    try {
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
      await snap.ref.set({ deliveryStatus: 'sent' }, { merge: true });
      console.log(`[invite] email sent to ${email}`);
    } catch (err) {
      console.error(`[invite] send failed for ${email}`, err);
      await snap.ref.set({
        deliveryStatus: 'failed',
        deliveryNote: String(err && err.message ? err.message : err).slice(0, 300),
      }, { merge: true });
    }
    return null;
  });

// ---------------------------------------------------------------------------
// Push notifications (FCM)
// ---------------------------------------------------------------------------
async function sendToUser(userId, title, body, data = null) {
  const snap = await admin.firestore().collection('users').doc(userId).get();
  const token = snap.exists ? snap.get('fcmToken') : null;
  if (!token) return false;
  const message = { token, notification: { title, body } };
  if (data) message.data = data;
  try {
    await admin.messaging().send(message);
    return true;
  } catch (err) {
    console.error('[push] send failed', err);
    return false;
  }
}

async function notifyTeam(teamId, title, body, includeFollowers = false, data = null) {
  const db = admin.firestore();
  const teamSnap = await db.collection('teams').doc(teamId).get();
  const team = teamSnap.exists ? teamSnap.data() : {};
  const ids = new Set();
  if (team.headCoachId) ids.add(team.headCoachId);
  const roster = await db.collection('teams').doc(teamId).collection('roster').get();
  roster.docs.forEach((d) => {
    const uid = d.get('userId');
    if (uid) ids.add(uid);
  });
  if (includeFollowers) {
    const members = await db.collection('teams').doc(teamId).collection('members').get();
    members.docs.forEach((d) => {
      const uid = d.get('userId');
      if (uid) ids.add(uid);
    });
  }
  for (const uid of ids) {
    await sendToUser(uid, title, body, data);
  }
}

// NOTE: the former `sendTestPush` diagnostic callable was removed before release.
// It existed to verify FCM delivery during development and had no app-side caller.

exports.onEventCreated = functions.firestore.document('events/{eventId}').onCreate(async (snap) => {
  const ev = snap.data() || {};
  if (ev.silent) return null;
  if (ev.teamId) {
    await notifyTeam(ev.teamId, 'New event', ev.title || 'A new event was added');
  }
  if (ev.schoolId) {
    // AD users may be subscribed to their school's events
    const schoolSnap = await admin.firestore().collection('schools').doc(ev.schoolId).get();
    if (schoolSnap.exists) {
      const adUserId = schoolSnap.get('adUserId');
      if (adUserId) {
        await sendToUser(adUserId, 'New event', ev.title || 'A new event was added');
      }
    }
  }
  return null;
});

exports.onCommBoardMessage = functions.firestore.document('chats/{chatId}/messages/{messageId}').onCreate(async (snap, context) => {
  const chatId = context.params.chatId;
  const chatSnap = await admin.firestore().collection('chats').doc(chatId).get();
  const chat = chatSnap.exists ? chatSnap.data() : {};
  if (chat.type !== 'commBoard') return null;
  const msg = snap.data() || {};
  if (msg.senderId === 'system') return null; // skip the seeded welcome message
  if (chat.teamId) {
    // Followers are only notified for public categories (live/gameday/fundraiser).
    const category = msg.category || 'general';
    const isPublic = ['liveGame', 'gameday', 'fundraiser'].includes(category);
    await notifyTeam(chat.teamId, 'Announcement', msg.text || '', isPublic);
  }
  return null;
});

// ---------------------------------------------------------------------------
// Live-now notifications: when a game or broadcast goes live, notify everyone
// who follows the team (head coach, roster, and all members incl. followers).
// ---------------------------------------------------------------------------
exports.onGameLive = functions.firestore.document('games/{gameId}').onWrite(async (change, context) => {
  const before = change.before.exists ? change.before.data() : {};
  const after = change.after.exists ? change.after.data() : {};
  if (before.status === 'live' || after.status !== 'live') return null;
  if (!after.teamId) return null;
  let sportId = '';
  const teamSnap = await admin.firestore().collection('teams').doc(after.teamId).get();
  if (teamSnap.exists) sportId = teamSnap.get('sportId') || '';
  const score = `${after.teamScore || 0}\u2013${after.opponentScore || 0}`;
  await notifyTeam(after.teamId, '\u{1F534} Live now', `vs ${after.opponent || 'Opponent'} is live \u2014 ${score}`, true, {
    type: 'liveGame',
    teamId: after.teamId,
    gameId: context.params.gameId,
    sportId,
    opponent: after.opponent || '',
    teamScore: String(after.teamScore || 0),
    opponentScore: String(after.opponentScore || 0),
    isHome: String(after.isHome === true),
  });
  return null;
});

exports.onBroadcastLive = functions.firestore.document('broadcasts/{broadcastId}').onWrite(async (change, context) => {
  const before = change.before.exists ? change.before.data() : {};
  const after = change.after.exists ? change.after.data() : {};
  if (before.isLive === true || after.isLive !== true) return null;
  if (!after.teamId) return null;
  await notifyTeam(after.teamId, '\u{1F534} Live stream', after.title || 'A broadcast is now live', true, {
    type: 'liveBroadcast',
    teamId: after.teamId,
    broadcastId: context.params.broadcastId,
    url: after.url || '',
  });
  return null;
});

// ---------------------------------------------------------------------------
// Seed the four default chat channels (plus a welcome message in each) when a
// team is created, so channels exist before the AD/coach ever opens chat.
// Channel/message ids are deterministic, so this is idempotent with the
// client-side fallback in ensureDefaultChats.
// ---------------------------------------------------------------------------
const DEFAULT_CHATS = [
  { type: 'commBoard', title: 'Comm Board' },
  { type: 'team', title: 'Team Chat' },
  { type: 'staff', title: 'Staff Chat' },
  { type: 'parent', title: 'Parent Chat' },
];

exports.onTeamCreated = functions.firestore.document('teams/{teamId}').onCreate(async (snap, context) => {
  const teamId = context.params.teamId;
  const db = admin.firestore();
  const batch = db.batch();
  const createdAt = Date.now() / 1000; // seconds, matching the iOS client

  for (const c of DEFAULT_CHATS) {
    const chatId = `${teamId}_${c.type}`;
    const chatRef = db.collection('chats').doc(chatId);
    batch.set(chatRef, {
      teamId,
      type: c.type,
      title: c.title,
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
    });
    batch.set(chatRef.collection('messages').doc('welcome'), {
      chatId,
      senderId: 'system',
      senderName: 'RockLab Athletics',
      text: `Welcome to ${c.title}!`,
      createdAt,
    });
  }

  await batch.commit();
  console.log(`[chats] seeded default channels for team ${teamId}`);
  return null;
});

// One-off reset: delete ALL Auth accounts + their Firestore user docs.

// Callable from the app (AD only).

// On new form submission, notify the AD and all coaches/staff/players of that team.
exports.onFormSubmitted = functions.firestore.document('forms/{formId}/submissions/{submissionId}').onCreate(async (snap, context) => {
  const sub = snap.data() || {};
  const form = await admin.firestore().collection('forms').doc(context.params.formId).get();
  if (!form.exists) return null;
  const formData = form.data() || {};
  const teamId = formData.teamId || sub.teamId;
  if (!teamId) return null;
  const formName = form.get('title') || 'Form';

  // Notify the AD of that school
  const schoolSnap = await admin.firestore().collection('schools').doc(sub.schoolId).get();
  if (schoolSnap.exists) {
    const adUserId = schoolSnap.get('adUserId');
    if (adUserId) {
      await sendToUser(adUserId, 'New Form Submission', `A form has been submitted for ${formName}`);
    }
  }

  // Notify all coaches/staff/players on the team
  const members = await admin.firestore().collection('teams').doc(teamId).collection('members').get();
  for (const doc of members.docs) {
    const uid = doc.get('userId');
    const role = doc.get('role');
    if (uid && (role === 'coach' || role === 'staff' || role === 'player' || role === 'parent')) {
      await sendToUser(uid, 'New Form Submission', `A form has been submitted for ${formName}`);
    }
  }
  return null;
});

// Reject a pending invitation (sender or AD only).
exports.rejectInvitation = functions.https.onCall(async (data, context) => {
  if (!context.auth) {
    throw new functions.https.HttpsError('unauthenticated', 'You must be signed in.');
  }
  const callerId = context.auth.uid;
  const callerEmail = (context.auth.token.email || '').toLowerCase();
  const { invitationId } = data || {};
  if (!invitationId) {
    throw new functions.https.HttpsError('invalid-argument', 'invitationId is required.');
  }

  const db = admin.firestore();
  const invSnap = await db.collection('invitations').doc(invitationId).get();
  if (!invSnap.exists) {
    throw new functions.https.HttpsError('not-found', 'Invitation not found.');
  }
  const invData = invSnap.data();
  if (invData.status !== 'pending') {
    throw new functions.https.HttpsError('failed-precondition', 'Invitation is not pending.');
  }
  if ((invData.email || '').toLowerCase() !== callerEmail) {
    throw new functions.https.HttpsError('permission-denied', 'Only the sender or AD can reject.');
  }

  await db.collection('invitations').doc(invitationId).set({ status: 'rejected' }, { merge: true });

  return { ok: true, invitationId };
});

// Delete/cancel a pending invitation (AD only).
exports.deleteInvitation = functions.https.onCall(async (data, context) => {
  if (!context.auth) {
    throw new functions.https.HttpsError('unauthenticated', 'You must be signed in.');
  }
  const callerId = context.auth.uid;
  const callerEmail = (context.auth.token.email || '').toLowerCase();
  const { invitationId } = data || {};
  if (!invitationId) {
    throw new functions.https.HttpsError('invalid-argument', 'invitationId is required.');
  }

  const db = admin.firestore();
  const invSnap = await db.collection('invitations').doc(invitationId).get();
  if (!invSnap.exists) {
    throw new functions.https.HttpsError('not-found', 'Invitation not found.');
  }
  const invData = invSnap.data();
  if (invData.status !== 'pending') {
    throw new functions.https.HttpsError('failed-precondition', 'Invitation is not pending.');
  }

  // Allow an AD, or the coach of the invitation's team.
  const senderSnap = await db.collection('users').doc(callerId).get();
  const callerRole = senderSnap.exists ? senderSnap.get('role') : null;
  let allowed = callerRole === 'ad';
  if (!allowed && invData.teamId) {
    const memSnap = await db.collection('teams').doc(invData.teamId).collection('members').doc(callerId).get();
    allowed = memSnap.exists && memSnap.get('role') === 'coach';
  }
  if (!allowed) {
    throw new functions.https.HttpsError('permission-denied', 'Only an AD or the team coach can cancel invitations.');
  }

  await db.collection('invitations').doc(invitationId).set({ status: 'cancelled' }, { merge: true });

  return { ok: true, invitationId };
});

// Accept a pending invitation (server-side so it can write to members subcollection).
exports.acceptInvitation = functions.https.onCall(async (data, context) => {
  if (!context.auth) {
    throw new functions.https.HttpsError('unauthenticated', 'You must be signed in.');
  }
  const callerId = context.auth.uid;
  const callerEmail = (context.auth.token.email || '').toLowerCase();
  const { invitationId, name } = data || {};
  if (!invitationId) {
    throw new functions.https.HttpsError('invalid-argument', 'invitationId is required.');
  }

  const db = admin.firestore();
  const invSnap = await db.collection('invitations').doc(invitationId).get();
  if (!invSnap.exists) {
    throw new functions.https.HttpsError('not-found', 'Invitation not found.');
  }
  const invData = invSnap.data();
  if (invData.status !== 'pending') {
    throw new functions.https.HttpsError('failed-precondition', 'Invitation is not pending.');
  }
  if ((invData.email || '').toLowerCase() !== callerEmail) {
    throw new functions.https.HttpsError('permission-denied', 'This invitation is for a different account.');
  }

  const schoolId = invData.schoolId;
  const role = invData.role;
  const teamId = invData.teamId;

  // Update user's school and role
  await db.collection('users').doc(callerId).set({
    schoolId: schoolId,
    role: role
  }, { merge: true });

  // Set custom claim
  await admin.auth().setCustomUserClaims(callerId, { role });

  // Create team membership if teamId exists
  if (teamId) {
    const membershipRole = role === 'parent' ? 'follower' : role;
    await db.collection('teams').doc(teamId).collection('members').doc(callerId).set({
      teamId: teamId,
      userId: callerId,
      role: membershipRole,
      name: name || invData.email,
      email: invData.email,
      permissions: [],
      createdAt: admin.firestore.FieldValue.serverTimestamp()
    }, { merge: true });
    await db.collection('users').doc(callerId).set({
      teamIds: admin.firestore.FieldValue.arrayUnion(teamId)
    }, { merge: true });
    if (role === 'coach') {
      await db.collection('teams').doc(teamId).set({ headCoachId: callerId }, { merge: true });
    }
    if (role === 'player') {
      const existingRoster = await db.collection('teams').doc(teamId).collection('roster')
        .where('userId', '==', callerId).limit(1).get();
      if (existingRoster.empty) {
        await db.collection('teams').doc(teamId).collection('roster').add({
          teamId: teamId,
          playerName: name || invData.email,
          jerseyNumber: '',
          position: '',
          userId: callerId,
          parentEmail: '',
          parentName: '',
          createdAt: admin.firestore.FieldValue.serverTimestamp()
        });
      }
    }
  }

  // Mark invitation as accepted
  await db.collection('invitations').doc(invitationId).set({ status: 'accepted' }, { merge: true });

  return { ok: true, invitationId, role, schoolId, teamId };
});

// Ensures the calling player has a roster entry on the given team.
// Self-heals players who were accepted before roster auto-creation existed.
exports.ensurePlayerRosterEntry = functions.https.onCall(async (data, context) => {
  if (!context.auth) {
    throw new functions.https.HttpsError('unauthenticated', 'You must be signed in.');
  }
  const callerId = context.auth.uid;
  const { teamId } = data || {};
  if (!teamId) {
    throw new functions.https.HttpsError('invalid-argument', 'teamId is required.');
  }

  const db = admin.firestore();
  const memSnap = await db.collection('teams').doc(teamId).collection('members').doc(callerId).get();
  if (!memSnap.exists || memSnap.get('role') !== 'player') {
    throw new functions.https.HttpsError('permission-denied', 'Only a player member can be added to the roster.');
  }

  const existing = await db.collection('teams').doc(teamId).collection('roster')
    .where('userId', '==', callerId).limit(1).get();
  if (!existing.empty) {
    return { ok: true, alreadyExisted: true, rosterEntryId: existing.docs[0].id };
  }

  const userSnap = await db.collection('users').doc(callerId).get();
  const name = userSnap.exists ? (userSnap.get('displayName') || userSnap.get('email') || '') : '';
  const ref = await db.collection('teams').doc(teamId).collection('roster').add({
    teamId: teamId,
    playerName: name,
    jerseyNumber: '',
    position: '',
    userId: callerId,
    parentEmail: '',
    parentName: '',
    createdAt: admin.firestore.FieldValue.serverTimestamp()
  });
  return { ok: true, alreadyExisted: false, rosterEntryId: ref.id };
});



// ---------------------------------------------------------------------------
// Parent <-> player linking (request by parent, approve by AD/coach)
// ---------------------------------------------------------------------------

// Sanitized roster (names only, no PII) for a team member/follower to pick their child.
exports.listRosterForLinking = functions.https.onCall(async (data, context) => {
  if (!context.auth) throw new functions.https.HttpsError('unauthenticated', 'Sign in first.');
  const callerId = context.auth.uid;
  const { teamId } = data || {};
  if (!teamId) throw new functions.https.HttpsError('invalid-argument', 'teamId is required.');
  const db = admin.firestore();
  const memSnap = await db.collection('teams').doc(teamId).collection('members').doc(callerId).get();
  if (!memSnap.exists) throw new functions.https.HttpsError('permission-denied', 'Follow the team first.');
  const roster = await db.collection('teams').doc(teamId).collection('roster').get();
  const players = roster.docs.map((d) => ({
    entryId: d.id,
    playerName: d.get('playerName') || '',
    jerseyNumber: d.get('jerseyNumber') || '',
    playerUserId: d.get('userId') || null,
  }));
  return { players };
});

// Parent requests to link to a roster entry.
exports.requestParentLink = functions.https.onCall(async (data, context) => {
  if (!context.auth) throw new functions.https.HttpsError('unauthenticated', 'Sign in first.');
  const callerId = context.auth.uid;
  const { teamId, rosterEntryId } = data || {};
  if (!teamId || !rosterEntryId) throw new functions.https.HttpsError('invalid-argument', 'teamId and rosterEntryId are required.');
  const db = admin.firestore();
  const memSnap = await db.collection('teams').doc(teamId).collection('members').doc(callerId).get();
  if (!memSnap.exists) throw new functions.https.HttpsError('permission-denied', 'Follow the team first.');
  const entrySnap = await db.collection('teams').doc(teamId).collection('roster').doc(rosterEntryId).get();
  if (!entrySnap.exists) throw new functions.https.HttpsError('not-found', 'Player not found on roster.');
  const playerUserId = entrySnap.get('userId') || null;
  if (playerUserId === callerId) throw new functions.https.HttpsError('failed-precondition', 'You cannot link to yourself.');

  const dup = await db.collection('parentLinkRequests')
    .where('teamId', '==', teamId).where('parentUserId', '==', callerId)
    .where('rosterEntryId', '==', rosterEntryId).where('status', '==', 'pending').limit(1).get();
  if (!dup.empty) return { ok: true, alreadyPending: true, requestId: dup.docs[0].id };

  const userSnap = await db.collection('users').doc(callerId).get();
  const parentName = userSnap.exists ? (userSnap.get('displayName') || '') : '';
  const parentEmail = userSnap.exists ? (userSnap.get('email') || '') : '';
  const parentPhone = userSnap.exists ? (userSnap.get('phone') || '') : '';
  const ref = await db.collection('parentLinkRequests').add({
    teamId: teamId,
    rosterEntryId: rosterEntryId,
    playerUserId: playerUserId,
    playerName: entrySnap.get('playerName') || '',
    parentUserId: callerId,
    parentName: parentName,
    parentEmail: parentEmail,
    parentPhone: parentPhone,
    status: 'pending',
    createdAt: admin.firestore.FieldValue.serverTimestamp(),
  });
  return { ok: true, requestId: ref.id };
});

// AD/coach: list pending parent-link requests for a team.
exports.listParentLinkRequests = functions.https.onCall(async (data, context) => {
  if (!context.auth) throw new functions.https.HttpsError('unauthenticated', 'Sign in first.');
  const callerId = context.auth.uid;
  const { teamId } = data || {};
  if (!teamId) throw new functions.https.HttpsError('invalid-argument', 'teamId is required.');
  const db = admin.firestore();
  const callerSnap = await db.collection('users').doc(callerId).get();
  const callerRole = callerSnap.exists ? callerSnap.get('role') : null;
  const memSnap = await db.collection('teams').doc(teamId).collection('members').doc(callerId).get();
  const isCoach = memSnap.exists && memSnap.get('role') === 'coach';
  if (callerRole !== 'ad' && !isCoach) throw new functions.https.HttpsError('permission-denied', 'Only an AD or coach can view requests.');
  const q = await db.collection('parentLinkRequests').where('teamId', '==', teamId).where('status', '==', 'pending').get();
  const requests = q.docs.map((d) => Object.assign({ id: d.id }, d.data()));
  return { requests };
});

// AD/coach: approve a parent-link request (completes the link).
exports.approveParentLink = functions.https.onCall(async (data, context) => {
  if (!context.auth) throw new functions.https.HttpsError('unauthenticated', 'Sign in first.');
  const callerId = context.auth.uid;
  const { requestId } = data || {};
  if (!requestId) throw new functions.https.HttpsError('invalid-argument', 'requestId is required.');
  const db = admin.firestore();
  const reqSnap = await db.collection('parentLinkRequests').doc(requestId).get();
  if (!reqSnap.exists) throw new functions.https.HttpsError('not-found', 'Request not found.');
  const req = reqSnap.data();
  if (req.status !== 'pending') throw new functions.https.HttpsError('failed-precondition', 'Request is not pending.');
  const teamId = req.teamId;
  const callerSnap = await db.collection('users').doc(callerId).get();
  const callerRole = callerSnap.exists ? callerSnap.get('role') : null;
  const memSnap = await db.collection('teams').doc(teamId).collection('members').doc(callerId).get();
  const isCoach = memSnap.exists && memSnap.get('role') === 'coach';
  if (callerRole !== 'ad' && !isCoach) throw new functions.https.HttpsError('permission-denied', 'Only an AD or coach can approve.');

  const userUpdate = { role: 'parent' };
  if (req.playerUserId) {
    userUpdate.linkedPlayerIds = admin.firestore.FieldValue.arrayUnion(req.playerUserId);
  }
  await db.collection('users').doc(req.parentUserId).set(userUpdate, { merge: true });
  await admin.auth().setCustomUserClaims(req.parentUserId, { role: 'parent' });

  await db.collection('teams').doc(teamId).collection('members').doc(req.parentUserId).set({ role: 'parent' }, { merge: true });

  if (req.rosterEntryId) {
    await db.collection('teams').doc(teamId).collection('roster').doc(req.rosterEntryId).set({
      parentEmail: req.parentEmail || '',
      parentName: req.parentName || '',
      parentPhone: req.parentPhone || '',
    }, { merge: true });
  }

  await db.collection('parentLinkRequests').doc(requestId).set({ status: 'approved' }, { merge: true });
  return { ok: true };
});

// AD/coach: reject a parent-link request.
exports.rejectParentLink = functions.https.onCall(async (data, context) => {
  if (!context.auth) throw new functions.https.HttpsError('unauthenticated', 'Sign in first.');
  const callerId = context.auth.uid;
  const { requestId } = data || {};
  if (!requestId) throw new functions.https.HttpsError('invalid-argument', 'requestId is required.');
  const db = admin.firestore();
  const reqSnap = await db.collection('parentLinkRequests').doc(requestId).get();
  if (!reqSnap.exists) throw new functions.https.HttpsError('not-found', 'Request not found.');
  const req = reqSnap.data();
  const callerSnap = await db.collection('users').doc(callerId).get();
  const callerRole = callerSnap.exists ? callerSnap.get('role') : null;
  const memSnap = await db.collection('teams').doc(req.teamId).collection('members').doc(callerId).get();
  const isCoach = memSnap.exists && memSnap.get('role') === 'coach';
  if (callerRole !== 'ad' && !isCoach) throw new functions.https.HttpsError('permission-denied', 'Only an AD or coach can reject.');
  await db.collection('parentLinkRequests').doc(requestId).set({ status: 'rejected' }, { merge: true });
  return { ok: true };
});


// When a team form is published with a due date, add it to the calendar and
// notify players & parents.
exports.onFormPublished = functions.firestore
  .document('teams/{teamId}/forms/{formId}')
  .onWrite(async (change, context) => {
    const before = change.before.exists ? change.before.data() : {};
    const after = change.after.exists ? change.after.data() : {};
    const teamId = context.params.teamId;
    const formId = context.params.formId;
    const becamePublished = !before.published && after.published === true;
    if (!becamePublished) return null;
    if (after.dueEventId) return null;
    if (after.dueDate === undefined || after.dueDate === null) return null;
    const dueDate = Number(after.dueDate);
    if (!dueDate || isNaN(dueDate)) return null;
    const db = admin.firestore();

    const existing = await db.collection('events').where('formId', '==', formId).limit(1).get();
    if (!existing.empty) {
      await change.after.ref.set({ dueEventId: existing.docs[0].id }, { merge: true });
      return null;
    }

    const evRef = await db.collection('events').add({
      teamId: teamId,
      title: 'Form due: ' + (after.title || 'Team form'),
      type: 'meeting',
      date: dueDate,
      location: '',
      notes: 'Due date for the form "' + (after.title || 'Team form') + '".',
      formId: formId,
      silent: true,
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
    });
    await change.after.ref.set({ dueEventId: evRef.id }, { merge: true });

    const members = await db.collection('teams').doc(teamId).collection('members').get();
    for (const m of members.docs) {
      const uid = m.get('userId');
      const role = m.get('role');
      if (uid && (role === 'player' || role === 'parent')) {
        await sendToUser(uid, 'New form due', (after.title || 'A team form') + ' is due soon. Tap to review and sign.');
      }
    }
    return null;
  });


// ---------------------------------------------------------------------------
// Volunteer slot sign-ups (atomic first-come capacity enforcement)
// ---------------------------------------------------------------------------
exports.volunteerSignUp = functions.https.onCall(async (data, context) => {
  if (!context.auth) {
    throw new functions.https.HttpsError('unauthenticated', 'You must be signed in.');
  }
  const callerId = context.auth.uid;
  const { teamId, shiftId, slotIndex } = data || {};
  const participantId = (data && data.participantUserId) ? String(data.participantUserId) : callerId;
  if (!teamId || !shiftId || slotIndex === undefined || slotIndex === null) {
    throw new functions.https.HttpsError('invalid-argument', 'teamId, shiftId and slotIndex are required.');
  }
  const db = admin.firestore();
  const callerSnap = await db.collection('users').doc(callerId).get();
  const callerData = callerSnap.exists ? callerSnap.data() : {};

  let name;
  if (participantId === callerId) {
    name = callerData.displayName || callerData.email || 'Volunteer';
  } else {
    // A parent registering a linked player for a spot.
    const linked = Array.isArray(callerData.linkedPlayerIds) ? callerData.linkedPlayerIds : [];
    if (!linked.includes(participantId)) {
      throw new functions.https.HttpsError('permission-denied', 'You can only sign up players linked to your account.');
    }
    const rosterSnap = await db.collection('teams').doc(teamId).collection('roster')
      .where('userId', '==', participantId).limit(1).get();
    if (rosterSnap.empty) {
      throw new functions.https.HttpsError('failed-precondition', 'That player is not on this team.');
    }
    const pSnap = await db.collection('users').doc(participantId).get();
    const pData = pSnap.exists ? pSnap.data() : {};
    name = rosterSnap.docs[0].get('playerName') || pData.displayName || pData.email || 'Player';
  }

  const shiftRef = db.collection('teams').doc(teamId).collection('volunteerShifts').doc(shiftId);

  await db.runTransaction(async (tx) => {
    const shiftSnap = await tx.get(shiftRef);
    if (!shiftSnap.exists) {
      throw new functions.https.HttpsError('not-found', 'Shift not found.');
    }
    const shift = shiftSnap.data();
    if (participantId !== callerId && shift.playersCanVolunteer === false) {
      throw new functions.https.HttpsError('failed-precondition', 'Players cannot volunteer for this shift.');
    }
    const cap = shift.slotsPerShift || shift.slotsNeeded || 1;
    const inc = shift.incrementMinutes || 60;
    const totalMinutes = Math.max(1, Math.floor((shift.end - shift.start) / 60));
    const totalSlots = Math.max(1, Math.ceil(totalMinutes / inc));
    const idx = Number(slotIndex);
    if (idx < 0 || idx >= totalSlots) {
      throw new functions.https.HttpsError('invalid-argument', 'Invalid slot.');
    }
    const signupsRef = shiftRef.collection('signups');
    const myDoc = signupsRef.doc(participantId);
    const mySnap = await tx.get(myDoc);
    if (mySnap.exists) {
      throw new functions.https.HttpsError('failed-precondition',
        participantId === callerId ? 'You are already signed up for this shift.' : 'That player is already signed up for this shift.');
    }
    const existing = await tx.get(signupsRef.where('slotIndex', '==', idx));
    if (existing.size >= cap) {
      throw new functions.https.HttpsError('failed-precondition', 'That slot is already full.');
    }
    tx.set(myDoc, {
      shiftId: shiftId,
      userId: participantId,
      name: name,
      slotIndex: idx,
      signedUpBy: callerId,
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
    });
  });
  return { ok: true };
});

exports.volunteerCancelSignUp = functions.https.onCall(async (data, context) => {
  if (!context.auth) {
    throw new functions.https.HttpsError('unauthenticated', 'You must be signed in.');
  }
  const callerId = context.auth.uid;
  const { teamId, shiftId } = data || {};
  const participantId = (data && data.participantUserId) ? String(data.participantUserId) : callerId;
  if (!teamId || !shiftId) {
    throw new functions.https.HttpsError('invalid-argument', 'teamId and shiftId are required.');
  }
  const db = admin.firestore();
  if (participantId !== callerId) {
    const callerSnap = await db.collection('users').doc(callerId).get();
    const linked = callerSnap.exists && Array.isArray(callerSnap.get('linkedPlayerIds')) ? callerSnap.get('linkedPlayerIds') : [];
    if (!linked.includes(participantId)) {
      throw new functions.https.HttpsError('permission-denied', 'You can only cancel sign-ups for players linked to your account.');
    }
  }
  await db.collection('teams').doc(teamId).collection('volunteerShifts').doc(shiftId)
    .collection('signups').doc(participantId).delete();
  return { ok: true };
});

// When a volunteer shift is created, add a reminder event to the team calendar
// and notify members so they can sign up.
exports.onVolunteerShiftCreated = functions.firestore
  .document('teams/{teamId}/volunteerShifts/{shiftId}')
  .onCreate(async (snap, context) => {
    const shift = snap.data() || {};
    const teamId = context.params.teamId;
    if (!shift.start || !shift.end) return null;
    const db = admin.firestore();
    const evRef = await db.collection('events').add({
      teamId: teamId,
      title: 'Volunteer: ' + (shift.title || 'Shift'),
      type: 'meeting',
      date: shift.start,
      endDate: shift.end,
      location: '',
      notes: 'Volunteer sign-up event.',
      silent: true,
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
    });
    await snap.ref.set({ eventId: evRef.id }, { merge: true });

    const members = await db.collection('teams').doc(teamId).collection('members').get();
    for (const m of members.docs) {
      const uid = m.get('userId');
      const role = m.get('role');
      if (uid && (role === 'player' || role === 'parent' || role === 'follower')) {
        await sendToUser(uid, 'New volunteer shift', (shift.title || 'A volunteer shift') + ' was posted. Tap to sign up.');
      }
    }
    return null;
  });

// ---------------------------------------------------------------------------
// Injury status — AD, coach, staff, and athletic trainers can report an injury
// or clear a player to return to play. The current status is mirrored onto the
// roster entry (so it shows on the roster) and every report is kept as history.
// ---------------------------------------------------------------------------
async function requireInjuryPermission(teamId, callerId) {
  const db = admin.firestore();
  const userSnap = await db.collection('users').doc(callerId).get();
  const isAd = userSnap.exists && userSnap.get('role') === 'ad';
  const memSnap = await db.collection('teams').doc(teamId).collection('members').doc(callerId).get();
  const role = memSnap.exists ? memSnap.get('role') : null;
  if (!isAd && role !== 'coach' && role !== 'staff') {
    throw new functions.https.HttpsError(
      'permission-denied',
      'Only an AD, coach, or staff member can update injury status.'
    );
  }
  const name = userSnap.exists
    ? (userSnap.get('displayName') || userSnap.get('email') || 'Staff')
    : 'Staff';
  return { db, name, role, isAd };
}

exports.reportPlayerInjury = functions.https.onCall(async (data, context) => {
  if (!context.auth) {
    throw new functions.https.HttpsError('unauthenticated', 'You must be signed in.');
  }
  const callerId = context.auth.uid;
  const { teamId, rosterEntryId } = data || {};
  if (!teamId || !rosterEntryId) {
    throw new functions.https.HttpsError('invalid-argument', 'teamId and rosterEntryId are required.');
  }
  const status = data.status === 'limited' ? 'limited' : 'injured';
  const bodyPart = (data.bodyPart || '').toString().slice(0, 120);
  const description = (data.description || '').toString().slice(0, 2000);
  const severity = (data.severity || '').toString().slice(0, 40);
  const expectedReturn = (data.expectedReturn || '').toString().slice(0, 120);

  const { db, name } = await requireInjuryPermission(teamId, callerId);

  const entryRef = db.collection('teams').doc(teamId).collection('roster').doc(rosterEntryId);
  const entrySnap = await entryRef.get();
  if (!entrySnap.exists) {
    throw new functions.https.HttpsError('not-found', 'Player is not on this roster.');
  }

  const reportRef = entryRef.collection('injuryReports').doc();
  await reportRef.set({
    status: status,
    bodyPart: bodyPart,
    description: description,
    severity: severity,
    expectedReturn: expectedReturn,
    reportedBy: callerId,
    reportedByName: name,
    reportedAt: admin.firestore.FieldValue.serverTimestamp(),
    cleared: false,
    clearedByName: '',
    clearedAt: null,
  });

  await entryRef.set({
    injuryStatus: status,
    injuryNote: description,
    injuryBodyPart: bodyPart,
    injuryUpdatedBy: callerId,
    injuryUpdatedByName: name,
    injuryUpdatedAt: admin.firestore.FieldValue.serverTimestamp(),
    injuryReportId: reportRef.id,
    injuryClearedByName: '',
    injuryClearedAt: null,
  }, { merge: true });

  return { ok: true, reportId: reportRef.id };
});

exports.clearPlayerInjury = functions.https.onCall(async (data, context) => {
  if (!context.auth) {
    throw new functions.https.HttpsError('unauthenticated', 'You must be signed in.');
  }
  const callerId = context.auth.uid;
  const { teamId, rosterEntryId } = data || {};
  if (!teamId || !rosterEntryId) {
    throw new functions.https.HttpsError('invalid-argument', 'teamId and rosterEntryId are required.');
  }

  const { db, name } = await requireInjuryPermission(teamId, callerId);

  const entryRef = db.collection('teams').doc(teamId).collection('roster').doc(rosterEntryId);
  const entrySnap = await entryRef.get();
  if (!entrySnap.exists) {
    throw new functions.https.HttpsError('not-found', 'Player is not on this roster.');
  }

  const reportId = entrySnap.get('injuryReportId');
  if (reportId) {
    await entryRef.collection('injuryReports').doc(reportId).set({
      cleared: true,
      clearedBy: callerId,
      clearedByName: name,
      clearedAt: admin.firestore.FieldValue.serverTimestamp(),
    }, { merge: true });
  }

  await entryRef.set({
    injuryStatus: 'healthy',
    injuryClearedBy: callerId,
    injuryClearedByName: name,
    injuryClearedAt: admin.firestore.FieldValue.serverTimestamp(),
    injuryUpdatedByName: name,
    injuryUpdatedAt: admin.firestore.FieldValue.serverTimestamp(),
  }, { merge: true });

  return { ok: true };
});



// ---------------------------------------------------------------------------
// Team creation — every new team is created with a complete setup so it has
// every feature immediately: the team document plus the head coach's coach
// membership (needed for roster, forms, injuries, eligibility, volunteer,
// trips, fundraising, messaging, and scoring permissions).
// ---------------------------------------------------------------------------
function randomJoinCode() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let out = '';
  for (let i = 0; i < 6; i++) out += chars.charAt(Math.floor(Math.random() * chars.length));
  return out;
}

async function userProfile(db, uid) {
  const snap = await db.collection('users').doc(uid).get();
  return {
    exists: snap.exists,
    role: snap.exists ? snap.get('role') : null,
    name: snap.exists ? (snap.get('displayName') || '') : '',
    email: snap.exists ? (snap.get('email') || '') : '',
    schoolId: snap.exists ? (snap.get('schoolId') || '') : '',
  };
}

exports.createTeam = functions.https.onCall(async (data, context) => {
  if (!context.auth) {
    throw new functions.https.HttpsError('unauthenticated', 'You must be signed in.');
  }
  const callerId = context.auth.uid;
  const {
    schoolId, sportId, sportName, level, season, gender, headCoachId,
  } = data || {};
  if (!schoolId || !sportId || !sportName) {
    throw new functions.https.HttpsError('invalid-argument', 'schoolId, sportId and sportName are required.');
  }

  const db = admin.firestore();
  const caller = await userProfile(db, callerId);
  if (caller.role !== 'ad') {
    throw new functions.https.HttpsError('permission-denied', 'Only an athletic director can create a team.');
  }

  const coachId = headCoachId || callerId;
  const joinCode = randomJoinCode();
  const teamRef = db.collection('teams').doc();
  await teamRef.set({
    schoolId: schoolId,
    sportId: sportId,
    sportName: sportName,
    level: level || 'Varsity',
    season: season || 'Fall',
    gender: gender || 'Boys',
    headCoachId: coachId,
    joinCode: joinCode,
    createdAt: admin.firestore.FieldValue.serverTimestamp(),
  });

  // The head coach gets full coach membership so every feature is available.
  const coach = await userProfile(db, coachId);
  await teamRef.collection('members').doc(coachId).set({
    teamId: teamRef.id,
    userId: coachId,
    role: 'coach',
    name: coach.name,
    email: coach.email,
    permissions: [],
    createdAt: admin.firestore.FieldValue.serverTimestamp(),
  }, { merge: true });

  // Make sure the coach can see this school's teams in their app.
  if (!coach.exists || !coach.schoolId) {
    await db.collection('users').doc(coachId).set({ schoolId: schoolId }, { merge: true });
  }

  return { teamId: teamRef.id, joinCode: joinCode };
});

// Safety net: if a head coach is missing their membership (e.g. a team created
// before the flow above), this repairs it so no team is left without its coach.
exports.ensureTeamCoachMembership = functions.https.onCall(async (data, context) => {
  if (!context.auth) {
    throw new functions.https.HttpsError('unauthenticated', 'You must be signed in.');
  }
  const callerId = context.auth.uid;
  const teamId = data && data.teamId ? String(data.teamId) : '';
  if (!teamId) {
    throw new functions.https.HttpsError('invalid-argument', 'teamId is required.');
  }

  const db = admin.firestore();
  const teamRef = db.collection('teams').doc(teamId);
  const teamSnap = await teamRef.get();
  if (!teamSnap.exists) {
    throw new functions.https.HttpsError('not-found', 'Team not found.');
  }

  const coachId = teamSnap.get('headCoachId') || callerId;
  if (coachId !== callerId) {
    const caller = await userProfile(db, callerId);
    if (caller.role !== 'ad') {
      throw new functions.https.HttpsError('permission-denied', 'Only the head coach or an AD can repair this.');
    }
  }

  const memberRef = teamRef.collection('members').doc(coachId);
  const existing = await memberRef.get();
  if (existing.exists && existing.get('role') === 'coach') {
    return { ok: true, alreadyMember: true };
  }

  const coach = await userProfile(db, coachId);
  await memberRef.set({
    teamId: teamId,
    userId: coachId,
    role: 'coach',
    name: coach.name,
    email: coach.email,
    permissions: existing.exists ? (existing.get('permissions') || []) : [],
  }, { merge: true });

  if (!coach.exists || !coach.schoolId) {
    await db.collection('users').doc(coachId).set({
      schoolId: teamSnap.get('schoolId') || '',
    }, { merge: true });
  }

  return { ok: true, alreadyMember: false };
});

// ---------------------------------------------------------------------------
// Coach-first onboarding.
//
// Only an AD creates a SCHOOL organization. A coach who starts on their own
// gets an UNATTACHED team carrying the school name they typed as a hint. When
// an AD adopts that team, it joins the AD's school and the AD's official school
// name takes over. Coaches never see other teams in the school.
// ---------------------------------------------------------------------------

exports.createCoachTeam = functions.https.onCall(async (data, context) => {
  if (!context.auth) {
    throw new functions.https.HttpsError('unauthenticated', 'You must be signed in.');
  }
  const callerId = context.auth.uid;
  const {
    schoolName, sportId, sportName, level, season, gender,
  } = data || {};

  if (!sportId || !sportName) {
    throw new functions.https.HttpsError('invalid-argument', 'sportId and sportName are required.');
  }

  const db = admin.firestore();
  const caller = await userProfile(db, callerId);
  if (caller.role !== 'coach' && caller.role !== 'ad') {
    throw new functions.https.HttpsError('permission-denied', 'Only coaches or athletic directors can start a team.');
  }

  // An AD already has a school, so their team is attached immediately.
  // A coach gets an unattached team; the typed school name is only a hint.
  const hasSchool = !!caller.schoolId;
  const teamRef = db.collection('teams').doc();
  const joinCode = randomJoinCode();

  await teamRef.set({
    schoolId: hasSchool ? caller.schoolId : '',
    schoolNameHint: hasSchool ? '' : String(schoolName || '').trim(),
    adoptionStatus: hasSchool ? 'adopted' : 'unattached',
    sportId: sportId,
    sportName: sportName,
    level: level || 'Varsity',
    season: season || 'Fall',
    gender: gender || 'Boys',
    headCoachId: callerId,
    joinCode: joinCode,
    createdAt: admin.firestore.FieldValue.serverTimestamp(),
  });

  // Full coach membership so every feature works immediately.
  await teamRef.collection('members').doc(callerId).set({
    teamId: teamRef.id,
    userId: callerId,
    role: 'coach',
    name: caller.name,
    email: caller.email,
    permissions: [],
    createdAt: admin.firestore.FieldValue.serverTimestamp(),
  }, { merge: true });

  // Track the team on the coach so the app can route them straight in.
  await db.collection('users').doc(callerId).set({
    teamIds: admin.firestore.FieldValue.arrayUnion(teamRef.id),
  }, { merge: true });

  return {
    teamId: teamRef.id,
    joinCode: joinCode,
    attached: hasSchool,
  };
});

// An AD adopts a coach-started team into their school. The AD's official school
// name replaces whatever the coach typed.
exports.adoptTeam = functions.https.onCall(async (data, context) => {
  if (!context.auth) {
    throw new functions.https.HttpsError('unauthenticated', 'You must be signed in.');
  }
  const callerId = context.auth.uid;
  const teamId = data && data.teamId ? String(data.teamId) : '';
  if (!teamId) {
    throw new functions.https.HttpsError('invalid-argument', 'teamId is required.');
  }

  const db = admin.firestore();
  const caller = await userProfile(db, callerId);
  if (caller.role !== 'ad' || !caller.schoolId) {
    throw new functions.https.HttpsError('permission-denied', 'Only an athletic director with a school can adopt a team.');
  }

  const teamRef = db.collection('teams').doc(teamId);
  const teamSnap = await teamRef.get();
  if (!teamSnap.exists) {
    throw new functions.https.HttpsError('not-found', 'Team not found.');
  }
  const team = teamSnap.data();
  if (team.schoolId && team.schoolId !== caller.schoolId) {
    throw new functions.https.HttpsError('failed-precondition', 'That team already belongs to another school.');
  }
  if (team.adoptionStatus === 'adopted' && team.schoolId === caller.schoolId) {
    return { ok: true, alreadyAdopted: true, teamId: teamId };
  }

  const schoolSnap = await db.collection('schools').doc(caller.schoolId).get();
  const schoolName = schoolSnap.exists ? (schoolSnap.get('name') || '') : '';

  await teamRef.set({
    schoolId: caller.schoolId,
    adoptionStatus: 'adopted',
    adoptedAt: admin.firestore.FieldValue.serverTimestamp(),
    adoptedBy: callerId,
    adoptedByName: caller.name || '',
    // The official school name wins; the coach's hint is kept for audit only.
    schoolNameHint: team.schoolNameHint || '',
  }, { merge: true });

  const coachId = team.headCoachId;
  if (coachId && coachId !== callerId) {
    try {
      await sendToUser(
        coachId,
        'Your team joined ' + (schoolName || 'your school'),
        (caller.name || 'Your athletic director') + ' added ' + (team.sportName || 'your team') + ' to ' + (schoolName || 'the school') + '. Your roster, forms, and film carried over.'
      );
    } catch (e) { /* notifications are best-effort */ }
  }

  return { ok: true, teamId: teamId, schoolId: caller.schoolId, schoolName: schoolName };
});

// AD: unattached teams started by coaches, for the adoption list.
exports.listUnattachedTeams = functions.https.onCall(async (data, context) => {
  if (!context.auth) {
    throw new functions.https.HttpsError('unauthenticated', 'You must be signed in.');
  }
  const caller = await userProfile(admin.firestore(), context.auth.uid);
  if (caller.role !== 'ad' || !caller.schoolId) {
    throw new functions.https.HttpsError('permission-denied', 'Only an athletic director can view teams awaiting adoption.');
  }

  const db = admin.firestore();
  const snap = await db.collection('teams').where('adoptionStatus', '==', 'unattached').limit(50).get();
  const teams = snap.docs.map((doc) => {
    const d = doc.data();
    return {
      id: doc.id,
      sportName: d.sportName || '',
      level: d.level || '',
      season: d.season || '',
      gender: d.gender || '',
      schoolNameHint: d.schoolNameHint || '',
      headCoachId: d.headCoachId || '',
    };
  });
  return { teams: teams };
});



// ---------------------------------------------------------------------------
// Account deletion (App Store 5.1.1(v)).
//
// Deletion is HARD-BLOCKED while the user is the owner of a school or a team —
// silently transferring ownership is worse than a clear error. The user must
// hand those off first.
// ---------------------------------------------------------------------------
async function accountDeletionBlockers(db, uid) {
  const blockers = [];
  const userSnap = await db.collection('users').doc(uid).get();
  const user = userSnap.exists ? userSnap.data() : {};

  const ownedSchools = await db.collection('schools').where('adUserId', '==', uid).get();
  if (!ownedSchools.empty) {
    blockers.push({
      type: 'ownsSchool',
      message: 'You are the athletic director for ' + (ownedSchools.docs[0].get('name') || 'a school') + '. Transfer that role before deleting your account.',
      detail: ownedSchools.docs[0].get('name') || '',
    });
  }

  const ownedTeams = await db.collection('teams').where('headCoachId', '==', uid).get();
  if (!ownedTeams.empty) {
    blockers.push({
      type: 'coachesTeams',
      message: 'You are the head coach of ' + ownedTeams.size + ' team(s). Reassign the coach or delete the team(s) first.',
      detail: ownedTeams.docs.map((d) => d.get('sportName') || 'team').join(', '),
    });
  }

  return { blockers, user };
}

exports.previewAccountDeletion = functions.https.onCall(async (data, context) => {
  if (!context.auth) {
    throw new functions.https.HttpsError('unauthenticated', 'You must be signed in.');
  }
  const db = admin.firestore();
  const { blockers, user } = await accountDeletionBlockers(db, context.auth.uid);
  return {
    canDelete: blockers.length === 0,
    blockers: blockers,
    email: user.email || '',
    role: user.role || '',
  };
});

exports.deleteMyAccount = functions.https.onCall(async (data, context) => {
  if (!context.auth) {
    throw new functions.https.HttpsError('unauthenticated', 'You must be signed in.');
  }
  const uid = context.auth.uid;
  const db = admin.firestore();
  const { blockers, user } = await accountDeletionBlockers(db, uid);
  if (blockers.length > 0) {
    throw new functions.https.HttpsError('failed-precondition', blockers[0].message);
  }

  // 1. Leave every team membership.
  const teamIds = Array.isArray(user.teamIds) ? user.teamIds : [];
  for (const teamId of teamIds) {
    try {
      await db.collection('teams').doc(teamId).collection('members').doc(uid).delete();
    } catch (e) { /* keep going */ }
  }

  // 2. Unlink from any parent's family list.
  const parents = await db.collection('users').where('linkedPlayerIds', 'array-contains', uid).get();
  for (const doc of parents.docs) {
    await doc.ref.set({
      linkedPlayerIds: admin.firestore.FieldValue.arrayRemove(uid),
    }, { merge: true });
  }

  // 3. Detach the account from any roster entry it was attached to.
  for (const teamId of teamIds) {
    const entries = await db.collection('teams').doc(teamId).collection('roster')
      .where('userId', '==', uid).get();
    for (const doc of entries.docs) {
      await doc.ref.set({ userId: '' }, { merge: true });
    }
  }

  // 4. Remove the profile photo.
  try {
    await admin.storage().bucket().file(`users/${uid}/photo.jpg`).delete();
  } catch (e) { /* no photo */ }

  // 4b. Delete every object this user owns in Storage (avatars, uploads, exports),
  //     not just the one profile photo. App Store requires complete deletion.
  try {
    const [objects] = await admin.storage().bucket().getFiles({ prefix: `users/${uid}/` });
    if (objects.length) {
      await Promise.all(objects.map((f) => f.delete().catch(() => {})));
      console.log(`[deleteAccount] removed ${objects.length} storage objects for ${uid}`);
    }
  } catch (e) {
    console.warn('[deleteAccount] storage sweep failed', e && e.message);
  }

  // 5. Delete the profile document.
  await db.collection('users').doc(uid).delete();

  // 6. Delete the auth account (revokes refresh tokens).
  try {
    await admin.auth().deleteUser(uid);
  } catch (e) {
    console.error('[deleteMyAccount] auth delete failed', e);
  }

  // 7. Audit record — no PII.
  await db.collection('deletedAccounts').doc(uid).set({
    deletedAt: admin.firestore.FieldValue.serverTimestamp(),
    role: user.role || '',
    hadSchool: !!(user.schoolId || ''),
    teamCount: teamIds.length,
  });

  return { ok: true };
});


// ---------------------------------------------------------------------------
// User-generated content: reporting, blocking, and moderation.
// Required by App Store Guideline 1.2 for apps with chat + media.
// ---------------------------------------------------------------------------

exports.reportContent = functions.https.onCall(async (data, context) => {
  if (!context.auth) {
    throw new functions.https.HttpsError('unauthenticated', 'You must be signed in.');
  }
  const reporterId = context.auth.uid;
  const {
    teamId, contentType, contentId, reason, note, reportedUserId,
  } = data || {};

  if (!contentType || !contentId || !reason) {
    throw new functions.https.HttpsError('invalid-argument', 'contentType, contentId and reason are required.');
  }
  if (!['message', 'photo', 'profile'].includes(contentType)) {
    throw new functions.https.HttpsError('invalid-argument', 'Unsupported content type.');
  }

  const db = admin.firestore();
  const reporter = await userProfile(db, reporterId);

  const reportRef = db.collection('reports').doc();
  await reportRef.set({
    teamId: teamId || '',
    contentType: contentType,
    contentId: contentId,
    reason: String(reason).slice(0, 60),
    note: String(note || '').slice(0, 1000),
    reportedBy: reporterId,
    reportedByName: reporter.name || '',
    reportedUserId: reportedUserId || '',
    status: 'open',
    createdAt: admin.firestore.FieldValue.serverTimestamp(),
  });

  const targets = new Set();
  if (teamId) {
    const teamSnap = await db.collection('teams').doc(teamId).get();
    if (teamSnap.exists) {
      const schoolId = teamSnap.get('schoolId');
      if (schoolId) {
        const schoolSnap = await db.collection('schools').doc(schoolId).get();
        const adUserId = schoolSnap.exists ? schoolSnap.get('adUserId') : null;
        if (adUserId) targets.add(adUserId);
      }
      const members = await db.collection('teams').doc(teamId).collection('members').get();
      members.docs.forEach((d) => {
        if (d.get('role') === 'coach' && d.get('userId')) targets.add(d.get('userId'));
      });
    }
  }
  for (const uid of targets) {
    if (uid === reporterId) continue;
    try {
      await sendToUser(uid, 'Content reported', 'A ' + contentType + ' was reported (' + reason + '). Review it in Reports.');
    } catch (e) { /* best-effort */ }
  }

  return { ok: true, reportId: reportRef.id };
});

exports.blockUser = functions.https.onCall(async (data, context) => {
  if (!context.auth) {
    throw new functions.https.HttpsError('unauthenticated', 'You must be signed in.');
  }
  const uid = context.auth.uid;
  const target = data && data.targetUid ? String(data.targetUid) : '';
  if (!target) {
    throw new functions.https.HttpsError('invalid-argument', 'targetUid is required.');
  }
  if (target === uid) {
    throw new functions.https.HttpsError('invalid-argument', 'You cannot block yourself.');
  }
  await admin.firestore().collection('users').doc(uid).set({
    blockedUids: admin.firestore.FieldValue.arrayUnion(target),
  }, { merge: true });
  return { ok: true };
});

exports.unblockUser = functions.https.onCall(async (data, context) => {
  if (!context.auth) {
    throw new functions.https.HttpsError('unauthenticated', 'You must be signed in.');
  }
  const uid = context.auth.uid;
  const target = data && data.targetUid ? String(data.targetUid) : '';
  if (!target) {
    throw new functions.https.HttpsError('invalid-argument', 'targetUid is required.');
  }
  await admin.firestore().collection('users').doc(uid).set({
    blockedUids: admin.firestore.FieldValue.arrayRemove(target),
  }, { merge: true });
  return { ok: true };
});

// AD/coach: hide a reported message. Hiding preserves the audit trail.
exports.moderateMessage = functions.https.onCall(async (data, context) => {
  if (!context.auth) {
    throw new functions.https.HttpsError('unauthenticated', 'You must be signed in.');
  }
  const callerId = context.auth.uid;
  const { chatId, messageId, hide } = data || {};
  if (!chatId || !messageId) {
    throw new functions.https.HttpsError('invalid-argument', 'chatId and messageId are required.');
  }

  const db = admin.firestore();
  const chatSnap = await db.collection('chats').doc(chatId).get();
  if (!chatSnap.exists) {
    throw new functions.https.HttpsError('not-found', 'Chat not found.');
  }
  const teamId = chatSnap.get('teamId');
  const caller = await userProfile(db, callerId);
  const memSnap = await db.collection('teams').doc(teamId).collection('members').doc(callerId).get();
  const role = memSnap.exists ? memSnap.get('role') : null;
  if (caller.role !== 'ad' && role !== 'coach') {
    throw new functions.https.HttpsError('permission-denied', 'Only an AD or coach can moderate messages.');
  }

  await db.collection('chats').doc(chatId).collection('messages').doc(messageId).set({
    hidden: hide !== false,
    moderatedBy: callerId,
    moderatedAt: admin.firestore.FieldValue.serverTimestamp(),
  }, { merge: true });

  return { ok: true };
});

// ---------------------------------------------------------------------------
// Bulk onboarding: create parent invitations from a roster import in one pass.
// ---------------------------------------------------------------------------
function normalizeEmail(value) {
  return String(value || '').trim().toLowerCase();
}

function validEmail(value) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

function inviteCode() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let out = '';
  for (let i = 0; i < 6; i++) out += chars.charAt(Math.floor(Math.random() * chars.length));
  return out;
}

exports.bulkInviteParents = functions.https.onCall(async (data, context) => {
  if (!context.auth) {
    throw new functions.https.HttpsError('unauthenticated', 'You must be signed in.');
  }
  const callerId = context.auth.uid;
  const teamId = data && data.teamId ? String(data.teamId) : '';
  const rows = (data && Array.isArray(data.invites)) ? data.invites : [];
  if (!teamId || rows.length === 0) {
    throw new functions.https.HttpsError('invalid-argument', 'teamId and invites are required.');
  }
  if (rows.length > 200) {
    throw new functions.https.HttpsError('invalid-argument', 'Send at most 200 invitations at a time.');
  }

  const db = admin.firestore();
  const teamRef = db.collection('teams').doc(teamId);
  const teamSnap = await teamRef.get();
  if (!teamSnap.exists) {
    throw new functions.https.HttpsError('not-found', 'Team not found.');
  }

  const caller = await userProfile(db, callerId);
  const memSnap = await teamRef.collection('members').doc(callerId).get();
  const callerRole = memSnap.exists ? memSnap.get('role') : null;
  if (caller.role !== 'ad' && callerRole !== 'coach' && callerRole !== 'staff') {
    throw new functions.https.HttpsError('permission-denied', 'You cannot invite parents to this team.');
  }

  const schoolId = teamSnap.get('schoolId') || '';
  let schoolName = '';
  if (schoolId) {
    const schoolSnap = await db.collection('schools').doc(schoolId).get();
    if (schoolSnap.exists) schoolName = schoolSnap.get('name') || '';
  }
  const teamName = [teamSnap.get('sportName'), teamSnap.get('level')].filter(Boolean).join(' ');

  const existingSnap = await db.collection('invitations').where('teamId', '==', teamId).get();
  const already = new Set(existingSnap.docs.map((d) => normalizeEmail(d.get('email'))));

  const created = [];
  const skipped = [];
  const invalid = [];

  for (const row of rows) {
    const email = normalizeEmail(row && row.email);
    const rosterEntryId = row && row.rosterEntryId ? String(row.rosterEntryId) : '';

    if (!validEmail(email)) { invalid.push({ email: email, reason: 'invalid_email' }); continue; }
    if (already.has(email)) { skipped.push({ email: email, reason: 'already_invited' }); continue; }

    const ref = db.collection('invitations').doc();
    await ref.set({
      email: email,
      role: 'parent',
      schoolId: schoolId,
      schoolName: schoolName,
      sportNames: [teamSnap.get('sportName') || ''],
      teamId: teamId,
      teamName: teamName,
      rosterEntryId: rosterEntryId,
      code: inviteCode(),
      status: 'pending',
      invitedBy: callerId,
      invitedByName: caller.name || '',
      deliveryStatus: process.env.SMTP_HOST ? 'pending' : 'not_configured',
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
    });

    if (rosterEntryId) {
      try {
        await teamRef.collection('roster').doc(rosterEntryId).set({
          parentEmail: email,
          parentName: row.name || '',
        }, { merge: true });
      } catch (e) { /* non-fatal */ }
    }

    already.add(email);
    created.push({ email: email, invitationId: ref.id });
  }

  return {
    created: created.length,
    skipped: skipped.length,
    invalid: invalid.length,
    details: { created: created, skipped: skipped, invalid: invalid },
    emailConfigured: !!process.env.SMTP_HOST,
  };
});


// ---------------------------------------------------------------------------
// Entitlements & plans. Enforced server-side — the client read is for UI only.
// ---------------------------------------------------------------------------
const PLAN_LIMITS = {
  free:     { teams: 1,   reelsPerMonth: 1,    videoBytes: 1 * 1024 * 1024 * 1024 },
  team:     { teams: 1,   reelsPerMonth: 10,   videoBytes: 25 * 1024 * 1024 * 1024 },
  school:   { teams: 40,  reelsPerMonth: 200,  videoBytes: 250 * 1024 * 1024 * 1024 },
  district: { teams: 500, reelsPerMonth: 2000, videoBytes: 2 * 1024 * 1024 * 1024 * 1024 },
};

async function entitlementFor(db, uid) {
  const userSnap = await db.collection('users').doc(uid).get();
  const schoolId = userSnap.exists ? (userSnap.get('schoolId') || '') : '';
  if (!schoolId) {
    return { plan: 'free', planStatus: 'active', schoolId: '', limits: PLAN_LIMITS.free, usage: {} };
  }
  const schoolSnap = await db.collection('schools').doc(schoolId).get();
  const school = schoolSnap.exists ? schoolSnap.data() : {};
  const plan = PLAN_LIMITS[school.plan] ? school.plan : 'free';
  return {
    plan: plan,
    planStatus: school.planStatus || 'active',
    schoolId: schoolId,
    limits: PLAN_LIMITS[plan],
    usage: {
      videoBytesUsed: school.videoBytesUsed || 0,
      reelsThisMonth: school.reelsThisMonth || 0,
      activeTeams: school.activeTeams || 0,
    },
  };
}

exports.getEntitlement = functions.https.onCall(async (data, context) => {
  if (!context.auth) {
    throw new functions.https.HttpsError('unauthenticated', 'You must be signed in.');
  }
  return entitlementFor(admin.firestore(), context.auth.uid);
});

// Called before a video upload so quota is enforced server-side, not in the UI.
exports.consumeVideoQuota = functions.https.onCall(async (data, context) => {
  if (!context.auth) {
    throw new functions.https.HttpsError('unauthenticated', 'You must be signed in.');
  }
  const bytes = Number(data && data.bytes ? data.bytes : 0);
  if (!bytes || bytes <= 0) {
    throw new functions.https.HttpsError('invalid-argument', 'bytes is required.');
  }
  const db = admin.firestore();
  const ent = await entitlementFor(db, context.auth.uid);
  if (!ent.schoolId) return { allowed: true, reason: 'no_school' };

  const used = ent.usage.videoBytesUsed || 0;
  if (used + bytes > ent.limits.videoBytes) {
    throw new functions.https.HttpsError(
      'resource-exhausted',
      'This school has reached its video storage limit. Remove old film or upgrade the plan.',
      { used: used, limit: ent.limits.videoBytes, plan: ent.plan }
    );
  }
  await db.collection('schools').doc(ent.schoolId).set({
    videoBytesUsed: admin.firestore.FieldValue.increment(bytes),
  }, { merge: true });
  return { allowed: true, used: used + bytes, limit: ent.limits.videoBytes, plan: ent.plan };
});


// ---------------------------------------------------------------------------
// Billing. Schools buy on the web via Stripe; the iOS app never sells.
// ---------------------------------------------------------------------------
exports.createCheckoutSession = functions.https.onCall(async (data, context) => {
  if (!context.auth) {
    throw new functions.https.HttpsError('unauthenticated', 'You must be signed in.');
  }
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) {
    throw new functions.https.HttpsError('failed-precondition', 'Billing is not configured yet.');
  }
  const db = admin.firestore();
  const caller = await userProfile(db, context.auth.uid);
  if (caller.role !== 'ad' || !caller.schoolId) {
    throw new functions.https.HttpsError('permission-denied', 'Only an athletic director can start a subscription.');
  }
  const plan = data && data.plan ? String(data.plan) : 'school';
  const priceId = process.env['STRIPE_PRICE_' + plan.toUpperCase()];
  if (!priceId) {
    throw new functions.https.HttpsError('failed-precondition', 'No price configured for that plan.');
  }
  const successUrl = (data && data.successUrl) || 'https://rocklab-athletics.web.app/billing/?status=success';
  const cancelUrl = (data && data.cancelUrl) || 'https://rocklab-athletics.web.app/billing/?status=cancel';

  const params = new URLSearchParams();
  params.append('mode', 'subscription');
  params.append('line_items[0][price]', priceId);
  params.append('line_items[0][quantity]', '1');
  params.append('success_url', successUrl);
  params.append('cancel_url', cancelUrl);
  params.append('client_reference_id', caller.schoolId);
  params.append('metadata[schoolId]', caller.schoolId);
  params.append('metadata[plan]', plan);

  const resp = await fetch('https://api.stripe.com/v1/checkout/sessions', {
    method: 'POST',
    headers: {
      Authorization: 'Bearer ' + key,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: params.toString(),
  });
  const json = await resp.json();
  if (!resp.ok) {
    console.error('[stripe] checkout failed', json);
    throw new functions.https.HttpsError('internal', 'Could not start checkout.');
  }
  return { url: json.url, sessionId: json.id };
});

// Stripe -> Firestore plan sync.
//
// Signature verification follows Stripe's documented scheme: the
// `stripe-signature` header looks like `t=<timestamp>,v1=<hmac>` and the HMAC is
// SHA-256 over `${timestamp}.${rawBody}` keyed by the webhook signing secret.
// We compare against every v1 value using a timing-safe comparison.
//
// If the secret is not configured we FAIL CLOSED (503). Accepting unsigned
// requests would let anyone POST a fake `checkout.session.completed` and grant
// themselves a paid plan.
function verifyStripeSignature(rawBody, header, secret) {
  if (!header || !rawBody) return false;
  let timestamp = null;
  const v1s = [];
  for (const part of String(header).split(',')) {
    const idx = part.indexOf('=');
    if (idx === -1) continue;
    const k = part.slice(0, idx).trim();
    const v = part.slice(idx + 1).trim();
    if (k === 't') timestamp = v;
    else if (k === 'v1') v1s.push(v);
  }
  if (!timestamp || v1s.length === 0) return false;
  const expected = crypto
    .createHmac('sha256', secret)
    .update(`${timestamp}.${rawBody}`)
    .digest('hex');
  const expectedBuf = Buffer.from(expected, 'utf8');
  return v1s.some((v) => {
    const b = Buffer.from(v, 'utf8');
    return b.length === expectedBuf.length && crypto.timingSafeEqual(b, expectedBuf);
  });
}

exports.stripeWebhook = functions.https.onRequest(async (req, res) => {
  const secret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!secret) {
    console.error('[stripe] STRIPE_WEBHOOK_SECRET is not configured; refusing webhook');
    res.status(503).send('webhook not configured');
    return;
  }
  // Firebase provides req.rawBody for exactly this use case.
  const rawBody = req.rawBody ? req.rawBody.toString('utf8') : '';
  if (!verifyStripeSignature(rawBody, req.headers['stripe-signature'], secret)) {
    res.status(400).send('bad signature');
    return;
  }

  let event = {};
  try {
    event = JSON.parse(rawBody || '{}');
  } catch (e) {
    res.status(400).send('bad payload');
    return;
  }
  const db = admin.firestore();

  try {
    const obj = event.data && event.data.object ? event.data.object : {};
    const schoolId = (obj.metadata && obj.metadata.schoolId) || obj.client_reference_id;

    if (event.type === 'checkout.session.completed' || event.type === 'customer.subscription.updated') {
      const plan = (obj.metadata && obj.metadata.plan) || 'school';
      if (schoolId) {
        await db.collection('schools').doc(schoolId).set({
          plan: plan,
          planStatus: 'active',
          stripeCustomerId: obj.customer || '',
          stripeSubscriptionId: obj.subscription || obj.id || '',
        }, { merge: true });
      }
    }
    if (event.type === 'customer.subscription.deleted' && schoolId) {
      await db.collection('schools').doc(schoolId).set({ planStatus: 'canceled' }, { merge: true });
    }
    if (event.type === 'invoice.payment_failed' && schoolId) {
      await db.collection('schools').doc(schoolId).set({ planStatus: 'past_due' }, { merge: true });
    }
  } catch (err) {
    console.error('[stripe] webhook error', err);
  }

  res.json({ received: true });
});

