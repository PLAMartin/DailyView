# Daily View Dashboard — Technical Build Specification

## 1. Purpose

Build a secure web dashboard for the people who manage a Daily View display: family members, carers, care-home staff and account administrators.

The dashboard must make it easy to answer two questions:

1. **What is the viewer seeing today?**
2. **Is the Daily View display working and up to date?**

The dashboard is not the viewer-facing display. It is the management interface used to create, update and supervise the content shown on one or more Daily View devices.

This specification uses the existing `dv_` tables as the Daily View domain model. The legacy non-`dv_` tables are unrelated to Daily View and must not be queried, altered or used by this feature.

---

## 2. Technical assumptions

* Database: Supabase Postgres.
* Authentication: Supabase Auth.
* Application user profile: `public.dv_user`.
* Auth mapping: `dv_user.auth_user_id -> auth.users.id`.
* Front end: use the existing Daily View application stack. Route examples assume a React/Next.js-style application, but equivalent routes are acceptable.
* All account-scoped data must be protected by Row Level Security (RLS).
* Use the account timezone stored in `dv_account.timezone`. Default: `Europe/London`.
* Do not place business-critical authorisation logic only in the browser.

---

## 3. Product scope

### 3.1 MVP dashboard sections

```text
Today
Calendar
Messages
Devices
People
Settings
Help
```

### 3.2 MVP priorities

1. Create, edit and remove events.
2. Show a faithful preview of the Daily View screen.
3. Show device connection status.
4. Allow trusted family members/carers to collaborate.
5. Manage temporary display messages.
6. Configure the core display preferences.

### 3.3 Explicit non-goals for the first release

* Full billing and subscription checkout.
* External calendar sync.
* Medication administration records.
* Clinical records or health assessments.
* Complex care-home rostering.
* AI-generated schedules.
* Automated emergency escalation.
* Drag-and-drop calendar scheduling, unless it is already simple to support.
* Device remote-control beyond pairing, refresh and disconnect.

---

## 4. Core terminology

| Term            | Meaning                                                                                                 |
| --------------- | ------------------------------------------------------------------------------------------------------- |
| Account         | A Daily View household, care setting or customer organisation. Stored in `dv_account`.                  |
| Viewer          | The person who sees the Daily View screen. Normally linked through `dv_account.primary_viewer_user_id`. |
| Member          | A family member, carer or administrator with dashboard access. Stored in `dv_account_user`.             |
| Device          | A physical display, tablet or browser-based Daily View screen. Stored in `dv_device`.                   |
| Event           | A time-based item such as “Lunch with Tim” or “Carer visit”. Stored in `dv_event`.                      |
| Message         | A temporary high-priority display notice, such as “Clare will visit at 5pm.”                            |
| Prompt          | A request sent to a member asking them to confirm or update information. Stored in `dv_update_prompt`.  |
| Display preview | A dashboard-rendered version of the same display model used by the physical Daily View screen.          |

---

## 5. Existing Daily View data model

Use these existing tables as the foundation.

### 5.1 Users and authentication

| Table                        | Use                                                                                                             |
| ---------------------------- | --------------------------------------------------------------------------------------------------------------- |
| `dv_user`                    | Daily View person profile. Includes name, email, timezone, communication preferences and Supabase Auth mapping. |
| `dv_user_type`               | Lookup table for user categories, such as viewer, family member, carer or administrator.                        |
| `dv_account_user`            | Membership between a user and an account, including role and granular permissions.                              |
| `dv_account_user_role`       | Role lookup, such as owner, editor, viewer or carer.                                                            |
| `dv_account_user_permission` | Permission-level lookup.                                                                                        |

Important rules:

* Use `dv_user`, not the legacy `public.user` table.
* Each authenticated dashboard user must have a corresponding `dv_user` record.
* `dv_user.auth_user_id` must be unique and match the authenticated Supabase user.
* A user may belong to more than one Daily View account.

### 5.2 Accounts and display configuration

| Table                   | Use                                                                                        |
| ----------------------- | ------------------------------------------------------------------------------------------ |
| `dv_account`            | Core account record, display configuration and primary viewer.                             |
| `dv_account_type`       | Lookup table for account type, initially `memory_support`.                                 |
| `dv_display_preference` | Display-specific preferences such as font size, contrast, layout and past-event treatment. |

Important account-level fields already available:

```text
max_events_shown
timezone
show_next_reminder
auto_reset_to_today
morning_start_time
afternoon_start_time
evening_start_time
night_start_time
show_day_period
```

### 5.3 Events

