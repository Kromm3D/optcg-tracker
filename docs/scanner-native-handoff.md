# Scanner — Stage-1 native detection handoff

This is the **device-side** half of the scanner overhaul. Stage-2 (24-bit RGB
hash + variant-confirmation sheet) already shipped and works today, including in
Expo Go. Stage-1 (find & rectify the card before identifying it — ManaBox-style)
needs a **custom dev build** and an Android device, so it lives here as a
ready-to-build package rather than committed-but-unbuildable code.

The detection logic + geometry + availability guard are already in
[`app/src/lib/cardDetect.ts`](../app/src/lib/cardDetect.ts) (dormant: nothing
imports it yet, so it's out of the Metro bundle and `npm run typecheck` stays
green). This doc is the wiring around it.

---

## 1. Install the native deps (VisionCamera v4 — matches fast-opencv's docs)

```bash
cd app
npm install \
  react-native-vision-camera@^4 \
  react-native-worklets-core \
  vision-camera-resize-plugin \
  react-native-fast-opencv
```

> We pin **VisionCamera v4** deliberately: `react-native-fast-opencv`'s
> documented integration (`useSkiaFrameProcessor` / `useFrameProcessor` +
> `react-native-worklets-core` + `vision-camera-resize-plugin`) targets v4. v5's
> new `CameraFrameOutput` model is unproven with fast-opencv. First confirm v4
> autolinks on this repo's RN 0.85 / React 19.2 — if it balks, that's the first
> thing to debug on-device.

## 2. app.json config plugins + camera permission

```jsonc
{
  "expo": {
    "plugins": [
      ["react-native-vision-camera", {
        "cameraPermissionText": "HoroHoro.tcg needs the camera to scan your cards."
      }]
    ]
  }
}
```

Then rebuild the native project:

```bash
npx expo prebuild --clean
npm run android   # custom dev build (ONNX + OCR already require this)
```

## 3. Babel — worklets plugin

`react-native-worklets-core` needs its Babel plugin. In `app/babel.config.js`
(create if missing) add it **last**:

```js
module.exports = {
  presets: ['babel-preset-expo'],
  plugins: ['react-native-worklets-core/plugin'],
};
```

## 4. Add the rectify worklet to `cardDetect.ts`

`detectCardQuad()` is already implemented. Add the perspective-warp companion
(the `RectifyFn` type is already exported). Append to `cardDetect.ts`:

```ts
// @ts-ignore — native dep
import { OpenCV as CV, ObjectType as OT, DataTypes } from 'react-native-fast-opencv';

export const rectifyCardCrop: RectifyFn = (resized, quad) => {
  'worklet';
  const src = CV.frameBufferToMat(resized.height, resized.width, 3, resized.data);

  // Source corners (TL,TR,BR,BL) → destination upright rectangle.
  const srcPts = CV.createObject(OT.PointVector,
    CV.createObject(OT.Point, quad[0].x, quad[0].y),
    CV.createObject(OT.Point, quad[1].x, quad[1].y),
    CV.createObject(OT.Point, quad[2].x, quad[2].y),
    CV.createObject(OT.Point, quad[3].x, quad[3].y),
  );
  const dstPts = CV.createObject(OT.PointVector,
    CV.createObject(OT.Point, 0, 0),
    CV.createObject(OT.Point, RECTIFIED_W, 0),
    CV.createObject(OT.Point, RECTIFIED_W, RECTIFIED_H),
    CV.createObject(OT.Point, 0, RECTIFIED_H),
  );

  const M = CV.invoke('getPerspectiveTransform', srcPts, dstPts);
  const out = CV.createObject(OT.Mat, RECTIFIED_H, RECTIFIED_W, DataTypes.CV_8UC3);
  const size = CV.createObject(OT.Size, RECTIFIED_W, RECTIFIED_H);
  CV.invoke('warpPerspective', src, out, M, size);

  const base64 = CV.toJSValue(out, 'png').base64; // or OpenCV.matToBuffer
  CV.clearBuffers();
  return base64 ? `data:image/png;base64,${base64}` : null;
};
```

