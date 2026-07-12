---
name: HoroHoro.tcg
description: A One Piece TCG collection tracker themed on Perona and her Negative Hollows — two themes, Hollow Night (dark, default) and Ghost Day (light), switchable in Settings. "Horo Horo" doubles as a holographic-rarity pun (iridescent foil accent). Colors below are the dark theme.
colors:
  bg: "#131019"
  surface: "#1c1726"
  surface2: "#261f33"
  border: "rgba(246,240,250,0.10)"
  text: "#f6f0fa"
  text-mut: "#a99bba"
  text-dim: "#8a7ca0"
  accent: "#ff6fb5"
  accent-dim: "rgba(255,111,181,0.14)"
  accent-glow: "rgba(255,111,181,0.38)"
  on-accent: "#3d1228"
  ghost: "#9fe3e8"
  ghost-dim: "rgba(159,227,232,0.14)"
  ghost-glow: "rgba(159,227,232,0.32)"
  on-ghost: "#0c3b3e"
  badge: "#ff6fb5"
  ring-track: "rgba(246,240,250,0.08)"
  up: "#4ec98b"
  down: "#ef5d6b"
  foil: "linear pink #ff6fb5 → lilac #c79cf0 → cyan #9fe3e8 → pink #ffb3d9 (holo accent only)"
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

HoroHoro.tcg borrows **Perona** — the Ghost Princess, user of the Horo Horo no Mi — as the operating metaphor for a card-collection tracker. Gothic-cute, a little spooky, never childish. Two colors carry the whole system:

- **Perona pink** (`accent`): candy-gothic, the brand/action color — buttons, selection rings, the stepper "+", count chips.
- **Spectral cyan** (`ghost`, a legacy code identifier — see Named Rules): the aura of her Negative Hollows, and the semantic color of progress/collection in *both* themes. Nothing else competes beyond these two — no third decorative hue, no rainbow of semantic colors. Completion is the emotional payoff: a set's progress ring fills in cyan and, at 100%, "materializes" into a solid ghost.

The name carries a built-in pun: **"Horo Horo" is Perona's fruit *and* reads as holographic** — the foil/holo rarity collectors chase. That pun is the one sanctioned flourish: an iridescent **foil** (pink→lilac→cyan, see `FOIL_STOPS` / `FoilBadge`) reserved for holo-rarity cards and the completion moment, never loose decoration.

The two themes are two moods of the same character, not two characters: **Hollow Night** (dark, default — gothic purple-black) and **Ghost Day** (light — a hazy, daylit Perona).

This is a tool first. The ghost motif is a seasoning on top of fast, glanceable, one-handed utility — never a reason to slow down scanning a card, browsing a list, or checking a binder. The system explicitly rejects generic SaaS/Material dashboard chrome and the undifferentiated "card grid app" look shared by most TCG trackers; gothic-cute is the voice, but it stays in service of the tool.

**Key Characteristics:**
- Gothic purple-black (dark) or pale lavender (light) neutral base, never pure black/white, never warm-neutral cream/sand
- Exactly two semantic colors: **Perona pink** (brand/action) + **spectral cyan** (collection/progress) — never a third, except the holo **foil** on premium/completion moments
- Soft-rounded, confident controls (14–18px radius) against an otherwise flat surface
- Tonal layering for depth (bg → surface → surface2), shadows reserved for floating/stacked elements
- The OPTCG's own 6 official card colors are a separate, deliberately quieter palette — used only as data-color dots/tones on card art, never competing with the brand colors

## 2. Colors

A gothic purple-black (or pale-lavender) neutral base carries two accents at low overall coverage; the official OPTCG 6-color palette lives entirely inside card data, not UI chrome.

### Primary — Perona pink (`accent`)
- **Perona Pink** (`#ff6fb5` Hollow Night / `#c0357a` Ghost Day): The brand/action color — primary buttons, the stepper "+", selection rings, badges, the count chip, the in-field scan button. Ghost Day deepens it to a rose so it stays legible as text on a light surface (bright pink fails ~4.5:1 on white). Deliberately distinct from the card-data "Purple" dot (`#9b5de5`).

