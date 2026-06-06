// ONNX Runtime wrapper — MobileNetV2 + PCA card-art embedding.
//
// Pipeline (per scan):
//   expo-image-manipulator  → crop focus box + resize to 224×224 → base64 PNG
//   decodePng (from phash)  → pixel array
//   ImageNet normalization  → Float32Array in CHW layout
//   ONNX inference          → 64-dim L2-normalised embedding
//
// The model file (app/assets/model.onnx, ~2.4 MB) is loaded once and cached.
// Requires a custom dev build (npx expo run:android) — OnnxRuntime is a native module.

import * as ImageManipulator from 'expo-image-manipulator';
import { Asset } from 'expo-asset';
import { NativeModules } from 'react-native';
import type { CropRect } from './phash';

// Re-export the base64 decode + PNG decode utilities from phash
// so we don't duplicate the ~200-line decoder.
// The import below pulls only the non-exported helpers; we duplicate the
// small pixel-extraction piece inline to keep this file self-contained.

// ── ImageNet normalisation constants ────────────────────────────────────────
const MEAN = [0.485, 0.456, 0.406]; // RGB
const STD  = [0.229, 0.224, 0.225];
const INPUT_SIZE = 224;

// ── Module state ─────────────────────────────────────────────────────────────
let session: any | null = null;
let loadAttempted = false;

async function getSession(): Promise<any | null> {
  if (loadAttempted) return session;
  loadAttempted = true;
  // Guard against JSI init crash in Expo Go — NativeModules access is always safe
  if (!NativeModules.OnnxRuntime) {
    session = null;
    return null;
  }
  try {
    const { InferenceSession } = require('onnxruntime-react-native') as typeof import('onnxruntime-react-native');

    // Resolve the bundled model asset to a local file URI
    const assets = await Asset.loadAsync(require('../../assets/model.onnx'));
    const modelUri = assets[0].localUri;
    if (!modelUri) throw new Error('model asset not resolved');

    session = await InferenceSession.create(modelUri);
    return session;
  } catch (e) {
    // Native module absent (Expo Go) or model missing — degrade gracefully
    session = null;
    return null;
  }
}

/** True when the ONNX runtime and model are available. */
export async function isOnnxAvailable(): Promise<boolean> {
  return (await getSession()) !== null;
}

