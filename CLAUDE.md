# CLAUDE.md

reference Daily View MVP website design in image "Daily View MVP webpage v5.png"

## Project Overview

This repo (`DailyView`) is the **entire public-facing Daily View
product** — not just a marketing page. Daily View is a calm, simple
day-planning display app designed for older adults, people living with
memory difficulties or mild cognitive impairment, and others who benefit
from clear, structured daily routines. Family members and carers who
remotely manage schedules are a secondary audience.

Within this one repo:

- **Marketing site** — `index.html`, `about/`, `press/`: explains the
  product and captures waitlist interest.
- **Auth flows** — `login/`, `forgot-password/`, `reset-password/`,
  `accept-invite/`, `auth/callback/`: real Supabase-backed sign-in,
  invite acceptance, and password reset.
- **Dashboard (carer-facing app)** — `dashboard/`: the live app carers/
  family use to manage events, people, devices, messages, and display
  settings for an account. Polls Supabase for real data.
- **Viewer-facing screens** — `display/` (the real, live wall-mounted
  viewer screen, pairs a device and polls Supabase), `try-demo/`
  (public unauthenticated preview), `viewer-screen-selection/`,
  `screen-setup/` (setup guide for the physical device).
- **Supabase backend** — `supabase/migrations/` (schema, RLS policies)
  and `supabase/functions/` (edge functions: `send-confirmation`,
  `send-invite-email`, `accept-invite`, `_shared`).
- **Legal** — `legal/privacy-policy.*`, `legal/terms-of-use.*`.
- **Docs/specs** — `docs/` (viewer, dashboard, login, try-demo specs
  and other planning docs).

There is no separate Next.js app — despite `README.md`'s "Technical
Stack" section listing Next.js/TypeScript/Tailwind (aspirational/legacy
text, not current), the real, live product described above is built and
deployed entirely from this plain HTML/CSS/JS repo against Supabase.

Live sample of the real viewer display: https://dailyview.vercel.app

## Tone and Audience

Everything on this site — copy, layout, interaction — should feel calm,
reassuring, and uncluttered. This applies to the marketing pages and to
the actual app surfaces (dashboard, viewer, auth flows) alike, since the
end viewer is often someone who benefits from low cognitive load. When
in doubt, favour:

- Plain language over jargon
- Generous whitespace over density
- Fewer, larger, clearer elements over many small ones
- Reassurance (e.g. "No spam. Occasional updates only.") near every
  waitlist form

## Tech Stack (this repo)

- Plain **HTML / CSS / JavaScript** — no framework, no build step
- **Supabase** — Postgres, Auth, Row Level Security, Storage, Edge
  Functions. Client-side access via the `@supabase/supabase-js` UMD
  build loaded from a CDN `<script>` tag (see `index.html` and
  `assets/js/dv-auth.js`); no bundler or npm install required to run
  the site
- Hosted on **Vercel**
- Source control: **GitHub**

Do not introduce a frontend framework (React, Next.js, etc.) into this
repo without explicit instruction — this includes the dashboard, auth,
and viewer pages, not just the marketing pages. If a future task asks
to migrate this repo to match a framework-based stack, treat it as a
deliberate, explicit decision, not a default.

Note: `index.html`'s waitlist form and `assets/js/dv-auth-config.js`
(used by the dashboard/auth/viewer pages) currently point at two
different Supabase projects. Check both before assuming a schema/config
change applies everywhere.

## File Structure

```
/assets              Images, icons, and shared JS
                      - /assets/js: dv-auth.js, dv-auth-config.js,
                        dv-dashboard-data.js, dv-viewer-data.js,
                        dv-viewer-render.js — shared Supabase client,
                        auth, and viewer-rendering logic used by the
                        real app pages (dashboard, display, try-demo)
                      - includes time-of-day icons: Morning, Afternoon,
                        Evening, Night (gold gradient sun, navy palette)
                      - includes lifestyle photography used in the design
/auth/callback        Supabase auth callback handler
/dashboard            Live carer-facing app (events, people, devices,
                      messages, settings) — polls real Supabase data
/display              Live wall-mounted viewer screen — pairs a device
                      and polls real Supabase data
/try-demo             Public, unauthenticated viewer preview
/viewer-screen-selection, /screen-setup
                      Public pages for choosing/setting up a viewer device
/login, /forgot-password, /reset-password, /accept-invite
                      Real Supabase-backed auth flows
/about, /press        Marketing/company pages
/legal                Legal content: privacy-policy.md/html,
                      terms-of-use.md/html
/docs                 Specs and planning docs (viewer, dashboard, login,
                      try-demo, screen setup)
/supabase/migrations  SQL schema + RLS migrations
/supabase/functions   Edge functions (send-confirmation,
                      send-invite-email, accept-invite, _shared)
index.html            Marketing landing page
```

