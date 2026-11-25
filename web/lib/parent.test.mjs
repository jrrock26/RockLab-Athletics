// Unit tests for the family portal's pure logic.
//
// These cover the parts where being wrong is silent: a status that renders the wrong
// badge, a submission missing a field iOS decodes, a notification that fires for work
// already done, or a document accepted at a size the storage rule refuses.
//
//   node --test lib/parent.test.mjs

import test from 'node:test';
import assert from 'node:assert/strict';

import {
  accountUpdate,
  athletesWithRequirements,
  buildDocumentSubmission,
  buildNotifications,
  buildTeamFormSubmission,
  correctionMessage,
  documentPath,
  documentProblem,
  documentType,
  missingRequiredFields,
  notificationSummary,
  parentChatId,
  publishedForms,
  safeFileName,
  sortMessages,
  teamFormStatus,
  visibleMessages,
} from './parent.mjs';

const NOW = 1_700_000_000_000;
const SEC = (ms) => Math.round(ms / 1000);

test('a published form with no submission is required', () => {
  assert.equal(teamFormStatus({ id: 'f1' }, null, NOW), 'required');
});

test('a submitted form is awaiting the coach, not the family', () => {
  assert.equal(teamFormStatus({ id: 'f1' }, { status: 'submitted' }, NOW), 'pending_approval');
});

test('an approved form is complete', () => {
  assert.equal(teamFormStatus({ id: 'f1' }, { status: 'approved' }, NOW), 'completed');
});

test('an approval whose document has lapsed reads as expired', () => {
  const form = { id: 'f1', expiresAt: SEC(NOW - 1000) };
  assert.equal(teamFormStatus(form, { status: 'approved' }, NOW), 'expired');
});

test('a missed due date outranks "required"', () => {
  const form = { id: 'f1', dueDate: SEC(NOW - 60_000) };
  assert.equal(teamFormStatus(form, null, NOW), 'overdue');
});

test('only published forms reach a family', () => {
  const forms = [
    { id: 'a', published: true },
    { id: 'b', published: false },
    { id: 'c' },
  ];
  assert.deepEqual(publishedForms(forms).map((f) => f.id), ['a']);
});

test('required fields are checked, optional ones are not, checkboxes need true', () => {
  const form = {
    fields: [
      { id: 'name', type: 'text', label: 'Name', required: true },
      { id: 'note', type: 'text', label: 'Note', required: false },
      { id: 'agree', type: 'checkbox', label: 'Agree', required: true },
      { id: 'sig', type: 'signature', label: 'Signature', required: true },
    ],
  };
  const missing = missingRequiredFields(form, { name: '  ', note: '', agree: 'false' });
  assert.deepEqual(missing.map((f) => f.id), ['name', 'agree', 'sig']);

  assert.deepEqual(
    missingRequiredFields(form, { name: 'Ada', agree: 'true', sig: 'Ada Lovelace' }),
    [],
  );
});

test('the submission matches the fields iOS writes', () => {
  const body = buildTeamFormSubmission({
    form: { id: 'f1', requiresParentSignature: true },
    teamId: 't1',
    entryId: 'e1',
    athleteName: 'Sam',
    uid: 'u1',
    signedByName: '  Ada Lovelace  ',
    responses: { a: 'yes' },
    nowMs: NOW,
  });

  assert.equal(body.formId, 'f1');
  assert.equal(body.rosterEntryId, 'e1');
  assert.equal(body.playerName, 'Sam');
  assert.equal(body.status, 'submitted');
  assert.equal(body.signedByName, 'Ada Lovelace');
  assert.equal(body.signedAt, SEC(NOW), 'epoch seconds, as iOS writes and toMillis reads');
  assert.equal(body.submittedBy, 'u1');
  assert.deepEqual(body.responses, { a: 'yes' });
  assert.equal(body.requiresParentSignature, true);
  assert.equal(body.parentSignedByName, 'Ada Lovelace');
});

test('a form needing no guardian signature does not claim one', () => {
  const body = buildTeamFormSubmission({
    form: { id: 'f1', requiresParentSignature: false },
    teamId: 't1', entryId: 'e1', athleteName: 'Sam', uid: 'u1',
    signedByName: 'Coach', responses: {}, nowMs: NOW,
  });
  assert.equal(body.parentSignedByName, '');
});

test('documents are refused before the upload starts', () => {
  assert.match(documentProblem({ size: 0, type: 'application/pdf' }), /empty/);
  assert.match(documentProblem({ size: 20 * 1024 * 1024, type: 'application/pdf' }), /10 MB/);
  // The storage rule is a strict `< 10 MB`, so exactly that size must be refused here.
  assert.match(documentProblem({ size: 10 * 1024 * 1024, type: 'application/pdf' }), /10 MB/);
  assert.match(documentProblem({ size: 100, type: 'text/html' }), /PDF/);
  assert.equal(documentProblem({ size: 100, type: 'application/pdf' }), null);
  assert.equal(documentProblem({ size: 100, type: 'image/jpeg' }), null);
});

test('an undeclared type is inferred from the extension, a wrong one is not', () => {
  // A phone sharing a PDF out of another app sends an empty type.
  assert.equal(documentType({ type: '', name: 'physical.PDF' }), 'application/pdf');
  assert.equal(documentType({ type: '', name: 'scan.jpeg' }), 'image/jpeg');
  assert.equal(documentProblem({ size: 100, type: '', name: 'physical.pdf' }), null);

  // But a file that declares something else never becomes acceptable by name.
  assert.equal(documentType({ type: 'text/html', name: 'evil.pdf' }), '');
  assert.match(documentProblem({ size: 100, type: 'text/html', name: 'evil.pdf' }), /PDF/);
  assert.equal(documentType({ type: '', name: 'notes.txt' }), '');
});

