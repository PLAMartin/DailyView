# Daily View: Interactive “Try the demo” — Technical Design Specification

**Repository:** `https://github.com/PLAMartin/DailyView`  
**Primary route:** `/try-demo/`  
**Version:** 1.0  
**Status:** Ready for implementation  
**Date:** 4 July 2026  

## 1. AI coding agent brief

Implement the interactive **Try demo** experience described below in the existing `PLAMartin/DailyView` repository.

Before coding:

1. Read `CLAUDE.md`.
2. Inspect the existing `index.html` and `/assets` directory.
3. Use the supplied visual reference **Daily View website Try Demo v1.png** as the primary layout and visual reference for the new page.
4. Preserve the existing static-site approach: **plain HTML, CSS and JavaScript only**. Do not add React, Next.js, TypeScript, Tailwind, npm packages, a build step, or a back end.
5. Reuse current logo, time-of-day icons, colours, typography and existing imagery where appropriate.

The result must be production-quality static front-end code that can be deployed on Vercel with the existing repository.

---

## 2. Context

Daily View is a calm, simple display that helps people see what is happening today: the date, time, time of day, today’s events and what happens next.

The website’s main visitors are likely to be family members, carers and care organisations. The person supported by Daily View may be an older adult or somebody who benefits from clear, reassuring daily information.

The interactive demo should communicate the product’s central value in under one minute:

> A trusted family member or carer makes a small change to the day’s plan, and the Daily View screen immediately shows clear, reassuring information for the person at home.

This must feel like a small product experience, not a slideshow, promotional video, account dashboard or form.

---

## 3. Objectives

### 3.1 Required outcomes

A visitor must be able to:

- Open `/try-demo/` without an account, email address, card details or form.
- Choose one of three use-case scenarios.
- Edit a sample event name and time.
- Click **Update display**.
- See the viewer display update with a subtle, accessible visual acknowledgement.
- See the **NEXT** item automatically recalculate after an update.
- Switch the simulated time of day.
- Reset the current scenario to its original sample data.
- See a clear invitation to **Apply for free trial** after the first successful update.
- Use the page on desktop, tablet and mobile.
- Complete core tasks with keyboard-only navigation.

### 3.2 Explicit non-goals

Do **not** implement any of the following in this task:

- Customer accounts, login, password reset or authentication.
- Supabase integration, database writes, Edge Functions, emails or analytics APIs.
- `localStorage`, `sessionStorage`, IndexedDB, cookies or URL parameters.
- A live clock, live date or external data.
- Real-time device syncing.
- Event creation, deletion, recurring events, reminders, permissions or invitations.
- Payments, checkout, subscriptions, or pilot qualification logic.
- A new stand-alone pilot application form.
- Full implementations of Pricing, Help, Features, Who it’s for or Login pages.

All state should exist only in memory and reset when the page is refreshed.

---

## 4. Existing repository constraints

The repository is a deliberately lightweight public marketing site. Follow these constraints:

- Use only **semantic HTML, vanilla CSS and vanilla JavaScript**.
- Do not introduce a framework or package manager.
- Reuse assets from `/assets` before adding anything new.
- Do not use external stock images, icon libraries or embeds.
- Preserve the current landing-page structure unless this specification explicitly requires a change.
- Do not change existing waitlist form behaviour.
- Do not make network requests from the demo.
- Do not use `innerHTML` with values typed by the visitor. Use `textContent` or safe DOM construction.
- Keep sample data in a single JavaScript configuration object rather than scattering it in page markup.
- Do not refactor unrelated sections of `index.html`.

---

## 5. Files and routes

### 5.1 New files

Create a static route that Vercel will serve without configuration:

```text
/try-demo/
  index.html
  try-demo.css
  try-demo.js
```

Use relative paths to existing repository assets, for example:

```text
../assets/...
```

### 5.2 Existing files to update

Update `index.html` only where required to:

