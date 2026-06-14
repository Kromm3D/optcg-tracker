// NativeScanCamera — Stage-1 live card detection + rectification (native only).
//
// ⚠ This component is loaded via require() ONLY when isCardDetectAvailable() is
// true (custom dev build with vision-camera + fast-opencv linked). It is never
// imported in Expo Go, so its native imports below never execute there — that is
// the graceful-degradation contract (same lazy pattern as lib/cardDetect /
// lib/ocr). Do NOT static-import this from ScanScreen; require() it behind the
// availability guard.
//
// Pipeline per frame:
//   resize(frame → 480×640 bgr uint8) → detectCardQuad → (overlay corner brackets)
//   → when the quad is stable ~300 ms → rectifyCardCrop → onCardReady(uri)
// ScanScreen owns identification (matchTopK) + the confirmation flow.

import React, { forwardRef, useImperativeHandle, useState } from 'react';
import { StyleSheet, Text, useWindowDimensions, View } from 'react-native';

// @ts-ignore — native deps; resolved only in the custom dev build.
import { Camera, useCameraDevice, useFrameProcessor } from 'react-native-vision-camera';
// @ts-ignore
import { useResizePlugin } from 'vision-camera-resize-plugin';
// @ts-ignore
import { Worklets, useSharedValue } from 'react-native-worklets-core';

import { detectCardQuad, rectifyCardCrop, type Quad } from '../lib/cardDetect';
import { colors, fonts } from '../theme';

// Detection runs on a downscaled frame — small enough for fast Canny/contours.
const RES_W = 480;
const RES_H = 640;

// Quad is "stable" when its centre stayed within this many resized-px for ≥ the
// dwell time below; only then do we rectify + identify (avoids hammering Stage-2).
const STABLE_PX = 14;
const STABLE_MS = 300;

// Size of each L-shaped corner bracket drawn at the card corners.
const BRACKET_LEN = 22;
const BRACKET_W   = 3;
const BRACKET_R   = 4;

type Props = {
  /** Camera runs only while true (screen focused + no sheet open). */
  isActive: boolean;
  /** Receives the rectified card crop as a base64 PNG data-URI. */
  onCardReady: (uri: string) => void;
  /** Called whenever card detection state changes (true = quad visible). */
  onQuadChange?: (detected: boolean) => void;
};

/** Imperative handle exposed to ScanScreen via ref. */
export type NativeScanCameraHandle = {
  /**
   * Force-rectify the next camera frame that contains a detectable card quad,
   * bypassing the stability dwell. Call this when the user presses the shutter
   * manually. If no quad is visible the flag clears automatically on the next
   * frameless cycle.
   */
  triggerCapture: () => void;
};

