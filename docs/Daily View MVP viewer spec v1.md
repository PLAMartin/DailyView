# Daily View Viewer Screen — Technical Specification

## 1. Purpose

Build the Daily View **Viewer Screen**: a dedicated, calm, read-only display for an older adult or other recipient to see what is happening today.

The viewer must work on a supplied tablet or display device, remain usable without interaction, update promptly when a family member or carer changes the schedule, and continue to show useful information during short Wi-Fi interruptions.

This feature is separate from the main Daily View dashboard.

### Core principle

The dashboard is for **editing**.

The viewer is for **viewing**.

The viewer must never feel like a complex web application. It should behave like a simple household appliance: always on, easy to read, and difficult to accidentally alter.

---

# 2. Scope

## In scope

* Full-screen viewer display route.
* Secure device pairing using a QR code and short pairing code.
* Device-specific authentication and access control.
* A simplified viewer data snapshot returned from the backend.
* Realtime viewer refresh when events, messages or display settings change.
* Local clock and automatic “Next” event selection.
* Offline support using the most recently downloaded valid snapshot.
* Basic device health tracking.
* A support/settings screen protected behind a hidden gesture or support action.
* Responsive display design, optimised for a landscape tablet, but can also be used in portrait.

## Out of scope for the first release

* Native iOS or Android applications.
* Remote mobile-device-management/kiosk software.
* Voice control.
* Video calling.
* Two-way messaging from the viewer.
* Automatic calendar integrations.
* Multiple display layouts per user beyond basic display settings.
* Complex accessibility personalisation beyond font scaling, contrast and simple display modes.

---

# 3. User roles

## Account owner

Usually the family member who first creates the Daily View account.

Can:

* create and manage devices
* pair or revoke devices
* view device health
* manage display settings
* add, edit and delete events
* add messages and reminders
* invite other carers or family members

## Editor

A family member or carer with permission to update the schedule.

Can:

* add, edit and delete events
* add or update messages
* preview the viewer screen
* view device status if permitted

Cannot:

* revoke devices
* change account ownership
* manage account-wide security settings unless explicitly granted

## Viewer device

A dedicated device associated with one Daily View account.

Can:

* read only its own viewer snapshot
* subscribe only to its own realtime refresh channel
* update its own device heartbeat and last-seen status

Cannot:

* read dashboard data directly
* access other devices
* create, edit or delete events
* access account management features
* access another account’s data

---

# 4. High-level architecture

```text
Family/carer dashboard
        │
        │ Creates or updates Daily View data
        ▼
Supabase database
        │
        ├─ dv_event
        ├─ dv_message
        ├─ dv_device
        ├─ dv_account
        ├─ dv_account_user
        └─ display configuration tables
        │
        ▼
Viewer snapshot service / RPC
        │
        ▼
Viewer PWA running on tablet
        │
        ├─ Displays current local time
        ├─ Shows TODAY events
        ├─ Highlights NEXT event
        ├─ Receives refresh signals
        └─ Displays cached snapshot offline
```

The viewer must not query multiple raw database tables directly.

Instead, it must fetch one simplified, device-specific data object called a **Viewer Snapshot**.

---

# 5. Technical approach

## 5.1 Application routes

Create the following routes.

| Route                                   | Purpose                                     | Access                  |
| --------------------------------------- | ------------------------------------------- | ----------------------- |
| `/display/setup`                        | Initial device pairing screen               | Unauthenticated         |
| `/display/[deviceId]`                   | Main full-screen viewer                     | Device-authenticated    |
| `/display/[deviceId]/support`           | Device support/settings page                | Protected hidden action |
| `/dashboard/devices`                    | Device management page                      | Account owner/editor    |
| `/dashboard/devices/[deviceId]`         | Device detail and preview page              | Account owner/editor    |
| `/dashboard/devices/[deviceId]/preview` | Preview exactly what the linked device sees | Account owner/editor    |

The display route should be installable as a Progressive Web App and should launch in standalone mode where supported.

---

# 6. Viewer screen design requirements

## 6.1 Primary screen layout

The viewer should have a fixed visual hierarchy.

