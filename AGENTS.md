# AGENTS.md — HoroHoro.tcg Developer Diary

> Persistent context across sessions. Read this at the start of every session.
> Update it at the end of every feature. See CLAUDE.md §0 Rule 1 for the full protocol.

**Last updated:** 2026-06-02
**Current branch:** `main`
**App version:** 0.1.0 (pre-release)

---

## Implemented Features

### Core App Shell
- **Navigation stack** — root `NativeStack` with `Tabs` (Home/Browse/Binder/Decks) + modal routes
  (`Detail`, `Scan`, `Settings`, `WishlistDetail`) and full-screen routes (`Sets`, `SetDetail`,
  `DeckDetail`). Floating center Scan FAB on the tab bar with `scanFab` style.
- **Theme** — dark-only UI (`colors.bg = #0e0c1a`), `Sora` (display), `Manrope` (UI) via
  `expo-google-fonts`. All values in `src/theme.ts`; never hardcode hex/font in components.
- **i18n** — English + Spanish dictionaries in `src/i18n/{en,es}.ts`. `useT()` / `t()` from
  `lib/i18n.ts`. Language persisted in `settings.ts`. **All UI text must go through `t()`.**

### Data Pipeline
- `scripts/build_card_database.py` — scrapes en.onepiece-cardgame.com, generates `data/index.json`
  + downloads card images to `images/<SET>/`. Run with `--index-only` for metadata only.
- `scripts/compress_images.py` — compresses `images/` to `.jpg`.
- `src/data/loadIndex.ts` — loads the JSON index; exports `CARDS` (Record), `CARD_LIST` (sorted
  array), `INDEX_META`. Uses `metro.config.js` watchFolders trick to reach `../data`.

### Image Delivery
- **CDN strategy** (`src/config.ts`, `lib/images.ts`, `components/CachedImage.tsx`) — primary:
  jsDelivr CDN pointing at `GITHUB_USER/GITHUB_REPO@GITHUB_BRANCH`; automatic fallback to
  `image_source` (official site) on 403/404. Controlled by `CDN_AVAILABLE` flag.
- `CachedImage` component wraps `expo-image` and handles both CDN URI + fallback URI.

### Collection Management
- `lib/collection.ts` — AsyncStorage key `optcg.collection.v1`. Variant-keyed map
  (`${code}${suffix}`), in-memory cache, listener set for re-renders. `adjust()` for +/-.
- `lib/ownedAggregate.ts` — `getOwnedFor(code)`, `getVariantOwned(code, suffix)`,
  `getOwnedTotals()`, `getOwnedVariantCount()`. Single fan-out point for owned counts.

### Binder Screen (3 tabs)
- **Owned tab** — filtered, sortable grid/list of all owned cards. Columns toggle. FilterSheet.
- **Wishlist tab** — list of named wishlists (create/delete). Taps into `WishlistDetailScreen`.
- **Trade tab** — cards with tradeable qty = max(0, owned − playsetSize). Per-card override via
  `lib/trade.ts` (key `optcg.trade.v1`). ShareSheet to export trade page as image.

### Wishlist System (multi-wishlist)
- `lib/wishlists.ts` — AsyncStorage key `optcg.wishlists.v1`. Named wishlists, each with a
  `Record<variantKey, WishlistCard>` (code + suffix + needed + addedAt).
- `WishlistDetailScreen` — view/edit single wishlist. DeckCardPile layout (qty = needed,
  owned progress visible). Add cards by search, adjust `needed` qty, rename.
- `SetWishlistSheet` — bulk-add an entire set's missing cards to a chosen wishlist.
- `WishlistPickerModal` — pick target wishlist (used from DeckDetail "add missing" flow).
- **Note:** `WishlistItem` (single-wishlist, code-only) is deprecated in `types.ts`.
  The live system is `Wishlist` + `WishlistCard`. No migration code exists yet — any user
  who had the old format would silently lose data (not yet a concern since app is pre-release).

### Deck Builder
- `lib/decks.ts` — AsyncStorage key `optcg.decks.v1`. `Deck` model: `{ id, name, leaderId?,
  cards: DeckCard[], createdAt }`. 50-card OPTCG rule is advisory (not enforced in storage).
- `DecksScreen` — list of decks with leader thumbnail, total count badge. Create/delete/rename.
- `DeckDetailScreen` — grid of `DeckCardPile` (stacked copies, dimmed if not owned). Add cards
  via `AddCardsModal`. "Add missing to wishlist" flow → `WishlistPickerModal`.
- `lib/optcgsim.ts` — parses OPTCGSim export format (`NxCODE` tokens) into `{ code, qty }[]`.
  Import from DecksScreen to pre-populate a new deck.