Before adding any new image or icon asset, check `/assets` first — reuse
existing assets rather than generating or sourcing new ones unless explicitly
told the existing assets don't cover the need.

## Design System

- **Font:** Source Sans Pro throughout (headings and body). Loaded via
  Google Fonts unless a self-hosted approach is explicitly requested. Use
  bold/semibold weights for headlines and section headings, regular weight
  for body text.
- **Color palette:**
  - Navy (approx. `#1a2b6d`) for headings and body text
  - Gold/amber gradient for the sun and accent icons
  - Soft light-blue/lavender backgrounds for highlighted panels (e.g. the
    "NEXT" box in the mockup) and the footer CTA band
  - White background elsewhere
- **Shape language:** rounded corners on cards, buttons, and the device
  mockup frame.
- **Spacing:** generous whitespace; avoid visual clutter — this is a brand
  value, not just an aesthetic preference.
- Match exact colors/spacing to the latest approved design file when one is
  provided, rather than improvising.
- This design system applies across the whole product, not just
  `index.html` — the dashboard, auth pages, and viewer screens should
  stay visually consistent with it.

## Responsiveness and Accessibility

- The site must be fully responsive. Multi-column sections should stack
  vertically on small screens.
- Accessibility matters more than usual for this project given the
  audience: proper alt text on all images, sufficient color contrast,
  labeled form inputs, and sensible heading hierarchy.

## Marketing Landing Page Structure (`index.html`)

1. Header — logo + "Daily View" wordmark
2. Hero — headline, subhead, email capture, demo video thumbnail, and a
   device mockup showing a sample Daily View screen
3. "Pain point" section — photo + 2x2 grid of common questions the product
   answers
4. Secondary mockup + "simple daily reference" checklist
5. "How it works" — 3-step row with numbered badges and arrows
6. "Who it's for" — 4-card audience grid
7. Footer CTA band — second email capture, distinct background to set it
   apart
8. Footer — copyright, Terms/Privacy links

When asked to modify this page, preserve this overall structure unless a
new design explicitly changes it.

## Marketing Page Mockups vs. the Real Viewer

`index.html` contains **static device mockup blocks** (hero + secondary)
that visually represent the Daily View viewer screen using hardcoded
sample data — day, date, time, time-of-day icon, today's events, "NEXT"
highlighted item. These are intentionally static; they exist to sell the
product on the marketing page, not to display real data.

The **real, live version already exists** elsewhere in this repo and
should not be confused with the marketing mockups:

- `display/` — the actual wall-mounted viewer, pairs a device and polls
  Supabase for real event data
- `dashboard/today.js` — the carer dashboard's live preview of a
  viewer's screen
- `assets/js/dv-viewer-render.js` / `dv-viewer-data.js` — the shared
  rendering/data logic both of the above use

Each marketing mockup block should be kept:

- **Self-contained**, with a clear `id` or `data-` attribute (e.g.
  `id="dv-mockup-hero"`, `id="dv-mockup-secondary"`).
- **Data-separated**: sample data (day, date, time, time-of-day, event
  list, "NEXT" item) should live as a single JS object or small set of
  variables near the top of the relevant script — not scattered inline
  across the HTML.
- **Commented** with a short TODO above each block, e.g.:
  ```html
  <!-- TODO: this mockup shows static sample data for marketing purposes
       only. The real live viewer lives in /display and
       dashboard/today.js — do not wire this block up to Supabase. -->
  ```

Do not add live data or Supabase calls to the `index.html` mockups — that
functionality belongs in `display/` and `dashboard/`, which already have
it.

## Forms

### Waitlist forms (marketing pages)

`index.html` (and other marketing pages) has email capture forms — email
input, "Register Interest" button, reassurance text underneath. These
**are wired to a live Supabase backend**: submission inserts into
Supabase and invokes the `send-confirmation` edge function. Preserve
this behavior; don't strip it back to a no-op UI stub.

### App forms (dashboard, auth, display)

Forms in `dashboard/`, `login/`, `forgot-password/`, `reset-password/`,
`accept-invite/`, and `display/` are real app functionality backed by
Supabase Auth, RLS-protected tables, and edge functions. Treat these as
production code paths, not UI mockups.

## What Not To Do

- Don't introduce a frontend framework anywhere in this repo (marketing
  pages, dashboard, auth, or viewer) without being asked.
- Don't invent new visual assets when something close enough likely already
  exists in `/assets` — check first.
- Don't wire the `index.html` marketing mockups up to Supabase or live
  data — that's what `/display` and `/dashboard` are for.
- Don't strip the Supabase wiring out of the waitlist forms or app forms
  under the assumption this repo has no backend — it does.
- Don't restructure the device mockup markup/data separation on the
  marketing page — it exists so that page stays a clean, static sales
  surface.
- Don't deviate from the Source Sans Pro / navy+gold palette without an
  explicit design update.
