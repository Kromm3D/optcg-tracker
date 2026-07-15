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
// Off-device discrimination: median nearest-neighbour distance between different
// cards is ~262 bits; only ~1 % of pairs are closer than 100 bits.
//
// Device-calibrated 2026-07-15 (see B-14 in AGENTS.md): the old 150 floor was
// never device-tested and was too strict — a confirmed-correct real-camera
// match (rotation-corrected, good lighting) landed at distance 223. Raised to
// 235 (small headroom above that one measurement, still comfortably under the
// ~262 different-card separation). NOTE: this does not fully solve false
// positives — a "wrong" rectified-crop orientation can coincidentally score
// ~206-209 against some unrelated card, i.e. *better* than a real match's 223,
// so raising this floor alone doesn't guarantee the top-ranked candidate is
// correct. See B-14's "remaining work" note for the discrimination problem
// this doesn't yet solve (frame-to-frame consistency is the likely fix).
export const AHASH_MAX_DISTANCE = 235;

/** Min normalised score for a candidate to count (mirror of the distance floor). */
const AHASH_MIN_SCORE = 1 - AHASH_MAX_DISTANCE / HASH_BITS;

/** Parse a variantKey ("OP01-001_p1" or "OP01-001") into { code, suffix }. */
export function parseKey(key: string): { code: string; suffix: string } {
  const i = key.indexOf('_');
  return i === -1 ? { code: key, suffix: '' } : { code: key.slice(0, i), suffix: key.slice(i) };
}

/** Rotations (degrees, clockwise) tried on the native rectified crop — see B-14:
 * detect+rectify doesn't know which quad corner is the card's actual "top", so
 * the crop can come out rotated. Cheap to try all 4 since hashing is fast. */
const NATIVE_ROTATIONS = [0, 90, 180, 270];

/**
 * Return the top-K matches with a normalised [0,1] confidence score
 * (1 − hamming/HASH_BITS), filtered to the AHASH_MAX_DISTANCE floor so that
 * non-cards / blank frames yield nothing. Feeds the scan confirmation sheet.
 *
 * On the native path (no `crop`), tries all 4 orientations of the rectified
 * crop and keeps each card's best (lowest-distance) result across rotations —
 * device-verified to correctly recover the true card when the rectified crop
 * comes out sideways (B-14). NOT fully robust yet, though: a wrong-orientation
 * crop can coincidentally score *better* against some unrelated card than the
 * true match scores against the real one (measured ~206-209 vs 223 in one
 * session), so this can still surface the wrong top-ranked candidate — see the
 * AHASH_MAX_DISTANCE comment and B-14 in AGENTS.md. The focus-box fallback
 * (`crop` given) is already a fixed on-screen region the user aligned
 * visually, so it's tried at 0° only.
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