### Secondary — spectral cyan (`ghost`, same role in both themes)
- **Spectral Cyan** (`#9fe3e8` Hollow Night / `#0f8390` Ghost Day): The semantic color of progress and collection — *and only that* — in both themes. Progress rings, completion bars, the "materialized" 100% ghost, set-orb fills. If it's on screen, it means "this is about what you own or have finished." Ghost Day deepens it to a teal for text-on-light legibility. Distinct from the card-data "Blue" dot (`#4a90e2`).

### Foil — the holographic flourish (`FOIL_STOPS`, both themes)
- An iridescent gradient **pink → lilac → cyan → pink** (`#ff6fb5 → #c79cf0 → #9fe3e8 → #ffb3d9`), rendered via react-native-svg in `FoilBadge`. The "Horo Horo = holographic" pun, made literal. **Not a semantic color** — a brand flourish only, on holo-rarity chips (`HOT_RARITIES`) and the completion payoff. Never a generic accent.

### Neutral
- **Hollow Void** (`#131019`): App background. The deep gothic night Perona haunts.
- **Crypt Surface** (`#1c1726`): First-level elevated surface — cards, sheets, headers.
- **Deep Crypt** (`#261f33`): Second-level surface — nested rows, inputs, secondary chips.
- **Static Border** (`rgba(246,240,250,0.10)`): Hairline border, a translucent wash of lavender-white rather than a flat gray — every border carries a trace of the ghost.
- **Ghost White** (`#f6f0fa`): Primary text. A cool lavender near-white — never pure `#fff`.
- **Faded Lavender** (`#a99bba`): Secondary text (~5:1 contrast on `bg` — passes WCAG AA for normal text).
- **Dim Lavender** (`#8a7ca0`): Tertiary text for codes/captions/placeholders only (~4:1 on `bg`). Never use for nav labels or anything under 14px that the user actually needs to read.
- **Plum Ink** (`#3d1228` Hollow Night / `#ffffff` Ghost Day) / **Abyss Ink** (`#0c3b3e` Hollow Night / `#ffffff` Ghost Day): The "on-accent" / "on-ghost" text inks used *only* on top of the pink/cyan fills, never standalone. Flips per theme — see "The Ink-Flip Rule" below.

### Data colors (OPTCG card colors — not UI accents)
Red `#e63946`, Green `#52b788`, Blue `#4a90e2`, Purple `#9b5de5`, Black `#a8a39a`, Yellow `#f4a261` — each paired with a dark `tone` background for thumbnail fallbacks. These represent the card game's own color identity system and must never be reused as UI state colors (success/error use `up`/`down`, not a card color), and must stay visually distinct from either theme's brand colors (see Primary/Secondary above).

### Named Rules
**The Two-Color Rule.** Only two colors carry meaning on any screen: **Perona pink** for brand/action, **spectral cyan** for progress/collection. The holo **foil** is the single sanctioned extra, and only on holo-rarity / completion moments. If a third saturated color shows up outside a card-data context, it's a bug, not a feature.

**The Tinted Border Rule.** Borders and dividers are never flat gray — they're a low-alpha wash of lavender-white in Hollow Night / plum-ink in Ghost Day (never a flat neutral gray), so even structural lines stay inside the theme.

**The Legacy Token Rule.** The code-level color key `colors.ghost` and the icon key `cloud` are kept as-is rather than renamed everywhere they're consumed. Here they finally match their names again: `colors.ghost` *is* the spectral ghost cyan, and `cloud` is now drawn as a Negative-Hollow ghost. (They briefly meant "Spark Gold" / a storm cloud during the Zeus interlude — see AGENTS.md.) Trust this document over the variable name.

### Two themes: Hollow Night & Ghost Day
The app ships **two** themes — two moods of Perona, not two characters — picked in Settings and applied on next app restart (not live, see "The Restart Rule"). Each carries its own coherent palette; the pink/cyan roles are constant, the *values* shift for legibility.

