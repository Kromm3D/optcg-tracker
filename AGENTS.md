# AGENTS.md — HoroHoro.tcg Developer Diary

> Persistent context across sessions. Read this at the start of every session.
> Update it at the end of every feature. See CLAUDE.md §0 Rule 1 for the full protocol.

**Last updated:** 2026-07-15 (**B-14 root-caused and partially fixed** — the scanner's rectified crop isn't corner-precision-broken as first hypothesized (that fix was tried, disproved, and reverted); it's an **orientation** bug: the rectified card can come out rotated 90°/180°/270°, and the fixed ART_CROP band then crops the wrong region entirely. Fixed by trying all 4 rotations and keeping the best match; device-verified to correctly recover the true card (OP09-088) when previously it never did. Threshold recalibrated from a real measured data point. **Not fully solved**: wrong-orientation noise can coincidentally outscore the true match, so the top-ranked candidate isn't always correct yet — documented as remaining work. Typecheck-green.)
**Current branch:** `main`
**App version:** 0.1.0 (pre-release)

---

## Current uncommitted state (read before committing)

Everything from the previous refresh (scanner removal, price pipeline, vault
value, Sets restyle, set-data fix, TR-rarity/sort/bulk/Decks-banner fixes) is
now **committed** (4 commits, pushed to `origin/main`). The working tree below
is **only** today's session — see the three dated entries further down for
full detail. Typecheck is **green**. Nothing in this batch is committed yet —
review before staging (the rebrand + theme system especially — between them
they touch nearly every screen's colors; worth a real device look, in both
forms, before locking in).

1. **Persistent global tab bar + universal back button** — new
   `app/src/lib/nav.ts` (`smartGoBack`). Edited `App.tsx` (tab bar moved out of
   `Tabs.Navigator` to a global overlay driven by a `navigationRef`) and wired
   `smartGoBack` into all 9 screens that have a back button.
2. **Rarity completion counts moved inside the SetDetail banner** — edited
   `components/SetBanner.tsx` (new optional `rarities` prop, taller capsule
   with a second row) and `screens/SetDetailScreen.tsx` (removed the old
   separate rarity strip).
3. **Set-level bulk-add now supports Collection, not just Wishlist** — renamed
   `components/SetWishlistSheet.tsx` → `components/SetBulkAddSheet.tsx` (new
   file, old one deleted) with a Wishlist/My collection destination toggle.
4. **Icon + visible-text labels** on previously icon-only buttons: header
   Settings gear (`App.tsx`), Browse's Filter/Select buttons, SetDetail's
   Parallels/Missing/Select pills. Binder's Select button was tried with a
   label too but **reverted to icon-only** — that row already overflowed at
   375px width before adding text (see dated entry).
5. **Sparkle icon on "Parallels" toggles** — new `sparkle` path in
   `components/Icon.tsx`, applied in `BrowseScreen.tsx` and
   `SetDetailScreen.tsx`.
6. **Full rebrand: Perona/ghost theme → Zeus thundercloud** — see the dated
   entry below. Edited `theme.ts` (every color token), `DESIGN.md` + `PRODUCT.md`
   (identity narrative), `Icon.tsx` (`ghost` icon path → `cloud`, redrawn
   shape), and 4 mascot-icon call sites + 14 files with hardcoded scrim/backdrop
   colors derived from the old palette.
7. **Light/dark theme: Zeus's Regular (light) and Thundercloud (dark) forms,
   switchable in Settings, restart-to-apply** — see the dated entry below. New:
   `app/index.js` (custom entry point), `lib/themeMode.ts`. Edited: `theme.ts`
   (split into two full palettes), `package.json` (`main` field),
   `SettingsScreen.tsx` (the picker UI), `DESIGN.md` (Regular palette + 3 new
   Named Rules), and ~13 files that had `color: '#fff'` hardcoded on an
   `accent`-filled button instead of `colors.onAccent` (a latent bug the
   theme system's contrast requirements exposed — harmless in the old
   single-theme app, would have looked wrong in Regular mode).

**Housekeeping:** `venv_optcg/` and `data/browser_dump.json` are gitignored —
do not stage them. **Follow-ups still pending** from the scanner removal: run
`npm install` in `app/` to prune dropped packages from the lockfile, then
`npx expo prebuild --clean` before the next native build.

---

### NEGATIVE RESULT: corner precision is NOT the B-14 bottleneck — do not "raise RES + add sub-pixel refinement" (2026-07-16, measured)
Set out to implement the long-standing B-14 next-step hypothesis (raise
`RES_W`/`RES_H`, add sub-pixel corner refinement). **Measured it first, and the
measurement killed it.** New `scripts/eval_corners.py` isolates exactly one
question — how much corner error does `approxPolyDP` introduce, and does
line-fit refinement fix it — by rasterizing a *known* quad outline (what Canny
actually hands us) with realistic rounded corners (3mm/63mm = 4.8%), no scene,
no thresholds, no confounds. Results vs. the **4-5% error budget** that
`eval_scanner.py` established:

| case (480x640, card 131px = the current worst case) | raw | refined |
|---|---|---|
| sharp corners | 0.96% | 0.91% |
| **rounded corners (real cards)** | **1.19%** | **0.87%** |
| 960x1280 (2x res), rounded | 1.20% | 0.44% |

- **approxPolyDP already localizes corners to ~1.2%, i.e. 4x INSIDE budget.** My
  premise (that `epsilon = 0.02*peri` ≈ 9px ≈ 7% of card height ⇒ 7% corner error)
  was **wrong**: epsilon is a *tolerance for discarding* points, not the corner's
  displacement — a rectangle's true vertices survive it intact.
- Raising resolution (0.96→0.46 sharp) and line-fit refinement (1.19→0.87) both
  *work*, but they optimize a quantity with 4x margin already. **Neither can fix
  B-14.** Not implemented — adding native/worklet complexity for no product gain
  is a real cost in a module whose every past change cost a device-debug session.
- **Tightening epsilon is actively HARMFUL**: at `0.005*peri` only **4-33%** of
  cards still yield exactly 4 vertices, i.e. most cards get rejected outright.
  Leave it at 0.02.
- `fast-opencv@0.4.8` **does not expose `cornerSubPix`** (only HoughLinesP,
  approxPolyDP, contourArea, convexHull, goodFeaturesToTrack, minAreaRect) — the
  textbook refinement isn't even available; the line-fit substitute in
  `eval_corners.py::refine_quad` is pure geometry and would port to a worklet if
  ever needed.

**So where IS B-14?** Corner *precision* has margin; the failure must be a
*systematic* framing/format error. Two hypotheses, both needing device
instrumentation (the methodology that actually found B-12/B-13/B-14 — see below):
1. **"Vertical color-banding" is the classic symptom of a buffer stride/channel
   mismatch**, not of an imprecise quad. `resize(frame,{pixelFormat:'bgr'})` →
   `OpenCV.frameBufferToMat(h,w,3,data)` with `Camera pixelFormat="yuv"` is
   exactly where a padded/misinterpreted buffer would produce that. Worth dumping
   the raw resized buffer on device before touching geometry again.
2. **Wrong-edge lock / aspect distortion.** `resize(frame → 480x640)` is a
   *non-uniform stretch* if the camera hands us a 16:9 frame (a 3:4 buffer from a
   9:16 frame squashes the card's 5:7 aspect to ~1.0 → `isCardQuad` rejects it, or
   the crop is distorted). Verify the device's actual frame dimensions. Related:
   the card's outer white border may give a weaker Canny edge than the inner art
   frame, letting the detector lock onto a quad inset ~5-8% — precisely the
   framing error that drops matching to 35%. (This one surfaced in a synthetic-
   scene simulator that proved too low-fidelity to trust and was **deleted** rather
   than left in the repo as a misleading tool — treat it as an untested hypothesis.)

### B-14 SOLVED as a diagnosis: it is a signal-MARGIN problem, not a bug. Stage-1 framing is the only lever left (2026-07-16, measured)
Ran five hypotheses to ground and **killed all five** — four of them without a
device, by reading `node_modules` source and measuring. Recording them so no
future session re-runs this:

| # | Hypothesis | Verdict | Evidence |
|---|---|---|---|
| 1 | Corner precision (`approxPolyDP` epsilon) | **REFUTED** | ~1.2% error vs a 4-5% budget (`eval_corners.py`) |
| 2 | Buffer stride/padding → "vertical color-banding" | **REFUTED** | resize-plugin 3.2.0 emits tightly-packed `[B,G,R]` uint8 |
| 3 | Non-uniform resize squashing the 5:7 aspect | **REFUTED** | plugin README: it **center-crops** to the target aspect, "instead of being stretched" |
| 4 | Resampling mismatch (device scaler vs PIL LANCZOS) | **REFUTED** | worst case (NEAREST) = 132 bits, top-1 still **100%** (`eval_resample.py`); BILINEAR only ~28 bits |
| 5 | Landscape quad squashed by the portrait warp | **REFUTED (real, but harmless)** | `isCardQuad`'s `min/max` aspect test *is* symmetric and the quad *does* read 1.396 past 46°, but ART_CROP is fractional + the hash force-resizes to 16×16, so a whole-card anisotropic scale normalises away: distance 9 → 16, top-1 100% (`eval_rotation.py`) |

**The actual diagnosis.** Every offline test lands at ~10 bits; the device measured
**223** on a *correct* match. That gap was the whole mystery, and the cause is
mundane: **all offline tests used the reference image as the query** — the very
image the hash came from. A real camera photo of a physical card differs from the
official scan in colour balance, gamma, sleeve glare, sensor noise and focus. New
`PHOTO_REAL` degradation in `eval_scanner.py` stacks all of that: **148 bits, still
97% top-1**. The device's 223 sits between `persp_strong` (204 → 90%) and
`crop_jit_8%` (261 → **39%**) — i.e. squarely in the **marginal zone** where the
768-bit RGB average hash stops separating reliably (different cards: median 243,
min 118). **There is no single broken thing. B-14 is the descriptor's ceiling
being reached once real-photo noise and framing error stack up.**

**The one lever that matters: framing.** Everything else is tolerated at 97-100%
(light, blur, resolution, mild perspective, even the full PHOTO_REAL stack). Only
framing is a cliff — and it compounds brutally: `PHOTO_REAL` alone = 97%, but
**PHOTO_REAL + 8% framing error = 24%**. Get Stage-1's framing under ~4% and the
scanner works in the real world; leave it at 8% and nothing downstream can save it.

**And you cannot fix it in Stage-2 — measured.** `eval_multicrop.py` tried making
the matcher framing-tolerant by hashing several ART_CROP scales: 1 → 3 → 5 scales
gave 43% → 50% → **39%** on the 8% case. It gets *worse*. **Every extra variant
searched adds as much noise as signal** — the same effect as the 4-rotation
coincidence noise B-14 described. Do not "just search harder"; it is a dead end.

**Shipped from this (typecheck-green, uncommitted):** `cardDetect.orientCardQuad()`
re-rolls the corner labels when the quad reads landscape, which resolves 90°/270°
*geometrically before the warp* — so `cardMatch.NATIVE_ROTATIONS` drops **[0,90,180,270]
→ [0,180]**. That is **2x less Stage-2 work** and half the coincidence surface, at
equal accuracy (100% top-1 across 0-90°, true distance 16 → 9). This serves the
"fast" goal; it does **not** fix B-14.

**Next step (needs the device, cannot be done offline).** The only surviving
explanation for the device's framing error is *where the detected quad actually
lands*: if Canny locks onto the card's inner art frame rather than its outer
white border, the quad is inset ~5-8% — precisely the fatal band. The SCANDBG
`rectify quad=` log below prints the real corners; compare them against the card
on screen. If they are inset, the fix is in Stage-1 edge selection (e.g. morphological
close to bridge the outer border's broken edges, or picking the outermost of nested
quads) — **not** in more hash tuning.

**Strategic note for "works in ANY environment".** Even with perfect framing,
PHOTO_REAL sits at 148/768 bits against a 243-median separation. That margin is
thin by construction. The 2026-07-16 research (assistant memory `scanner-research`)
found the industry uses CNN/CLIP embeddings precisely because average hashes are
brittle on real photos. If framing gets fixed and accuracy is still marginal in
sleeves/binders, the answer is a better descriptor, not more of this.

### SCANDBG instrumentation — built, then REMOVED before commit (2026-07-16; revive from this recipe if needed)
Built `[SCANDBG]` logging to run the B-14 device session, then **removed it again
before committing** (same discipline as the 2026-07-13 session — `grep -rn SCANDBG`
finds nothing now; this entry is the recipe to rebuild it). It was never actually
device-run: four of the five hypotheses fell to offline measurement and source
reading first (see the table above), and the two the instrumentation targeted (H1
stride, H2 aspect) were **both refuted from `node_modules` source** before a phone
was ever needed — so shipping the debug code would have been dead weight.

**If reviving** (the one open question — where the detected quad actually lands —
still needs it), rebuild these four logs; each was aimed at a specific hypothesis
so the session can't end ambiguous:

1. **`[SCANDBG] frame=...`** (`NativeScanCamera.tsx`, 1-in-30 frames) — the camera's
   real `frame.width x height` + aspect, and `resized.len` vs the expected
   `RES_W*RES_H*3` = **921600**.
   → `len` mismatch **proves H1** (padded/misinterpreted buffer = the real cause of
     "vertical color-banding"). `frame` aspect ≠ 0.75 **proves H2** (non-uniform
     resize into the 3:4 detection buffer).
2. **`[SCANDBG] detect ...`** (`cardDetect.detectCardQuad`) — contour count, how many
   4-gons were found, the biggest one's `areaFrac` + `aspect`, and the per-reason
   reject counts (`rejArea` / `rejAspect`).
   → `bestAnyAspect` ~1.0 instead of ~0.716 is the H2 tell (card squashed square).
     High `rejAspect` with `accepted=no` means cards are being thrown out, not missed.
3. **`[SCANDBG] rectify quad=...`** (`cardDetect.rectifyCardCrop`) — the actual 4
   corners being warped from, their `w`/`h`, the `w/h` ratio (should read ~0.716),
   and the output PNG's base64 length.
   → settles the diary's "thin/near-degenerate quad" claim directly: a degenerate
     quad collapses an edge toward 0; a tiny `pngB64len` means the crop is flat
     garbage rather than real pixels.
4. **`[SCANDBG] match ...`** (`cardMatch.matchTopK`) — best hamming distance + top-3.
   Self-interpreting via the offline calibration: **≤200 = crop-looks-GOOD**,
   **≥340 = crop-looks-GARBAGE** (that's the rot90-equivalent noise floor measured
   in `eval_scanner.py`), between = marginal. Also **the silent `catch {}` now logs**
   — it was swallowing real errors and returning `[]`, indistinguishable from
   "no match".

**Run it:**
```bash
cd app && npx expo run:android          # SCANDBG needs the native build
adb logcat -c && adb logcat -s ReactNativeJS:V | grep SCANDBG
```
Point at a real card; capture ~20s of log with the card both steady and moving.
**Read in this order:** `frame` len/aspect → `detect` aspect + reject reason →
`rectify` quad sanity → `match` distance verdict. Given H1/H2 are already refuted,
the log that actually matters now is **`rectify quad=`**: compare those corners to
where the card really is on screen. If they sit ~5-8 % inside the card's outer
border, Canny is locking onto the inner art frame and *that* is the framing error
that kills the match. **Remove the SCANDBG blocks again before committing any fix.**

### Offline scanner-accuracy harness + B-14 re-diagnosed as Stage-1, not Stage-2 (2026-07-16, measured on 4571-card DB)
Built `scripts/eval_scanner.py` — an **offline** evaluation harness for the pHash
matcher (Stage-2). It imports the *production* hash functions from
`build_card_database.py` (bit-for-bit parity with the shipped `hashes.json`),
so it measures exactly what the app does. It has three parts: (A) discrimination
of the precomputed DB, (B) rehash-the-real-image-under-degradation + search, (C)
the B-14 orientation scenario. All scoring is **by base code** (a parallel `_p1`
of the right card counts as a hit — the user disambiguates the variant visually,
per CLAUDE.md §2), which is the metric that actually matters and which my first
draft got wrong (it counted same-art parallels as "different-card collisions").

**Headline findings (sample 250-300, stable across seeds 7/42):**
- **Stage-2 matching is essentially solved for a clean, correctly-oriented crop.**
  Base-code top-1 is **100%** under brightness ±, low contrast, blur, downscale,
  and mild (6%) perspective. Different *cards* never collide (nearest cross-base
  neighbour min **118 bits**, median 243 of 768) — the "~1% < 100 bits" figure in
  cardMatch.ts was conflating same-card parallels (same art) with real collisions.
- **The failure mode is crop FRAMING, and it's a cliff.** Symmetric crop error
  (mis-scaled rectify): 4%→98.7%, **8%→34.7%, 12%→6%**. So Stage-1 must land the
  ART_CROP band within **~4-5%** of card dimensions or matching falls off a cliff.
  This is the quantified requirement B-14 was missing.
- **B-14 rotation: matchTopK's 4-rotation strategy fully works — on a clean crop
  (100% recovery).** A single wrong orientation is catastrophic (0% — a wrong card
  always wins), confirming the raw bug, but trying all 4 rotations recovers 100%.
  On a *realistic* crop (6% perspective + unknown orientation) recovery is **94.8%**.
  → **The residual B-14 failure is Stage-1 crop quality, not Stage-2 matching and
  not the rotation logic.** This partially corrects the earlier diary framing that
  matchTopK is "not fully robust yet against orientation" — orientation is handled;
  bad rectified crops are the real bottleneck. Matches the 2026-07-13 "corner
  precision / raise RES_W·RES_H" hypothesis, now with numbers behind it.

**Next-step implication:** invest in Stage-1 corner precision (higher detection
resolution / sub-pixel refinement) rather than more Stage-2 hash tuning; the
matcher already tolerates every non-framing degradation. The AHASH_MAX_DISTANCE
= 235 accept floor is also loose vs. discrimination (38.5% of cards have *some*
other card within 235 bits) — fine for ranking, but worth tightening if used as
an accept/reject gate. Run: `python scripts/eval_scanner.py` (adds `pillow numpy`;
the system python has them, the venv lacks `imagehash` but the harness doesn't
need it). No app/TS code changed this session — harness only, typecheck N/A.

### First real on-device scanner test — 2 bugs fixed, 1 diagnosed (2026-07-13, device-verified)
Followed the Android install session (below) with the actual point of having a phone in
hand: pointed the on-device scanner (Stage-1 detect+rectify + Stage-2 pHash identify,
see "Card Scanner v2" in Implemented Features) at real cards for the first time ever.
Everything here was previously typecheck-green/web-verified only — none of it had ever
run against a real camera + real cards. See **B-12/B-13/B-14** in Known Bugs for full
root-cause detail; summary:

- **B-12 (FIXED)** — Stage-1's area-rejection floor (8% of frame) was calibrated blind
  and rejected genuine card quads; real in-hand scans topped out at 7.3-8.0%. Lowered
  to 4%. Verified: went from 0 stable detections in ~2000 logged frames to consistently
  detecting a plain (non-foil) card, incl. through a sleeve.
- **B-13 (FIXED)** — Stage-2's hand-rolled DEFLATE/PNG decoder (`lib/phash.ts`, ~150
  lines reimplementing Huffman) threw `invalid huffman` on real 16×16 camera-derived
  PNGs — traced to a genuine implementation bug (confirmed against Node's `zlib` on a
  captured payload; the decoder's own comment admitted it was only ever exercised
  against untested 8×8 fixtures despite the real HASH_SIZE being 16). Replaced with
  `fflate`'s `unzlibSync` (~8KB, audited, zero deps) — this is the *right* fix, not a
  patch: don't hand-roll DEFLATE. Verified: 0 decode errors afterward.
