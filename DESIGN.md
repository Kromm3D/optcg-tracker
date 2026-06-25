---
name: HoroHoro.tcg
description: A spectral One Piece TCG collection tracker — Perona's ghosts haunting a gothic-candy dark UI.
colors:
  bg: "#131019"
  surface: "#1c1726"
  surface2: "#261f33"
  border: "rgba(255,111,181,0.12)"
  text: "#f6f0fa"
  text-mut: "#a99bba"
  text-dim: "#8a7ca0"
  accent: "#ff6fb5"
  accent-dim: "rgba(255,111,181,0.14)"
  accent-glow: "rgba(255,111,181,0.35)"
  on-accent: "#3d1228"
  ghost: "#9fe3e8"
  ghost-dim: "rgba(159,227,232,0.14)"
  ghost-glow: "rgba(159,227,232,0.30)"
  on-ghost: "#0c3b3e"
  badge: "#ff6fb5"
  ring-track: "rgba(246,240,250,0.08)"
  up: "#4ec98b"
  down: "#ef5d6b"
  optcg-red: "#e63946"
  optcg-green: "#52b788"
  optcg-blue: "#4a90e2"
  optcg-purple: "#9b5de5"
  optcg-black: "#a8a39a"
  optcg-yellow: "#f4a261"
typography:
  display:
    fontFamily: "Sora_700Bold"
    fontSize: "30px"
    fontWeight: 700
  h1:
    fontFamily: "Sora_700Bold"
    fontSize: "22px"
    fontWeight: 700
  h2:
    fontFamily: "Sora_500Medium"
    fontSize: "18px"
    fontWeight: 500
  title:
    fontFamily: "Manrope_700Bold"
    fontSize: "16px"
    fontWeight: 700
  body:
    fontFamily: "Manrope_400Regular"
    fontSize: "14px"
    fontWeight: 400
  label:
    fontFamily: "Manrope_600SemiBold"
    fontSize: "13px"
    fontWeight: 600
  caption:
    fontFamily: "Manrope_400Regular"
    fontSize: "12px"
    fontWeight: 400
  micro:
    fontFamily: "Manrope_400Regular"
    fontSize: "11px"
    fontWeight: 400
rounded:
  sm: "6px"
  md: "10px"
  lg: "14px"
  xl: "18px"
  xxl: "22px"
spacing:
  xs: "4px"
  sm: "8px"
  md: "12px"
  lg: "16px"
  xl: "20px"
  xxl: "28px"
components:
  button-primary:
    backgroundColor: "{colors.accent}"
    textColor: "{colors.on-accent}"
    rounded: "{rounded.lg}"
    padding: "0px 18px"
    height: "44px"
  button-secondary:
    backgroundColor: "{colors.surface2}"
    textColor: "{colors.text}"
    rounded: "{rounded.lg}"
    padding: "0px 18px"
    height: "44px"
  button-ghost:
    backgroundColor: "transparent"
    textColor: "{colors.text-mut}"
    rounded: "{rounded.lg}"
    padding: "0px 18px"
    height: "44px"
  button-danger:
    backgroundColor: "{colors.down}"
    textColor: "#ffffff"
    rounded: "{rounded.lg}"
    padding: "0px 18px"
    height: "44px"
  card-thumb:
    backgroundColor: "{colors.surface2}"
    rounded: "{rounded.lg}"
  count-bubble:
    backgroundColor: "{colors.badge}"
    textColor: "{colors.on-accent}"
    rounded: "13px"
    height: "26px"
---

# Design System: HoroHoro.tcg

## 1. Overview

**Creative North Star: "The Negative Hollow"**

HoroHoro.tcg borrows Perona's Negative Hollow ability — summoning candy-pink ghosts out of a dark, gothic stillness — as the literal operating metaphor for a card-collection tracker. The base of every screen is near-black plum (`#131019`), a haunted-dollhouse stage rather than a generic app-dark-mode gray. Out of that stillness, two spectral colors do all the talking: Perona's own pink (`accent`) marks brand and primary action, and a "ghost" spectral cyan marks collection and progress. Nothing else competes for attention — no third decorative hue, no rainbow of semantic colors. Completion is the emotional payoff: a set's progress ring fills in cyan and, at 100%, "materializes" into a solid ghost orb. That moment is the system's reason to exist; everything else stays out of its way.

This is a tool first. The haunting is a seasoning on top of fast, glanceable, one-handed utility — never a reason to slow down scanning a card, browsing a list, or checking a binder. The system explicitly rejects generic SaaS/Material dashboard chrome and the undifferentiated "card grid app" look shared by most TCG trackers; it also rejects anything twee or kawaii-sticker-cute. The personality is "haunted dollhouse," not "ghost emoji."