- **Hollow Night (dark, default).** The gothic night form. All hex values in the frontmatter and sections above belong to this theme.
- **Ghost Day (light).** A hazy, daylit Perona — pink/cyan deepened for text-on-light legibility:
  - `bg` `#f4eef9`, `surface` `#ffffff`, `surface2` `#efe7f6`, `border` `rgba(45,26,58,0.14)`
  - `text` `#241a2e`, `textMut` `#5e5170`, `textDim` `#766888`
  - `accent` `#c0357a` (deep rose, darkened from `#ff6fb5` for ~4.5:1 text-on-white), `onAccent` `#ffffff`
  - `ghost` `#0f8390` (deep teal, not the bright cyan — bright cyan fails as text on white), `onGhost` `#ffffff`
  - `up` `#157048`, `down` `#c0334a` (both deepened the same way, for the same reason)
  - `ring` `rgba(45,26,58,0.08)`, `tabBarWash` `rgba(255,255,255,0.92)`

**The Ink-Flip Rule.** Hollow Night's button ink is dark-on-bright-fill (plum/abyss ink on pink/cyan). Ghost Day's button ink flips to **white**-on-fill, because Ghost Day's `accent`/`ghost` are darkened for direct-text legibility, and a dark fill with dark ink on top loses too much contrast. A deliberate, contrast-driven exception per theme.

**The Scrim-Ink Rule.** A few elements sit on a backdrop that's *always* dark regardless of theme — SetBanner's back-button circle and DeckRow's "⋯" menu circle, both `rgba(21,16,26,~0.55)` over busy key art, chosen for legibility over art, not over `bg`. Their icon ink uses the dedicated `onScrim` export (`#f6f0fa`, fixed), **not** `colors.text` — `colors.text` flips dark in Ghost Day, which would put dark icons on a dark circle.

**The Restart Rule.** Every screen's `StyleSheet.create({...colors...})` is a **module-level constant** — it's evaluated once, when the screen is first imported, and never again. Switching `colors.ghost` (the variable) at runtime doesn't touch styles already baked into those constants. So theme choice is read **once, at app boot**, before any screen module loads (`index.js` reads the stored preference and only *then* `require()`s `App` — see `lib/themeMode.ts`), and changing the setting in Settings requires a restart to take effect. There is no live-preview toggle; don't build one without first solving the static-StyleSheet problem (a real refactor, not a quick fix).

## 3. Typography

**Display Font:** Sora (700 Bold / 500 Medium)
**Body Font:** Manrope (400/500/600/700)

**Character:** Sora's geometric, slightly rounded weight gives numbers and headers a confident, collectible-card-box presence; Manrope stays out of the way for everything functional. The pairing is "label on a premium box" (display) over "instructions on the back" (body) — distinct weights of the same calm register, not two competing personalities. Unchanged across rebrands — the personality lives in color and the ghost motif, not the typeface.

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

Tonal-first: depth comes primarily from three flat background steps (`bg` → `surface` → `surface2`), not from shadow stacking. Real shadows are reserved for elements that visually float above the tonal plane — the scan FAB, stacked duplicate-copy layers behind an owned thumbnail, and a signature accent glow used sparingly on the brand's hottest moments (a pressed primary action, a completed set). The result reads as layered stagecraft rather than a drop-shadow-heavy "card UI."

