// Pure logic for the family portal. No Firebase imports, so `node --test` can
// exercise it directly — every rule here is one a parent's paperwork depends on,
// and none of it can be checked by eye.
//
// This module exists because the portal page had grown to hold both the schema
// knowledge and the rendering. The schemas here are copied from the iOS client, which
// is the writer of record for team-form submissions and chat messages; if these
// helpers and Swift ever disagree, the coach sees an empty submission.

import { toMillis, requirementStatus, REQUIREMENT_STATUS, isActionable, isAwaitingReview } from './portal.mjs';

// --- team forms -----------------------------------------------------------

/// A published team form's state for one athlete.
///
/// Team forms reuse the per-athlete requirement vocabulary deliberately: a family
/// should not have to learn two sets of words for "you still owe this" and "we are
/// waiting on your coach".
export function teamFormStatus(form, submission, nowMs) {
  const f = form || {};
  const s = submission || null;
  // A form with no due date and no submission is simply required.
  return requirementStatus(
    {
      status: s ? s.status : '',
      dueDate: f.dueDate,
      expiresAt: f.expiresAt,
    },
    s,
    nowMs,
  );
}

/// Only forms the coach actually published are a family's business. Unpublished
/// forms are drafts, and the iOS client filters them out the same way.
export function publishedForms(forms) {
  return (forms || []).filter((f) => f && f.published === true);
}

/// Which required fields are still blank. Responses are `fieldId -> value`, the
/// shape `FormSubmission.responses` uses on iOS.
export function missingRequiredFields(form, responses) {
  const fields = Array.isArray(form && form.fields) ? form.fields : [];
  const answers = responses || {};
  return fields
    .filter((f) => f && f.required !== false)
    .filter((f) => {
      const value = answers[f.id];
      if (f.type === 'checkbox') return value !== 'true' && value !== true;
      return !String(value == null ? '' : value).trim();
    });
}

/// The submission document, field for field as iOS writes it in
/// `FirestoreService.submitTeamForm`. A missing `requiresParentSignature` or
/// `parentSignedByName` is not cosmetic: the athlete-signature rule reads the stored
/// value, and iOS decodes both when a coach reviews the form.
export function buildTeamFormSubmission({
  form,
  teamId,
  entryId,
  athleteName,
  uid,
  signedByName,
  responses,
  nowMs,
}) {
  const name = String(signedByName || '').trim();
  const requiresParent = Boolean(form && form.requiresParentSignature);
  return {
    formId: form && form.id ? form.id : '',
    rosterEntryId: entryId,
    playerName: athleteName || '',
    status: 'submitted',
    signedByName: name,
    // Epoch SECONDS, matching `Date().timeIntervalSince1970` on iOS and `toMillis`.
    signedAt: Math.round((nowMs == null ? Date.now() : nowMs) / 1000),
    submittedBy: uid,
    responses: responses || {},
    requiresParentSignature: requiresParent,
    // A guardian signing IS the parent signature; iOS stores the same value twice
    // for that case, and a coach's review screen reads this field.
    parentSignedByName: requiresParent ? name : '',
  };
}

// --- documents ------------------------------------------------------------

/// 10 MB. The storage rule enforces the same number; this copy exists so a parent
/// is told before the upload starts rather than after it fails.
export const MAX_DOCUMENT_BYTES = 10 * 1024 * 1024;

/// The types a phone camera or a school office actually produces. Anything else is
/// refused in the rule as well — an unlisted type would be rejected server-side,
/// and telling the user here is cheaper than a rule denial.
export const ALLOWED_DOCUMENT_TYPES = ['application/pdf', 'image/jpeg', 'image/png'];

/// Storage path for one athlete's paperwork.
///
/// Scoped to the roster entry, not the team: that is what lets the rule express
/// "the guardian of this child" using `guardianUserIds`, the one marker a client
/// cannot write.
export function documentPath(teamId, entryId, fileId) {
  return `teams/${teamId}/roster/${entryId}/documents/${fileId}`;
}

