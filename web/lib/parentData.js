// Firestore, Storage and callable access for the family portal.
//
// Every write here is shaped to satisfy a specific rule in firestore.rules or
// storage.rules — the comment above each function names it. Two of these writes are
// the only place a guardian is permitted to touch a document at all, so an extra
// field is not a harmless addition: it turns the whole save into permission-denied.

import {
  addDoc,
  collection,
  doc,
  getDoc,
  getDocs,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
  where,
} from 'firebase/firestore';
import { getDownloadURL, ref as storageReference, uploadBytes } from 'firebase/storage';
import { httpsCallable } from 'firebase/functions';
import { db, functions, storage } from './firebase';
import {
  buildDocumentSubmission,
  buildTeamFormSubmission,
  documentPath,
  documentType,
  parentChatId,
  publishedForms,
  safeFileName,
  sortMessages,
  visibleMessages,
} from './parent.mjs';

/// Published team forms. `published == true` is the same filter iOS applies, and a
/// draft a coach has not issued is not a family's business.
///
/// Rule: `teams/{teamId}/forms` read requires `isTeamMember(teamId)`, which includes
/// `parent`. The query has no resource-dependent constraint, so it is admissible.
export async function fetchTeamForms(teamId) {
  const snap = await getDocs(query(
    collection(db, 'teams', teamId, 'forms'),
    where('published', '==', true),
  ));
  return publishedForms(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
}

/// One submission per athlete per form, read by document id.
///
/// A collection query here would have to prove `isGuardianOf`, which reads the roster
/// entry; a direct get is authorised by that same rule and costs one lookup. Entries
/// the guardian cannot see resolve to null rather than failing the whole panel.
export async function fetchSubmissions(teamId, formId, entryIds) {
  const rows = await Promise.all((entryIds || []).map(async (entryId) => {
    try {
      const snap = await getDoc(doc(db, 'teams', teamId, 'forms', formId, 'submissions', entryId));
      return [entryId, snap.exists() ? { id: snap.id, ...snap.data() } : null];
    } catch {
      return [entryId, null];
    }
  }));
  return Object.fromEntries(rows);
}

/// Submit a team form for one athlete.
///
/// Rule: `teams/{t}/forms/{f}/submissions/{entryId}` write permits a guardian only
/// when `status == 'submitted'`. The document is written whole (not merged) to match
/// iOS `submitTeamForm`, which is what a coach's review screen decodes.
export async function submitTeamForm({
  teamId,
  form,
  entryId,
  athleteName,
  uid,
  signedByName,
  responses,
}) {
  const body = buildTeamFormSubmission({
    form,
    teamId,
    entryId,
    athleteName,
    uid,
    signedByName,
    responses,
  });
  await setDoc(doc(db, 'teams', teamId, 'forms', form.id, 'submissions', entryId), body);
  return body;
}

/// Sign and complete one per-athlete requirement (physical, code of conduct,
/// concussion waiver).
///
/// Rule: `teams/{t}/roster/{e}/forms/{formId}` write permits a guardian only when the
/// incoming `status` is `'submitted'`, and that is the sole reason this document may
/// not carry an approval field. `merge: true` preserves the requirement's own
/// definition (type, due date, signature requirement) which lives on the same doc.
/// `signedAt` is epoch seconds, the unit iOS writes and `toMillis` infers.
export async function signRosterRequirement({ teamId, entryId, formId, signedByName, uid, isGuardian }) {
  const name = String(signedByName || '').trim();
  await setDoc(
    doc(db, 'teams', teamId, 'roster', entryId, 'forms', formId),
    {
      formId,
      rosterEntryId: entryId,
      teamId,
      status: 'submitted',
      signedByName: name,
      signedAt: Math.floor(Date.now() / 1000),
      submittedBy: uid,
      ...(isGuardian ? { parentSignedByName: name } : {}),
      updatedAt: serverTimestamp(),
    },
    { merge: true },
  );
}

/// Upload one athlete's paperwork and record it on the roster form.
///
/// Storage rule: `teams/{teamId}/roster/{entryId}/documents/{file}` — guardian of that
/// entry, coach, staff or AD; ≤10 MB; PDF/JPEG/PNG.
/// Firestore rule: the guardian may write the roster form only with `status:
/// 'submitted'`, which is why the record carries no approval fields.
///
/// `merge: true` is essential: the roster form document also holds the requirement's
/// definition (type, dueDate, requiresParentSignature). A full overwrite would delete
/// the requirement and leave staff looking at a document with no context.
export async function uploadAthleteDocument({
  teamId,
  entryId,
  athleteName,
  formId,
  file,
  uid,
  signedByName,
}) {
  // The requirement document and the stored file must agree on which requirement
  // this is; a record filed under `physical` while labelled '' would be invisible
  // to the coach reviewing that physical.
  const targetFormId = formId || 'physical';
  const contentType = documentType({ type: file.type, name: file.name });
  const path = documentPath(teamId, entryId, `${Date.now()}-${safeFileName(file.name)}`);
  const objectRef = storageReference(storage, path);
  await uploadBytes(objectRef, file, { contentType });
  const url = await getDownloadURL(objectRef);

  const record = buildDocumentSubmission({
    formId: targetFormId,
    teamId,
    entryId,
    athleteName,
    uid,
    signedByName,
    path,
    fileName: file.name,
  });
  await setDoc(
    doc(db, 'teams', teamId, 'roster', entryId, 'forms', targetFormId),
    { ...record, documentUrl: url },
    { merge: true },
  );
  return { path, url };
}

/// The parent/guardian channel.
///
/// Read the channel document by id, then its messages. The channel is created by iOS
/// (`ensureDefaultChats`) under a coach's authority, so a family cannot make one; if
/// the coach has never opened chat, `exists` is false and the portal says so rather
/// than showing an empty room.
///
/// Messages are fetched unordered and sorted here because `createdAt` has been
/// written as epoch seconds by iOS and as a Timestamp elsewhere; ordering in the query
/// would sort the two types into separate runs.
export async function fetchParentChannel(teamId) {
  const chatId = parentChatId(teamId);
  const chatSnap = await getDoc(doc(db, 'chats', chatId));
  if (!chatSnap.exists()) return { chatId, exists: false, title: 'Parent chat', messages: [] };

  const snap = await getDocs(collection(db, 'chats', chatId, 'messages'));
  const messages = sortMessages(
    visibleMessages(snap.docs.map((d) => ({ id: d.id, ...d.data() }))),
  ).slice(-200);
  return {
    chatId,
    exists: true,
    title: chatSnap.get('title') || 'Parent chat',
    messages,
  };
}

/// Post to the parent channel.
///
/// Rule: `chats/{id}/messages` create requires `chatWriteAllowed`, and a guardian
/// passes for `type == 'parent'`. `createdAt` is epoch seconds to match iOS exactly —
/// mixing types would make every client's ordering wrong, not just this one's.
export async function sendParentMessage({ chatId, uid, senderName, text, category = 'general' }) {
  const clean = String(text || '').trim();
  if (!clean) return null;
  const body = {
    chatId,
    senderId: uid,
    senderName: senderName || 'Guardian',
    senderPhotoURL: '',
    text: clean,
    category,
    createdAt: Math.floor(Date.now() / 1000),
  };
  const ref = await addDoc(collection(db, 'chats', chatId, 'messages'), body);
  return { id: ref.id, ...body };
}

/// Athletes a guardian may ask to be linked to, for one team.
///
/// This is the existing `listRosterForLinking` callable (admin credentials, so the
/// staff-only roster rule does not apply). It requires membership of the team, which
/// an accepted invitation grants. It returns names and jersey numbers only, and the
/// link is inert until a coach approves it.
export async function listLinkableAthletes(teamId) {
  const res = await httpsCallable(functions, 'listRosterForLinking')({ teamId });
  return (res.data && res.data.players) || [];
}

/// Ask a coach to confirm this account is the guardian of a roster entry.
///
/// Approval (`approveParentLink`) is what writes `members.role`, `linkedPlayerIds` and
/// the guardian contact onto the entry. The web never performs that write itself.
export async function requestAthleteLink(teamId, rosterEntryId) {
  const res = await httpsCallable(functions, 'requestParentLink')({ teamId, rosterEntryId });
  return res.data || {};
}

/// The guardian's own account fields.
///
/// Rule: `users/{uid}` self-update freezes `role` and `schoolId` but allows the rest.
/// `accountUpdate` in parent.mjs decides the whitelist, so this cannot accidentally
/// send a frozen field and fail the save.
export async function updateAccount(uid, patch) {
  if (!patch || !Object.keys(patch).length) return;
  await updateDoc(doc(db, 'users', uid), patch);
}
