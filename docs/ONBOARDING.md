# Onboarding and Team Join Codes

Owner decision, 2026-11-21. This supersedes the email-invitation-first approach for
families.

## The decision

- **The AD invites coaches.** One per team. Not parents, not players — an AD with 30
  teams should never be typing 900 family email addresses.
- **Coaches do not hand-invite families either.** The season starts with a **mass text**
  or a **QR code on a printed sheet**. That is how a real program onboards.
- **Families self-join with a team code, and the coach approves who is who.** Approval is
  the identity check: the code proves you belong to the team's circle, the coach confirms
  which athlete you are and in what role.

## What already exists

| Piece | Where | State |
|---|---|---|
| Per-team join code | `teams/{teamId}.joinCode` (e.g. `GPRYW5`) | **already in the data** |
| Parent requests to link an athlete | `requestParentLink` callable | built |
| Coach approves / rejects | `approveParentLink`, `rejectParentLink`, `listParentLinkRequests` | built |
| Player claims a roster slot | `ensurePlayerRosterEntry` callable | built |
| Request queue | `parentLinkRequests` collection | built |

So the machinery is present. What is missing is **one page**: a public entry point where a
code is typed or scanned, and the request is created.

## What to build

1. **`/join` page** (web, public):
   - accepts `?code=GPRYW5`
   - resolves the team from the code, shows the school and team name so the parent can
     confirm they have the right one
   - sign up (or sign in) — the existing portal auth is reused
   - asks: "Which athlete?" and offers the roster **names** so a parent picks rather than
     types, plus a free-text fallback for a child not yet on the roster
   - calls `requestParentLink`
   - ends with "Sent. Your coach will confirm."
2. **QR rendering** on the coach's team screen: the code as a QR pointing at
   `https://rocklab-athletics.web.app/join?code=GPRYW5`, plus the code in large type for
   a text message. No new backend — it is a URL and a code.
3. **Coach approval queue** (web is fine here): list pending requests, approve or reject.
   The callables already exist.

## Security notes that matter

- A join code is a **shared secret in a group chat**. Anyone who sees the text can request
  to join. That is acceptable *because* approval is mandatory — the code must never by
  itself grant access, and no rule should allow a membership to be created from a code
  alone.
- **Rotate the code per season.** A code printed on a sheet in August is still circulating
  in March. `rolloverTeam` is the natural place to regenerate it.
- The `/join` page must disclose **team and school only** for a valid code — never roster
  names or athlete details before the person is approved and linked, or a leaked code
  becomes a roster disclosure.
- Approval must record who approved and when (the audit log already exists for this).

## Why this beats email invitations for the pilot

No provider, no DNS, no deliverability, no key to configure — which is the blocker that
has held Feature 1 for this entire build. It also removes the failure mode that matters
most at a real school: the AD being the bottleneck for 30 teams' worth of family
onboarding.
