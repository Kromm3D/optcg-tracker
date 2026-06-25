# Product

## Register

product

## Users
Collectors and players of the One Piece Trading Card Game who want to track what they own, build decks, manage wishlists, and scan physical cards into their digital collection. They use the app one-handed, often while physically sorting cards or at a game store/event, sometimes in low light. They already know OPTCG terminology (rarities, colors, set codes, parallels) — the UI does not need to explain the hobby to them.

## Product Purpose
HoroHoro.tcg is a mobile collection tracker for OPTCG: catalog owned cards and variants, see set-completion progress, manage decks and wishlists, and scan a physical card's printed code via on-device OCR to add it instantly. Success looks like a collector trusting the app as the single source of truth for "what do I own, what am I missing, what's it worth" — fast enough to use mid-sort, accurate enough to bet a trade on.

## Brand Personality
Spooky-cute collector. Perona / Horo Horo (Negative Hollow ghosts) themed: playful gothic, candy-pink (Perona) against spectral cyan (collection/progress), on a dark gothic base. Whimsical and a little macabre, never childish or twee — closer to "haunted dollhouse" than "kawaii sticker pack." The ghost motif is a seasoning on top of a serious tracking tool, not the point of the app.

## Anti-references
No specific named anti-reference. Default to avoiding: generic SaaS/Material admin-dashboard look, undifferentiated "card grid app" sameness shared by most TCG trackers, and AI-slop scaffolding (gradient text, uppercase eyebrows, numbered section markers, side-stripe borders) creeping into UI chrome.

## Design Principles
- **Tool first, theme second.** The ghost/ Perona motif decorates a fast utility app — never slow down scanning, browsing, or set-progress checks for the sake of flavor.
- **Two semantic colors, not a rainbow.** Pink (`accent`) means Perona/brand/primary action; cyan (`ghost`) means collection/progress. Don't introduce a third "decorative" color that competes with these meanings.
- **One-handed, glanceable, low-light safe.** Dark theme only; large enough touch targets (44pt min, already enforced); contrast checked deliberately (see `theme.ts` comments on textMut/textDim ratios) rather than left to chance.
- **Respect player domain knowledge.** Don't over-explain OPTCG concepts (rarities, parallels, set codes) in copy; surface them tersely and correctly instead.
- **Completion is the emotional payoff.** Set/family progress (rings, "materialized" ghosts at 100%) is the reward loop — keep it visually legible at a glance, not buried in stats.

## Accessibility & Inclusion
- Dark theme only (no light theme planned). Body/secondary text contrast checked against WCAG AA (~5:1 textMut, ~4:1 textDim — see inline comments in `theme.ts`); textDim is reserved for non-critical secondary text (codes/captions), never nav labels or anything under 14px that matters.
- Minimum touch target 44pt (`MIN_TOUCH`/`HIT_SLOP` in `theme.ts`), with a defined `pressedStyle`/`pressedSurface` for tactile press feedback.
- OCR scanning (`lib/ocr.ts`) degrades gracefully outside a custom dev build (Expo Go) — `isOcrAvailable()` gates the feature rather than crashing.
- i18n is mandatory: all UI strings route through `en.ts`/`es.ts`, no hardcoded text.