### Shadow Vocabulary
- **Card** (`shadowColor: #000, opacity 0.35, radius 8, offset (0,4), elevation 4`): Default elevation for any element that needs to lift off the tonal plane (stacked copy layers behind a thumbnail, sheets).
- **Accent Glow** (`shadowColor: colors.accent`, theme's brand color, `opacity 0.5, radius 12, offset (0,4), elevation 8`): Reserved for the brand's signature moments — never applied to ordinary buttons, only to elements that should visually "crackle" (e.g. a hero CTA, a just-completed action).

### Named Rules
**The Stagecraft Rule.** Depth is told through tone, not shadow, by default. A shadow only appears when an element is meant to feel like it's floating free of the surface (a stacked duplicate-copy, a FAB) — never as ambient decoration under a flat card.

## 5. Components

### Buttons
- **Shape:** 14px radius (`rounded.lg`), 44px minimum height (the enforced minimum touch target), horizontal padding 18px, icon + label with an 8px gap.
- **Primary:** Solid accent fill (Perona pink — deep rose in Ghost Day) with `onAccent` ink text — bold fill, ink flips per theme (see "The Ink-Flip Rule"), never an arbitrary white-on-color outside that rule.
- **Secondary:** Deep Cloud fill (`#28292e`/`#f2f3f5`) with a 1px Static Border and primary-text-color text — a quieter stone-surface button.
- **Ghost:** Transparent background, Faded Cloud (`textMut`) label — for tertiary/low-emphasis actions.
- **Danger:** Solid `down` fill, white text — the one place pure white-on-color is allowed regardless of theme, reserved for destructive actions only. Kept perceptibly distinct in hue from `accent` in both themes so "destructive" never reads as "brand."
- **Press feedback:** Every pressable dims to 0.55 opacity on press (`pressedStyle`) — the system's one universal tactile cue, applied consistently rather than per-component custom states.

### Card Thumbnails (signature component)
The card-collection grid tile is the system's most distinctive component. Image fills a 200:280 aspect-ratio frame over a Deep Cloud placeholder background; the art clip uses a **small 8px corner radius** (the surrounding pill is the rounded container — a large radius on the inset art clips the card's own printed corners, so the art itself stays nearly square). Owned counts "bleed" an accent-colored count-bubble (`×3`) out of the top-right corner rather than sitting inside the card bounds — literal overflow as a design move, echoing a sticker peeling off the card. Multiple owned copies stack as faint duplicate layers offset 4px diagonally behind the front card (up to 4 layers), visually dramatizing "you own several of this" without extra UI chrome. Selection state is a 3px accent-colored ring + accent-tinted overlay; unowned/dimmed state is a flat dark scrim (`rgba(21,22,26,0.65)`, fixed regardless of theme — see "The Scrim-Ink Rule") rather than desaturating the art. **Every card grid** shares one Collectr-style framed tile — the universal "card pill" (`framed` + `priceMode` props on `CardThumb`, 2026-06-28): **Browse, Set-detail, and the Binder** (Collection + Trade tabs). (Scan only uses `CardThumb` as a tiny preview thumbnail, not a grid, so it stays plain.) Anatomy, top to bottom inside a rounded `surface` pill (hairline border, generous top padding):
- **Art inset to ~80%**, centred, with **reserved space for the duplicate-stack** beneath it: the ghost-stack caps at **4 cards** (3 offset layers) and the pill reserves that footprint (`STACK_RESERVE`) as `marginBottom` so a stacked card never bleeds onto its neighbours and there's always air between art and text.
- **No icons are drawn on top of the art** in this mode (the multi-art indicator is suppressed).
- A **name row**: card name (left) with **price + %-change stacked at the right**. Price from `lib/prices.ts`; %-change from `lib/priceHistory.ts` (diffs against the previous weekly release — `0.0%` muted until a prior snapshot exists, then green `up` / red `down`).
- Code · rarity line beneath.
- A **`− N +` stepper** at the bottom (the quantity sits between the buttons). **`+`** is accent-filled; **`−` uses a negative colour** (red `down` border + icon on a quiet surface) and is disabled/dimmed at 0. Both auto-repeat on hold: `+` adds +1 every 500 ms and, on reaching a **playset (4)**, pauses ~1.8 s then accelerates; `−` removes on the same cadence and floors at 0 (no playset pause). Constants `PLAYSET`/`ADD_STEP_MS`/`ADD_FAST_MS`/`PLAYSET_PAUSE_MS` in `CardThumb`. The top-right count-bubble is suppressed in this mode.

Framed grids run a tight inter-card gap but comfortable outer gutter via `useCardGrid(columns, { gap, hPadding })` (Browse/Sets/Binder all pass `{ gap: 8, hPadding: 18 }`, the 18 matching the header/search/sort rows so cards align with the chrome). The Binder's Trade tab routes the stepper to the trade-quantity store (`setTradeOverride`) instead of the collection. Wishlist and Deck grids use their own components (`DeckCardPile`, wishlist rows), not this tile.

### Progress Rings & Orbs
- **Style:** SVG circular progress, spectral-cyan stroke (`ghost` token — see Named Rules) over a low-alpha neutral track (`ring`), rounded line caps, percentage centered inside in display-weight text.
- **State:** At 100%, the ring is replaced entirely by a solid filled cyan orb with a ghost icon centered — the visual payoff moment ("materialized" Hollow), distinct from the in-progress ring rather than just a full ring.