### OCR / Card Scanner
- `ScanScreen` — live camera feed (`expo-camera`), regex extraction of card codes
  (`/\b([A-Z]{2,4}\d{2}-\d{3})\b/`), haptics on success (`expo-haptics`), 800 ms debounce.
  Perona Ghost SVG mascot shown while waiting. Manual text-entry fallback field.
- `lib/ocr.ts` — lazy `require()` of `@react-native-ml-kit/text-recognition`. No-op in Expo Go;
  `isOcrAvailable()` gates the feature. `recognizeText(uri)` and `matchByArt(uri)` exported.
- **OCR only works in a custom dev build** (`npx expo run:android`). This is by design.

### Browse Screen
- Full-text + fuzzy search over `CARD_LIST`. Multi-criteria `FilterSheet` (set, color, type,
  rarity, attribute, cost range). Sort by rarity/cost/power/owned/code/set (asc/desc).
- Grid/list toggle via `ColumnsToggle`. `useCardGrid()` hook for responsive card widths.
- **Bulk-select mode** — long-press to enter, `BulkActionBar` appears. `BulkTargetSheet` picks
  action (add to collection, add to wishlist). Applies to `SetDetailScreen` too.
- `lib/cardDisplay.ts` — `expandCards()` / `expandSetEntries()` control whether parallel/alt-art
  variants are shown as separate entries (driven by `showAlternateArt` setting).

### Sets Browser
- `SetsScreen` — lists all sets derived from the card index.
- `SetDetailScreen` — set header with `SetBadge` + date + `ProgressRing` (% collected). Rarity
  buckets. Grid with inline +/- count. Columns toggle. Bulk actions. SetWishlistSheet quick-add.

### Home Dashboard
- Tile-grid layout: collection size, binder progress, deck count, set exploration, vault value.
- Stats pulled from `ownedAggregate`, `setsStats`, `decks`, `prices`.

### Sharing
- `lib/shareImage.ts` — lazy-load `react-native-view-shot` + `expo-sharing`. `isShareAvailable()`
  guards the feature. Used in `BinderScreen` trade tab and `ShareSheet` component.
- **Share only works in a custom dev build**, same reason as OCR.

### Settings
- `lib/settings.ts` — AsyncStorage key `optcg.settings.v1`. Fields: `language` (en/es),
  `columns` (2/3/4), `countParallels` (bool), `playsetSize` (1–4), `showAlternateArt` (bool),
  `wishlistDefaultVariant` ('base' | 'any').
- `SettingsScreen` — chips/toggles for all settings. Back-navigates with `navigation.goBack()`.

### Price Analytics (mock)
- `lib/prices.ts` — **mock data only**. Rarity-tier base prices (EUR) + per-card overrides for
  notable cards. `getPrice(card)` and `HOLO_RARITIES` exported.
- Used in `HomeScreen` vault value tile and `DetailScreen`.
- **This is a placeholder — prices are not real.** See QoL §1 for the real integration plan.

---

### `printed_set` field — event/promo variant filtering
- `Variant.printed_set` (`string | null | undefined`) distinguishes where a variant was physically
  printed from which card code it shares:
  - `string` (e.g. "EB02") → bracket-derived canonical set code from the official site
  - `null` → event/promo with no set code (Treasure Cup, Grand Battle, Anniversary packs, etc.)
  - `undefined` → legacy data without the field (falls back to `set_source`)
- **Scraper** (`build_card_database.py`): emits `printed_set` as `set_code_from_getinfo` result or
  `null` (no bracket → event).
- **`setsStats.variantSetOf`**: routes `null` variants to a hidden `__event__` bucket, which is
  filtered out of `listSetCodes()`. Set views only show variants that explicitly claim that set.
- **`data/index.json`** + **`app/src/data/index.json`**: both patched (4571 variants; 411 null).
  **Important:** both files must be kept in sync — the scraper writes to `data/index.json` and
  `app/src/data/index.json` is the copy the Metro bundler uses. After any scraper run, copy
  `data/index.json` → `app/src/data/index.json` before rebuilding the app.
- **Repro case**: EB02-006 Yamato had 3 variants in EB02 view; now correctly shows 2 (base + _p1).
  The _p2 "Extra Grand Battle for Stores 2026 May" parallel is excluded from all set views.
- **DetailScreen variant row**: the `· printed_set` tag (or `get_info` for null-printed_set events)
  is shown inline alongside the rarity and name on every variant that differs from the card's home set.

