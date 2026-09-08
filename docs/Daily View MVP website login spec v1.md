\
# Daily View: Secure Login and Access Gateway — Technical Design Specification

**Repository:** `https://github.com/PLAMartin/DailyView`  
**Primary route:** `/login/`  
**Supporting routes:** `/auth/callback/`, `/forgot-password/`, `/reset-password/`, `/dashboard/`  
**Version:** 1.0  
**Status:** Ready for implementation  
**Date:** 5 July 2026  

---

## 1. AI coding agent brief

Implement a secure, calm and accessible **Daily View login and account-access gateway** in the existing `PLAMartin/DailyView` repository.

The login is for people who manage a Daily View account: family members, friends, carers and authorised care staff. It is **not** for the person who simply reads the dedicated Daily View screen at home.

Before coding:

1. Read `CLAUDE.md`.
2. Inspect the existing `index.html`, `/assets` directory, existing waitlist behaviour and current public navigation.
3. Preserve the existing lightweight public-site approach: plain HTML, CSS and JavaScript. Do not add React, Next.js, TypeScript, Tailwind, npm packages or a build step.
4. Use Supabase Auth only through its browser client and existing Supabase project configuration. Do not create a separate authentication service.
5. Use the existing `dv_` schema as the application data model. In particular, use:
   - `dv_user.auth_user_id` as the link to `auth.users.id`;
   - `dv_account` as the household, resident or organisation account;
   - `dv_account_user` as the active account-membership and access-control record;
   - `dv_account_user_role`, `dv_account_user_permission` and the explicit `can_manage_*` fields as the authorisation model.
6. Keep all privileged operations, including invitation creation and Supabase Admin API calls, server-side. A browser must never receive a service-role key.

The result must work on Vercel and provide a reliable path from a public marketing page to a signed-in Daily View account.

---

## 2. Context and product decision

Daily View is a calm shared display that helps a person understand what is happening today. A trusted person updates plans remotely; the person at home sees one clear, reassuring display.

The first signed-in users are likely to be:

- a relative or friend supporting somebody at home;
- a carer or support worker;
- an authorised member of care-home staff;
- an account administrator responsible for setup and devices.

The person using the dedicated Daily View display does **not** need to remember a password, use email or sign in to the public website.

### 2.1 Authentication decision

Use **email-and-password sign-in as the primary method**, with a secondary **secure email sign-in link** option.

This offers a familiar route for regular users while allowing someone who has forgotten their password to access their account without creating a support burden.

### 2.2 Account-creation decision

Daily View is **invitation-only in version 1**.

There is no public “Create account” page. A prospective customer applies through the existing waitlist/free-trial route. A Daily View administrator then provisions the account and invites approved users.

This prevents unqualified accounts, avoids accidental creation of records for the person being supported, and keeps the first launch operationally simple.

---

## 3. Objectives

### 3.1 Required outcomes

A visitor must be able to:

- Open `/login/` directly from any device.
- Sign in with an authorised email address and password.
- Request a one-time secure sign-in link instead of entering a password.
- Request a password-reset email.
- Complete the password-reset journey.
- Return from an authentication email link without exposing tokens in the visible address bar.
- Reach `/dashboard/` only after both authentication and Daily View account-membership checks succeed.
- See a clear, non-technical message when their credentials are valid but they have not been granted Daily View access.
- Sign out from the authenticated area.
- Use the primary login, recovery and error paths with keyboard-only navigation.
- Use the pages on desktop, tablet and mobile without horizontal scrolling.

### 3.2 Explicit non-goals

Do **not** implement any of the following in this task:

- Public self-service registration.
- Public account creation or automatic trial provisioning.
- Payments, subscriptions, checkout or Stripe portal access.
- A full user-administration interface.
- An invitation-management interface.
- Device pairing or device-management workflows.
- Event editing, reminders, prompts or account-settings screens.
- Social sign-in providers.
- “Remember me” options that manually store passwords or tokens.
- Passkeys, MFA, single sign-on or organisation SAML.
- A bespoke server-side password store.
- Any use of Supabase service-role credentials in public JavaScript.

