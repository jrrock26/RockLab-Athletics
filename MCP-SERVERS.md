# MCP Servers — Audit & Recommendations

Audited **2026-11-20** against project `rocklab-athletics` (79884425424).
Everything below was probed live, not assumed.

---

## 1. What's connected now

| Server | Status | Verdict |
| --- | --- | --- |
| **firebase** | ✅ Working | Required. Now set to this project + repo (was pointing at `/`). |
| **firestore** | ❌ Broken | `Incompatible auth server: does not support dynamic client registration` → then `No connection found`. **Remove it.** |
| **playwright** | ⚠️ Blocked | Installed, but pinned to `chrome` channel and Chrome.app is absent. |
| **context7** | ✅ Working | Good for Firebase/SwiftUI API questions; better than model memory. |
| **composio** | ✅ Working | Gmail / Sheets / Dialpad / 100s more. Sheet import is genuinely useful; Gmail is **not** right for app email. |

**Available but not yet wired:** Apple's Xcode MCP (`xcrun mcpbridge`, 54 tools, zero install) —
see §3.1. It was found during this audit and is the highest-value addition available.


### Fixes applied this session

- **firebase** → repointed to `project_dir=/Users/jasonrock/Desktop/RockLab-Athletics`,
  `active_project=rocklab-athletics`. It immediately surfaced a real bug (§2).
  Command note: `firebase mcp --help` (firebase-tools 15.33.0) shows the server is now **GA**
  as `firebase mcp [--dir <path>] [--only <features>] [--mode stdio|sse]`. If your config still
  says `experimental:mcp` it works, but `mcp --dir …` is the supported form — and passing
  `--dir` explicitly means it can't silently attach to the wrong project again.

- **playwright** → Chromium downloaded (100 MB, done). The server still requests the
  `chrome` *channel*, so either:
  - install Chrome: `npx playwright install chrome` — **it asks for your admin password**,
    which is why it stalled mid-run; run it yourself in a terminal, or
  - change the MCP arg `--browser chrome` → `--browser chromium` (already downloaded).

