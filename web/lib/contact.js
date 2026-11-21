// RockLab runs on a single mailbox today. Everything routes here.
//
// The pages label contacts by ROLE (Support, Privacy) but print the real
// address, because an address that looks right and does not exist is worse than
// a plain one: a parent copies support@..., it bounces, and nobody knows.
//
// To switch to true role addresses, create aliases at the mail host for
// support@ and privacy@ forwarding to info@ (most hosts include this free), then
// change the two constants below. Nothing else in the app needs to change,
// because every page imports from here.
export const SUPPORT_EMAIL = 'info@rocklabtechnologies.com';
export const PRIVACY_EMAIL = 'info@rocklabtechnologies.com';