### Performance — collection counter responsiveness
- `collection.ts`: listeners now fire **before** `AsyncStorage.setItem`, so the UI updates instantly.
  Writes are debounced 300 ms (rapid taps → 1 disk write). `adjust()` merged into one read+write.
- `ownedAggregate.ts`: `refresh()` is now synchronous (reads `getCacheSync()` directly); initial
  hydration still awaits the first async disk read.
- `CardThumb` / `DetailScreen` subscriptions use `getCountSync()` — no microtask delay on update.

### UI — DetailScreen improvements
- **EffectText component** (`components/EffectText.tsx`): parses `[Label]` tokens from card effect
  text and renders them as color-coded inline chips (violet=timing, red=keywords, teal=conditions,
  amber=DON!!, green=trigger). Used in DetailScreen's effect panel.
- **printed_set tag**: now rendered as nested `<Text>` inside the card name on VariantRow — appears
  immediately right of the name (`Yamato · EB02`) instead of pushed to the far right edge.
- **Hero image gallery**: added `key={heroIdx}` to the hero `CachedImage` to force remount when
  the user selects a different variant, ensuring the correct art loads rather than showing a
  transition artifact from the previous variant.

### Filter improvements (2026-06-02)
- **Attributes separated**: compound attributes like "Strike/Ranged" are split into individual chips in `deriveOptions()` and matched individually in `matches()`.
- **Rarity sort order**: rarities now display as L → C → UC → R → SR → SEC → P (defined by `RARITY_DISPLAY_ORDER` constant in `filters.ts`).
- **Set chips with full names**: `deriveOptions()` builds a `setNames: Record<string,string>` by picking the set_name from the lowest-numbered card per prefix. `FilterSheet` renders chips as "OP01 · ROMANCE DAWN"; searching "dawn" matches OP01.
- **Power label**: "Power (bucket)" renamed to "Power" in `FilterSheet`.

### Expanded fuzzy search (2026-06-02)
- Search haystack now includes `card.type`, `card.family`, `card.attribute`, `card.effect`, and `card.trigger` (not just name+code). Typing "blocker", "on play", "if your leader", "stage", "character" all return matching cards.
- Cost shorthand: "2c" or "c2" filters cards with cost=2.
- Counter shorthand: "1k" (= 1000), "c1000", "c2000" filters by counter value.
- SET_TOKEN_RE updated to accept 3-letter prefixes (e.g. "prb", "st" already worked).

### Rarity in card footer (2026-06-02)
- `CardThumb` footer now shows rarity next to the code: "OP01-001 · L". Uses the first variant's rarity.

### BinderScreen multi-select (2026-06-02)
- Long-press any card in the Owned or Trade tab enters select mode.
- Tap cards while in select mode to toggle selection.
- `BulkActionBar` and `BulkTargetSheet` are now wired to BinderScreen (same as BrowseScreen).
- `onLongPress` prop added to `CardThumb`.
- Tab switching clears selection automatically.
- Select-mode disables inline +/- controls on selected cards.
- QoL §10 resolved.

### Multi-select individual quantities (2026-06-02)
- `BulkTargetSheet` now has a "Choose individually" toggle (shown when 2+ cards are selected).
- When on: a scrollable list shows each selected card with its own +/- stepper (initialized to the global qty).
- When off: existing single global quantity applies to all (unchanged behavior).
- Per-card quantities are used in all four targets (Collection, Wishlist, Trade, Deck).

### Multi-select / bulk actions (already implemented)
Long-press on any card in **Browse** or **SetDetail** enters multi-select mode. `BulkActionBar`
shows 4 targets (Add to Collection / Wishlist / Trade / Deck). `BulkTargetSheet` handles all 4:
- Trade: calls `setTradeOverride(code, getTradeQty(code) + qty)` — no playset constraint, any card
  can be added regardless of owned count.
- Deck: capped at 4 copies per card (OPTCG rule).
- This does NOT currently exist in BinderScreen (QoL §10).

## Known Bugs

### B-01 — CDN repo name mismatch
- **File:** `app/src/config.ts:10`
- **Symptom:** `GITHUB_REPO` is set to `'optcg-tracker'` but the actual GitHub repo where images
  are pushed is `OPTCG-Collector` (or similar). Image CDN URLs resolve to a non-existent repo,
  so all card images fall back to `image_source` (official site).
- **Fix:** Update `GITHUB_REPO` to match the actual public repo name once confirmed. Also verify
  `GITHUB_USER` = `'Kromm3D'` is correct after the repo is public.

