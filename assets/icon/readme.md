# Daily View Icon Sources

This document defines where the icons used in the Daily View website come from, how to install or access them, and which icons should remain as custom Daily View assets.

---

## 1. Icon Source Summary

Daily View uses two icon sources:

| Icon Type | Source | Reason |
|---|---|---|
| Product / brand icons | Custom SVG files | Keeps the Daily View identity distinctive |
| Interface and supporting icons | MUI Material Icons | Consistent, accessible, React-friendly icon library |

The Daily View sun / time-of-day icon should stay custom because it is part of the product identity and appears inside the viewer screen.

MUI icons should be used for generic UI concepts such as people, homes, hearts, checks, locks, play buttons and refresh actions.

---

## 2. Custom Daily View SVG Icons

These icons should be created and stored locally in the project.

Recommended folder:

```text
/public/assets/icons/
```

Recommended files:

```text
daily-view-logo.svg
morning-icon.svg
afternoon-icon.svg
evening-icon.svg
night-icon.svg
```

### Custom icon usage

Use custom SVGs for:

| Website Element | Icon Source |
|---|---|
| Daily View logo | `/assets/icons/daily-view-logo.svg` |
| Morning screen icon | `/assets/icons/morning-icon.svg` |
| Afternoon screen icon | `/assets/icons/afternoon-icon.svg` |
| Evening screen icon | `/assets/icons/evening-icon.svg` |
| Night screen icon | `/assets/icons/night-icon.svg` |

Example HTML usage:

```html
<img src="/assets/icons/daily-view-logo.svg" alt="Daily View logo" />
```

Example React / Next.js usage:

```tsx
<img
  src="/assets/icons/morning-icon.svg"
  alt="Morning"
  className="time-of-day-icon"
/>
```

---

## 3. MUI Material Icons

MUI Material Icons are used for the supporting website icons.

Official icon library:

```text
https://mui.com/material-ui/material-icons/
```

MUI icons are React components. They are best suited if the Daily View website is built with React, Next.js, Vite or another React-based framework.

---

## 4. Install MUI Icons

From the project root, run:

```bash
npm install @mui/icons-material @mui/material @emotion/react @emotion/styled
```

Why these packages are needed:

| Package | Purpose |
|---|---|
| `@mui/icons-material` | The icon library |
| `@mui/material` | Required peer dependency |
| `@emotion/react` | Styling dependency used by MUI |
| `@emotion/styled` | Styling dependency used by MUI |

---

## 5. Recommended MUI Icon Imports

Create a central icon file so all icon choices are defined in one place.

Recommended file:

```text
/src/components/icons/DailyViewIcons.tsx
```

Example:

```tsx
import HomeRoundedIcon from '@mui/icons-material/HomeRounded';
import GroupsRoundedIcon from '@mui/icons-material/GroupsRounded';
import PersonRoundedIcon from '@mui/icons-material/PersonRounded';
import ElderlyRoundedIcon from '@mui/icons-material/ElderlyRounded';
import SyncRoundedIcon from '@mui/icons-material/SyncRounded';
import VisibilityRoundedIcon from '@mui/icons-material/VisibilityRounded';
import HomeWorkRoundedIcon from '@mui/icons-material/HomeWorkRounded';
import FavoriteRoundedIcon from '@mui/icons-material/FavoriteRounded';
import CheckCircleRoundedIcon from '@mui/icons-material/CheckCircleRounded';
import LockRoundedIcon from '@mui/icons-material/LockRounded';
import MailOutlineRoundedIcon from '@mui/icons-material/MailOutlineRounded';
import PlayCircleOutlineRoundedIcon from '@mui/icons-material/PlayCircleOutlineRounded';

export {
  HomeRoundedIcon,
  GroupsRoundedIcon,
  PersonRoundedIcon,
  ElderlyRoundedIcon,
  SyncRoundedIcon,
  VisibilityRoundedIcon,
  HomeWorkRoundedIcon,
  FavoriteRoundedIcon,
  CheckCircleRoundedIcon,
  LockRoundedIcon,
  MailOutlineRoundedIcon,
  PlayCircleOutlineRoundedIcon,
};
```