> ⚠ Verify `getPerspectiveTransform` / `warpPerspective` / `toJSValue(..,'png')`
> signatures against the installed fast-opencv version — these have drifted
> across releases. The
> [document-detection example](https://lukaszkurantdev.github.io/react-native-fast-opencv/examples/realtimedetection)
> is the reference.

## 5. Wire the native path into `ScanScreen.tsx`

Render the VisionCamera `<Camera>` with a frame processor **only when**
`isCardDetectAvailable()`; otherwise keep the existing `expo-camera` focus-box
polling path (already in the file — do not delete it; it's the Expo Go fallback).

```tsx
import { Camera, useCameraDevice, useFrameProcessor } from 'react-native-vision-camera';
import { useResizePlugin } from 'vision-camera-resize-plugin';
import { Worklets } from 'react-native-worklets-core';
import { detectCardQuad, rectifyCardCrop, isCardDetectAvailable, type Quad } from '../lib/cardDetect';

// inside the component:
const device = useCameraDevice('back');
const { resize } = useResizePlugin();

// quad → React state for the SVG overlay (runs on JS thread)
const onQuad = Worklets.createRunOnJS((q: Quad | null) => setQuad(q));
// stable quad → rectify off-thread → identify
const onStable = Worklets.createRunOnJS(async (uri: string) => {
  const results = await matchTopK(uri, undefined, 3); // crop already rectified
  if (results.length) handleScanResults(results);
});

const frameProcessor = useFrameProcessor((frame) => {
  'worklet';
  const resized = resize(frame, {
    scale: { width: 480, height: 640 },
    pixelFormat: 'bgr',
    dataType: 'uint8',
  });
  const quad = detectCardQuad({ data: resized, width: 480, height: 640 });
  onQuad(quad);
  if (quad) {
    // throttle: only rectify+identify when the quad has been stable ~300ms
    // (track previous quad + timestamp in a worklet shared value)
    const uri = rectifyCardCrop({ data: resized, width: 480, height: 640 }, quad);
    if (uri) onStable(uri);
  }
}, [resize]);

// render:
{isCardDetectAvailable() && device ? (
  <Camera style={StyleSheet.absoluteFill} device={device} isActive={isFocused}
          frameProcessor={frameProcessor} pixelFormat="yuv" />
) : (
  /* existing <CameraView> focus-box fallback */
)}
```

Replace the static `focusBox`/corner overlay with an SVG `<Polygon>` driven by
`quad` (scale resized→screen coords). When `quad` is null, show the
"point at a card" hint.

> Note: when the native path supplies an **already-rectified** crop to
> `matchTopK`, pass `crop = undefined` (don't re-crop). The existing focus-box
> path keeps passing its crop rect. `matchTopK` / `handleScanResults` /
> `confirmCandidate` are unchanged and already handle both.

## 6. Throttle identification

Keep a worklet shared value with the last quad + timestamp. Only call
`rectifyCardCrop` + `onStable` when the new quad's corners are within ~12 px of
the previous for ≥300 ms. This replaces the old blunt 1.5 s `setInterval` and
avoids hammering the identifier on every frame. The 800 ms `lastScan` debounce in
`handleCodeFound` still guards the add-to-collection step.

---

## 7. Build + on-device verification (plan steps 2–5)

1. `npm run typecheck` — clean.
2. `npm run android` on a device → `isCardDetectAvailable()` is `true`. Point at a
   card on a cluttered desk at ~20–30° tilt: the polygon overlay tracks the card,
   the crop rectifies upright, identification returns the right card. Test glare
   and a sleeved card (ManaBox's known hard cases).
3. Same-art reprint (a card with `_p1`/alt printings): the top-K sheet appears and
   the chosen variant is the one added (`adjust` writes `${code}${suffix}`).
4. **Expo Go regression**: in Expo Go, detection is off; the focus-box RGB-ahash
   path still scans. Graceful degradation intact.
5. Spot-check ~20 cards across sets. Tune the cosine threshold
   (`MATCH_THRESHOLD`, `app/src/lib/embeddings.ts`) and the auto-confirm margin
   (`AUTO_CONFIRM_MARGIN`, `ScanScreen.tsx`).

## Fallback if OpenCV contour detection underperforms

The architecture (detect → rectify → identify) is detector-agnostic. If classic
contours prove flaky in the wild, swap `detectCardQuad` for the Pokémon-scanner
**YOLO11n-OBB** approach (synthetic-data trained, exported to ONNX, run via the
already-installed `onnxruntime-react-native`). Stage-2 and the rectify/identify
tail stay exactly as-is.
