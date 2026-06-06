# AGENTS.md — HoroHoro.tcg Developer Diary

> Persistent context across sessions. Read this at the start of every session.
> Update it at the end of every feature. See CLAUDE.md §0 Rule 1 for the full protocol.

**Last updated:** 2026-06-05
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
- `ScanScreen` — art-only scanner (code mode removed). Card-shaped focus box (220×308, ~5:7 ratio).
  Pipeline per 1.5s capture:
  1. `takePictureAsync` → full photo with `photo.width`/`photo.height`
  2. Map focus box screen coords → photo pixel coords using `screenW/H` from `useWindowDimensions`
  3. `expo-image-manipulator` crops to focus box region
  4. `matchByArtFull` → tries ONNX neural embedding first, falls back to ahash
  5. On match: adjust exact variant in collection, haptic + toast
- **Three scanning strategies** (auto-selected, best first):
  1. **ONNX neural** — `lib/onnx.ts` loads `assets/model.onnx` (MobileNetV2+PCA, 2.4 MB) via
     `expo-asset` + `onnxruntime-react-native`. Crops+resizes to 224×224, normalises ImageNet,
     runs inference → 64-dim embedding → cosine search in `lib/embeddings.ts`. Requires dev build.
  2. **ahash fallback** — `lib/phash.ts`, 256-bit hash, hamming distance ≤ 20. Pure JS, Expo Go safe.
  3. **OCR (unused by screen)** — ML Kit functions still present in `lib/ocr.ts`.
- `lib/embeddings.ts` — loads `src/data/embeddings.json` (base64 binary, 1.5 MB, 4571 × 64 float32).
  `findNearestEmbedding(emb, threshold=0.70)` — linear cosine search, <5 ms.
  `findTopK(emb, k)` — top-K matches with scores, useful for debugging.
- `lib/ocr.ts` — `matchByArtFull(uri, crop?)` — ONNX first, ahash fallback. `matchTopK` for top-K.
- `lib/phash.ts` — `_deflate` now exported so `onnx.ts` can reuse the inline PNG decoder.
- **Assets** (run `scripts/build_embeddings.py` after adding new sets):
  - `data/embeddings.json` + `app/src/data/embeddings.json` — embedding DB, 1.5 MB
  - `data/model.onnx` + `app/assets/model.onnx` — quantized ONNX model, 2.4 MB
  - `data/hashes.json` + `app/src/data/hashes.json` — ahash DB (fallback), 370 KB
- Manual text-entry fallback, Perona Ghost, debounce (800ms) still present.

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

### Image format: WebP (2026-06-02)
- `build_card_database.py`: phase 2 now downloads and saves images as **WebP q80 / method=6** instead of JPEG 82. `to_webp_ready()` normalizes to RGB or RGBA (WebP supports transparency natively — no white compositing needed). Constants `MAX_IMG_WIDTH=480` and `WEBP_QUALITY=80` at the top of the file.
- `compress_images.py`: rewritten to convert existing `.png`/`.jpg` files to WebP. Also patches `index.json` to update `image_local` paths (`.png`/`.jpg` → `.webp`). Accepts `--quality`, `--max-width`, `--dry-run`.
- `resolve_image_local()`: prefers existing file for backwards compatibility; defaults new images to `.webp`.
- App side: no code changes needed — `imageUrl()` in `lib/images.ts` forwards the `image_local` path verbatim to jsDelivr; `expo-image` handles WebP natively on Android/iOS.
- Expected savings: ~35% smaller than JPEG 82 at equivalent visual quality.
- **Migration**: run `python scripts/compress_images.py` to convert existing `.jpg` images, then copy `data/index.json` → `app/src/data/index.json`, then commit & push.

### Offline image prefetch
- `lib/imagePrefetch.ts` — `prefetchAllImages(onProgress, cancel)` iterates all variants, collects CDN URLs via `imageUrl()`, and downloads them in batches of 8 using `Image.prefetch()` from `expo-image`. Returns `true` if complete, `false` if cancelled. `countAllImageUrls()` for total count.
- `lib/settings.ts` — added `imagesDownloaded: boolean` (key `optcg.settings.v1`). `setImagesDownloaded()` setter.
- `SettingsScreen` — "Offline card images" section at the bottom. Three states: idle (Download button), downloading (progress bar + cancel), done (checkmark + Re-download). Progress shown as `X / Y images` with a filled accent bar.
- **APK stays ~40 MB** (Play Store compliant). Users download ~400 MB once on Wi-Fi for full offline use. `CachedImage` already uses `cachePolicy="disk"` so previously viewed images are also cached automatically.