/// Why a chosen file cannot be uploaded, or null if it can.
/// The content type to upload as.
///
/// A phone that cannot identify a file sends an empty `type`, which is common for a
/// PDF shared out of a mail or cloud-storage app. Falling back to the extension keeps
/// a legitimate physical from being rejected — but ONLY when nothing was declared: a
/// file that declares `text/html` stays refused even if it is named `.pdf`.
export function documentType({ type, name } = {}) {
  const declared = String(type || '').toLowerCase();
  if (declared) return ALLOWED_DOCUMENT_TYPES.includes(declared) ? declared : '';
  const extension = String(name || '').toLowerCase().split('.').pop();
  const byExtension = { pdf: 'application/pdf', jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png' };
  return byExtension[extension] || '';
}

export function documentProblem({ size, type, name } = {}) {
  if (!size || size <= 0) return 'That file is empty.';
  // The storage rule requires strictly less than 10 MB, so a file exactly that size
  // would fail at upload; refuse it here where the message can be useful.
  if (size >= MAX_DOCUMENT_BYTES) {
    return 'That file is larger than 10 MB. Photograph the page or export a smaller PDF.';
  }
  if (!documentType({ type, name })) {
    return 'Upload a PDF, a JPEG or a PNG.';
  }
  return null;
}

/// A filename safe for a Storage object name: no slashes, no control characters,
/// and never empty. The suffix keeps two "scan.pdf" uploads from colliding.
export function safeFileName(name, suffix) {
  const base = String(name || 'document')
    .replace(/[\\/]/g, '-')
    .replace(/[\u0000-\u001f]/g, '')
    .replace(/[^A-Za-z0-9._ -]/g, '')
    .trim()
    .slice(-80) || 'document';
  return suffix ? `${suffix}-${base}` : base;
}

/// The roster-form write that accompanies an upload. Status is the only thing the
/// guardian rule permits, so this document may carry no approval fields.
export function buildDocumentSubmission({
  formId,
  teamId,
  entryId,
  athleteName,
  uid,
  signedByName,
  path,
  fileName,
  nowMs,
}) {
  return {
    formId: formId || 'physical',
    rosterEntryId: entryId,
    teamId,
    playerName: athleteName || '',
    status: 'submitted',
    signedByName: String(signedByName || '').trim(),
    signedAt: Math.round((nowMs == null ? Date.now() : nowMs) / 1000),
    submittedBy: uid,
    documentPath: path,
    documentName: fileName || '',
    updatedAt: nowMs == null ? Date.now() : nowMs,
  };
}

// --- messages -------------------------------------------------------------

/// Messages oldest-first, tolerant of the three shapes a timestamp has taken:
/// epoch seconds (iOS), a Firestore Timestamp, or a plain number.
export function sortMessages(messages) {
  return (messages || [])
    .map((m) => ({ ...m, at: toMillis(m && m.createdAt) }))
    .sort((a, b) => {
      const am = a.at == null ? 0 : a.at;
      const bm = b.at == null ? 0 : b.at;
      return am - bm;
    });
}

/// The parent channel's document id, matching iOS `ensureDefaultChats`.
export function parentChatId(teamId) {
  return `${teamId}_parent`;
}

/// Hidden messages stay in the database (moderation is a hide, not a delete) and
/// must not appear to a family.
export function visibleMessages(messages) {
  return (messages || []).filter((m) => !(m && m.hidden === true));
}

// --- notifications --------------------------------------------------------

const DAY_MS = 24 * 60 * 60 * 1000;
const RSVP_WINDOW_MS = 7 * DAY_MS;
const EXPIRY_WINDOW_MS = 30 * DAY_MS;

/// Everything a family needs to be told, derived from data they may already read.
///
/// Deliberately not push: the platform has no email provider configured and the iOS
/// client is the only registered push target. This is the honest in-app version —
/// it cannot claim to have woken anyone's phone. `seenAt` comes from localStorage,
/// so "new" means "since you last opened the portal on this device".
export function buildNotifications({
  nowMs,
  invitations = [],
  requirements = [],
  events = [],
  announcements = [],
  rsvps = {},
  seenAt = 0,
} = {}) {
  const items = [];

  (invitations || []).forEach((inv) => {
    if (!inv || (inv.status && inv.status !== 'pending')) return;
    items.push({
      id: `invite:${inv.id}`,
      kind: 'invitation',
      title: 'Invitation waiting',
      detail: inv.teamName || inv.schoolName || 'Your school',
      at: toMillis(inv.createdAt),
    });
  });

  (requirements || []).forEach((r) => {
    if (!r) return;
    const who = r.athleteName ? `${r.athleteName}: ` : '';
    if (isActionable(r.status)) {
      items.push({
        id: `req:${r.teamId}:${r.entryId}:${r.formId}`,
        kind: r.status === REQUIREMENT_STATUS.OVERDUE ? 'overdue' : 'form',
        title:
          r.status === REQUIREMENT_STATUS.OVERDUE
            ? `${who}${r.label} is overdue`
            : `${who}${r.label} still to complete`,
        detail: r.dueAt != null ? `Due ${new Date(toMillis(r.dueAt)).toLocaleDateString()}` : '',
        at: toMillis(r.dueAt),
      });
      return;
    }
    // Already approved, but the document lapses soon. A family's work is done; the
    // athlete becomes ineligible again if nothing new is filed.
    const exp = toMillis(r.expiresAt);
    if (r.status === REQUIREMENT_STATUS.COMPLETED && exp != null && exp > nowMs && exp - nowMs <= EXPIRY_WINDOW_MS) {
      items.push({
        id: `exp:${r.teamId}:${r.entryId}:${r.formId}`,
        kind: 'expiry',
        title: `${who}${r.label} expires soon`,
        detail: `Expires ${new Date(exp).toLocaleDateString()}`,
        at: exp,
      });
    }
  });

  (events || []).forEach((e) => {
    const at = toMillis(e && e.date);
    if (at == null || at < nowMs || at - nowMs > RSVP_WINDOW_MS) return;
    const unanswered = (e.athleteEntryIds || []).filter(
      (entryId) => !rsvps || !rsvps[`${e.id}:${entryId}`],
    );
    if (!unanswered.length) return;
    items.push({
      id: `rsvp:${e.id}`,
      kind: 'rsvp',
      title: `No RSVP for ${e.title || e.type || 'an event'}`,
      detail: `${unanswered.length} athlete${unanswered.length > 1 ? 's' : ''} to answer`,
      at,
    });
  });

  (announcements || []).forEach((m) => {
    const at = toMillis(m && m.createdAt);
    if (!m) return;
    if (at != null && seenAt && at <= seenAt) return;
    items.push({
      id: `msg:${m.chatId || m.teamId || ''}:${m.id}`,
      kind: 'announcement',
      title: `From ${m.senderName || 'your coach'}`,
      detail: String(m.text || '').slice(0, 120),
      at,
    });
  });

  const priority = { invitation: 0, overdue: 1, form: 2, expiry: 3, rsvp: 4, announcement: 5 };
  return items.sort((a, b) => {
    const ap = priority[a.kind] == null ? 9 : priority[a.kind];
    const bp = priority[b.kind] == null ? 9 : priority[b.kind];
    if (ap !== bp) return ap - bp;
    return (b.at == null ? 0 : b.at) - (a.at == null ? 0 : a.at);
  });
}

/// A one-line summary for the portal header, so a family with three children does
/// not have to open every card to learn whether anything is wrong.
export function notificationSummary(items) {
  const list = items || [];
  if (!list.length) return 'Nothing needs you right now.';
  const urgent = list.filter((i) => i.kind !== 'announcement').length;
  if (urgent === 0) return `${list.length} update${list.length > 1 ? 's' : ''} from your teams.`;
  return `${urgent} item${urgent > 1 ? 's' : ''} need attention.`;
}

// --- account & athlete management ----------------------------------------

/// Only these fields may be written to the guardian's own `users/{uid}` document.
/// `role` and `schoolId` are frozen by the update rule, and attempting either makes
/// the whole write fail — so they are not offered.
export function accountUpdate({ displayName, phone, zipCode }) {
  const patch = {};
  if (typeof displayName === 'string') patch.displayName = displayName.trim();
  if (typeof phone === 'string') patch.phone = phone.trim();
  if (typeof zipCode === 'string') patch.zipCode = zipCode.trim();
  return patch;
}

/// Guardian contact as the school has it on the roster entry. A family cannot edit
/// this — the school owns the player record — so the portal shows it and offers a
/// correction request instead.
export function rosterContact(entry) {
  return {
    name: String((entry && entry.parentName) || ''),
    email: String((entry && entry.parentEmail) || ''),
    phone: String((entry && entry.parentPhone) || ''),
  };
}

/// The correction request that is posted to the parent channel. Deliberately a
/// message, not a write: a guardian editing the roster entry would breach school
/// ownership and is refused by the rules anyway.
export function correctionMessage({ athleteName, field, value, fromName }) {
  const who = athleteName || 'my athlete';
  const what = field ? `the ${field}` : 'my athlete information';
  const next = String(value || '').trim();
  return `Update request for ${who}: please change ${what}${next ? ` to “${next}”` : ''}. — ${fromName || 'guardian'}`;
}

/// Athletes grouped by team, with the requirements already attached, so the page
/// renders one list instead of correlating three maps inline.
export function athletesWithRequirements({ teams, athletesFor, requirements, nowMs }) {
  return (teams || []).map((team) => {
    const athletes = athletesFor(team) || [];
    return {
      ...team,
      athletes: athletes.map((a) => {
        const key = `${team.id}:${a.id}`;
        const record = requirements[key] || {};
        const rows = record.rows || [];
        return {
          ...a,
          requirements: rows,
          outstanding: rows.filter((r) => isActionable(r.status)).length,
          awaiting: rows.filter((r) => isAwaitingReview(r.status)).length,
          error: record.error || '',
        };
      }),
    };
  });
}
