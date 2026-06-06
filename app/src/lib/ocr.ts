// OCR + art-matching wrapper.
//
// Three scanning strategies, in order of quality:
//   1. ONNX (best)  — MobileNetV2 neural embedding + cosine similarity.
//                     Requires custom dev build. ~200-400 ms per frame.
//   2. ahash (good) — 256-bit average hash + hamming distance. Pure JS,
//                     works in Expo Go. ~100 ms per frame.
//   3. OCR (legacy) — ML Kit text recognition. Reads printed code directly.

import { computeAhash, findBestMatch, findTopKMatches, HASH_BITS, type CropRect } from './phash';
import { PHASHES } from '../data/loadIndex';
import { computeEmbedding, isOnnxAvailable } from './onnx';
import { findNearestEmbedding, findTopK, MATCH_THRESHOLD } from './embeddings';

let TextRecognition: any | undefined;
let loadAttempted = false;

function getModule(): any | null {
  if (!loadAttempted) {
    loadAttempted = true;
    try {
      // require (not import) so tsc passes even before the dep is installed.
      TextRecognition = require('@react-native-ml-kit/text-recognition').default;
    } catch {
      TextRecognition = undefined;
    }
  }
  return TextRecognition ?? null;
}

/** True when on-device OCR is available (custom dev build with the module). */
export function isOcrAvailable(): boolean {
  return getModule() != null;
}

/** Recognize all text in an image; returns the flattened string ('' on failure). */
export async function recognizeText(imageUri: string): Promise<string> {
  const mod = getModule();
  if (!mod) return '';
  try {
    const result = await mod.recognize(imageUri);
    return result?.text ?? '';
  } catch {
    return '';
  }
}

// 768-bit RGB hash (3 × 16×16). Allow ~7.8% of bits to differ.
// Good conditions (card fills focus box, good lighting): expect 0-30 bits off.
// Poor conditions (slight angle, glare): expect 30-60 bits off.
const AHASH_MAX_DISTANCE = 60;

/** Parse a variantKey ("OP01-001_p1" or "OP01-001") into { code, suffix }. */
function parseKey(key: string): { code: string; suffix: string } {
  const i = key.indexOf('_');
  return i === -1 ? { code: key, suffix: '' } : { code: key.slice(0, i), suffix: key.slice(i) };
}

// ── Strategy 1: ONNX neural embedding ────────────────────────────────────────

/**
 * Match using MobileNetV2 embeddings (highest accuracy).
 * Falls back to ahash if ONNX is unavailable.
 * Returns { code, suffix } or null.
 */
export async function matchByArtFull(
  imageUri: string,
  crop?: CropRect,
): Promise<{ code: string; suffix: string } | null> {
  // Try ONNX first
  if (await isOnnxAvailable()) {
    try {
      const emb = await computeEmbedding(imageUri, crop);
      if (emb) {
        const match = findNearestEmbedding(emb);
        if (match) return parseKey(match.key);
      }
    } catch {
      // fall through to ahash
    }
  }

  // ahash fallback
  try {
    const hash = await computeAhash(imageUri, crop);
    const result = findBestMatch(hash, PHASHES, AHASH_MAX_DISTANCE);
    if (!result) return null;
    return parseKey(result.key);
  } catch {
    return null;
  }
}

/**
 * Return top-K matches with confidence scores.
 * Useful for debugging or building a "pick variant" confirmation UI.
 */
export async function matchTopK(
  imageUri: string,
  crop?: CropRect,
  k = 3,
): Promise<Array<{ code: string; suffix: string; score: number }>> {
  if (await isOnnxAvailable()) {
    try {
      const emb = await computeEmbedding(imageUri, crop);
      if (emb) {
        return findTopK(emb, k)
          .map(({ key, score }) => ({ ...parseKey(key), score }))
          .filter((c) => c.score >= MATCH_THRESHOLD);
      }
    } catch {
      // fall through to ahash
    }
  }

  // ahash fallback: hamming distance → normalised [0,1] score for a uniform API.
  // Floor at the same tolerance findBestMatch uses, so non-cards yield nothing.
  const AHASH_MIN_SCORE = 1 - AHASH_MAX_DISTANCE / HASH_BITS;
  try {
    const hash = await computeAhash(imageUri, crop);
    return findTopKMatches(hash, PHASHES, k)
      .map(({ key, distance }) => ({ ...parseKey(key), score: 1 - distance / HASH_BITS }))
      .filter((c) => c.score >= AHASH_MIN_SCORE);
  } catch {
    return [];
  }
}