test('a filename cannot escape its folder', () => {
  // The property that matters is that no separator survives, not the exact
  // replacement: a name containing `/` or `\` would address a different object.
  const escaped = safeFileName('../../etc/passwd');
  assert.equal(escaped.includes('/'), false);
  assert.equal(escaped.includes('\\'), false);
  assert.match(escaped, /passwd/);

  assert.equal(safeFileName('scan.pdf', 123), '123-scan.pdf');
  assert.equal(safeFileName(''), 'document');
});

test('the document path is scoped to the athlete, not the team', () => {
  assert.equal(documentPath('t1', 'e1', 'f.pdf'), 'teams/t1/roster/e1/documents/f.pdf');
});

test('the upload record carries status and no approval fields', () => {
  const rec = buildDocumentSubmission({
    formId: 'physical', teamId: 't1', entryId: 'e1', athleteName: 'Sam',
    uid: 'u1', signedByName: 'Ada', path: 'p', fileName: 'scan.pdf', nowMs: NOW,
  });
  assert.equal(rec.status, 'submitted');
  assert.equal(rec.documentPath, 'p');
  assert.equal(rec.documentName, 'scan.pdf');
  assert.equal(rec.signedAt, SEC(NOW));
  assert.equal('approvedBy' in rec, false);
  assert.equal('reviewedBy' in rec, false);
});

test('message ordering tolerates seconds, Timestamps and missing values', () => {
  const rows = sortMessages([
    { id: 'c', createdAt: { toMillis: () => NOW + 2000 } },
    { id: 'a', createdAt: SEC(NOW) },
    { id: 'b', createdAt: null },
  ]);
  assert.deepEqual(rows.map((m) => m.id), ['b', 'a', 'c']);
});

test('a hidden message is not shown to a family', () => {
  const rows = visibleMessages([{ id: 'a' }, { id: 'b', hidden: true }]);
  assert.deepEqual(rows.map((m) => m.id), ['a']);
});

test('the parent channel id matches iOS', () => {
  assert.equal(parentChatId('t1'), 't1_parent');
});

test('notifications lead with what blocks the athlete', () => {
  const items = buildNotifications({
    nowMs: NOW,
    invitations: [{ id: 'i1', status: 'pending', teamName: 'Varsity Soccer' }],
    requirements: [
      {
        teamId: 't1', entryId: 'e1', athleteName: 'Sam', formId: 'physical',
        label: 'Sports physical', status: 'overdue', dueAt: SEC(NOW - 1000),
      },
      {
        teamId: 't1', entryId: 'e1', athleteName: 'Sam', formId: 'codeOfConduct',
        label: 'Code of conduct', status: 'completed', expiresAt: SEC(NOW + 5 * 86400000),
      },
    ],
    events: [{ id: 'ev1', title: 'vs Riverside', date: SEC(NOW + 2 * 86400000), athleteEntryIds: ['e1'] }],
    announcements: [{ id: 'm1', teamId: 't1', senderName: 'Coach', text: 'Bus leaves 4pm', createdAt: SEC(NOW) }],
    rsvps: {},
    seenAt: 0,
  });

  assert.deepEqual(items.map((i) => i.kind), ['invitation', 'overdue', 'expiry', 'rsvp', 'announcement']);
  assert.match(items[1].title, /Sam: Sports physical is overdue/);
});

test('an announcement already seen on this device is not repeated', () => {
  const items = buildNotifications({
    nowMs: NOW,
    announcements: [{ id: 'm1', createdAt: SEC(NOW - 1000), text: 'Hello' }],
    seenAt: NOW,
  });
  assert.equal(items.length, 0);
});

test('an event the family already answered raises nothing', () => {
  const items = buildNotifications({
    nowMs: NOW,
    events: [{ id: 'ev1', date: SEC(NOW + 86400000), athleteEntryIds: ['e1'] }],
    rsvps: { 'ev1:e1': 'attending' },
  });
  assert.equal(items.length, 0);
});

test('the header summary separates errands from news', () => {
  assert.match(notificationSummary([]), /Nothing needs you/);
  assert.match(notificationSummary([{ kind: 'announcement' }]), /1 update/);
  assert.match(notificationSummary([{ kind: 'form' }, { kind: 'announcement' }]), /1 item need/);
});

test('the account patch can never carry a frozen field', () => {
  const patch = accountUpdate({ displayName: ' Ada ', phone: '555', zipCode: '18403' });
  assert.deepEqual(patch, { displayName: 'Ada', phone: '555', zipCode: '18403' });
  assert.equal('role' in patch, false);
  assert.equal('schoolId' in patch, false);
});

test('a correction request names the athlete and the value', () => {
  const text = correctionMessage({
    athleteName: 'Sam Lovelace', field: 'jersey number', value: '12', fromName: 'Ada',
  });
  assert.match(text, /Sam Lovelace/);
  assert.match(text, /jersey number/);
  assert.match(text, /12/);
});

test('athletes carry their own requirement counts', () => {
  const teams = [{ id: 't1', team: {} }];
  const result = athletesWithRequirements({
    teams,
    athletesFor: () => [{ id: 'e1', playerName: 'Sam' }],
    requirements: {
      't1:e1': {
        rows: [
          { id: 'a', status: 'required' },
          { id: 'b', status: 'pending_approval' },
        ],
      },
    },
    nowMs: NOW,
  });
  assert.equal(result[0].athletes[0].outstanding, 1);
  assert.equal(result[0].athletes[0].awaiting, 1);
});
