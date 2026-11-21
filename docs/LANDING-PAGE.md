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
| `hero-athletics.jpg` | "Rocklab Athletics Stadium Branding" (cropped to the banner, 1200px, 82% JPEG) | hero image on the landing page |
| `rocklab-athletics-logo.png` | "Rocklab Athletics Mountain Logo" | the RockLab Athletics product card |
| `rocklab-athletics-icon.png` | "RockLab Athletics Neon App Icon" (180px) | spare app-icon asset, not yet placed |
| `volleyengine-logo.png` | volleyenginepro.com/images/logo.png | the VolleyEngine Pro product card |
| `favicon.svg` | gradient "R" tile | browser tab icon |

Originals live in `~/Downloads`; only web-sized copies are committed. The hero was
cropped to the left banner area (the source file is a composite with a white
product-shot panel on the right) and resized to 1200px wide.

**Still missing: the RockLab Technologies LLC lockup** (the pink/blue "R" you sent).
It has to be saved by hand — an image pasted into chat cannot be written to disk.
Drop it at:

```
landing/assets/rocklab-technologies.png
```

The header already points at that exact path, so saving the file and running
`firebase deploy --only hosting:landing` is the whole job. Until then the header
falls back to a gradient "R" tile with the wordmark, which is deliberate — not a
broken image.

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
