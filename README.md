# DailyView

Daily View is a calm, simple day-planning display designed to help people who benefit from clear, reassuring information about their day.

The primary audience includes:

- Older adults
- People experiencing memory difficulties
- People living with mild cognitive impairment or dementia
- Individuals who benefit from structured daily routines
- Family members, carers, and support workers who help manage schedules

The system provides a simple, always-available view of:

- Current day
- Current date
- Current time
- Time of day (Morning, Afternoon, Evening, Night)
- Today's events
- Next upcoming reminder

The goal is to reduce confusion, improve reassurance, and make it easy for trusted people to remotely update information.

---

# Vision

Most calendar and reminder applications are designed for highly capable users who are comfortable navigating complex interfaces.

Daily View takes a different approach.

It focuses on:

- Simplicity
- Readability
- Low cognitive load
- Reassuring design
- Remote support
- Minimal interaction

The display should feel more like a trusted household appliance than a traditional software application.

---

# Key Principles

## Clarity over Features

Every element on screen must justify its existence.

If something does not make the day easier to understand, it should not be displayed.

## Today's Information First

The system prioritises what matters today.

Future events are secondary.

## Calm Design

The interface should avoid:

- Clutter
- Notifications
- Popups
- Complex navigation
- Information overload

## Family-Friendly Management

Updating information should be easy from a mobile phone or web browser.

---

# Core Features

## Viewer Display

The viewer display is the primary screen shown to the end user.

It displays:

- Day
- Date
- Time
- Current part of day
- Up to three events for today
- One highlighted "Next" reminder

Past events are automatically greyed out.

The display automatically refreshes and always returns focus to today.

---

## Remote Updating

Authorised users can update schedules remotely.

Features include:

- Mobile-friendly editing
- Multiple authorised helpers
- Shared schedule management
- Future event planning

---

## Time of Day Indicators

Daily View uses simple visual indicators for:

- Morning
- Afternoon
- Evening
- Night

These provide additional context without requiring users to interpret the clock.

---

# Example Viewer Screen

```text
        Daily View

        Afternoon

     Tuesday
    14 July 2026

        14:23

--------------------------------

09:00  Doctor Appointment

12:00  Lunch with Sarah

15:30  Hair Appointment

--------------------------------

NEXT

16:00
Take Medication
```

---

# Technical Stack

## Frontend

- Next.js
- TypeScript
- Tailwind CSS

## Backend

- Supabase
  - PostgreSQL
  - Authentication
  - Storage
  - Row Level Security

## Hosting

- Vercel

## Source Control

- GitHub

---

# Architecture Goals

The architecture should remain:

- Simple
- Maintainable
- Secure
- Affordable
- Suitable for a solo founder

Avoid unnecessary complexity and over-engineering.

---

# Future Features

Potential future enhancements include:

- SMS reminders for carers
- Event confirmation requests
- Voice announcements
- Multiple viewer screens per account
- Family activity logs
- Medication reminders
- Care home deployments
- Smart TV support
- Dedicated tablet mode
- Accessibility enhancements

---

# Target Devices

Initial focus:

- Wall-mounted tablets
- Android tablets
- iPads
- Web browsers

Future support:

- Smart TVs
- Dedicated display devices
- Digital signage screens

---

# Development Status

Daily View is currently being developed as a simple, accessible day-viewing solution focused on reassurance, routine and ease of use.

---

# Licence

Copyright © Phil Martin.

All rights reserved unless otherwise stated.
