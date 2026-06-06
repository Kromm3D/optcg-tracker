// Stage-1 card detection — find & rectify the card in a live camera frame.
//
// ManaBox-style classic CV: grayscale → blur → Canny → contours → largest
// 4-point quad ≈ a 5:7 card → perspective-warp to an upright crop. The rectified
// crop then feeds the existing identifier (matchTopK in lib/ocr.ts).
//
// ⚠ NATIVE — requires a custom dev build with:
//     react-native-vision-camera@^4  react-native-worklets-core
//     vision-camera-resize-plugin    react-native-fast-opencv
//   See docs/scanner-native-handoff.md for the exact install, app.json plugins,
//   the ScanScreen <Camera> wiring, and the on-device build/verify steps.
//
// This module is intentionally NOT imported anywhere yet: it stays dormant (and
// out of the Metro bundle) until ScanScreen is wired per the handoff. It is kept
// typecheck-green without the native deps via the guarded import below — exactly
// the lazy-dependency contract used by lib/ocr.ts and lib/onnx.ts.

import { NativeModules } from 'react-native';

// @ts-ignore — optional native dep; resolved only in the custom dev build.
import { OpenCV, ObjectType, ColorConversionCodes, RetrievalModes, ContourApproximationModes } from 'react-native-fast-opencv';

// ── Availability guard (mirrors isOcrAvailable / isOnnxAvailable) ────────────
/** True when the fast-opencv native module is linked (custom dev build only). */
export function isCardDetectAvailable(): boolean {
  // fast-opencv registers a JSI/Nitro module; absent in Expo Go.
  return !!(NativeModules as any).FastOpencv || !!(globalThis as any).__OpenCVProxy;
}

// ── Geometry (pure TS — unit-testable, no native) ────────────────────────────

export type Point = { x: number; y: number };
export type Quad = [Point, Point, Point, Point];

/** OPTCG cards are ~63×88 mm → 0.716 aspect. Accept a tolerant band. */
const CARD_ASPECT = 63 / 88;
const ASPECT_TOL = 0.18;

/** Order 4 points as [top-left, top-right, bottom-right, bottom-left]. */
export function orderCorners(pts: Point[]): Quad {
  const bySum = [...pts].sort((a, b) => a.x + a.y - (b.x + b.y));
  const byDiff = [...pts].sort((a, b) => a.y - a.x - (b.y - b.x));
  const tl = bySum[0];
  const br = bySum[bySum.length - 1];
  const tr = byDiff[0];
  const bl = byDiff[byDiff.length - 1];
  return [tl, tr, br, bl];
}

function dist(a: Point, b: Point): number {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

/** Shoelace area of a quad. */
export function quadArea(q: Quad): number {
  let area = 0;
  for (let i = 0; i < 4; i++) {
    const a = q[i];
    const b = q[(i + 1) % 4];
    area += a.x * b.y - b.x * a.y;
  }
  return Math.abs(area) / 2;
}

/**
 * Validate a quad looks like a card: convex-ish, big enough, ~5:7 aspect.
 * `frameArea` is the area of the (resized) frame the contour came from.
 */
export function isCardQuad(q: Quad, frameArea: number): boolean {
  const area = quadArea(q);
  if (area < frameArea * 0.08) return false; // too small / spurious
  const w = (dist(q[0], q[1]) + dist(q[3], q[2])) / 2; // avg top/bottom edge
  const h = (dist(q[0], q[3]) + dist(q[1], q[2])) / 2; // avg left/right edge
  if (w === 0 || h === 0) return false;
  const aspect = Math.min(w, h) / Math.max(w, h);
  return Math.abs(aspect - CARD_ASPECT) <= ASPECT_TOL;
}

// ── Detection worklet ─────────────────────────────────────────────────────────
// Runs on the vision-camera worklet runtime. `resized` is the downscaled BGR
// uint8 buffer from vision-camera-resize-plugin (small → fast Canny/contours).
//
// Returns the card quad in RESIZED coordinates (caller scales back to frame /
// screen space for the overlay and the warp). Returns null when no card found.
//
// ⚠ Verify the exact fast-opencv signatures against the installed version — the
// invoke() argument order has shifted between releases. Cross-check with
// docs/scanner-native-handoff.md (kept in sync with the document-scanner example).
export function detectCardQuad(resized: {
  data: Uint8Array;
  width: number;
  height: number;
}): Quad | null {
  'worklet';
  const { data, width, height } = resized;

  const src = OpenCV.frameBufferToMat(height, width, 3, data);
  const gray = OpenCV.createObject(ObjectType.Mat, 0, 0, OpenCV.DataTypes?.CV_8U ?? 0);
  const edges = OpenCV.createObject(ObjectType.Mat, 0, 0, OpenCV.DataTypes?.CV_8U ?? 0);

  OpenCV.invoke('cvtColor', src, gray, ColorConversionCodes.COLOR_BGR2GRAY);
  const blurSize = OpenCV.createObject(ObjectType.Size, 5, 5);
  OpenCV.invoke('GaussianBlur', gray, gray, blurSize, 0);
  OpenCV.invoke('Canny', gray, edges, 60, 180);

  const contours = OpenCV.createObject(ObjectType.MatVector);
  OpenCV.invoke(
    'findContours',
    edges,
    contours,
    RetrievalModes.RETR_EXTERNAL,
    ContourApproximationModes.CHAIN_APPROX_SIMPLE,
  );

  const frameArea = width * height;
  let best: Quad | null = null;
  let bestArea = 0;

  const list = OpenCV.toJSValue(contours);
  const count: number = list?.array?.length ?? 0;
  for (let i = 0; i < count; i++) {
    const contour = OpenCV.copyObjectFromVector(contours, i);
    const peri = OpenCV.invoke('arcLength', contour, true);
    const approx = OpenCV.createObject(ObjectType.PointVector);
    OpenCV.invoke('approxPolyDP', contour, approx, 0.02 * peri, true);

    const poly = OpenCV.toJSValue(approx);
    const pts: Point[] = poly?.array ?? [];
    if (pts.length === 4) {
      const quad = orderCorners(pts);
      const area = quadArea(quad);
      if (area > bestArea && isCardQuad(quad, frameArea)) {
        best = quad;
        bestArea = area;
      }
    }
  }

  OpenCV.clearBuffers(); // critical: free Mats every frame
  return best;
}

/** Target size for the rectified card crop fed to the identifier. */
export const RECTIFIED_W = 350;
export const RECTIFIED_H = 490; // 5:7

/**
 * Warp the detected quad to an upright RECTIFIED_W×RECTIFIED_H crop and return it
 * as a base64 PNG that computeAhash / computeEmbedding can consume directly.
 * Implemented in the handoff (uses getPerspectiveTransform + warpPerspective +
 * imencode); kept declared here so callers can be typed against the final API.
 */
export type RectifyFn = (
  resized: { data: Uint8Array; width: number; height: number },
  quad: Quad,
) => string | null;