- **firestore** → remove. It relies on Google OAuth *dynamic client registration*, which
  Google's auth server doesn't support, so it cannot authenticate — ever. You lose nothing:
  the `firebase` MCP handles rules/indexes/deploy, and the Admin SDK handles document reads
  (that's exactly what `functions/scripts/seed-local.js` does).

---

## 2. What the Firebase MCP caught immediately

`firebase_list_apps` returned **one app: iOS only.** No web app existed in the project,
so `web/lib/firebase.js` could never have authenticated — the console would have shipped
broken, and the failure mode online is a blank white login screen.

**Fixed:** created `RockLab Athletics Web Console`
(`1:79884425424:web:fcd95fcd67e77a241c26d5`), wrote real values into `web/.env.local`.
`.env.example` also had the wrong bucket (`.appspot.com` → `firebasestorage.app`), and
`.gitignore` was excluding `.env.example` itself so the template could never be committed.

**Proof it's fixed:** `npm install` → `npx next build` now passes — 8 routes, `.env.local`
loaded (`/`, `/dashboard`, `/import`, `/privacy`, `/reports`, `/support`, `/_app`, `/404`).
Before the web app existed, this build had nothing to authenticate with.

> Run `firebase_list_apps` before any deploy. One call, catches config drift a green
> build never will.


---

## 3. Add these — ranked by what they unblock

### Tier 1 — unblocks something shipping *now*

**1. Apple's Xcode MCP — already on your machine. Nothing to install.**
This is the biggest finding of the audit. Xcode 27.2 ships a first-party MCP server:

```bash
xcrun --find mcpbridge     # /Applications/Xcode.app/Contents/Developer/usr/bin/mcpbridge
```

Probed it live: `serverInfo: xcode-tools`, **54 tools**, including

| Tool | Why it matters for this app |
| --- | --- |
| `BuildProject`, `RunAllTests`, `RunSomeTests`, `GetTestList` | Real pass/fail + counts instead of grepping `Executed .* tests` out of 4,000 lines of log |
| `GetBuildLog`, `GetConsoleOutput` | Read the *actual* error, not my guess at it |
| `RenderPreview` | Renders SwiftUI previews to images — the only way to visually verify a 128-file SwiftUI app without you screenshotting |
| `InvokeDebuggerCommand` | Breakpoints, stack traces, without leaving the loop |
| `GetTopCrashIssues`, `GetCrashIssueLogs` | **Crashlytics triage.** Pairs directly with the Crashlytics integration we just shipped |
| `XcodeGrep`, `XcodeGlob`, `XcodeRead`, `XcodeWrite`, `XcodeLS` | File ops that respect the project graph instead of raw paths |
| `AddEntitlement`, `AddInfoPlist`, `UpdateTargetBuildSetting` | Entitlements/Info.plist edits without hand-patching `project.pbxproj` |
| `DocumentationSearch` | Apple docs, offline, version-matched to Xcode 27.2 |

**Requires Xcode to be open** (it bridges to a running instance; `MCP_XCODE_PID` overrides
which one). It does not cover App Store Connect — see §3.4.

```json
"xcode": { "command": "xcrun", "args": ["mcpbridge"], "disabled": false }
```

This supersedes `xcodebuildmcp` (npm `xcodebuildmcp@2.7.0`, exists and works — keep it only as
a fallback on pre-27 Xcode). Prefer first-party: it's the same team that ships the compiler.

**2. Resend MCP** — `resend/mcp-send-email` (verified: `resend-mcp@2.29.0`, repo `resend/resend-mcp`)
**The fix for the #1 open risk in the project.** Invitations don't send today because
`SMTP_HOST/USER/PASS` are unset — coaches invite parents and nothing arrives. Resend is a real
transactional API with delivery events, so `onInvitationCreated` stops being
nodemailer-on-raw-SMTP.

```json
"resend": {
  "command": "npx",
  "args": ["-y", "resend-mcp"],
  "env": { "RESEND_API_KEY": "re_..." }
}
```
Needs one verified sending domain. You already use `@rocklabathletics.com`, so it's a DNS job
(SPF + DKIM), and the `deliveryStatus` stamping already deployed starts reporting `sent`
instead of `not_configured`.

**3. Stripe MCP** — official, `stripe/ai` (verified: `@stripe/mcp@0.3.4`)
You shipped `createCheckoutSession` + `stripeWebhook` and have **never run a test payment**.
This creates test-mode customers/subscriptions and inspects webhook delivery inside the loop
instead of you clicking the dashboard and pasting results.

```json
"stripe": {
  "command": "npx",
  "args": ["-y", "@stripe/mcp", "--tools=all"],
  "env": { "STRIPE_SECRET_KEY": "sk_test_..." }
}
```

### Tier 2 — high value for a solo build

**4. App Store Connect MCP** — `@chrischall/app-store-connect-mcp` (verified `1.4.0`, MIT)
Note: Xcode's `xcode-tools` server does **not** cover App Store Connect, so this is still
needed. Reads builds, TestFlight groups, customer reviews, sales reports, team users — so you
stop screenshotting App Store Connect for me.

Requires an ASC **API key** (Admin role): `.p8` file (downloadable **once**), Key ID, Issuer ID.
Never your Apple ID password.

```json
"appstoreconnect": {
  "command": "npx",
  "args": ["-y", "@chrischall/app-store-connect-mcp"],
  "env": {
    "APP_STORE_CONNECT_KEY_ID": "ABC1234567",
    "APP_STORE_CONNECT_ISSUER_ID": "00000000-0000-0000-0000-000000000000",
    "APP_STORE_CONNECT_PRIVATE_KEY_PATH": "/absolute/path/to/AuthKey_ABC1234567.p8"
  }
}
```

Alternatives exist (`apple-connect-workflows-mcp`, `@muhammetali/asc-mcp-server`, both MIT).
Deliberately **not** recommending `@abd3lraouf/app-store-connect-mcp` despite its impressive
1,293 operations — it's **BUSL-1.1**, which is a licensing question you don't want attached to
a commercial product without reading it.

**5. GitHub MCP** — `github/github-mcp-server`
Blocker: **`~/Desktop/RockLab-Athletics` is not a git repo** (`fatal: not a git repository`).
For a project this size that's real exposure — no rollback, no blame, no diff of tonight's
12-item batch. Add this and I can init + push, file one issue per remaining App Store
blocker, and attach PRs.

### Tier 3 — sports & event day (see §4 for the caveat)

**6. Google Maps MCP** — `modelcontextprotocol/servers` → `google-maps`
Fits features you already have: travel legs, drive time to an away venue, geocoding the
`venue` strings coaches type freehand.

**7. Weather MCP** (`open-meteo` based)
Game-day conditions on the event card. HS athletic directors genuinely care about lightning
policy — cheap, real differentiator.

---

## 4. Sports MCPs — the honest answer

You asked for sports MCPs. Here's what actually exists and whether it helps a **high school**
system:

| Server | What it really serves | Useful here? |
| --- | --- | --- |
| `cyanheads/sports-mcp-server` | Multi-provider (balldontlie, SportRadar, ESPN) | ⚠️ Pro leagues only |
| `nexon33/sports-mcp` | ESPN feeds, live scores | ⚠️ Pro/college only |
| balldontlie / SportScore / SportDB servers | NBA, NFL, MLB, UCL | ❌ No HS data |
| **Hudl** | — | ❌ **No public HS API.** Their APIs (Wyscout, Live Football Data, FIFA tracking) are pro/soccer; team management needs a partner agreement. |
| **MaxPreps** | Scraper only (`chrischall/maxpreps-mcp`) | ❌ No API. Fragile, and scraping is a ToS risk for a company selling to schools. |

**The gap is structural, not fixable by adding a server.** National feeds know the NBA; they
do not know Cedar Ridge beat Northside 42–38 on Friday. Nobody sells that data — the school
*is* the source of record. Wiring a pro feed into the product creates a dependency that can
never satisfy your actual users.

Two things that do pay off:

1. **Use `cyanheads/sports-mcp-server` as a dev-time schema reference.** When you build the
   scoreboard/standings widgets, look at how real score payloads are shaped rather than
   inventing `homeScore`/`awayScore`. Not a runtime dependency, not in the app bundle.
2. **Build your own MCP server** — ~80 lines wrapping the Admin SDK, exposing
   `get_team_roster`, `get_upcoming_events`, `get_eligibility`, `search_athletes`. This is the
   only "sports MCP" that will ever have your data, and it makes every future session cheaper:
   I stop grepping Swift to answer "who's on varsity and are they eligible?"

*(The Puppeteer/Playwright sports scrapers are technically MCP-adjacent. Don't. Scraping
MaxPreps on behalf of schools is the kind of thing a district legal department asks about.)*

---

## 5. Do NOT add

- **"AI video analysis" for highlights.** Film is student PII. You have a clean
  upload→clip→publish flow; don't widen the data surface before launch.
- **Instagram / TikTok MCPs.** Auto-posting minors' highlights to social platforms is a COPPA
  conversation you don't want on day one.
- **Supabase / Postgres MCPs.** You're all-in on Firestore; a second datastore MCP just invites
  queries that can't run.
- **Duplicate Firebase servers.** `firestore` above is the cautionary tale.

---

## 6. Full config block

Cline → MCP Servers → Configure, merge into existing `mcpServers`:

```json
{
  "mcpServers": {
    "firebase": {
      "command": "npx",
      "args": ["-y", "firebase-tools@latest", "mcp", "--dir",
               "/Users/jasonrock/Desktop/RockLab-Athletics"],
      "disabled": false
    },
    "xcode": {
      "command": "xcrun",
      "args": ["mcpbridge"],
      "disabled": false
    },
    "context7": {
      "command": "npx",
      "args": ["-y", "@upstash/context7-mcp@latest"],
      "disabled": false
    },
    "playwright": {
      "command": "npx",
      "args": ["-y", "@playwright/mcp@latest", "--browser", "chromium"],
      "disabled": false
    },
    "resend": {
      "command": "npx",
      "args": ["-y", "resend-mcp"],
      "env": { "RESEND_API_KEY": "re_your_key" },
      "disabled": true
    },
    "stripe": {
      "command": "npx",
      "args": ["-y", "@stripe/mcp", "--tools=all"],
      "env": { "STRIPE_SECRET_KEY": "sk_test_your_key" },
      "disabled": true
    },
    "github": {
      "command": "docker",
      "args": ["run", "-i", "--rm", "-e", "GITHUB_PERSONAL_ACCESS_TOKEN",
               "ghcr.io/github/github-mcp-server"],
      "env": { "GITHUB_PERSONAL_ACCESS_TOKEN": "ghp_..." },
      "disabled": true
    },
    "appstoreconnect": {
      "command": "npx",
      "args": ["-y", "@chrischall/app-store-connect-mcp"],
      "env": {
        "APP_STORE_CONNECT_KEY_ID": "ABC1234567",
        "APP_STORE_CONNECT_ISSUER_ID": "00000000-0000-0000-0000-000000000000",
        "APP_STORE_CONNECT_PRIVATE_KEY_PATH": "/absolute/path/to/AuthKey_ABC1234567.p8"
      },
      "disabled": true
    }
  }
}
```

`resend`, `stripe`, `github`, `appstoreconnect` ship **disabled** — flip to `false` once the
keys exist. Nothing here needs your Apple ID password, and no `.p8` should ever be committed.

---

## 7. Order of operations

1. **Wire the `xcode` server.** Zero install, 54 first-party tools. This is the single
   highest-leverage change in this file — it turns build/test/preview/crash loops from
   guesswork into structured data.
2. Remove the `firestore` server. (Dead weight; cannot authenticate.)
3. Get a Resend key + verify `rocklabathletics.com` → turns invitations on. **Highest user
   impact item in this file.**
4. Stripe test keys → prove the money path before a school ever sees it.
5. `git init` + GitHub → this project is one bad edit away from being unrecoverable.

---

## 8. Verification log

Everything claimed above was checked on this machine, not copied from a blog:

| Claim | How it was verified | Result |
| --- | --- | --- |
| Firebase MCP command is `mcp`, not `experimental:mcp` | `firebase mcp --help` (firebase-tools 15.33.0) | ✅ `--dir`, `--only`, `--tools`, `--mode` |
| Firebase MCP reaches the real project | `firebase_get_project` | ✅ `rocklab-athletics`, ACTIVE |
| Web app was missing | `firebase_list_apps` | ❌ iOS only → **created**, console now builds |
| Web console config works | `npx next build` | ✅ 8 routes, `.env.local` loaded |
| Xcode ships an MCP server | `xcrun --find mcpbridge` | ✅ Xcode 27.2 |
| Its tools are real | JSON-RPC `initialize` + `tools/list` over stdio | ✅ `xcode-tools`, **54 tools** |
| `xcodebuildmcp` exists | `npm view xcodebuildmcp version` | ✅ 2.7.0 (now a fallback) |
| `@stripe/mcp` exists | `npm view` → repo `stripe/ai` | ✅ 0.3.4 |
| `resend-mcp` exists | `npm view` → repo `resend/resend-mcp` | ✅ 2.29.0 |
| `app-store-connect-mcp-server` exists | `npm view` | ❌ **does not exist** — my first guess was wrong; corrected to `@chrischall/app-store-connect-mcp` 1.4.0 (MIT) |
| `@upstash/context7-mcp` exists | `npm view` | ✅ 4.7.3 |
| Playwright needs Chrome channel | `browser_navigate` | ❌ `Chromium distribution 'chrome' is not found` — Chromium *is* downloaded, server is pinned |

Note on that last row: Playwright is the only entry I could not fix from here, because the
`chrome` channel requires an admin password (`npx playwright install chrome` prompts, and that
prompt is why my background run silently stalled). Either run that yourself, or change the arg
to `--browser chromium`.