**Key Characteristics:**
- Near-black gothic base, never pure black, never warm-neutral cream/sand
- Exactly two semantic accent colors: pink (brand/action) and cyan (collection/progress) — never a third
- Soft-rounded, candy-coated controls (14–18px radius) against an otherwise flat, serious surface
- Tonal layering for depth (bg → surface → surface2), shadows reserved for floating/stacked elements
- The OPTCG's own 6 official card colors are a separate, deliberately quieter palette — used only as data-color dots/tones on card art, never competing with the brand's pink/cyan

## 2. Colors

A near-black gothic base carries two spectral accents at low overall coverage; the official OPTCG 6-color palette lives entirely inside card data, not UI chrome.

### Primary
- **Perona Pink** (`#ff6fb5`): The brand color. Primary buttons, the multi-art indicator, selection rings, badges, the count-bubble ("×3" owned chip). Always light enough that text on top of it needs a separate dark ink (`on-accent`), never white.

### Secondary
- **Spectral Cyan / "Ghost"** (`#9fe3e8`): The semantic color of progress and collection — and only that. Progress rings, completion bars, the "materialized" 100% state, set-orb fills. Never used for a generic UI accent or decoration; if it's on screen, it means "this is about what you own or have finished."

### Neutral
- **Void** (`#131019`): App background. The stage the ghosts haunt.
- **Crypt Surface** (`#1c1726`): First-level elevated surface — cards, sheets, headers.
- **Deep Crypt** (`#261f33`): Second-level surface — nested rows, inputs, secondary chips.
- **Spectral Border** (`rgba(255,111,181,0.12)`): Hairline border, a translucent wash of the brand pink rather than a flat gray — every border carries a trace of the haunting.
- **Bone White** (`#f6f0fa`): Primary text. Slightly warm-violet white, never pure `#fff`.
- **Faded Apparition** (`#a99bba`): Secondary text (~5:1 contrast on `bg` — passes WCAG AA for normal text).
- **Dim Apparition** (`#8a7ca0`): Tertiary text for codes/captions/placeholders only (~4:1 on `bg`). Never use for nav labels or anything under 14px that the user actually needs to read.
- **Plum Ink** (`#3d1228`) / **Tidal Ink** (`#0c3b3e`): The "on-accent" / "on-ghost" text inks used *only* on top of pink/cyan fills, never standalone.

### Data colors (OPTCG card colors — not UI accents)
Red `#e63946`, Green `#52b788`, Blue `#4a90e2`, Purple `#9b5de5`, Black `#a8a39a`, Yellow `#f4a261` — each paired with a dark `tone` background for thumbnail fallbacks. These represent the card game's own color identity system and must never be reused as UI state colors (success/error use `up`/`down`, not a card color).

### Named Rules
**The Two-Ghost Rule.** Only two colors carry meaning on any screen: pink for brand/action, cyan for progress/collection. If a third saturated color shows up outside a card-data context, it's a bug, not a feature.

**The Tinted Border Rule.** Borders and dividers are never flat gray — they're a low-alpha wash of the brand pink (`rgba(255,111,181,0.12)`), so even structural lines stay inside the haunting.

## 3. Typography

**Display Font:** Sora (700 Bold / 500 Medium)
**Body Font:** Manrope (400/500/600/700)

**Character:** Sora's geometric, slightly rounded weight gives numbers and headers a confident, collectible-card-box presence; Manrope stays out of the way for everything functional. The pairing is "label on a premium box" (display) over "instructions on the back" (body) — distinct weights of the same calm register, not two competing personalities.

### Hierarchy
- **Display** (700, 30px): Big numbers — collection totals, vault value, hero stats on Home.
- **Headline / H1** (700, 22px): Screen and section titles.
- **H2** (500, 18px): Sub-section titles, family card titles on the Sets screen.
- **Title** (700, 16px): Card titles, list-row primary text, button labels.
- **Body** (400, 14px): Standard UI text, descriptions.
- **Label** (600, 13px): Form labels, settings rows, secondary emphasis text.
- **Caption** (400, 12px): Metadata, counts, helper text.
- **Micro** (400, 11px): Card-thumbnail names/codes in compact grids — the smallest text in the system, reserved for dense card grids only.

### Named Rules
**The Dim-Text Floor Rule.** `textDim` (~4:1 contrast) is the floor, not a default — it's reserved for non-critical secondary text (card codes, captions, placeholders) and is never used for navigation labels or any text under 14px that matters to the task at hand.

## 4. Elevation

Tonal-first: depth comes primarily from three flat background steps (`bg` → `surface` → `surface2`), not from shadow stacking. Real shadows are reserved for elements that visually float above the tonal plane — the scan FAB, stacked "ghost" card-copies behind an owned thumbnail, and a signature accent glow used sparingly on the brand's hottest moments (a pressed primary action, a completed set). The result reads as layered stagecraft rather than a drop-shadow-heavy "card UI."

### Shadow Vocabulary
- **Card** (`shadowColor: #000, opacity 0.35, radius 8, offset (0,4), elevation 4`): Default elevation for any element that needs to lift off the tonal plane (stacked ghost-copy layers behind a thumbnail, sheets).
- **Accent Glow** (`shadowColor: accent (#ff6fb5), opacity 0.5, radius 12, offset (0,4), elevation 8`): Reserved for the brand's signature moments — never applied to ordinary buttons, only to elements that should visually "haunt" (e.g. a hero CTA, a just-completed action).