- **B-14 (DIAGNOSED, NOT FIXED)** — even with B-12/B-13 fixed, identification still
  never matches the right card. Root-caused via a rigorous offline pipeline (saved the
  captured 16×16 PNG, ran the *exact* Python reference hash algorithm from
  `build_card_database.py` against it, compared to the true stored hash — ruling out a
  BGR/RGB channel-swap hypothesis along the way) down to: the rectified crop itself is
  garbage — visually confirmed as vertical color-banding, the classic symptom of
  `warpPerspective` stretching a thin/near-degenerate quad instead of the real card
  face. The detected quad passes the aggregate area+aspect sanity checks but its 4
  individual corners aren't localized precisely enough (480×640 detection buffer is
  low-res for this) for a clean perspective warp. **This is the actual current
  blocker** — not a threshold, a real corner-precision problem. Next step floated but
  not attempted: raise `RES_W`/`RES_H` in `NativeScanCamera.tsx` and/or add sub-pixel
  corner refinement.

**Methodology note worth repeating** — all three bugs were found by *instrumenting and
reading real device logs*, not by guessing: temporary `[SCANDBG]`-tagged `console.log`s
in `cardDetect.ts`/`cardMatch.ts`/`phash.ts`/`ScanScreen.tsx` (all removed again before
this commit — search for `SCANDBG` if this pattern needs reviving) plus `adb logcat`,
`adb exec-out screencap`, and for B-13/B-14 specifically, pulling the actual failing
payload off-device and reproducing it in plain Node/Python for byte-level and pixel-level
comparison against ground truth. This is a good template for any future "why doesn't the
scanner work" session — screen-staring and parameter-guessing would not have found B-13
or B-14.

**Also this session:** discussed monetization direction (free app, mixed one-time +
subscription — see PRODUCT.md-adjacent notes / ask the user or check assistant memory
`monetization-plan`) and confirmed the app's first real native Android install. Nothing
in this scanner diagnostic session was committed speculatively — B-12/B-13 are real,
verified fixes; B-14 is intentionally left as a documented, reproducible bug for next
session rather than a rushed patch.

### First real native Android install — found + fixed entry-point crash (2026-07-13, device-verified on physical phone)
User wants the app installable on their own Android phone to demo to colleagues. This
was **the first time this codebase's `npx expo run:android` native path was exercised
since the theme-mode feature (2026-06-26) was added** — everything before this session
had only been typecheck-green + web-verified, never device-verified (see the many
"NOT yet device-reviewed" tags on recent entries). That gap turned out to be hiding a
real crash. See **B-11** in Known Bugs for the root cause and fix
(`app/index.js` registering the root component behind an `await`, which native's
`AppRegistry.runApplication` doesn't wait for — web never hit this because its entry
point is different).

**Build/tooling findings, worth keeping for next time:**
- **A committed `app/android/` + `debug.keystore` already existed** from earlier
  sessions (June); `app.json` hasn't touched native config since, so `npx expo
  prebuild --clean` was **not** needed — a plain `gradlew assembleDebug` was enough.
  Toolchain (JDK 17 at `C:\Program Files\Java\jdk-17`, Android SDK 36, build-tools)
  was already correctly installed; only `JAVA_HOME` needed setting per-invocation.
- **`AGENTS.md`'s old "APK stays ~40MB" claim is stale** (written 2026-06-02, before
  the OpenCV/vision-camera/worklets-core scanner deps existed). A **default 4-ABI
  build is enormous**: debug 340MB, the June-12 4-ABI release was 262MB. Scoping to
  the device's actual arch with `-PreactNativeArchitectures=arm64-v8a` (covers
  virtually every Android phone from the last ~7 years) cuts this drastically:
  **debug 91MB, release 70MB**. No `splits.abi` block exists in `build.gradle` — this
  gradle-property flag is the quick way to get a single-arch build without editing
  Gradle config. Worth adding a real `splits.abi` config later if multi-arch
  distribution (Play Store) is ever needed.
- **`build.gradle` has a deliberate CameraX version pin** (lines ~155-169, forces the
  whole `androidx.camera:*` family to `1.5.0-alpha03`) working around a real conflict
  between `expo-camera`'s CameraX 1.6.0 and `react-native-vision-camera`'s need for
  `Camera2CameraInfoImpl` (removed in 1.6.0). Don't "clean up" this pin without
  testing the camera/scanner — it's load-bearing, not leftover cruft.
- **Debug builds need Metro live** (`npx expo start --android`, plus `adb reverse
  tcp:8081 tcp:8081` if only USB-connected, no shared Wi-Fi) — fine for iterating,
  but fragile for a demo (laptop must stay on, Metro must stay up). **Release builds
  embed the JS bundle** and were confirmed to run with `adb reverse` removed and
  Metro killed — that's the artifact to actually hand to/show colleagues, not debug.
- **A stale Supabase session from an old June debug install surfaced as a benign
  `AuthApiError: Invalid Refresh Token: Already Used`** toast on first relaunch (the
  refresh token had long since rotated). Not fatal — supabase-js clears the invalid
  session itself and the error didn't recur on the next launch. No fix needed, but
  good to recognize this class of error is expected/harmless when reusing test builds
  across sessions.
- **Verified end-to-end on a real device**: Xiaomi `duchamp_global`, Android 16,
  `arm64-v8a`, installed via `adb install`, launched via `adb shell am start`, Home
  screen renders correctly (Hollow Night theme, collection/vault tiles, 5-tab nav),
  no crash, no console errors, fully standalone (Metro killed, `adb reverse` removed).

### Supabase backend brought online + verified E2E (2026-07-12, verified live via app + SQL editor)
User asked to "link Supabase to the app". Discovered the entire client integration
**already existed** and was typecheck-green — no code was written this session:
`lib/supabase.ts` (client, session in AsyncStorage, graceful null when unconfigured),
`lib/auth.ts` (signUp/signIn/signOut + profile store), `lib/sync.ts` (local-first
LWW reconcile-on-login + debounced mirror push for collection/settings/wishlists/decks,
imported for side-effect at `App.tsx:41`), `lib/friends.ts` (search/requests/RLS-gated
friend reads), and `supabase/migrations/0001_init.sql` (9 tables + enums + `handle_new_user`
trigger + `are_friends`/`can_view`/`vis_of` + full per-resource RLS). `config.ts` already
held the correct `SUPABASE_URL`/`SUPABASE_ANON_KEY` (publishable `sb_publishable_…` key).

**Root cause of "it doesn't work":** the project was **auto-paused** (Supabase Free tier
pauses after ~1 week idle and *removes the DNS record* → `hphdhozwuvbhduqrwdxn.supabase.co`
returned NXDOMAIN, which looked like bad credentials). **Fix = Resume project** in the
dashboard (free; data restored from backup, incl. the already-applied schema). Takes a
few min to warm up: DNS → Cloudflare 521 → PGRST002 "schema cache retrying" → 200.

**Verified end-to-end (web preview `horohorotcg-web` :8399, user signed up as `eloi-luffy`):**
signUp returned a session immediately (Auth → "Confirm email" is **OFF**, as chosen for
testing); the trigger created the `profiles` row (username) + `privacy_settings` defaults;
"Synced" state + reconcile fired on login; adding a card pushed to `collection_items`
(EB01-001 count 2 etc., fresh `updated_at`); RLS confirmed (anon key reads nothing, the
authenticated app syncs). Server counts via SQL editor: 3 users / 3 profiles / 3 privacy rows.

**Gotchas for next session:** (1) Free tier will re-pause when idle — just Resume again, or
go Pro. (2) The anon/publishable key **cannot** read tables from curl (RLS is `to authenticated`);
verify server rows via the dashboard SQL editor (runs as `postgres`, bypasses RLS), not REST.
(3) `config.ts` comment still says the key is a "JWT anónima" but the value is the newer
`sb_publishable_…` format — works fine with supabase-js v2, just a stale comment. Nothing
committed (per Rule 3); this session made no file changes beyond this diary entry.

### Brand revamp: Perona / Negative Hollows (revert from Zeus) (2026-06-28, typecheck-green, web-verified via DOM)
User missed the original HoroHoro identity and asked to revamp it (planned with
/impeccable + /frontend-design). The Zeus thundercloud theme was never committed,
so the original Perona palette was recoverable from `git show HEAD:app/src/theme.ts`.

**Direction (confirmed via AskUserQuestion):** two themes (Hollow Night + Ghost
Day), and a **static** (non-animated) holographic foil.

**What shipped:**
- **`theme.ts` palette** — DARK = "Hollow Night": Perona pink `#ff6fb5` (accent),
  spectral Negative-Hollow cyan `#9fe3e8` (ghost = progress/collection), gothic
  base `#131019`/`#1c1726`/`#261f33`, lavender text `#f6f0fa`. LIGHT = "Ghost
  Day": pale lavender base, pink deepened to rose `#c0357a` + cyan to teal
  `#0f8390` for text-on-light legibility (ink-flips to white). The pink/cyan
  *roles* are constant; only values shift per theme.
- **Holographic foil** ("Horo Horo = holographic" pun): new `FOIL_STOPS`/`onFoil`
  in theme + `components/FoilBadge.tsx` (react-native-svg linear gradient pink→
  lilac→cyan→pink). Used in `CardThumb` to render holo rarities (`HOT_RARITIES`)
  as an iridescent chip instead of plain "· SR" text. Ban-safe (gradient on a
  badge surface, not gradient text) and *meaningful* (it literally is holo rarity).
- **Ghost motif** — redrew the `cloud` icon (kept the legacy key) into a
  Negative-Hollow ghost (domed head + wavy bottom + dot eyes); splash + completion
  pick it up. `colors.ghost`/`cloud` finally match their names again.
- **Settings labels** — `settings.appearance` "Zeus's form"→"Theme",
  thundercloud→"Hollow Night", regularForm→"Ghost Day" (keys kept, values + es.ts).