### B-02 — Deck 50-card rule not enforced
- **File:** `lib/decks.ts`, `DeckDetailScreen.tsx`
- **Symptom:** Decks can exceed 50 cards (the OPTCG legal limit) with no warning or hard cap.
- **Severity:** Low — UI shows total count so users can self-police. No data corruption.
- **Fix candidate:** Show a warning badge in `DeckDetailScreen` header when `deckTotal > 50`.
  Optionally soft-block `setDeckCard` when it would push the total past 60.

### B-03 — `prices.ts` uses mock data
- **File:** `lib/prices.ts`
- **Symptom:** Vault values on HomeScreen and DetailScreen show hardcoded estimates, not real
  market prices. Values will diverge from Cardmarket as the meta shifts.
- **Severity:** Medium — currently labeled nowhere in the UI as "estimates".
- **Fix:** Either add a "~" / "est." label to all displayed prices, or replace with real data
  (see QoL §1). At minimum label them before any public release.

### B-04 — Deprecated `WishlistItem` has no migration path
- **File:** `types.ts`, `lib/wishlists.ts`
- **Symptom:** If a device previously had data under the old single-wishlist format (`WishlistItem`
  keyed by code), the new `wishlists.ts` reads a different AsyncStorage key and silently starts
  fresh. Old data is orphaned.
- **Severity:** Low — app is pre-release so no real user data exists yet.
- **Fix:** Before public release, add a one-time migration in `wishlists.ts` that reads the old
  key and converts it to a default wishlist if present.

---

## QoL / Future Improvements

### 1. Real Cardmarket price integration
Replace mock `lib/prices.ts` with either (a) a lightweight backend endpoint that scrapes/caches
Cardmarket prices, or (b) direct use of the Cardmarket API if access is obtained. Until then,
add a visible "~" prefix to all displayed price values.

### 2. Cloud / cross-device sync
All data lives in local AsyncStorage. Consider Expo SecureStore for sensitive data, plus an
optional backend sync (supabase or similar) so a user's collection, decks, and wishlists follow
them across devices.

### 3. OPTCGSim deck export
`lib/optcgsim.ts` can *import* from OPTCGSim format but there's no *export* function. Add
`toOptcgSimString(deck: Deck): string` and a "Share deck code" button in `DeckDetailScreen`.

### 4. Barcode / QR scanning as OCR fallback
Official OPTCG packs include a barcode or QR code on some products. Could be a faster scan path
than ML Kit text recognition on card codes, especially for bulk scanning.

### 5. Set release calendar
A dedicated view or HomeScreen tile showing upcoming set release dates sourced from `setMeta.ts`
(or fetched from the scraper). Useful for collectors planning purchases.

### 6. Price alerts / wishlist notifications
Push notification (via Expo Notifications) when a wishlist card drops below a target price.
Requires the real price integration (QoL §1) first.

### 7. Bulk scan mode
A "scan session" flow in `ScanScreen` that queues identified cards and lets the user confirm/
add them all at once, rather than one-at-a-time. Useful for cataloging a new booster box.

### ~~10. Multi-select in BinderScreen~~ — resolved 2026-06-02

### 11. EffectText border-radius limitation
React Native nested `<Text>` with `backgroundColor` renders rectangular highlights (no rounded
corners). A `<View flexWrap="wrap">` layout would allow rounded chips but breaks mid-sentence
label reflow. Accept limitation for now or investigate a custom inline renderer.

### 8. New Architecture migration
`newArchEnabled: false` in `app.json`. `@react-native-ml-kit/text-recognition` needs to be
verified for Fabric/JSI compatibility before flipping the flag.

### 9. UI price disclaimer
Before any public release, add a small disclaimer on `HomeScreen` vault tile and `DetailScreen`
price row clarifying that prices are estimates (until QoL §1 is done).

---

## Workflow Notes

### Session overhaul (cbed5bc — 2026-06-01)
The app received a full overhaul in one session: image pipeline switched to jsDelivr CDN,
TypeScript bugs fixed, search/filter overhauled, deck builder added, wishlist system rewritten
as multi-wishlist, OCR scanner added, share-image feature added, i18n layer (en/es) introduced,
settings screen added. This is the current `main` baseline.

### AsyncStorage versioning convention
Every lib module uses a versioned key (`optcg.*.v1`). When the stored shape changes, bump the
version suffix and add a migration block at the top of the `read()` function that converts from
`v(N-1)` to `vN`. Do not silently change the shape of an existing key.

### Custom dev build vs Expo Go
Three features require `npx expo run:android` (prebuild):
1. OCR — `@react-native-ml-kit/text-recognition`
2. Share — `react-native-view-shot`
3. Share — `expo-sharing` (works in Expo Go on device but not simulator)

All three are lazy-loaded via `require()` with `isXxxAvailable()` guards. Expo Go shows
graceful fallback UI for these features.