```text
┌───────────────────────────────────────────────────────────────┐
│                            Daily View                         |
|                          Afternoon icon                       │
│                                                               │
│ THURSDAY                                              15:50   │
│ 11 JUNE 2026                                      AFTERNOON   │
│                                                               │
│ TODAY                              NEXT                       │
│ ✓ Lunch with Tim       12:00       Clare visiting             │
│   Carer visit          16:00       at 17:00                   │
│   Clare visiting       17:00                                  │
│                                    Optional message           │
│                                                               │
└───────────────────────────────────────────────────────────────┘
```

## 6.2 Visual requirements

* Optimised for landscape tablet orientation.
* Minimum design target: 1280 × 800 pixels.
* Must remain usable down to 1024 × 600 pixels.
* Large high-contrast text.
* Do not rely on colour alone to indicate an event is complete, current or upcoming.
* No navigation links, buttons, forms, menus or edit controls on the main viewer.
* No browser scrolling.
* No hover-only interactions.
* Use a predictable layout that does not jump when event lengths vary.
* Long event titles should wrap to two lines maximum, then truncate.
* The viewer should show no more than a configurable maximum number of events, initially five.
* Completed events should use muted styling and a visual completion marker.
* The next event should be prominent but not alarming.
* Important messages should only appear when active and should not obstruct the date, clock or next-event area.

## 6.3 Time-of-day state

Calculate the time-of-day label and icon locally using the device timezone.

Initial ranges:

| Time        | State     |
| ----------- | --------- |
| 05:00–11:59 | Morning   |
| 12:00–16:59 | Afternoon |
| 17:00–20:59 | Evening   |
| 21:00–04:59 | Night     |

The exact labels and icons should use the existing Daily View design system.

---

# 7. Database model

Use existing `dv_` tables where available.

The exact existing schema may vary, but the implementation must use or extend the following concepts.

## 7.1 Existing required entities

* `dv_account`
* `dv_user`
* `dv_account_user`
* `dv_event`
* `dv_device`
* event status and visibility tables, if already present
* display mode or device configuration tables, if already present

## 7.2 Required additions or extensions

### `dv_device`

Ensure `dv_device` contains the following fields.

| Field               | Type          | Purpose                                                      |
| ------------------- | ------------- | ------------------------------------------------------------ |
| `device_id`         | UUID / bigint | Primary key                                                  |
| `account_id`        | UUID / bigint | Owning Daily View account                                    |
| `name`              | text          | Human-readable device name, for example “Mum’s kitchen”      |
| `status`            | text          | `pending_pairing`, `active`, `revoked`, `offline`            |
| `device_token_hash` | text          | Optional secure device token hash                            |
| `auth_user_id`      | UUID          | Linked Supabase anonymous authenticated user                 |
| `timezone`          | text          | IANA timezone, for example `Europe/London`                   |
| `last_seen_at`      | timestamptz   | Most recent successful device heartbeat                      |
| `last_snapshot_at`  | timestamptz   | Most recent successful snapshot refresh                      |
| `last_ip_hash`      | text          | Optional diagnostic value; do not store raw IP unless needed |
| `paired_at`         | timestamptz   | Time device pairing completed                                |
| `revoked_at`        | timestamptz   | Time device access was revoked                               |
| `created_at`        | timestamptz   | Created timestamp                                            |
| `updated_at`        | timestamptz   | Updated timestamp                                            |

### `dv_device_pairing`

Create a new table to support temporary pairing sessions.

| Field                 | Type          | Purpose                                  |
| --------------------- | ------------- | ---------------------------------------- |
| `pairing_id`          | UUID          | Primary key                              |
| `device_id`           | UUID / bigint | Device being paired                      |
| `pairing_code`        | text          | Six-character or six-digit code          |
| `pairing_secret_hash` | text          | Secret embedded in QR URL, stored hashed |
| `expires_at`          | timestamptz   | Pairing expiry, initially 15 minutes     |
| `claimed_at`          | timestamptz   | When pairing is completed                |
| `claimed_by_user_id`  | UUID          | Dashboard user who claimed it            |
| `created_at`          | timestamptz   | Created timestamp                        |

Rules:

* Pairing codes must expire after 15 minutes.
* Pairing codes must be single use.
* Pairing code entry must be rate limited.
* Do not store the raw QR secret after creation.
* Once pairing succeeds, the pairing record must be marked as claimed and cannot be reused.

### `dv_device_heartbeat`