| Table                     | Use                                                        |
| ------------------------- | ---------------------------------------------------------- |
| `dv_event`                | Individual schedule items shown on the Daily View display. |
| `dv_event_type`           | Lookup table for event categories.                         |
| `dv_event_status`         | Lookup table for event lifecycle status.                   |
| `dv_event_visibility`     | Controls whether an event is shown on the display.         |
| `dv_event_source`         | Indicates where the event came from.                       |
| `dv_event_accuracy`       | Indicates whether an event is confirmed or uncertain.      |
| `dv_event_confirmation`   | Optional confirmation record for an event.                 |
| `dv_event_confirm_status` | Lookup values for event confirmation status.               |

### 5.4 Devices

| Table                    | Use                                                                      |
| ------------------------ | ------------------------------------------------------------------------ |
| `dv_device`              | Display device record, pairing code, status timestamps and display mode. |
| `dv_device_type`         | Lookup for display/tablet/browser device type.                           |
| `dv_device_display_mode` | Lookup for device display mode.                                          |

### 5.5 Prompts and updates

| Table                 | Use                                                                                    |
| --------------------- | -------------------------------------------------------------------------------------- |
| `dv_update_prompt`    | Requests sent to account members, for example “Can you confirm tomorrow’s care visit?” |
| `dv_prompt_type`      | Prompt category lookup.                                                                |
| `dv_delivery_channel` | Email, SMS, push notification or in-app delivery channel.                              |
| `dv_response_status`  | Sent, pending, responded, dismissed and similar statuses.                              |

---

## 6. Required schema additions

The existing schema is sufficient for users, accounts, devices and one-off events. It has two gaps for the dashboard: temporary display messages and recurring events.

Create migrations only for the Daily View `dv_` domain.

### 6.1 `dv_display_message`

Create a new table for high-priority, temporary display notices.

| Field                | Type / rule                                                            |
| -------------------- | ---------------------------------------------------------------------- |
| `message_id`         | Bigint identity primary key                                            |
| `account_id`         | Required FK to `dv_account`                                            |
| `message`            | Required text, maximum 220 characters                                  |
| `start_at`           | Nullable timestamptz; null means show immediately                      |
| `end_at`             | Nullable timestamptz; null means remain visible until manually removed |
| `display_priority`   | Smallint, default `1`; lower number means higher priority              |
| `is_active`          | Boolean, default `true`                                                |
| `show_on_display`    | Boolean, default `true`                                                |
| `created_at`         | Timestamptz, default now                                               |
| `updated_at`         | Timestamptz, default now                                               |
| `created_by_user_id` | Nullable FK to `dv_user`                                               |
| `updated_by_user_id` | Nullable FK to `dv_user`                                               |
| `deleted_at`         | Nullable timestamptz                                                   |
| `deleted_by_user_id` | Nullable FK to `dv_user`                                               |

Rules:

* A message is active when `is_active = true`, `deleted_at is null`, and the current account-local time is within its optional start/end range.
* Messages are account-wide in MVP. Device-specific messages are out of scope.
* Messages appear above the normal schedule content in the display preview and on physical devices.
* Do not use `dv_update_prompt` for display messages. Prompts are for requesting action from a dashboard user.

### 6.2 Recurring-event support

Create a new `dv_event_series` table and add `series_id` to `dv_event`.

`dv_event_series` should include:

| Field                 | Purpose                                                             |
| --------------------- | ------------------------------------------------------------------- |
| `series_id`           | Primary key                                                         |
| `account_id`          | Account ownership                                                   |
| `title`               | Default event title                                                 |
| `description`         | Optional default description                                        |
| `start_date`          | First occurrence date                                               |
| `end_date`            | Optional end date                                                   |
| `start_time`          | Optional local start time                                           |
| `end_time`            | Optional local end time                                             |
| `rrule`               | RFC 5545 recurrence rule, for example weekly on Monday and Thursday |
| `event_type_id`       | Default type                                                        |
| `event_visibility_id` | Default visibility                                                  |
| `event_source_id`     | Usually `dashboard`                                                 |
| `event_accuracy_id`   | Default accuracy                                                    |
| `display_priority`    | Default display order                                               |
| `show_on_display`     | Default display visibility                                          |
| `is_active`           | Whether future occurrences should be generated                      |
| `created_by_user_id`  | Audit field                                                         |
| `updated_by_user_id`  | Audit field                                                         |
| `created_at`          | Audit field                                                         |
| `updated_at`          | Audit field                                                         |
| `deleted_at`          | Soft-delete field                                                   |

Add to `dv_event`:

```text
series_id bigint null references dv_event_series(series_id)
```

Recurring-event implementation rules:

* `dv_event_series` is the source definition.
* `dv_event` stores concrete occurrence records.
* Generate occurrences for the next 90 days whenever a series is created or edited.
* Do not generate duplicate occurrences for the same series and date/time.
* Editing one occurrence changes only that occurrence.
* Editing the series updates future, non-overridden occurrences only.
* Cancelling one occurrence sets that `dv_event.event_status_id` to `cancelled`; it must not be regenerated.
* Use account-local dates and times. Do not convert `event_date`, `start_time` and `end_time` to UTC.