---

## 6. Website Icon Mapping

Use the following icon mapping for the Daily View landing page.

| Website Element | MUI Icon | Notes |
|---|---|---|
| Care visit | `HomeRoundedIcon` | Used in the viewer screen activity list |
| Clare visiting | `GroupsRoundedIcon` | Used in the viewer screen activity list |
| Family member updates activities | `PersonRoundedIcon` | Used in “How it works” step 1 |
| Automatic updates | `SyncRoundedIcon` | Used in “How it works” step 2 |
| Loved one sees what happens next | `VisibilityRoundedIcon` | Used in “How it works” step 3 |
| Families supporting an older parent | `GroupsRoundedIcon` | Used in “Who it’s for” card |
| Older adults living independently | `ElderlyRoundedIcon` | Better than a generic person icon |
| Retirement communities | `HomeWorkRoundedIcon` | Better than a single home icon |
| Carers and support organisations | `FavoriteRoundedIcon` | Heart icon |
| Feature bullet points | `CheckCircleRoundedIcon` | Used in “A simple daily reference” |
| Email field | `MailOutlineRoundedIcon` | Used inside email input |
| No spam / privacy | `LockRoundedIcon` | Used below email forms |
| Watch demo | `PlayCircleOutlineRoundedIcon` | Used over the video thumbnail |

---

## 7. Example Icon Usage

```tsx
import {
  HomeRoundedIcon,
  GroupsRoundedIcon,
  CheckCircleRoundedIcon,
  LockRoundedIcon,
} from './components/icons/DailyViewIcons';

export function ActivityList() {
  return (
    <div>
      <div className="activity-row">
        <span className="activity-icon activity-icon--orange">
          <HomeRoundedIcon />
        </span>
        <span>Care visit</span>
        <span>16:00</span>
      </div>

      <div className="activity-row">
        <span className="activity-icon activity-icon--purple">
          <GroupsRoundedIcon />
        </span>
        <span>Clare visiting</span>
        <span>17:00</span>
      </div>
    </div>
  );
}
```

---

## 8. Suggested CSS

```css
.icon {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  line-height: 1;
}

.icon svg {
  width: 1em;
  height: 1em;
}

.activity-icon {
  width: 36px;
  height: 36px;
  border-radius: 12px;
}

.activity-icon--orange {
  color: #f6a000;
  background: #fff3dc;
}

.activity-icon--purple {
  color: #5b45f5;
  background: #f0edff;
}

.feature-check {
  color: #102391;
  font-size: 22px;
}

.how-it-works-icon {
  color: #5b45f5;
  font-size: 56px;
}

.who-card-icon {
  font-size: 44px;
}

.icon-green {
  color: #64ad45;
}

.icon-red {
  color: #e91f3d;
}

.icon-muted {
  color: #6f7590;
}
```

---

## 9. Design Guidance

Use rounded MUI icons where possible because they match the soft, reassuring style of the Daily View website.

Use custom Daily View SVGs for anything that is part of the product identity, especially:

- the logo
- the sun icon
- morning / afternoon / evening / night icons
- icons that appear inside the Daily View viewer screen as part of the product UI

Avoid mixing multiple third-party icon libraries unless necessary. A single MUI icon set plus custom Daily View SVGs should keep the design consistent.

---

## 10. Accessibility

Every decorative icon should be hidden from screen readers.

Example:

```tsx
<HomeRoundedIcon aria-hidden="true" focusable="false" />
```

For meaningful SVG images, provide alt text.

Example:

```tsx
<img src="/assets/icons/morning-icon.svg" alt="Morning" />
```

For purely decorative custom SVGs:

```tsx
<img src="/assets/icons/daily-view-logo-mark.svg" alt="" aria-hidden="true" />
```

---

## 11. Final Recommendation

Use this approach:

```text
Daily View brand/time icons  → Custom SVG files
General website UI icons     → MUI Material Icons Rounded
```

This gives the website a consistent, professional visual language while keeping the Daily View identity unique.