1. Point the existing **Try Demo** navigation item to `/try-demo/`.
2. Add a prominent homepage CTA labelled **Try the interactive demo** that links to `/try-demo/`.
3. Add stable homepage section IDs where missing:
   - `how-it-works`
   - `who-its-for`
   - `features`
4. Update desktop and mobile navigation as specified in section 6.

Do not alter the underlying waitlist submission workflow.

---

## 6. Navigation update

The public navigation should make the two primary paths obvious:

- **I am curious** → Try the interactive demo.
- **I think this could help** → Join the waitlist

### 6.1 Desktop header

Use this navigation order:

```text
[Daily View logo]  How it works  Who it’s for  Features
                                      [Try demo]
```

### 6.2 Link destinations

| Label | Destination | Implementation |
|---|---|---|
| Daily View logo | `/` | Return to homepage |
| How it works | `/#how-it-works` | Existing homepage section |
| Who it’s for | `/#who-its-for` | Existing homepage section |
| Features | `/#features` | Existing homepage section or the closest existing product-feature section |
| Try demo | `/try-demo/` | Secondary/outlined button |

### 6.3 Items not in primary navigation yet

Do not include **Pricing**, **Help**, or **Log in** in the new primary navigation for this implementation.

They can be added when the respective pages or user-account functionality are live.

### 6.4 Mobile navigation

The mobile menu should list actions first:

```text
Try demo
How it works
Who it’s for
Features
```

The **Apply for a free pilot** action should be visually primary.

---

## 7. Try the demo page: content and layout

### 7.1 Page title and introduction

At the top of `/try-demo/`, show:

```text
Try Daily View for yourself
Make a change to today’s plan and see how it appears on the Daily View screen.

No account, card or personal details needed.
```

Use a clear page `<h1>`. Keep the reassurance text visible and brief.

### 7.2 Main interaction area

On desktop/tablet landscape, show two adjacent panels:

```text
┌──────────────────────────────────────────────────────────────────────┐
│ Try Daily View for yourself                                           │
│ Make a change and see the screen update instantly.                    │
│                                                                        │
│ [Scenario tabs]                                                       │
│                                                                        │
│  DAILY VIEW DISPLAY                      UPDATE TODAY                 │
│  ┌────────────────────────┐            ┌──────────────────────────┐  │
│  │ Daily View             │            │ Update today              │  │
│  │ Afternoon icon          │            │                          │  │
│  │ Thursday, 11 June 2026 │            │ Event [Carer visit      ]│  │
│  │ 14:05                  │            │ Time  [16:00            ]│  │
│  │                        │            │                          │  │
│  │ TODAY                  │            │ [Update display]         │  │
│  │ Lunch with Tim  12:00  │            │                          │  │
│  │ Carer visit     16:00  │            │ Changes appear on the    │  │
│  │ Clare visiting  17:00  │            │ display straight away.   │  │
│  │                        │            └──────────────────────────┘  │
│  │ NEXT                   │                                           │
│  │ Carer visit · 16:00    │                                           │
│  └────────────────────────┘                                           │
└──────────────────────────────────────────────────────────────────────┘
```

On screens below approximately 900px wide, stack the viewer first and editor second. Do not reduce the Daily View display typography below a readable size. The demo must remain usable at 320px viewport width.

### 7.3 Visual style

Match the existing Daily View marketing-site design:

- **Font:** Source Sans Pro.
- **Primary colour:** navy, approximately `#1a2b6d`.
- **Accent:** current gold/amber time-of-day icon treatment.
- **Panels:** white and soft blue/lavender backgrounds.
- **Corners:** gentle rounded corners.
- **Spacing:** generous; do not create a dense app-dashboard feel.
- **Tone:** calm, reassuring and uncluttered.

The viewer display should be a convincingly realistic Daily View screen. It should be visually larger and more prominent than the editing panel.

Use the existing time-of-day icons in `/assets` rather than creating new ones.

---

## 8. Demo scenarios and seed data

