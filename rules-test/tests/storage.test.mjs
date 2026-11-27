/**
 * Storage for athlete paperwork.
 *
 * This bucket holds physicals and clearance letters, so the read rule is the most
 * sensitive one in the project: it must be exactly "the guardian of this roster entry,
 * or staff of this team". The team-membership shortcuts that are acceptable for a team
 * photo are not acceptable for a 10 MB PDF of a child's medical record.
 */
import { after, before, describe, test } from 'node:test';
import { assertFails, assertSucceeds } from '@firebase/rules-unit-testing';
import { getBytes, ref, uploadBytes } from 'firebase/storage';
import { freshEnv } from './_env.mjs';
import { ENTRY_KID_A, ENTRY_KID_B, TEAM_A, seedFixtures } from './fixtures.mjs';

const PDF = new Uint8Array([0x25, 0x50, 0x44, 0x46, 0x2d, 0x31, 0x2e, 0x34]);
const TEN_MB_LIMIT = 10 * 1024 * 1024;

const documentsPath = (entryId, fileName = 'physical.pdf') =>
  `teams/${TEAM_A}/roster/${entryId}/documents/${fileName}`;

describe('athlete paperwork in Storage', () => {
  let env;

  before(async () => { env = await freshEnv(seedFixtures); });
  after(async () => { await env.cleanup(); });

  const storage = (uid) => (uid ? env.authenticatedContext(uid) : env.unauthenticatedContext()).storage();

  test('a coach uploads paperwork for a roster entry', async () => {
    await assertSucceeds(uploadBytes(
      ref(storage('coachA'), documentsPath(ENTRY_KID_A)),
      PDF,
      { contentType: 'application/pdf' },
    ));
  });

  test('the linked guardian reads it, other families and followers do not', async () => {
    await assertSucceeds(getBytes(ref(storage('guardianA'), documentsPath(ENTRY_KID_A))));
    // guardianB is a parent on the same team, but not linked to this child.
    await assertFails(getBytes(ref(storage('guardianB'), documentsPath(ENTRY_KID_A))));
    await assertFails(getBytes(ref(storage('followerX'), documentsPath(ENTRY_KID_A))));
  });

  test('a signed-out caller reads nothing', async () => {
    await assertFails(getBytes(ref(storage(undefined), documentsPath(ENTRY_KID_A))));
  });

  test('a guardian cannot upload directly any more', async () => {
    // Guardians now upload through createPaperworkUpload, which signs a create-only URL.
    // A direct SDK write is refused so the precondition cannot be bypassed.
    await assertFails(uploadBytes(
      ref(storage('guardianA'), documentsPath(ENTRY_KID_A, 'clearance.png')),
      new Uint8Array([0x89, 0x50, 0x4e, 0x47]),
      { contentType: 'image/png' },
    ));
  });

  test('a guardian cannot upload for another family\'s child', async () => {
    await assertFails(uploadBytes(
      ref(storage('guardianA'), documentsPath(ENTRY_KID_B)),
      PDF,
      { contentType: 'application/pdf' },
    ));
  });

  test('an athlete cannot upload their own paperwork', async () => {
    // A minor must not be able to file their own physical.
    await assertFails(uploadBytes(
      ref(storage('kidA'), documentsPath(ENTRY_KID_A)),
      PDF,
      { contentType: 'application/pdf' },
    ));
  });

  test('only PDF, JPEG and PNG are accepted', async () => {
    await assertFails(uploadBytes(
      ref(storage('coachA'), documentsPath(ENTRY_KID_A, 'archive.zip')),
      new Uint8Array([0x50, 0x4b, 0x03, 0x04]),
      { contentType: 'application/zip' },
    ));
  });

  test('the 10 MB cap is enforced', async () => {
    await assertFails(uploadBytes(
      ref(storage('coachA'), documentsPath(ENTRY_KID_A, 'huge.pdf')),
      new Uint8Array(TEN_MB_LIMIT + 1),
      { contentType: 'application/pdf' },
    ));
  });

  test('an unrouted path in the bucket is closed', async () => {
    await assertFails(uploadBytes(
      ref(storage('coachA'), `teams/${TEAM_A}/roster/${ENTRY_KID_A}/other/x.pdf`),
      PDF,
      { contentType: 'application/pdf' },
    ));
  });

  // NOT ASSERTED HERE: that a guardian cannot overwrite a document that already
  // exists (D-3, the `allow update: if staffOfTeam()` half of the rules).
  //
  // Probed directly, the Storage emulator evaluates a second upload to the same path as
  // `create`, not `update` -- so the emulator allows the overwrite for anyone the
  // `create` rule allows, and no assertion written here can fail for the right reason.
  // The rule is kept because production distinguishes the two operations as documented,
  // and it is safe either way: every portal upload gets a fresh `${Date.now()}-${name}`
  // path, so a family re-uploading the right file is unaffected. Defence in depth is
  // not coverage: this half of D-3 stays unverified until Phase 4.3 versions documents.

  test('staff may still replace a document', async () => {
    // physical.pdf exists from the first test; a coach re-uploading a corrected scan is
    // an `update` and stays allowed.
    await assertSucceeds(uploadBytes(
      ref(storage('coachA'), documentsPath(ENTRY_KID_A)),
      new Uint8Array([0x25, 0x50, 0x44, 0x46]),
      { contentType: 'application/pdf' },
    ));
  });
});
