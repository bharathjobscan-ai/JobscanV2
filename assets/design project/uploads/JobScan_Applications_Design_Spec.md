# JobScan — Applications Dashboard
## Refined Option 1 Design Specification
### Implementation reference for Claude Code

This document defines the visual system to reproduce the refined Applications dashboard shown in the accompanying reference image.

---

## 1. Design direction

**Concept:** Premium editorial job-search workspace combining a dark application shell with cinematic city photography.

**Visual language:**
- Dark, understated, cinematic
- Editorial rather than SaaS-generic
- High contrast but never pure black/white
- Champagne-gold used sparingly for emphasis
- Platinum/ivory typography
- Photography carries the personality of each location
- UI chrome stays quiet so application data remains the focus

Avoid:
- Bright emerald as a primary UI colour
- Neon green
- Generic blue SaaS gradients
- Excessive glassmorphism
- Red/green “diff” semantics
- Heavy shadows around every component
- Excessive rounded corners

---

## 2. Typography

### Primary display font
**Cormorant Garamond**
- Google Fonts
- Use weights: 500 / 600 / 700
- Main page headings: 48–56px, weight 500–600
- City names: 27–32px, weight 600
- Large score numerals: 28–36px, weight 500–600

### UI / utility font
**Inter**
- Google Fonts
- Use weights: 400 / 500 / 600
- Navigation: 15–16px, 500
- Supporting text: 13–15px, 400
- Metadata: 12–13px, 400–500
- Badges / labels: 11–12px, 600
- Letter spacing for uppercase metadata: 0.10–0.16em

### Typography rule
Use Cormorant Garamond only for:
- Page title
- City/location title
- Prominent numeric scores

Use Inter for everything functional and informational.

Do not use a single serif font for the entire interface.

---

## 3. Core colour tokens

### Base
```css
--bg-obsidian: #090B0C;
--bg-surface: #111416;
--bg-surface-2: #15191B;
--border-subtle: rgba(242, 239, 231, 0.10);
--border-strong: rgba(242, 239, 231, 0.17);
```

### Typography
```css
--text-primary: #F2EFE7;       /* warm platinum */
--text-secondary: #B8B4AA;
--text-muted: #858279;
--text-faint: #625F59;
```

### Accent
```css
--gold: #C9A45C;               /* champagne gold */
--gold-bright: #D8BA78;
--gold-soft: rgba(201, 164, 92, 0.18);

--emerald: #176B5A;            /* restrained emerald */
--emerald-soft: rgba(23, 107, 90, 0.22);

--blue-muted: #7892A7;
--rose-muted: #9A7477;
```

### Photography overlays
```css
--photo-overlay-top: rgba(7, 9, 10, 0.08);
--photo-overlay-bottom: rgba(7, 9, 10, 0.78);
--photo-overlay-mid: rgba(7, 9, 10, 0.25);
```

Important: the photography should remain recognisable. Do not add a solid dark layer that destroys detail.

---

## 4. Layout

### Application shell
- Desktop-first
- Recommended max content width: **1248px**
- Page horizontal padding: **56–64px**
- Navigation height: **62px**
- Header/content gap: **52px**
- Main page vertical rhythm: 24 / 32 / 48px

### Navigation
- Background: `#090B0C`
- Bottom border: `rgba(242,239,231,0.10)`
- Logo: Cormorant Garamond, 25–27px, weight 600
- Nav labels: Inter, 15px
- Active item: platinum text + thin platinum underline
- Inactive: muted gray
- Cost indicator: 13px muted gray aligned to far right

---

## 5. Page header

Title:
- “Applications”
- Cormorant Garamond
- 50–54px
- Weight 500–600
- `#F2EFE7`

Subtitle:
- Inter
- 15px
- `#858279`

Use wording such as:
`45 tracked across eight target cities. Open a city to work its table.`

Header controls:
- Search field on right
- Grid/list toggle beside it
- Both should be quiet and compact
- Search background: `#111416`
- Border: `rgba(242,239,231,0.10)`
- Search radius: 18px
- Height: 42px

---

## 6. City card

### Card geometry
- Grid: 3 columns desktop
- Gap: 24px
- Card aspect ratio: approximately **1.64 : 1**
- Suggested height: 300px
- Border radius: 18px
- Overflow: hidden
- Border: `1px solid rgba(242,239,231,0.10)`

### Image treatment
Use one real photographic image per location.

Recommended crop:
- `object-fit: cover`
- `object-position: center`
- Slight image scale: `transform: scale(1.015)` on hover
- No strong blur

Overlay:
1. Very light top vignette
2. Medium centre gradient
3. Strong bottom gradient for readable metadata

### Card content positioning
City title should sit in the lower-middle visual area, not directly on top of the most detailed part of the image.