The demo must include three scenario buttons/tabs. These must be real buttons, not plain text links.

### 8.1 Scenario labels

```text
Family home
Care home resident
Supported living
```

### 8.2 Seed data

Define all scenario data in one object near the top of `try-demo.js`. Use this data exactly unless a visual fit requires a minor text shortening.

```js
const DEMO_SCENARIOS = {
  family: {
    label: 'Family home',
    day: 'THURSDAY',
    date: '11 JUNE 2026',
    time: '14:05',
    period: 'Afternoon',
    editableEventId: 'carer-visit',
    events: [
      { id: 'lunch', title: 'Lunch with Tim', time: '12:00' },
      { id: 'carer-visit', title: 'Carer visit', time: '16:00' },
      { id: 'clare', title: 'Clare visiting', time: '17:00' }
    ]
  },

  careHome: {
    label: 'Care home resident',
    day: 'THURSDAY',
    date: '11 JUNE 2026',
    time: '10:30',
    period: 'Morning',
    editableEventId: 'family-call',
    events: [
      { id: 'breakfast', title: 'Breakfast', time: '08:30' },
      { id: 'exercise', title: 'Exercise class', time: '11:00' },
      { id: 'family-call', title: 'Family call', time: '15:30' }
    ]
  },

  supportedLiving: {
    label: 'Supported living',
    day: 'THURSDAY',
    date: '11 JUNE 2026',
    time: '15:15',
    period: 'Afternoon',
    editableEventId: 'support-visit',
    events: [
      { id: 'medication', title: 'Medication reminder', time: '09:00' },
      { id: 'support-visit', title: 'Support visit', time: '16:00' },
      { id: 'meal', title: 'Evening meal', time: '18:00' }
    ]
  }
};
```

### 8.3 Important data rules

- Each scenario contains exactly three items.
- Each scenario has one editable item.
- The editable item pre-populates the editor on scenario change.
- Events must sort in ascending time order when rendered.
- Sample dates and times are simulated, not live.
- Do not add events beyond these three in version 1.

---

## 9. Functional behaviour

### 9.1 Initial page state

When `/try-demo/` first loads:

1. Select **Family home**.
2. Render the viewer using its seed data.
3. Pre-fill the editor with:
   - Event: `Carer visit`
   - Time: `16:00`
4. Keep the post-update success/pilot prompt hidden.
5. Do not persist any state between page reloads.

### 9.2 Event editor

Use a `<form>` with:

| Field | HTML control | Requirement |
|---|---|---|
| Event | `<input type="text">` | Required; max length 40 characters |
| Time | `<input type="time">` | Required |
| Submit | `<button type="submit">` | Label: **Update display** |

Supporting copy beneath the button:

```text
Changes appear on the display straight away.
```

Form requirements:

- Do not submit to a server.
- Call `event.preventDefault()`.
- Trim title whitespace before updating.
- Show an inline validation message if title is blank or time is missing.
- Keep focus in the field with the validation error.
- Use visible `<label>` elements; placeholders are not labels.

### 9.3 Update display action

When the visitor submits valid changes:

1. Update only the scenario’s editable item in in-memory state.
2. Re-sort events by time.
3. Re-render the viewer.
4. Recalculate the NEXT item using the rules in section 10.
5. Add a subtle visual update effect to the changed row and/or NEXT panel:
   - CSS-only fade/outline/highlight animation.
   - No flashing, rapid movement or sound.
   - Respect `prefers-reduced-motion`.
6. Announce success through an `aria-live="polite"` region:
   ```text
   Display updated. Carer visit is now at 16:30.
   ```
   Use the actual edited title and time.
7. Reveal the post-update section in section 12.
8. Move keyboard focus to the short success confirmation heading or leave focus on the update button; do not unexpectedly move focus into the page footer.

### 9.4 Scenario switching

When a visitor selects a scenario:

1. Replace the current in-memory state with a fresh deep copy of that scenario’s seed data.
2. Update the selected-tab styling and `aria-pressed` state.
3. Render the matching display and pre-fill the editor with that scenario’s editable event.
4. Hide the post-update prompt.
5. Update the intro/assistive text where appropriate, for example:
   ```text
   You are exploring the Care home resident example.
   ```
6. Do not show a confirmation dialog.

### 9.5 Time-of-day controls

Below the scenario selector, show a compact control labelled:

```text
View at:
[Morning] [Afternoon] [Evening] [Night]
```

Requirements:

- Buttons change the simulated viewer time and matching existing time-of-day icon.
- The buttons do **not** change event times.
- Use this fixed mapping:

| Period | Display time | Icon source |
|---|---:|---|
| Morning | `10:30` | existing Morning icon |
| Afternoon | `14:05` | existing Afternoon icon |
| Evening | `18:15` | existing Evening icon |
| Night | `22:00` | existing Evening icon |

- Set `aria-pressed="true"` for the selected option.
- Recalculate the NEXT item after a period change.
- Do not include Night in this first version.

### 9.6 Reset action

Provide a secondary button below the editor:

```text
Reset example
```

When selected:

1. Reset the active scenario to an untouched copy of its seed data.
2. Return the time-of-day selection to the scenario’s original `period` and `time`.
3. Restore editor values.
4. Hide the post-update prompt.
5. Announce:
   ```text
   Example reset.
   ```

---

## 10. Viewer display rules

### 10.1 Viewer content

The viewer must show:

1. Daily View wordmark/logo.
2. Current simulated period and corresponding icon.
3. Day.
4. Date.
5. Simulated time.
6. `TODAY` heading.
7. Exactly three events, sorted by time.
8. `NEXT` heading and one highlighted item.

### 10.2 Time comparison helper

Implement a small helper to convert a 24-hour time string into minutes since midnight.

```js
function timeToMinutes(timeString) {
  const [hours, minutes] = timeString.split(':').map(Number);
  return (hours * 60) + minutes;
}
```

### 10.3 Past events

An event is past when:

```text
event time < simulated current time
```

Past events must:

- Remain visible.
- Use subdued/grey styling.
- Have no strikethrough.
- Continue to be legible with sufficient contrast.

### 10.4 NEXT item selection

Use this algorithm:

1. Sort events by time ascending.
2. Find the first event whose time is greater than or equal to simulated current time.
3. If found, show it as NEXT.
4. If no future or current event exists:
   - Show `Nothing else planned today` in the NEXT panel.
   - Do not fabricate a next event.

Example:

- Simulated time: `14:05`
- Events: `12:00`, `16:00`, `17:00`
- NEXT: `Carer visit · 16:00`

### 10.5 Time formatting

- Display event times as supplied in 24-hour `HH:MM` format.
- Do not use 12-hour time in version 1.
- Add period labels in text and icon form.

---

## 11. Recommended DOM structure

The exact classes may differ, but preserve this semantic structure:

```html
<main>
  <section class="demo-hero" aria-labelledby="demo-title">
    <h1 id="demo-title">Try Daily View for yourself</h1>
    <p>Make a change to today’s plan and see how it appears on the Daily View screen.</p>
    <p class="reassurance">No account, card or personal details needed.</p>
  </section>

  <section class="demo-workspace" aria-label="Interactive Daily View demonstration">
    <div class="demo-controls">
      <div class="control-group" aria-labelledby="scenario-label">
        <p id="scenario-label">Choose an example</p>
        <div role="group" aria-label="Demo scenarios">
          <!-- scenario buttons -->
        </div>
      </div>

      <div class="control-group" aria-labelledby="period-label">
        <p id="period-label">View at</p>
        <div role="group" aria-label="Time of day">
          <!-- period buttons -->
        </div>
      </div>
    </div>

    <div class="demo-panels">
      <section class="viewer-panel" aria-labelledby="viewer-title">
        <h2 id="viewer-title" class="visually-hidden">Daily View display</h2>
        <!-- rendered Daily View screen -->
      </section>

      <section class="editor-panel" aria-labelledby="editor-title">
        <h2 id="editor-title">Update today</h2>
        <form id="demo-event-form" novalidate>
          <!-- labels, fields, validation messages, submit button -->
        </form>
        <button type="button" id="reset-demo">Reset example</button>
      </section>
    </div>

    <p id="demo-status" class="visually-hidden" aria-live="polite"></p>
  </section>

  <section id="demo-after-update" hidden aria-labelledby="after-update-title">
    <h2 id="after-update-title">Updated</h2>
    <p>A trusted person keeps the day up to date. The person at home has one clear place to look.</p>
    <a href="#demo-workspace">Try another example</a>
    <a href="/#register-interest">Apply for a free pilot</a>
  </section>
</main>
```

