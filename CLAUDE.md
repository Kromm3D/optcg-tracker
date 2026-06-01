# CLAUDE.md — HoroHoro.tcg

> Core operating instructions for any Claude session working in this repo.
> Read this top-to-bottom before doing anything else.

**HoroHoro.tcg** is a mobile app for the **One Piece Trading Card Game**: track your
collection, build decks, manage wishlists, and scan cards with on-device OCR.
It's an **Expo / React Native + TypeScript** app backed by a **Python scraper**
that builds the card database from the official card list.

---

## 0. The Three Workflow Rules (non-negotiable)

These govern *how* you work in this repo, not just *what* you build. Follow them
on every session.

### Rule 1 — State Management & Memory (`AGENTS.md`)

`AGENTS.md` (repo root) is the **persistent developer diary** across sessions.
It is the single source of truth for project state that lives outside the code.

You must keep it current. It contains, at minimum:

- **Implemented features** — what exists and works, with a one-line description.
- **Workflow applied** — the approach/decisions taken for non-trivial features
  (why this way, what alternatives were rejected).
- **Known bugs** — open defects, with repro notes and suspected cause if known.
- **QoL / future improvements** — backlog of nice-to-haves and tech debt.

Protocol:

- **Read** `AGENTS.md` at the **start of every session** to restore context.
- **Write** to `AGENTS.md` at the **end of every feature** (and whenever you
  discover a bug or land a meaningful change). Move items between sections as
  their status changes — bugs that get fixed move to "implemented"; new ideas
  go to "QoL".
- If `AGENTS.md` does not exist yet, **create it** on the first session and
  seed it from the current state of the code.

### Rule 2 — Initialization & Pre-flight Checks

Before writing **any** new feature, in this order:

1. **Read `AGENTS.md`** to restore context (Rule 1).
2. **Review current project state** — `git status`, `git log --oneline -10`,
   and the relevant files for the area you're about to touch.
3. **Spot bugs first.** Scan recent changes and the "Known bugs" section of
   `AGENTS.md` for regressions, errors, or unresolved issues. Surface anything
   you find **before** starting new work — don't build on top of a known break.
4. Run `npm run typecheck` (from `app/`) when entering an unfamiliar state, so
   you start from a known-green baseline.

### Rule 3 — Version Control & Commit Discipline

- **Commit only working, reviewed state.** A commit happens once we *agree* a
  feature is fully working and you (the user) have manually reviewed it. Do not
  commit speculatively or to "save progress" on something unverified.
- **Pace yourself.** Do **not** propose moving on to the next major feature
  until the current working state is **committed and documented in `AGENTS.md`**.
- **Branching:** `main` is the main branch. For non-trivial features, branch
  first (e.g. `feature/<short-name>`) rather than committing straight to `main`.
- **Never** commit, push, branch, or amend unless the user has asked for it.
- Commit messages: imperative summary, scope prefix where useful
  (`feat:`, `fix:`, `chore:`). End with the Co-Authored-By trailer.

---

## 1. Quick Reference — Commands

All app commands run from the **`app/`** directory.

```bash
# --- App (from app/) ---
npm install            # install deps
npm start              # expo start (QR for Expo Go / dev build)
npm run android        # expo run:android — REQUIRED for OCR (native ML Kit module)
npm run ios            # expo run:ios
npm run web            # expo start --web
npm run typecheck      # tsc --noEmit  ← run this before declaring work done

# --- Data pipeline (from repo root) ---
pip install requests beautifulsoup4
python scripts/build_card_database.py --index-only   # fast: metadata only -> data/index.json
python scripts/build_card_database.py                # full: also downloads missing images
python scripts/compress_images.py                    # compress images/ (jpg)
```

There is **no test runner and no linter** configured. `npm run typecheck` is the
primary automated gate — treat a clean typecheck as the bar for "done".

---

## 2. Architecture

### Repo layout

```
.
├── CLAUDE.md                     # this file
├── AGENTS.md                     # developer diary (Rule 1) — create/maintain
├── README.md                     # data-pipeline docs (Spanish)
├── scripts/
│   ├── build_card_database.py    # scrapes official site -> data/index.json + images/
│   └── compress_images.py
├── data/
│   ├── index.json                # the card database the app consumes
│   └── index.example.json
├── images/<SET>/<CODE>[_pN].jpg  # card art + variants (served via CDN)
└── app/                          # the Expo / React Native app
    ├── App.tsx                   # entry: NavigationContainer + stack + tabs
    ├── app.json                  # Expo config (name: HoroHoro.tcg)
    ├── metro.config.js           # watchFolders extended to read ../data
    └── src/
        ├── config.ts             # GitHub user/repo + CDN settings
        ├── types.ts              # Card, Variant, CollectionItem, Wishlist…
        ├── navigation.ts         # route param types
        ├── theme.ts              # colors + fonts (dark theme)
        ├── data/
        │   ├── index.json        # card DB loaded by the app
        │   └── loadIndex.ts      # CARDS / CARD_LIST / INDEX_META
        ├── i18n/{en,es}.ts       # translation dictionaries (TKey type from en.ts)
        ├── lib/                  # logic: collection, decks, wishlists, ocr, images, filters, prices…
        ├── components/           # CardThumb, CardRow, FilterSheet, sheets/modals…
        └── screens/              # one file per screen (see navigation below)
```

