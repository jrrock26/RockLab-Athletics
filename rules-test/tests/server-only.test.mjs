/**
 * Collections the clients may read but never write.
 *
 * The moderation queue, the audit trail and the deletion ledger are all written by
 * Cloud Functions with the Admin SDK, which bypasses rules by design. If a client can
 * write them, the records stop meaning anything -- so every write here is a test.
 */
import { after, before, describe, test } from 'node:test';
import { assertFails, assertSucceeds } from '@firebase/rules-unit-testing';
import { addDoc, collection, doc, getDoc, setDoc, updateDoc } from 'firebase/firestore';
import { freshEnv } from './_env.mjs';
import { SCHOOL_A, seedFixtures } from './fixtures.mjs';

describe('server-write-only collections', () => {
  let env;

  before(async () => { env = await freshEnv(seedFixtures); });
  after(async () => { await env.cleanup(); });

  const as = (uid) => env.authenticatedContext(uid).firestore();

  test('an AD reads the moderation queue; nobody writes it', async () => {
    await assertSucceeds(getDoc(doc(as('adA'), 'reports/reportA')));
    await assertFails(setDoc(doc(as('adA'), 'reports/reportForged'), { schoolId: SCHOOL_A, reason: 'nope' }));
    await assertFails(updateDoc(doc(as('adA'), 'reports/reportA'), { status: 'dismissed' }));
  });

  test('a coach cannot read the moderation queue', async () => {
    await assertFails(getDoc(doc(as('coachA'), 'reports/reportA')));
  });

  test('a signed-out caller cannot read the moderation queue', async () => {
    const db = env.unauthenticatedContext().firestore();
    await assertFails(getDoc(doc(db, 'reports/reportA')));
  });

  test('an AD reads only their own school\'s audit entries', async () => {
    await assertSucceeds(getDoc(doc(as('adA'), `auditLogs/${SCHOOL_A}-log`)));
    await assertFails(getDoc(doc(as('adA'), 'auditLogs/schoolB-log')));
  });

  test('nobody writes the audit trail', async () => {
    await assertFails(addDoc(collection(as('adA'), 'auditLogs'), { schoolId: SCHOOL_A, action: 'forged' }));
    await assertFails(setDoc(doc(as('adA'), 'auditLogs/forged'), { schoolId: SCHOOL_A, action: 'forged' }));
  });

  test('the deleted-account ledger is closed to every client', async () => {
    await assertFails(getDoc(doc(as('adA'), 'deletedAccounts/someone')));
    await assertFails(setDoc(doc(as('adA'), 'deletedAccounts/forged'), { deletedAt: 1 }));
  });
});