---

## 12. Post-update message and calls to action

After the first valid update, reveal a section directly below the workspace.

### Required copy

```text
Updated

A trusted person keeps the day up to date.
The person at home has one clear, reassuring place to look.

Could this make someone’s day clearer?
```

### Required actions

| Action | Destination | Style |
|---|---|---|
| Try another example | `#demo-workspace` | Secondary/outline |
| Apply for a free trial | `/#register-interest` | Primary/filled |

The primary CTA must use the label **Apply for a free trial**. Do not use **Start free trial** in this implementation.

The “Try another example” action should scroll to the demo workspace and return focus to the scenario selector when activated with a keyboard. It must not reset the scenario automatically.

---

## 13. Accessibility requirements

This site is aimed at an audience that benefits from clarity. Accessibility is a core acceptance criterion.

### Required

- Logical heading structure: one `<h1>`, then nested `<h2>` headings.
- All inputs have visible, programmatically associated labels.
- No information is communicated by colour alone.
- Buttons meet a minimum 44 × 44 CSS pixel target where practical.
- Keyboard focus is visible and has strong contrast.
- Scenario and time-of-day buttons use `aria-pressed`.
- A polite live region announces successful update/reset status.
- Error messages are text-based, associated with their controls, and announced.
- `prefers-reduced-motion: reduce` removes or greatly reduces update animations and smooth scrolling.
- Use semantic buttons for controls and anchors for navigation.
- Maintain sufficient contrast for greyed-out past events.
- Do not auto-focus on page load.
- Do not autoplay audio or video.
- Ensure the screen reader reading order matches the visual workflow: scenario controls → viewer → editor → post-update CTA.

---

## 14. Responsive requirements

### Desktop: 1024px and above

- Header follows the new desktop navigation.
- Viewer and editor appear side by side.
- Viewer should occupy roughly 55–60% of available workspace width.
- Editor should occupy roughly 40–45%.
- Keep the display comfortably large.

### Tablet: 700px–1023px

- Use two columns where there is sufficient width.
- Stack panels where content becomes cramped.
- Keep action buttons easily tappable.

### Mobile: below 700px

- Stack in this order:
  1. Header
  2. Page introduction
  3. Scenario selector
  4. Time-of-day selector
  5. Daily View display
  6. Editor
  7. Post-update CTA
  8. Footer
- Do not require horizontal scrolling.
- Scenario and period controls may wrap onto multiple rows.
- Buttons should remain full-width or near full-width where that improves clarity.
- Maintain a minimum readable display font size; do not shrink the viewer into a tiny decorative mockup.

---

## 15. Animations and interaction polish

Use restrained, calm motion only.

### Allowed

- A 150–250ms soft fade or outline highlight for the updated event row.
- A gentle background change for the NEXT panel.
- Standard button hover/focus transitions.
- Smooth scrolling only when motion preferences permit it.

### Not allowed

- Flashing, bouncing or pulsing elements.
- Confetti.
- Modal popups.
- Audio.
- Countdown timers.
- Carousels.
- Automatic scene changes.

---

## 16. Quality and security requirements