### Navigation (see `App.tsx` + `navigation.ts`)

- **Root native stack:** `Tabs`, `Detail` (modal), `Sets`, `SetDetail`,
  `DeckDetail`, `Scan` (modal), `Settings`, `WishlistDetail`.
- **Bottom tabs:** `Home`, `Browse`, `Binder`, `Decks` — with a floating center
  **Scan FAB** that pushes the `Scan` route.
- Route params are typed in `navigation.ts`. When adding a screen: add it to
  `RootStackParamList`/`TabParamList`, register it in `App.tsx`, and export its
  `…ScreenProps` type.

### Data model (`types.ts`)

- A **`Card`** has a base `code` (e.g. `OP14-033`) and an array of **`Variant`s**
  (normal, parallel `_p1`, manga, alt art…), each with a `suffix`, `rarity`,
  `label`, and image fields.
- **Variant identity is `` `${code}${suffix}` ``** — this composite key is used
  everywhere (collection, wishlists). `suffix === ""` is the base variant.
- The OCR reads only the printed code; the user disambiguates variants visually
  via thumbnails. Keep that flow intact: code → all variants → user picks one.

---

## 3. Conventions & Gotchas

**Persistence (AsyncStorage).** `lib/collection.ts`, `lib/wishlists.ts`,
`lib/settings.ts`, `lib/decks.ts` follow the same pattern: a single JSON record
under a **versioned key** (e.g. `optcg.collection.v1`), an in-memory `cache`, and
a **listener set** with a `subscribe()` for re-rendering. When you change a
stored shape, **bump the key version** and handle migration — don't silently
break existing users' data.

**i18n — never hardcode UI strings.** All user-facing text goes through
`useT()` / `t()` from `lib/i18n.ts`, keyed by `TKey`. Add new keys to **both**
`src/i18n/en.ts` and `src/i18n/es.ts`. `en.ts` defines the `TKey` union and is
the fallback. Language is persisted in `settings.ts` (single source of truth).

**Images & CDN (`config.ts`, `lib/images.ts`, `components/CachedImage.tsx`).**
Images are served from **jsDelivr** pointing at the public GitHub repo
(`GITHUB_USER`/`GITHUB_REPO`@`GITHUB_BRANCH`). When `CDN_AVAILABLE` is true the
primary source is the compressed `.jpg` on the CDN, with automatic fallback to
`image_source` (the official site) on 403/404. The `images/` folder must be
committed/pushed for the CDN to resolve. jsDelivr 403s on very large repos
(~50 MB) — if that happens, split images into their own repo/Release and adjust
`IMAGE_BASE_URL`.

**OCR only runs in a custom dev build.** `lib/ocr.ts` lazily `require()`s
`@react-native-ml-kit/text-recognition`, which **does not exist in Expo Go**.
It degrades to a no-op there. To actually test scanning you must
`npm run android` (prebuild). `isOcrAvailable()` gates the feature; keep that
graceful-degradation contract.

**The card DB and Metro.** The app reads the card index via
`src/data/loadIndex.ts`. `metro.config.js` extends `watchFolders` to the repo
root so `../data` is resolvable. The JSON is imported with `@ts-ignore` to avoid
tsc inferring the enormous literal type — keep that. The DB is generated by
`scripts/build_card_database.py`; don't hand-edit `index.json`.

**Theme & fonts (`theme.ts`, `App.tsx`).** Dark UI. Display font = **Sora**,
UI font = **Manrope** (loaded via `useFonts`). Use `colors` and `fonts` from
`theme.ts`; don't hardcode hex values or font names in components.

**Comment language.** The codebase mixes Spanish and English comments
(the user is Spanish-speaking). **Match the language and style of the file you're
editing** rather than rewriting existing comments.

**New Architecture is disabled** (`newArchEnabled: false` in `app.json`) — keep
native deps compatible with the old architecture unless we deliberately migrate.

---

## 4. Definition of Done (per feature)

A feature is done when **all** of the following hold:

1. `npm run typecheck` passes clean.
2. UI strings are in `en.ts` + `es.ts`; no hardcoded text or colors.
3. The user has **manually reviewed** the behavior and agrees it works.
4. `AGENTS.md` is updated (feature documented; bugs/QoL moved as appropriate).
5. A commit has been made (per Rule 3) — and only then do we discuss what's next.
