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

`landing/assets/` needs the real artwork. See `landing/assets/README.txt`:

- `rocklab-technologies.png` — the full pink/blue "R" lockup (header renders at 52px tall)
- `favicon.svg` — already present, a gradient "R" tile

Until the PNG is added, `index.html` hides the broken image and shows a gradient
"R" tile with the wordmark, so the page never looks broken.

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