### Inputs / Fields
- **Style:** Deep Cloud background, 1px Static Border, consistent with Secondary button shape (14px radius).
- **Disabled / off states:** Reduce opacity rather than recoloring (e.g. quick-action minus button at 0.4 opacity when count is zero).

### Navigation
- Bottom tabs: a **flat 5-tab pill row** (`Home · Cards · Binder · Decks · Profile`), label under icon, the active tab carrying an `accentDim` pill behind its icon+label (Collectr-inspired, 2026-06-28). There is **no floating Scan FAB** — scanning moved into the search field (see below). The bar persists globally across stack screens (rendered once in `App.tsx`, outside the Tabs.Navigator).
- **Scan entry point:** an accent-filled camera button. On Browse it sits at the **left of the search field**; on Binder (no search field) it lives in the action row's "add" cluster. This is the one place Accent Glow is justified by default (inherited from the retired FAB).
- Macro-tabs (e.g. Sets screen's MAIN/PROMO/SPECIAL/DECK) and Binder's Collection/Wishlist/Trade use an underline-on-active / segmented pattern in the theme's accent color against muted unselected labels — distinct from the bottom-bar pill, which is reserved for the primary tab row.
- **Mobile-first width.** The app is designed for phone widths. On **web** the whole shell is capped to a centred column (`MAX_CONTENT_WIDTH` = 480, `lib/layout.ts`; applied in `App.tsx`'s `appShell` and respected by `useCardGrid`) so the browser preview reads as a phone column instead of sprawling edge-to-edge. Native is unaffected (screens are narrower than the cap).

## 6. Do's and Don'ts

### Do:
- **Do** keep Perona pink for brand/action and spectral cyan for progress/collection — and only those two as meaningful colors in the chrome (the holo foil being the one sanctioned flourish, on holo-rarity / completion only).
- **Do** tint every border and divider with a low-alpha wash (lavender-white in Hollow Night, plum-ink in Ghost Day), never flat gray-by-default.
- **Do** use tonal layering (`bg`/`surface`/`surface2`) as the primary depth tool; reserve real shadows for elements that float (the search-field/action-row scan button, stacked duplicate-copies, accent glow on hero moments).
- **Do** enforce 44px minimum touch targets and the 0.55-opacity press-dim on every pressable, with no exceptions.
- **Do** route every visible string through `en.ts`/`es.ts` — no hardcoded UI text, ever.
- **Do** keep the OPTCG's 6 official card colors confined to card-data rendering (dots, tone backgrounds) — never reuse them as UI state colors, and keep them visually distinct from either theme's brand colors.
- **Do** reference `colors.accent`/`colors.onAccent` (etc.) for theme-dependent values — never hardcode a hex that only happens to look right in one theme (this shipped as a real bug during the rebrand: hardcoded `'#fff'` button text and a hardcoded dark-scrim icon color, both caught only by testing Regular mode directly).

### Don't:
- **Don't** introduce a third saturated "decorative" accent color competing with the theme's accent/gold — this is the single fastest way to break the system's legibility.
- **Don't** let either theme slow down or obscure the tracking workflow — no decorative animation or chrome that delays scanning, browsing, or checking progress.
- **Don't** drift into kawaii-mascot territory — Perona is gothic-cute and a little spooky, not a cuddly sticker.
- **Don't** use `textDim` for navigation labels or any text under 14px that the user needs to read — it's a caption-only floor color, not a default secondary.
- **Don't** look like a generic SaaS/Material admin dashboard, or blend in with the undifferentiated "card grid" look of other TCG trackers — both are named anti-references.
- **Don't** reach for AI-slop scaffolding (gradient text, uppercase tracked eyebrows, numbered section markers `01/02/03`, side-stripe colored borders) anywhere in this UI.
- **Don't** use pure white (`#fff`) for primary text or pure black for backgrounds — always the tinted Ghost White / Hollow Void (or their Ghost Day equivalents) values; flat black-and-white breaks the theme's tint identity.