### 6.3 `dv_account_invite`

Create a table to support safe invitations to family members and carers.

| Field                    | Purpose                      |
| ------------------------ | ---------------------------- |
| `invite_id`              | UUID primary key             |
| `account_id`             | Target account               |
| `email`                  | Invitee email address        |
| `role_id`                | Intended role                |
| `permission_id`          | Intended permission level    |
| `relationship_to_viewer` | Optional relationship        |
| `can_manage_events`      | Permission snapshot          |
| `can_manage_users`       | Permission snapshot          |
| `can_manage_devices`     | Permission snapshot          |
| `can_send_prompts`       | Permission snapshot          |
| `is_primary_contact`     | Permission snapshot          |
| `token_hash`             | Hashed one-time invite token |
| `expires_at`             | Invite expiry                |
| `accepted_at`            | Acceptance timestamp         |
| `revoked_at`             | Revocation timestamp         |
| `created_by_user_id`     | Audit field                  |
| `created_at`             | Audit field                  |

Do not store an active invitation token in plain text.

### 6.4 Device pairing additions

Add these fields to `dv_device`:

```text
pairing_code_expires_at timestamptz null
paired_at timestamptz null
device_secret_hash text null
last_refresh_requested_at timestamptz null
```

Rules:

* A pairing code must be single-use and expire after 15 minutes.
* Pairing codes must not remain valid after successful device setup.
* Device access must use a device-scoped secret or token after pairing.
* `last_seen_at` is updated by the display device heartbeat.
* A manual refresh request updates `last_refresh_requested_at`.

### 6.5 Recommended indexes

Create indexes that support the dashboard’s common queries:

```text
dv_account_user(account_id, user_id) where deleted_at is null
dv_event(account_id, event_date, start_time) where deleted_at is null
dv_event(account_id, show_on_display, event_date) where deleted_at is null
dv_event(series_id, event_date) where series_id is not null
dv_device(account_id, is_active) where deleted_at is null
dv_display_message(account_id, is_active, start_at, end_at) where deleted_at is null
dv_update_prompt(account_id, sent_to_user_id, response_status_id)
```

Add an `updated_at` trigger to all mutable `dv_` tables that do not already have one.

---

## 7. Seed data

Seed the following Daily View lookup values.

### 7.1 Account roles

| Role             | Intended use                                         |
| ---------------- | ---------------------------------------------------- |
| `owner`          | Full account control, billing and deletion authority |
| `editor`         | Manages events and messages                          |
| `carer`          | Manages day-to-day schedule content and prompts      |
| `viewer`         | Read-only dashboard access                           |
| `device_manager` | Manages devices and display settings                 |

### 7.2 Permission levels

| Permission        | Meaning                                       |
| ----------------- | --------------------------------------------- |
| `full_access`     | Can manage all dashboard areas                |
| `schedule_editor` | Can manage events and display messages        |
| `read_only`       | Can view account content but cannot change it |
| `device_admin`    | Can pair, refresh and remove devices          |

### 7.3 Event statuses

```text
scheduled
completed
cancelled
draft
```

Only `scheduled` events appear on the display by default.

### 7.4 Event visibility values

```text
display
account_only
private
```

Rules:

* `display`: eligible for the Daily View display.
* `account_only`: visible in the dashboard but never displayed.
* `private`: visible only to authorised account members and never displayed.

### 7.5 Event types

```text
appointment
visit
care_visit
meal
activity
reminder
call
transport
other
```

### 7.6 Event sources

```text
dashboard
recurring_series
prompt_response
import
system
```

### 7.7 Event accuracy values

```text
confirmed
unconfirmed
estimated
```

---

## 8. Permission model

Use `dv_account_user` as the source of account membership and permission.

An active member is a row where:

```text
account_id matches the current account
user_id matches the authenticated dv_user
deleted_at is null
```

### 8.1 Role defaults

| Role           | Events | Messages | People | Devices | Prompts |     Settings |
| -------------- | -----: | -------: | -----: | ------: | ------: | -----------: |
| Owner          |    Yes |      Yes |    Yes |     Yes |     Yes |          Yes |
| Editor         |    Yes |      Yes |     No |      No |     Yes |           No |
| Carer          |    Yes |      Yes |     No |      No |     Yes |           No |
| Viewer         |     No |       No |     No |      No |      No |           No |
| Device manager |     No |       No |     No |     Yes |      No | Display only |

### 8.2 Enforcement rules

