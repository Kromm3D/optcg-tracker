// Pure-JS 24-bit RGB average hash (ahash) computation + hamming-distance search.
// Matches Python's rgb_average_hash in scripts/build_card_database.py.
//
// Pipeline: crop to the card ARTWORK (ART_CROP) → resize to 16×16 via
// expo-image-manipulator → base64 PNG → decode pixels in JS → per-channel mean
// threshold → 3×256-bit hash (R‖G‖B = 192 hex / 768 bits).
//
// We hash only the upper illustration, not the whole card: the bottom of an OPTCG
// card is the language-dependent effect-text box + name plate (noise that hurts
// discrimination), and the central "SAMPLE" watermark on official images falls
// below ART_CROP, so it no longer needs masking. ART_CROP MUST stay in sync with
// ART_CROP in scripts/build_card_database.py.

import * as ImageManipulator from 'expo-image-manipulator';
import { unzlibSync } from 'fflate';

// ── PNG decoder (minimal, inline) ───────────────────────────────────────────
// Handles the tiny RGB/RGBA PNGs that expo-image-manipulator produces. DEFLATE
// decompression is delegated to fflate's unzlibSync (audited, RFC1950/1951-
// correct) — a hand-rolled decoder lived here until 2026-07-13, when on-device
// scanner testing surfaced real "invalid huffman" decode failures on genuine
// 16×16 camera-derived PNGs (traced + confirmed against Node's zlib as a bad
// Huffman-table reconstruction in the homegrown decoder, not a data problem).
// Only the chunk-walking / PNG row-unfiltering below is still bespoke.

