// Card identification — pure-JS perceptual-hash matcher (Stage-2).
//
// The on-device scanner is a two-stage pipeline:
//   Stage-1 (lib/cardDetect) → detect the card quad + perspective-rectify it to a
//            front-on crop (native: vision-camera + fast-opencv).
//   Stage-2 (this module)     → 24-bit RGB average hash of that crop + hamming
//            search against PHASHES (hashes.json). Pure JS — no native deps, runs
//            even in Expo Go (where Stage-1 falls back to the focus-box crop).
//
// Because Stage-1 hands us an already-rectified, front-on image, the hash no
// longer fights perspective/imprecise-crop drift — the failure mode that sank the
// previous (rectify-less) attempt. The printed-code OCR + fine-tuned embedding
// paths from the old lib/ocr.ts are intentionally NOT here; this is the
// lowest-friction Stage-2. See AGENTS.md QoL §12.

import { computeAhash, findTopKMatches, HASH_BITS, type CropRect } from './phash';
import { PHASHES } from '../data/loadIndex';

// 768-bit RGB hash (3 × 16×16) over the cropped ARTWORK (all 768 bits informative).
//
// Discrimination, re-measured 2026-07-16 over the full 4571-hash DB
// (scripts/eval_scanner.py). The previous figures here ("~262 median, ~1 % of
// pairs closer than 100 bits") were wrong: they counted a card's own parallel
// variants — which share the artwork — as "different cards". Scored properly, by
// base code:
//   • nearest DIFFERENT card: min 118, p1 149, median 243 bits
//   • 0 % of cards have another card closer than 100 bits
//
// Device-calibrated 2026-07-15: a confirmed-correct real-camera match landed at
// distance 223, so the floor is 235 (headroom above that one measurement).
// Treat 235 as a *ranking* aid, not a trustworthy accept/reject gate: 38.5 % of
// cards have some other card within 235 bits.
//
// Why a real match is as far out as 223: not a bug. A camera photo differs from
// the official scan in colour balance, gamma, sleeve glare and sensor noise —
// simulated end-to-end that costs ~148 bits on its own (still 97 % top-1). Add
// framing error and it stacks into the marginal zone. Framing is the only lever
// that matters (real photo alone 97 %; real photo + 8 % framing error → 24 %),
// and it CANNOT be recovered here: searching more variants adds noise as fast as
// signal (3 → 5 crop scales measured *worse*, 50 % → 39 %). See B-14 in AGENTS.md.
export const AHASH_MAX_DISTANCE = 235;

/** Min normalised score for a candidate to count (mirror of the distance floor). */
const AHASH_MIN_SCORE = 1 - AHASH_MAX_DISTANCE / HASH_BITS;

/** Parse a variantKey ("OP01-001_p1" or "OP01-001") into { code, suffix }. */
export function parseKey(key: string): { code: string; suffix: string } {
  const i = key.indexOf('_');
  return i === -1 ? { code: key, suffix: '' } : { code: key.slice(0, i), suffix: key.slice(i) };
}

/**
 * Rotations (degrees, clockwise) tried on the native rectified crop.
 *
 * Was [0, 90, 180, 270]. Now 2, because cardDetect.orientCardQuad() resolves the
 * 90°/270° ambiguity geometrically *before* the warp (it re-rolls the corner
 * labels when the quad reads landscape), leaving only "is the card upside down?".
 *
 * This is a deliberate 2x cut in Stage-2 work, and it also *helps* accuracy:
 * every extra variant hashed is another chance for an unrelated card to win by
 * coincidence. Measured — scripts/eval_multicrop.py showed going 3 → 5 crop
 * scales made things WORSE (50% → 39%), i.e. searching more variants adds noise
 * as fast as signal. scripts/eval_rotation.py confirms 2 rotations hold 100%
 * top-1 across 0-90° of hand rotation (true distance 16 → 9 bits vs the 4-rot path).
 */
const NATIVE_ROTATIONS = [0, 180];

/**
 * Return the top-K matches with a normalised [0,1] confidence score
 * (1 − hamming/HASH_BITS), filtered to the AHASH_MAX_DISTANCE floor so that
 * non-cards / blank frames yield nothing. Feeds the scan confirmation sheet.
 *
 * On the native path (no `crop`), tries the 2 remaining orientations (0°/180°)
 * of the rectified crop and keeps each card's best (lowest-distance) result —
 * cardDetect.orientCardQuad() already resolves 90°/270° geometrically before the
 * warp, so only "is the card upside down?" is left. See NATIVE_ROTATIONS above.
 * The focus-box fallback (`crop` given) is a fixed on-screen region the user
 * aligned visually, so it's tried at 0° only.
 *
 * ⚠ This does NOT make the top-ranked candidate reliable on a real device, and
 * fewer rotations is not the fix for that — see B-14 in AGENTS.md: the real
 * constraint is Stage-1's framing accuracy (a real photo alone matches at ~97%,
 * but a real photo + 8% framing error collapses to 24%, and no amount of Stage-2
 * searching recovers it).
 *
 * @param imageUri  rectified crop (native path) or full photo (focus-box path)
 * @param crop      pixel sub-region to hash; omit when the URI is already cropped
 */
export async function matchTopK(
  imageUri: string,
  crop?: CropRect,
  k = 3,
): Promise<Array<{ code: string; suffix: string; score: number }>> {
  try {
    const rotations = crop ? [0] : NATIVE_ROTATIONS;
    const all: Array<{ code: string; suffix: string; distance: number; score: number }> = [];
    for (const rotate of rotations) {
      const hash = await computeAhash(imageUri, crop, rotate);
      for (const { key, distance } of findTopKMatches(hash, PHASHES, k)) {
        all.push({ ...parseKey(key), distance, score: 1 - distance / HASH_BITS });
      }
    }

    const bestByKey = new Map<string, (typeof all)[number]>();
    for (const c of all) {
      const cacheKey = `${c.code}${c.suffix}`;
      const prev = bestByKey.get(cacheKey);
      if (!prev || c.distance < prev.distance) bestByKey.set(cacheKey, c);
    }

    const merged = [...bestByKey.values()].sort((a, b) => a.distance - b.distance).slice(0, k);
    return merged
      .map(({ code, suffix, score }) => ({ code, suffix, score }))
      .filter((c) => c.score >= AHASH_MIN_SCORE);
  } catch {
    return [];
  }
}