* `can_manage_events = true` permits creating, editing, cancelling and deleting events and display messages.
* `can_manage_users = true` permits inviting, editing and removing account members.
* `can_manage_devices = true` permits pairing, refreshing, renaming and removing devices.
* `can_send_prompts = true` permits creating `dv_update_prompt` records.
* Only an owner may edit subscription status, delete an account or transfer ownership.
* Prevent removal or downgrade of the final remaining account owner.
* A member cannot increase their own permissions.
* A member cannot invite another user with more permissions than their own.

---

## 9. Row Level Security requirements

Enable RLS on every `dv_` table used by this feature.

Create reusable database functions such as:

```text
current_dv_user_id()
is_active_account_member(account_id)
can_manage_account_events(account_id)
can_manage_account_users(account_id)
can_manage_account_devices(account_id)
can_send_account_prompts(account_id)
```

Implementation requirements:

* Functions should derive the current user from `auth.uid()`.
* Functions should resolve the matching `dv_user.auth_user_id`.
* Do not trust a client-provided `user_id`.
* Do not use the Supabase service role in normal dashboard requests.

### 9.1 RLS policy summary

| Table                   | Read                                                                            | Create/update/delete                                                                     |
| ----------------------- | ------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------- |
| `dv_account`            | Active account members                                                          | Owner, except approved display settings for device managers                              |
| `dv_account_user`       | Active account members                                                          | Users with `can_manage_users`                                                            |
| `dv_user`               | User can read own profile; account members can read limited member profile data | User can update own profile; account manager can update account-specific membership only |
| `dv_event`              | Active account members                                                          | Users with `can_manage_events`                                                           |
| `dv_event_series`       | Active account members                                                          | Users with `can_manage_events`                                                           |
| `dv_display_message`    | Active account members                                                          | Users with `can_manage_events`                                                           |
| `dv_device`             | Active account members                                                          | Users with `can_manage_devices`                                                          |
| `dv_display_preference` | Active account members                                                          | Owner or device manager                                                                  |
| `dv_update_prompt`      | Active account members; recipient can see own prompts                           | Users with `can_send_prompts`                                                            |
| `dv_account_invite`     | Users with `can_manage_users`                                                   | Users with `can_manage_users`                                                            |

Soft deletion must be used for events, messages, devices and membership removals. Do not permanently delete ordinary user-created data from the dashboard.

---

## 10. Dashboard routes

Use an account-scoped route structure.

```text
/dashboard
/dashboard/[accountId]/today
/dashboard/[accountId]/calendar
/dashboard/[accountId]/messages
/dashboard/[accountId]/devices
/dashboard/[accountId]/people
/dashboard/[accountId]/settings
/dashboard/[accountId]/help
```

### 10.1 Entry behaviour

* `/dashboard` redirects to the user’s most recently used account.
* If the user belongs to one account, redirect directly to `/dashboard/[accountId]/today`.
* If the user belongs to more than one account, display an account selector.
* If the user belongs to no account, show an onboarding screen rather than an empty dashboard.
* Never expose an account simply because a user guesses its ID.

---

## 11. Shared dashboard shell

### 11.1 Desktop layout

```text
---------------------------------------------------------------
Daily View logo | Account selector | Help | User menu
---------------------------------------------------------------
Sidebar              Main content area
- Today
- Calendar
- Messages
- Devices
- People
- Settings
---------------------------------------------------------------
```

### 11.2 Mobile layout

* Replace the sidebar with a bottom navigation or menu drawer.
* Prioritise: Today, Calendar, Messages and More.
* Event editing must work comfortably on a mobile screen.
* Avoid dense tables on mobile; use stacked cards.

### 11.3 Shared UI elements

Include:

* Account name and account switcher.
* Current account timezone, shown discreetly in Settings.
* Global “Add event” action.
* Clear save, cancel and delete controls.
* Confirmation dialogue before destructive actions.
* Toast confirmation for successful changes.
* Friendly, actionable error states.
* Loading skeletons for initial page loads.
* Empty states with a direct next action.

---

## 12. Today page

Route:

```text
/dashboard/[accountId]/today
```

The Today page is the dashboard home page.

### 12.1 Primary content

Display:

1. A live Daily View screen preview.
2. Today’s visible events.
3. The next upcoming event.
4. Active display messages.
5. Device status summary.
6. Quick actions.

### 12.2 Required layout

```text
------------------------------------------------------------
Today, Thursday 11 June

[ Daily View screen preview ]   [ Device status ]
                                - Kitchen screen: Online
                                - Last seen: 2 minutes ago
                                - Refresh display

[ Today's schedule ]
10:00  Hair appointment
12:00  Lunch with Sarah
16:00  Care visit

[ Next ]
Hair appointment at 10:00

[ Active messages ]
Clare will visit at 5pm.

[ Add event ] [ Send message ] [ Ask for update ]
------------------------------------------------------------
```

### 12.3 Screen-preview requirements