// ── Base64 decode ─────────────────────────────────────────────────────────────
function base64ToBytes(b64: string): Uint8Array {
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

// ── Minimal PNG unfilter (same algorithm as phash.ts) ────────────────────────
// Only supports 8-bit RGB / RGBA PNGs produced by expo-image-manipulator.
function paeth(a: number, b: number, c: number): number {
  const p = a + b - c;
  const pa = Math.abs(p - a), pb = Math.abs(p - b), pc = Math.abs(p - c);
  return (pa <= pb && pa <= pc) ? a : pb <= pc ? b : c;
}

function decompressZlib(data: Uint8Array): Uint8Array {
  // Strip 2-byte zlib header, then run our DEFLATE decoder from phash.ts.
  // To avoid a circular dependency we inline the deflate call via dynamic import.
  // For the tiny 224×224 PNG produced by manipulateAsync this is <200 KB.
  //
  // NOTE: We re-use the same DEFLATE implementation from phash.ts by calling
  // it through the module. This keeps the two files in sync without duplication.
  const { _deflate } = require('./phash') as { _deflate: (d: Uint8Array) => Uint8Array };
  return _deflate(data.slice(2));
}

function decodePngPixels(bytes: Uint8Array): { pixels: Uint8Array; channels: number } {
  // PNG signature check
  const sig = [137, 80, 78, 71, 13, 10, 26, 10];
  for (let i = 0; i < 8; i++) if (bytes[i] !== sig[i]) throw new Error('not a PNG');

  let width = 0, height = 0, bitDepth = 0, colorType = 0;
  const idatChunks: Uint8Array[] = [];
  let offset = 8;
  while (offset < bytes.length) {
    const len = (bytes[offset] << 24 | bytes[offset + 1] << 16 | bytes[offset + 2] << 8 | bytes[offset + 3]) >>> 0;
    const type = String.fromCharCode(bytes[offset + 4], bytes[offset + 5], bytes[offset + 6], bytes[offset + 7]);
    const chunk = bytes.slice(offset + 8, offset + 8 + len);
    if (type === 'IHDR') {
      width = (chunk[0] << 24 | chunk[1] << 16 | chunk[2] << 8 | chunk[3]) >>> 0;
      height = (chunk[4] << 24 | chunk[5] << 16 | chunk[6] << 8 | chunk[7]) >>> 0;
      bitDepth = chunk[8]; colorType = chunk[9];
    } else if (type === 'IDAT') {
      idatChunks.push(chunk);
    } else if (type === 'IEND') break;
    offset += 12 + len;
  }

  const totalLen = idatChunks.reduce((s, c) => s + c.length, 0);
  const compressed = new Uint8Array(totalLen);
  let ci = 0;
  for (const c of idatChunks) { compressed.set(c, ci); ci += c.length; }

  const raw = decompressZlib(compressed);
  const channels = colorType === 0 ? 1 : colorType === 2 ? 3 : colorType === 4 ? 2 : 4;
  const bpp = channels;
  const stride = width * bpp;
  const pixels = new Uint8Array(width * height * channels);
  const prev = new Uint8Array(stride);
  let ri = 0;
  for (let y = 0; y < height; y++) {
    const filter = raw[ri++];
    const row = raw.slice(ri, ri + stride); ri += stride;
    for (let x = 0; x < stride; x++) {
      const a = x >= bpp ? row[x - bpp] : 0;
      const b = prev[x];
      const c = x >= bpp ? prev[x - bpp] : 0;
      let v = row[x];
      if (filter === 1) v = (v + a) & 0xff;
      else if (filter === 2) v = (v + b) & 0xff;
      else if (filter === 3) v = (v + ((a + b) >> 1)) & 0xff;
      else if (filter === 4) v = (v + paeth(a, b, c)) & 0xff;
      row[x] = v;
    }
    pixels.set(row, y * stride);
    prev.set(row);
  }
  return { pixels, channels };
}

// ── Build CHW float32 tensor with ImageNet normalisation ──────────────────────
function buildInputTensor(pixels: Uint8Array, channels: number): Float32Array {
  // pixels is HWC; model expects CHW (C=3, H=224, W=224)
  const n = INPUT_SIZE * INPUT_SIZE;
  const tensor = new Float32Array(3 * n);
  for (let i = 0; i < n; i++) {
    const base = i * channels;
    const r = channels >= 3 ? pixels[base]     : pixels[base];
    const g = channels >= 3 ? pixels[base + 1] : pixels[base];
    const b = channels >= 3 ? pixels[base + 2] : pixels[base];
    tensor[0 * n + i] = (r / 255 - MEAN[0]) / STD[0]; // R channel
    tensor[1 * n + i] = (g / 255 - MEAN[1]) / STD[1]; // G channel
    tensor[2 * n + i] = (b / 255 - MEAN[2]) / STD[2]; // B channel
  }
  return tensor;
}

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Preprocess a photo and run ONNX inference.
 * Returns a 64-dim L2-normalised embedding, or null on failure.
 * Pass `crop` to hash only the focus-box region (in photo pixel coords).
 */
export async function computeEmbedding(
  imageUri: string,
  crop?: CropRect,
): Promise<Float32Array | null> {
  const sess = await getSession();
  if (!sess) return null;

  try {
    // 1. Crop (optional) + resize to 224×224, export as base64 PNG
    const ops: ImageManipulator.Action[] = [];
    if (crop) ops.push({ crop });
    ops.push({ resize: { width: INPUT_SIZE, height: INPUT_SIZE } });

    const result = await ImageManipulator.manipulateAsync(
      imageUri, ops,
      { format: ImageManipulator.SaveFormat.PNG, base64: true },
    );
    if (!result.base64) return null;

    // 2. Decode PNG → HWC pixel array
    const pngBytes = base64ToBytes(result.base64);
    const { pixels, channels } = decodePngPixels(pngBytes);

    // 3. Build CHW float32 tensor with ImageNet normalisation
    const inputData = buildInputTensor(pixels, channels);

    // 4. Run ONNX inference
    const { Tensor } = require('onnxruntime-react-native') as typeof import('onnxruntime-react-native');
    const inputTensor = new Tensor('float32', inputData, [1, 3, INPUT_SIZE, INPUT_SIZE]);
    const feeds = { input: inputTensor };
    const output = await sess.run(feeds);
    const embedding = output['embedding'].data as Float32Array;

    return embedding;
  } catch {
    return null;
  }
}