A minimal authenticated `/dashboard/` access gate is required only because login needs a safe destination. It is not a full dashboard implementation.

---

## 4. Relevant Daily View data model

The following existing tables are relevant to sign-in and authorisation.

| Table | Purpose in this implementation | Login requirement |
|---|---|---|
| `auth.users` | Supabase’s authentication identity | Supabase owns passwords, magic links, recovery tokens and sessions. |
| `dv_user` | Daily View’s person record | Match the signed-in user with `dv_user.auth_user_id = auth.users.id`. |
| `dv_user_type` | User category | Used during invitation/provisioning, not for public sign-in decisions. |
| `dv_account` | Household, resident, supported-living or care-organisation account | A signed-in user must have at least one active account relationship. |
| `dv_account_user` | Membership and per-account capability flags | This is the authoritative access record. A membership is active only where `deleted_at IS NULL`. |
| `dv_account_user_role` | Human-readable role | Used to explain the user’s role and guide later dashboard UI. |
| `dv_account_user_permission` | Permission classification | Retain as the database model; do not trust it alone for write access. |
| `dv_device` | Linked display devices | Not read on the login page, except by later dashboard/device pages. |
| `dv_event` | Account events | Not read or written by login pages. Later event policies must require `can_manage_events = true`. |
| `dv_display_preference` | Per-user/account display preferences | Not read or written by login pages. |

### 4.1 Identity and membership rules

A login may continue only when all of the following are true:

1. Supabase has authenticated the user.
2. A `dv_user` row exists with `auth_user_id` equal to the authenticated Supabase user ID.
3. `dv_user.is_active = true`.
4. At least one `dv_account_user` row exists for that `dv_user.user_id`.
5. That membership has `deleted_at IS NULL`.
6. The associated Daily View account still exists.

Do **not** use `dv_user.email` as the security identity. It is useful contact data, but it is not unique in the supplied schema. The authoritative identity link is `dv_user.auth_user_id`.

### 4.2 Authorisation rules

- Authentication answers: **“Who is this person?”**
- `dv_account_user` answers: **“Which Daily View account can they access?”**
- The role, permission record and boolean capabilities answer: **“What can they do within that account?”**

The client may use capability flags to show or hide controls, but every data policy and server-side operation must independently enforce the same permissions.

---

## 5. Technical architecture

### 5.1 Front-end approach

Use only semantic HTML, vanilla CSS and vanilla JavaScript.

Supabase Auth may be loaded with a pinned, tested Supabase JavaScript v2 browser build. Do not use a floating `latest` URL and do not add a package manager or build step.

Use a single shared browser-auth module for session handling, auth requests and membership checks.

### 5.2 Routes and files

Create the following routes and files:

```text
/login/
  index.html
  login.css
  login.js

/auth/callback/
  index.html
  callback.js

/forgot-password/
  index.html
  forgot-password.css
  forgot-password.js

/reset-password/
  index.html
  reset-password.css
  reset-password.js

/dashboard/
  index.html
  dashboard.css
  dashboard.js

/assets/js/
  dv-auth-config.js
  dv-auth.js
```

### 5.3 Shared configuration

Create `/assets/js/dv-auth-config.js` with public browser configuration only:

```js
window.DAILY_VIEW_AUTH_CONFIG = {
  supabaseUrl: 'https://YOUR_PROJECT.supabase.co',
  supabaseAnonKey: 'YOUR_PUBLIC_ANON_OR_PUBLISHABLE_KEY',
  siteUrl: 'https://www.dailyview.org'
};
```

Requirements:

- The Supabase URL and browser anon/publishable key are public configuration, not secrets.
- Never put a service-role key, database password, SMTP key or Stripe secret in this file.
- The source of truth for data protection is Supabase Row Level Security (RLS), not hiding an anon key.
- Use the deployed production site URL in Supabase Auth redirect settings.
- Test preview-deployment redirects separately; do not open production redirects to arbitrary Vercel preview URLs.

### 5.4 Shared auth module

`/assets/js/dv-auth.js` must:

1. Initialise one Supabase browser client using the shared public config.
2. Enable normal session persistence and token refresh through the Supabase client.
3. Never manually save passwords, access tokens or refresh tokens.
4. Export helpers for:
   - `getSession()`
   - `getCurrentUser()`
   - `signInWithPassword(email, password)`
   - `sendMagicLink(email, redirectPath)`
   - `sendPasswordReset(email)`
   - `completePasswordReset(newPassword)`
   - `signOut()`
   - `getMyAccountAccess()`
   - `requireDailyViewAccess()`
5. Safely derive redirect targets from an allow-list of internal paths only.
6. Remove one-time auth-code query parameters from browser history once exchanged.

---

## 6. Supabase and environment configuration

Before public testing, configure the existing Supabase project as follows.

### 6.1 Auth settings

- Enable email-and-password authentication.
- Enable email one-time-password / magic-link authentication.
- Disable public user signup.
- Configure trusted production redirect URLs:
  - `https://www.dailyview.org/auth/callback/`
  - `https://www.dailyview.org/reset-password/`
- Add the equivalent staging URL only if a controlled staging site exists.
- Use a branded sender name and a `dailyview.org` sending address.
- Configure reasonable rate limits for password reset and email-link requests.
- Enable CAPTCHA protection for email-link and recovery requests before public launch where supported by the chosen Supabase configuration.
- Use short-lived, single-use recovery and magic links in accordance with the Supabase project’s supported security settings.

### 6.2 Vercel

- Serve all pages as static routes.
- Do not deploy server-only auth code to the browser.
- Preserve the existing landing-page and waitlist routes.
- Add security headers appropriate to the existing asset sources. The Content Security Policy must permit:
  - the Daily View origin;
  - the configured Supabase project endpoint for `connect-src`;
  - the pinned Supabase browser script source, if loaded from a CDN;
  - current approved font and image sources.
- Do not use a wildcard Supabase origin in the policy where a single project endpoint is known.

---

## 7. Required database access layer and RLS

### 7.1 Account-access RPC

Create one read-only Supabase RPC named:

```text
dv_get_my_account_access()
```

It must return the active Daily View accounts available to the currently authenticated Supabase user.

Minimum returned fields:

```text
account_id
account_name
account_type
user_id
full_name
preferred_name
role
relationship_to_viewer
permission
can_manage_events
can_manage_users
can_manage_devices
can_send_prompts
is_primary_contact
timezone
```

Required rules:

- It must use `auth.uid()` internally.
- It must return no rows to anonymous users.
- It must include only:
  - `dv_user.auth_user_id = auth.uid()`;
  - `dv_user.is_active = true`;
  - `dv_account_user.deleted_at IS NULL`.
- It must not accept a user ID or account ID argument.
- It must not return other members’ emails, mobile numbers, dates of birth, notes or accessibility notes.
- It must be safe to call from the browser with the anon/publishable key.
- If implemented as `SECURITY DEFINER`, set a fixed safe `search_path`, tightly scope returned columns, and grant execute only to the `authenticated` role.

### 7.2 Required RLS outcomes

Enable RLS on all `dv_` application tables before exposing them through the browser client.

At a minimum, enforce these outcomes:

| Data | Required policy outcome |
|---|---|
| `dv_user` | A user may read their own profile only. |
| `dv_account` | A user may read an account only where they have an active membership. |
| `dv_account_user` | A user may read membership records only for accounts they actively belong to. |
| `dv_event` | A user may read events only for accounts they actively belong to; create/update/delete requires the relevant active membership and `can_manage_events = true`. |
| `dv_device` | A user may read devices only for accounts they actively belong to; changes require `can_manage_devices = true`. |
| `dv_update_prompt` | Read/send capabilities must honour membership and `can_send_prompts = true`. |
| `dv_display_preference` | A user may read/update only their own permitted preference rows. |

Do not rely on front-end logic for any of these controls.

### 7.3 Recommended indexes

Add database indexes that support the membership check without changing application meaning:

```sql
CREATE INDEX IF NOT EXISTS dv_account_user_active_user_idx
  ON public.dv_account_user (user_id, account_id)
  WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS dv_account_user_active_account_idx
  ON public.dv_account_user (account_id, user_id)
  WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS dv_user_active_auth_idx
  ON public.dv_user (auth_user_id)
  WHERE is_active = true;
```

`dv_user.auth_user_id` is already unique in the supplied schema. Do not add a duplicate unique constraint.

---

## 8. Provisioning and invitation dependency

Public registration is out of scope, but login requires a reliable way to create authorised users.

### 8.1 Provisioning sequence

A Daily View administrator or secure server-side provisioning function must:

1. Create or identify the target `dv_account`.
2. Create the `dv_user` record with:
   - `full_name`;
   - `preferred_name` where supplied;
   - `email`;
   - valid `user_type_id`;
   - `is_active = true`.
3. Create the active `dv_account_user` membership with:
   - correct `role_id`;
   - correct `permission_id`;
   - only the capabilities the person needs;
   - `is_primary_contact = true` only where appropriate.
4. Create the corresponding Supabase Auth identity with an authorised server-side Admin API or Supabase invitation operation.
5. Save the returned `auth.users.id` into `dv_user.auth_user_id`.
6. Send the secure invitation email through Supabase Auth.
7. Record any operational audit information outside the browser.

### 8.2 Invitation constraints

- An invitation must not be created from the public login page.
- Do not send an invitation until a valid `dv_user` and active `dv_account_user` membership exist.
- A person may belong to more than one account. Do not duplicate their `dv_user` or Auth identity merely because they support more than one person.
- The display viewer may have a `dv_user` record for modelling purposes but should not receive a public-web login unless a product requirement explicitly changes.

---

## 9. Public navigation changes

Once `/login/` is live, add a quiet **Log in** text link to the public header.

### 9.1 Desktop header

Use this order:

```text
[Daily View logo]  How it works  Who it’s for  Features
                                      [Try demo]  Log in
```

- **Try demo** remains a secondary/outlined button linking to `/try-demo/`.
- **Log in** is a plain text link linking to `/login/`.
- Do not make **Log in** compete visually with the primary free-trial/waitlist call to action.

### 9.2 Mobile menu

Show these actions first:

```text
Log in
Try demo
How it works
Who it’s for
Features
```

The existing **Apply for a free trial** call to action remains visually primary.

---

## 10. Login page: content and layout

### 10.1 Required page copy

Use the following primary copy:

```text
Sign in to Daily View

Manage today’s plan for the person you support.

Use the email address linked to your Daily View account.
```

Under the form, show:

```text
New to Daily View?
Apply for a free trial
```

The free-trial action links to `/#register-interest`.

### 10.2 Page layout

Use a calm, single-purpose layout. This is not a dashboard.

Desktop and tablet:

```text
┌────────────────────────────────────────────────────────────────┐
│ [Daily View logo]                                  Back to home │
│                                                                │
│       ┌────────────────────────────────────────────────┐       │
│       │ Sign in to Daily View                           │       │
│       │ Manage today’s plan for the person you support. │       │
│       │                                                │       │
│       │ Email address                                  │       │
│       │ [                                                ]     │
│       │ Password                                       │       │
│       │ [                                                ]     │
│       │ [Show password]                                 │       │
│       │                                                │       │
│       │ [Sign in]                                      │       │
│       │ Forgot password?                               │       │
│       │                                                │       │
│       │ ───────────────  or  ───────────────           │       │
│       │ [Email me a secure sign-in link]               │       │
│       │                                                │       │
│       │ New to Daily View? Apply for a free trial      │       │
│       └────────────────────────────────────────────────┘       │
│                                                                │
└────────────────────────────────────────────────────────────────┘
```

Mobile:

- Keep the same sequence in a single column.
- Use 16px or larger input text to avoid unwanted mobile-browser zoom.
- Keep the main form comfortably readable at 320px.
- Do not use a decorative large product mock-up that pushes the form below the fold.
- Do not require horizontal scrolling.

### 10.3 Visual style

Match the existing Daily View public-site design:

- Source Sans Pro.
- Navy primary colour, approximately `#1a2b6d`.
- Existing soft blue/lavender backgrounds.
- White form panel with gentle rounded corners.
- Generous spacing and high readability.
- Visible focus treatment with strong contrast.
- Plain, reassuring language; no technical Supabase terminology.

---

## 11. Login form behaviour

### 11.1 Controls

Use a real `<form>` with the following controls.

| Field/action | HTML control | Requirement |
|---|---|---|
| Email address | `<input type="email">` | Required; `autocomplete="email"`; trim and lowercase only for the request, not for display. |
| Password | `<input type="password">` | Required for password sign-in; `autocomplete="current-password"`. |
| Show password | `<button type="button">` | Toggles password visibility and updates accessible label/state. |
| Sign in | `<button type="submit">` | Primary/filled button. |
| Forgot password? | `<a>` | Links to `/forgot-password/`. |
| Email me a secure sign-in link | `<button type="button">` | Uses the current email value; it must validate email before making a request. |
| Apply for a free trial | `<a>` | Links to `/#register-interest`. |

Use visible `<label>` elements. Placeholders are not labels.

### 11.2 Initial state

When `/login/` loads:

1. Do not auto-focus a field.
2. Check whether a valid Supabase session already exists.
3. If a valid session and active Daily View membership exist, redirect to `/dashboard/`.
4. If the session exists but the membership check fails, sign out locally and show the access-not-set-up state in section 11.5.
5. Otherwise, show the standard blank login form.

### 11.3 Password sign-in action

On valid form submit:

1. Prevent the standard browser submit.
2. Clear prior form-level error text.
3. Disable the submit button and change its label to `Signing in…`.
4. Call Supabase `signInWithPassword`.
5. On authentication success, call `dv_get_my_account_access()`.
6. If the RPC returns one or more accounts:
   - redirect to `/dashboard/`;
   - preserve only an approved internal `next` path, when present.
7. If the RPC returns no accounts:
   - sign out locally;
   - show the access-not-set-up message;
   - do not expose account or membership details.
8. Re-enable the button on all failure paths.

### 11.4 Generic sign-in failure copy

For invalid credentials or an unrecognised email, show:

```text
We could not sign you in with those details.
Check your email and password, try a secure sign-in link, or reset your password.
```

Do not say whether an email address exists. Do not reveal whether a password was wrong.

### 11.5 Valid identity, no Daily View access

When authentication succeeds but the user has no valid Daily View membership, show:

```text
Your sign-in worked, but this email has not yet been given access to a Daily View account.

Please contact the person who invited you or email support@dailyview.org.
```

Then sign out locally. This prevents an authenticated but unauthorised browser session from lingering.

### 11.6 Network failure copy

For a network or unexpected service failure, show:

```text
We could not reach Daily View just now. Please check your connection and try again.
```

Do not report raw server errors, SQL details, tokens or Supabase error codes to the visitor.

---

## 12. Secure email sign-in link

### 12.1 Behaviour

The **Email me a secure sign-in link** action must:

1. Validate the email field first.
2. Use Supabase `signInWithOtp` with:
   - a redirect URL of `/auth/callback/`;
   - `shouldCreateUser: false`;
   - a safe internal post-login path of `/dashboard/`.
3. Always show the same confirmation response for syntactically valid email addresses:

```text
If this email is linked to Daily View, we have sent a secure sign-in link.
Please check your inbox and spam folder.
```

4. Do not disclose whether the email exists.
5. Do not send an email to create a new public account.
6. Leave the email address visible so the user can correct it.
7. Keep keyboard focus on the confirmation heading or the action button; do not jump the visitor to the footer.

### 12.2 Callback route

`/auth/callback/` must:

1. Read the one-time code or recognised callback parameters.
2. Exchange the code for a Supabase session using the approved Supabase client flow.
3. Remove sensitive callback parameters from the visible URL using browser history replacement.
4. Call `dv_get_my_account_access()`.
5. Redirect to `/dashboard/` only after a valid active membership is returned.
6. Sign out and show the access-not-set-up message if authentication succeeds but authorisation fails.
7. Send an expired, invalid or already-used link back to `/login/` with a clear non-technical message:

```text
That sign-in link is no longer valid. Please request a new one.
```

Do not allow an arbitrary external `next` URL.

---

## 13. Password recovery and reset

### 13.1 Forgot-password page

Route: `/forgot-password/`

Required copy:

```text
Reset your password

Enter the email address linked to your Daily View account and we will send you a secure reset link.
```

Controls:

| Field/action | Requirement |
|---|---|
| Email address | Required email input with visible label and `autocomplete="email"`. |
| Send reset link | Primary button. |
| Back to sign in | Plain link to `/login/`. |

Behaviour:

1. Validate email syntax.
2. Call Supabase `resetPasswordForEmail` with redirect URL `/reset-password/`.
3. Always show the same confirmation after a syntactically valid request:

```text
If this email is linked to Daily View, we have sent password-reset instructions.
Please check your inbox and spam folder.
```

4. Do not reveal account existence.
5. Rate limiting and CAPTCHA must be handled by the Supabase project configuration rather than custom JavaScript.

### 13.2 Reset-password page

Route: `/reset-password/`

Required copy:

```text
Choose a new password

Use at least 12 characters. A longer passphrase is easier to remember and more secure.
```

Controls:

| Field/action | Requirement |
|---|---|
| New password | Required password input; `autocomplete="new-password"`. |
| Confirm password | Required password input; `autocomplete="new-password"`. |
| Show password | Accessible toggle for both password fields. |
| Save new password | Primary button. |

Validation:

- Minimum 12 characters.
- New password and confirmation must match.
- Show text-based inline validation.
- Keep focus in the first field with an error.

Completion:

1. Confirm there is a valid password-recovery session from Supabase.
2. Call Supabase `updateUser({ password: newPassword })`.
3. On success, sign out locally.
4. Redirect to `/login/` with:

```text
Your password has been updated. You can now sign in.
```

5. For an invalid or expired reset link, show:

```text
This password-reset link is no longer valid. Please request a new one.
```

---

## 14. Minimal authenticated dashboard access gate

A full dashboard is out of scope. `/dashboard/` exists only as a protected landing destination for a successful login.

### 14.1 Required dashboard behaviour

On load:

1. Require a valid Supabase session.
2. Call `dv_get_my_account_access()`.
3. If no active access record exists:
   - sign out locally;
   - redirect to `/login/` with the access-not-set-up message.
4. If exactly one account is returned:
   - show a calm, temporary signed-in state:

```text
Welcome, [preferred name or first name].

You are signed in to [account name].
Your Daily View account area is being prepared.
```

   - include a **Sign out** control.
5. If two or more accounts are returned:
   - show a simple account choice, not an automatic selection:

```text
Choose the Daily View account you want to open
```

   - display account name and relationship/role only.
   - selecting an account may update only in-memory page state in version 1.
   - do not use URL account IDs as an authorisation decision; every later data request must still prove membership through RLS.
6. Do not show event data, device data, personal-contact data or account-management controls in this task.

### 14.2 Sign out

The authenticated area must provide a clear **Sign out** button.

On selection:

1. Call the Supabase local sign-out method.
2. Clear any temporary active-account state held in page memory.
3. Redirect to `/login/`.
4. Announce:

```text
You have signed out.
```

---

## 15. Accessibility requirements

Accessibility is a core acceptance criterion.

### Required

- One clear `<h1>` per page, followed by logical nested headings.
- Visible labels associated with every field.
- Error text linked to the relevant field using `aria-describedby`.
- Invalid controls use `aria-invalid="true"` after validation fails.
- A polite live region announces submission status and success confirmations.
- Keyboard-only journey works for sign-in, magic-link request, reset request, reset completion, account choice and sign-out.
- All interactive elements have clear, high-contrast focus styles.
- Buttons and links meet a practical 44 × 44 CSS-pixel target where possible.
- The show-password control exposes its state clearly to assistive technology.
- Password fields never auto-fill into visible text without an intentional control activation.
- Error handling does not rely on colour alone.
- The form does not clear a valid email field after a failed request.
- No auto-play media, distracting animation, modal traps or time-limited UI.
- `prefers-reduced-motion: reduce` disables non-essential movement and smooth scrolling.
- Screen-reader reading order matches the visual order.