- **Docs** — PRODUCT.md brand personality + DESIGN.md (frontmatter colors, §1
  North Star "The Negative Hollow", §2 color names, Named Rules, two-theme block,
  do/don'ts) rewritten Zeus→Perona.

**Verified (DOM, screenshot tool down):** gothic surfaces `rgb(19,16,25)/(28,23,38)/
(38,31,51)` live, Perona pink `rgb(255,111,181)` + spectral cyan `rgb(159,227,232)`
present, **16 foil badges** rendering with the iridescent stops on Browse holo
cards, no console errors. The splash ghost + Ghost Day light theme not eyeballed
(splash only at boot; light theme needs the Settings toggle + restart) — verify on
device. Nothing committed.

### Collectr-style restyle: flat tab bar, Profile tab, in-field scan, price tiles (2026-06-28, typecheck-green, web-verified via DOM)
Inspired by a Collectr app screenshot the user shared. Planned with `/impeccable`
(shape): two rounds of AskUserQuestion locked the direction before any code.

**What shipped (5 files + 1 new screen):**
- **Flat 5-tab pill bottom bar** (`App.tsx`). Tabs are now `Home · Cards ·
  Binder · Decks · Profile`. The floating center **Scan FAB was removed** along
  with its spacer/notch logic; the active tab now carries an `accentDim` pill
  (`tabInner`/`tabInnerOn`) behind icon+label. `TabBar` lost its `onScan` prop.
- **New `Profile` tab** (`screens/ProfileScreen.tsx`, registered in `App.tsx`,
  `navigation.ts` `TabParamList` + `ProfileScreenProps`). A hub: identity card
  (Guest / signed-in username → Account) + rows to Account, Friends (gated on
  backend+signed-in, mirroring AccountScreen), and Settings. **Header gear was
  kept** (user's call — two paths to Settings).
- **Scan moved into search** (user's call: kill FAB). Browse search field gained
  an accent camera button at its left (`BrowseScreen.tsx`, `scanBtn` + new
  `camera` icon in `Icon.tsx`). Binder has **no search field**, so its camera
  lives in the action row's add cluster (owned tab only, `BinderScreen.tsx`).
- **Browse price tiles** (`CardThumb.tsx`). New `price?`/`onAdd?` props render a
  footer price row: `formatPrice()` left, a compact `+` right (accent-filled
  when `effectiveOwned===0`, quiet surface pill once owned). Browse switched off
  `quickActions` (the old center +/- overlay) to use this. Count-bubble still
  signals owned qty, so the row stays single-height. Price = `lib/prices.ts`
  `getPrice`; **no change-% delta** (no price-history store yet — see QoL).
  Nested-button a11y guard updated to also suppress the outer role when `onAdd`
  is set (avoids `<button>`-in-`<button>` on web).

**Verification.** Typecheck green. `preview_screenshot` was **down again**
(consistent 30s timeouts), so verified structurally via `preview_eval` DOM
queries on the running web build: 5 tabs ordered + active `accentDim` pill;
Browse camera (38×38 accent, camera path present) + price strings on tiles +
add button flips hot→plain and spawns a `×1` bubble on add; Profile hub text +
gated rows; Binder action-row scan button (30×30 accent); cross-screen state
(adding in Browse showed `1 unique` in Binder). No console errors. **Not yet
device-reviewed, not committed** (awaiting user review per Rule 3).

**Follow-up same day — framed tiles.** Per a second Collectr screenshot, Browse
tiles now sit in a rounded `surface` pill with a hairline border (`framed` prop
on `CardThumb`), each card visually separated from its neighbours; the
count-bubble renders outside the pill to keep its corner "bleed". `useCardGrid`
gained optional `{ gap, hPadding }` overrides so Browse can run a tighter grid
(gap 8 / hPad 12) without touching Binder/SetDetail. Compact (≥3 col) uses a
smaller frame (radius 12 / pad 5). Typecheck green; DOM-verified (17 framed
surface tiles with border + radius + padding). Frame is **Browse-only** for now
— could extend to Binder/Sets if wanted.

**Follow-up same day — Collectr tile layout + real %-change.** Per a third
screenshot: Browse art **inset to ~82%** (centred, breathing room), **quantity
moved bottom-left** (`×N`, accent/dim — top-right bubble suppressed in this
mode), **price + %-change bottom-right**, and the `+` is now an **overlay on the
art's corner** (was an inline row button). New `priceMode`/`priceChange` props on
`CardThumb`; `imgFramed` (82% + center), `statRow`/`qty`/`priceWrap`/`pct`/
`addOverlay` styles. **Built the deferred price-history store** (`lib/
priceHistory.ts`, AsyncStorage key `optcg.priceHistory.v1`, init from `App.tsx`):
it snapshots the current price release and, when `prices.json`'s `generated`
changes (a new weekly release), the prior snapshot becomes the delta reference.
`getPriceChangePct(code,suffix)` returns null until there's a prior release, so
the tile shows muted `0.0%` today and real green/red %s after the next price
refresh. New `realTrend`/`snapshotRealPrices` exports in `lib/prices.ts`.
DOM-verified: art ratio ~0.82 of content, `×N` bottom-left, price+`0.0%`
bottom-right, accent `+` overlay on art corner, no console errors. (This retires
the "price change-% delta" spawn-task chip — done, not deferred.)

**Follow-up same day — Collectr tile v2 + applied to Sets.** Per a fourth
screenshot round: the framed price tile is now also the **regular view mode for
Set-detail** (`SetDetailScreen` switched off `quickActions` → `framed` + price +
`onAdd`, tighter grid like Browse). Tile changes in `CardThumb`: art **inset to
~80%** with **reserved stack space** (ghost-stack caps at 4; pill reserves
`STACK_RESERVE` as `marginBottom` so stacks no longer bleed onto neighbours and
there's guaranteed art↔text air); **more top padding**; **no icons over the art**
(multi-art indicator suppressed in priceMode); quantity now reads **`Quantity: N`**
(`card.quantity` i18n, en+es) on its own line; the **`+` moved to bottom-left** of
the pill with **hold-to-add** — +1 immediately, then every 500 ms, a ~1.8 s pause
at the playset (4), then a faster cadence (`PLAYSET`/`ADD_STEP_MS`/`ADD_FAST_MS`/
`PLAYSET_PAUSE_MS`, recursive setTimeout). DOM-verified on Browse: art ratio
~0.82, no icons on art, `Quantity:` line, `+` bottom-left, price+`0.0%`
bottom-right; hold reached 4 → paused → resumed faster → stopped on release
(cadence reads ~1 s in preview because background tabs clamp timers; real device
= 500 ms). Set-detail not click-through-verified in the headless preview (couldn't
drive Sets→SetDetail nav; screenshot tool still down) but shares the identical,
verified render path + typechecks.

**Follow-up same day — tile v3: price-by-name, − N + stepper, pill everywhere.**
Per a fifth round: (1) **price moved up next to the name** (right side, with %
stacked under it) — `nameRow`/`priceCol` in `CardThumb`; (2) quantity is now a
**`− N +` stepper** (replaces the "Quantity: N" line + single +): `−` uses a
**negative colour** (red `down` border+icon), disabled/dim at 0, hold-to-repeat
that floors at 0 (`onRemove` + `startRemoveHold`); `+` unchanged (accent, playset
pause). (3) **Pill is now universal across all card grids** — added `framed`
+ priceMode to **BinderScreen** (Collection via `adjust`, Trade via
`setTradeOverride`, both through the existing `handleAdjustCard`), tighter grid to
match. `card.quantity` i18n key now unused (left in place). DOM-verified at mobile
375px: Browse tile = name+`€3.50`/`0.0%` top, `EB01-006 · SR`, `−  0  +` (minus
border `rgb(229,75,107)`, plus accent), 0 icons on art; `+` 0→1→2, `−` 2→1→0 then
floors (minus opacity 0.4 at 0); Binder tile identical with live count (added 2 in
Browse → `1 unique · 2 units` in Binder). No console errors. Set-detail again not
click-through-verified (headless nav) but shares the path + typechecks.

**Follow-up same day — UI audit (/impeccable audit + /frontend-design) + 3 fixes.**
Audit health 17/20 (anti-patterns PASS — distinctive, not AI-slop; weak dimension
was responsive). Fixed per user: (1) **card art corner radius 14→8** in
`CardThumb` (`imgMain`/`ghost`/`selOverlay`) — 14 clipped the printed card now
that the art is inset ~80%; (2) **removed the redundant `{n} cards` count** from
`SetDetailScreen` grid controls (the SetBanner already shows owned/total up top);
(3) **gutters unified to 18** across Browse/Sets/Binder grids (`useCardGrid` now
`{ gap: 8, hPadding: 18 }`, matching header/search/sort so cards align with the
chrome) and added a **web max-width shell**: new `lib/layout.ts` `MAX_CONTENT_WIDTH`
= 480, applied in `App.tsx` (`appShell`, web-only `maxWidth`+`alignSelf:center`)
and respected by `useCardGrid` (measures cards against the capped column, not the
window). DOM-verified at a 698px window: shell centres to a 480 column (≈109px
each side), tab bar centred (456 wide), search + tiles aligned at the 18px gutter,
art radius computes to 8px, no console errors. Native unaffected (Platform.OS web
gate). Remaining responsive note: the app is phone-first; the web cap is a
preview/responsiveness nicety, not a true desktop layout.

**Decisions deferred (open):** scan still not globally reachable (Browse + Binder
owned tab only); pill/price/stepper covers **Browse + Set-detail + Binder**
(Collection & Trade) — Wishlist/Deck grids still use their own components; the
%-change reads `0.0%` until the next weekly `prices.json` release gives a prior
snapshot (by design — see priceHistory.ts).

### Binder tab icons, sort-filter icons, Columns label (2026-06-26, typecheck-green, structurally-verified — see caveat)
**The Zeus-face SVG from the previous entry was scrapped** ("it's awful") — no
replacement requested, just removed `app/assets/zeus-face.svg`. Lesson:
illustrated character art is a fundamentally different skill from icon-path
geometry; iterating coordinates blind (even carefully) isn't a substitute for
actually being good at figure drawing. Don't attempt another illustrated
mascot asset without much tighter iteration loops, ideally with screenshot
verification working (it wasn't this session — see caveat below).

- **Three new icons** in `Icon.tsx`: `archive` (lid + body + handle line,
  matches the standard "archive box" convention — cross-checked structurally
  against Feather's archive.svg proportions), `cardHeart` (card outline with
  a small heart deliberately bleeding off the top-right corner — an
  intentional echo of `CardThumb`'s existing "count-bubble bleeds off the
  corner" pattern, not a mistake), and a redrawn `swap` (two mirrored
  chevron-arrows, 180°-rotationally symmetric by construction) replacing the
  old uneven one.
- **Binder's 3 tabs (Collection/Wishlist/Trade) now carry icons** —
  `SegmentedControl` gained an optional `icon` field (backward compatible;
  `FriendProfileScreen`'s usage doesn't pass one and is unaffected) rendering
  before the label, colored `onAccent` when the segment is active.
- **Sort filters now carry icons**: code→`tag`, set→`layers`, power→`bolt`,
  rarity→`star` (the four the user named), applied in both `BrowseScreen` and
  `BinderScreen`. `cost`/`owned` in `BrowseScreen` deliberately left
  text-only — not requested, and no obviously-right icon for either.
- **`ColumnsToggle` now self-labels** (grid icon + "Columns" before the
  2/3/4/5 pills) — changed once, in the shared component, so all 3 call
  sites (`BrowseScreen`, `BinderScreen`, `SetDetailScreen`) picked it up
  automatically.
- **Found and fixed 2 real, pre-existing toolbar-overflow bugs** while
  making room for the new labels. `BrowseScreen`'s sort row (Parallels + 6
  sort keys + ColumnsToggle) measured at **662px of content** clipped into a
  **375px-wide `overflow: hidden` container** — i.e. "Owned" was already
  unreachable on a real phone *before* today's icons made it worse, just
  less so. Same shape of bug in `BinderScreen`'s action row. Neither was
  caught earlier because earlier checks measured individual button widths,
  not the full row's `scrollWidth` against its container — the right
  diagnostic is comparing a row's total content width to its rendered
  container width via `getComputedStyle(...).overflowX` + `scrollWidth`, not
  eyeballing whether any single label looks long.
  - **Fix, applied to all 3 control rows** (`BrowseScreen`'s sort row,
    `BinderScreen`'s action row, `SetDetailScreen`'s grid-controls row):
    wrapped the button cluster in a horizontal `ScrollView` (`flex: 1`,
    sibling to a fixed-width count label), so content can be arbitrarily
    wide and just scrolls instead of clipping. Verified structurally post-fix:
    each row's scrollable ancestor now reports `overflowX: auto` with a
    bounded `width` smaller than its `scrollWidth` (e.g. Browse:
    width 263 / scrollWidth 662) — content is reachable by scroll, not lost.
- **`preview_screenshot` was down for most of this session** (consistent
  ~30s timeouts surviving a server restart, viewport resize, and reload —
  `preview_eval`/DOM queries kept working throughout, which is how the
  overflow bugs above were actually found and confirmed-fixed without any
  visual). It recovered before the end of the session: confirmed visually
  that `archive`/`cardHeart`/`swap` all read cleanly on Binder's 3 tabs,
  `tag`/`layers`/`bolt`/`star` read cleanly on the sort filters in both
  Browse and Binder, and that scrolling each fixed control row actually
  reveals the previously-unreachable Columns/Select/Owned controls as
  intended. Visually verified, not just structurally inferred.

---

### gear/binder icon redraws + standalone Zeus-face SVG asset (2026-06-26, typecheck-green, web-verified)
Follow-up to the icon pass in the entry below: user looked again and flagged
`gear` (Settings) and `binder` (Binder tab) specifically as "a bit off" —
both were icons I'd checked at their real usage size (20-22px) and judged
fine, but at a larger render they're visibly uneven. Lesson: small-size
checks alone aren't enough for icons with fine structure (gear teeth,
notched silhouettes) — also render large to catch asymmetry that's
invisible at icon scale but still *feels* subtly wrong to the eye even when
the user can't articulate why.
- **`gear`**: the old path was 12 hand-typed teeth/notches with uneven
  spacing and depth — looked lumpy/bumpy rather than a crisp cog. Replaced
  with a **programmatically generated** 8-tooth gear (trigonometry in a
  `preview_eval` script: even angular spacing guaranteed by construction,
  not by hand-tuning numbers) — see the `gearPath()` generator used to
  produce the final coordinates, now hardcoded as the path string (no
  runtime generation in the app itself, just used once to derive clean
  numbers). Verified symmetric from 20px to 160px.
- **`binder`**: old path was a bookmark with an uneven double-notch bottom
  and a stray disconnected horizontal line near the top that didn't read as
  purposeful. Replaced with a standard single-notch bookmark silhouette
  (`M5 4a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2v17l-7-5-7 5Z`), rounded top corners
  to match the rest of the icon set's soft aesthetic. Compared 3 candidate
  notch/corner variants live before picking this one.
- **New `app/assets/zeus-face.svg`**: standalone illustrated SVG (200×200,
  filled shapes + outline, not a 24px stroke icon like the rest of
  `Icon.tsx`) of Zeus's Regular-form face, built to match a reference photo
  the user provided (a marshmallow die with Zeus's face painted on it):
  white round face, red/white/yellow cap with a button on top, one neutral +
  one raised eyebrow (the sly/asymmetric expression from the reference),
  circle eyes with dot pupils, pink cheek blush, a small wavy "w" smile.
  Iterated live in the browser (inject SVG into the running preview,
  screenshot, adjust coordinates, repeat) rather than guessing coordinates
  blind — caught and fixed an off-center cap and an ugly pointed seam where
  the brim met the dome before finalizing. **Not wired into the app anywhere
  yet** — delivered as a standalone asset only; ask the user before using it
  as e.g. a splash replacement or avatar, since they didn't specify a use site.
- **Verified**: typecheck clean; reloaded the live preview after the icon
  fixes — gear reads as a clean symmetric cog in the header, binder reads as
  a clean bookmark in the tab bar and the Home "Collection" tile, both at
  their real rendered sizes, not just in isolation.

---

### Correction: Thundercloud's accent is purple lightning, not red + 2 icon redraws (2026-06-26, typecheck-green, web-verified)
User feedback on the light/dark theme work below: "I explicitly asked for a
yellow or purple color instead of a red" for Thundercloud — a real miss, not
a preference nitpick. **What went wrong:** the original ask (the rebrand,
earlier the same day) was "mimic Zeus, cap colors are red/white/yellow." When
the *second* ask layered light/dark theming on top ("Regular vs Thundercloud,
rays are purple in canon but I'd like yellow or a mix"), I treated that
purple/yellow question as being about the *secondary* progress accent only,
and kept the *primary* brand accent as red in both themes — i.e., I built two
backgrounds (light/dark) for one brand color, instead of two genuinely
different brand identities for two genuinely different forms. The user's
question was about Thundercloud's defining color, full stop, and the answer
should have been "purple is Thundercloud's whole identity," not "red stays,
here's how yellow/purple could season it."
- **Fix**: `theme.ts`'s `DARK` (Thundercloud) `accent` changed `#f0452c`
  (orange-red) → `#a64dff` (electric violet — the lightning), with
  `onAccent`/`accentDim`/`accentGlow`/`badge` recomputed to match. `ghost`
  (gold) **unchanged** — it's the cap brim, visible in both forms, and stays
  the connective progress/collection thread across themes. `LIGHT` (Regular)
  is **unchanged** — red is correctly Regular's identity (the cap, on a white
  cloud where the brim/cap *is* the color story). Picked violet over a
  softer/more canon-pink-leaning purple to keep clean separation from
  `OPTCG_COLORS.Purple` (#9b5de5) — same anti-collision reasoning as the
  red/yellow separation from the original rebrand.
- **Lesson for future re-theming work**: when a character/property has
  multiple visually distinct forms, ask "does each form get its own
  identity color, or one identity color restyled per background" *before*
  picking hex values — the user's literal phrasing ("Thundercloud" as a named
  form, lightning explicitly called out) was the tell that they meant the
  former, not the latter.
- **Icon pass**: user separately flagged "some icons can be vastly improved."
  Checked actual usage first (`grep` for `Icon name=` across the app,
  including ternary-bound names) to avoid polishing icons nobody sees (e.g.
  `bolt`, `cart`, `tag`, `swap`, `bell`, `star` are all defined in `Icon.tsx`
  but never rendered anywhere — left untouched, not worth the effort).
  Rendered the actually-used set in the live web preview at real sizes (12–
  104px) to judge by eye, not by reading path data. Two clear misses, both
  redrawn and re-verified at size:
  - **`cloud`** (the mascot — splash, Sets "materialized" texture, Settings
    form-picker) was lopsided/blobby, didn't read as a cloud at a glance.
    Iterated 3 candidate paths live in the preview before picking the
    cleanest, then confirmed it holds up from 12px to 104px.
  - **`checkSquare`** (bulk-select toggle) had a cramped, off-center
    checkmark. Enlarged and re-centered it within the box.
  - `gear`, `binder`, `sparkle` checked and left as-is — read clearly at
    their real usage sizes, not actually weak.
- **Verified**: reloaded the web preview after the accent fix — Thundercloud
  now reads purple/gold throughout (Home tiles, Settings, progress %), Regular
  confirmed still red/gold and unaffected, switched back to Thundercloud
  (default) afterward. `DESIGN.md` (Overview, Colors, Components, Do's/Don'ts)
  and `PRODUCT.md` (Brand Personality, Design Principles, Accessibility — the
  last one had a now-stale "Dark theme only, no light theme planned" line
  from before today's work, caught and fixed in this same pass) rewritten
  throughout to stop saying "red" as if it were theme-universal.
- **Pending user**: re-review Thundercloud in person — purple is a much
  bigger swing on "does this feel like Zeus" than the lightness-only red I
  shipped first.

---

### Light/dark theme: Zeus's Regular and Thundercloud forms (2026-06-26, typecheck-green, web-verified, NOT yet device-reviewed)
Follow-up to the same day's rebrand: user wants to alternate the app's look
based on Zeus's two canon forms — Regular (white cloud, daytime) and
Thundercloud (black storm cloud, lightning). Picked **yellow as the
persistent progress/collection accent in both forms** (not the reference
image's purple lightning) when asked — keeps a set's progress ring reading
the same color whether you're in Regular or Thundercloud, which matters more
for usability than canon-accuracy; purple was offered as a future "rare glow
accent" idea, not built.

- **The real engineering question, surfaced before building anything**: this
  app's styles are `StyleSheet.create({...colors...})` calls at **module
  scope** in ~40+ files — evaluated once, at first import, never again. A
  live/instant theme toggle would need every one of those screens refactored
  to consume colors reactively (a context/hook + styles computed per-render)
  — a large, invasive change. Asked the user: live-and-large, or
  restart-to-apply-and-small? They picked **restart-to-apply**.
- **Restart-to-apply turned out to have its own hidden trap**, found during
  implementation, not before: even on a full app restart, `theme.ts`'s
  `colors` object is still resolved at module-evaluation time, and
  AsyncStorage reads are async — by the time a persisted preference loads,
  every screen's `StyleSheet.create` has *already* run with whatever was
  available synchronously (i.e., a hardcoded default), every single restart.
  ES `import` statements are hoisted and eager; gating *rendering* behind a
  loading screen (the obvious first instinct) doesn't help because it doesn't
  gate *importing* — `App.tsx`'s top-level `import { HomeScreen } from
  './screens/HomeScreen'` already ran before any component-level gating logic
  could execute.
  - **Fix: a custom entry point that defers the `require()`, not just the
    render.** New `app/index.js` (replaces `expo/AppEntry.js` via
    `package.json`'s `main` field) does: `await` the persisted theme mode from
    AsyncStorage → stash it on `globalThis.__INITIAL_THEME_MODE__` → **only
    then** `require('./App')` (CommonJS, deferred — not a static top-level
    `import`, which would defeat the whole point by hoisting). Since `App.tsx`
    and every screen it imports are only evaluated *after* the await
    resolves, their `StyleSheet.create` calls see the correct `colors` from
    their very first evaluation. `theme.ts` reads
    `globalThis.__INITIAL_THEME_MODE__` once, synchronously, to pick `LIGHT`
    vs `DARK`. Verified by literally reloading the web preview after switching
    modes — the new theme applied immediately on the very next load, no flash
    of the old one.
  - New `lib/themeMode.ts`: tiny dedicated AsyncStorage key
    (`optcg.themeMode.v1`, deliberately separate from `settings.ts`'s schema —
    it must be readable before `App.tsx`/`theme.ts` exist, so it can't depend
    on anything settings-shaped). `getStoredThemeMode()` / `setThemeMode()`.
- **`theme.ts`** restructured: `DARK` (Thundercloud, = the rebrand from
  earlier today, unchanged) and a new `LIGHT` (Regular) object, picked via the
  global flag above. **Regular's `accent`/`ghost`/`up`/`down` are NOT the same
  hex as Thundercloud's** — they're deliberately darkened. Checked by hand:
  Thundercloud's bright red/gold, used as direct text-on-white, would fail
  ~4.5:1 (gold especially — bright yellow text on white is barely readable at
  any contrast ratio). Darkening them fixed text-on-bg contrast, but flipped a
  *second* problem: dark-ink-on-now-darker-fill buttons dropped to ~3.9:1
  (fails). Resolved by flipping Regular's button ink to **white**-on-fill
  (computed ~4.7:1+) — documented as "The Ink-Flip Rule" in DESIGN.md, a
  contrast-driven exception, not a violation of the existing "dark ink on
  accent" convention (which only ever held for Thundercloud's specific bright
  fill values).
- **New `onScrim` export** (`#f2f3f5`, fixed, not part of either theme
  object). Found a real bug while testing Regular mode visually (not visible
  in Thundercloud, where it accidentally worked): `SetBanner`'s back-button
  circle and `DeckRow`'s "⋯" menu circle sit on a backdrop that's *always*
  dark (`rgba(21,22,26,~0.55)`, for legibility over busy key art, independent
  of theme) — but their icons used `colors.text`, which flips dark in Regular
  mode. Dark icon on dark circle = invisible. Fixed both to use `onScrim`
  instead. **This is exactly the kind of bug that only a real-mode test
  catches** — reasoning about hex values on paper said nothing was wrong,
  because `colors.text` "should" contrast with its surroundings; it just
  doesn't when the surroundings are a separate fixed-color element, not `bg`.
- **Audited every hardcoded `color: '#fff'` in the codebase** while in there
  (13 occurrences across `AccountScreen`, `BinderScreen` ×2, `BrowseScreen`,
  `DeckDetailScreen`, `DecksScreen` ×2, `DetailScreen`, `FriendProfileScreen`,
  `FriendsScreen`, `ScanScreen` ×3, `WishlistDetailScreen`). All but one were
  text on an `accent`-filled button/badge that should have read
  `colors.onAccent` — a latent inconsistency that happened to look fine in
  the old single-theme app (white text on bright Perona pink/Thundercloud red
  both pass contrast well enough) but would have looked *visually
  inconsistent* in Regular mode (white-on-red there is correct per the
  Ink-Flip Rule, so these accidentally still pass contrast — but they weren't
  *deriving* the right answer, they were hardcoded to it by luck). Fixed all
  to `colors.onAccent`. The one exception (`CardThumb.tsx`'s `sourceSetText`)
  sits on a fixed dark image-overlay badge, not an accent fill — correctly
  left as fixed white, same reasoning as `onScrim`.
- **Settings UI**: new "Zeus's form" section (placed above Language, since
  it's the most prominent app-wide preference) with two icon+label pills
  (`cloud` icon, reused from the rebrand). Picking a different mode than the
  currently-active one immediately persists it and shows a toast: "Saved —
  restart the app to see the new look." A `pendingMode !== themeMode` check
  shows the same notice as static text too, in case the user navigates away
  from the toast before reading it.
- **Verified in web preview** (page reload = the same cold-boot timing this
  feature depends on, so this is a faithful test, not a simulation): switched
  to Regular, reloaded, light theme applied immediately on Home/Cards/Sets/
  SetDetail with no flash of Thundercloud; the tab bar's floating wash
  (`tabBarWash`, a new per-theme token — it's a translucent value that can't
  derive from a solid `surface2`) correctly went from dark to light; the
  back-button contrast bug above was caught and fixed in this same pass;
  switched back to Thundercloud and confirmed it still works after the fix.
- **Pending user**: device review in both forms — this is the first time the
  app has had more than one theme, and the restart-to-apply UX (toast +
  static notice, no automatic reload) hasn't been felt on a real device yet.

---

### Full rebrand: Perona/ghost theme → Zeus thundercloud (2026-06-26, typecheck-green, web-verified, NOT yet device-reviewed)
User-requested rebrand via `/impeccable`: "mimic Zeus's style and personality
... black/gray BG, white cloud, and the colors on the cap." Zeus is Big Mom's
giant thundercloud minion — white puffy body, a red/white candy-stripe party
hat with a yellow brim. Asked one clarifying question before touching code
(mascot icon: redraw as a cloud, or keep the ghost shape just recolored?) —
user picked **redraw as a cloud**, so this is a full identity swap, not just a
hex-value swap.

- **Color strategy.** Kept the existing system's structure (storm-neutral base
  + exactly two semantic accents, same token *keys* as before) and remapped
  the hues: brand/primary-action accent → **cap red** (`#f0452c`), progress/
  collection accent → **brim gold** (`#f6c343`), all text/surfaces → **cloud
  white/gray** neutrals. This was a deliberate choice to preserve the proven
  "Two-Color Rule" structure rather than redesign the system's shape — the
  user asked for *Zeus's colors*, not a different design philosophy.
- **Collision avoidance (important, easy to get wrong on a re-skin like
  this).** The new brand red/gold are close in hue family to two of the
  OPTCG's own 6 card-data colors (`optcg-red` #e63946, `optcg-yellow`
  #f4a261) — a real risk, since the system's own rule says card-data colors
  must never be confused with UI brand colors. Resolved by deliberately
  choosing brand `accent` more *orange* than `optcg-red`, and brand `ghost`
  more *golden/saturated* than `optcg-yellow` (which is actually a peach).
  Also separated `down` (#e54b6b, rose-leaning) from the new `accent`
  (#f0452c, orange-leaning) for the same reason — they'd have collided since
  the old `accent` was pink, not red, and never competed with `down` before.
- **`theme.ts`** — every color in the `colors` object changed value (bg/
  surface/surface2/border/text/textMut/textDim/accent*/onAccent/ghost*/
  onGhost/badge/ring/down). `up` stayed `#4ec98b` (unrelated semantic, no
  collision). `OPTCG_COLORS` (the 6 card-data colors) **untouched** — those
  are the game's own identity, not the app's brand.
- **Mascot icon redrawn, not just recolored.** `components/Icon.tsx`'s `ghost`
  icon (a literal ghost silhouette + 2 eye dots) replaced with a `cloud` key
  (puffy cloud silhouette, Feather-style arcs, same 2-eye-dot abstraction
  level for visual continuity with the rest of the icon set). Updated all 4
  call sites: `App.tsx` splash logo, `SetUpdateBanner.tsx`, and
  `SetsScreen.tsx`'s two "materialized" ghost-watermark/dot icons.
  **Deliberately did NOT rename the `colors.ghost` token key** (used in ~7
  files for the progress/collection semantic) — renaming it everywhere is a
  refactor the user didn't ask for and risked introducing bugs for zero
  visible benefit; documented the now-stale name in DESIGN.md's "Legacy Token
  Rule" instead so future sessions aren't confused by `colors.ghost` meaning
  gold, not cyan.
- **Hardcoded scrim/backdrop sweep.** Several components had backdrop/dim
  colors as raw `rgba(...)` literals derived from the *old* bg hex
  (`rgba(14,12,26,*)`, `rgba(19,16,25,*)`) instead of referencing a token —
  these don't auto-update when `theme.ts` changes. Found via a targeted grep
  for the old hex fragments (not deterministic without it — `theme.ts` alone
  wouldn't have caught these). Re-derived all 14 from the *new* bg
  (`#15161a` → `rgba(21,22,26,*)`, preserving each file's original alpha):
  `BinderScreen.tsx`, `DeckDetailScreen.tsx`, `DecksScreen.tsx`,
  `WishlistDetailScreen.tsx`, `ScanScreen.tsx`, `BulkTargetSheet.tsx`,
  `CardThumb.tsx` (×2), `DeckCardPile.tsx`, `DeckRow.tsx`, `SetBanner.tsx`,
  `SetBulkAddSheet.tsx`, `VariantPickerSheet.tsx`, `WishlistPickerModal.tsx`.
  Also caught one in `App.tsx`'s floating tab bar (`rgba(28,23,38,0.94)`,
  visibly purple-tinted in the first screenshot) → `rgba(30,32,36,0.94)`.
- **`DESIGN.md`** rewritten in full: new creative north star ("The
  Thunderhead" replaces "The Negative Hollow"), renamed color swatches (Cap
  Red, Spark Gold, Storm Void, Cloud White, Faded/Dim Cloud, Ember/Charge
  Ink), updated Named Rules (Two-Spark Rule replaces Two-Ghost Rule; added a
  Legacy Token Rule explaining the `colors.ghost`/`cloud`-icon naming
  holdover), updated component descriptions (buttons, card thumbnails,
  progress rings/orbs, navigation) to reference the new colors. Typography,
  spacing, radii, elevation shape — all **unchanged**, this was a color/
  identity rebrand, not a structural one.
- **`PRODUCT.md`** — updated "Brand Personality" and "Design Principles" to
  describe Zeus/thundercloud instead of Perona/ghosts, with a one-line note
  pointing back to this diary entry for the full rationale.
- **Contrast checked by hand** (no automated tool in this stack): text/bg
  ~16:1, textMut/bg ~6.7:1, textDim/bg ~4.1:1 (matches the old system's
  documented ~4:1 floor), onAccent/accent ~4.9:1, onGhost/ghost ~11.2:1 — all
  clear AA for their respective text sizes.
- **Verified in web preview**: Home (hero stats, vault value, tile grid, tab
  bar), Browse/Cards (search row, sort row, card thumbnails), Sets (family
  card, progress rings, rarity strip, "materialized" cloud icon), SetDetail
  (rarity-in-banner, Parallels/Missing/Select pills), and the
  `SetBulkAddSheet` destination toggle — all read cleanly in the new palette,
  no leftover purple/pink/cyan visible anywhere.
- **Pending user**: device review — this is the single biggest visual change
  to ship this app has had; confirm the red/gold feel matches the Zeus
  reference on a real screen before treating it as final. Also worth a skim
  of `DESIGN.md`'s renamed swatches in case any naming should change.

---

### Persistent tab bar, universal back, rarity-in-banner, collection bulk-add, icon labels, sparkle icon (2026-06-26, typecheck-green, web-verified)
Five independent user-requested changes, all auto-actioned. The first two were
flagged to the user as architectural decisions before starting (tab bar on
modals? lightweight overlay vs. full nested-stack refactor?) — user picked
"pushed screens only" + "lightweight global overlay" for both.

- **Persistent bottom tab bar on every non-modal screen.** Previously the
  floating tab bar only existed inside `Tabs.Navigator` (Home/Browse/Binder/
  Decks) — any root-stack screen (Sets, SetDetail, DeckDetail, Settings,
  WishlistDetail, Account, Friends, FriendProfile) hid it entirely, since
  React Navigation's tab bar unmounts once you leave the tab navigator.
  Rewired in `App.tsx`: the `TabBar` component is now rendered **once**, as a
  sibling of `<Stack.Navigator>` inside `<NavigationContainer>`, driven by a
  module-level `navigationRef` (`createNavigationContainerRef`). `activeTab`
  is "remembered" state — it only updates when the focused route is actually
  one of the 4 main tabs, so it keeps highlighting (e.g.) Home while you're
  three screens deep into SetDetail. `Tabs.Navigator`'s own built-in tab bar is
  suppressed (`tabBar={() => null}`) to avoid a duplicate. The bar hides only
  on `Detail` and `Scan` (`HIDE_TAB_BAR_ON` set in `App.tsx`) — full-screen
  modals, the one case where hiding background nav is the established
  convention, per explicit user choice.
  - **Bottom padding audit**: every screen that previously assumed no
    persistent bar at the bottom needed more breathing room.
    `SetDetailScreen`'s grid bumped `paddingBottom` 30→110. `SettingsScreen`,
    `AccountScreen`, `FriendsScreen`, `FriendProfileScreen` bumped their
    `scroll` style 60→110 (matching the convention `WishlistDetailScreen`/
    `SetsScreen`/`DeckDetailScreen` already used). Verified live: the
    "Download all" button on Settings, and the last card row on SetDetail's
    grid, both now clear the floating bar.
- **Universal "smart back".** New `lib/nav.ts` → `smartGoBack(navigation)`:
  `goBack()` if there's history, else `navigate('Tabs', {screen:'Home'})`.
  Wired into all 9 screens that had a bare `navigation.goBack()` (DeckDetail,
  WishlistDetail, SetDetail, Settings, Account, Friends, FriendProfile, Detail,
  Scan) — a safety net for the (currently theoretical, no deep-linking yet)
  case of landing on one of these with no back history. Audited first: every
  one of these screens **already had** a visible back arrow, so this was a
  behavior hardening, not a missing-affordance fix. `Sets` relies on the
  native stack header's auto-generated back chevron — already fine, untouched.
- **Rarity completion counts moved inside the SetDetail banner.**
  `components/SetBanner.tsx` gained an optional `rarities?: RarityBucket[]`
  prop; when present, the capsule grows from 132→172px and a second row (a
  horizontal-scroll rarity strip, same `owned/total` + label cells the old
  standalone row used) renders below the title/progress row, inside the same
  masked-art capsule. `SetDetailScreen.tsx` now passes `rarities={rarities}`
  and the old separate `<View style={s.progressRow}>` block (+ its now-dead
  styles) was deleted — a set should read as one visual unit, not a banner
  plus a disconnected strip below it.
- **Set-level bulk-add now targets the real collection, not just a wishlist.**
  Previously `SetWishlistSheet` only ever wrote to a chosen wishlist. Renamed
  → `components/SetBulkAddSheet.tsx` (old file deleted) and added a
  Wishlist/"My collection" destination toggle at the top. Collection path uses
  `lib/collection.ts`'s `adjust(code, suffix, +qty)` (additive, same semantics
  as wishlist's `addCard`) instead of `wishlists.ts`'s `addCard`; the wishlist
  picker section only renders when "Wishlist" is selected, and the Confirm
  button no longer requires picking a wishlist when targeting the collection.
  Added a toast on apply (`setwl.added` / `setwl.addedToCollection`) — the
  sheet previously had a translated-but-unused "added" string; now it's wired.
- **Icon-only buttons gained visible text labels** (user: icons should say
  what they do, not just carry an a11y label nobody reads). Converted to
  icon+label pills/pairs: header Settings gear (`App.tsx`, label below the
  icon), Browse's Filter and Select buttons (`BrowseScreen.tsx`), SetDetail's
  Parallels/Missing/Select pills (`SetDetailScreen.tsx`, also converted from
  bare circular icon buttons to the same pill style as Parallels for
  consistency). **Binder's Select button was attempted the same way and
  reverted** — that meta-row (count text + share + filter + select + 4-way
  column toggle) already overflowed off-screen at 375px width *before* adding
  text; verified via screenshot, backed out to keep it icon-only rather than
  ship a regression. `ColumnsToggle`'s 2/3/4/5 buttons were left alone — they're
  numbers, not icons, already self-explanatory.
- **Sparkle icon for "Parallels" toggles.** New `sparkle` path in
  `components/Icon.tsx` (4-point flash + 2 small sparks). Applied in
  `BrowseScreen.tsx` and `SetDetailScreen.tsx`'s Parallels chips, tinted
  accent when active.
- **Verified in web preview**: persistent bar confirmed visible+correctly-
  highlighted on Home, Sets, SetDetail, and Settings (reached via the header
  gear from the Cards tab — "Cards" stayed highlighted on the bar while on
  Settings, confirming the "remembered active tab" logic). Rarity-in-banner
  and the destination toggle (Wishlist ⇄ My collection, confirm button
  enabling/disabling correctly) confirmed via screenshot at both desktop and
  375px mobile width. Binder's overflow-at-mobile-width regression caught and
  fixed before finishing.
- **Pending user**: device review (the persistent tab bar is the biggest
  behavioral change in the app this session — confirm it feels right on a
  real device, not just web preview).

---

### Vault value over time — Home module (2026-06-25, typecheck-green, web-verified, NOT yet device-reviewed)
pkmn.gg-inspired feature (its most-loved trait is "watch your collection value
change over time"). Shaped via `/impeccable shape` (brief confirmed) then built
with `/impeccable craft`. Turns the static vault number into a trend module on
Home. **Value is private** (a deliberate decision tied to the planned friends
feature — friends will see binders, not vault value; see memory
`friends-social-plan`).
- **`lib/valueHistory.ts` (NEW)** — store for daily value snapshots. Key
  `optcg.valueHistory.v1`, shape `{ schemaVersion:1, points:{date,value}[],
  updatedAt }`. Same cache+listeners+`subscribe()` pattern as `collection.ts`.
  `recordDailySnapshot(value)` is idempotent per local day (latest value of the
  day wins, no-ops if unchanged), caps at 365 points. `getDelta(current, days)`
  picks the reference point ≤ (today−days), falling back to the oldest point
  (`full:false`) and returning `null` when only today's point exists (→ first-run
  state). `getDisplaySeries()` swaps the last point for the live current value.
  **LOCAL-ONLY but sync-ready by shape** (serializable + `updatedAt`); deliberately
  NOT wired into `syncBus`/`SyncDomain` (value stays private, per the decision).
- **`components/Sparkline.tsx` (NEW)** — reusable react-native-svg sparkline:
  area gradient + line + end dot. Stroke "draws" on mount via animated
  `strokeDashoffset` (420ms ease-out-cubic), **guarded by
  `AccessibilityInfo.isReduceMotionEnabled()`**. Renders nothing for <2 points.
- **`components/VaultValueCard.tsx` (NEW)** — the Home module. Pink value
  (`accent` = "value", consistent with prior reskin), green/red delta badge using
  the `up`/`down` tokens (their 2nd home after Detail), 7D/30D/All toggle
  (underline-on-active pink per DESIGN nav rule, persisted in settings). Passive
  capture: records today's snapshot in an effect when `currentValue > 0` (the
  `>0` guard avoids a false-zero baseline before the collection cache hydrates).
  Caption logic: `past 7/30 days` when the window is fully covered, `since {date}`
  for partial history (localized short date, manual month tables — no Intl
  dependency), `all time` for All.
- **`settings.ts`** — added `valueTimeframe: '7d'|'30d'|'all'` (default `7d`) +
  `setValueTimeframe()`. Flows through existing `applyFromSync` spread.
- **`HomeScreen.tsx`** — dropped the vault stat from the hero's stat row (now
  cards/unique/%index, 3 stats) and added `<VaultValueCard>` below the hero. The
  live `stats.vaultValue` (already computed there) feeds the card.
- **i18n** — `home.vaultA11y`, `home.vaultPast7d/30d`, `home.vaultAllTime`,
  `home.vaultSince`, `home.vaultTrackingStarts`, `home.tf7d/30d/All` in en+es.
- **Verified in web preview** (375px): first-run state ("Tracking starts today"),
  populated 7D state (delta `↑ +€3.10 · 43.7%`, drawn sparkline), partial-history
  30D state (caption flips to `since Jun 17`), toggle interaction + underline.
  Seeded localStorage to test the populated states, cleared after. No real console
  errors (the `collapsable` warning is a pre-existing react-native-web/SVG quirk,
  web-only).
- **Caveat / first-run reality**: history starts empty, so a real user sees the
  "Tracking starts today" state until snapshots accumulate over actual days. By
  design.
- **Pending user**: device review (sparkline draw animation + reduce-motion on
  native; delta badge width with large values).

---

### Sets screen restyle — banner rows replace orb grid (2026-06-25, typecheck-green, web-verified, NOT yet device-reviewed)
User-requested restyle inspired by the SetDetail header banner (key-art capsule
with masked alpha-fade art on the right). Each set in `SetsScreen` was a small
circular progress "orb" in a 5-per-row grid; now each set is a full-width
banner capsule (same visual language as `SetBanner`), with the per-rarity
completion breakdown (L/SEC/SR/R/UC/C/SP CARD…) baked *inside* the capsule
instead of living as a separate row (as it still does today in `SetDetail` —
noted as a likely next step: "replicate this look when inside of a set").
- **`components/SetRow.tsx` (NEW)** — one banner per set for the Sets list.
  Visually mirrors `SetBanner`'s masked-art-capsule technique (alpha-fade
  gradient mask + readability scrim, art anchored right, deterministic
  per-set fallback gradient via `fallbackToneFor` when no box art exists —
  see `lib/setBoxArt.ts`/AGENTS' prior box-art session for the ~26/52 set
  coverage caveat) but shorter (150px) and with a second content row: a
  horizontally-scrollable rarity breakdown (`rarityBuckets(setCode)` from
  `lib/setsStats.ts`), reusing the same owned/total-per-rarity display that
  `SetDetailScreen` already renders below its banner.
  - **Width is measured via `onLayout`, not `useWindowDimensions`.** Unlike
    `SetBanner` (full-bleed directly under the screen root, so window width
    minus its own margin ≈ its real width), `SetRow` is nested inside the
    scroll's padding *and* the family card's padding — window-width-derived
    sizing would overestimate the capsule width and miscompute the art mask's
    `x`/width, clipping or misplacing the art. `onLayout` on the outer capsule
    gives the true rendered width regardless of ancestor padding; the art
    layer only renders once a non-zero width is measured.
  - **Art ≥50% floor**: `artW = max(round(w*0.5), min(round(w*ART_FRACTION),
    ART_MAX_W))`. The old `SetBanner` formula (`min(w*0.72, 480px)`) could
    drop well below 50% on wide screens because the 480px absolute cap wins
    once `w` gets large (verified: at 1920px width the old formula would have
    given ~26% — confirmed by inspecting the rendered SVG `<image>` width in
    the browser preview before vs. after the fix). **Applied the same floor
    fix to `SetBanner.tsx` itself** (one-line change) so the existing
    SetDetail header banner gets the same guarantee, even though its content
    (rarity row merge) hasn't been touched yet.
- **`SetsScreen.tsx`** — removed `SetOrb` (the circular-progress orb) and its
  grid (`s.grid`/`orb*` styles); `FamilyCard` now renders a vertical stack
  (`s.rows`) of `SetRow` instead. Family-level grouping/header (aggregate
  progress ring, "N materialized" ghost count) is unchanged — only the
  per-set visual changed, not the macro-tab/family taxonomy.
- **Verified in web preview**: mobile (375px), and 1920px-wide desktop where
  inspecting the rendered SVG confirmed the art `<image>` is exactly 50% of
  the capsule width (927/1854px) — the floor holds at the resolution where
  the bug would have been worst. Also checked a set with no box art (PRB01)
  to confirm the deterministic fallback-gradient panel still respects the
  same floor/fade treatment.
- **Pending user**: device review. **Not done in this pass** (flagged by the
  user as a separate future step): applying the same "rarity row merged into
  the capsule" treatment to `SetDetailScreen`'s own header banner — currently
  it still renders `SetBanner` + a separate sibling `rarityRow` below it.

---

### Set name/date data corrected against official EN site (2026-06-25, typecheck-green, web-verified)
User asked to double-check set names/release dates against
`https://en.onepiece-cardgame.com/products/?subcategory=boosters` after
noticing some looked wrong. Verified by crawling the live listing + 3 archived
subcategory pages (boosters/decks/others) and cross-checking individual
product pages directly. WebFetch's AI-summarized output was internally
inconsistent on this page (reported the same bracket-code twice with two
different titles/dates) — switched to raw HTML via Python `requests` +
`BeautifulSoup` instead, which is authoritative and matches what
`scripts/build_card_database.py`'s `set_codes_from_slug()` already anticipates.
Only `lib/setMeta.ts` changed (`SET_NAMES`/`SET_DATES` Records) — no code
shape changes.
- **Names corrected**: OP03 "Mighty Enemies" → **"Pillars of Strength"**
  (the EN release reuses a different theme name than the JP set with that
  EN slug); OP13 "The Three Captains" → **"Carrying on His Will"**; OP14
  "Beyond the Horizon" → **"The Azure Sea's Seven"**; OP15 "New Generation of
  Pirates" → **"Adventure on Kami's Island"**; EB03 "Extra Booster 03" →
  **"One Piece Heroines Edition"**; PRB02 "Premium Booster 02" → **"One Piece
  Card the Best vol.2"**.
- **Dates corrected/added** (DD/MM/YYYY, EN release date — the previous table
  mixed in JP dates and was wrong for most entries past OP08): OP02 10/03/2023,
  OP03 30/06/2023, OP04 22/09/2023, OP05 08/12/2023, OP06 15/03/2024, OP07
  28/06/2024, OP08 13/09/2024, OP09 13/12/2024, OP10 21/03/2025, OP11
  06/06/2025, OP12 22/08/2025, OP13 07/11/2025, OP14 16/01/2026, OP15
  03/04/2026. Newly added (previously missing): EB03 20/02/2026, PRB01
  08/11/2024, PRB02 03/10/2025. OP01/OP16 were already correct, unchanged.
- **OP05 quirk**: missing from both archive listing pages (sequence jumps
  OP04→OP06) but its own product page (`products/boosters/op05.php`) is live
  and authoritative — used that for the date. Likely a stale pagination gap on
  the official site, not a data-pipeline bug on our side.
- **EB04 left undated/generic on purpose**: it isn't a standalone EN product —
  it ships bundled into two different retail releases, "OP14-EB04" (16/01/2026)
  and "OP15-EB04" (03/04/2026), each a distinct product page. No single
  code/date applies; documented inline in `setMeta.ts` rather than guessing.
- **Verified live**: re-ran the web preview, confirmed via DOM text dump that
  Sets-list rows show the corrected OP13/OP14/OP15 names, and confirmed
  SetDetail's banner for OP13 shows both the corrected name *and* date
  ("Carrying on His Will" / "07/11/2025").
- User only asked to "double-check" — since these are primary-source-verified
  factual corrections (not a design judgment call), applied them directly per
  this session's Auto Mode bias toward action rather than just reporting
  findings. Flag for the user to skim the table above in case any entry should
  be reverted.
- **Pending user**: review/confirm the table above. **Not done**: no commit
  yet (Rule 3 — only after review). Scratch research files `boosters_raw.html`
  / `op05_check.txt` (raw HTML dumps used for verification, written during this
  session) are untracked and can be deleted — not part of the app.

---

### TR-rarity fix, sort-by-set, bulk-mode UX, Decks banner restyle (2026-06-25, typecheck-green, web-verified)
Four independent user-reported fixes, actioned directly (Auto Mode — concrete,
unambiguous corrections rather than design judgment calls).

- **TR is not a standalone rarity** — it's always a "treasure rare" *parallel*
  finish of a card whose real rarity is one of the canonical six (L/SEC/SR/R/
  UC/C). The completion-bucket logic in `lib/setsStats.ts` was bucketing by
  `entry.variants[0]?.rarity` — but `entry.variants` is filtered to *only the
  variants printed in that one set*, so a card whose sole printing in a given
  set happens to be a TR parallel reprint got misclassified into its own "TR"
  bucket instead of its true base rarity. Fixed via new exported helper
  `baseRarityOf(entry)` (looks up the *base* print, `suffix === ''`, off
  `entry.card.variants` — the full cross-set list — falling back to
  `entry.variants[0]` only if no base variant exists). Removed `'TR'` from the
  canonical rarity `order` arrays in `setsStats.ts` and `theme.ts`
  (`RARITY_ORDER`/`HOT_RARITIES`). `components/SetWishlistSheet.tsx` had the
  same in-set-only bug in its own local `rarityOf()` — replaced with
  `baseRarityOf` from `setsStats.ts`. **Deliberately left untouched**:
  `lib/prices.ts`, `lib/filters.ts`, `components/CardThumb.tsx` — TR is a
  legitimate per-*variant* attribute there (pricing/holo styling/art
  selection), not a completion-bucket bug.
- **Sort-by-set now sorts by release chronology, not set-code string.**
  `lib/cardQuery.ts`'s `'set'` comparator used `localeCompare` on the set
  prefix string. Replaced with `SET_META[setPrefix(code)].release_order`
  (0 = most recent, already used by `setsStats.ts`'s `listSetCodes()`) so
  ascending sort surfaces the newest products first, matching user
  expectation.
- **Bulk-mode UX**: the bulk-select toggle button's icon changed from a plain
  checkmark to a checkbox-with-check (`checkSquare`, new path in `Icon.tsx`) —
  more recognizable as "enter multi-select" at a glance. Applied in both
  `BrowseScreen.tsx` and `BinderScreen.tsx`. Added long-press-to-enter-bulk-mode
  on `BrowseScreen`'s card grid (`handleLongPressCard`, mirrors the pattern
  `BinderScreen` already had) — wired into `CardThumb`'s `onLongPress`.
- **Decks tab restyle**: each deck row now uses the same masked-key-art-capsule
  banner treatment as `SetBanner`/`SetRow`, with the deck's **leader card art**
  as the masked image instead of set key art. New `components/DeckRow.tsx`:
  measures width via `onLayout` (same nested-padding reasoning as `SetRow`),
  uses `preserveAspectRatio="xMidYMid slice"` (center-focused — a leader's face
  is usually centered, unlike a set's top-anchored key art). `DecksScreen.tsx`
  now renders `<DeckRow>` per item; removed the old `DeckThumb` component and
  `leaderImageUri` helper (logic moved into `DeckRow.tsx`).
  - **Found and fixed a real RN-web bug while building this**: nesting the
    row's dots-menu `Pressable` *inside* the row's own pressable capsule
    produced two nested `<button>` elements on web (`Pressable` with
    `accessibilityRole="button"` renders as `<button>` on web), which is
    invalid HTML and threw React DOM hydration errors. Fixed by making the
    menu button a structural **sibling** of the row's press-surface
    `Touchable`, not its child — both live directly under the capsule `View`,
    with the menu button absolutely positioned and rendered after (so it
    wins touch priority where they'd overlap). Gave the menu button a
    translucent dark circular backdrop (`rgba(19,16,25,0.55)`, same token
    `SetBanner`'s back button already uses) since the bare icon was nearly
    invisible against busy leader art. Verified in web preview: zero nested
    `<button>` elements in the live DOM, menu button opens the delete-confirm
    modal correctly.
- **Verified**: `npm run typecheck` clean; web preview — Decks tab renders the
  new banner capsule with the leader art and legible menu button, menu press
  opens delete confirmation, sort-by-set and bulk-mode changes confirmed by
  code review (release-order comparator, checkSquare icon + long-press wiring).
- **Pending user**: device review (TR-rarity bucket counts on a real set with
  TR reprints; bulk-mode long-press feel; Decks banner on native).

---

### UI/UX overhaul — design-review remediation (2026-06-14, typecheck-green, NOT yet device-reviewed)
Acted on a full lead-designer review of the app. Goal: fix the accessibility +
consistency debt the review flagged, via a shared component layer rather than
per-screen patches. `npm run typecheck` clean. **Pending: user device review.**

- **Design tokens (`theme.ts`)** — `textDim` lifted `#5e5478`→**`#8b7fae`** (≈2.3:1→
  ≈4:1 on `bg`, was failing WCAG AA, used everywhere for secondary text). New
  tokens: `type` (font-size scale), `elevation` (card/accent shadows), `HIT_SLOP`,
  `MIN_TOUCH=44`, `pressedStyle`/`pressedSurface` (the press-feedback opacities).
- **New shared primitives (`components/`)** — all with built-in press feedback +
  44pt targets + a11y:
  - `Touchable` — Pressable wrapper (opacity-on-press, default hitSlop, button role).
  - `Counter` — unified +/- stepper; **disables `−` at `min`** (the missing
    bounds-feedback). Replaced **6** divergent hand-rolled steppers
    (CardThumb inline, DetailScreen, DeckDetail, AddCardsModal, Settings,
    VariantPicker, BulkTargetSheet, SetWishlistSheet, WishlistDetail).
  - `SegmentedControl` — one tab/segment style (replaced Binder + FriendProfile's
    two different ones).
  - `Chip`, `Button` (primary/secondary/ghost/danger).
  - `AppModal` — centered dialog **with `KeyboardAvoidingView`** (inputs no longer
    hidden by the keyboard); replaced the copy-pasted `modalBg/modalCard` blocks in
    Decks/Binder/DeckDetail/WishlistDetail create/rename modals.
  - `Toast` — `ToastProvider` + `useToast()` (animated, single-at-a-time). Wired in
    `App.tsx`; DeckDetail's manual `setTimeout` toast now uses it.
- **Press feedback everywhere (C1)** — every interactive `Pressable` across all
  screens + components now has a `pressed` style (was zero in the whole repo).
- **Touch targets (C2)** — counters/sort-chips/icon-buttons bumped to ≥44pt or
  given `hitSlop`. CardThumb quick +/- 42→44, inline +/- now via `Counter`.
- **Contrast (C3)** — besides the token fix, inactive bottom-tab labels and many
  small `textDim` labels switched to `textMut`; Scan sidebar labels 10px@0.45→
  12px@0.85; status pill text 0.55→0.85.
- **i18n (M1)** — removed hardcoded strings: Browse (`{n} cards`, sort labels,
  `Parallels`, placeholder), Detail (`Cost/Power/Counter/Effect/Variants`,
  **the hardcoded-Spanish "Ver precio en Cardmarket"**, not-found), SetDetail
  (`{n} cartas`→`set.cardsCount`, `Parallels`), FilterSheet (title, Clear all,
  Apply, every section title, the Spanish placeholder, "No matches", "None"),
  delete confirms, "Default", "X cards". New keys in **both** `en.ts`+`es.ts`
  (`browse.*`, `detail.*`, `set.*`, `filter.*` section keys, `decks.delete*`,
  `common.delete`, `wl.default`, `wl.cardsCount`).
- **Navigation (M2)** — `TabParamList.Binder` gained `{ tab? }`; Home "Wishlist"
  tile now lands on the wishlist tab (was dropping on Collection). Persistent
  **Settings gear** added to the global `Header` (`App.tsx`) — reachable from
  Browse/Binder/Decks, not just Home. New `gear` icon in `Icon.tsx`.
- **Destructive actions surfaced (C4)** — deck + wishlist delete were long-press-
  only (undiscoverable). Added a visible **`dots` menu button** per row, and
  replaced the OS-native `Alert.alert` confirms with themed `AppModal` dialogs
  (DecksScreen, BinderScreen). (Onboarding coachmarks deferred — see QoL.)
- **Virtualization (M6)** — DeckDetail + WishlistDetail grids converted from
  `ScrollView.map` to `FlatList` (numColumns), matching the other grids.
- **Polish** — loading `Text "Loading…"` → `ActivityIndicator` (App, DeckDetail,
  WishlistDetail); empty-state titles standardized to `fonts.display`; Home tile
  width 47%→48%; accent-tile subtitle contrast bumped.
- **Files**: new `components/{Touchable,Counter,SegmentedControl,Chip,Button,AppModal,Toast}.tsx`;
  edited `theme.ts`, `App.tsx`, `navigation.ts`, `Icon.tsx`, `CardThumb.tsx`,
  `ColumnsToggle.tsx`, `BulkActionBar.tsx`, `BulkTargetSheet.tsx`, `FilterSheet.tsx`,
  `AddCardsModal.tsx`, `WishlistPickerModal.tsx`, `VariantPickerSheet.tsx`,
  `SetWishlistSheet.tsx`, `ShareSheet.tsx`, all screens, `i18n/{en,es}.ts`.
- **Deferred (QoL)**: first-run onboarding/coachmarks for hidden gestures
  (long-press multi-select, hold-to-repeat); locale-aware currency (prices are
  EUR/Cardmarket so `€` is correct for now); skeleton loaders.

---

### Reskin "Horo Horo" — paleta Perona + Carga + Home + Colección (2026-06-24, typecheck-green, NOT yet device-reviewed)
El usuario pidió acercar la UI a una app-tracker de referencia (OP.TCG) **sin
copiarla**, sobre todo Home, pantalla de carga y la vista de colección, y darle
un **twist de paleta** ambientado en Perona y sus fantasmas Horo Horo. Mockups
validados con el usuario (visualize) antes de implementar. Decisiones de paleta
fijadas con el usuario: **cian fantasma = progreso/colección** (semántico),
**rosa Perona candy = marca**.

- **Paleta global (`theme.ts`)** — `accent` `#ec4899`→**`#ff6fb5`** (rosa candy,
  es claro). Nuevos tokens: **`ghost` `#9fe3e8`** (cian espectral = progreso),
  `ghostDim`/`ghostGlow`, **`onGhost` `#0c3b3e`**, y **`onAccent` `#3d1228`**
  (texto/iconos sobre rellenos rosa — el rosa claro perdía contraste con blanco).
  Base más fría: `bg` `#131019`, `surface` `#1c1726`, `surface2` `#261f33`;
  `ring` (pista del anillo) ahora neutra.
- **Contraste on-accent (consecuencia de la paleta)** — barrido de texto blanco
  sobre rellenos accent → `onAccent`: `Button` primario, FAB de Scan
  (`App.tsx`), burbuja de cantidad + multi-art (`CardThumb`), `SegmentedControl`,
  y botones confirmar de FilterSheet/BulkTargetSheet/SetWishlistSheet/
  VariantPickerSheet/WishlistPickerModal/ShareSheet. (`sourceSetText` se queda
  blanco: va sobre badge oscuro.) Overlays con el `bg` viejo `rgba(14,12,26,…)`
  actualizados a `rgba(19,16,25,…)` en CardThumb.
- **Pantalla de carga (`App.tsx`)** — `LoadingSplash`: logo fantasma (nuevo icono
  `ghost` en `Icon.tsx`) + wordmark `HoroHoro.tcg` + subtítulo "ONE PIECE TCG" en
  cian + spinner cian + mensaje `common.loadingDb` (nuevo en `en.ts`/`es.ts`).
  Nota: el wordmark cae a system-font un instante (fuentes Sora aún no cargadas
  en ese gate). Sustituye al `ActivityIndicator` pelado.
- **Home (`HomeScreen.tsx`)** — header fijo: wordmark centrado + buscar(→Browse)
  + ajustes (sin icono de menú: no hay drawer). Hero conserva los stats (sello
  propio, la referencia no los tiene); barra de progreso y "% índice" en cian, el
  "valor €" en rosa. Tile accent (Decks) con texto `onAccent`; **cinta "NEW"**
  (cian, decorativa por ahora) en el tile de Scan vía prop `isNew` de SectionTile.
- **Colección (`SetsScreen.tsx`) — "Invocación espectral"** — reescrita: filas en
  lista → **macro-tabs MAIN/PROMO/SPECIAL/DECK** + tarjetas de **familia** dentro,
  cada una con un **anillo agregado** (`ProgressRing`, cian) y una **rejilla de
  "orbes fantasma"**. Cada orbe es un set con 3 estados semánticos: **vacío**
  (anillo punteado tenue), **en progreso** (arco cian + código + %), **materializado**
  (100% → orbe sólido cian con el fantasma dentro). Línea "*N materializados*" por
  familia. Taxonomía `familyOf(code)`: OP/EB/PRB→main, ST→deck, P→promo,
  `__ev_*`+resto→special. Reusa `summarizeSet()`; abreviaturas de evento vía
  `EV_BADGE_LABELS` (ahora exportado de `SetBadge`). `ProgressRing` ahora por
  defecto **cian** (`colors.ghost`); barras de SetsScreen también.
- **i18n** — nuevas claves en `en.ts`+`es.ts`: `common.loadingDb`, `sets.tab*`,
  `sets.fam*`, `sets.setsWord`, `sets.cardsLabel`, `sets.materialized`.
- **Pendiente usuario**: revisar en dispositivo las 3 pantallas + el reskin global
  (todas las pantallas heredan la paleta). Posibles ajustes: tono del rosa,
  legibilidad del cian en textos pequeños, densidad de la rejilla de orbes (ST
  tiene ~28 sets). Sin commit hasta review (Regla 3).

---

### Remote set-update banner + box-art set banner + SP-card fixes (2026-06-25, typecheck-green, device-reviewed in web preview, COMMITTED)

**Remote index update (new feature).** The card index was previously baked into
the bundle with no way to surface a newly-released set without an app-store
rebuild. Shaped via `/impeccable shape`, then built:
- `scripts/build_card_database.py` `save_index()` now stamps `schema_version`
  (=1) + `version` (unix epoch at generation) on `index.json`, and writes a
  small `data/meta.json` (`{schema_version, version, card_count, newest_set}`,
  copied to `app/src/data/` like `hashes.json` already was) so the client can
  check freshness without downloading the multi-MB index.
- `src/data/loadIndex.ts`: `CARDS`/`CARD_LIST`/`INDEX_META`/`SET_META`/`PHASHES`
  changed from `const` to `export let` (ESM live bindings) + new
  `applyIndexPayload(payload, hashes?)` that recomputes and reassigns them in
  place. Every existing screen that does `import { CARDS } from ...` picks up
  a swapped index automatically — no call-site changes needed.
- `src/lib/remoteIndex.ts` (NEW) — `checkForUpdate()` (called once from
  `App.tsx` after fonts load): fetches `meta.json` → `index.json` →
  `hashes.json` from `config.ts`'s `DATA_BASE_URL` (jsDelivr, `IMAGE_BASE_URL +
  '/data'`), validates `schema_version`, diffs new set codes vs. current
  `SET_META`, caches the result in memory only — **never applies anything
  automatically**. Fails completely silently at every step (offline, CDN down,
  bad JSON, unsupported schema) — the bundled index keeps working regardless.
  `applyPendingUpdate()` calls `applyIndexPayload` + persists
  `lastSeenVersion` to AsyncStorage (`optcg.remoteIndex.v1`).
- `components/SetUpdateBanner.tsx` (NEW) on `HomeScreen` — "`{set}` has
  arrived — tap to update" (or a generic multi-set string), ghost/cyan styled,
  dismissible (X, session-only — reappears next launch if not applied). Tap →
  `applyPendingUpdate()` + `navigation.reset` to the `Home` tab (soft reload,
  not a full data swap mid-render).
- `App.tsx` `TabBar` — small accent dot on the **Home** tab icon while an
  update is pending (the "Sets" entry point is a tile inside Home, not its own
  tab, so Home is the correct badge target — not "Sets tab" as originally
  phrased in the brief).
- i18n: `setUpdate.bannerSingle/bannerMulti/dismiss/badgeA11y` in en+es.
- **Bug caught during verification**: `SetUpdateBanner` initially nested a
  `Pressable` (Dismiss) inside another `Pressable` with
  `accessibilityRole="button"` — the same invalid-nested-`<button>` pattern as
  the CardThumb fix below. Fixed identically (drop the outer's button role
  when a nested actionable child exists).
- **Verified end-to-end** in the web preview using a temporarily-seeded fake
  pending update (reverted before commit): banner+badge render, tap applies
  the swapped index (`CARD_LIST.length` changed live), banner/badge clear,
  navigation lands back on Home. Real CDN trigger only activates once
  `data/meta.json`/`index.json`/`hashes.json` are pushed to the public repo
  (this commit does that for the current OP16-era index).

**Box-art set banner (pre-existing, undocumented until now).** `SetBanner.tsx`
+ `lib/setBoxArt.ts`, wired into `SetDetailScreen.tsx`: per-set header capsule
with code + title + `ProgressRing` + owned/total on the left, the booster's
box-art photo with a horizontal SVG fade into the capsule background on the
right, falling back to a deterministic themed-color gradient (hashed from
`OPTCG_COLORS`) for sets with no art.
- **Source**: `build_card_database.py` `fetch_box_art()` scrapes the official
  site's `/products/` listing for pages shaped like `op16.html`, pulls the
  packaging photo (`img_item01`), saves as `.webp` to `images/boxart/`. The
  official site **only keeps a live product page for the currently-on-sale
  set** — once a new set replaces it, the page and photo are gone for good, no
  archive. The scraper never deletes from `images/boxart/`, so art is
  accumulated across runs into `data/boxArt.json` (copied to
  `app/src/data/`) rather than lost when a set rotates out of the listing.
  Currently only **OP16** has real art (the one live product page right now).
- Box art has **no fallback URL** (unlike card art's `image_source`) since
  there's no permanent official source to fall back to — `CachedImage` is
  called without a `fallbackUri`, so a CDN miss renders blank rather than
  erroring. Will resolve once `images/boxart/` + `data/boxArt.json` are
  pushed (done in this commit).

**SP CARD chase reprints ignored the "Parallels" display toggle (bug fix).**
`lib/cardDisplay.ts` `expandSetEntries()` picked a set's "normal" tile as
`variants.find(v => v.suffix === '') ?? variants[0]`. For a card whose *only*
printing within a given set is an SP CARD chase insert (e.g. Bartholomew Kuma
`EB04-054`, reprinted as an OP16 SP parallel with no plain-suffix variant in
OP16), the fallback landed on the SP variant — so with "Parallels"
(`showAlternateArt`) off it still rendered as if it were a standard print.
Added `isSpecialInsert()` (matches rarity `SP`/`SP CARD`) and `normalInSet()`
(prefers empty-suffix → any non-SP variant → only falls back to SP if that's
genuinely the card's only printing in that set); `expandSetEntries` now drops
the entry entirely when every in-set variant is an SP insert, instead of
showing its SP art as if standard. Scoped to display only — `setsStats.ts`
set totals/completion % are unaffected. Verified live against real OP16 data
(6 known SP-only reprints hidden when Parallels off, reappear when on).

**SP-rarity/Parallels bug fix in `setsStats.ts` (`variantSetOf()`)** — carried
over from a prior session segment, typecheck-verified, now committed alongside
the above. See inline comment on `variantSetOf` for the printed_set/set_source
precedence logic.

**CardThumb.tsx nested-button accessibility fix** — carried over from a prior
session segment. The outer `Pressable`'s `accessibilityRole="button"` was
dropped only for the `quickActions` inline-controls path; the Binder
`onAdjust`+`Counter` path (also nested buttons) was missed. Fixed:
`accessibilityRole={(quickActions && v) || onAdjust ? undefined : 'button'}`.
Verified via live DOM audit (157 buttons, 0 nested) on a populated Binder grid.

---

### SetBanner mv.webp art, real alpha mask, Full-HD fix, 26-set box-art coverage (2026-06-25, typecheck-green, web-verified at 375/768/1920px)

**Box-art source switched from booster photo to key art.** `fetch_box_art()` in
`build_card_database.py` was rewritten to pull each product page's `mv.webp`
("main visual" key art — character art, e.g. Ace/Luffy on OP16) instead of the
booster-pack render (`img_item01`). Regex `_MV_RE` matches `mv.webp`,
`pc/mv.webp` (responsive desktop subpath, preferred over `/sp/` mobile), and
the older `mv_01.jpg` naming used on legacy pages — explicitly excludes
`bg_mv.webp` (a separate blurred-background asset). A ranking function prefers
`/pc/` + `.webp` over `.jpg` when a page exposes both.

**CDN staleness root-caused and fixed at the path level.** Swapping the art
file in place while keeping the same filename appeared not to update — even in
incognito, even with a `?v=<timestamp>` query string. Root cause: jsDelivr
pins `@main` to a resolved commit per edge/region and caches that resolution
~12h; a differing query string does **not** force re-resolution, so the same
stale commit's bytes kept being served regardless of the query. Fixed by
moving the version into the **filename path** itself
(`images/boxart/{code}.{version}.webp`) — a brand-new path cannot exist in any
cache, so it always resolves fresh. `app/src/lib/setBoxArt.ts` `boxArtUrl()`
reads `version` from `boxArt.json`'s new `versions` map and builds the
versioned filename (falls back to the old flat `{code}.webp` if a manifest
has no `versions`, for forward-compat with manifests generated before this
change).

**Box-art coverage expanded 1 → 26 sets.** The official site only shows the
*currently on-sale* set at `/products/<code>.html` — but `/products/` also has
three archive views (`?subcategory=boosters|decks|others`) listing recently-
rotated-out sets at `.php` pages that still serve their original key art.
`discover_product_pages()` now crawls all three archives plus the live
listing; `set_codes_from_slug()` parses page slugs into the set code(s) they
cover, including combined (`op14-eb04` → OP14+EB04) and ranged (`st15-20` →
ST15..ST20) slugs sharing one image (downloaded once, copied to each code's
versioned filename via `fetch_box_art()`'s `by_url` grouping). Now covers:
EB02-04, OP10-12/14-16, PRB02, ST15-30 (26 of 52 sets — the rest have no live
or archived product page and keep the themed-gradient fallback). Older
archive pages (OP10-12, ST15-22, EB02) only have the busier `mv_01.jpg`-style
promo banner (character art + 3D pack render + date text baked in) rather than
clean character art — accepted as-is since the banner's top-crop hides most of
the clutter; revisit if it looks bad in practice on those specific sets.

**`SetBanner.tsx` fade was fake; replaced with a true SVG alpha mask.** The
original "blend" painted an opaque `colors.surface2`-colored rectangle over
the art's left edge — it only *looked* blended because that flat color
happened to match the capsule background, with no actual transparency. Now
uses a `<Mask>` + `<LinearGradient>` (white, increasing `stopOpacity`
left→right) applied directly to the `<SvgImage>`/fallback `<Rect>`, so the art
itself fades to transparent rather than being covered. A separate
`setArtScrim` gradient still sits above the masked art for text legibility,
independent of the art's own fade. Crop uses `preserveAspectRatio="xMidYMin
slice"` to frame the top region (faces/action — the focal point of most OPTCG
key art) rather than an arbitrary center/bottom crop.

**Full-HD layout corruption fixed.** The first responsive pass used
`useState` + `onLayout` + `Dimensions.get('window').width` as an initial
value; on web, `Dimensions.get('window').width` returned `0` at the time the
initial state was computed and `onLayout` didn't reliably correct it,
producing a negative SVG width (`width="-20"`) at large viewports and visibly
corrupting the art. Fixed by switching to `useWindowDimensions()` (reactive,
no stale-initial-value problem on web) and adding `ART_MAX_W = 480` to cap the
art panel at the key art's native resolution — without this cap, a ~1900px-
wide capsule on a Full HD browser would stretch a 480px source ~2.8×, slicing
it into a blurry top strip. Verified crisp and correctly right-anchored at
375px (mobile), 768px (tablet), and 1920px (desktop browser).

**Pending follow-up:** only OP16 has been visually verified rendering inside
the live banner; the other 25 newly-added sets (especially the busier
`mv_01.jpg`-sourced older ones) haven't been individually checked in-component
yet — worth a pass through the Sets browser once art is live on the CDN
(images only resolve after this commit is pushed).

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
- **Note:** the legacy single-wishlist system (`lib/wishlist.ts` + `WishlistItem`,
  key `optcg.wishlist.v1`) was **removed** 2026-06-06 (dead code, imported by nothing).
  The live system is `Wishlist` + `WishlistCard` (`lib/wishlists.ts`). No migration
  from the old key exists — see B-06 (not a concern while pre-release).

### Deck Builder
- `lib/decks.ts` — AsyncStorage key `optcg.decks.v1`. `Deck` model: `{ id, name, leaderId?,
  cards: DeckCard[], createdAt }`. 50-card OPTCG rule is advisory (not enforced in storage).
- `DecksScreen` — list of decks with leader thumbnail, total count badge. Create/delete/rename.
- `DeckDetailScreen` — grid of `DeckCardPile` (stacked copies, dimmed if not owned). Add cards
  via `AddCardsModal`. "Add missing to wishlist" flow → `WishlistPickerModal`.
- `lib/optcgsim.ts` — parses OPTCGSim export format (`NxCODE` tokens) into `{ code, qty }[]`.
  Import from DecksScreen to pre-populate a new deck.

### Card Scanner — REMOVED, rebuilding as cloud-AI (2026-06-06)
The entire on-device scanner was **removed** this session. The old pipeline
(expo-camera focus box + ONNX MobileNet embeddings + 24-bit RGB ahash + ML Kit
printed-code OCR + VisionCamera/OpenCV detect-and-rectify) never reached usable
accuracy and carried a heavy native-dependency + ML-training burden. Decision
(with the user): **start fresh with a cloud-AI scanner** — capture a photo, send
it to a vision backend, get the identified card back (same UX family as
hakitcg.com, but server-side instead of on-device).
- **`ScanScreen` is now a placeholder** (`src/screens/ScanScreen.tsx`): a
  "coming soon" hero + a dependency-free **manual code lookup** (type `OP01-001`
  → opens `Detail`). Uses only `CARDS` from the local index. The center **Scan
  FAB** and `Scan` route are kept (per the user) so the entry point survives.
- **Deleted libs**: `lib/{ocr,onnx,phash,embeddings,cardDetect}.ts`.
- **Deleted assets**: `app/src/data/{embeddings,hashes}.json`, `app/assets/model.onnx`,
  `data/{embeddings,model.onnx,hashes}.json`, `data/embedding_checkpoint.pt`.
- **Deleted scripts**: `scripts/{train_embeddings,build_embeddings}.py`.
- **Removed deps** (`app/package.json`): `@react-native-ml-kit/text-recognition`,
  `onnxruntime-react-native`, `react-native-fast-opencv`, `react-native-nitro-modules`,
  `react-native-vision-camera`, `react-native-worklets-core`, `vision-camera-resize-plugin`.
  Also removed the `react-native-worklets-core/plugin` babel plugin, the
  `onnxruntime-react-native` + `react-native-vision-camera` expo plugins in
  `app.json`, the `.onnx` Metro assetExt, and the onnxruntime `patch-package` patch.
- **Kept** `expo-camera` (+ its expo plugin / CAMERA permission), `expo-image-manipulator`
  and `expo-haptics` — likely reused by the upcoming cloud capture/feedback flow.
- `loadIndex.ts` no longer imports `hashes.json` / exports `PHASHES`.
- **Follow-up for the user**: run `npm install` in `app/` to prune the removed
  packages from `node_modules`/lockfile, then `npx expo prebuild --clean` before
  the next native build so the dropped native modules leave the Android/iOS projects.
- **Next session**: design the cloud-AI scanner (capture → upload → identify).
  See QoL §12.

### Card Scanner v2 — on-device detect+rectify+pHash (REBUILT 2026-06-07)
Rebuilt the on-device scanner (Opción C: sin coste recurrente, offline) tras la
investigación de QoL §12. La lección clave: **el problema de los ángulos se
resuelve en la Etapa-1 (detección + rectificación de perspectiva), no en el
matcher** — justo lo que faltaba en el v1. Typecheck verde; **pendiente de build
nativo + verificación en dispositivo por el usuario**.
- **Pipeline de dos etapas**:
  - **Etapa-1 (detect+rectify)** — `lib/cardDetect.ts`: CV clásico
    (grayscale→blur→Canny→contornos→quad 5:7) + `rectifyCardCrop` (worklet nuevo:
    `getPerspectiveTransform`→`warpPerspective`→`toJSValue(png)`→data-URI base64).
    Corre en el runtime de worklet de vision-camera. Guarda `isCardDetectAvailable()`.
  - **Etapa-2 (identify)** — `lib/cardMatch.ts` (NUEVO, slim): `matchTopK` con RGB
    average hash de 768-bit (`lib/phash.ts`, puro JS) + búsqueda hamming sobre
    `PHASHES`. Sin ONNX, sin OCR, sin GPU. `AHASH_MAX_DISTANCE=60` exportado para
    recalibrar. Como la Etapa-1 entrega un recorte frontal, el hash ya no pelea
    contra perspectiva/recorte impreciso (la causa del fallo del v1).
- **`screens/NativeScanCamera.tsx` (NUEVO)** — aísla TODO el path nativo
  (vision-camera `<Camera>` + `useFrameProcessor` + `vision-camera-resize-plugin`
  + `react-native-worklets-core`). Se carga con `require()` perezoso SOLO cuando
  `isCardDetectAvailable()` → nunca se importa en Expo Go (degradación elegante,
  mismo contrato que `lib/cardDetect`/`phash`). Frame: `resize(480×640 bgr)` →
  `detectCardQuad` → overlay SVG `<Polygon>` verde → throttle por estabilidad de
  quad (centro <14px durante ≥300ms) → `rectifyCardCrop` → `onStableCard(uri)`.
- **`screens/ScanScreen.tsx`** — dual-path: `nativeMode` (NativeScanCamera) o
  fallback expo-camera focus-box (Expo Go). Identificación + flujo
  código→variantes→hoja de confirmación top-K compartidos. **Quitado el OCR**
  (Stage-3): la desambiguación de variantes la hace la hoja top-K visual.
  **Aplicado fix B-05** en el bucle focus-box (sin `skipProcessing`/`shutterSound`,
  `quality` 0.5). Auto-confirma si top − runner-up ≥ `AUTO_CONFIRM_MARGIN` (0.05).
- **Datos**: `data/hashes.json` + `app/src/data/hashes.json` recuperados (4571
  hashes, 192-hex). `loadIndex.ts` reexporta `PHASHES`. `build_card_database.py`
  ya conservaba `build_hashes()`/`rgb_average_hash()` (no se tocó).
- **Config nativa**: `package.json` +`react-native-vision-camera@4.7.3`,
  `react-native-worklets-core@1.6.3`, `vision-camera-resize-plugin@3.2.0`,
  `react-native-fast-opencv@0.4.8`. `app.json` + plugin vision-camera.
  `babel.config.js` + `react-native-worklets-core/plugin` (último).
- **Fuera de alcance (futuro)**: modos de escaneo (ver/colección/deck/wishlist —
  nunca se commitearon, no había código que recuperar; ahora añade +1 a colección),
  embedding ONNX fine-tuneado (si el pHash no basta), OCR de código (Stage-3).
- **Pasos del usuario**: `cd app && npm install --legacy-peer-deps` →
  `npx expo prebuild --clean` → `npm run android` en dispositivo físico.
  **Riesgos a verificar**: firmas de `react-native-fast-opencv` (drift entre
  releases: `getPerspectiveTransform`/`warpPerspective`/`toJSValue`), que
  `useSharedValue`/`Worklets` se importen bien de `react-native-worklets-core`,
  autolink de vision-camera v4 con RN 0.85/React 19.2. Recalibrar
  `AHASH_MAX_DISTANCE` (60→100-120) si falla con brillo/ángulo. Confía en
  `docs/scanner-native-handoff.md`.

### Scanner — enmascarar la marca de agua "SAMPLE" del hash (2026-06-07)
**Problema (antes en bugs conocidos):** las imágenes oficiales en `images/` llevan
un sello blanco **"SAMPLE"** en la banda central vertical; las cartas reales
escaneadas NO. El `rgb_average_hash` se calculaba sobre la carta entera, así que
la banda central de TODOS los hashes de la BD reflejaba el sello → desajuste
train/test (bits volteados en cada lookup) y menor discriminación (la misma franja
blanca en el mismo sitio en todas las cartas).
**Fix:** se enmascara el cuarto central (filas 6–9 de la rejilla 16×16) en AMBOS
lados. El umbral de media se calcula sólo sobre celdas NO enmascaradas y los bits
de la banda se fuerzan a 0; al ser 0 en todos los hashes no aportan a la distancia
hamming (sin tocar `hammingDistance`).
- `app/src/lib/phash.ts`: nuevas constantes `MASK_ROWS=[6,7,8,9]` / `MASKED_INDEX`;
  `channelHash` enmascara; `HASH_BITS` 768 → **576** (768 − 192 enmascarados) para
  que el score normalizado `1 − dist/HASH_BITS` siga siendo [0,1]. `AHASH_MIN_SCORE`
  deriva de `HASH_BITS`, se reescala solo.
- `scripts/build_card_database.py`: `rgb_average_hash` ahora usa
  `_channel_average_hash_masked` (replica `imagehash.average_hash` LANCZOS +
  empaquetado, pero enmascara). Metadatos: `hash_algo:"rgb_average_hash_masked"`,
  `masked_rows:[6,7,8,9]`.
- **BD regenerada**: `python scripts/build_card_database.py --hashes-only` → 4571
  hashes (192-hex), copiada a `app/`. Los hashes nuevos NO son comparables con los
  viejos: BD + JS deben ir juntos.
- **Verificado**: paridad JS↔Python sobre input idéntico (bit a bit), bits
  enmascarados a 0 en BD, packing == `imagehash` con máscara vacía, typecheck verde,
  discriminación OK (OP01-001 vs 002 = 156 bits). **Pendiente usuario**: escaneo en
  dispositivo (build nativo) — verificar márgenes de auto-confirm y, si las
  distancias de cartas reales bajan mucho, afinar `AHASH_MAX_DISTANCE`/`AUTO_CONFIRM_MARGIN`.

### Scanner — hash solo de la ILUSTRACIÓN (ART_CROP) (2026-06-07)
Idea adoptada del repo open-source `tranhd95/tcg-scanner` (su roadmap propone
"hashear solo el arte, no la carta entera"). Nuestro pipeline ya iba por delante
del suyo (detección Canny vs threshold+RDP; 24-bit RGB ahash vs dhash gris), pero
hasta ahora hasheábamos la carta ENTERA y solo enmascarábamos la banda SAMPLE.
**Problema:** el tercio inferior de la carta es el cuadro de efecto (texto
dependiente del idioma EN/JP + nombre/tipo) — ruido con layout casi idéntico entre
cartas que *gasta* bits y empeora la discriminación y la robustez entre idiomas.
**Fix:** se recorta a la ilustración superior **antes** de hashear.
- **`ART_CROP = (0.05, 0.05, 0.90, 0.38)`** (fracciones x,y,w,h → x 5–95%, y 5–43%
  de la carta). Elegido empíricamente barriendo candidatos sobre 400 cartas: la
  distancia Hamming al vecino más cercano (separación entre cartas distintas) sube
  de **mediana 126 (carta entera) → 262 (recortada)**; los pares confundibles
  (<20 bits) que quedan son SOLO variantes/reprints del mismo código base (mismo
  arte — los desambigua el usuario, flujo intacto). La banda SAMPLE cae **por
  debajo** de ART_CROP → ya no hace falta máscara: `MASK_ROWS=[]`, los **768 bits
  vuelven a ser informativos** (`HASH_BITS` 576→768).
- **Sincronía bit-a-bit** (contrato del repo): `ART_CROP` + `MASK_ROWS` replicados
  en `app/src/lib/phash.ts` y `scripts/build_card_database.py`. `computeAhash`
  resuelve dims de la imagen de trabajo (recorte de caja-foco opcional aplicado
  primero) y luego recorta ART_CROP fraccional → resize 16×16 (2 pasadas de
  `manipulateAsync`). Python: nuevo `_crop_art()` antes del resize en
  `_channel_average_hash_masked`.
- **Umbral**: `AHASH_MAX_DISTANCE` 60→**80** en `cardMatch.ts` (misma fracción
  ~10.4 %, reescalada 60/576 ≈ 80/768). `AHASH_MIN_SCORE` se deriva solo. Margen
  amplísimo vs cartas distintas (mediana 262).
- **BD regenerada**: `python scripts/build_card_database.py --hashes-only` → 4571
  hashes (192-hex), `hash_algo:"rgb_average_hash_artcrop"`, metadatos `art_crop`,
  copiada a `app/`. **Los hashes nuevos NO son comparables con los viejos**: BD + JS
  van juntos.
- **`scripts/visualize_hashes.py`** actualizado para aplicar ART_CROP (la columna 1
  muestra el recorte; matriz de discriminación con la nueva separación).
- **Verificado (offline)**: typecheck verde; matriz de discriminación (todas las
  parejas de muestra ≥276 bits, antes OP01-001 vs 002 = 156 → ahora 418); NN sobre
  la BD real mediana 262. **Pendiente usuario**: escaneo en dispositivo (build
  nativo) — confirmar paridad JS↔Python end-to-end (el motor de resize de
  expo-image-manipulator vs PIL puede voltear unos bits, absorbidos por el umbral)
  y reafinar `AHASH_MAX_DISTANCE` (~130–160/768 si el campo lo exige).
- **Rollback**: restaurar `ART_CROP`/`MASK_ROWS` antiguos en ambos ficheros y
  re-ejecutar `--hashes-only`.

### Scanner — shutter + feedback (2026-06-07)
Primer test en dispositivo: el scanner "no hacía nada" al pulsar el botón de captura.
Tres bugs encontrados y corregidos:
1. **Shutter nativo sin carta detectada → no-op silencioso.** El `handleShutter`
   simplemente volvía sin hacer nada (caso 3) si `pendingUriRef.current` era nulo en
   modo nativo. Fix: `NativeScanCamera` expone `triggerCapture()` vía `forwardRef`+
   `useImperativeHandle` con un `forceCapture` shared value. Al pulsarlo, el frame
   processor rectifica el primer frame con cualquier quad detectado (sin esperar los
   300 ms de estabilidad). Si no hay quad en 1.2 s → `showNoMatch()`.
2. **Fallo de hash silencioso** (todas las rutas). Cuando `matchTopK` devolvía `[]`,
   ninguna ruta mostraba feedback. El usuario no sabía si el scanner estaba
   funcionando o no. Fix: `showNoMatch()` en `handleShutter` (casos 1, 2, 3) y un
   overlay animado rojo (0.8 s) con el texto `scan.noMatch` ("Card not recognized").
3. **`computeAhash` con ops vacío.** Con ART_CROP la Stage A llamaba a
   `manipulateAsync(uri, [], PNG)` para resolver dims; algunos dispositivos devuelven
   `width`/`height` incorrectos (0 o undefined) con array de acciones vacío. Fix:
   cuando no hay `crop` (path nativo), se usan las constantes `RECTIFIED_W=350` /
   `RECTIFIED_H=490` directamente (el PNG de NativeScanCamera siempre tiene ese tamaño).
4. **`AHASH_MAX_DISTANCE` sin calibrar → 80 → 150.** 80/768 (≈10.4%) era arbitrario
   y nunca probado; las fotos de cámara pueden diferir bastante de la referencia.
   Subido a 150 (≈19.5%) que sigue siendo cómodo frente al margen de discriminación
   offline (mediana de distancia entre cartas distintas = 262 bits). Si aparecen
   falsos positivos, bajar; si se pierden cartas correctas, subir hasta ~200.
- `i18n`: añadido `scan.noMatch` en en.ts + es.ts.
- Typecheck limpio. **Pendiente usuario**: verificar en dispositivo.

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

**Stage-1 — native card detection (WIRED, awaiting on-device build verification):**
- **Deps installed**: `react-native-vision-camera@4.7.3`, `react-native-worklets-core@1.6.3`,
  `vision-camera-resize-plugin@3.2.0`, `react-native-fast-opencv@0.4.8` (--legacy-peer-deps).
- `app/app.json`: `react-native-vision-camera` plugin added.
- `app/babel.config.js`: `react-native-worklets-core/plugin` added.
- `app/src/lib/cardDetect.ts`:
  - `rectifyCardCrop` worklet implemented: `Point2fVector` → `getPerspectiveTransform(DECOMP_LU)`
    → `warpPerspective(INTER_LINEAR)` → `toJSValue(mat, 'png')` → base64 URI.
  - Fixed existing `detectCardQuad`: `DataTypes.CV_8U` (was `OpenCV.DataTypes?.CV_8U`),
    `arcLength` return typed as `{ value: number }`.
- `app/src/screens/ScanScreen.tsx`: **dual-path camera**:
  - `isCardDetectAvailable() && device && resizePlugin` → `nativeMode` flag.
  - Frame processor: `resize(480×640 bgr uint8)` → `detectCardQuad` → `onQuadChange` (SVG hint)
    → 1s throttle via `useSharedValue` → `rectifyCardCrop` → `onStableCard` → `matchTopK(uri, undefined, 3)`.
  - `nativeMode`: renders `<Camera>` (VisionCamera) + disables expo-camera scan loop.
  - `!nativeMode`: renders `<CameraView>` + runs original focus-box scan loop (Expo Go unchanged).
  - Focus box: corners turn green (`#22c55e`) when `cardDetected`; hint text changes.
- i18n: `scan.hintPointAtCard` / `scan.hintCardDetected` added to en.ts + es.ts.
- `npm run typecheck` passes clean.
- **Next step**: `npx expo prebuild --clean && npm run android` on device, verify with a physical card.

### `train_embeddings.py` — GPU + incremental support (2026-06-06)
- **`--amp`**: mixed precision FP16 via `torch.amp.autocast` + `GradScaler`. ~2× velocidad en GPU NVIDIA Ampere+.
- **`--resume`**: carga el backbone de `data/embedding_checkpoint.pt` antes de entrenar. El checkpoint se guarda automáticamente tras cada entrenamiento. Con warm start, converge en ~8 épocas vs 25.
- **`--add-only`**: NO reentrena. Extrae embeddings solo de cartas ausentes en `embeddings.json` y los fusiona. ~2 min en CPU. Flujo recomendado para añadir nuevas expansiones (tras `build_card_database.py`).
- **GPU (fix)**: si `torch.cuda.is_available()` devuelve False, reinstalar con versión CUDA: `pip install torch torchvision --index-url https://download.pytorch.org/whl/cu121`
- **Flags recomendados para GPU**: `--amp --batch 256 --workers 4`
- **Flujo para nueva expansión** (sin reentrenar desde cero):
  1. `python scripts/build_card_database.py` → descarga cartas nuevas
  2. `python scripts/train_embeddings.py --add-only` → ~2 min
  3. `npm run android` → rebuild bundle

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

### Performance — collection editing & browsing re-renders (2026-06-06)
Fixed the lag when editing copies (+/-) and browsing the collection. Root cause:
every `adjust()` fired the collection listeners → `ownedAggregate.refresh()` →
each list screen bumped a `tick` that (a) recomputed a filter+sort over **all
~4571 cards** and (b) re-rendered **every** mounted `CardThumb` (none memoized,
inline `renderItem`/`extraData`). One tap = full-collection recompute + full grid
re-render.
- **`ownedAggregate.ts`**: added `subscribeMembership()` — fires only when the
  *set* of owned variant keys changes (a card enters/leaves the collection), not
  on quantity changes. `refresh()` diffs the owned-key set to decide.
- **`CardThumb.tsx`**: now `React.memo`'d, with an opt-in **live mode**
  (`liveCode` / `livePerVariant` / `liveMultiArt` / `dimWhenEmpty`). In live mode
  the thumb subscribes to `ownedAggregate` itself and updates its own count with a
  `setState` **bail-out** (`prev === next ? prev : next`) — so editing one card
  re-renders only that card; other mounted thumbs get the notification and no-op.
  Non-live callers (SetDetail) keep the old `owned`/`qty`/`multiArt`/`dimmed` props.
- **`BinderScreen.tsx`**: list memos now keyed on a **membership** tick
  (`subscribeMembership`); a separate `countTick` (from `subscribe`) only refreshes
  the header totals. `renderItem` is a stable `useCallback`, `extraData` is
  memoized, and rows render through a memoized `GridCard` (owned tab → live
  CardThumb; trade tab → `useTradeQty` self-subscription with bail-out).
- **`BrowseScreen.tsx`**: dropped the global `force` re-render on collection
  changes (rows self-update via live CardThumb); `renderItem`/`extraData` made
  stable. Note: the "Owned" sort no longer reorders live mid-edit (re-tap to
  re-sort) — acceptable trade-off.
- Net effect: a +/- tap does O(visible-rows) cheap compute+compare and exactly
  **one** card re-render; the 4571-card list recompute now happens only on
  add/remove or filter/sort/tab changes.
- `npm run typecheck` clean. **Awaiting on-device review** before commit.

### Refactor — unified card-grid workflow & SetDetail bottleneck (2026-06-06)
The three card grids (Browse / Binder / SetDetail) had drifted into divergent
implementations of the same filter→sort→expand→render workflow. Consolidated
them and fixed the last full-grid-re-render bottleneck.
- **`lib/cardQuery.ts` (NEW)** — single source of truth for sorting:
  `sortCards(cards, sort)` + exported `SortKey` / `SortState`. Reuses
  `RARITY_ORDER` (theme), `setPrefix` (filters), `getOwnedFor` (ownedAggregate).
  `BrowseScreen` and `BinderScreen` deleted their hand-rolled sort switches and
  import it. (Filtering `matches()` + `fuzzyFilter()` stay in `filters.ts`.)
- **`SetDetailScreen` migrated to the live-`CardThumb` pattern** (was the worst
  remaining interactive bottleneck — it re-rendered the whole set grid on every
  `+/-` via a global `subOwned(()=>force())` + inline non-memoized `renderItem`):
  - New memoized `SetGridCard` + `useLiveSetOwned` hook: each cell subscribes to
    `ownedAggregate` and bails out (`prev===next`) unless *its* count changed.
    Honors collapsed semantics (parallels off → sums in-set variants; on →
    counts the shown variant) and the multi-art indicator, live.
  - Grid `data` now comes from the **cached** `setEntries(setCode)` (stable
    across edits) instead of `summary.entries` (rebuilt each tick).
  - The old single `force` was split into a **header-only `headerTick`**: the
    ring (`summarizeSet`) + rarity strip (`rarityBuckets`) still update live on
    every `+/-` (both now memoized on `headerTick`), but the grid no longer
    depends on it. Stable `renderItem`/`extraData`, `removeClippedSubviews`,
    `windowSize`/batch tuning to match Browse/Binder.
- **`BinderScreen` owned/trade derivation** no longer scans all ~4571 cards:
  owned tab iterates `Object.keys(getOwnedTotals())`; trade tab iterates owned
  codes ∪ `getOverrides()` keys; "Show all" uses the pre-sorted `CARD_LIST`.
  Per-edit recompute drops from O(4571) to O(owned).
- **Dead code removed**: `lib/wishlist.ts` (deprecated single-wishlist,
  `optcg.wishlist.v1`, imported by nothing) and the `WishlistItem` type in
  `types.ts`. Live system remains `lib/wishlists.ts` + `WishlistCard`.
- `npm run typecheck` clean. **Awaiting on-device review** before commit.
  Verify: SetDetail `+/-` re-renders one tile + ring/rarities still update;
  Browse/Binder sort order unchanged; Binder meta counts + "Show all" intact.

> **NOTE:** the dated *Scanner* sections below (Stage-1/2/3, `train_embeddings.py`,
> fine-tuned embedding model, ScanScreen UX overhaul) are **historical** — that
> whole on-device scanner was removed 2026-06-06 (see "Card Scanner" above).

### Supabase backend — accounts, cloud sync & friends (2026-06-07, typecheck-green, NOT yet provisioned/device-verified)
Added an **optional** cloud backend (Supabase) on top of the local-first app.
**The app still works 100% offline with no account**; signing in enables
cross-device backup/sync + a friends system. Resolves QoL §2. Decisions taken
with the user: local-first + optional sync; **per-resource privacy toggles**
(collection / wishlist / decks each `public/friends/private`); **images stay on
jsDelivr** (NOT migrated to Supabase — immutable, free edge CDN; analysis in the
plan). Static data (card index, prices, images) is never sent to Supabase.

- **Schema/RLS** — `supabase/migrations/0001_init.sql` (apply via SQL editor or
  `supabase db push`): `profiles`, `privacy_settings`, `user_settings` (jsonb),
  `collection_items`, `wishlists(+wishlist_cards)`, `decks(+deck_cards)`,
  `friendships`. Enums `visibility`/`friend_status`. **Wishlists/decks use the
  client's string ids (`wl_…`/`deck_…`) as `text` PKs** → sync is a plain
  natural-key mirror, no uuid remapping. Helper fns `are_friends`, `can_view`,
  `vis_of` (security definer). RLS on every table: owner-only writes; reads gated
  by `can_view(owner, vis_of(owner, resource))`. `handle_new_user` trigger
  auto-creates profile + privacy defaults (username from metadata/email).
- **Client config** — `config.ts` adds `SUPABASE_URL` / `SUPABASE_ANON_KEY`
  (both empty by default; **anon key only** — public/safe). `SUPABASE_ENABLED`
  gates all account UI. ⚠️ The user's Personal Access Token (`sbp_…`) was pasted
  in chat → must be **rotated**; it is NOT stored anywhere in the repo and is not
  used by the app.
- **`lib/supabase.ts`** — lazy client (null when not configured); URL polyfill;
  AsyncStorage session storage. `isSupabaseEnabled()`/`requireSupabase()`.
- **`lib/auth.ts`** — store-idiom cache+subscribe over Supabase Auth.
  email+password `signUp`/`signIn`/`signOut`, `getSession`/`getUser`/`getProfile`,
  `updateProfile`, `onAuthChange`. OAuth/magic-link = future.
- **`lib/syncBus.ts`** — tiny pub/sub to decouple stores from sync (avoids import
  cycles). Stores call `notifyLocalChange(domain)` in `write()`.
- **Store wiring** — `collection.ts` (key bumped **v1→v2**), `decks.ts`
  (**v1→v2**), `wishlists.ts` (**v2→v3**) each: added `updatedAt` (ms) stamped on
  mutations, migration that seals legacy items to `updatedAt:0`, `notifyLocalChange`
  on write, and a `replaceAllFromSync()` that writes without re-emitting.
  `settings.ts` added `updatedAt` + `applyFromSync`/`getCachedSettings`.
- **`lib/sync.ts`** — local-first LWW. On sign-in: `reconcileAll()` (pull + merge
  by `updatedAt`, **union — no deletes** on first reconcile, write both sides).
  On local change: debounced (1.5s) `pushDomain()` that **mirrors local→server**
  (upsert + delete server rows not in local). Collection/settings are true
  per-item LWW; wishlists/decks are LWW per-entity (cards replaced in bulk).
  Exposes `syncNow()`, `getSyncStatus()`, `getLastSyncedAt()`, `subscribe`.
  Imported for side-effects in `App.tsx`.
- **`lib/friends.ts`** — `searchUsers`, `sendRequest`, `acceptRequest`,
  `removeEdge`, `refreshEdges`, `getFriends`/`getIncoming`/`getOutgoing`,
  `getPrivacy`/`setPrivacy`, and friend-data fetchers
  `getFriendCollection`/`getFriendWishlists`/`getFriendDecks` (RLS-gated → empty
  when not shared).
- **Screens** — `AccountScreen` (auth form ↔ profile+sync+privacy toggles+sign
  out; degrades when backend disabled), `FriendsScreen` (search/requests/list),
  `FriendProfileScreen` (Collection/Wishlist/Decks tabs; reuses `CachedImage` +
  local `CARDS` for metadata; "not shared" placeholder). Routes `Account`,
  `Friends`, `FriendProfile` added to `navigation.ts` + `App.tsx`. Entry point =
  "Account & sync" row at top of `SettingsScreen`. i18n keys added to en+es.
- **`npm run typecheck`**: no new errors (only the 6 pre-existing
  `cardDetect.ts` errors from the native scanner remain).
- **User provisioning steps (required before this works):**
  1. Rotate the leaked `sbp_…` token at supabase.com/dashboard/account/tokens.
  2. Create a Supabase project; run `supabase/migrations/0001_init.sql` in the
     SQL editor.
  3. In Auth settings, decide email-confirmation on/off (off = instant sign-in
     for testing).
  4. Paste Project URL + anon public key into `app/src/config.ts`.
  5. `npm run android` (or Expo Go) → Settings → Account & sync → sign up.
- **Known v1 limitations (see Known Bugs B-09 / QoL):** no realtime multi-device
  push (reconcile happens at each login); deletes propagate via the active
  device's mirror push, not tombstones, so a delete on device A while device B is
  offline can be resurrected if B logs in and pushes first. Acceptable for v1.

## Known Bugs

### B-14 — Scanner: rectified crop comes out rotated → wrong region hashed — PARTIALLY FIXED (2026-07-15)
- **Files:** `app/src/lib/phash.ts` (`computeAhash` gained a `rotate` param),
  `app/src/lib/cardMatch.ts` (`matchTopK` tries 4 rotations, `AHASH_MAX_DISTANCE`).
- **Symptom:** Stage-2 identification never returned the correct card — distances
  stayed 200-260/768, well above the (never-device-tested) 150 match floor, landing on
  the *same wrong* candidates across many frames (not random noise). The 16×16 pre-hash
  crop, decoded and viewed directly, showed vertical color-banding instead of the
  card's illustration — no recognizable image at all.
- **First hypothesis (tried, disproved, reverted): corner-localization precision.**
  Suspected `detectCardQuad`'s corners weren't precise enough for a clean
  `warpPerspective`, and tried raising the detection buffer resolution (480×640 →
  720×960) + tightening `approxPolyDP`'s epsilon (0.02→0.015). **Device-retested: no
  improvement** — distances barely moved. Both changes were reverted rather than kept
  as unverified/unnecessary compute cost (2.25× Canny/contours per frame for nothing).
  **Lesson for next time:** don't skip the cheapest diagnostic — dumping and looking at
  the actual intermediate image — in favor of a plausible-sounding theory.
- **Real root cause, found by dumping the RAW `rectifyCardCrop` output (350×490,
  *before* any `expo-image-manipulator` crop/resize) and viewing it directly**: the
  rectify/warp step itself is fine — clean, sharp, correctly perspective-corrected —
  but the card comes out **rotated ~90°** from upright. `detectCardQuad`'s
  `orderCorners` has no way to know which of the quad's 4 corners is the card's actual
  printed "top" (it's a screen-relative sum/diff heuristic, not orientation-aware), so
  the fixed `ART_CROP` band (assumes the top 5-43% by height is the illustration) crops
  a meaningless thin strip of border/background instead when the content is sideways —
  exactly explaining the banding.
- **Fix:** `computeAhash(imageUri, crop?, rotate?)` now accepts a rotation (via
  `ImageManipulator`'s `rotate` action) applied before the art-crop. `matchTopK`, on the
  native path only (no `crop`), tries `[0, 90, 180, 270]° and keeps each card's
  best (lowest-distance) result across all 4. **Device-verified**: with the correct
  rotation, the top-2 database matches were `OP09-088` and `OP09-088_r1` — the actual
  scanned card and its own variant, tied at distance 223 (previously the true card
  never appeared in the top-5 at all).
- **`AHASH_MAX_DISTANCE` recalibrated 150→235** from that real measurement (223) with
  small headroom, still under the ~262 different-card baseline — the old value was
  itself never device-tested (its own comment admitted this) and would have rejected
  even the correct match.
- **NOT fully solved — real remaining problem, not guessed, measured:** a *wrong*
  rotation's hash can coincidentally score *better* against some unrelated card
  (measured 206-209) than the *correct* rotation scores against the *true* card (223).
  Tried and **ruled out** a rank1-vs-rank2 margin/confidence heuristic to auto-detect
  "real match" vs "noise" — in the one test session, the noise rotation actually had
  the *largest* margin (38) while the real match's margin was smallest (0, because the
  card's own two variants tied for 1st/2nd — itself a positive signal worth revisiting
  with more data). **One data point isn't enough to safely generalize a selection rule**
  — a real fix needs either more real-world samples to find a reliable discriminator,
  or (more promising, untried) requiring the *same* candidate to win across several
  *consecutive* AUTO-mode frames before accepting it — noise should vary frame-to-frame
  while a genuine match should be stable. Also untested: whether the wrong-orientation
  problem is worse/different for **foil/holographic cards** (B-12's note) — only tested
  with a matte card this session.
- **How all of this was diagnosed** (repeatable methodology for next time): temporary
  `[SCANDBG]`-tagged logs (removed again — grep for `SCANDBG` if reviving), chunked
  base64 dumps of intermediate images pulled off-device via `adb logcat` (logcat
  truncates ~4KB/line; also needed `adb logcat -G 16M` once to stop the ring buffer
  rotating out early chunks), reassembled and viewed with small Python/Node scripts in
  the scratchpad, and — critically — compared against ground truth using the *exact*
  Python hashing algorithm from `build_card_database.py`, not eyeballing or guessing.

### ~~B-13 — Scanner: hand-rolled DEFLATE/PNG decoder threw "invalid huffman" on real camera PNGs~~ — RESOLVED (2026-07-13)
- **File:** `app/src/lib/phash.ts`.
- **Symptom:** `computeAhash()` threw `Error: invalid huffman` (or `unexpected EOF`) on
  every real, camera-derived 16×16 PNG once Stage-1 detection started working (B-12).
- **Root cause:** `phash.ts` had a ~150-line hand-rolled DEFLATE/PNG decoder whose own
  comment admitted it "only handles the tiny 8×8 RGBA/RGB PNGs" — but `HASH_SIZE` is
  16, and it had apparently never actually been exercised against a real 16×16 payload
  before this session. Confirmed via reproduction: extracted the exact failing base64
  PNG from device logs, verified the PNG itself was 100% valid (Node's built-in `zlib`
  inflated it cleanly, all chunk CRCs matched), then traced our decoder's own dynamic-
  Huffman-table construction step-by-step and found it produced a code-length table
  with Kraft sum ≈0.27 instead of the required 1.0 — i.e. a genuinely broken table, not
  a data problem. The bug is somewhere in the bit-level Huffman reconstruction; not
  worth hunting further by hand once a battle-tested alternative exists.
- **Fix:** deleted the entire hand-rolled decoder (`decompressDeflate`, `inflateRaw`,
  `_deflate` — none used elsewhere; `onnx.ts`, the file that supposedly reused
  `_deflate`, doesn't exist in this codebase) and replaced it with `fflate`'s
  `unzlibSync` (new dependency, ~8KB, zero deps, pure JS — no native rebuild needed).
  `decodePng`'s chunk-walking + row-unfiltering logic is unchanged; only the
  decompression step changed.
- **Verified on device:** 0 decode errors across a full scan session afterward (was 25
  errors/session before).

### ~~B-12 — Scanner: Stage-1 area threshold rejected genuine card quads~~ — RESOLVED (2026-07-13)
- **File:** `app/src/lib/cardDetect.ts` (`isCardQuad`).
- **Symptom:** On-device, `quad detected=true` fired essentially never (0-3 times per
  ~1000 detection frames) even with a card held steady in frame.
- **Root cause:** `isCardQuad`'s minimum-area floor (`area < frameArea * 0.08`, i.e. the
  quad must cover ≥8% of the 480×640 resized frame) was set blind — the module's own
  comment already flagged it "Never device-tested — recalibrate if... good scans miss."
  Real in-hand scans topped out at 7.3-8.0% even held close, never actually reaching 8%.
- **Fix:** extracted the magic number to `AREA_MIN_FRACTION` and lowered it to 0.04,
  with headroom for normal (not just close-up) holding distance.
- **Verified on device:** went from 0 stable detections to consistently detecting a
  plain (non-foil) card, including through a card sleeve — sleeving is **not** a
  blocker for Stage-1 detection (see B-14 for what's actually still broken).
- **Note:** a **holographic/foil** card was also tested and did *not* detect reliably —
  glare/glitter texture generates too much Canny edge noise for this classical-CV
  approach. Not yet root-caused separately from B-14; may turn out to be the same
  corner-precision issue or may need dedicated handling (e.g. polarizing capture
  timing, HDR, or accepting foil cards need the manual code-entry fallback).

### ~~B-11 — Native Android crash: "App entry point named 'main' was not registered"~~ — RESOLVED (2026-07-13)
- **File:** `app/index.js`
- **Symptom:** Fresh native install (both debug and release) crashed to a red "App
  entry not found" screen instead of rendering `Home`. Never seen in the web preview.
- **Root cause:** `index.js` (the theme-mode-aware custom entry point, added
  2026-06-26 for the light/dark theme feature) called `registerRootComponent(App)`
  **inside an `async () => {...}` IIFE, after `await AsyncStorage.getItem(...)`**, so
  that `theme.ts`'s `globalThis.__INITIAL_THEME_MODE__` read (module-eval time) would
  see the right mode before any screen's `StyleSheet.create` ran, avoiding a
  wrong-theme flash. On native, React Native's bridge calls
  `AppRegistry.runApplication("main", …)` right after the JS bundle finishes
  evaluating — it does **not** wait for a component registered later via an async
  callback. By the time the `await` resolved and `registerRootComponent` finally ran,
  native had already tried (and failed) to look up `"main"`. Web never hit this
  because its entry/mount path doesn't have that synchronous-registration contract —
  which is exactly why this shipped unnoticed: **the theme-mode feature (and several
  others since) had only ever been typecheck-green + web-verified, never run on a
  real native build until this session's first `npx expo run:android`.**
- **Fix:** `registerRootComponent` now runs synchronously and immediately, pointing at
  a small `Root` component that itself does the async `AsyncStorage` read (via
  `useEffect`) and returns `null` until it resolves — satisfying native's timing
  requirement while still deferring `require('./App')` (and thus every screen's
  `StyleSheet.create`) until `__INITIAL_THEME_MODE__` is set, preserving the original
  no-flash intent.
- **Verified on device:** Xiaomi `duchamp_global` (Android 16, arm64-v8a) — both a
  live-reloaded debug build and a fully standalone release build (Metro killed, `adb
  reverse` removed) now boot straight to `Home` with no crash.

### ~~B-10 — Web build (`npm start` → web) rendered a blank page~~ — RESOLVED (2026-06-07)
- **Symptom:** Running the web target showed a blank page; no error overlay, no
  console error. React never mounted (`__REACT_DEVTOOLS_GLOBAL_HOOK__.renderers`
  = 0, `#root` empty) even though the bundle loaded HTTP 200.
- **Root cause:** `App.tsx → ScanScreen.tsx` *statically* imports
  `lib/cardDetect` (for `isCardDetectAvailable`). `cardDetect.ts` defines
  `'worklet'` functions that reference `OpenCV.frameBufferToMat` (react-native-
  fast-opencv). The **react-native-worklets-core babel plugin builds each
  worklet's closure at MODULE-EVAL time**, emitting `{ frameBufferToMat:
  OpenCV.frameBufferToMat, … }()` — which dereferences `OpenCV` (null on web)
  the instant the module is imported → `TypeError: Cannot read properties of
  null (reading 'frameBufferToMat')` thrown from the entry require, aborting the
  whole bundle before `registerRootComponent` could mount. The throw was swallowed
  (entry-level, pre-mount), hence the silent blank page. Surfaced by manually
  re-requiring the entry module via the metro runtime (`window.__r(0)`), which
  re-throws metro's cached module error.
- **Fix:** platform stubs so the native/worklet code is never bundled on web
  (Metro prefers `.web.*`):
  - `app/src/lib/cardDetect.web.ts` — `isCardDetectAvailable()` → false; no-op
    `detectCardQuad`/`rectifyCardCrop`; re-exports the same types/constants.
  - `app/src/screens/NativeScanCamera.web.tsx` — returns `null`; keeps the
    vision-camera + frame-processor worklet imports (and their eager closures)
    out of the web bundle. Needed because Metro statically bundles the
    conditional `require('./NativeScanCamera')` in `ScanScreen` regardless of the
    runtime guard.
  - ScanScreen already degrades to the manual code-lookup path on web/Expo Go.
- **Verified (browser preview):** fresh cache-cleared web bundle is ~83 KB
  smaller (OpenCV/vision-camera excluded); React mounts; Home dashboard renders
  full-height (`#root` fills viewport). Typecheck clean.
- **Note:** the web entry point is `node_modules/expo/AppEntry.bundle` (from
  `package.json` `"main"`), **not** `./index` — no root `index.js` is needed for
  web. The `expo-reset` full-height CSS is provided by Expo's default HTML
  template; no custom template required.

### ~~B-08 — Hold-repeat timer leak: rapid +/- added hundreds of copies~~ — RESOLVED (2026-06-06)
- **File:** `components/CardThumb.tsx` (quickActions `+/-`, `startHold`/`stopHold`).
- **Symptom:** Tapping "add copies" very fast made the input "buffer" — dozens of
  phantom inputs kept firing and hundreds of copies were added continuously, even
  after lifting the finger.
- **Root cause:** `holdRef` held a single slot for the timeout (`.t`) and interval
  (`.i`). Under fast taps, `Pressable` fires a new `onPressIn` before the prior
  press's 350 ms timeout resolves (its `onPressOut` is dropped/reordered). The
  second `startHold` overwrote `.t`/`.i` **without clearing the old timers**,
  orphaning them: the first interval kept calling `adjust(+1)` forever with no
  handle left to clear it. NOT a persistence-cadence issue — `collection.ts`
  already debounces disk writes 300 ms and the UI updates optimistically.
- **Fix:** `startHold` now calls `stopHold()` first (idempotent — no orphaned
  timers on rapid taps); `stopHold` nulls the slots after clearing; added
  `useEffect(() => stopHold, [])` to kill a running interval if the tile unmounts
  mid-hold (e.g. scrolling with `removeClippedSubviews`). Each tap = exactly one
  `adjust(±1)`; press-and-hold still ramps at 80 ms after 350 ms. Typecheck clean.
  **Verify on device:** tap `+` ~15× fast → count lands on the tap count and
  stops (no drift after release); hold still ramps and halts on release.

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

### ~~B-03 — `prices.ts` uses mock data~~ — resuelto (2026-06-06)
- **Files:** `lib/prices.ts`, `app/src/data/prices.json`, `scripts/build_prices.py`
- `scripts/build_prices.py`: scrapea Cardmarket (`cardmarket.com/en/OnePiece`) con
  `cloudscraper` (bypass Cloudflare). Una búsqueda por código base agrupa todas las
  variantes (normal + parallel). Delay de 1.5 s entre peticiones. Incremental:
  solo re-fetch cartas ausentes o con precio > 7 días. Genera `data/prices.json` y
  lo copia automáticamente a `app/src/data/prices.json`.
  Flags: `--all`, `--stale N`, `--codes`, `--dry-run`.
- `lib/prices.ts`: carga `prices.json` estáticamente (igual que `index.json`).
  `getPrice(card, suffix?)` busca por clave exacta (`{code}{suffix}`) → clave base
  → estimación por rareza. `getLowPrice()`, `hasRealPrice()` también exportados.
- `app/src/data/prices.json`: placeholder vacío hasta que se ejecute el script.
- **Fallback manual (consola del navegador)** — para cuando Cloudflare bloquea el
  scraper automático:
  - `scripts/scrape_browser_console.js`: se pega en la consola de Chrome DevTools
    estando en una página de singles de Cardmarket. Navega todas las páginas de la
    expansión, extrae código + precio "From" del DOM, y al terminar imprime un JSON.
    Acumula en `window.__CM_PRICES`. Guardar como `data/browser_dump.json` (gitignored).
  - `scripts/import_browser_prices.py`: fusiona `data/browser_dump.json` con
    `data/prices.json` (lo crea si no existe) y copia a `app/src/data/prices.json`.
    Uso: `python scripts/import_browser_prices.py [ruta/dump.json]`.
- **Flujo de actualización:** `python scripts/build_prices.py` (o el fallback de
  consola → `import_browser_prices.py`) → commit de `data/prices.json` +
  `app/src/data/prices.json` → jsDelivr sirve los precios actualizados tras el push
  (o se usan en el bundle del próximo build).

### ScanScreen UX overhaul (2026-06-06)
- **Ghost eliminado** — `PeronaGhost` + float animation + `speechBubble` quitados de la vista principal (conservado solo en la pantalla de permisos).
- **Debounce arreglado** — `confirmCandidate` ahora resetea `lastScan.current = 0` antes de llamar a `handleCodeFound`, evitando que el tap en la hoja de variantes quede bloqueado por el debounce de 800ms.
- **Escaneo continuo** — reemplazado `setInterval(1500)` por bucle recursivo `scanLoop → setTimeout(80) → scanLoop`. La velocidad efectiva la limita `takePictureAsync` + ONNX (~0.5-1s). No hay intervalo fijo visible.
- **Sistema de modos de escaneo** — selector de 4 chips en el panel inferior:
  - **Ver** (default): escanea → abre `DetailScreen` + cierra scanner
  - **Colección**: escanea → `adjust(+1)` + toast
  - **Deck**: al seleccionar abre picker de decks; luego escanea → `setDeckCard(+1)` + toast
  - **Wishlist**: al seleccionar abre picker de wishlists; luego escanea → `addCard(+1)` + toast
  - El chip de Deck/Wishlist muestra el nombre del destino seleccionado.
- **Toast simplificado** — eliminado el título fijo "Negative Hollow!"; muestra código+nombre + descripción contextual (e.g., "×3 en colección", "→ Mi deck").
- i18n: añadidas keys `scan.modeView/Collection/Deck/Wishlist`, `scan.pickDeck/Wishlist`, `scan.noDecks/Wishlists` en en.ts + es.ts.

### ~~B-05 — Scanner: `skipProcessing: true` caused wrong crop coords~~ — RESOLVED (2026-06-06)
- **File:** `src/screens/ScanScreen.tsx`
- **Symptom:** Scanning a card produced no match / silent failure. The photo was captured with
  `skipProcessing: true`, which skips EXIF orientation correction on Android. The camera returns
  landscape pixel dimensions (e.g. 4032×3024) even when the phone is held in portrait. The crop
  calculation (`cropX/Y = focusBox * scaleX/Y`) then mapped to a completely wrong region of the
  image — the card was never actually hashed.
- **Fix:** Removed `skipProcessing: true` and the non-existent `shutterSound: false` option.
  Changed `quality` from 0 to 0.5 (better source for the 16×16 ahash). The `as any` cast is
  also removed; the call is now properly typed. Typecheck green.
- **Note:** The ahash threshold (`AHASH_MAX_DISTANCE = 60`, 7.8% of 768 bits) is calibrated for
  ideal conditions. If matches are still missed in poor lighting/glare, bump it towards 100-120.
  Empirical calibration needs device testing.

### B-06 — Deprecated `WishlistItem` has no migration path
- **File:** `types.ts`, `lib/wishlists.ts`
- **Symptom:** If a device previously had data under the old single-wishlist format (`WishlistItem`
  keyed by code), the new `wishlists.ts` reads a different AsyncStorage key and silently starts
  fresh. Old data is orphaned.
- **Severity:** Low — app is pre-release so no real user data exists yet.
- **Fix:** Before public release, add a one-time migration in `wishlists.ts` that reads the old
  key and converts it to a default wishlist if present.

---

## QoL / Future Improvements

### Scanner: frame-to-frame consistency voting (follow-up to B-14)
B-14's rotation fix is device-verified but not fully robust — see the "NOT fully
solved" note in Known Bugs. The most promising untried idea: AUTO mode already
processes a new frame every ~1.5s continuously; require the *same* top candidate to
win across 2-3 *consecutive* frames before auto-adding it, instead of trusting the
first result. A genuine match should be stable frame-to-frame; a coincidental
noise-vs-wrong-card match should not be. Needs on-device testing with several
different cards (incl. a foil one — B-12 already flagged foil detection as separately
unreliable) before trusting it, same as everything else in the scanner pipeline.

### ~~Price change-% delta on tiles~~ — done (2026-06-28)
Implemented as `lib/priceHistory.ts`: snapshots each `prices.json` release and
diffs the current price against the previous release (≈ weekly delta), shown
green/red on Browse tiles. Reads `0.0%` until the next price release provides a
prior snapshot. Future: per-variant (not just base-code) history; a "since you
started tracking" cost-basis mode for the Portfolio/Binder view.

### Global scan reachability (deferred from the 2026-06-28 Collectr restyle)
Killing the Scan FAB means scan is only reachable where a search field / action
row exists (Browse, Binder owned tab). If users miss scanning from Home/Decks,
options: add the camera to more surfaces, or a small persistent scan affordance.

### ~~1. Real Cardmarket price integration~~ — resuelto (2026-06-06, Opción A)
Ver implementación en B-03 arriba. Mejoras posibles a futuro: Opción B (proxy backend)
para precios en tiempo real, o migrar a Cardmarket API oficial si se obtiene acceso.

### ~~2. Cloud / cross-device sync~~ — resuelto (2026-06-07, Supabase)
Implementado como backend OPCIONAL con Supabase (cuentas + sync local-first +
amigos). Ver "Supabase backend" en Implemented Features. **Pendiente de
aprovisionar el proyecto + verificación en dispositivo por el usuario.**
Mejoras futuras: realtime multi-dispositivo, tombstones para borrados offline,
OAuth/magic-link, y matching de trades (wishlist de un amigo ↔ mi colección).

### ~~3. OPTCGSim deck export~~ — done (2026-07-16, web-verified)
`lib/optcgsim.ts` gained `toOptcgSimString(entries)` — leader first (OPTCGSim
convention), rest sorted by code, `NxCODE` newline-joined; round-trips through
`parseOptcgSim` (tokens match ENTRY_RE). `DeckDetailScreen` has a "Share deck
code" header button (`external` icon) opening a modal with the read-only
selectable code + a Copy (web: `navigator.clipboard`) / Share (native:
`Share.share` from RN core — no new dep) button. **Web-verified**: imported
`4xOP01-025 1xOP01-001 4xOP01-016 2xOP01-024` (scrambled) → export produced
`1xOP01-001` first then sorted rest, correct qtys; clipboard write path runs
clean in a secure context. Not device-verified (native Share path).

### 4. Barcode / QR scanning as OCR fallback
Official OPTCG packs include a barcode or QR code on some products. Could be a faster scan path
than ML Kit text recognition on card codes, especially for bulk scanning.

### 5. Set release calendar
A dedicated view or HomeScreen tile showing upcoming set release dates sourced from `setMeta.ts`
(or fetched from the scraper). Useful for collectors planning purchases.

### 6. Price alerts / wishlist notifications
Push notification (via Expo Notifications) when a wishlist card drops below a target price.
Requires the real price integration (QoL §1) first.

### 12. Cloud-AI scanner (the rebuild) — SUPERSEDED por Opción C (2026-06-07)
**Resuelto vía on-device, no cloud.** Se eligió la Opción C (sin coste recurrente,
offline) y se implementó — ver "Card Scanner v2 — on-device detect+rectify+pHash"
en Implemented Features. Pendiente solo de build nativo + verificación en
dispositivo. La opción cloud (A/B) queda como alternativa futura si el pHash on-device
no alcanza precisión usable. Histórico de la investigación abajo.

Design and build the new scanner: capture a photo (`expo-camera`), optionally
downscale (`expo-image-manipulator`), upload to a vision backend, receive the
identified card code (+ confidence / candidate variants), then feed it into the
existing **code → variants → user picks** flow and the scan-mode actions
(view / collection / deck / wishlist). The old scanner's scan-mode UX (4 chips,
variant-confirmation sheet) is a good reference for the front-end even though its
code was deleted.

**Research (2026-06-07) — angle-robust scanner landscape.** Investigated the
field to decide the rebuild direction. Key conclusions:
- **The angle problem is solved in STAGE 1, not the matcher.** Every robust
  scanner uses a two-stage pipeline: (1) detect the card quad + **4-point
  perspective rectify** (`getPerspectiveTransform`/`warpPerspective`) to a
  canonical front-on rectangle, THEN (2) identify. Our old scanner skipped
  stage 1 and required the user to align the card in the focus-box → hence the
  "millimetre precision" pain. With rectify in front, any decent matcher works
  at any angle/distance/imprecise crop. This is the single most important fix.
- **Closest reference:** Anthony Lowhur's 10,856-card Yu-Gi-Oh recognizer
  (PyImageSearch) — almost our intended stack: 4-point transform + **metric-
  learning embeddings** (triplet/Siamese ResNet, NOT classification, NOT stock
  ImageNet) + **ORB re-ranking** of the top-N + pre-computed embeddings for O(1)
  lookup. Critical lesson = the **domain gap**: training on clean official art
  and testing on real photos kills accuracy; needs heavy augmentation
  (brightness/contrast/shift/blur/glare/perspective) + a real-photo dataset, and
  *blur pooling* for CNN shift-invariance. This matches exactly the two gaps our
  old scanner had (no rectify; stock-not-finetuned MobileNet).
- **Industry norm:** CollX / LUDEX / TCGplayer / TCGScan / Shiny and the
  One-Piece-specific apps (Logia, OP.TCG PLUS, OneCollector, TCG Stacked) all run
  recognition **server-side** with in-house deep models (~98% first-scan claims).
  Confirms the cloud-AI direction is the industry standard.
- **Variant caveat (keeps the CLAUDE.md flow):** no art-recognition backend
  reliably distinguishes a parallel `_p1` from its base — the **printed code**
  does. So **printed-code OCR + visual variant pick** must stay regardless of
  backend (code → variants → user picks).

**Three candidate backends (no decision yet — user leaning to "no recurring
cost"):**
- **A — Third-party API (Ximilar `/v2/tcg_id`, supports One Piece):** fastest to
  ship, robust out-of-the-box. ✗ business plan, **per-scan cost, online-only**,
  may not match our exact variants. Ruled out by the no-recurring-cost priority.
- **B — Self-hosted embedding backend (this §12 plan):** train on our 4571 local
  images, full variant control, ~no per-scan cost. ✗ we run a server; net cost.
- **C — On-device, 2nd attempt:** retry the removed local scanner **but with the
  Stage-1 detect+rectify in front** and a fine-tuned augmented embedding. ✗ heavy
  native deps (vision-camera + OpenCV), one-time training. **Zero recurring cost
  + offline = best fit for the user's stated priority.**

**User decision (2026-06-07):** investigation only, not committing to a backend
yet. Stated priority = **no recurring costs** (→ favours C, then B; rules out A).
Next session: pick B vs C and design capture→detect/rectify→identify→variant-pick.

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

### ~~9. UI price disclaimer~~ — done (2026-07-16, web-verified)
Small muted footnote on the Home vault card (`VaultValueCard`): "Prices are
estimates, not offers to buy or sell." (i18n `home.priceDisclaimer`, en+es).
Placed only on the vault tile, not `DetailScreen` — the latter no longer shows a
numeric price (just a Cardmarket link), so there's no price row to caveat.
Web-verified visible under the € figure.

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
