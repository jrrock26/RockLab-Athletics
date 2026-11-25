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

  test('a guardian uploads paperwork for their own child', async () => {
    await assertSucceeds(uploadBytes(
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
});