### Price Analytics (mock)
- `lib/prices.ts` — **mock data only**. Rarity-tier base prices (EUR) + per-card overrides for
  notable cards. `getPrice(card)` and `HOLO_RARITIES` exported.
- Used in `HomeScreen` vault value tile and `DetailScreen`.
- **This is a placeholder — prices are not real.** See QoL §1 for the real integration plan.

---

### Bug fixes & Browse improvements (2026-06-03)

**Wishlist parallel art (B-05 resolved)**
- `DeckCardPile` now accepts an optional `variant?: Variant` prop. Uses it instead of `card.variants[0]`.
- `WishlistDetailScreen` passes `variant={variant}` (already computed from `wc.suffix`) to `DeckCardPile`. Parallels now show the correct art in wishlist piles.

**Stack effect highest-rarity-on-top (B-06 resolved)**
- `BrowseScreen`: when `showAlt=false`, no longer passes `variant` explicitly to `CardThumb`. This lets CardThumb's auto-select logic kick in (picks the highest-rarity owned variant for the top card). When `showAlt=true`, the specific tile variant is still passed.

**Word-boundary search (B-07 resolved)**
- `fuzzyFilter` in `filters.ts` now uses `\b`-anchored regexes instead of `haystack.includes()`. Searching "ace" no longer matches "place", "space", etc.
- Regexes are pre-compiled before the `.filter()` loop (one per text token, not one per card).
- Token special-char escaping via `escapeRe()`.

**Browse screen: greyed-out + quickActions + hold-repeat**
- Unowned cards now show the dim overlay: `dimmed={totalOwned === 0}`.
- `quickActions={!selectMode}` added — +/- buttons appear overlaid on every card in non-select mode.
- `showFooter` prop added to `CardThumb` (default false); Browse passes it so card name/code remain visible alongside the quick controls.
- Hold +/- buttons: press-and-hold fires every 80 ms after a 350 ms initial delay. Implemented via `useRef` hold timers (`startHold`/`stopHold`), triggered by `onPressIn`/`onPressOut`.

**Performance**
- `ownedAggregate.getOwnedVariantCount`: was O(n_owned_variants) per call (iterated all keys). Now O(1) via a pre-computed `variantCounts` map updated in `refresh()`.
- `fuzzyFilter` haystack: was re-concatenated per card per filter run (~4 MB allocs/run). Now cached in a `WeakMap<Card, string>` — built once per card, reused across all subsequent filter calls.
- `BrowseScreen` query debounce: `q` state updates immediately (smooth TextInput), but `debouncedQ` (used in `useMemo`) only updates after 180 ms idle. Prevents full re-filter on every keystroke.

### CardThumb stack effect (2026-06-03)
- `CardThumb` now renders **ghost card layers** behind the main image when `owned > 1`.
- Ghost count = `min(owned, 4) − 1` → max 3 ghosts (4 total layers). Disabled in `quickActions` mode.
- Each ghost is a surface-colored rectangle (`colors.surface2` + `colors.border`) with `borderRadius: 14`, shifted right+down by `4px × depth`. The furthest-back ghost has the largest offset; the front ghost has 1×4px.
- **Highest rarity on top**: when not in `quickActions` mode and `owned > 0`, the main card image shows the highest-rarity owned variant (ranked SEC > SP > TR > SR > R > UC > C > L > P). Explicit `variant` prop and `quickActions` bypass this and always use `variants[0]`.
- Rarity ranking is done synchronously via `getCountSync` (in-memory cache) — no extra subscriptions.
- Refactored `imgWrap` → `imgContainer` (outer, overflow visible) + `imgMain` (clipping inner, `overflow: hidden`) to allow ghost peek-out without breaking existing overlays, count bubble, or footer layout.

### Event sub-buckets (2026-06-03)
- The old single `__event__` bucket is replaced by 8 named virtual set codes, each driven by keyword patterns in `v.get_info`:
  - `__ev_prerelease` → Pre-Release Events (3 variants: "pre-release" keyword)
  - `__ev_treasurecup` → Treasure Cup (20 variants: "treasure cup" keyword)
  - `__ev_regional` → Regionals (63 variants: "regional" keyword)
  - `__ev_cs` → Championship Series (62 variants: "cs ", "championship", "bandai card games fest" prefixes)
  - `__ev_tournament` → Tournament Packs (75 variants: "tournament pack", "winner pack", "tournament kit", "sealed battle")
  - `__ev_store` → Store Events (26 variants: "release event", "grand battle", "2-on-2", "heroines battle", "deck battle", "pirates league", "pirates party")
  - `__ev_collection` → Special Collections (155 variants: "premium card collection", "illustration box", "binder set", "anniversary", "special goods", "official playmat", "learn together", "heroines campaign")
  - `__ev_other` → Other Events (7 variants: everything else)
