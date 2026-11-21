# Company landing page (rocklabtechnologies.com)

The company site is a separate Firebase Hosting **site** in the same project as
the app, so the marketing page and the AD console deploy independently and can
live on different domains.

| What | Where it lives | URL |
| --- | --- | --- |
| Marketing / landing page | `landing/` → site `rocklab-technologies` | https://rocklab-technologies.web.app |
| AD console (the app) | `web/out` → site `rocklab-athletics` | https://rocklab-athletics.web.app |

`firebase.json` declares both as hosting targets; `.firebaserc` maps
`landing` → `rocklab-technologies` and `app` → `rocklab-athletics`.

```bash
firebase deploy --only hosting:landing   # company site only
firebase deploy --only hosting:app       # the app only
firebase deploy --only hosting           # both
```

The landing page is one static `index.html` with inline CSS — no build step, so it
cannot break because of a dependency. It advertises both products:

- **RockLab Athletics** → https://rocklab-athletics.web.app
- **VolleyEngine Pro** → https://www.volleyenginepro.com

The app's sign-in page links back to the company site, so the two are bidirectional.

## Brand assets

`landing/assets/` now holds real artwork:

| File | Source | Used for |
| --- | --- | --- |
| `rocklab-technologies.jpg` | your lockup, cropped to the art and resized to 620px | header logo |
| `hero-athletics.jpg` | "Rocklab Athletics Stadium Branding" (left panel, 1200px, 82% JPEG) | hero image |
| `rocklab-athletics-logo.png` | "Rocklab Athletics Mountain Logo" | RockLab Athletics product card |
| `rocklab-athletics-icon.png` | "RockLab Athletics Neon App Icon" (180px) | spare app-icon asset, not yet placed |
| `volleyengine-logo.png` | volleyenginepro.com/images/logo.png | VolleyEngine Pro product card |
| `og-image.jpg` | 1200x630 crop of the lockup art | social/link previews |
| `favicon.svg` | gradient "R" tile | browser tab icon |

The originals live in `~/Downloads` and `RockLabAthletics/Assets.xcassets/landing/`;
only web-sized copies are committed, which is 2.1MB down to 100KB for the logo and
2.2MB to 363KB for the hero.

Two crops were necessary rather than optional:

- **The logo.** The source is 1536x1024 and mostly neon background. Dropped into a
  54px-tall header unchanged it reads as a small dark rectangle. Cropping tight to
  R + ROCKLAB + TECHNOLOGIES LLC + tagline gives a ~1.95:1 lockup that fills the
  space.
- **The hero.** The stadium branding file is a composite with a white product-shot
  panel on the right third. Only the left panel is used; otherwise a white block
  would have sat in the middle of a dark page.

> Note: `RockLabAthletics/Assets.xcassets/landing/rocklab-technologies.PNG` is still
> inside the iOS asset catalog. It is not a valid asset set (no `Contents.json`), so
> it adds ~2.1MB to the app bundle without being usable in SwiftUI. The build
> succeeds, but it should be deleted from the catalog now that the web copy exists.


## Custom domain status

| Domain | State | Serving |
| --- | --- | --- |
| `www.rocklabtechnologies.com` | **HOST_ACTIVE** (cert propagating) | the new landing page |
| `rocklabtechnologies.com` (apex) | **HOST_MISMATCH** | still the old WordPress host |

Only `www` was repointed. Typing `rocklabtechnologies.com` without `www` still
lands on the old empty WordPress install — which is why the site can look
"unchanged" even though it is not.

### To finish the apex

At the registrar, for `rocklabtechnologies.com`:

| Type | Name | Value |
| --- | --- | --- |
| A | `@` | `199.36.158.100` |
| TXT | `@` | `hosting-site=rocklab-technologies` |

Keep the existing `v=spf1 ...` TXT untouched or email breaks. The apex is already
attached to the Firebase site, so it starts serving as soon as the A record
resolves.

Alternatively, most registrars offer domain forwarding — set the apex to forward
to `https://www.rocklabtechnologies.com` and skip the A record entirely. Forwarding
means an extra redirect hop; the A record is the cleaner option.


## Custom domain — read before changing DNS

`www.rocklabtechnologies.com` and `rocklabtechnologies.com` have been attached to
the `rocklab-technologies` site; both are waiting on DNS.

> **The domain is currently in use.** It serves a WordPress site
> (`66.223.49.89`, openresty) and receives email through
> `mailserver.businessidentity.llc`. Moving the A/CNAME records to Firebase
> **replaces that WordPress site**. Email keeps working because MX and SPF are
> untouched — do not delete the SPF record.

### Option A — replace the WordPress site (what was asked for)

At the registrar for `rocklabtechnologies.com`:

| Type | Name | Value | Action |
| --- | --- | --- | --- |
| CNAME | `www` | `rocklab-technologies.web.app` | add, replacing the existing A record |
| A | `@` | `199.36.158.100` | add, replacing the existing A record |
| TXT | `@` | `hosting-site=rocklab-technologies` | add |
| TXT | `@` | `v=spf1 a mx include:spf.postal.businessidentity.llc ~all` | **keep as-is** |

Firebase then issues the TLS certificate automatically. The ACME challenge records
(`_acme-challenge.www` / `_acme-challenge`) only need adding if certificate
validation stalls. A `HTTPS` check of the domain should return `200` and the
RockLab Technologies title within about an hour of propagation.

### Option B — keep the WordPress site

Leave DNS alone and point the landing page at a subdomain instead, e.g.
`apps.rocklabtechnologies.com` → CNAME `rocklab-technologies.web.app`. That is a
single record, no downtime, and the WordPress site keeps its traffic. Ask and it
can be attached to the site in one command.

**Verify either way:**

```bash
dig +short www.rocklabtechnologies.com     # expect rocklab-technologies.web.app
dig +short TXT rocklabtechnologies.com     # expect hosting-site=rocklab-technologies
curl -sI https://www.rocklabtechnologies.com | head -1
```

## Gaps

- **No contact form.** The footer uses a `mailto:` link; a form needs a function
  and spam handling before it is worth adding.
- **No analytics**, so there is no evidence yet about which app link gets used.
- **No per-product pages** — both products share one page with anchor cards.
  VolleyEngine Pro will eventually want its own section.
- The WordPress site's existing content has not been migrated anywhere.
