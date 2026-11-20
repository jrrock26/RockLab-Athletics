# RockLab Athletics — Web Console

Next.js static-export app for athletic directors. Runs against the **same** Firebase
project as the iOS app, so there is no sync layer: a team created on a phone shows up
here immediately.

## What it does

| Page | Purpose |
| --- | --- |
| `/` | AD sign-in (rejects non-AD roles) |
| `/dashboard` | School overview, teams, current plan |
| `/import` | Paste a roster CSV and invite every parent in one call |
| `/reports` | Moderation queue (`reports` collection) |
| `/privacy` | Public privacy policy — this is the URL in the App Store listing |
| `/support` | Public support page — the App Store "Support URL" |

## Setup

```bash
cd web
cp .env.example .env.local     # fill in the Firebase web app config
npm install
npm run dev                    # http://localhost:3000
```

## Deploy

`firebase.json` points hosting at `web/out`, so:

```bash
cd web && npm run build && cd ..
firebase deploy --only hosting
```

## Notes

- Plans are purchased **only here**, never in the iOS app (App Store 3.1.1).
  `/dashboard` shows the plan; `createCheckoutSession` (Cloud Function) starts Stripe.
- Static export means no server-side code here. All privileged work goes through
  callable Cloud Functions and Firestore security rules.
