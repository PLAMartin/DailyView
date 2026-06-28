# CLAUDE.md

reference Daily View MVP website design in image "Daily View MVP webpage v5.png"

## Project Overview

This local file (`DailyView`) holds the **public marketing / landing page**
for Daily View — a calm, simple day-planning display app designed for older
adults, people living with memory difficulties or mild cognitive impairment,
and others who benefit from clear, structured daily routines. Family members
and carers who remotely manage schedules are a secondary audience.

This local file is **separate from the main Daily View application** (the actual
Next.js/Supabase product). This local file's job is to explain the product and
capture interest from the waitlist (which emails are provided) — it is not the app itself.

Live site which shows a sample Daily View viewer's (e.g. people with memory difficulties) screen : https://dailyview.vercel.app

## Tone and Audience

Everything on this site — copy, layout, interaction — should feel calm,
reassuring, and uncluttered. The primary audience for the *message* (even
though the *visitors* are mostly carers/family) is someone who values
simplicity and trust over flashiness. When in doubt, favour:

- Plain language over jargon
- Generous whitespace over density
- Fewer, larger, clearer elements over many small ones
- Reassurance (e.g. "No spam. Occasional updates only.") near every form

## Tech Stack (this repo)

- Plain **HTML / CSS / JavaScript** — no framework
- Hosted on **Vercel**
- Source control: **GitHub**

Do not introduce a framework (React, Next.js, etc.) into this 'DailyView' local folder without
explicit instruction. The main Daily View app uses Next.js/TypeScript/
Tailwind — this landing page intentionally does not, to stay lightweight.
If a future task asks to migrate this local folder to match that stack, treat it as
a deliberate, explicit decision, not a default.

## File Structure

```
/assets              Images and icons
                      - includes time-of-day icons: Morning, Afternoon,
                        Evening, Night (gold gradient sun, navy palette)
                      - includes lifestyle photography used in the design
/legal                Legal content, including privacy-policy.md and terms-of-use.md
index.html            Main landing page
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

## Responsiveness and Accessibility

- The site must be fully responsive. Multi-column sections should stack
  vertically on small screens.
- Accessibility matters more than usual for this project given the
  audience: proper alt text on all images, sufficient color contrast,
  labeled form inputs, and sensible heading hierarchy.

## Page Structure (current landing page)

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

When asked to modify the page, preserve this overall structure unless a new
design explicitly changes it.

## Device Mockups — Important Implementation Note

The page contains **device mockup blocks** that visually represent the real
Daily View app screen (day, date, time, time-of-day icon, today's events,
"NEXT" highlighted item). These currently use **static, hardcoded sample
data** — this is intentional for now.

Each mockup block should be kept:

- **Self-contained**, with a clear `id` or `data-` attribute (e.g.
  `id="dv-mockup-hero"`, `id="dv-mockup-secondary"`), so it can be targeted
  independently later.
- **Data-separated**: sample data (day, date, time, time-of-day, event list,
  "NEXT" item) should live as a single JS object or small set of variables
  near the top of the relevant script — not scattered inline across the
  HTML — so it can later be swapped for live system-clock values or real
  data fetched from Supabase without restructuring the markup.
- **Commented** with a short TODO above each block, e.g.:
  ```html
  <!-- TODO: this mockup currently shows static sample data. Future: wire
       this up to live date/time and real event data from Supabase. -->
  ```

Do not build the live version now (no real clock, no live fetch, no build
step) unless explicitly asked — just keep the seams clean so that work can
be done later without untangling hardcoded text.

## Forms

The page has two email capture forms (hero and footer), each with an email
input, a "Register Interest" button, and reassurance text underneath.

**Current status: UI only, no backend.** Submission handlers (if present at
all) should only prevent default page reload — no network calls, no
Supabase, no storage of any kind. This repo has no backend at this point.

## What Not to Do

- Don't introduce a frontend framework into this repo without being asked.
- Don't invent new visual assets when something close enough likely already
  exists in `/assets` — check first.
- Don't wire up forms to any backend — this repo has no backend.
- Don't restructure the device mockup markup/data separation described
  above — it exists so future live-data work is low-friction.
- Don't deviate from the Source Sans Pro / navy+gold palette without an
  explicit design update.