- No user data leaves the browser.
- Do not store data locally.
- Escape or safely render user-entered event titles using `textContent`.
- Title input max length: 40 characters.
- Use `autocomplete="off"` for the simulated event title if browser suggestion UI is distracting.
- Do not include secret keys, Supabase URLs, tracking IDs or API calls.
- Ensure that `Update display` does not cause a page refresh.
- Ensure that all paths work when deployed at `https://www.dailyview.org/try-demo/`.
- Check relative links from `/try-demo/` to root and assets.

---

## 17. Acceptance criteria

The implementation is complete only when all of the following are true:

### Functionality

- [ ] `/try-demo/` loads as a standalone static route.
- [ ] No sign-up, account, card or personal-data collection is required.
- [ ] Family home is the initial scenario.
- [ ] All three scenario controls work.
- [ ] All three period controls work.
- [ ] The editor updates the currently configured editable event.
- [ ] Input validation prevents blank titles and missing times.
- [ ] The display updates without page reload.
- [ ] Events sort chronologically.
- [ ] Past events are visibly subdued but still readable.
- [ ] NEXT updates according to the current simulated time.
- [ ] The “nothing else planned today” state works.
- [ ] Reset restores original state for the active scenario.
- [ ] Post-update message appears after the first valid change.
- [ ] “Apply for a free pilot” goes to `/#register-interest`.
- [ ] “Try another example” returns to the workspace without reset.

### Design

- [ ] Uses existing Daily View brand system and assets.
- [ ] Follows the supplied Try Demo mockup’s visual hierarchy.
- [ ] Viewer is more visually prominent than editor.
- [ ] Layout is calm, spacious and not dashboard-like.
- [ ] Desktop, tablet and mobile layouts work without horizontal scrolling.

### Accessibility

- [ ] Keyboard-only journey works.
- [ ] Focus styles are visible.
- [ ] Labels, error messages and live-region updates work.
- [ ] Reduced-motion preference is respected.
- [ ] No critical information depends only on colour.

### Regression protection

- [ ] Homepage still loads.
- [ ] Existing waitlist UI remains intact.
- [ ] Existing legal links remain intact.
- [ ] No console errors.
- [ ] No network errors caused by the new demo.
- [ ] No third-party package, framework or build step was added.

---

## 18. Manual test plan

Perform these checks before returning the work:

1. Load `/try-demo/` in a new browser session.
2. Confirm the default screen is Family home at 14:05.
3. Change `Carer visit` to `Care visit` and `16:30`; select **Update display**.
4. Confirm:
   - TODAY shows `Care visit` at `16:30`.
   - NEXT shows `Care visit · 16:30`.
   - The update confirmation is visible.
5. Switch to Morning and confirm:
   - The Morning icon displays.
   - Time changes to `10:30`.
   - NEXT recalculates.
6. Switch to Care home resident; confirm the editor now selects Family call.
7. Enter blank Event value and submit; confirm accessible inline validation.
8. Select Reset example; confirm original content returns.
9. Use Tab, Shift+Tab, Enter and Space to complete the full interaction without a mouse.
10. Test at 1440px, 1024px, 768px, 390px and 320px widths.
11. Test with `prefers-reduced-motion: reduce`.
12. Refresh and confirm all demo changes are cleared.
13. Check the homepage:
    - Try the demo link reaches `/try-demo/`.
    - Apply for a free pilot reaches `/#register-interest`.
    - Existing waitlist flow still works as it did before.

---

## 19. Deliverables

Return:

1. New `/try-demo/index.html`.
2. New `/try-demo/try-demo.css`.
3. New `/try-demo/try-demo.js`.
4. Updated `index.html` navigation and CTA links.
5. A concise implementation summary listing:
   - files changed;
   - manual tests completed;
   - any asset reused from `/assets`;
   - any deliberate minor variation from the supplied mockup.

Do not add dependencies. Do not create placeholder pages for functionality that is out of scope.

