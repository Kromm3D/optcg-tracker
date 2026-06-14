// Web stub for lib/cardDetect.
//
// The real cardDetect.ts statically references react-native-fast-opencv via
// `'worklet'` functions. The react-native-worklets-core babel plugin builds each
// worklet's closure at MODULE-EVAL time, dereferencing `OpenCV.frameBufferToMat`
// (and friends) — which is null on web → the whole bundle throws before React
// mounts (blank page). Metro prefers this `.web.ts` on the web platform, so none
// of that native/worklet code is ever loaded in the browser.
//
// Mirrors the native-only contract documented in cardDetect.ts: on web the
// scanner degrades to the manual code-lookup path (isCardDetectAvailable → false).

export type Point = { x: number; y: number };
export type Quad = [Point, Point, Point, Point];
export type RectifyFn = (
  resized: { data: Uint8Array; width: number; height: number },
  quad: Quad,
) => string | null;

/** Native detection is never available on web. */
export function isCardDetectAvailable(): boolean {
  return false;
}

export const RECTIFIED_W = 350;
export const RECTIFIED_H = 490;

// No-op stubs — never called on web (guarded by isCardDetectAvailable()).
export function detectCardQuad(): Quad | null {
  return null;
}

export const rectifyCardCrop: RectifyFn = () => null;
