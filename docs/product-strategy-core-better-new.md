# Daily View Product Strategy — Core / Better / New

Status: draft for review
Framework: Core (validated, protect it) / Better (the primary engine to invest in) / New (one isolated, measured bet)

---

## 1. Framing

Three directives, mapped to a Core/Better/New allocation:

- **Core — Display UI.** Lock the viewer screen to validated, high-contrast "day clock" patterns. No experimental layouts, no per-user theming. The display's job is to be boring and trustworthy every single time someone glances at it.
- **Better — Caregiver remote management.** This is the primary lever for making Daily View meaningfully better than a paper calendar or a shared note: caregivers can update schedules, confirm visits, and post reassurance messages, and it shows up on the screen. This gets the majority of engineering investment.
- **New — Relative human time.** One isolated, deliberately scoped bet: phrasing that treats time the way a person would ("Sarah is visiting in 45 minutes") instead of clock arithmetic. Kept small (~20% of scope) and judged by whether it reduces repetitive questioning, not by how novel it is.

The rest of this document grounds each directive in what's actually built today (as of 2026-07-27) and lays out concrete workstreams.

---

## 2. Current-state snapshot

### Core — Display UI
Already close to the target state. `display/` renders a fixed CSS grid, full-bleed, no scrolling, Source Sans Pro throughout, navy-on-white with one accent color, large type (clock/day `3.2rem`, NEXT card `2.2rem`), and past events de-emphasized by opacity — never by color alone (`display/display.css`, `display/dv-viewer-render.js`).

**Tension**: `dashboard/settings.js` already exposes a caregiver-facing "Display settings" panel — font size, contrast, layout — that writes to `preferences.fontSize` / `preferences.contrast` / `preferences.layout`. The viewer (`display/display.js`) only ever reads `preferences.timeFormat`; the other three fields are dead on arrival. So the schema and UI for customization already exist even though this directive says to avoid it. This needs a decision, not silence.

### Better — Caregiver app
Fully built and coherent for its current scope:
- Calendar/event CRUD with day/week/agenda views and a cancel-vs-delete distinction (`dashboard/calendar.js`, `dashboard/event-dialog.js`)
- Scheduled, prioritized display messages (`dashboard/messages.js`, backed by the `dv_display_message` table)
- Device pairing with QR codes, heartbeat status, remote refresh (`dashboard/devices.js`)
- People/access management with role presets (`dashboard/people.js`)
- Account + display settings (`dashboard/settings.js`)

**Biggest concrete gap**: no real-time sync exists anywhere. Dashboard and viewer each poll independently on a 60-second interval (`dashboard/today.js`, `dashboard/devices.js`, `display/display.js`). A caregiver's edit can take up to a minute to reach the screen. There is no Supabase Realtime / `postgres_changes` subscription in the codebase.

**Named gaps** (not partial builds — genuinely absent):
- Subscription/billing UI — explicit placeholder ("managed by Daily View support")
- Invite acceptance (invitee side) — deferred per migration comment
- "Visit confirmation" — does not exist in any form. `people.js` invites are account-access grants, not a notify-list or attendance-tracking concept.

### New — Relative time engine
Substantially already shipped for date/time framing. `formatCountdown()` in `display/dv-viewer-render.js` produces calm, rounded phrasing ("in 7 minutes" / "in about 45 minutes" / "in about 2 hours"), computed server-side (`supabase/migrations/20260726190000_dv_next_event_countdown.sql`) and ticked client-side every second between polls so it stays accurate without re-fetching.

**What's actually missing**: the person-linked version implied by "Sarah is visiting." Events today are free text with keyword-based category icons (medical/hair/meal/home/people) — there is no relationship between an event and a named contact. Delivering the literal example requires a new event↔person link, not just phrasing changes.

**Measurement gap**: no in-app product analytics exist. The only analytics in the repo is marketing-site GA4 (`index.html`), tracking landing-page clicks like "Try the demo." "Repetitive caregiver questioning rate" is a real-world behavioral metric with no existing instrumentation path — it will need a deliberate measurement design, not a dashboard query.

---

## 3. Workstreams

### 3.1 Core — Display UI