### Named Rules
**The Stagecraft Rule.** Depth is told through tone, not shadow, by default. A shadow only appears when an element is meant to feel like it's floating free of the surface (a stacked ghost-copy, a FAB) — never as ambient decoration under a flat card.

## 5. Components

### Buttons
- **Shape:** 14px radius (`rounded.lg`), 44px minimum height (the enforced minimum touch target), horizontal padding 18px, icon + label with an 8px gap.
- **Primary:** Solid Perona Pink fill (`#ff6fb5`) with Plum Ink (`#3d1228`) text — light candy fill, dark ink, never white-on-pink.
- **Secondary:** Deep Crypt fill (`#261f33`) with a 1px Spectral Border and Bone White text — a quieter stone-surface button.
- **Ghost:** Transparent background, Faded Apparition (`textMut`) label — for tertiary/low-emphasis actions.
- **Danger:** Solid `down` red (`#ef5d6b`) fill, white text — the one place pure white-on-color is allowed, reserved for destructive actions only.
- **Press feedback:** Every pressable dims to 0.55 opacity on press (`pressedStyle`) — the system's one universal tactile cue, applied consistently rather than per-component custom states.

### Card Thumbnails (signature component)
The card-collection grid tile is the system's most distinctive component. Image fills a 200:280 aspect-ratio frame with 14px radius corners over a Deep Crypt placeholder background. Owned counts "bleed" a pink count-bubble (`×3`) out of the top-right corner rather than sitting inside the card bounds — literal overflow as a design move, echoing a sticker peeling off the card. Multiple owned copies stack as faint "ghost" duplicate layers offset 4px diagonally behind the front card (up to 4 layers), visually dramatizing "you own several of this" without extra UI chrome. Selection state is a 3px pink ring + pink-tinted overlay; unowned/dimmed state is a flat dark scrim (`rgba(19,16,25,0.65)`) rather than desaturating the art.

### Progress Rings & Orbs
- **Style:** SVG circular progress, cyan stroke (`ghost`) over a low-alpha neutral track (`ring`), rounded line caps, percentage centered inside in display-weight text.
- **State:** At 100%, the ring is replaced entirely by a solid filled "ghost" orb with a ghost icon centered — the visual payoff moment ("materialized"), distinct from the in-progress ring rather than just a full ring.

### Inputs / Fields
- **Style:** Deep Crypt background, 1px Spectral Border, consistent with Secondary button shape (14px radius).
- **Disabled / off states:** Reduce opacity rather than recoloring (e.g. quick-action minus button at 0.4 opacity when count is zero).

### Navigation
- Bottom tabs with a floating center Scan FAB (the one place Accent Glow is justified by default). Macro-tabs (e.g. Sets screen's MAIN/PROMO/SPECIAL/DECK) use an underline-on-active pattern in Perona Pink against muted unselected labels — no pill backgrounds, no boxed tab chrome.

## 6. Do's and Don'ts

### Do:
- **Do** keep pink for brand/action and cyan for progress/collection — and only those two as meaningful accent colors anywhere in the chrome.
- **Do** tint every border and divider with a low-alpha wash of brand pink (`rgba(255,111,181,0.12)`), never flat gray.
- **Do** use tonal layering (`bg`/`surface`/`surface2`) as the primary depth tool; reserve real shadows for elements that float (FAB, stacked ghost-copies, accent glow on hero moments).
- **Do** enforce 44px minimum touch targets and the 0.55-opacity press-dim on every pressable, with no exceptions.
- **Do** route every visible string through `en.ts`/`es.ts` — no hardcoded UI text, ever.
- **Do** keep the OPTCG's 6 official card colors confined to card-data rendering (dots, tone backgrounds) — never reuse them as UI state colors.

### Don't:
- **Don't** introduce a third saturated "decorative" accent color competing with pink/cyan — this is the single fastest way to break the system's legibility.
- **Don't** let the ghost theme slow down or obscure the tracking workflow — no decorative animation or chrome that delays scanning, browsing, or checking progress.
- **Don't** drift toward "kawaii sticker cute" — the personality is haunted-dollhouse-gothic, not childish.
- **Don't** use `textDim` for navigation labels or any text under 14px that the user needs to read — it's a caption-only floor color, not a default secondary.
- **Don't** look like a generic SaaS/Material admin dashboard, or blend in with the undifferentiated "card grid" look of other TCG trackers — both are named anti-references.
- **Don't** reach for AI-slop scaffolding (gradient text, uppercase tracked eyebrows, numbered section markers `01/02/03`, side-stripe colored borders) anywhere in this UI.
- **Don't** use pure white (`#fff`) for primary text or pure black for backgrounds — always the tinted Bone White / Void values; flat black-and-white breaks the gothic-tint identity.
