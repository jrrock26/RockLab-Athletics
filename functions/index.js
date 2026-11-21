const functions = require('firebase-functions');
const admin = require('firebase-admin');
const nodemailer = require('nodemailer');
const crypto = require('crypto');
const {
  expandRecurring,
  openHoursViolation,
  partitionCandidates,
} = require('./booking');
const {
  acceptanceBlocker,
  DEFAULT_TTL_DAYS,
} = require('./invitations');

admin.initializeApp();

// ---------------------------------------------------------------------------
// Shared: transactional email, invitation links, and the audit trail.
//
// Email is configured by environment, never by code:
//   1. RESEND_API_KEY (+ RESEND_FROM)      — preferred
//   2. SMTP_HOST / SMTP_USER / SMTP_PASS   — fallback
//
// If neither is set, invitations are STILL usable: every invitation carries a
// shareable link the AD can paste into whatever channel the school already
// uses. We record the true delivery state instead of pretending an email went
// out, because "silently not invited" is the failure mode that kills adoption.
// ---------------------------------------------------------------------------
const WEB_BASE = process.env.PUBLIC_WEB_BASE || 'https://rocklab-athletics.web.app';

function emailConfigured() {
  const { RESEND_API_KEY, SMTP_HOST, SMTP_USER, SMTP_PASS } = process.env;
  return !!(RESEND_API_KEY || (SMTP_HOST && SMTP_USER && SMTP_PASS));
}

function inviteLink(invitation) {
  const email = encodeURIComponent(String((invitation && invitation.email) || ''));
  const code = encodeURIComponent(String((invitation && invitation.code) || ''));
  return `${WEB_BASE}/invite/?email=${email}&code=${code}`;
}

async function sendEmail({ to, subject, text, html }) {
  const { RESEND_API_KEY, RESEND_FROM, SMTP_HOST, SMTP_USER, SMTP_PASS } = process.env;

  if (RESEND_API_KEY) {
    try {
      const res = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${RESEND_API_KEY}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          from: RESEND_FROM || 'RockLab Athletics <invites@rocklabathletics.com>',
          to: [to],
          subject,
          text,
          ...(html ? { html } : {}),
        }),
      });
      if (!res.ok) {
        const body = await res.text();
        return { ok: false, provider: 'resend', error: String(body).slice(0, 300) };
      }
      return { ok: true, provider: 'resend' };
    } catch (err) {
      return { ok: false, provider: 'resend', error: String(err).slice(0, 300) };
    }
  }

  if (SMTP_HOST && SMTP_USER && SMTP_PASS) {
    try {
      const transporter = nodemailer.createTransport({
        host: SMTP_HOST,
        port: Number(process.env.SMTP_PORT || 587),
        secure: false,
        auth: { user: SMTP_USER, pass: SMTP_PASS },
      });
      await transporter.sendMail({
        from: process.env.SMTP_FROM || SMTP_USER,
        to,
        subject,
        text,
        ...(html ? { html } : {}),
      });
      return { ok: true, provider: 'smtp' };
    } catch (err) {
      return { ok: false, provider: 'smtp', error: String(err).slice(0, 300) };
    }
  }

  return { ok: false, provider: 'none', error: 'No email provider configured.' };
}