---

## 16. Security and privacy requirements

### 16.1 Required controls

- Use Supabase Auth; do not handle password hashing directly.
- Use HTTPS-only production redirects.
- Do not place a service-role key or database credential in the public repo or browser.
- Use RLS for every `dv_` table exposed to the browser.
- Never trust `account_id`, `role_id`, permission flags or `next` values supplied by a query string or local JavaScript state.
- Permit only known internal post-auth destinations.
- Do not render error messages with `innerHTML` when they could contain service text; use safe text rendering.
- Do not log passwords, magic links, recovery links, access tokens or refresh tokens to the browser console, analytics or error reporting.
- Do not include account names, email addresses or role details in public error URLs.
- Use generic messages for unknown-email and wrong-password states.
- Do not create records from login, password-reset or magic-link requests.
- Ensure every email page is branded clearly enough that a recipient can identify it as Daily View, without including sensitive account information.

### 16.2 Session approach

- Use the Supabase client’s normal secure session persistence and refresh handling.
- Never create a bespoke cookie, local-storage item or session-storage item for raw auth tokens.
- A logged-in user may remain signed in on their own device according to Supabase session settings.
- Provide a clear sign-out control.
- For a shared or care-home computer, the operational guidance should be to sign out after use; version 1 does not need a custom “private device” toggle.

---

## 17. Responsive requirements

### Desktop: 1024px and above

- Public header includes the quiet **Log in** link.
- Login panel is centred and approximately 420–520px wide.
- Keep generous surrounding space; do not stretch form fields across the entire screen.
- Back-to-home link remains available.

### Tablet: 700px–1023px

- Keep the login panel centred with comfortable side margins.
- Inputs and buttons retain large tap targets.
- Do not compress error copy into a single dense line.

### Mobile: below 700px

- Single-column layout.
- At least 16px input font size.
- Full-width primary button.
- Supporting links remain distinct tap targets.
- No horizontal scrolling at 320px.
- Preserve visible labels and helper text rather than replacing them with icons.

---

## 18. Quality and implementation requirements

- Use semantic HTML and vanilla CSS/JavaScript only.
- Do not add React, Next.js, TypeScript, Tailwind, npm packages or a build step.
- Keep shared auth code in `/assets/js/dv-auth.js`; do not duplicate session handling across pages.
- Do not change existing waitlist submission behaviour.
- Preserve existing legal links and footer.
- Add a subtle loading state to async buttons and prevent duplicate submissions.
- Do not use `innerHTML` with visitor-entered values.
- Use `textContent` or safe DOM construction for visitor-facing status messages.
- Ensure assets and internal URLs resolve from nested routes.
- Add no analytics event that includes email addresses, user IDs, account names, access status or error text.
- No console errors or unhandled promise rejections in the normal success or failure paths.

---

## 19. Acceptance criteria

### Authentication and authorisation

- [ ] `/login/` loads as a standalone route.
- [ ] Existing authorised users can sign in with email and password.
- [ ] Unknown email and wrong password receive the same generic sign-in message.
- [ ] Secure email-link login does not create a new user.
- [ ] Password recovery does not reveal whether an email exists.
- [ ] Valid magic-link and reset-link callbacks remove sensitive one-time parameters from the visible address bar.
- [ ] A signed-in user cannot reach `/dashboard/` without an active `dv_user` and `dv_account_user` relationship.
- [ ] A valid Auth identity with no Daily View membership is signed out and shown the access-not-set-up message.
- [ ] A user with one valid account reaches the temporary signed-in dashboard state.
- [ ] A user with multiple valid accounts sees an account choice.
- [ ] Sign out returns the user to `/login/`.

### Database and security

