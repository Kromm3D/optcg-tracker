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
// cards is ~262 bits; only ~1 % of pairs are closer than 100 bits. Setting the
// threshold at 150 (≈ 19.5 %) gives camera-quality scans wide berth to match while
// staying well below the discrimination floor. Never device-tested — recalibrate if
// false positives appear (lower it) or good scans miss (raise toward 200).
export const AHASH_MAX_DISTANCE = 150;

/** Min normalised score for a candidate to count (mirror of the distance floor). */
const AHASH_MIN_SCORE = 1 - AHASH_MAX_DISTANCE / HASH_BITS;

/** Parse a variantKey ("OP01-001_p1" or "OP01-001") into { code, suffix }. */
export function parseKey(key: string): { code: string; suffix: string } {
  const i = key.indexOf('_');
  return i === -1 ? { code: key, suffix: '' } : { code: key.slice(0, i), suffix: key.slice(i) };
}

/**
 * Return the top-K matches with a normalised [0,1] confidence score
 * (1 − hamming/HASH_BITS), filtered to the AHASH_MAX_DISTANCE floor so that
 * non-cards / blank frames yield nothing. Feeds the scan confirmation sheet.
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
    const hash = await computeAhash(imageUri, crop);
    return findTopKMatches(hash, PHASHES, k)
      .map(({ key, distance }) => ({
        ...parseKey(key),
        score: 1 - distance / HASH_BITS,
      }))
      .filter((c) => c.score >= AHASH_MIN_SCORE);
  } catch {
    return [];
  }
}