// Append-only audit trail. Written only from Cloud Functions via the Admin SDK,
// so a client can neither forge an entry nor erase one. firestore.rules denies
// all client writes to `auditLogs`, and nothing in this file ever updates or
// deletes a log document once written.
async function writeAudit({
  schoolId = '', actorId = '', actorName = '', actorRole = '',
  action, targetType = '', targetId = '', detail = '',
}) {
  try {
    await admin.firestore().collection('auditLogs').add({
      schoolId: schoolId || null,
      actorId: actorId || null,
      actorName: actorName || '',
      actorRole: actorRole || '',
      action: String(action || ''),
      targetType: targetType || '',
      targetId: targetId || '',
      detail: String(detail || '').slice(0, 500),
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
    });
  } catch (err) {
    // Auditing must never break the operation it describes.
    console.error('[audit] write failed', action, err);
  }
}


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
  const callerSchoolId = callerSnap.exists ? callerSnap.get('schoolId') : null;
  const targetRole = targetSnap.get('role') || 'follower';

  const isAd = callerRole === 'ad';
  const isCoach = callerRole === 'coach';
  if (!isAd && !isCoach) {
    throw new functions.https.HttpsError('permission-denied', 'Only an AD or coach can manage users.');
  }
  // Without this an AD could edit users in any school in the database, which is
  // the same cross-tenant reach the rules now forbid.
  if (!callerSchoolId || targetSnap.get('schoolId') !== callerSchoolId) {
    throw new functions.https.HttpsError('permission-denied', 'You can only manage users in your own school.');
  }

  if (action === 'setRole') {
    const allowed = ['ad', 'coach', 'staff', 'player', 'parent', 'follower'];
    if (!allowed.includes(newRole)) {
      throw new functions.https.HttpsError('invalid-argument', 'Invalid role.');
    }
    if (newRole === 'ad') {
      // There is exactly one AD per school, and the role carries ownership of the
      // school. It moves by handoff (inviteAdSuccessor -> acceptAdTransfer), never
      // by assignment, so two people can never hold it at once.
      throw new functions.https.HttpsError(
        'failed-precondition',
        'The AD role is handed off, not assigned. Use AD handoff from the current AD account.');
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
  await writeAudit({
    actorId: callerId,
    action: 'role.assigned',
    targetType: 'user',
    targetId: targetUid,
    detail: `${role} on team ${teamId}`,
  });
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

    const link = inviteLink(inv);
    // The link is stored regardless of email, so the AD always has a fallback
    // channel: paste it into the school's existing email blast, a text, a flyer.
    await snap.ref.set({ inviteUrl: link }, { merge: true });

    const sent = await sendEmail({
      to: email,
      subject: `You've been invited to ${schoolName} on RockLab Athletics`,
      text: [
        `You've been invited as a ${role} for ${schoolName} on RockLab Athletics.`,
        '',
        'To accept:',
        `1. Install RockLab Athletics: ${WEB_BASE}`,
        '2. Sign up using this exact email address.',
        '',
        `Invitation link: ${link}`,
        `Invitation code: ${inv.code || '(none)'}`,
      ].join('\n'),
      html: [
        `<p>You've been invited as a <strong>${role}</strong> for <strong>${schoolName}</strong> on RockLab Athletics.</p>`,
        `<p><a href="${link}">Open your invitation</a></p>`,
        `<p>Sign up using this exact email address (${email}) to see it in the app.</p>`,
        `<p style="color:#666;font-size:12px">Invitation code: ${inv.code || '(none)'}</p>`,
      ].join(''),
    });

    if (sent.ok) {
      await snap.ref.set({
        deliveryStatus: 'sent',
        deliveryProvider: sent.provider,
        deliveredAt: admin.firestore.FieldValue.serverTimestamp(),
      }, { merge: true });
      console.log(`[invite] sent to ${email} via ${sent.provider}`);
    } else if (sent.provider === 'none') {
      // Not an error: the invitation is fully usable, it just needs a manual
      // channel. Surfaced in the console so the AD knows to copy the link.
      console.warn(`[invite] no email provider; ${email} must be invited via the shareable link.`);
      await snap.ref.set({
        deliveryStatus: 'not_configured',
        deliveryNote: 'No email provider configured. Copy the invite link and send it directly.',
      }, { merge: true });
    } else {
      console.error(`[invite] send failed for ${email}`, sent.error);
      await snap.ref.set({
        deliveryStatus: 'failed',
        deliveryNote: sent.error,
      }, { merge: true });
    }

    await writeAudit({
      schoolId: inv.schoolId || '',
      actorId: inv.invitedBy || '',
      actorName: inv.invitedByName || '',
      action: 'invite.created',
      targetType: 'invitation',
      targetId: snap.id,
      detail: `${email} as ${role}${inv.teamName ? ` (${inv.teamName})` : ''}`,
    });

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
  // One place decides whether an invitation is still acceptable, so the reason
  // shown to the user matches the rule that refused them (expired, cancelled,
  // superseded, already accepted).
  const blocker = acceptanceBlocker(invData, Date.now());
  if (blocker) {
    // Record the expiry the first time we notice it, so admins see a true state
    // instead of an invitation that looks pending forever.
    if (/expired/i.test(blocker) && invData.status === 'pending') {
      await invSnap.ref.set({ status: 'expired', expiredAt: Date.now() }, { merge: true });
    }
    throw new functions.https.HttpsError('failed-precondition', blocker);
  }
  if ((invData.email || '').toLowerCase() !== callerEmail) {
    throw new functions.https.HttpsError('permission-denied', 'This invitation is for a different account.');
  }
  // AD is a handoff, not a role assignment: it moves ownership of the school.
  // Accepting it here would grant the label without the ownership that backs it.
  if (invData.role === 'ad') {
    throw new functions.https.HttpsError('failed-precondition', 'AD invitations are accepted through the AD handoff flow.');
  }

  const schoolId = invData.schoolId;
  const role = invData.role;
  const teamId = invData.teamId;

  // Update user's school and role
  await db.collection('users').doc(callerId).set({
    schoolId: schoolId,
    role: role
  }, { merge: true });

  // Link the accepted person to the athlete the invitation named, so a parent can
  // see their own child without a second approval round. A player additionally
  // claims the roster slot, because that entry is them.
  if (invData.rosterEntryId) {
    await db.collection('users').doc(callerId).set({
      linkedPlayerIds: admin.firestore.FieldValue.arrayUnion(invData.rosterEntryId),
    }, { merge: true });

    const entryRef = teamId
      ? db.collection('teams').doc(teamId).collection('roster').doc(invData.rosterEntryId)
      : null;

    if (entryRef) {
      if (role === 'player') {
        // The invitee is the athlete: they claim the slot itself.
        await entryRef.set({ userId: callerId }, { merge: true });
      } else {
        // A guardian is named on the entry. firestore.rules grants a follower
        // read access only to entries listing them here, which is what lets a
        // parent see their own child without exposing every family's details.
        await entryRef.set({
          guardianUserIds: admin.firestore.FieldValue.arrayUnion(callerId),
        }, { merge: true });
      }
    }
  }

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
// ---------------------------------------------------------------------------
// AD succession.
//
// AD standing is ownership of a school (`schools/{id}.adUserId`), so a handoff
// transfers that field — it is not a role edit. Deliberately two steps: the
// sitting AD invites, the successor accepts. One-step transfer would let a
// mistyped address hand a school to a stranger with no way back.
// ---------------------------------------------------------------------------

exports.inviteAdSuccessor = functions.https.onCall(async (data, context) => {
  if (!context.auth) {
    throw new functions.https.HttpsError('unauthenticated', 'You must be signed in.');
  }
  const callerId = context.auth.uid;
  const email = String((data && data.email) || '').trim().toLowerCase();
  if (!email.includes('@')) {
    throw new functions.https.HttpsError('invalid-argument', 'A valid email is required.');
  }

  const db = admin.firestore();
  const callerSnap = await db.collection('users').doc(callerId).get();
  const schoolId = callerSnap.exists ? callerSnap.get('schoolId') : null;
  if (!schoolId) {
    throw new functions.https.HttpsError('failed-precondition', 'You are not attached to a school.');
  }

  const schoolRef = db.collection('schools').doc(schoolId);
  const schoolSnap = await schoolRef.get();
  if (!schoolSnap.exists) {
    throw new functions.https.HttpsError('not-found', 'School not found.');
  }
  if (schoolSnap.get('adUserId') !== callerId) {
    throw new functions.https.HttpsError('permission-denied', 'Only the current AD can hand off the role.');
  }
  if ((context.auth.token.email || '').toLowerCase() === email) {
    throw new functions.https.HttpsError('invalid-argument', 'That is your own address.');
  }

  // Only one successor may be outstanding. Without this, two invites could both
  // be accepted and the second acceptance would silently overwrite the first.
  const previous = await db.collection('invitations')
    .where('schoolId', '==', schoolId)
    .where('adTransfer', '==', true)
    .where('status', '==', 'pending')
    .get();
  await Promise.all(previous.docs.map((doc) => doc.ref.set({ status: 'superseded' }, { merge: true })));

  const code = Math.random().toString(36).slice(2, 8).toUpperCase();
  const ref = await db.collection('invitations').add({
    email,
    role: 'ad',
    adTransfer: true,
    schoolId,
    schoolName: schoolSnap.get('name') || '',
    sportNames: [],
    teamId: null,
    teamName: null,
    status: 'pending',
    code,
    invitedBy: callerId,
    invitedByName: callerSnap.get('displayName') || '',
    createdAt: admin.firestore.FieldValue.serverTimestamp(),
  });

  await db.collection('auditLogs').add({
    schoolId,
    action: 'ad_invite_sent',
    actorId: callerId,
    actorName: callerSnap.get('displayName') || '',
    targetEmail: email,
    createdAt: admin.firestore.FieldValue.serverTimestamp(),
  });

  console.log(`[ad] ${callerId} invited ${email} to take over ${schoolId}`);
  return { ok: true, invitationId: ref.id, code };
});

exports.acceptAdTransfer = functions.https.onCall(async (data, context) => {
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
  const invRef = db.collection('invitations').doc(invitationId);

  const outcome = await db.runTransaction(async (tx) => {
    const invSnap = await tx.get(invRef);
    if (!invSnap.exists) {
      throw new functions.https.HttpsError('not-found', 'Invitation not found.');
    }
    const inv = invSnap.data();
    if (inv.role !== 'ad' || !inv.adTransfer) {
      throw new functions.https.HttpsError('failed-precondition', 'Not an AD handoff invitation.');
    }
    if (inv.status !== 'pending') {
      throw new functions.https.HttpsError('failed-precondition', 'This invitation is no longer open.');
    }
    if ((inv.email || '').toLowerCase() !== callerEmail) {
      throw new functions.https.HttpsError('permission-denied', 'This invitation is for a different account.');
    }

    const schoolRef = db.collection('schools').doc(inv.schoolId);
    const schoolSnap = await tx.get(schoolRef);
    if (!schoolSnap.exists) {
      throw new functions.https.HttpsError('not-found', 'School not found.');
    }
    // If the role already moved, this invite is stale. Accepting it would let an
    // old invitation take a school from whoever holds it now.
    const sittingAd = schoolSnap.get('adUserId');
    if (sittingAd !== inv.invitedBy) {
      throw new functions.https.HttpsError('failed-precondition', 'The AD role has already changed hands.');
    }

    tx.set(schoolRef, {
      adUserId: callerId,
      adTransferredAt: admin.firestore.FieldValue.serverTimestamp(),
      adTransferredFrom: sittingAd,
    }, { merge: true });

    tx.set(db.collection('users').doc(callerId), {
      role: 'ad',
      schoolId: inv.schoolId,
    }, { merge: true });

    // The outgoing AD is demoted but keeps the school and every team membership,
    // so someone who stepped down from AD but still coaches keeps coaching. Only
    // the organisation-wide powers go.
    tx.set(db.collection('users').doc(sittingAd), { role: 'follower' }, { merge: true });

    tx.set(invRef, {
      status: 'accepted',
      acceptedBy: callerId,
      acceptedAt: admin.firestore.FieldValue.serverTimestamp(),
    }, { merge: true });

    return { schoolId: inv.schoolId, previousAdId: sittingAd };
  });

  // The users trigger also syncs claims, but doing it here means the successor
  // is effective on their very next rule evaluation rather than one hop later.
  await Promise.all([
    admin.auth().setCustomUserClaims(callerId, { role: 'ad' }),
    admin.auth().setCustomUserClaims(outcome.previousAdId, { role: 'follower' }),
  ]);

  await db.collection('auditLogs').add({
    schoolId: outcome.schoolId,
    action: 'ad_transferred',
    actorId: callerId,
    actorEmail: callerEmail,
    previousAdId: outcome.previousAdId,
    createdAt: admin.firestore.FieldValue.serverTimestamp(),
  });

  console.log(`[ad] ${callerId} took over ${outcome.schoolId} from ${outcome.previousAdId}`);
  return { ok: true, schoolId: outcome.schoolId, previousAd: outcome.previousAdId };
});

/// Bulk roster import: a coach or AD pastes a list of names and gets players.
///
/// Creates a durable `players` record AND a roster entry for each name, because a
/// roster entry without a playerId would bypass the identity model and reintroduce the
/// per-season key that splits a child's history.
///
/// Reuses an existing player at the same school with the same normalised name rather
/// than creating a second "Mikey Smith". The lookup is a single equality filter on
/// schoolId, because schoolId + name would need a composite index -- the missing-index
/// trap that has already cost two deploys in this project.
exports.importPlayers = functions.https.onCall(async (data, context) => {
  if (!context.auth) throw new functions.https.HttpsError('unauthenticated', 'You must be signed in.');
  const callerId = context.auth.uid;
  const db = admin.firestore();

  const teamId = String((data && data.teamId) || '');
  const rawNames = Array.isArray(data && data.names) ? data.names : [];
  if (!teamId) throw new functions.https.HttpsError('invalid-argument', 'teamId is required.');
  if (!rawNames.length) throw new functions.https.HttpsError('invalid-argument', 'Paste at least one name.');
  if (rawNames.length > 200) throw new functions.https.HttpsError('invalid-argument', 'Import 200 names at a time or fewer.');

  const names = rawNames
    .map((n) => String(n || '').trim().replace(/\s+/g, ' '))
    .filter((n) => n.length >= 2)
    .slice(0, 200);
  if (!names.length) throw new functions.https.HttpsError('invalid-argument', 'No usable names found.');

  const teamRef = db.collection('teams').doc(teamId);
  const teamSnap = await teamRef.get();
  if (!teamSnap.exists) throw new functions.https.HttpsError('not-found', 'Team not found.');
  const schoolId = teamSnap.get('schoolId') || '';

  // Authorised: the team's coach, or the AD who owns the school.
  const memSnap = await teamRef.collection('members').doc(callerId).get();
  const isCoach = memSnap.exists && memSnap.get('role') === 'coach';
  let isAd = false;
  if (!isCoach && schoolId) {
    const [userSnap, schoolSnap] = await Promise.all([
      db.collection('users').doc(callerId).get(),
      db.collection('schools').doc(schoolId).get(),
    ]);
    isAd = userSnap.exists && userSnap.get('role') === 'ad'
      && schoolSnap.exists && schoolSnap.get('adUserId') === callerId;
  }
  if (!isCoach && !isAd) {
    throw new functions.https.HttpsError('permission-denied', 'Only this team\u2019s coach or the AD can import players.');
  }

  const normal = (s) => String(s || '').toLowerCase().replace(/[^a-z0-9 ]/g, '').trim();

  // Existing players at this school, and whoever is already on this roster.
  const [schoolPlayers, rosterSnap] = await Promise.all([
    schoolId ? db.collection('players').where('schoolId', '==', schoolId).get() : Promise.resolve(null),
    teamRef.collection('roster').get(),
  ]);
  const byName = new Map();
  (schoolPlayers ? schoolPlayers.docs : []).forEach((d) => {
    byName.set(normal(d.get('name')), d.id);
  });
  const onRoster = new Set(rosterSnap.docs.map((d) => normal(d.get('playerName'))));

  const created = [];
  const skipped = [];
  const batch = db.batch();

  for (const name of names) {
    const key = normal(name);
    if (!key) continue;
    if (onRoster.has(key)) { skipped.push(name); continue; }

    let playerId = byName.get(key);
    if (!playerId) {
      const playerRef = db.collection('players').doc();
      batch.set(playerRef, {
        name,
        schoolId,
        gender: '',
        gradYear: null,
        photoUrl: '',
        createdBy: callerId,
        createdByRole: isAd ? 'ad' : 'coach',
        claimedByUserId: null,
        claimedAt: null,
        status: 'active',
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
      });
      playerId = playerRef.id;
      byName.set(key, playerId);
    }

    const entryRef = teamRef.collection('roster').doc();
    batch.set(entryRef, {
      teamId,
      playerId,
      playerName: name,
      jerseyNumber: '',
      position: '',
      userId: null,
      guardianUserIds: [],
      importedBy: callerId,
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
    });
    onRoster.add(key);
    created.push(name);
  }

  await batch.commit();
  return { ok: true, created: created.length, skipped: skipped.length, createdNames: created, skippedNames: skipped };
});

/// entry. A code is a shared secret in a group chat, so a forwarded or leaked code
/// must produce a queue item a coach can reject, never a member.
///
/// Rate limited per account because the code is short and guessable: without a cap
/// this endpoint is a free oracle for enumerating every team in the database.
const JOIN_WINDOW_MS = 60 * 60 * 1000;
const JOIN_MAX_PER_WINDOW = 5;

exports.requestTeamJoin = functions.https.onCall(async (data, context) => {
  if (!context.auth) {
    throw new functions.https.HttpsError('unauthenticated', 'Sign in first.');
  }
  const callerId = context.auth.uid;
  const db = admin.firestore();

  const code = String((data && data.code) || '').trim().toUpperCase();
  const role = String((data && data.role) || '');
  const athleteName = String((data && data.athleteName) || '').trim().slice(0, 80);

  if (!/^[A-Z0-9]{4,10}$/.test(code)) {
    throw new functions.https.HttpsError('invalid-argument', 'That does not look like a team code.');
  }
  if (!['parent', 'player'].includes(role)) {
    throw new functions.https.HttpsError('invalid-argument', 'Choose parent or player.');
  }
  // A parent must name their athlete; a player is naming themselves either way.
  if (athleteName.length < 2) {
    throw new functions.https.HttpsError('invalid-argument', 'Enter the athlete name.');
  }

  const teamSnap = await db.collection('teams').where('joinCode', '==', code).limit(1).get();
  if (teamSnap.empty) {
    // Deliberately identical to a wrong team: do not confirm which codes exist.
    throw new functions.https.HttpsError('not-found', 'That code does not match a team.');
  }
  const teamDoc = teamSnap.docs[0];
  const teamId = teamDoc.id;

  const already = await db.collection('teams').doc(teamId).collection('members').doc(callerId).get();
  if (already.exists) {
    throw new functions.https.HttpsError('failed-precondition', 'You are already on this team.');
  }

  const pending = await db.collection('teams').doc(teamId).collection('joinRequests')
    .where('requesterUserId', '==', callerId)
    .where('status', '==', 'pending').limit(1).get();
  if (!pending.empty) {
    return { ok: true, alreadyPending: true, requestId: pending.docs[0].id };
  }

  // Attempt cap across ALL teams, so someone cannot walk codes by spraying requests.
  //
  // A single counter document per account, NOT a query. The first version queried
  // `userId ==` plus `at >=`, which needs a composite index that did not exist and
  // threw INTERNAL on every legitimate call — the same missing-index trap that broke
  // the announcements query. One document needs no index and cannot fail that way.
  const attemptRef = db.collection('joinAttempts').doc(callerId);
  const attemptSnap = await attemptRef.get();
  const nowMs = Date.now();
  const prevStart = attemptSnap.exists ? (attemptSnap.get('windowStartMs') || 0) : 0;
  const prevCount = attemptSnap.exists ? (attemptSnap.get('count') || 0) : 0;
  const inWindow = nowMs - prevStart < JOIN_WINDOW_MS;
  const usedInWindow = inWindow ? prevCount : 0;

  if (usedInWindow >= JOIN_MAX_PER_WINDOW) {
    throw new functions.https.HttpsError(
      'resource-exhausted',
      'Too many join attempts. Ask your coach for the code and try again later.',
    );
  }
  await attemptRef.set({
    userId: callerId,
    count: usedInWindow + 1,
    windowStartMs: inWindow ? prevStart : nowMs,
    lastCode: code,
    lastAttemptMs: nowMs,
  }, { merge: true });

  const userSnap = await db.collection('users').doc(callerId).get();
  const requesterName = userSnap.exists ? (userSnap.get('name') || userSnap.get('displayName') || '') : '';
  const requesterEmail = userSnap.exists ? (userSnap.get('email') || context.auth.token.email || '') : (context.auth.token.email || '');

  const ref = await db.collection('teams').doc(teamId).collection('joinRequests').add({
    teamId,
    schoolId: teamDoc.get('schoolId') || '',
    code,
    role,
    athleteName,
    requesterUserId: callerId,
    requesterName,
    requesterEmail,
    status: 'pending',
    createdAt: admin.firestore.FieldValue.serverTimestamp(),
    reviewedBy: '',
    reviewedAt: null,
  });

  return { ok: true, requestId: ref.id, teamId, teamName: teamDoc.get('sportName') || '' };
});

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

  // Never demote an existing coach/staff/AD who links to their own child.
  // Approving a link should only ever upgrade a plain follower or player.
  const requesterSnap = await db.collection('users').doc(req.parentUserId).get();
  const requesterRole = requesterSnap.exists ? requesterSnap.get('role') : null;
  const grantedRole = ['ad', 'coach', 'staff'].includes(requesterRole) ? requesterRole : 'parent';

  const userUpdate = { role: grantedRole };
  if (req.playerUserId) {
    userUpdate.linkedPlayerIds = admin.firestore.FieldValue.arrayUnion(req.playerUserId);
  }
  await db.collection('users').doc(req.parentUserId).set(userUpdate, { merge: true });
  await admin.auth().setCustomUserClaims(req.parentUserId, { role: grantedRole });

  await db.collection('teams').doc(teamId).collection('members').doc(req.parentUserId).set({ role: grantedRole }, { merge: true });

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

// ---------------------------------------------------------------------------
// Season rollover — start next season's team from this one.
//
// Otherwise a school re-creates every team and re-adds every athlete by hand
// each year, then re-sends invitations. This copies the durable parts (athletes,
// guardian contacts, coach/staff memberships) and deliberately does NOT copy the
// parts that must be renewed for compliance: forms, signatures and injury state.
// A rolled-over athlete therefore starts the season un-cleared — the correct and
// safe default.
// ---------------------------------------------------------------------------
exports.rolloverTeam = functions.https.onCall(async (data, context) => {
  if (!context.auth) {
    throw new functions.https.HttpsError('unauthenticated', 'You must be signed in.');
  }
  const teamId = data && data.teamId ? String(data.teamId) : '';
  const newSeason = data && data.newSeason ? String(data.newSeason).trim() : '';
  if (!teamId || !newSeason) {
    throw new functions.https.HttpsError('invalid-argument', 'teamId and newSeason are required.');
  }

  const db = admin.firestore();
  const callerId = context.auth.uid;
  const teamRef = db.collection('teams').doc(teamId);
  const teamSnap = await teamRef.get();
  if (!teamSnap.exists) {
    throw new functions.https.HttpsError('not-found', 'Team not found.');
  }

  const caller = await userProfile(db, callerId);
  const memSnap = await teamRef.collection('members').doc(callerId).get();
  const teamRole = memSnap.exists ? memSnap.get('role') : null;
  const schoolId = teamSnap.get('schoolId') || '';
  const isSchoolAd = caller.role === 'ad' && caller.schoolId === schoolId;
  const isHeadCoach = teamSnap.get('headCoachId') === callerId;
  if (!isSchoolAd && !isHeadCoach && teamRole !== 'coach') {
    throw new functions.https.HttpsError('permission-denied',
      "Only an AD or this team's coach can start the next season.");
  }

  const sportId = teamSnap.get('sportId') || '';
  const level = teamSnap.get('level') || 'Varsity';
  const gender = teamSnap.get('gender') || '';

  // Idempotent: if that season already exists, hand it back rather than
  // creating a duplicate team. Queried by schoolId only (no composite index).
  const schoolTeams = await db.collection('teams').where('schoolId', '==', schoolId).get();
  const duplicate = schoolTeams.docs.find((d) =>
    d.get('sportId') === sportId && d.get('level') === level && d.get('season') === newSeason);
  if (duplicate) {
    return {
      teamId: duplicate.id,
      joinCode: duplicate.get('joinCode') || '',
      existed: true,
      rosterCount: 0,
      memberCount: 0,
      season: newSeason,
    };
  }

  const joinCode = randomJoinCode();
  const newTeamRef = db.collection('teams').doc();
  await newTeamRef.set({
    schoolId: schoolId,
    sportId: sportId,
    sportName: teamSnap.get('sportName') || '',
    level: level,
    season: newSeason,
    gender: gender,
    headCoachId: teamSnap.get('headCoachId') || callerId,
    joinCode: joinCode,
    schoolNameHint: teamSnap.get('schoolNameHint') || '',
    adoptionStatus: teamSnap.get('adoptionStatus') || 'adopted',
    rolledOverFrom: teamId,
    createdAt: admin.firestore.FieldValue.serverTimestamp(),
  });

  // Coaches and staff carry over; players and parents re-derive from the roster.
  const membersSnap = await teamRef.collection('members').get();
  let memberCount = 0;
  for (const m of membersSnap.docs) {
    const role = m.get('role');
    if (role !== 'coach' && role !== 'staff') continue;
    await newTeamRef.collection('members').doc(m.id).set({
      teamId: newTeamRef.id,
      userId: m.get('userId') || m.id,
      role: role,
      name: m.get('name') || '',
      email: m.get('email') || '',
      permissions: m.get('permissions') || [],
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
    }, { merge: true });
    memberCount++;
  }

  // Identity and guardian contact carry over; injury state and forms do not.
  const rosterSnap = await teamRef.collection('roster').get();
  let rosterCount = 0;
  for (const r of rosterSnap.docs) {
    const payload = {
      teamId: newTeamRef.id,
      playerName: r.get('playerName') || '',
      jerseyNumber: r.get('jerseyNumber') || '',
      position: r.get('position') || '',
      parentEmail: r.get('parentEmail') || '',
      parentName: r.get('parentName') || '',
      parentPhone: r.get('parentPhone') || '',
      injuryStatus: 'healthy',
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
    };
    const linkedUser = r.get('userId');
    if (linkedUser) payload.userId = linkedUser;
    await newTeamRef.collection('roster').doc().set(payload);
    rosterCount++;
  }

  await writeAudit({
    schoolId: schoolId,
    actorId: callerId,
    actorName: caller.name,
    actorRole: caller.role || '',
    action: 'team.rolled_over',
    targetType: 'team',
    targetId: newTeamRef.id,
    detail: `${teamSnap.get('sportName') || sportId} ${level} -> ${newSeason} (${rosterCount} athletes, ${memberCount} staff)`,
  });

  return { teamId: newTeamRef.id, joinCode, existed: false, rosterCount, memberCount, season: newSeason };
});

// ---------------------------------------------------------------------------
// Promote / move a player to another team.
//
// The common case is end of season: a Jr High athlete moves up to JV. Rather
// than retyping the athlete, this copies their identity and guardian contact to
// the target roster, keeps the linked player account, and carries the player
// membership across. Injury state is reset — a promotion is a fresh start, and
// a stale "injured" flag silently following a player between teams is how bad
// data spreads.
//
// The source entry is NOT deleted: it is marked as promoted so the old roster
// remains an accurate historical record for that season.
// ---------------------------------------------------------------------------
exports.promotePlayer = functions.https.onCall(async (data, context) => {
  if (!context.auth) {
    throw new functions.https.HttpsError('unauthenticated', 'You must be signed in.');
  }
  const entryId = data && data.entryId ? String(data.entryId) : '';
  const fromTeamId = data && data.fromTeamId ? String(data.fromTeamId) : '';
  const toTeamId = data && data.toTeamId ? String(data.toTeamId) : '';
  if (!entryId || !fromTeamId || !toTeamId) {
    throw new functions.https.HttpsError('invalid-argument', 'entryId, fromTeamId and toTeamId are required.');
  }
  if (fromTeamId === toTeamId) {
    throw new functions.https.HttpsError('invalid-argument', 'Source and target teams are the same.');
  }

  const db = admin.firestore();
  const callerId = context.auth.uid;
  const fromRef = db.collection('teams').doc(fromTeamId);
  const toRef = db.collection('teams').doc(toTeamId);
  const [fromSnap, toSnap, entrySnap] = await Promise.all([
    fromRef.get(), toRef.get(), fromRef.collection('roster').doc(entryId).get(),
  ]);
  if (!fromSnap.exists || !toSnap.exists) {
    throw new functions.https.HttpsError('not-found', 'Team not found.');
  }
  if (!entrySnap.exists) {
    throw new functions.https.HttpsError('not-found', 'Player not found on the source roster.');
  }
  if (fromSnap.get('schoolId') !== toSnap.get('schoolId')) {
    throw new functions.https.HttpsError('failed-precondition',
      'Players can only be moved between teams in the same school.');
  }

  const schoolId = fromSnap.get('schoolId') || '';
  const caller = await userProfile(db, callerId);
  const fromMem = await fromRef.collection('members').doc(callerId).get();
  const fromRole = fromMem.exists ? fromMem.get('role') : null;
  const isSchoolAd = caller.role === 'ad' && caller.schoolId === schoolId;
  const isSourceCoach = fromRole === 'coach' || fromSnap.get('headCoachId') === callerId;
  if (!isSchoolAd && !isSourceCoach) {
    throw new functions.https.HttpsError('permission-denied',
      "Only an AD or this team's coach can move a player.");
  }

  const entry = entrySnap.data() || {};
  const playerUserId = entry.userId || null;

  // Idempotent: if that athlete is already on the target roster, return it.
  const targetRoster = await toRef.collection('roster').get();
  const already = targetRoster.docs.find((d) => {
    if (playerUserId && d.get('userId') === playerUserId) return true;
    return !playerUserId
      && (d.get('playerName') || '').trim().toLowerCase() === (entry.playerName || '').trim().toLowerCase();
  });
  if (already) {
    return { entryId: already.id, teamId: toTeamId, existed: true, playerUserId: playerUserId };
  }

  const targetEntry = toRef.collection('roster').doc();
  const payload = {
    teamId: toTeamId,
    playerName: entry.playerName || '',
    jerseyNumber: entry.jerseyNumber || '',
    position: entry.position || '',
    parentEmail: entry.parentEmail || '',
    parentName: entry.parentName || '',
    parentPhone: entry.parentPhone || '',
    injuryStatus: 'healthy',
    movedFromTeamId: fromTeamId,
    promotedAt: admin.firestore.FieldValue.serverTimestamp(),
    createdAt: admin.firestore.FieldValue.serverTimestamp(),
  };
  if (playerUserId) payload.userId = playerUserId;
  await targetEntry.set(payload);

  // Mark the source entry rather than deleting it: the old season stays accurate.
  await entrySnap.ref.set({
    promotionStatus: 'promoted',
    promotedToTeamId: toTeamId,
    promotedAt: admin.firestore.FieldValue.serverTimestamp(),
  }, { merge: true });

  // Carry the athlete's account across so they keep access to the new team.
  if (playerUserId) {
    const playerProfile = await userProfile(db, playerUserId);
    await toRef.collection('members').doc(playerUserId).set({
      teamId: toTeamId,
      userId: playerUserId,
      role: 'player',
      name: playerProfile.name || entry.playerName || '',
      email: playerProfile.email || '',
      permissions: [],
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
    }, { merge: true });
    await db.collection('users').doc(playerUserId).set({
      teamIds: admin.firestore.FieldValue.arrayUnion([toTeamId]),
      role: playerProfile.role === 'follower' || !playerProfile.role ? 'player' : playerProfile.role,
    }, { merge: true });
  }

  await writeAudit({
    schoolId: schoolId,
    actorId: callerId,
    actorName: caller.name,
    actorRole: caller.role || '',
    action: 'player.promoted',
    targetType: 'roster',
    targetId: targetEntry.id,
    detail: `${entry.playerName || entryId}: ${fromSnap.get('sportName') || fromTeamId} ${fromSnap.get('level') || ''} -> ${toSnap.get('sportName') || toTeamId} ${toSnap.get('level') || ''}`,
  });

  return { entryId: targetEntry.id, teamId: toTeamId, existed: false, playerUserId: playerUserId };
});

// ---------------------------------------------------------------------------
// Statistician requests.
//
// Not every team has a coach who can run the scorer, or a staff statistician.
// A coach opens a request for one game; a parent or student on the team claims
// it; claiming grants scoring rights for THAT GAME ONLY via
// games/{gameId}/scorers/{uid}. Nobody inherits season-long staff access by
// volunteering once.
// ---------------------------------------------------------------------------
exports.requestGameStatistician = functions.https.onCall(async (data, context) => {
  if (!context.auth) {
    throw new functions.https.HttpsError('unauthenticated', 'You must be signed in.');
  }
  const gameId = data && data.gameId ? String(data.gameId) : '';
  const mode = (data && data.mode === 'advanced') ? 'advanced' : 'simple';
  if (!gameId) {
    throw new functions.https.HttpsError('invalid-argument', 'gameId is required.');
  }

  const db = admin.firestore();
  const gameSnap = await db.collection('games').doc(gameId).get();
  if (!gameSnap.exists) {
    throw new functions.https.HttpsError('not-found', 'Game not found.');
  }

  const teamId = gameSnap.get('teamId') || '';
  const callerId = context.auth.uid;
  const caller = await userProfile(db, callerId);
  const memSnap = await db.collection('teams').doc(teamId).collection('members').doc(callerId).get();
  const teamRole = memSnap.exists ? memSnap.get('role') : null;
  if (!(caller.role === 'ad' || teamRole === 'coach')) {
    throw new functions.https.HttpsError('permission-denied',
      "Only an AD or this team's coach can ask for a statistician.");
  }

  // Idempotent: reuse an existing open request. Filtered in JS so no composite
  // index (gameId + status) is required.
  const existing = await db.collection('gameStatisticianRequests')
    .where('gameId', '==', gameId).limit(10).get();
  const open = existing.docs.find((d) => d.get('status') === 'open');
  if (open) return { requestId: open.id, existed: true };

  const ref = await db.collection('gameStatisticianRequests').add({
    teamId: teamId,
    gameId: gameId,
    opponent: gameSnap.get('opponent') || '',
    isHome: gameSnap.get('isHome') === true,
    date: gameSnap.get('date') || null,
    status: 'open',
    mode: mode,
    requestedBy: callerId,
    requestedByName: caller.name || '',
    requestedAt: admin.firestore.FieldValue.serverTimestamp(),
  });

  await writeAudit({
    schoolId: caller.schoolId || '',
    actorId: callerId,
    actorName: caller.name,
    actorRole: caller.role || '',
    action: 'scorer.requested',
    targetType: 'game',
    targetId: gameId,
    detail: `vs ${gameSnap.get('opponent') || ''}`,
  });

  return { requestId: ref.id, existed: false };
});

// Multiple people may offer to score. The coach picks exactly one; picking
// someone replaces any previous choice and revokes every other grant for the
// game, so two people can never hold scoring rights at once.
exports.signUpForGame = functions.https.onCall(async (data, context) => {
  if (!context.auth) {
    throw new functions.https.HttpsError('unauthenticated', 'You must be signed in.');
  }
  const requestId = data && data.requestId ? String(data.requestId) : '';
  if (!requestId) {
    throw new functions.https.HttpsError('invalid-argument', 'requestId is required.');
  }

  const db = admin.firestore();
  const ref = db.collection('gameStatisticianRequests').doc(requestId);
  const reqSnap = await ref.get();
  if (!reqSnap.exists) {
    throw new functions.https.HttpsError('not-found', 'Request not found.');
  }
  const req = reqSnap.data() || {};
  if (req.status !== 'open') {
    throw new functions.https.HttpsError('failed-precondition', 'The coach has already picked a scorer.');
  }

  const callerId = context.auth.uid;
  const caller = await userProfile(db, callerId);
  const memSnap = await db.collection('teams').doc(req.teamId).collection('members').doc(callerId).get();
  if (!memSnap.exists && caller.role !== 'ad') {
    throw new functions.https.HttpsError('permission-denied',
      'Follow or join the team before signing up.');
  }

  const signups = Array.isArray(req.signups) ? req.signups : [];
  if (signups.some((s) => s && s.userId === callerId)) {
    return { ok: true, alreadySignedUp: true, count: signups.length };
  }

  await ref.set({
    signups: admin.firestore.FieldValue.arrayUnion({
      userId: callerId,
      name: caller.name || '',
      at: new Date().toISOString(),
    }),
  }, { merge: true });

  await writeAudit({
    schoolId: caller.schoolId || '',
    actorId: callerId,
    actorName: caller.name,
    actorRole: caller.role || '',
    action: 'scorer.signed_up',
    targetType: 'game',
    targetId: req.gameId || '',
    detail: `vs ${req.opponent || ''}`,
  });

  return { ok: true, alreadySignedUp: false, count: signups.length + 1 };
});

exports.assignGameStatistician = functions.https.onCall(async (data, context) => {
  if (!context.auth) {
    throw new functions.https.HttpsError('unauthenticated', 'You must be signed in.');
  }
  const requestId = data && data.requestId ? String(data.requestId) : '';
  const userId = data && data.userId ? String(data.userId) : '';
  if (!requestId || !userId) {
    throw new functions.https.HttpsError('invalid-argument', 'requestId and userId are required.');
  }

  const db = admin.firestore();
  const ref = db.collection('gameStatisticianRequests').doc(requestId);
  const reqSnap = await ref.get();
  if (!reqSnap.exists) {
    throw new functions.https.HttpsError('not-found', 'Request not found.');
  }
  const req = reqSnap.data() || {};

  const caller = await userProfile(db, context.auth.uid);
  const memSnap = await db.collection('teams').doc(req.teamId).collection('members').doc(context.auth.uid).get();
  const isCoach = memSnap.exists && memSnap.get('role') === 'coach';
  if (!(caller.role === 'ad' || isCoach)) {
    throw new functions.https.HttpsError('permission-denied', 'Only an AD or coach can pick the scorer.');
  }

  // Exclusive assignment: clear every grant for this game, then create exactly one.
  const gameRef = db.collection('games').doc(req.gameId);
  const existingGrants = await gameRef.collection('scorers').get();
  await Promise.all(existingGrants.docs.map((d) => d.ref.delete()));

  const chosen = await userProfile(db, userId);
  await gameRef.collection('scorers').doc(userId).set({
    userId: userId,
    name: chosen.name || '',
    email: chosen.email || '',
    requestId: requestId,
    mode: req.mode === 'advanced' ? 'advanced' : 'simple',
    grantedAt: admin.firestore.FieldValue.serverTimestamp(),
  }, { merge: true });

  await ref.set({
    status: 'filled',
    filledBy: userId,
    filledByName: chosen.name || '',
    filledAt: admin.firestore.FieldValue.serverTimestamp(),
  }, { merge: true });

  await writeAudit({
    schoolId: caller.schoolId || '',
    actorId: context.auth.uid,
    actorName: caller.name,
    actorRole: caller.role || '',
    action: 'scorer.assigned',
    targetType: 'game',
    targetId: req.gameId || '',
    detail: `${chosen.name || userId} · vs ${req.opponent || ''} (revoked ${existingGrants.size} other grant(s))`,
  });

  return { ok: true, userId: userId };
});

exports.releaseGameStatistician = functions.https.onCall(async (data, context) => {
  if (!context.auth) {
    throw new functions.https.HttpsError('unauthenticated', 'You must be signed in.');
  }
  const requestId = data && data.requestId ? String(data.requestId) : '';
  if (!requestId) {
    throw new functions.https.HttpsError('invalid-argument', 'requestId is required.');
  }

  const db = admin.firestore();
  const ref = db.collection('gameStatisticianRequests').doc(requestId);
  const reqSnap = await ref.get();
  if (!reqSnap.exists) {
    throw new functions.https.HttpsError('not-found', 'Request not found.');
  }
  const req = reqSnap.data() || {};
  const callerId = context.auth.uid;
  const caller = await userProfile(db, callerId);
  const memSnap = await db.collection('teams').doc(req.teamId).collection('members').doc(callerId).get();
  const isCoach = memSnap.exists && memSnap.get('role') === 'coach';
  const isOwner = req.filledBy === callerId;
  if (!isOwner && caller.role !== 'ad' && !isCoach) {
    throw new functions.https.HttpsError('permission-denied', 'You cannot release this game.');
  }

  // A coach cancelling closes the request; a volunteer releasing reopens it so
  // someone else can take the game.
  const cancel = !!(data && data.cancel) && (caller.role === 'ad' || isCoach);

  if (req.filledBy) {
    await db.collection('games').doc(req.gameId).collection('scorers').doc(req.filledBy).delete();
  }

  await ref.set({
    status: cancel ? 'cancelled' : 'open',
    filledBy: admin.firestore.FieldValue.delete(),
    filledByName: admin.firestore.FieldValue.delete(),
    filledAt: admin.firestore.FieldValue.delete(),
  }, { merge: true });

  await writeAudit({
    schoolId: caller.schoolId || '',
    actorId: callerId,
    actorName: caller.name,
    actorRole: caller.role || '',
    action: cancel ? 'scorer.cancelled' : 'scorer.released',
    targetType: 'game',
    targetId: req.gameId || '',
    detail: `vs ${req.opponent || ''}`,
  });

  return { ok: true, status: cancel ? 'cancelled' : 'open' };
});

// ---------------------------------------------------------------------------
// Scoring mode. A coach decides whether a volunteer gets simple scoring (score
// and clock only) or advanced scoring (per-player stats). Most parents and
// students cannot reliably attribute stats live, so simple is the safe default.
// ---------------------------------------------------------------------------
const SCORING_MODES = ['simple', 'advanced'];

exports.setScoringMode = functions.https.onCall(async (data, context) => {
  if (!context.auth) {
    throw new functions.https.HttpsError('unauthenticated', 'You must be signed in.');
  }
  const requestId = data && data.requestId ? String(data.requestId) : '';
  const mode = data && data.mode ? String(data.mode) : '';
  if (!requestId || !SCORING_MODES.includes(mode)) {
    throw new functions.https.HttpsError('invalid-argument', 'requestId and a valid mode are required.');
  }

  const db = admin.firestore();
  const ref = db.collection('gameStatisticianRequests').doc(requestId);
  const snap = await ref.get();
  if (!snap.exists) {
    throw new functions.https.HttpsError('not-found', 'Request not found.');
  }
  const req = snap.data() || {};
  const caller = await userProfile(db, context.auth.uid);
  const memSnap = await db.collection('teams').doc(req.teamId).collection('members').doc(context.auth.uid).get();
  const isCoach = memSnap.exists && memSnap.get('role') === 'coach';
  if (!(caller.role === 'ad' || isCoach)) {
    throw new functions.https.HttpsError('permission-denied', 'Only an AD or coach can set the scoring mode.');
  }

  await ref.set({ mode: mode }, { merge: true });

  // If the game is already claimed, retune the grant too.
  if (req.filledBy) {
    await db.collection('games').doc(req.gameId).collection('scorers').doc(req.filledBy)
      .set({ mode: mode }, { merge: true });
  }

  await writeAudit({
    schoolId: caller.schoolId || '',
    actorId: context.auth.uid,
    actorName: caller.name,
    actorRole: caller.role || '',
    action: 'scorer.mode_set',
    targetType: 'game',
    targetId: req.gameId || '',
    detail: `${mode} · vs ${req.opponent || ''}`,
  });

  return { ok: true, mode: mode };
});

// ---------------------------------------------------------------------------
// Stats verification.
//
// This is the gate that makes stats real. Raw live numbers are never trusted: a
// staff member compares them against the paper book and confirms. Only at
// confirmation do we write `careerStatLines` — the append-only ledger that
// career totals, school records and a future MaxPreps export all read from.
// Re-verifying rebuilds the ledger for that game, so corrections are safe.
// ---------------------------------------------------------------------------
const STAT_META_KEYS = ['gameId', 'rosterEntryId', 'playerName'];

function athleteKeyFor(rosterEntryId, rosterInfo) {
  const userId = rosterInfo && rosterInfo.userId;
  // Prefer the account: it survives promotion between teams and across seasons.
  if (userId) return `user:${userId}`;
  return `roster:${(rosterInfo && rosterInfo.teamId) || ''}:${rosterEntryId}`;
}

exports.verifyGameStats = functions.https.onCall(async (data, context) => {
  if (!context.auth) {
    throw new functions.https.HttpsError('unauthenticated', 'You must be signed in.');
  }
  const gameId = data && data.gameId ? String(data.gameId) : '';
  if (!gameId) {
    throw new functions.https.HttpsError('invalid-argument', 'gameId is required.');
  }

  const db = admin.firestore();
  const callerId = context.auth.uid;
  const gameSnap = await db.collection('games').doc(gameId).get();
  if (!gameSnap.exists) {
    throw new functions.https.HttpsError('not-found', 'Game not found.');
  }
  const teamId = gameSnap.get('teamId') || '';
  const teamSnap = await db.collection('teams').doc(teamId).get();
  const schoolId = teamSnap.exists ? (teamSnap.get('schoolId') || '') : '';

  const caller = await userProfile(db, callerId);
  const memSnap = await db.collection('teams').doc(teamId).collection('members').doc(callerId).get();
  const teamRole = memSnap.exists ? memSnap.get('role') : null;
  const perms = memSnap.exists ? (memSnap.get('permissions') || []) : [];
  const isStatStaff = teamRole === 'staff' && perms.includes('statistician');
  if (!(caller.role === 'ad' || teamRole === 'coach' || isStatStaff)) {
    throw new functions.https.HttpsError('permission-denied',
      'Only an AD, the coach, or statistician staff can verify stats.');
  }

  // Idempotent: clear this game's previous ledger entries before rebuilding.
  const existing = await db.collection('careerStatLines').where('gameId', '==', gameId).get();
  await Promise.all(existing.docs.map((d) => d.ref.delete()));

  const [statsSnap, rosterSnap] = await Promise.all([
    db.collection('games').doc(gameId).collection('stats').get(),
    db.collection('teams').doc(teamId).collection('roster').get(),
  ]);

  const roster = {};
  rosterSnap.docs.forEach((d) => {
    roster[d.id] = { teamId: teamId, userId: d.get('userId') || null };
  });

  const sportId = teamSnap.exists ? (teamSnap.get('sportId') || '') : '';
  const season = teamSnap.exists ? (teamSnap.get('season') || '') : '';
  const level = teamSnap.exists ? (teamSnap.get('level') || '') : '';

  // Career stats and school records are varsity-only by convention: freshman and
  // JV results do not count toward school records. The game still verifies, so
  // the coach gets the audit trail, but nothing reaches the career ledger.
  const isVarsity = /^varsity$/i.test(String(level).trim());

  let written = 0;
  for (const doc of statsSnap.docs) {
    if (!isVarsity) break;
    const raw = doc.data() || {};
    const stats = {};
    for (const [key, value] of Object.entries(raw)) {
      if (STAT_META_KEYS.includes(key)) continue;
      // Golf writes per-hole keys (h1..h9) for live scoring; they are not career
      // stats and would corrupt record sums if allowed through.
      if (/^h\d+$/.test(key)) continue;
      if (typeof value === 'number' && isFinite(value)) stats[key] = value;
    }
    if (Object.keys(stats).length === 0) continue;

    await db.collection('careerStatLines').add({
      schoolId: schoolId,
      sportId: sportId,
      season: season,
      level: level,
      teamId: teamId,
      gameId: gameId,
      rosterEntryId: doc.id,
      athleteKey: athleteKeyFor(doc.id, roster[doc.id]),
      athleteName: raw.playerName || '',
      stats: stats,
      source: 'game',
      verified: true,
      createdBy: callerId,
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
    });
    written++;
  }

  await db.collection('games').doc(gameId).set({
    statsStatus: 'verified',
    statsVerifiedBy: callerId,
    statsVerifiedByName: caller.name || '',
    statsVerifiedAt: admin.firestore.FieldValue.serverTimestamp(),
    statsVerifyNote: (data && data.note) ? String(data.note).slice(0, 300) : '',
  }, { merge: true });

  await writeAudit({
    schoolId: schoolId,
    actorId: callerId,
    actorName: caller.name,
    actorRole: caller.role || '',
    action: 'stats.verified',
    targetType: 'game',
    targetId: gameId,
    detail: isVarsity
      ? `${written} athlete stat line(s) confirmed`
      : `verified, but ${level || 'non-varsity'} does not count toward career stats`,
  });

  return { ok: true, athletes: written, careerEligible: isVarsity, level: level };
});

// Reopen a verified game so corrections can be made. Deleting the ledger rows is
// the point: an unverified game must never keep contributing to career totals.
exports.reopenGameStats = functions.https.onCall(async (data, context) => {
  if (!context.auth) {
    throw new functions.https.HttpsError('unauthenticated', 'You must be signed in.');
  }
  const gameId = data && data.gameId ? String(data.gameId) : '';
  if (!gameId) {
    throw new functions.https.HttpsError('invalid-argument', 'gameId is required.');
  }

  const db = admin.firestore();
  const callerId = context.auth.uid;
  const gameSnap = await db.collection('games').doc(gameId).get();
  if (!gameSnap.exists) {
    throw new functions.https.HttpsError('not-found', 'Game not found.');
  }
  const teamId = gameSnap.get('teamId') || '';
  const teamSnap = await db.collection('teams').doc(teamId).get();
  const schoolId = teamSnap.exists ? (teamSnap.get('schoolId') || '') : '';

  const caller = await userProfile(db, callerId);
  const memSnap = await db.collection('teams').doc(teamId).collection('members').doc(callerId).get();
  const teamRole = memSnap.exists ? memSnap.get('role') : null;
  if (!(caller.role === 'ad' || teamRole === 'coach')) {
    throw new functions.https.HttpsError('permission-denied', 'Only an AD or the coach can reopen stats.');
  }

  const existing = await db.collection('careerStatLines').where('gameId', '==', gameId).get();
  await Promise.all(existing.docs.map((d) => d.ref.delete()));

  await db.collection('games').doc(gameId).set({
    statsStatus: 'unverified',
    statsVerifiedBy: admin.firestore.FieldValue.delete(),
    statsVerifiedByName: admin.firestore.FieldValue.delete(),
    statsVerifiedAt: admin.firestore.FieldValue.delete(),
  }, { merge: true });

  await writeAudit({
    schoolId: schoolId,
    actorId: callerId,
    actorName: caller.name,
    actorRole: caller.role || '',
    action: 'stats.reopened',
    targetType: 'game',
    targetId: gameId,
    detail: `${existing.size} ledger line(s) withdrawn`,
  });

  return { ok: true, removed: existing.size };
});

// ---------------------------------------------------------------------------
// Historical career stats.
//
// A school adopting the app mid-career must not lose what came before. This adds
// a verified historical line for an athlete, keyed so it aggregates with stats
// earned in the app. No game, no roster entry, no account required.
// ---------------------------------------------------------------------------
exports.addCareerStatLine = functions.https.onCall(async (data, context) => {
  if (!context.auth) {
    throw new functions.https.HttpsError('unauthenticated', 'You must be signed in.');
  }
  const payload = data || {};
  const athleteName = payload.athleteName ? String(payload.athleteName).trim() : '';
  const sportId = payload.sportId ? String(payload.sportId) : '';
  const rawStats = payload.stats && typeof payload.stats === 'object' ? payload.stats : null;
  if (!athleteName || !sportId || !rawStats) {
    throw new functions.https.HttpsError('invalid-argument',
      'athleteName, sportId and stats are required.');
  }

  const stats = {};
  for (const [key, value] of Object.entries(rawStats)) {
    const n = Number(value);
    if (Number.isFinite(n) && n !== 0) stats[key] = n;
  }
  if (Object.keys(stats).length === 0) {
    throw new functions.https.HttpsError('invalid-argument', 'Provide at least one non-zero stat.');
  }

  const db = admin.firestore();
  const callerId = context.auth.uid;
  const caller = await userProfile(db, callerId);
  const schoolId = (payload.schoolId ? String(payload.schoolId) : '') || caller.schoolId || '';
  if (!schoolId) {
    throw new functions.https.HttpsError('failed-precondition', 'No school on this account.');
  }
  if (!(caller.role === 'ad' || caller.role === 'staff') || caller.schoolId !== schoolId) {
    throw new functions.https.HttpsError('permission-denied',
      'Only this school\'s AD or staff can enter historical stats.');
  }

  // Key to the account when the athlete is known, otherwise to their name so
  // historical totals still aggregate with each other.
  const linkedUserId = payload.athleteUserId ? String(payload.athleteUserId) : '';
  const athleteKey = linkedUserId
    ? `user:${linkedUserId}`
    : `name:${athleteName.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`;

  const ref = await db.collection('careerStatLines').add({
    schoolId: schoolId,
    sportId: sportId,
    season: payload.season ? String(payload.season) : '',
    teamId: '',
    gameId: '',
    rosterEntryId: '',
    athleteKey: athleteKey,
    athleteName: athleteName,
    stats: stats,
    source: 'historical',
    verified: true,
    note: payload.note ? String(payload.note).slice(0, 300) : '',
    createdBy: callerId,
    createdAt: admin.firestore.FieldValue.serverTimestamp(),
  });

  await writeAudit({
    schoolId: schoolId,
    actorId: callerId,
    actorName: caller.name,
    actorRole: caller.role || '',
    action: 'career.historical_added',
    targetType: 'careerStatLine',
    targetId: ref.id,
    detail: `${athleteName} · ${payload.season || 'no season'} · ${Object.keys(stats).join(', ')}`,
  });

  return { ok: true, lineId: ref.id, athleteKey: athleteKey };
});

// ---------------------------------------------------------------------------
// School records.
//
// Records are seeded and maintained by the AD, including history from before the
// school used the app. They are the reference point for record watch below.
// ---------------------------------------------------------------------------
exports.setSchoolRecord = functions.https.onCall(async (data, context) => {
  if (!context.auth) {
    throw new functions.https.HttpsError('unauthenticated', 'You must be signed in.');
  }
  const payload = data || {};
  const sportId = payload.sportId ? String(payload.sportId) : '';
  const statKey = payload.statKey ? String(payload.statKey) : '';
  const value = Number(payload.value);
  const holderName = payload.holderName ? String(payload.holderName).trim() : '';
  if (!sportId || !statKey || !Number.isFinite(value) || value <= 0 || !holderName) {
    throw new functions.https.HttpsError('invalid-argument',
      'sportId, statKey, a positive value and holderName are required.');
  }

  const db = admin.firestore();
  const callerId = context.auth.uid;
  const caller = await userProfile(db, callerId);
  const schoolId = (payload.schoolId ? String(payload.schoolId) : '') || caller.schoolId || '';
  if (!schoolId || caller.role !== 'ad' || caller.schoolId !== schoolId) {
    throw new functions.https.HttpsError('permission-denied',
      "Only this school's AD can set records.");
  }

  // Deterministic id: one current record per sport+stat.
  const docId = `${sportId}__${statKey}`;
  await db.collection('schoolRecords').doc(docId).set({
    schoolId: schoolId,
    sportId: sportId,
    statKey: statKey,
    value: value,
    holderName: holderName,
    holderAthleteKey: payload.holderAthleteKey ? String(payload.holderAthleteKey) : '',
    season: payload.season ? String(payload.season) : '',
    updatedBy: callerId,
    updatedAt: admin.firestore.FieldValue.serverTimestamp(),
  }, { merge: true });

  await writeAudit({
    schoolId: schoolId,
    actorId: callerId,
    actorName: caller.name,
    actorRole: caller.role || '',
    action: 'record.set',
    targetType: 'schoolRecord',
    targetId: docId,
    detail: `${sportId} ${statKey} = ${value} (${holderName})`,
  });

  return { ok: true, recordId: docId };
});

// ---------------------------------------------------------------------------
// Record watch.
//
// Answers "who is close to breaking a school record, and by how much?" from the
// verified career ledger. Read-only and cheap enough for an AD dashboard; the
// `within` fraction defaults to 15% of the record.
// ---------------------------------------------------------------------------
exports.recordProximity = functions.https.onCall(async (data, context) => {
  if (!context.auth) {
    throw new functions.https.HttpsError('unauthenticated', 'You must be signed in.');
  }
  const payload = data || {};
  const db = admin.firestore();
  const caller = await userProfile(db, context.auth.uid);
  const schoolId = (payload.schoolId ? String(payload.schoolId) : '') || caller.schoolId || '';
  if (!schoolId) {
    throw new functions.https.HttpsError('failed-precondition', 'No school on this account.');
  }
  if (!['ad', 'coach', 'staff'].includes(caller.role) || caller.schoolId !== schoolId) {
    throw new functions.https.HttpsError('permission-denied', 'Staff only.');
  }

  const within = Math.min(Math.max(Number(payload.within) || 0.15, 0.01), 1);
  const sportFilter = payload.sportId ? String(payload.sportId) : '';

  // Query by schoolId only and filter in JS: two equality filters would need a
  // composite index for no real benefit at school scale.
  const [recordsSnap, linesSnap] = await Promise.all([
    db.collection('schoolRecords').where('schoolId', '==', schoolId).get(),
    db.collection('careerStatLines').where('schoolId', '==', schoolId).get(),
  ]);

  const records = recordsSnap.docs
    .map((d) => d.data() || {})
    .filter((r) => !sportFilter || r.sportId === sportFilter);

  // athleteKey -> { name, sportId, totals: { statKey: total } }
  const athletes = new Map();
  // athleteKey -> Set(gameId), so we can express the chase in games, not just points.
  const gamesByAthlete = new Map();
  for (const doc of linesSnap.docs) {
    const line = doc.data() || {};
    if (!line.verified) continue;
    if (sportFilter && line.sportId !== sportFilter) continue;
    const key = line.athleteKey || '';
    if (!key) continue;
    if (line.gameId) {
      const set = gamesByAthlete.get(key) || new Set();
      set.add(line.gameId);
      gamesByAthlete.set(key, set);
    }
    const entry = athletes.get(key) || {
      athleteKey: key,
      athleteName: line.athleteName || '',
      sportId: line.sportId || '',
      totals: {},
    };
    if (!entry.athleteName && line.athleteName) entry.athleteName = line.athleteName;
    for (const [statKey, value] of Object.entries(line.stats || {})) {
      const n = Number(value);
      if (!Number.isFinite(n)) continue;
      entry.totals[statKey] = (entry.totals[statKey] || 0) + n;
    }
    athletes.set(key, entry);
  }

  const out = [];
  for (const record of records) {
    const recordValue = Number(record.value) || 0;
    if (recordValue <= 0) continue;
    const threshold = Math.max(1, Math.ceil(recordValue * within));
    const chasing = [];
    const broken = [];
    for (const athlete of athletes.values()) {
      const total = athlete.totals[record.statKey] || 0;
      if (total <= 0) continue;
      const remaining = recordValue - total;
      if (remaining <= 0) {
        broken.push({
          athleteKey: athlete.athleteKey,
          athleteName: athlete.athleteName,
          total: total,
        });
      } else if (remaining <= threshold) {
        const gamesPlayed = (gamesByAthlete.get(athlete.athleteKey) || new Set()).size;
        const average = gamesPlayed > 0 ? total / gamesPlayed : 0;
        chasing.push({
          athleteKey: athlete.athleteKey,
          athleteName: athlete.athleteName,
          total: total,
          remaining: remaining,
          toTie: remaining,
          toBreak: remaining + 1,
          average: Math.round(average * 10) / 10,
          gamesAway: average > 0 ? Math.ceil(remaining / average) : null,
        });
      }
    }
    chasing.sort((a, b) => a.remaining - b.remaining);
    out.push({
      sportId: record.sportId || '',
      statKey: record.statKey || '',
      recordValue: recordValue,
      holderName: record.holderName || '',
      season: record.season || '',
      within: within,
      chasing: chasing.slice(0, 5),
      broken: broken.slice(0, 5),
    });
  }

  return { schoolId: schoolId, records: out, athletesTracked: athletes.size };
});

// ---------------------------------------------------------------------------
// Record-chase announcements.
//
// Cadence, as specified: one baseline notice early, then a single pre-game
// notice for each upcoming game while the player is within a few games of the
// record. Once they close the gap the wording narrows to "needs 4 to tie".
// Every notice is de-duplicated, so a player is never spammed.
// ---------------------------------------------------------------------------
function sanitizeDocId(value) {
  return String(value || '').replace(/[^A-Za-z0-9_-]+/g, '-').slice(0, 400);
}

async function runRecordChaseAnnouncements(db, schoolId, lookaheadHours, gamesAwayMax) {
  const horizon = Date.now() + lookaheadHours * 3600 * 1000;
  const [recordsSnap, linesSnap] = await Promise.all([
    db.collection('schoolRecords').where('schoolId', '==', schoolId).get(),
    db.collection('careerStatLines').where('schoolId', '==', schoolId).get(),
  ]);

  // athleteKey -> { key, name, teamId, totals, games:Set }
  const athletes = new Map();
  for (const doc of linesSnap.docs) {
    const line = doc.data() || {};
    if (!line.verified) continue;
    const key = line.athleteKey || '';
    if (!key) continue;
    const entry = athletes.get(key) || {
      key: key,
      name: line.athleteName || '',
      teamId: line.teamId || '',
      totals: {},
      games: new Set(),
    };
    if (line.athleteName) entry.name = line.athleteName;
    if (line.teamId) entry.teamId = line.teamId;   // most recent team wins
    if (line.gameId) entry.games.add(line.gameId);
    for (const [statKey, value] of Object.entries(line.stats || {})) {
      const n = Number(value);
      if (Number.isFinite(n)) entry.totals[statKey] = (entry.totals[statKey] || 0) + n;
    }
    athletes.set(key, entry);
  }

  const announced = [];
  for (const recordDoc of recordsSnap.docs) {
    const record = recordDoc.data() || {};
    const recordValue = Number(record.value) || 0;
    if (recordValue <= 0) continue;

    for (const athlete of athletes.values()) {
      const total = athlete.totals[record.statKey] || 0;
      if (total <= 0) continue;
      const remaining = recordValue - total;
      if (remaining <= 0) continue;                      // already broken
      const gamesPlayed = athlete.games.size || 0;
      const average = gamesPlayed > 0 ? total / gamesPlayed : 0;
      if (average <= 0) continue;
      const gamesAway = Math.ceil(remaining / average);
      if (!athlete.teamId) continue;

      const body = `${athlete.name} needs ${remaining} ${record.statKey} to tie the school record or ${remaining + 1} to break it.`;

      // 1) Baseline, once per record per athlete — regardless of how far away
      // they are, so the season starts with the story set up.
      const baselineId = sanitizeDocId(
        `baseline__${schoolId}__${record.season || 'current'}__${record.statKey}__${athlete.key}`);
      const baselineSnap = await db.collection('recordChaseAnnouncements').doc(baselineId).get();
      if (!baselineSnap.exists) {
        await notifyTeam(athlete.teamId, 'School record watch', body, true, {
          type: 'recordChase', teamId: athlete.teamId, statKey: record.statKey,
        });
        await db.collection('recordChaseAnnouncements').doc(baselineId).set({
          schoolId: schoolId, teamId: athlete.teamId, gameId: '', kind: 'baseline',
          statKey: record.statKey, athleteKey: athlete.key, athleteName: athlete.name,
          remaining: remaining, recordValue: recordValue,
          createdAt: admin.firestore.FieldValue.serverTimestamp(),
        });
        announced.push({ kind: 'baseline', statKey: record.statKey, athleteName: athlete.name, remaining });
      }

      // 2) One pre-game notice per upcoming game, but only once the chase is
      // close enough to be meaningful (a few games away).
      if (gamesAway > gamesAwayMax) continue;
      const gamesSnap = await db.collection('games').where('teamId', '==', athlete.teamId).limit(50).get();
      const upcoming = gamesSnap.docs
        .map((d) => {
          const g = d.data() || {};
          return { id: d.id, date: Number(g.date) || 0, status: g.status || 'upcoming', opponent: g.opponent || '' };
        })
        .filter((g) => g.status !== 'final' && g.date >= Date.now() && g.date <= horizon)
        .sort((a, b) => a.date - b.date)
        .slice(0, 3);

      for (const game of upcoming) {
        const docId = sanitizeDocId(`game__${game.id}__${record.statKey}__${athlete.key}`);
        const seen = await db.collection('recordChaseAnnouncements').doc(docId).get();
        if (seen.exists) continue;
        await notifyTeam(athlete.teamId, `Record watch · vs ${game.opponent}`, body, true, {
          type: 'recordChase', teamId: athlete.teamId, gameId: game.id, statKey: record.statKey,
        });
        await db.collection('recordChaseAnnouncements').doc(docId).set({
          schoolId: schoolId, teamId: athlete.teamId, gameId: game.id, kind: 'pregame',
          statKey: record.statKey, athleteKey: athlete.key, athleteName: athlete.name,
          remaining: remaining, recordValue: recordValue,
          createdAt: admin.firestore.FieldValue.serverTimestamp(),
        });
        announced.push({ kind: 'pregame', gameId: game.id, statKey: record.statKey, athleteName: athlete.name, remaining });
      }
    }
  }
  return announced;
}

exports.announceRecordChases = functions.https.onCall(async (data, context) => {
  if (!context.auth) {
    throw new functions.https.HttpsError('unauthenticated', 'You must be signed in.');
  }
  const payload = data || {};
  const db = admin.firestore();
  const caller = await userProfile(db, context.auth.uid);
  const schoolId = (payload.schoolId ? String(payload.schoolId) : '') || caller.schoolId || '';
  if (!schoolId) {
    throw new functions.https.HttpsError('failed-precondition', 'No school on this account.');
  }
  if (!['ad', 'coach', 'staff'].includes(caller.role) || caller.schoolId !== schoolId) {
    throw new functions.https.HttpsError('permission-denied', 'Staff only.');
  }
  const lookahead = Math.min(Math.max(Number(payload.lookaheadHours) || 72, 1), 168);
  const maxGamesAway = Math.min(Math.max(Number(payload.gamesAwayMax) || 3, 1), 10);
  const announced = await runRecordChaseAnnouncements(db, schoolId, lookahead, maxGamesAway);
  return { ok: true, announcedCount: announced.length, announced: announced };
});

// Runs daily so the pre-game notices land without anyone remembering to press a
// button. De-duplication makes it safe to run as often as you like.
exports.scheduledRecordChases = functions.pubsub
  .schedule('every 24 hours')
  .onRun(async () => {
    const db = admin.firestore();
    const schools = await db.collection('schools').get();
    let total = 0;
    for (const school of schools.docs) {
      try {
        const list = await runRecordChaseAnnouncements(db, school.id, 72, 3);
        total += list.length;
      } catch (err) {
        console.error('[recordChase] failed for school', school.id, err);
      }
    }
    console.log(`[recordChase] announced ${total} notice(s) across ${schools.size} school(s)`);
    return null;
  });

// ---------------------------------------------------------------------------
// Travel & release.
//
// Guardians declare the plan themselves (client write, guardian-scoped in rules).
// Anything a coach does to a plan is an OVERRIDE and must carry a reason and land
// in the audit log — a staff member changing where a child is going home is
// exactly the kind of action that needs an accountable record.
// ---------------------------------------------------------------------------
const RELEASE_HOME_OPTIONS = ['bus', 'me', 'other_parent', 'not_attending'];

exports.setReleasePlanOverride = functions.https.onCall(async (data, context) => {
  if (!context.auth) {
    throw new functions.https.HttpsError('unauthenticated', 'You must be signed in.');
  }
  const payload = data || {};
  const eventId = payload.eventId ? String(payload.eventId) : '';
  const rosterEntryId = payload.rosterEntryId ? String(payload.rosterEntryId) : '';
  const homeWith = payload.homeWith ? String(payload.homeWith) : '';
  const reason = payload.reason ? String(payload.reason).trim() : '';
  if (!eventId || !rosterEntryId || !RELEASE_HOME_OPTIONS.includes(homeWith)) {
    throw new functions.https.HttpsError('invalid-argument',
      'eventId, rosterEntryId and a valid homeWith are required.');
  }
  if (!reason) {
    throw new functions.https.HttpsError('invalid-argument',
      'A reason is required to override a guardian\'s plan.');
  }

  const db = admin.firestore();
  const callerId = context.auth.uid;
  const eventSnap = await db.collection('events').doc(eventId).get();
  if (!eventSnap.exists) {
    throw new functions.https.HttpsError('not-found', 'Event not found.');
  }
  const teamId = eventSnap.get('teamId') || '';
  const teamSnap = await db.collection('teams').doc(teamId).get();
  const schoolId = teamSnap.exists ? (teamSnap.get('schoolId') || '') : '';

  const caller = await userProfile(db, callerId);
  const memSnap = await db.collection('teams').doc(teamId).collection('members').doc(callerId).get();
  const teamRole = memSnap.exists ? memSnap.get('role') : null;
  const isSchoolAd = caller.role === 'ad' && caller.schoolId === schoolId;
  if (!isSchoolAd && teamRole !== 'coach') {
    throw new functions.https.HttpsError('permission-denied',
      "Only an AD or this team's coach can override a plan.");
  }

  const entrySnap = await db.collection('teams').doc(teamId).collection('roster').doc(rosterEntryId).get();
  if (!entrySnap.exists) {
    throw new functions.https.HttpsError('not-found', 'Player not found on the roster.');
  }

  await db.collection('events').doc(eventId).collection('releasePlans').doc(rosterEntryId).set({
    eventId: eventId,
    rosterEntryId: rosterEntryId,
    athleteName: entrySnap.get('playerName') || '',
    homeWith: homeWith,
    pickupUserId: '',
    pickupName: homeWith === 'other_parent' ? String(payload.pickupName || '') : '',
    declaredByUserId: callerId,
    declaredByName: caller.name || '',
    declaredAtMs: Date.now(),
    overridden: true,
    overrideReason: reason.slice(0, 300),
    overriddenByUserId: callerId,
    overriddenByName: caller.name || '',
    overriddenAtMs: Date.now(),
  }, { merge: true });

  await writeAudit({
    schoolId: schoolId,
    actorId: callerId,
    actorName: caller.name,
    actorRole: caller.role || '',
    action: 'release.plan_override',
    targetType: 'releasePlan',
    targetId: `${eventId}/${rosterEntryId}`,
    detail: `${entrySnap.get('playerName') || rosterEntryId} -> ${homeWith}: ${reason.slice(0, 200)}`,
  });

  return { ok: true };
});

// ---------------------------------------------------------------------------
// Release confirmation (Phase 2).
//
// The coach records the handoff: who physically released the athlete, to whom,
// and when. This is the liability record, so it captures the plan version that was
// in force at the moment of release. An athlete with no declared plan cannot be
// released — that is the safety default, not a bug.
// ---------------------------------------------------------------------------
const RELEASE_TARGET_TYPES = ['bus', 'guardian', 'other_parent'];

exports.confirmRelease = functions.https.onCall(async (data, context) => {
  if (!context.auth) {
    throw new functions.https.HttpsError('unauthenticated', 'You must be signed in.');
  }
  const payload = data || {};
  const eventId = payload.eventId ? String(payload.eventId) : '';
  const rosterEntryId = payload.rosterEntryId ? String(payload.rosterEntryId) : '';
  const releasedToType = payload.releasedToType ? String(payload.releasedToType) : '';
  if (!eventId || !rosterEntryId || !RELEASE_TARGET_TYPES.includes(releasedToType)) {
    throw new functions.https.HttpsError('invalid-argument',
      'eventId, rosterEntryId and a valid releasedToType are required.');
  }

  const db = admin.firestore();
  const callerId = context.auth.uid;
  const eventSnap = await db.collection('events').doc(eventId).get();
  if (!eventSnap.exists) {
    throw new functions.https.HttpsError('not-found', 'Event not found.');
  }
  const teamId = eventSnap.get('teamId') || '';
  const teamSnap = await db.collection('teams').doc(teamId).get();
  const schoolId = teamSnap.exists ? (teamSnap.get('schoolId') || '') : '';

  const caller = await userProfile(db, callerId);
  const memSnap = await db.collection('teams').doc(teamId).collection('members').doc(callerId).get();
  const teamRole = memSnap.exists ? memSnap.get('role') : null;
  const perms = memSnap.exists ? (memSnap.get('permissions') || []) : [];
  const canRelease = caller.role === 'ad'
    || teamRole === 'coach'
    || (teamRole === 'staff' && perms.includes('attendance'));
  if (!canRelease) {
    throw new functions.https.HttpsError('permission-denied',
      'Only an AD, the coach, or attendance staff can confirm a release.');
  }

  const planSnap = await db.collection('events').doc(eventId)
    .collection('releasePlans').doc(rosterEntryId).get();

  // A coach may sign an athlete out on a verbal agreement when the guardian is not
  // on the app, or the network is down. That is allowed, but it must be explicit
  // and it must say why — an unexplained release is indistinguishable from a
  // mistake, and this is the record a school would rely on afterwards.
  const verbal = payload.verbalConsent === true;
  const consentNote = payload.consentNote ? String(payload.consentNote).trim() : '';
  if (!planSnap.exists && !verbal) {
    throw new functions.https.HttpsError('failed-precondition',
      'This athlete has no travel plan. Record verbal guardian consent to release them.');
  }
  if (!planSnap.exists && !consentNote) {
    throw new functions.https.HttpsError('invalid-argument',
      'Describe the verbal consent (who gave it, and how) before releasing.');
  }
  const plan = planSnap.exists ? (planSnap.data() || {}) : {};

  await db.collection('events').doc(eventId).collection('releases').doc(rosterEntryId).set({
    eventId: eventId,
    rosterEntryId: rosterEntryId,
    athleteName: plan.athleteName || '',
    status: 'released',
    releasedToType: releasedToType,
    releasedToName: String(payload.releasedToName || ''),
    note: payload.note ? String(payload.note).slice(0, 300) : '',
    planHomeWith: plan.homeWith || (planSnap.exists ? '' : 'verbal'),
    planDeclaredAtMs: plan.declaredAtMs || 0,
    planDeclaredByName: plan.declaredByName || '',
    verbalConsent: verbal,
    consentNote: consentNote.slice(0, 300),
    confirmedByUserId: callerId,
    confirmedByName: caller.name || '',
    confirmedAtMs: Date.now(),
  }, { merge: true });

  await writeAudit({
    schoolId: schoolId,
    actorId: callerId,
    actorName: caller.name,
    actorRole: caller.role || '',
    action: 'release.confirmed',
    targetType: 'release',
    targetId: `${eventId}/${rosterEntryId}`,
    detail: `${plan.athleteName || rosterEntryId} released (${releasedToType}${payload.releasedToName ? `: ${payload.releasedToName}` : ''})${verbal ? ' · verbal consent' : ''}`,
  });

  return { ok: true };
});

exports.reopenRelease = functions.https.onCall(async (data, context) => {
  if (!context.auth) {
    throw new functions.https.HttpsError('unauthenticated', 'You must be signed in.');
  }
  const payload = data || {};
  const eventId = payload.eventId ? String(payload.eventId) : '';
  const rosterEntryId = payload.rosterEntryId ? String(payload.rosterEntryId) : '';
  const reason = payload.reason ? String(payload.reason).trim() : '';
  if (!eventId || !rosterEntryId) {
    throw new functions.https.HttpsError('invalid-argument', 'eventId and rosterEntryId are required.');
  }
  if (!reason) {
    throw new functions.https.HttpsError('invalid-argument', 'A reason is required to correct a release.');
  }

  const db = admin.firestore();
  const callerId = context.auth.uid;
  const eventSnap = await db.collection('events').doc(eventId).get();
  if (!eventSnap.exists) {
    throw new functions.https.HttpsError('not-found', 'Event not found.');
  }
  const teamId = eventSnap.get('teamId') || '';
  const teamSnap = await db.collection('teams').doc(teamId).get();
  const schoolId = teamSnap.exists ? (teamSnap.get('schoolId') || '') : '';

  const caller = await userProfile(db, callerId);
  const memSnap = await db.collection('teams').doc(teamId).collection('members').doc(callerId).get();
  const teamRole = memSnap.exists ? memSnap.get('role') : null;
  if (!(caller.role === 'ad' || teamRole === 'coach')) {
    throw new functions.https.HttpsError('permission-denied',
      'Only an AD or the coach can correct a release.');
  }

  // Never delete the record: keep the original handoff and stamp the correction,
  // so the history shows both what happened and that it was amended.
  await db.collection('events').doc(eventId).collection('releases').doc(rosterEntryId).set({
    status: 'reopened',
    correctedByUserId: callerId,
    correctedByName: caller.name || '',
    correctedAtMs: Date.now(),
    correctionReason: reason.slice(0, 300),
  }, { merge: true });

  await writeAudit({
    schoolId: schoolId,
    actorId: callerId,
    actorName: caller.name,
    actorRole: caller.role || '',
    action: 'release.reopened',
    targetType: 'release',
    targetId: `${eventId}/${rosterEntryId}`,
    detail: reason.slice(0, 200),
  });

  return { ok: true };
});

// ---------------------------------------------------------------------------
// Resources and bookings.
//
// An organization owns facilities, fields and buses. The AD adds them once and
// they become permanent assets; coaches book them by time window. Overlap is
// enforced in a TRANSACTION, because a client-side check would let two coaches
// book the same gym for the same hour — the whole point of the feature.
// ---------------------------------------------------------------------------
const RESOURCE_TYPES = ['facility', 'field', 'bus', 'other'];

exports.createResource = functions.https.onCall(async (data, context) => {
  if (!context.auth) {
    throw new functions.https.HttpsError('unauthenticated', 'You must be signed in.');
  }
  const payload = data || {};
  const name = payload.name ? String(payload.name).trim() : '';
  const type = payload.type ? String(payload.type) : 'facility';
  if (!name) {
    throw new functions.https.HttpsError('invalid-argument', 'A resource name is required.');
  }
  if (!RESOURCE_TYPES.includes(type)) {
    throw new functions.https.HttpsError('invalid-argument', 'Unknown resource type.');
  }

  const db = admin.firestore();
  const caller = await userProfile(db, context.auth.uid);
  const schoolId = (payload.schoolId ? String(payload.schoolId) : '') || caller.schoolId || '';
  if (!schoolId || caller.role !== 'ad' || caller.schoolId !== schoolId) {
    throw new functions.https.HttpsError('permission-denied',
      "Only this school's AD can add resources.");
  }

  const ref = await db.collection('resources').add({
    schoolId: schoolId,
    name: name.slice(0, 120),
    type: type,
    notes: payload.notes ? String(payload.notes).slice(0, 300) : '',
    // Open hours in local minutes past midnight. Defaults to 06:00–22:00.
    openMin: Number.isFinite(Number(payload.openMin)) ? Number(payload.openMin) : 6 * 60,
    closeMin: Number.isFinite(Number(payload.closeMin)) ? Number(payload.closeMin) : 22 * 60,
    active: true,
    createdBy: context.auth.uid,
    createdAt: admin.firestore.FieldValue.serverTimestamp(),
  });

  await writeAudit({
    schoolId: schoolId,
    actorId: context.auth.uid,
    actorName: caller.name,
    actorRole: caller.role || '',
    action: 'resource.created',
    targetType: 'resource',
    targetId: ref.id,
    detail: `${type}: ${name}`,
  });

  return { ok: true, resourceId: ref.id };
});

exports.removeResource = functions.https.onCall(async (data, context) => {
  if (!context.auth) {
    throw new functions.https.HttpsError('unauthenticated', 'You must be signed in.');
  }
  const resourceId = data && data.resourceId ? String(data.resourceId) : '';
  if (!resourceId) {
    throw new functions.https.HttpsError('invalid-argument', 'resourceId is required.');
  }

  const db = admin.firestore();
  const caller = await userProfile(db, context.auth.uid);
  const ref = db.collection('resources').doc(resourceId);
  const snap = await ref.get();
  if (!snap.exists) {
    throw new functions.https.HttpsError('not-found', 'Resource not found.');
  }
  const schoolId = snap.get('schoolId') || '';
  if (caller.role !== 'ad' || caller.schoolId !== schoolId) {
    throw new functions.https.HttpsError('permission-denied',
      "Only this school's AD can remove resources.");
  }

  // Retire rather than delete: past bookings must keep referring to a real asset.
  await ref.set({ active: false, retiredAt: admin.firestore.FieldValue.serverTimestamp() }, { merge: true });

  await writeAudit({
    schoolId: schoolId,
    actorId: context.auth.uid,
    actorName: caller.name,
    actorRole: caller.role || '',
    action: 'resource.retired',
    targetType: 'resource',
    targetId: resourceId,
    detail: snap.get('name') || resourceId,
  });

  return { ok: true };
});

exports.bookResource = functions.https.onCall(async (data, context) => {
  if (!context.auth) {
    throw new functions.https.HttpsError('unauthenticated', 'You must be signed in.');
  }
  const payload = data || {};
  const resourceId = payload.resourceId ? String(payload.resourceId) : '';
  const teamId = payload.teamId ? String(payload.teamId) : '';
  const startMs = Number(payload.startMs);
  const endMs = Number(payload.endMs);
  if (!resourceId || !teamId || !Number.isFinite(startMs) || !Number.isFinite(endMs) || endMs <= startMs) {
    throw new functions.https.HttpsError('invalid-argument',
      'resourceId, teamId and a valid time window are required.');
  }

  const db = admin.firestore();
  const callerId = context.auth.uid;
  const resourceRef = db.collection('resources').doc(resourceId);
  const teamRef = db.collection('teams').doc(teamId);
  const [resourceSnap, teamSnap] = await Promise.all([resourceRef.get(), teamRef.get()]);
  if (!resourceSnap.exists) {
    throw new functions.https.HttpsError('not-found', 'Resource not found.');
  }
  if (!teamSnap.exists) {
    throw new functions.https.HttpsError('not-found', 'Team not found.');
  }
  if (resourceSnap.get('active') === false) {
    throw new functions.https.HttpsError('failed-precondition', 'That resource is no longer available.');
  }
  const schoolId = resourceSnap.get('schoolId') || '';
  if (teamSnap.get('schoolId') !== schoolId) {
    throw new functions.https.HttpsError('failed-precondition',
      'That resource belongs to a different organization.');
  }

  const caller = await userProfile(db, callerId);
  const memSnap = await teamRef.collection('members').doc(callerId).get();
  const teamRole = memSnap.exists ? memSnap.get('role') : null;
  const isSchoolAd = caller.role === 'ad' && caller.schoolId === schoolId;
  if (!isSchoolAd && teamRole !== 'coach') {
    throw new functions.https.HttpsError('permission-denied',
      "Only an AD or this team's coach can book a resource.");
  }

  const teamName = [teamSnap.get('sportName'), teamSnap.get('level')].filter(Boolean).join(' ');
  const resourceName = resourceSnap.get('name') || '';
  const utcOffset = Number.isFinite(Number(payload.utcOffsetMinutes))
    ? Number(payload.utcOffsetMinutes) : 0;

  // Open hours: a resource is not bookable at 2am just because nobody booked it.
  const openMin = Number.isFinite(Number(resourceSnap.get('openMin')))
    ? Number(resourceSnap.get('openMin')) : 6 * 60;
  const closeMinRaw = Number(resourceSnap.get('closeMin'));
  const closeMin = Number.isFinite(closeMinRaw) && closeMinRaw > 0 ? closeMinRaw : 24 * 60;
  const violation = openHoursViolation(startMs, endMs, utcOffset, openMin, closeMin);
  if (violation) {
    throw new functions.https.HttpsError('failed-precondition', violation);
  }

  // A recurring series expands into concrete windows, and each one is checked.
  const candidates = expandRecurring({
    startMs: startMs,
    endMs: endMs,
    weekdays: payload.weekdays,
    weeks: payload.weeks,
    utcOffsetMinutes: utcOffset,
  });

  const createdIds = [];
  let conflicts = [];
  let linkedEventId = payload.eventId ? String(payload.eventId) : '';

  // Availability check and writes in the same transaction, so two coaches cannot
  // both take a slot that looked free to each of them.
  await db.runTransaction(async (tx) => {
    const existingSnap = await tx.get(
      db.collection('resourceBookings').where('resourceId', '==', resourceId));
    const existing = existingSnap.docs.map((d) => d.data());
    const split = partitionCandidates(candidates, existing);
    conflicts = split.conflicts;

    for (const window of split.available) {
      const ref = db.collection('resourceBookings').doc();
      tx.set(ref, {
        schoolId: schoolId,
        resourceId: resourceId,
        resourceName: resourceName,
        resourceType: resourceSnap.get('type') || '',
        teamId: teamId,
        teamName: teamName,
        title: payload.title ? String(payload.title).slice(0, 120) : '',
        startMs: window.startMs,
        endMs: window.endMs,
        status: 'booked',
        bookedBy: callerId,
        bookedByName: caller.name || '',
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
      });
      createdIds.push(ref.id);
    }

    // Only create or link a schedule event if something was actually booked.
    if (createdIds.length > 0) {
      if (!linkedEventId && payload.createEvent === true) {
        const eventRef = db.collection('events').doc();
        tx.set(eventRef, {
          teamId: teamId,
          title: payload.eventTitle ? String(payload.eventTitle).slice(0, 120)
            : (payload.title ? String(payload.title).slice(0, 120) : 'Practice'),
          type: payload.eventType ? String(payload.eventType) : 'practice',
          date: split.available[0].startMs / 1000,
          location: resourceName,
          notes: `Booked ${resourceName}`,
          schoolId: schoolId,
          resourceId: resourceId,
          resourceBookingIds: createdIds,
          createdAt: admin.firestore.FieldValue.serverTimestamp(),
        });
        linkedEventId = eventRef.id;
      } else if (linkedEventId) {
        tx.set(db.collection('events').doc(linkedEventId), {
          location: resourceName,
          resourceId: resourceId,
          resourceBookingIds: createdIds,
        }, { merge: true });
      }
    }
  });

  await writeAudit({
    schoolId: schoolId,
    actorId: callerId,
    actorName: caller.name,
    actorRole: caller.role || '',
    action: 'resource.booked',
    targetType: 'resourceBooking',
    targetId: createdIds[0] || '',
    detail: `${resourceName} · ${teamName || teamId} · ${createdIds.length} window(s)${conflicts.length ? `, ${conflicts.length} conflict(s)` : ''}`,
  });

  return {
    ok: true,
    bookingIds: createdIds,
    booked: createdIds.length,
    conflicts: conflicts,
    eventId: linkedEventId,
  };
});

exports.cancelResourceBooking = functions.https.onCall(async (data, context) => {
  if (!context.auth) {
    throw new functions.https.HttpsError('unauthenticated', 'You must be signed in.');
  }
  const bookingId = data && data.bookingId ? String(data.bookingId) : '';
  if (!bookingId) {
    throw new functions.https.HttpsError('invalid-argument', 'bookingId is required.');
  }

  const db = admin.firestore();
  const callerId = context.auth.uid;
  const ref = db.collection('resourceBookings').doc(bookingId);
  const snap = await ref.get();
  if (!snap.exists) {
    throw new functions.https.HttpsError('not-found', 'Booking not found.');
  }
  const booking = snap.data() || {};
  const schoolId = booking.schoolId || '';

  const caller = await userProfile(db, callerId);
  const memSnap = await db.collection('teams').doc(booking.teamId || '').collection('members').doc(callerId).get();
  const teamRole = memSnap.exists ? memSnap.get('role') : null;
  const isOwner = booking.bookedBy === callerId;
  const isSchoolAd = caller.role === 'ad' && caller.schoolId === schoolId;
  if (!isOwner && !isSchoolAd && teamRole !== 'coach') {
    throw new functions.https.HttpsError('permission-denied', 'You cannot cancel this booking.');
  }

  // Cancelled rather than deleted: the calendar should show that a slot was held
  // and released, not silently rewrite history.
  await ref.set({
    status: 'cancelled',
    cancelledBy: callerId,
    cancelledByName: caller.name || '',
    cancelledAt: admin.firestore.FieldValue.serverTimestamp(),
    cancelReason: (data && data.reason) ? String(data.reason).slice(0, 300) : '',
  }, { merge: true });

  await writeAudit({
    schoolId: schoolId,
    actorId: callerId,
    actorName: caller.name,
    actorRole: caller.role || '',
    action: 'resource.booking_cancelled',
    targetType: 'resourceBooking',
    targetId: bookingId,
    detail: `${booking.resourceName || ''} · ${booking.teamName || ''}`,
  });

  return { ok: true };
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

    const code = inviteCode();
    const ref = db.collection('invitations').doc();
    const inviteDoc = {
      email: email,
      role: 'parent',
      schoolId: schoolId,
      schoolName: schoolName,
      sportNames: [teamSnap.get('sportName') || ''],
      teamId: teamId,
      teamName: teamName,
      rosterEntryId: rosterEntryId,
      code: code,
      status: 'pending',
      invitedBy: callerId,
      invitedByName: caller.name || '',
      deliveryStatus: emailConfigured() ? 'pending' : 'not_configured',
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
    };
    // Always store the link, even when email is configured: it is the fallback
    // the AD can hand to a parent standing in front of them.
    inviteDoc.inviteUrl = inviteLink(inviteDoc);
    await ref.set(inviteDoc);

    if (rosterEntryId) {
      try {
        await teamRef.collection('roster').doc(rosterEntryId).set({
          parentEmail: email,
          parentName: row.name || '',
        }, { merge: true });
      } catch (e) { /* non-fatal */ }
    }

    already.add(email);
    created.push({ email: email, invitationId: ref.id, inviteUrl: inviteDoc.inviteUrl });
  }

  const configured = emailConfigured();
  await writeAudit({
    schoolId: schoolId,
    actorId: callerId,
    actorName: caller.name || '',
    actorRole: caller.role || '',
    action: 'invite.bulk_created',
    targetType: 'team',
    targetId: teamId,
    detail: `${created.length} parent invitation(s) for ${teamName || teamId}${configured ? '' : ' (email not configured — links issued)'}`,
  });

  return {
    created: created.length,
    skipped: skipped.length,
    invalid: invalid.length,
    details: { created: created, skipped: skipped, invalid: invalid },
    // Every created invitation's copy-ready link, so the console can hand them
    // back even when no email provider is configured.
    links: created,
    emailConfigured: configured,
  };
});


// ---------------------------------------------------------------------------
// Resend a single invitation. The AD/coach can retry without re-typing the
// address, and always gets the shareable link back even if email is down.
// ---------------------------------------------------------------------------
exports.resendInvitation = functions.https.onCall(async (data, context) => {
  if (!context.auth) {
    throw new functions.https.HttpsError('unauthenticated', 'You must be signed in.');
  }
  const invitationId = data && data.invitationId ? String(data.invitationId) : '';
  if (!invitationId) {
    throw new functions.https.HttpsError('invalid-argument', 'invitationId is required.');
  }

  const db = admin.firestore();
  const ref = db.collection('invitations').doc(invitationId);
  const snap = await ref.get();
  if (!snap.exists) {
    throw new functions.https.HttpsError('not-found', 'Invitation not found.');
  }

  const inv = snap.data() || {};
  const caller = await userProfile(db, context.auth.uid);
  let teamRole = null;
  if (inv.teamId) {
    const memSnap = await db.collection('teams').doc(inv.teamId).collection('members').doc(context.auth.uid).get();
    teamRole = memSnap.exists ? memSnap.get('role') : null;
  }
  if (caller.role !== 'ad' && teamRole !== 'coach' && teamRole !== 'staff') {
    throw new functions.https.HttpsError('permission-denied', 'You cannot resend this invitation.');
  }
  if (inv.status && inv.status !== 'pending') {
    throw new functions.https.HttpsError('failed-precondition', `Invitation is already ${inv.status}.`);
  }

  const link = inviteLink(inv);
  const schoolSnap = inv.schoolId ? await db.collection('schools').doc(inv.schoolId).get() : null;
  const schoolName = (schoolSnap && schoolSnap.exists && schoolSnap.get('name')) || inv.schoolName || 'your school';

  const sent = await sendEmail({
    to: inv.email,
    subject: `You've been invited to ${schoolName} on RockLab Athletics`,
    text: [
      `You've been invited to ${schoolName} on RockLab Athletics.`,
      '',
      'To accept:',
      `1. Install RockLab Athletics: ${WEB_BASE}`,
      '2. Sign up using this exact email address.',
      '',
      `Invitation link: ${link}`,
      `Invitation code: ${inv.code || '(none)'}`,
    ].join('\n'),
    html: [
      `<p>You've been invited to <strong>${schoolName}</strong> on RockLab Athletics.</p>`,
      `<p><a href="${link}">Open your invitation</a></p>`,
      `<p>Sign up using this exact email address (${inv.email}) to see it in the app.</p>`,
    ].join(''),
  });

  const deliveryStatus = sent.ok ? 'sent' : (sent.provider === 'none' ? 'not_configured' : 'failed');
  await ref.set({
    inviteUrl: link,
    deliveryStatus: deliveryStatus,
    deliveryProvider: sent.ok ? sent.provider : admin.firestore.FieldValue.delete(),
    deliveryNote: sent.ok ? admin.firestore.FieldValue.delete() : sent.error,
    lastSentAt: admin.firestore.FieldValue.serverTimestamp(),
  }, { merge: true });

  await writeAudit({
    schoolId: inv.schoolId || caller.schoolId || '',
    actorId: context.auth.uid,
    actorName: caller.name,
    actorRole: caller.role || '',
    action: 'invite.resent',
    targetType: 'invitation',
    targetId: invitationId,
    detail: `${inv.email} -> ${deliveryStatus}`,
  });

  return { ok: sent.ok, deliveryStatus: deliveryStatus, inviteUrl: link };
});

// ---------------------------------------------------------------------------
// Record access to a protected record (medical info, forms, injury detail).
//
// Firestore cannot audit reads, so the client calls this whenever staff open a
// protected record. Server-validated and append-only. Documented honestly in
// docs/COMPLIANCE-READINESS.md: this is an application-level trail, not a
// database-level guarantee, and it is deliberately staff-only.
// ---------------------------------------------------------------------------
exports.recordAccess = functions.https.onCall(async (data, context) => {
  if (!context.auth) {
    throw new functions.https.HttpsError('unauthenticated', 'You must be signed in.');
  }
  const payload = data || {};
  const targetType = payload.targetType ? String(payload.targetType) : '';
  if (!targetType) {
    throw new functions.https.HttpsError('invalid-argument', 'targetType is required.');
  }
  const action = ['view', 'download', 'print'].includes(payload.action) ? payload.action : 'view';

  const db = admin.firestore();
  const caller = await userProfile(db, context.auth.uid);
  if (!caller.exists) {
    throw new functions.https.HttpsError('permission-denied', 'No profile.');
  }
  if (!['ad', 'coach', 'staff'].includes(caller.role)) {
    throw new functions.https.HttpsError('permission-denied', 'Staff only.');
  }

  await writeAudit({
    schoolId: payload.schoolId || caller.schoolId || '',
    actorId: context.auth.uid,
    actorName: caller.name,
    actorRole: caller.role,
    action: `record.${action}`,
    targetType: targetType,
    targetId: payload.targetId ? String(payload.targetId) : '',
    detail: payload.detail ? String(payload.detail) : '',
  });

  return { ok: true };
});

// ---------------------------------------------------------------------------
// Export a school's data. FERPA requires records stay accessible and portable:
// a school must be able to leave without paying a ransom for its own roster.
// Returns one JSON document the console downloads as a file.
// ---------------------------------------------------------------------------
exports.exportSchoolData = functions.https.onCall(async (data, context) => {
  if (!context.auth) {
    throw new functions.https.HttpsError('unauthenticated', 'You must be signed in.');
  }

  const db = admin.firestore();
  const caller = await userProfile(db, context.auth.uid);
  const schoolId = (data && data.schoolId ? String(data.schoolId) : '') || caller.schoolId || '';
  if (!schoolId) {
    throw new functions.https.HttpsError('failed-precondition', 'No school on this account.');
  }
  if (caller.role !== 'ad' || caller.schoolId !== schoolId) {
    throw new functions.https.HttpsError('permission-denied', "Only this school's AD can export.");
  }

  const schoolSnap = await db.collection('schools').doc(schoolId).get();
  const teamsSnap = await db.collection('teams').where('schoolId', '==', schoolId).get();
  const eventsSnap = await db.collection('events').where('schoolId', '==', schoolId).get();
  const invitesSnap = await db.collection('invitations').where('schoolId', '==', schoolId).get();

  const teams = [];
  for (const teamDoc of teamsSnap.docs) {
    const rosterSnap = await teamDoc.ref.collection('roster').get();
    teams.push({
      id: teamDoc.id,
      sportName: teamDoc.get('sportName') || '',
      level: teamDoc.get('level') || '',
      season: teamDoc.get('season') || '',
      roster: rosterSnap.docs.map((r) => ({
        name: r.get('name') || '',
        jersey: r.get('jersey') || '',
        position: r.get('position') || '',
        parentEmail: r.get('parentEmail') || '',
      })),
    });
  }

  const result = {
    formatVersion: 1,
    exportedAt: new Date().toISOString(),
    exportedBy: context.auth.uid,
    school: {
      id: schoolId,
      name: schoolSnap.exists ? (schoolSnap.get('name') || '') : '',
    },
    teams: teams,
    events: eventsSnap.docs.map((e) => ({
      teamId: e.get('teamId') || '',
      title: e.get('title') || '',
      type: e.get('type') || '',
      startTime: e.get('startTime') ? e.get('startTime').toDate().toISOString() : null,
      location: e.get('location') || '',
    })),
    invitations: invitesSnap.docs.map((i) => ({
      email: i.get('email') || '',
      role: i.get('role') || '',
      teamName: i.get('teamName') || '',
      status: i.get('status') || '',
      deliveryStatus: i.get('deliveryStatus') || '',
    })),
    counts: {
      teams: teamsSnap.size,
      athletes: teams.reduce((n, t) => n + t.roster.length, 0),
      events: eventsSnap.size,
      invitations: invitesSnap.size,
    },
  };

  await writeAudit({
    schoolId: schoolId,
    actorId: context.auth.uid,
    actorName: caller.name,
    actorRole: caller.role,
    action: 'school.export',
    targetType: 'school',
    targetId: schoolId,
    detail: `${result.counts.teams} teams, ${result.counts.athletes} athletes, ${result.counts.events} events`,
  });

  return result;
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