Create a lightweight event table for diagnostics if device history is required.

| Field           | Type          | Purpose                         |
| --------------- | ------------- | ------------------------------- |
| `heartbeat_id`  | UUID / bigint | Primary key                     |
| `device_id`     | UUID / bigint | Device sending heartbeat        |
| `reported_at`   | timestamptz   | Device timestamp                |
| `received_at`   | timestamptz   | Server timestamp                |
| `online`        | boolean       | Device reports connection state |
| `app_version`   | text          | Viewer app version              |
| `battery_level` | integer       | Optional battery percentage     |
| `charging`      | boolean       | Optional charging state         |
| `screen_width`  | integer       | Optional diagnostic value       |
| `screen_height` | integer       | Optional diagnostic value       |

For the first release, it is acceptable to update only `dv_device.last_seen_at` rather than retaining every heartbeat.

---

# 8. Viewer Snapshot contract

## 8.1 Purpose

The viewer must retrieve a single device-specific snapshot rather than raw events, messages and configuration data.

Create a secure Supabase RPC function or protected server endpoint:

```text
get_viewer_snapshot(device_id)
```

This function must verify that the authenticated device is authorised to access the requested `device_id`.

## 8.2 Required response format

```json
{
  "deviceId": "uuid",
  "accountId": "uuid",
  "timezone": "Europe/London",
  "displayName": "Mum",
  "updatedAt": "2026-07-06T18:30:00Z",
  "displaySettings": {
    "theme": "default",
    "fontScale": "large",
    "maxTodayEvents": 5,
    "showCompletedEvents": true,
    "showNextSection": true,
    "showImportantMessage": true
  },
  "today": {
    "dateIso": "2026-07-06",
    "dateLabel": "Monday, 6 July 2026",
    "events": [
      {
        "eventId": "uuid",
        "title": "Lunch with Tim",
        "startAt": "2026-07-06T12:00:00+01:00",
        "timeLabel": "12:00",
        "status": "completed",
        "isAllDay": false
      },
      {
        "eventId": "uuid",
        "title": "Carer visit",
        "startAt": "2026-07-06T16:00:00+01:00",
        "timeLabel": "16:00",
        "status": "upcoming",
        "isAllDay": false
      }
    ]
  },
  "next": {
    "eventId": "uuid",
    "title": "Carer visit",
    "startAt": "2026-07-06T16:00:00+01:00",
    "timeLabel": "16:00",
    "minutesUntil": 10
  },
  "message": {
    "messageId": "uuid",
    "title": "Remember",
    "body": "Clare is visiting this afternoon.",
    "severity": "normal",
    "expiresAt": "2026-07-06T18:00:00+01:00"
  }
}
```

## 8.3 Snapshot rules

* Only include events visible to the specific device.
* Only include active, non-deleted events.
* Use the device timezone when determining “today”.
* Sort events by start time.
* Mark events as `completed` when their end time has passed, or when their status explicitly indicates completion.
* Determine the `next` event as the nearest future event that is visible to the device.
* Exclude cancelled events.
* Do not include internal notes, editor names, account data, audit data or sensitive fields.
* Return `null` for `next` when there is no future event today.
* Return `null` for `message` when no active message exists.

---

# 9. Authentication and device pairing

## 9.1 Recommended device authentication model

Use Supabase anonymous authentication for the viewer device.

When the viewer is initially opened:

1. Create an anonymous Supabase session.
2. Associate that authenticated user with a pending `dv_device` record.
3. Show a pairing QR code and short code.
4. After a dashboard user claims the code, mark the device as active.
5. Restrict the anonymous device user to read only that device’s snapshot.

The device must not require an email/password login.

## 9.2 Pairing flow

### Step 1: Device setup

The installer opens:

```text
/display/setup
```

The application:

* creates an anonymous device-authenticated user
* creates a `dv_device` record with `status = pending_pairing`
* creates a `dv_device_pairing` record
* displays:

  * QR code
  * six-digit pairing code
  * expiry countdown
  * “This screen will be linked to a Daily View account” guidance

### Step 2: Account owner claims the device

The family member logs into the Daily View dashboard and selects:

```text
Dashboard → Devices → Add a screen
```

They can:

* scan the QR code using their phone camera, or
* type the six-digit pairing code

The dashboard then:

* validates the pairing code and expiry
* confirms the device name
* optionally allows the owner to choose a display name and timezone
* links the `dv_device.account_id` to the account
* sets `dv_device.status = active`
* stores `dv_device.auth_user_id`
* marks the pairing record as claimed
* sends a realtime refresh signal to the display

### Step 3: Device enters viewer mode

The device detects successful pairing and redirects to:

```text
/display/[deviceId]
```

It must not show account information or allow the recipient to alter the account.

## 9.3 Device revocation

From the dashboard, the account owner must be able to revoke a device.

On revocation:

* set `dv_device.status = revoked`
* set `dv_device.revoked_at`
* prevent future snapshot access
* unsubscribe the device from realtime channels
* clear cached sensitive snapshot data on the next successful device connection
* show a simple support screen stating that the display is no longer connected

---

# 10. Row Level Security requirements

Enable Row Level Security for all Daily View tables.

## 10.1 Dashboard users

Authenticated dashboard users may access only:

* accounts they belong to through `dv_account_user`
* devices belonging to those accounts
* events and messages belonging to those accounts
* device pairing records they created or are eligible to claim

## 10.2 Viewer devices

A device-authenticated user may:

* read its own `dv_device` record
* call `get_viewer_snapshot` only for its own device
* write its own heartbeat/last-seen update
* subscribe only to a private realtime channel for its own device

A device-authenticated user must not:

* read all events directly
* read account member information
* read another device
* create or edit events
* access dashboard-only routes
* access another account’s data

## 10.3 Required security checks

Every protected server endpoint and RPC must independently verify:

```text
authenticated user ID = dv_device.auth_user_id
AND requested device ID = dv_device.device_id
AND dv_device.status = active
```

Do not rely only on client-side route protection.

---

# 11. Realtime updates

## 11.1 Event model

The viewer does not need to receive full event data through realtime channels.

Instead, use realtime as a secure notification mechanism.

When any relevant data changes, publish a small device-specific message:

```json
{
  "type": "viewer_snapshot_invalidated",
  "deviceId": "uuid",
  "changedAt": "2026-07-06T18:30:00Z"
}
```

On receiving this message, the viewer should fetch a new snapshot.

## 11.2 Relevant changes

Send a refresh notification when any of the following occur:

* event created
* event edited
* event deleted
* event cancelled
* event visibility changed
* important message created, changed or removed
* device display settings changed
* device timezone changed
* device access revoked
* account-level display configuration changed

## 11.3 Channel naming

Use a private channel format:

```text
viewer-device:{deviceId}
```

The authenticated viewer device must only be authorised to subscribe to its own channel.

## 11.4 Fallback refresh schedule

In addition to realtime updates, the viewer must:

* fetch a fresh snapshot when first loaded
* fetch a fresh snapshot every five minutes
* fetch a fresh snapshot when the browser regains connectivity
* fetch a fresh snapshot when the application regains foreground focus
* recalculate local clock and event state every minute
* update the visible clock every second

---

# 12. Offline and resilience requirements

## 12.1 Local caching

Use IndexedDB or a suitable local persistence layer to store:

* latest valid Viewer Snapshot
* timestamp of last successful refresh
* current device ID
* minimal display configuration needed to render safely

Do not store dashboard credentials or unnecessary personal data.

## 12.2 Offline behaviour

When the device is offline:

* continue to display the latest valid snapshot
* keep the clock running based on the device clock
* continue updating which events are completed or upcoming
* show a discreet offline indicator only after five minutes without a successful connection
* include “Last updated at [time]” in the support view
* do not replace useful information with an error screen

## 12.3 No-data state

If there is no cached snapshot and the device cannot connect:

```text
Daily View is reconnecting.

Your information will appear here shortly.
```

This state should be visually calm and should not expose technical error details.

---

# 13. Viewer PWA requirements

## 13.1 PWA configuration

Create:

* `manifest.webmanifest`
* service worker
* standalone application display mode
* Daily View icon assets
* theme colour metadata
* landscape orientation preference where supported

## 13.2 Cache strategy

Use:

| Resource                                  | Strategy                                   |
| ----------------------------------------- | ------------------------------------------ |
| App shell, fonts, icons and static assets | Cache-first with versioning                |
| Viewer snapshot                           | Network-first with local snapshot fallback |
| Realtime connection                       | Network only                               |
| Support and setup pages                   | Network-first                              |