export const NativeScanCamera = forwardRef<NativeScanCameraHandle, Props>(
function NativeScanCamera({ isActive, onCardReady, onQuadChange }, ref) {
  const { width: screenW, height: screenH } = useWindowDimensions();
  const device = useCameraDevice('back');
  const { resize } = useResizePlugin();
  const [quad, setQuad] = useState<Quad | null>(null);

  // Worklet-shared throttle state (last quad centre + timestamp).
  const lastTs       = useSharedValue(0);
  const lastX        = useSharedValue(0);
  const lastY        = useSharedValue(0);
  // Set to true by triggerCapture() so the next frame with any quad fires immediately.
  const forceCapture = useSharedValue(false);

  useImperativeHandle(ref, () => ({
    triggerCapture: () => { forceCapture.value = true; },
  }), [forceCapture]);

  const onQuad   = Worklets.createRunOnJS((q: Quad | null) => {
    setQuad(q);
    onQuadChange?.(q != null);
  });
  const onStable = Worklets.createRunOnJS((uri: string) => onCardReady(uri));

  const frameProcessor = useFrameProcessor(
    (frame: any) => {
      'worklet';
      const resized = resize(frame, {
        scale: { width: RES_W, height: RES_H },
        pixelFormat: 'bgr',
        dataType: 'uint8',
      });
      const buf = { data: resized as Uint8Array, width: RES_W, height: RES_H };
      const q = detectCardQuad(buf);
      onQuad(q);
      if (!q) {
        lastTs.value = 0;
        forceCapture.value = false; // clear flag if card leaves frame
        return;
      }

      // Quad centre → stability check.
      const cx = (q[0].x + q[1].x + q[2].x + q[3].x) / 4;
      const cy = (q[0].y + q[1].y + q[2].y + q[3].y) / 4;
      const now = Date.now();
      const moved =
        Math.abs(cx - lastX.value) > STABLE_PX ||
        Math.abs(cy - lastY.value) > STABLE_PX;

      if (moved || lastTs.value === 0) {
        lastX.value = cx;
        lastY.value = cy;
        lastTs.value = now;
        // Shutter pressed: fire even on a freshly-detected / still-moving quad.
        if (forceCapture.value) {
          forceCapture.value = false;
          const uri = rectifyCardCrop(buf, q);
          lastTs.value = now + 500;
          if (uri) onStable(uri);
        }
        return;
      }

      // Natural stability reached OR user pressed shutter on an already-steady quad.
      if (forceCapture.value || now - lastTs.value >= STABLE_MS) {
        forceCapture.value = false;
        const uri = rectifyCardCrop(buf, q);
        lastTs.value = now + 500; // brief cooldown so we don't re-fire instantly
        if (uri) onStable(uri);
      }
    },
    [resize, forceCapture],
  );

  if (!device) {
    return (
      <View style={[StyleSheet.absoluteFill, s.noDevice]}>
        <Text style={s.hint}>No camera</Text>
      </View>
    );
  }

  // Scale quad (resized coords) → screen coords for the corner bracket overlay.
  const sx = screenW / RES_W;
  const sy = screenH / RES_H;

  return (
    <View style={StyleSheet.absoluteFill}>
      <Camera
        style={StyleSheet.absoluteFill}
        device={device}
        isActive={isActive}
        frameProcessor={frameProcessor}
        pixelFormat="yuv"
        // Note: no ref needed here — we expose triggerCapture via useImperativeHandle
        // using the forceCapture shared value (worklet-safe, no Camera ref required).
      />

      {/* Corner-bracket markers at each quad corner (tracks the card live). */}
      {quad && quad.map((pt, i) => {
        const sx_ = pt.x * sx;
        const sy_ = pt.y * sy;

        // Determine which corner: 0=TL, 1=TR, 2=BR, 3=BL (from orderCorners).
        const isTL = i === 0;
        const isTR = i === 1;
        const isBR = i === 2;
        const isBL = i === 3;

        return (
          <View
            key={i}
            style={[
              s.bracket,
              {
                left:   sx_ - (isTR || isBR ? BRACKET_LEN : 0),
                top:    sy_ - (isBL || isBR ? BRACKET_LEN : 0),
                borderTopWidth:    isTL || isTR ? BRACKET_W : 0,
                borderBottomWidth: isBL || isBR ? BRACKET_W : 0,
                borderLeftWidth:   isTL || isBL ? BRACKET_W : 0,
                borderRightWidth:  isTR || isBR ? BRACKET_W : 0,
                borderTopLeftRadius:     isTL ? BRACKET_R : 0,
                borderTopRightRadius:    isTR ? BRACKET_R : 0,
                borderBottomRightRadius: isBR ? BRACKET_R : 0,
                borderBottomLeftRadius:  isBL ? BRACKET_R : 0,
              },
            ]}
          />
        );
      })}
    </View>
  );
});

const s = StyleSheet.create({
  noDevice: { alignItems: 'center', justifyContent: 'center', backgroundColor: '#000' },
  hint: { color: colors.textMut, fontFamily: fonts.ui, fontSize: 14 },
  bracket: {
    position: 'absolute',
    width:  BRACKET_LEN,
    height: BRACKET_LEN,
    borderColor: '#ffffff',
  },
});