The preview must use the same display-view-model function as the physical Daily View screen.

Create a shared service:

```text
buildDisplayViewModel(accountId, deviceId?, now)
```

It must return:

```text
account name
viewer-friendly date
current time
day period
today events
next event
active display message
display preferences
device display mode
```

Rules:

* Do not duplicate display-selection logic separately in the dashboard and device application.
* Use the account timezone for all date and time calculations.
* Exclude cancelled, deleted, private and account-only events.
* Respect `show_on_display`.
* Order events by `display_priority`, then start time, then creation time.
* Apply `max_events_shown`.
* Grey out past events when `grey_out_past_events = true`.
* Show past events only when `show_past_events = true`.
* Use `show_next_reminder` and `show_day_period` from `dv_account`.

### 12.4 Device status logic

Use these labels:

| State              | Rule                                       |
| ------------------ | ------------------------------------------ |
| Online             | `last_seen_at` within the last 5 minutes   |
| Recently seen      | More than 5 minutes and less than 24 hours |
| Offline            | More than 24 hours                         |
| Waiting to connect | Device exists but has never checked in     |
| Inactive           | `is_active = false` or soft-deleted        |

### 12.5 Today-page actions

| Action                | Permission           |
| --------------------- | -------------------- |
| Add event             | `can_manage_events`  |
| Edit event            | `can_manage_events`  |
| Cancel event          | `can_manage_events`  |
| Send display message  | `can_manage_events`  |
| Refresh device        | `can_manage_devices` |
| Ask member for update | `can_send_prompts`   |

---

## 13. Calendar page

Route:

```text
/dashboard/[accountId]/calendar
```

### 13.1 Required views

* Day view.
* Week view.
* Agenda/list view.
* Month view is optional for MVP.

Default to the week view on desktop and agenda/list view on mobile.

### 13.2 Event list requirements

Each event card or row must show:

```text
time
title
event type
display status
confirmation/accuracy status
source
edit action
```

Use clear indicators:

* Visible on Daily View.
* Dashboard only.
* Cancelled.
* Unconfirmed.
* Recurring.

### 13.3 Create event form

Fields:

| Field              |                 Required | Source                         |
| ------------------ | -----------------------: | ------------------------------ |
| Title              |                      Yes | `dv_event.title`               |
| Date               |                      Yes | `dv_event.event_date`          |
| Start time         |                       No | `dv_event.start_time`          |
| End time           |                       No | `dv_event.end_time`            |
| Description        |                       No | `dv_event.description`         |
| Event type         |     Yes, default `other` | `dv_event.event_type_id`       |
| Show on Daily View |     Yes, default enabled | `dv_event.show_on_display`     |
| Visibility         |   Yes, default `display` | `dv_event.event_visibility_id` |
| Priority           |           Yes, default 5 | `dv_event.display_priority`    |
| Accuracy           | Yes, default `confirmed` | `dv_event.event_accuracy_id`   |
| Repeat             |                       No | `dv_event_series`              |
| Source             |           System-managed | `dv_event.event_source_id`     |

Default values for a manually created event:

```text
event_status = scheduled
event_visibility = display
event_source = dashboard
event_accuracy = confirmed
show_on_display = true
display_priority = 5
```

### 13.4 Validation

* Title: 1–100 characters.
* Description: maximum 1,000 characters.
* End time must be later than start time when both are present.
* Event date must use account-local date.
* Priority must be an integer from 1 to 9.
* An event with visibility `private` or `account_only` must automatically set `show_on_display = false`.
* A cancelled event must never appear on the display.
* Do not allow event forms to submit while lookup data has not loaded.

### 13.5 Edit and delete behaviour

* “Delete” performs a soft delete by setting `deleted_at` and `deleted_by_user_id`.
* “Cancel” keeps the record but changes event status to `cancelled`.
* Record `updated_by_user_id` on every edit.
* For recurring events, present three choices:

```text
This event only
This and future events
Entire series
```

---

## 14. Messages page

Route:

```text
/dashboard/[accountId]/messages
```

Messages are not normal appointments. They are short, high-visibility notes that appear prominently on the Daily View screen.

Examples:

```text
Clare will visit at 5pm.
The plumber will arrive this morning.
Lunch is at 12:30 today.
```

### 14.1 Message list

Show:

* Message text.
* Current status: active, scheduled, expired, paused or deleted.
* Start and end time.
* Priority.
* Creator.
* Last updated time.
* Display preview snippet.

### 14.2 Create message form

Fields:

| Field        |            Required |
| ------------ | ------------------: |
| Message text |                 Yes |
| Show from    | No; defaults to now |
| Show until   |                  No |
| Priority     |      Yes; default 1 |
| Active       |   Yes; default true |

Validation:

* Message maximum: 220 characters.
* End time must be after start time.
* Use account-local timezone in the UI.
* Expired messages must not appear on the display.
* A message with no end time stays active until manually removed or paused.

### 14.3 Display behaviour

* Show the highest-priority active message.
* When two messages have the same priority, show the most recently updated.
* Only show one active message in MVP.
* The Today page must show all active messages in the dashboard, even where only one is selected for the display.

---

## 15. Devices page

Route:

```text
/dashboard/[accountId]/devices
```

### 15.1 Device list

Each device card must show:

```text
device name
device type
display mode
status
last seen
paired date
last refresh request
actions
```

### 15.2 Device actions

| Action              | Behaviour                                          |
| ------------------- | -------------------------------------------------- |
| Add device          | Creates a device record and temporary pairing code |
| Pair device         | Shows pairing code and QR code                     |
| Rename              | Updates `dv_device.device_name`                    |
| Refresh display     | Updates `last_refresh_requested_at`                |
| Change display mode | Updates `display_mode_id`                          |
| Deactivate          | Sets `is_active = false`                           |
| Remove device       | Soft-deletes device and revokes access             |

### 15.3 Pairing flow

1. User selects **Add device**.
2. Dashboard creates a `dv_device` record.
3. Server generates a cryptographically secure pairing code.
4. Store only the code hash or a non-reusable token hash.
5. Display the pairing code and QR code to the dashboard user.
6. Device submits pairing code through a dedicated pairing endpoint.
7. Server validates expiry, device activity and one-time use.
8. Server issues a device-scoped secret/token.
9. Device stores its own secure token locally.
10. Server sets `paired_at`, clears pairing code and begins accepting heartbeats.

### 15.4 Device API behaviour

The physical display must be able to:

```text
pair
fetch display view model
send heartbeat
request refresh status
```

The device must not receive unrestricted account or dashboard data.

---

## 16. People page

Route:

```text
/dashboard/[accountId]/people
```

### 16.1 Member list

Show:

```text
full name
preferred name
email
relationship to viewer
role
permissions
primary contact status
invite status
last activity where available
```

### 16.2 Invite member flow

1. User selects **Invite person**.
2. Enter name, email, relationship and role.
3. Show a readable summary of permissions.
4. Create `dv_account_invite`.
5. Send invite using Supabase Auth or an authenticated server-side email process.
6. Invitee signs up or signs in.
7. On acceptance, create or link `dv_user`.
8. Create active `dv_account_user` membership.
9. Mark invite as accepted.

### 16.3 Membership actions

* Change role and granular permissions.
* Change relationship to viewer.
* Set or remove primary contact.
* Resend pending invite.
* Revoke pending invite.
* Remove account access through soft deletion.

Do not allow a user to remove the final account owner.

---

## 17. Settings page

Route:

```text
/dashboard/[accountId]/settings
```

Group settings into clear sections.

### 17.1 Account settings

Stored in `dv_account`.

Fields:

```text
account_name
primary_viewer_user_id
timezone
max_events_shown
show_next_reminder
auto_reset_to_today
morning_start_time
afternoon_start_time
evening_start_time
night_start_time
show_day_period
```

### 17.2 Display settings

Stored in `dv_display_preference`.

Fields:

```text
font_size
contrast
show_past_events
grey_out_past_events
layout
```

Use these supported values initially:

| Setting   | Values                             |
| --------- | ---------------------------------- |
| Font size | `standard`, `large`, `extra_large` |
| Contrast  | `standard`, `high`                 |
| Layout    | `standard`, `simplified`           |

### 17.3 Preference ownership rule

Use account-level defaults in MVP:

```text
dv_display_preference.account_id = current account
dv_display_preference.user_id = null
```

Add a unique partial index so that only one account-level default preference record exists per account.

Do not build user-specific display overrides in the first dashboard release, even though the schema permits them.

### 17.4 Account settings access

* Owner: all settings.
* Device manager: display settings only.
* Editor/carer/viewer: read-only or no access, according to product decisions.

### 17.5 Subscription section

Display, but do not build payment handling in MVP:

```text
subscription_status
stripe_customer_id presence
```

Use placeholder content such as:

```text
Your subscription is managed by Daily View support.
```

---

## 18. Prompts and update requests

Prompts use the existing `dv_update_prompt` structure.

They are useful where several family members share responsibility for keeping the display accurate.

Example prompt:

```text
Could you confirm whether Mum’s care visit is still at 4pm tomorrow?
```

### 18.1 Prompt creation

Available from the Today page and relevant event detail panels.

Fields:

```text
recipient
prompt type
message
delivery channel
related event, where applicable
```

The existing `dv_update_prompt` table does not include `event_id`. Add a nullable `event_id` foreign key to `dv_event` for event-related prompts.

### 18.2 Prompt statuses

```text
sent
pending
responded
dismissed
expired
```