When deploying a new viewer version:

* version static cache names
* remove old static caches after successful activation
* avoid wiping the saved Viewer Snapshot unless the device is revoked or the data format changes incompatibly

---

# 14. Device health

## 14.1 Heartbeat

While active, the viewer should send a heartbeat:

* immediately after successful snapshot load
* every 15 minutes while online
* whenever connectivity returns
* whenever the application becomes visible after being in the background

At minimum, update:

```text
dv_device.last_seen_at
dv_device.last_snapshot_at
```

## 14.2 Dashboard device status

In the dashboard, show:

| Status           | Definition                       |
| ---------------- | -------------------------------- |
| Active now       | Last seen within 20 minutes      |
| Recently active  | Last seen within 24 hours        |
| Offline          | Last seen more than 24 hours ago |
| Pairing required | Pending device not yet claimed   |
| Revoked          | Device access disabled           |

The dashboard should also show:

* device name
* display location/name
* last updated time
* device timezone
* pairing date
* optional battery/charging details if available
* preview button
* revoke device button

---

# 15. Support and maintenance access

The viewer should not expose normal controls.

Add a hidden support action:

* press and hold the top-right corner for five seconds, or
* use a support-only keyboard shortcut where available

The support page may show:

* device name
* connection status
* last successful update
* app version
* Wi-Fi/network guidance
* refresh now button
* restart viewer button where technically possible
* pairing/re-pair instructions if device has been revoked
* QR code to contact family support, if configured

The support page must not show sensitive event history, account membership data or editing controls.

---

# 16. Front-end component structure

Suggested viewer components:

```text
ViewerApp
├─ ViewerShell
│  ├─ ViewerHeader
│  │  ├─ DailyViewLogo
│  │  ├─ DateLabel
│  │  ├─ CurrentTime
│  │  └─ TimeOfDayIcon
│  ├─ TodaySection
│  │  └─ TodayEventRow
│  ├─ NextEventSection
│  ├─ ImportantMessageBanner
│  ├─ OfflineStatusIndicator
│  └─ HiddenSupportTrigger
├─ ViewerLoadingState
├─ ViewerOfflineNoDataState
├─ ViewerRevokedState
└─ ViewerSupportPage
```

Suggested hooks:

```text
useViewerDeviceAuth()
useViewerSnapshot(deviceId)
useViewerRealtime(deviceId)
useViewerClock(timezone)
useViewerOfflineCache(deviceId)
useDeviceHeartbeat(deviceId)
useTimeOfDay(currentTime)
```

---

# 17. Event display logic

## 17.1 Event ordering

Sort events by:

1. all-day events, if enabled
2. start time ascending
3. creation date as a stable fallback

## 17.2 Event state

Calculate an event state on the client every minute.

| Condition                                  | Viewer state |
| ------------------------------------------ | ------------ |
| End time is before current time            | Completed    |
| Current time is between start and end time | Current      |
| Start time is later than current time      | Upcoming     |
| Event cancelled                            | Hidden       |
| Event not visible to device                | Hidden       |

## 17.3 Next event

The Next section must display:

* the nearest future visible event today
* optionally a currently active event when relevant
* “Nothing else planned today” when there are no remaining events

Do not show events from tomorrow in the initial release unless the product design explicitly includes a “Tomorrow” section.

---

# 18. Dashboard requirements

Add device-management functionality to the existing dashboard.

## 18.1 Device list

Show:

* device name
* account/display recipient name
* device status
* last seen
* last update
* preview action
* manage action

## 18.2 Device detail page

Allow account owner to:

* rename device
* change timezone
* set maximum displayed events
* toggle completed event visibility
* enable/disable Next section
* configure font size
* configure important message behaviour
* view pairing history
* revoke device
* generate a replacement pairing code if needed

## 18.3 Preview mode

The dashboard must provide a preview that renders the same Viewer Snapshot for a selected device.

Preview mode should:

* use the same layout component as the actual viewer
* clearly show a “Preview” badge outside the main viewer frame
* not affect the device itself
* allow the editor to validate event changes before saving or publishing

---

# 19. Error handling

The viewer must handle errors without exposing raw error messages.

## Required states

