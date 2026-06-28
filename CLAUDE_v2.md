# CLAUDE.md (Version 2.0)

# Daily View Website Development Guide

This document defines the architecture, design system, implementation standards and development principles for the **Daily View** marketing website.

It is intended to ensure that all future development remains visually and technically consistent regardless of whether changes are made by Claude Code or a human developer.

---

# Project Overview

This repository (`DailyView`) contains the **public marketing website** for Daily View.

Daily View is a calm, reassuring daily reference display designed for:

- Older adults
- People experiencing memory difficulties
- People with Mild Cognitive Impairment (MCI)
- People living with early dementia
- Anyone who benefits from a clear visual summary of today

The primary visitor to the website is typically:

- an adult child
- family member
- spouse
- friend
- professional carer
- care home

The website explains the product and captures registrations of interest.

This repository **does not contain the actual application.**

The application itself is developed separately.

---

# Canonical References

## Approved Website Design

The attached approved website design is the canonical visual specification.

If there is any conflict between this document and the approved mock-up, **the mock-up wins.**

Do not redesign sections because an alternative appears more attractive.

Maintain the approved:

- layout
- spacing
- hierarchy
- typography
- imagery
- iconography
- proportions
- colour palette

## Approved Assets

The canonical asset repository is:

https://github.com/PLAMartin/DailyView

Before creating any new asset:

1. Check the repository.
2. Reuse existing assets.
3. Only generate a replacement when explicitly instructed.

## Clarification Before Implementation

Never guess.

If it is unclear which asset, image, icon, background PNG, layout, spacing or component should be used, ask the user before implementing.

One short clarification question is preferred over implementing the wrong solution.

# Development Principles

The website should always feel:

- calm
- reassuring
- trustworthy
- modern
- uncluttered
- warm
- accessible

Avoid corporate SaaS styling, dark themes, unnecessary animation, visual clutter and excessive gradients.

# Technology

Use only:

- HTML
- CSS
- JavaScript

Hosted on Vercel and source controlled with GitHub.

Do not introduce React, Next.js, Vue, Tailwind or Bootstrap unless explicitly requested.

# Repository Structure

```
/assets
/images
/icons
/legal
/css
/js

index.html
README.md
CLAUDE.md
```

Reuse existing assets and components wherever possible.

# Design System

## Typography

- Source Sans Pro
- Large bold navy hero heading
- Bold navy section headings
- Regular body text
- Semibold button text

## Colours

Use CSS variables for colours.

Primary palette:

- Navy
- Soft Blue
- Gold
- White

## Spacing

Whitespace is part of the brand.

Prefer generous margins and padding.

## Cards

Rounded corners, subtle borders, minimal shadows and generous padding.

# Icon System

Use Material UI Icons as the standard icon library.

https://mui.com/material-ui/material-icons/

Do not introduce Font Awesome, Heroicons, Lucide, Feather or Bootstrap Icons unless requested.

Use existing Daily View custom SVGs for Morning, Afternoon, Evening and Night.

If multiple MUI icons are reasonable choices, ask the user.

# Photography

Photography should feel warm, genuine, British, domestic and optimistic.

Avoid clinical or hospital imagery.

# Responsive Behaviour

Desktop: two columns.

Tablet: remain two-column where practical.

Mobile: stack vertically with full-width buttons.

# Component Specifications

## Hero

Two-column layout.

Left:
- Logo
- Headline
- Supporting copy
- Video
- Email form

Right:
- Large Daily View display

## Hero Daily View Screen

The hero display is a hybrid component.

Layer 1:
Background PNG containing the room/frame/background.

Layer 2:
A dynamically generated Daily View screen rendered using HTML/CSS/JavaScript.

The screen contents should be generated largely from the implementation used on:

https://www.dailyview.org

Do not bake the screen contents into the PNG.

If there is uncertainty about which background PNG should be used, ask the user.

## Forms

UI only.

No backend.

No storage.

Display reassurance text beneath each form.

# Accessibility

Use semantic HTML, labelled inputs, descriptive alt text and maintain colour contrast.

# Image Optimisation

Prefer WebP with responsive image sizes.

# CSS

Use CSS variables.

Keep styles modular.

# JavaScript

Keep lightweight and separate data from rendering.

# Future Integration

Structure code so live time, Supabase and event data can be added later with minimal refactoring.

# Asset Reuse Policy

Always check the GitHub repository before creating new assets.

# What Not To Do

Do not:

- redesign approved layouts
- replace approved assets
- flatten the hero screen into a single image
- replace custom Daily View icons
- use non-MUI icon libraries
- guess which asset to use

If uncertain, ask the user first.

# Guiding Principle

Preserve the calm, trustworthy and uncluttered character of Daily View while improving implementation quality without changing the approved design.