### 18.3 MVP prompt behaviour

* Create the prompt record.
* Send an email or in-app notification where configured.
* Show pending prompts on the Today page.
* Do not automatically update an event from a response in MVP.
* Allow the recipient or editor to manually edit the event after reviewing the response.

---

## 19. API and service-layer design

Use a server-side service layer or server actions. Do not place raw Supabase table queries throughout UI components.

### 19.1 Required services

```text
AccountService
DashboardService
EventService
MessageService
DeviceService
MemberService
InviteService
DisplayViewModelService
PromptService
SettingsService
```

### 19.2 Suggested API endpoints

```text
GET    /api/accounts
GET    /api/accounts/:accountId/dashboard?date=YYYY-MM-DD

GET    /api/accounts/:accountId/events
POST   /api/accounts/:accountId/events
PATCH  /api/accounts/:accountId/events/:eventId
DELETE /api/accounts/:accountId/events/:eventId

POST   /api/accounts/:accountId/event-series
PATCH  /api/accounts/:accountId/event-series/:seriesId

GET    /api/accounts/:accountId/messages
POST   /api/accounts/:accountId/messages
PATCH  /api/accounts/:accountId/messages/:messageId
DELETE /api/accounts/:accountId/messages/:messageId

GET    /api/accounts/:accountId/devices
POST   /api/accounts/:accountId/devices
PATCH  /api/accounts/:accountId/devices/:deviceId
POST   /api/accounts/:accountId/devices/:deviceId/refresh
POST   /api/accounts/:accountId/devices/:deviceId/pairing-code

GET    /api/accounts/:accountId/members
POST   /api/accounts/:accountId/invites
PATCH  /api/accounts/:accountId/members/:userId
DELETE /api/accounts/:accountId/members/:userId

GET    /api/accounts/:accountId/settings
PATCH  /api/accounts/:accountId/settings

POST   /api/accounts/:accountId/prompts
```

Device-only endpoints:

```text
POST /api/device/pair
POST /api/device/heartbeat
GET  /api/device/display-model
```

### 19.3 Service requirements

Every write operation must:

1. Confirm authenticated user identity.
2. Confirm account membership.
3. Confirm the required granular permission.
4. Validate request body.
5. Apply soft deletion where relevant.
6. Record creator/updater fields.
7. Return a safe, typed response.
8. Avoid exposing hidden fields such as device secrets or invite token hashes.

---

## 20. Display view-model rules

Create one shared display-selection function. It must be the only source of truth for what the viewer sees.

Pseudo-logic:

```text
1. Resolve account and account timezone.
2. Resolve active device, where applicable.
3. Determine current account-local date and time.
4. Determine day period using account thresholds.
5. Load active display message.
6. Load eligible events for today.
7. Remove deleted, cancelled, hidden, private and account-only events.
8. Apply past-event rules.
9. Sort events.
10. Limit to max_events_shown.
11. Identify the next upcoming event.
12. Return structured display content.
```

Example response:

```json
{
  "accountName": "Mum's Daily View",
  "dateLabel": "Thursday, 11 June 2026",
  "timeLabel": "10:30",
  "dayPeriod": "morning",
  "message": "Clare will visit at 5pm.",
  "events": [
    {
      "title": "Hair appointment",
      "timeLabel": "11:00",
      "isPast": false
    },
    {
      "title": "Lunch with Sarah",
      "timeLabel": "12:00",
      "isPast": false
    },
    {
      "title": "Care visit",
      "timeLabel": "16:00",
      "isPast": false
    }
  ],
  "nextEvent": {
    "title": "Hair appointment",
    "timeLabel": "11:00"
  },
  "preferences": {
    "fontSize": "large",
    "contrast": "high",
    "layout": "standard"
  }
}
```

---

## 21. Accessibility requirements

The dashboard is likely to be used by people under time pressure and by older family members.

Build to WCAG 2.2 AA where practical.

Requirements:

* Keyboard-operable navigation and forms.
* Visible focus states.
* Clear labels; do not rely only on icons.
* Minimum sensible touch targets on mobile.
* Error messages adjacent to the relevant field.
* Good colour contrast.
* Status should never be conveyed using colour alone.
* Use plain language: “Screen is offline” rather than “Heartbeat timeout”.
* Confirm destructive actions.
* Support browser zoom without broken layouts.
* Use readable date formats, for example `Thursday, 11 June 2026`.

---

## 22. Audit and data-handling requirements

Create a lightweight `dv_audit_log` table or equivalent server-side audit process.

Track:

```text
account_id
actor_user_id
action
entity_type
entity_id
before_value where appropriate
after_value where appropriate
created_at
```

Audit at minimum:

* Event creation, update, cancellation and deletion.
* Message creation, update and deletion.
* Device pairing, deactivation and removal.
* Member invitation, permission change and removal.
* Settings changes.