function base64ToBytes(b64: string): Uint8Array {
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

function decodePng(bytes: Uint8Array): { width: number; height: number; pixels: Uint8Array } {
  // Verify PNG signature
  const sig = [137, 80, 78, 71, 13, 10, 26, 10];
  for (let i = 0; i < 8; i++) if (bytes[i] !== sig[i]) throw new Error('not a PNG');

  let width = 0, height = 0, bitDepth = 0, colorType = 0;
  const idatChunks: Uint8Array[] = [];
  let offset = 8;

  while (offset < bytes.length) {
    const len = (bytes[offset] << 24 | bytes[offset + 1] << 16 | bytes[offset + 2] << 8 | bytes[offset + 3]) >>> 0;
    const type = String.fromCharCode(bytes[offset + 4], bytes[offset + 5], bytes[offset + 6], bytes[offset + 7]);
    const chunkData = bytes.slice(offset + 8, offset + 8 + len);

    if (type === 'IHDR') {
      width = (chunkData[0] << 24 | chunkData[1] << 16 | chunkData[2] << 8 | chunkData[3]) >>> 0;
      height = (chunkData[4] << 24 | chunkData[5] << 16 | chunkData[6] << 8 | chunkData[7]) >>> 0;
      bitDepth = chunkData[8];
      colorType = chunkData[9];
    } else if (type === 'IDAT') {
      idatChunks.push(chunkData);
    } else if (type === 'IEND') {
      break;
    }
    offset += 12 + len;
  }

  // Concatenate IDAT chunks (a full zlib/RFC1950 stream: 2-byte header +
  // DEFLATE data + 4-byte Adler32 trailer — unzlibSync wants it intact).
  const totalLen = idatChunks.reduce((s, c) => s + c.length, 0);
  const compressed = new Uint8Array(totalLen);
  let ci = 0;
  for (const chunk of idatChunks) { compressed.set(chunk, ci); ci += chunk.length; }

  const raw = unzlibSync(compressed);

  // channels per color type: 0=gray(1), 2=RGB(3), 4=grayA(2), 6=RGBA(4)
  const channels = colorType === 0 ? 1 : colorType === 2 ? 3 : colorType === 4 ? 2 : 4;
  const bpp = channels * (bitDepth / 8);
  const stride = width * bpp;

  // Unfilter rows (filter byte + pixel data per row)
  const pixels = new Uint8Array(width * height * channels);
  const prev = new Uint8Array(stride);
  let ri = 0;
  for (let y = 0; y < height; y++) {
    const filter = raw[ri++];
    const row = raw.slice(ri, ri + stride);
    ri += stride;

    for (let x = 0; x < stride; x++) {
      const a = x >= bpp ? row[x - bpp] : 0;
      const b = prev[x];
      const c = x >= bpp ? prev[x - bpp] : 0;
      let val = row[x];
      if (filter === 1) val = (val + a) & 0xff;
      else if (filter === 2) val = (val + b) & 0xff;
      else if (filter === 3) val = (val + ((a + b) >> 1)) & 0xff;
      else if (filter === 4) val = (val + paeth(a, b, c)) & 0xff;
      row[x] = val;
    }
    pixels.set(row, y * stride);
    prev.set(row);
  }

  return { width, height, pixels };
}

function paeth(a: number, b: number, c: number): number {
  const p = a + b - c;
  const pa = Math.abs(p - a), pb = Math.abs(p - b), pc = Math.abs(p - c);
  if (pa <= pb && pa <= pc) return a;
  if (pb <= pc) return b;
  return c;
}

// Extract a single channel (0=R, 1=G, 2=B) from HWC pixel data as a flat array.
// Grayscale sources (1/2 channels) replicate the lone luminance channel.
function extractChannel(pixels: Uint8Array, channels: number, ch: number): number[] {
  const out: number[] = [];
  const src = channels >= 3 ? ch : 0;
  for (let i = 0; i < pixels.length; i += channels) out.push(pixels[i + src]);
  return out;
}

// Per-channel min-max normalization: stretch values to [0, 255] so the hash is
// brightness/contrast-invariant. MUST match _channel_average_hash_masked() in
// scripts/build_card_database.py (applied after resize, before mean threshold).
function normalizeChannel(values: number[]): number[] {
  let min = 255, max = 0;
  for (const v of values) {
    if (v < min) min = v;
    if (v > max) max = v;
  }
  if (max === min) return values; // flat channel → all bits 0
  const range = max - min;
  return values.map((v) => Math.round(((v - min) * 255) / range));
}

// Average-hash one channel: mean threshold → hex string (same nibble packing as
// imagehash.average_hash, so it matches the Python side bit-for-bit).
// Cells inside the masked SAMPLE band (see MASKED_INDEX) are excluded from the
// mean and forced to bit 0, so they contribute 0 to every hamming distance —
// the same masking is applied in scripts/build_card_database.py.
function channelHash(values: number[]): string {
  values = normalizeChannel(values);
  let sum = 0;
  let count = 0;
  for (let i = 0; i < values.length; i++) {
    if (MASKED_INDEX.has(i)) continue;
    sum += values[i];
    count++;
  }
  const mean = sum / count;

  let hash = '';
  for (let i = 0; i < values.length; i += 4) {
    let nibble = 0;
    for (let b = 0; b < 4 && i + b < values.length; b++) {
      const idx = i + b;
      if (!MASKED_INDEX.has(idx) && values[idx] > mean) nibble |= (1 << (3 - b));
    }
    hash += nibble.toString(16);
  }
  return hash;
}

// ── Average hash ────────────────────────────────────────────────────────────

const HASH_SIZE = 16; // must match the value used when generating hashes.json

// Pixel dimensions that NativeScanCamera's rectifyCardCrop always produces.
// Used by computeAhash when no pixel `crop` is supplied (native path) so we can
// compute the art-crop rect without an extra manipulateAsync round-trip to read
// image dimensions. Must match RECTIFIED_W / RECTIFIED_H in lib/cardDetect.ts.
const RECTIFIED_W = 350;
const RECTIFIED_H = 490;

// Artwork crop (fractions of the card W/H: [x, y, w, h]). We hash only the upper
// illustration — above the "SAMPLE" watermark and the language-dependent effect
// text. Resolution-independent, so it applies equally to the native rectified crop
// and the focus-box photo region. MUST stay in sync with ART_CROP in
// scripts/build_card_database.py.
const ART_CROP: readonly [number, number, number, number] = [0.05, 0.05, 0.9, 0.38];

// No row mask: the SAMPLE band falls below ART_CROP, so every one of the 768 bits
// is informative. Kept as an (empty) set so the masking machinery in channelHash
// stays intact should a future crop ever re-include the watermark band. MUST stay
// in sync with MASK_ROWS in scripts/build_card_database.py.
const MASK_ROWS: number[] = [];
const MASKED_INDEX: Set<number> = new Set(
  MASK_ROWS.flatMap((r) => Array.from({ length: HASH_SIZE }, (_, c) => r * HASH_SIZE + c)),
);

export interface CropRect { originX: number; originY: number; width: number; height: number; }

/**
 * Compute a 24-bit colour-aware average hash from an image URI: three
 * per-channel 256-bit (16×16) average hashes concatenated as R‖G‖B → 192 hex.
 * The image is first cropped to the card ARTWORK (ART_CROP, applied on top of the
 * optional pixel `crop`) so only the illustration is hashed.
 * Pass `crop` to first restrict to a sub-region (in the image's pixel coords) —
 * used by the focus-box fallback; omit it when the URI is already a rectified card.
 * Matches Python: build_card_database.build_hashes (rgb_average_hash, size=16).
 */
export async function computeAhash(imageUri: string, crop?: CropRect): Promise<string> {
  const [fx, fy, fw, fh] = ART_CROP;

  let workingUri = imageUri;
  let workingW: number;
  let workingH: number;

  if (crop) {
    // Expo Go focus-box path: first crop the photo to the card region, then we know
    // the pixel dimensions of the working image.
    const base = await ImageManipulator.manipulateAsync(
      imageUri,
      [{ crop }],
      { format: ImageManipulator.SaveFormat.PNG },
    );
    workingUri = base.uri;
    workingW   = base.width;
    workingH   = base.height;
  } else {
    // Native path: the URI is already a RECTIFIED_W × RECTIFIED_H PNG from
    // rectifyCardCrop. Use the known constants to avoid an extra round-trip.
    workingW = RECTIFIED_W;
    workingH = RECTIFIED_H;
  }

  // Crop to the artwork region, then downscale to HASH_SIZE.
  const artCrop: CropRect = {
    originX: Math.round(fx * workingW),
    originY: Math.round(fy * workingH),
    width:   Math.round(fw * workingW),
    height:  Math.round(fh * workingH),
  };

  const result = await ImageManipulator.manipulateAsync(
    workingUri,
    [{ crop: artCrop }, { resize: { width: HASH_SIZE, height: HASH_SIZE } }],
    { format: ImageManipulator.SaveFormat.PNG, base64: true },
  );

  if (!result.base64) throw new Error('no base64 from manipulator');

  const pngBytes = base64ToBytes(result.base64);
  const { pixels, width, height } = decodePng(pngBytes);
  const channels = pixels.length / (width * height);

  // One average hash per RGB plane, concatenated R‖G‖B (192 hex = 768 bits).
  return (
    channelHash(extractChannel(pixels, channels, 0)) +
    channelHash(extractChannel(pixels, channels, 1)) +
    channelHash(extractChannel(pixels, channels, 2))
  );
}

// ── Hamming distance ────────────────────────────────────────────────────────

export function hammingDistance(a: string, b: string): number {
  let dist = 0;
  const len = Math.min(a.length, b.length);
  for (let i = 0; i < len; i++) {
    let xor = parseInt(a[i], 16) ^ parseInt(b[i], 16);
    while (xor) { dist += xor & 1; xor >>= 1; }
  }
  return dist;
}

// ── Best-match search ───────────────────────────────────────────────────────

const MAX_DISTANCE_DEFAULT = 10;

export function findBestMatch(
  queryHash: string,
  hashDb: Record<string, string>,
  maxDistance = MAX_DISTANCE_DEFAULT,
): { key: string; distance: number } | null {
  let bestKey: string | null = null;
  let bestDist = maxDistance + 1;

  for (const key in hashDb) {
    const d = hammingDistance(queryHash, hashDb[key]);
    if (d < bestDist) {
      bestDist = d;
      bestKey = key;
      if (d === 0) break;
    }
  }

  return bestKey !== null && bestDist <= maxDistance
    ? { key: bestKey, distance: bestDist }
    : null;
}

/**
 * Return the K closest hashes by hamming distance (ascending), regardless of
 * threshold. Used to populate the scan confirmation sheet when ONNX is absent.
 * `bits` is the hash length in bits (default 768 = 24-bit RGB at 16×16) so
 * callers can derive a normalised [0,1] score = 1 − distance/bits.
 */
export function findTopKMatches(
  queryHash: string,
  hashDb: Record<string, string>,
  k = 3,
): Array<{ key: string; distance: number }> {
  const all: Array<{ key: string; distance: number }> = [];
  for (const key in hashDb) {
    all.push({ key, distance: hammingDistance(queryHash, hashDb[key]) });
  }
  all.sort((a, b) => a.distance - b.distance);
  return all.slice(0, k);
}

/**
 * Number of *informative* bits in the RGB average-hash for score normalisation.
 * The format is 3 × 16 × 16 = 768 bits. With the artwork crop the SAMPLE band is
 * excluded by ART_CROP rather than masked, so MASK_ROWS is empty and all 768 bits
 * carry signal. Effective bits = 768.
 */
export const HASH_BITS = 768;