- [ ] `dv_get_my_account_access()` returns only active memberships belonging to `auth.uid()`.
- [ ] Anonymous users cannot retrieve Daily View account data.
- [ ] RLS protects `dv_user`, `dv_account`, `dv_account_user`, `dv_event`, `dv_device`, `dv_update_prompt` and `dv_display_preference`.
- [ ] No browser source contains a Supabase service-role key or other secret.
- [ ] No public sign-up route exists.
- [ ] Login does not create or update `dv_user`, `dv_account`, `dv_account_user` or `dv_event` records.
- [ ] Unsafe external `next` URLs cannot redirect the user off Daily View.

### Design and accessibility

- [ ] Login matches the existing Daily View visual system.
- [ ] Form fields have visible labels, clear focus states and accessible errors.
- [ ] Keyboard-only sign-in, magic-link, recovery, reset and sign-out journeys work.
- [ ] The layout works at 1440px, 1024px, 768px, 390px and 320px.
- [ ] The page respects reduced-motion preferences.
- [ ] Public-site navigation continues to work, including Try demo and waitlist links.

### Regression protection

- [ ] Homepage still loads.
- [ ] Existing waitlist flow remains intact.
- [ ] Existing legal links remain intact.
- [ ] No console errors occur.
- [ ] No unauthorised network requests are made to non-Daily-View services.
- [ ] No framework, package manager or build step is added.

---

## 20. Manual test plan

Perform these checks before returning implementation work.

1. Open `/login/` in a new private browser session.
2. Confirm the page shows the required copy, blank form and free-trial link.
3. Submit blank fields; confirm accessible inline validation and focus placement.
4. Enter a malformed email; confirm accessible email validation.
5. Use a valid authorised email with a wrong password; confirm generic failure copy.
6. Use an unrecognised email with any password; confirm the same generic failure copy.
7. Use a valid authorised email and password; confirm redirection to `/dashboard/`.
8. Confirm the temporary dashboard does not show events, devices or other users’ details.
9. Sign out; confirm `/login/` and sign-out confirmation.
10. Request a secure sign-in link with an authorised email; confirm generic confirmation copy.
11. Request a secure sign-in link with an unrecognised email; confirm the same confirmation copy.
12. Follow a valid secure sign-in link; confirm the callback exchanges the code, clears visible parameters and reaches `/dashboard/`.
13. Use an expired or already-used sign-in link; confirm the clear invalid-link message.
14. Request password reset with authorised and unrecognised addresses; confirm identical confirmation copy.
15. Follow a valid reset link; test mismatched passwords, an under-12-character password and then a valid password.
16. Confirm that successful reset requires a fresh sign-in.
17. Test a Supabase-authenticated identity with no active `dv_account_user` membership; confirm it is signed out and shown the access-not-set-up message.
18. Test an inactive `dv_user`; confirm access is refused.
19. Test a user with two active account memberships; confirm the dashboard displays an account choice.
20. Attempt direct navigation to `/dashboard/` while signed out; confirm redirect to `/login/`.
21. Attempt `next=https://example.com`; confirm it is ignored.
22. Test Tab, Shift+Tab, Enter and Space through all pages without a mouse.
23. Test at 1440px, 1024px, 768px, 390px and 320px widths.
24. Test with `prefers-reduced-motion: reduce`.
25. Check browser console and Network tab for errors, unapproved domains, token leakage or duplicate auth calls.
26. Check the homepage, Try demo page, waitlist submission and legal links for regressions.

---

## 21. Deliverables

Return:

1. New `/login/` page files.
2. New `/auth/callback/` page files.
3. New `/forgot-password/` page files.
4. New `/reset-password/` page files.
5. Minimal protected `/dashboard/` access-gate files.
6. Shared `/assets/js/dv-auth-config.js` and `/assets/js/dv-auth.js`.
7. Supabase SQL migration(s) for:
   - `dv_get_my_account_access()`;
   - required indexes;
   - RLS enablement and policies.
8. Updated public navigation linking to `/login/`.
9. A concise implementation summary listing:
   - files changed;
   - Supabase configuration completed;
   - RLS policies added;
   - manual tests completed;
   - any deliberate minor variation from this specification.

Do not add dependencies. Do not add public registration. Do not expose service-role credentials.