- `setsStats.ts`: `eventBucketOf(getInfo)` classifies; `variantSetOf` calls it for null printed_set variants. `EVENT_BUCKETS` const exported.
- `setMeta.ts`: Names added for all 8 virtual codes.
- `SetBadge.tsx`: `EV_BADGE_LABELS` maps each code to a 2-letter abbreviation (PR, TC, RG, CS, TP, SE, SC, EV).
- `SetsScreen.tsx`: New `'events'` group section (collapsed by default), positioned between Promos and Other.
- i18n: `sets.groupEvents` added to en.ts + es.ts.
- Total: 411 event variants now browseable under **Sets → Events & Promos**.

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

### Scanner overhaul — detect-then-identify (2026-06-05)
Investigated ManaBox / HakiTCG / the open-source Pokémon-TCGP-Card-Scanner. All robust
scanners use a **two-stage pipeline**: (1) detect & rectify the card, (2) identify it. Our
scanner skipped stage 1 and relied on perfect focus-box alignment. Split the work into a
verified Stage-2 (shipped) and a native Stage-1 (handoff).

**Stage-2 — identification hardening (shipped, typecheck-green, works in Expo Go):**
- **24-bit RGB hash** — `phash.ts` `computeAhash()` now computes one average hash per R/G/B
  plane and concatenates them (R‖G‖B = 192 hex / 768 bits) instead of one grayscale hash.
  Discriminates same-layout/different-colour cards. New helpers: `extractChannel`,
  `channelHash`, `findTopKMatches`, exported `HASH_BITS = 768`.
  - `build_card_database.py` `build_hashes()` → `rgb_average_hash()` (3× `imagehash.average_hash`,
    `hash_algo: "rgb_average_hash"`), and now **auto-copies** `data/hashes.json` →
    `app/src/data/hashes.json`. Regenerated: 4571 hashes, 192-hex each.
  - `ocr.ts`: `AHASH_MAX_DISTANCE` 20 → **60** (same ~7.8% tolerance over 768 bits).
- **Top-K variant-confirmation sheet** — `ocr.ts` `matchTopK()` now has an ahash fallback
  (was ONNX-only) and filters by each path's own floor (`MATCH_THRESHOLD` for ONNX, the ahash
  tolerance otherwise) — exported `MATCH_THRESHOLD` from `embeddings.ts`. `ScanScreen` scan loop
  uses `matchTopK` (k=3): auto-confirms when the top score beats the runner-up by
  `AUTO_CONFIRM_MARGIN` (0.05), else shows a bottom sheet of candidate `CardThumb`s (with %)
  for the user to pick the exact variant (ManaBox-style reprint disambiguation). Loop pauses
  (`pausedRef`) while the sheet is open. i18n: `scan.pickVariant`, `scan.pickVariantHint`,
  `scan.cancel` (en+es).

**Stage-1 — native card detection (handoff, NOT in the build yet):**
- `app/src/lib/cardDetect.ts` — **dormant** (nothing imports it; out of the Metro bundle;
  typecheck-green via a guarded `@ts-ignore` import). Contains `isCardDetectAvailable()`,
  pure-TS geometry (`orderCorners`/`quadArea`/`isCardQuad`), and the `detectCardQuad()`
  OpenCV worklet (grayscale→blur→Canny→contours→largest 5:7 quad).
- Decision: **VisionCamera v4** (matches `react-native-fast-opencv` docs) + `react-native-worklets-core`
  + `vision-camera-resize-plugin`. A v5 trial install was reverted to keep the committed state
  buildable. Native detection can only be built/verified on an Android device — full install,
  app.json plugins, the `rectifyCardCrop` warp, the `ScanScreen` `<Camera>` wiring, and the
  build/verify steps are in **`docs/scanner-native-handoff.md`**.
- Same dev-build contract as OCR/ONNX/Share: Expo Go keeps the focus-box RGB-ahash fallback.