Recommended:
- left: 20px
- city title: 28–30px
- country label below: 11–12px uppercase, letter-spacing 0.13em

---

## 7. Priority badge

Only display on the priority city.

Example:
`#1 PRIORITY`

Style:
- Inter
- 10–11px
- 600
- Letter spacing: 0.08em
- Text: `#151515`
- Background: `#C9A45C`
- Border radius: 999px
- Padding: 6px 10px

Position:
- 18px from top
- 18px from left

---

## 8. Arrow action

Use a circular translucent button.

```css
width: 38px;
height: 38px;
border-radius: 999px;
background: rgba(242,239,231,0.18);
border: 1px solid rgba(242,239,231,0.12);
color: #F2EFE7;
backdrop-filter: blur(8px);
```

Do not make it bright white.

---

## 9. Score treatment

The score should be visually important but subordinate to the city.

Use:
- 56–64px circular container
- thin gold border
- dark translucent interior
- Cormorant Garamond
- score: 26–30px
- supporting label: 9–10px uppercase

Example:
`84`
`BEST`

Do **not** use traffic-light colours for scores.

Score colour:
- Default: `#F2EFE7`
- Optional high score emphasis: `#D8BA78`

---

## 10. Bottom metadata

Example:

`9 READY TODAY`

then:

`3 in play   |   7 new   |   scanned 2h ago`

Rules:
- Inter
- 12px
- White/platinum at reduced opacity
- Vertical separators are faint
- “READY TODAY” can use champagne gold when it represents an actionable count

Recommended hierarchy:
```text
9                 84
READY TODAY       BEST
```

then:
```text
3 in play  |  7 new  |  scanned 2h ago
```

---

## 11. City photography

The image should visually represent the city without feeling like a tourist brochure.

Suggested subject hierarchy:
- London: Westminster / Big Ben / Houses of Parliament
- Dublin: Temple Bar / historic street scene
- Amsterdam: canals / windmills / historic waterfront
- Berlin: Brandenburg Gate
- Lisbon: vintage tram / historic street
- Dubai: Burj Khalifa skyline
- Singapore: Marina Bay Sands
- Remote: painterly/artwork treatment

Photography should have:
- muted cinematic contrast
- slightly desaturated highlights
- enough dark area behind text
- no embedded text/logos wherever possible

---

## 12. Interaction

Hover:
- Card image scale: 1.015
- Card border becomes `rgba(201,164,92,0.35)`
- Arrow background becomes `rgba(201,164,92,0.22)`
- Transition: 180–220ms ease

Do not dramatically raise or enlarge cards.

Keyboard focus:
- 2px gold outline
- 3px outline offset

---

## 13. Responsive behaviour

### >= 1100px
3-column grid

### 720–1099px
2-column grid

### < 720px
1-column grid

For mobile:
- Page padding: 20px
- Card height: 250–270px
- Page title: 40px
- City title: 27px

---

## 14. Data model recommendation

```ts
type CityApplicationSummary = {
  city: string;
  country: string;
  imageUrl: string;
  readyToday: number;
  inPlay: number;
  newApplications: number;
  scannedLabel: string;
  bestScore: number;
  priority?: boolean;
};
```

Example:

```ts
{
  city: "London",
  country: "United Kingdom",
  imageUrl: "...",
  readyToday: 9,
  inPlay: 3,
  newApplications: 7,
  scannedLabel: "scanned 2h ago",
  bestScore: 84,
  priority: true
}
```

Do not hard-code visual content into components.

---

## 15. Implementation rule for Claude Code

Create a reusable component:

`ApplicationsCityCard`

Recommended hierarchy:

```text
ApplicationsPage
├── Header
│   ├── PageTitle
│   ├── Search
│   └── ViewToggle
└── CityGrid
    └── ApplicationsCityCard
        ├── Photo
        ├── GradientOverlay
        ├── PriorityBadge
        ├── ArrowButton
        ├── CityTitle
        ├── CountryLabel
        ├── ScoreBadge
        └── CardMetadata
```

Centralise all design values in a single token file rather than scattering hex values through components.

---

## 16. Visual acceptance criteria

The implementation should feel:
- premium
- cinematic
- editorial
- restrained
- consistent

The design should **not** feel:
- neon
- gamified
- overly corporate
- like a generic AI dashboard
- like a VS Code diff interface

The most important visual relationship is:

**Photography → Platinum typography → Champagne gold emphasis → Obsidian UI**

Gold should be an accent, not the dominant colour.

---

## 17. Reference image

Use the accompanying refined mockup as the visual reference for spacing, hierarchy, proportions and composition. Treat this document as the source of truth for exact typography and colour tokens.