| Condition                                    | Behaviour                                          |
| -------------------------------------------- | -------------------------------------------------- |
| Snapshot fetch fails, cached snapshot exists | Display cached snapshot and offline indicator      |
| Snapshot fetch fails, no cached snapshot     | Display reconnecting state                         |
| Device revoked                               | Display device disconnected support message        |
| Pairing expired                              | Return to pairing setup and generate a new code    |
| Realtime disconnects                         | Continue polling every five minutes                |
| Invalid snapshot response                    | Keep latest valid cached snapshot and log error    |
| Device timezone unavailable                  | Default to `Europe/London`, log warning            |
| Browser storage unavailable                  | Continue online-only and show no user-facing error |

All technical errors should be captured through the project’s logging/monitoring system.

---

# 20. Environment variables

Use server-side environment variables only for privileged credentials.

Example:

```text
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=
VIEWER_PAIRING_SECRET=
VIEWER_SNAPSHOT_CACHE_VERSION=
```

Rules:

* Never expose `SUPABASE_SERVICE_ROLE_KEY` to the browser.
* Never use the service role key in client-side viewer code.
* Use the authenticated Supabase client and Row Level Security for viewer data access.
* Hash pairing secrets before storing them.

---

# 21. Acceptance criteria

## Viewer functionality

* [ ] A paired device displays the current date, current time, today’s events and next event.
* [ ] The viewer has no visible edit controls or standard navigation.
* [ ] Clock updates every second without requiring a server request.
* [ ] Event state updates automatically when an event time passes.
* [ ] A dashboard event edit appears on the linked viewer within 30 seconds under normal connectivity.
* [ ] The viewer refreshes automatically after reconnecting to Wi-Fi.
* [ ] The viewer remains useful during temporary internet loss.
* [ ] The viewer shows the latest cached snapshot during an outage.
* [ ] The viewer shows a calm reconnecting state when no data is available.
* [ ] A revoked device can no longer retrieve account data.

## Pairing and security

* [ ] A new display can be paired using QR code or six-digit code.
* [ ] Pairing codes expire after 15 minutes.
* [ ] Pairing codes cannot be reused.
* [ ] A device can only retrieve data for its linked account and device ID.
* [ ] A device cannot query raw events for another device or account.
* [ ] A dashboard user can revoke a device.
* [ ] Revoked devices show a support state rather than old account content after reconnecting.

## Dashboard

* [ ] Account owners can view all devices belonging to their account.
* [ ] Account owners can rename, configure and revoke devices.
* [ ] Editors can preview a device where permission is granted.
* [ ] The preview uses the same presentation logic as the actual viewer.

---

# 22. Recommended implementation sequence

## Phase 1: Viewer foundation

1. Create the `/display/[deviceId]` route.
2. Create the Viewer Snapshot TypeScript interface.
3. Build the Viewer UI with mocked snapshot data.
4. Add local clock, event-state calculation and time-of-day icon logic.
5. Add loading, offline and revoked states.

## Phase 2: Backend snapshot service

1. Create or extend `dv_device`.
2. Create `get_viewer_snapshot(device_id)` RPC or protected API endpoint.
3. Add Row Level Security policies.
4. Connect the viewer to live Supabase snapshot data.
5. Add local IndexedDB snapshot persistence.

## Phase 3: Device pairing

1. Build `/display/setup`.
2. Add anonymous device authentication.
3. Create `dv_device_pairing`.
4. Build dashboard pairing flow.
5. Redirect paired devices into viewer mode.

## Phase 4: Realtime and health

1. Create private device realtime channels.
2. Trigger snapshot invalidation when relevant records change.
3. Add five-minute fallback polling.
4. Add device heartbeat and dashboard status.
5. Add support page and hidden support trigger.

## Phase 5: Hardening

1. Add automated tests for pairing expiry and device isolation.
2. Add responsive visual tests at tablet dimensions.
3. Test offline behaviour.
4. Test device revocation.
5. Test timezone and daylight-saving-time changes.
6. Test event boundary behaviour at exact start/end times.

---

# 23. Key implementation decision

Treat the Viewer Screen as a **device-specific presentation layer**, not a scaled-up dashboard.

The dashboard manages complex data.

The viewer receives one small, secure, display-ready snapshot and renders it simply, reliably and consistently.