### Fine-tuned embedding model — the real accuracy fix (2026-06-05)
Research into MultiTCG (the app the user flagged), Ximilar, CollX and the open-source MTG
recognizers (tmikonen, YamCR, mtg_card_detector) pinned the second root cause of poor scans:
**our embedding is stock ImageNet MobileNetV2 + PCA — never fine-tuned, never augmented.** Real
photos (angle/glare/white-balance/imprecise crop) land far from the clean reference vector.
Commercial apps train metric-learning models in-house (ArcFace/CosFace/triplet) — the MultiTCG
author confirmed exactly this ("models we train and fine-tune in-house… offline, low latency").
- **`scripts/train_embeddings.py`** (NEW) — fine-tunes a **MobileNetV3-small** backbone with an
  **ArcFace** head (default; `--loss supcon` for SupCon) over the 4571 cards as classes, using
  heavy **synthetic augmentation** (RandomPerspective, ColorJitter/glare, GaussianBlur,
  JPEG, GaussianNoise, RandomResizedCrop with card aspect + scale<1 to simulate over/under
  border, RandomErasing occlusion). Exports `model.onnx` (input = ImageNet-normalized CHW,
  output `embedding` L2-normalized — **same contract as `onnx.ts`**) + regenerates
  `embeddings.json` from clean refs, then copies both to `app/`. **Drop-in**: no app code
  changes, no native deps, testable in the existing dev build.
  - Output `emb_dim` default **128** (was 64). `embeddings.ts` reads `n_components` dynamically.
  - Smoke-tested end-to-end (`--limit 60 --epochs 2`): trains, quantizes (uint8 ~1.1 MB),
    regenerates, verifies. **The user runs the full training** (`python scripts/train_embeddings.py`,
    ~25 epochs; GPU recommended, CPU slow). After training, test on-device and re-tune
    `MATCH_THRESHOLD` in `embeddings.ts` (fine-tuned cosine scores run higher than the old 0.70).
- Recommended sequence: **(1) this retrained embedding** (biggest gain, lowest friction) →
  (2) detection+rectify (the native handoff) → (3) reprint disambiguation via printed-code OCR
  / set-symbol feeding the confirmation sheet.

### Stage-3 — hybrid printed-code OCR + art (2026-06-05, shipped, typecheck-green)
The printed code (`OP01-001`) uniquely identifies the **card** (variants share it), so it's an
authoritative signal even when the art match is weak. `ScanScreen` scan loop now runs the art
`matchTopK` **and** ML Kit `recognizeText` in parallel (`Promise.all`), extracts the code with the
existing `extractCode`/`CARD_CODE_RE`, and:
- If OCR yields a valid code → that card is authoritative; the art scores just **rank its
  variants**. Auto-adds when one variant / clear winner, else the confirmation sheet shows only
  that card's variants. Fires even with **zero art results** (OCR-only identification).
- Else → the existing art-only top-K path (`resolveCandidate` + `decideCandidates`).
- `decideCandidates` factored out (shared auto-confirm vs sheet logic). Implements the
  CLAUDE.md-intended flow: **code → variants → user picks**.
- Gated by `isOcrAvailable()`; in Expo Go (no ML Kit) it degrades to art-only. `lib/ocr.ts`
  `recognizeText` is **no longer unused** — it's back in the live pipeline.
- Needs a dev build to exercise OCR; not yet device-verified.

## Known Bugs

### ~~B-01 — CDN repo name mismatch~~ — RESOLVED (stale, 2026-06-05)
- The git remote is `https://github.com/Kromm3D/optcg-tracker.git`, so `config.ts`
  (`GITHUB_USER='Kromm3D'`, `GITHUB_REPO='optcg-tracker'`) already matches. Verified a live
  jsDelivr URL resolves HTTP 200 (`.../optcg-tracker@main/images/EB01/EB01-009_p1.jpg`).
  The original report assumed the public repo was named after the local working dir
  (`OPTCG-Collector`); it isn't. No code change needed.

### ~~B-02 — Deck 50-card rule not enforced~~ — addressed (warning badge, 2026-06-05)
- **File:** `DeckDetailScreen.tsx`
- `DeckDetailScreen` header now flags `total > 50`: the card count turns red (`colors.down`) and a
  `⚠ Over 50-card limit` tag appears next to it (i18n key `deck.overLimit`, en+es).
- **Still advisory** — no hard cap in `lib/decks.ts` (`setDeckCard` does not block). Intentional:
  users may build oversized decks mid-edit. Revisit only if a hard cap is requested.

### ~~B-03 — `prices.ts` uses mock data~~ — labeled (2026-06-05)
- **File:** `lib/prices.ts`, `HomeScreen.tsx`
- HomeScreen vault value now shows a `~` prefix (`~€{value}`) to signal it's an estimate.
  DetailScreen no longer displays any price (price row was removed), so only the HomeScreen tile
  needed the label.
- **Still mock data** — values are not real market prices. Real Cardmarket integration is QoL §1.

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
1. OCR (Code mode) — `@react-native-ml-kit/text-recognition`
2. Share — `react-native-view-shot`
3. Share — `expo-sharing` (works in Expo Go on device but not simulator)

**Art scan mode works in Expo Go** — it uses only `expo-image-manipulator` (Expo managed)
and pure JS for hashing. No native modules required.

All three are lazy-loaded via `require()` with `isXxxAvailable()` guards. Expo Go shows
graceful fallback UI for these features.