Do not log device secrets, raw invite tokens, passwords or authentication tokens.

---

## 23. Error and empty states

### 23.1 Today page

* No events today: “Nothing has been added for today yet.”
* No devices: “Add a Daily View screen to see its connection status here.”
* Device offline: “This screen has not checked in recently. Check its power and internet connection.”

### 23.2 Calendar

* No events in selected period: “No events are scheduled for this period.”
* No permission: “You can view the schedule, but only an editor can make changes.”

### 23.3 Messages

* No messages: “Use a message for a short, important update that should stand out on the screen.”

### 23.4 People

* No collaborators: “Invite a family member or carer to help keep Daily View up to date.”

### 23.5 Devices

* Pairing code expired: “This pairing code has expired. Create a new one and try again.”

---

## 24. Analytics events

Track product usage without recording sensitive event content.

Suggested analytics events:

```text
dashboard_opened
dashboard_account_switched
event_created
event_updated
event_cancelled
event_deleted
recurring_event_created
message_created
message_deleted
device_pairing_started
device_paired
device_refresh_requested
member_invited
member_removed
display_settings_updated
prompt_sent
```

Include account ID only as a pseudonymous internal identifier where appropriate. Do not send event titles, message content or personal names to third-party analytics systems.

---

## 25. Testing requirements

### 25.1 Unit tests

Test:

* Day-period calculation.
* Event filtering and sorting.
* Display view-model generation.
* Event priority ordering.
* Past-event display rules.
* Active message selection.
* Device status calculation.
* Permission helper functions.
* Recurrence occurrence generation.
* Invite-token expiry validation.

### 25.2 Integration tests

Test:

* Authenticated user gets correct `dv_user`.
* User can only access accounts they belong to.
* Editor can create event but cannot remove a user.
* Device manager can refresh a device but cannot edit events.
* Viewer cannot modify any data.
* Event changes appear in dashboard preview.
* Device pairing code cannot be reused.
* Deleted events are excluded from display view model.
* Cancelled events are excluded from display view model.
* Account timezone is correctly applied around daylight-saving changes.

### 25.3 RLS tests

Create tests using two accounts and multiple users.

Verify that a user from Account A cannot:

* Read events from Account B.
* Guess a device ID from Account B.
* Fetch another account’s display preferences.
* Invite members to Account B.
* View another account’s prompts.
* Modify another user’s membership outside their account.

---

## 26. Delivery order

### Phase 1 — Foundation

1. Confirm existing `dv_` table definitions in the active Supabase project.
2. Create required migrations.
3. Seed lookup values.
4. Add RLS policies and permission helper functions.
5. Implement `dv_user` creation/linking from Supabase Auth.
6. Create shared typed database models.

### Phase 2 — Core dashboard

1. Dashboard shell and account selector.
2. Today page.
3. Shared display view-model service.
4. Event create, edit, cancel and soft-delete flows.
5. Calendar agenda and week view.
6. Settings for display behaviour.

### Phase 3 — Collaboration and devices

1. Messages page.
2. Device list and status cards.
3. Device pairing flow.
4. People page and invitation flow.
5. Prompt creation and pending-prompt display.

### Phase 4 — Recurrence and hardening

1. Recurring-event series.
2. Background generation of 90-day event occurrences.
3. Audit logging.
4. Full test coverage.
5. Accessibility pass.
6. Responsive/mobile refinement.

---

## 27. Definition of done

The dashboard feature is complete when:

* Authenticated users can see only accounts they belong to.
* An authorised editor can add an event in under one minute.
* The Today page accurately previews what the viewer sees.
* Event and message changes appear in the display view model immediately.
* Device status is visible and understandable.
* Device pairing uses an expiring, single-use code.
* Account owners can invite and remove trusted collaborators.
* Roles and granular permissions are enforced server-side and by RLS.
* All times are interpreted in the account timezone.
* Soft-deleted and cancelled content never appears on the Daily View display.
* Mobile layouts support the core tasks: check today, add an event, send a message and view device status.
* Automated tests cover permissions, display logic, timezone behaviour and account isolation.

---

## 28. Coding-agent implementation constraints

The coding agent must:

1. Use only the `dv_` domain tables for Daily View functionality.
2. Treat the supplied schema as context, not as executable SQL.
3. Inspect the actual active Supabase schema before writing migrations.
4. Add migrations rather than editing the database manually.
5. Preserve existing public website functionality.
6. Use RLS and server-side authorisation for every account-scoped action.
7. Avoid service-role credentials in browser code.
8. Keep display-selection rules in one shared service.
9. Prefer small, testable components and typed service methods.
10. Implement the dashboard in phases without blocking core event management on advanced features such as billing or external calendar sync.