| Action | Detail |
|---|---|
| Resolve the dead-field tension | Decide: (a) wire `fontSize`/`contrast`/`layout` into the viewer as a tightly-bounded accessibility mode (e.g. two font sizes, one high-contrast toggle — not a theme picker), or (b) remove those controls from `settings.js` entirely so the UI doesn't promise something it doesn't do. Either is defensible; leaving it as-is is not. |
| Write the locked visual spec | A short internal reference (type scale, palette, grid, spacing) that any future display/ change is checked against. Prevents scope creep one PR at a time. |
| State explicit non-goals | No per-user themes, no layout picker, no font family choice. Put this in writing so it's a conscious exception process, not a slow drift. |

**Success metric**: no new customization surface ships without an explicit written exception. Visual diff/regression check before any `display/` change merges.

### 3.2 Better — Caregiver remote management

| Action | Detail |
|---|---|
| Real-time sync (headline item) | Replace/augment the 60s polling with Supabase Realtime `postgres_changes` subscriptions on the viewer, watching the events/messages/settings tables the dashboard writes to. Dashboard write path stays as-is. |
| Preserve offline handling | `display.js`'s "Offline — showing the last update" fallback (after 5 min of failed fetches) needs to keep working alongside a realtime channel — treat realtime as an addition to the poll/cache/offline logic, not a wholesale replacement, at least for the first iteration. |
| Build "visit confirmation" | New concept, doesn't exist today. Likely shape: a confirmable flag or sub-type on an event, distinctly surfaced on both the viewer and the dashboard calendar. Needs its own small spec before implementation — don't let it get absorbed into generic messages. |

**Success metric**: caregiver-edit-to-screen latency, currently up to 60s worst case, drops to near-immediate. Instrument as a timestamp diff between dashboard write and viewer render in logs.

**Sequencing note**: do real-time sync before visit confirmations — confirmations are much less useful if they still take up to a minute to appear.

### 3.3 New — Relative human time engine

| Action | Detail |
|---|---|
| Add person-linking to events | Reuse the existing people/contacts data (`dashboard/people.js` and its backing table) rather than inventing a new one. An event optionally references a person. |
| Extend the render/countdown logic | `formatCountdown()` and the NEXT card in `dv-viewer-render.js` prefer the linked person's name when present ("Sarah is visiting in 45 minutes") and fall back to today's generic phrasing otherwise. |
| Define the measurement plan explicitly | No in-app instrumentation exists for "repetitive questioning." Phase 1 deliverable is the measurement design itself: most likely a caregiver self-report survey (before/after, "how often does [name] ask what's happening today") rather than new event logging. Only build in-app instrumentation if the team later decides the survey isn't sufficient — don't build it speculatively now. |

**Success metric for phase 1**: the survey instrument exists and has a baseline reading, not a live number on a dashboard. Treat the actual behavior-change metric as a phase 2 outcome, once the feature has been live long enough to matter.

---

## 4. Recommended sequencing

1. **Core decision** on the dead display-preference fields — cheap, unblocks nothing else, but removes an open ambiguity before more caregiver-facing settings work happens on top of it.
2. **Better: real-time sync** — foundational; every other caregiver-facing improvement (including visit confirmations and the New engine) is more valuable once the screen updates immediately.
3. **Better: visit confirmations** — new, scoped concept, built once sync is in place.
4. **New: person-linking + survey design** — smallest, most isolated piece, deliberately last so it doesn't compete for engineering time against the two workstreams with clearer, faster payoff.

---

## 5. Risks

- **Realtime migration risk**: introducing a Supabase Realtime channel touches the same code paths as the existing polling/offline-fallback logic in `display.js`. Needs careful testing of the offline path, not just the happy path.
- **Scope creep on visit confirmations**: it's a new concept with no existing analog in the schema — write a tight one-page spec before touching code, or it will absorb unrelated feature requests.
- **Measurement risk on the New engine**: "repetitive questioning rate" is a slow-moving, indirectly-observable metric. Don't gate the feature's success on a number that may take months to move and isn't directly instrumentable — treat the survey design as the real phase 1 deliverable.
