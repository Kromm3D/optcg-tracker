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
//   resize(frame → 480×640 bgr uint8) → detectCardQuad → (overlay polygon)
//   → when the quad is stable ~300 ms → rectifyCardCrop → onStableCard(uri)
// ScanScreen owns identification (matchTopK) + the confirmation flow.

import React, { useState } from 'react';
import { StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import Svg, { Polygon } from 'react-native-svg';

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

type Props = {
  /** Camera runs only while true (screen focused + no sheet open). */
  isActive: boolean;
  /** Receives the rectified card crop as a base64 PNG data-URI. */
  onStableCard: (uri: string) => void;
};

export function NativeScanCamera({ isActive, onStableCard }: Props) {
  const { width: screenW, height: screenH } = useWindowDimensions();
  const device = useCameraDevice('back');
  const { resize } = useResizePlugin();
  const [quad, setQuad] = useState<Quad | null>(null);

  // Worklet-shared throttle state (last quad centre + timestamp).
  const lastTs = useSharedValue(0);
  const lastX = useSharedValue(0);
  const lastY = useSharedValue(0);

  const onQuad = Worklets.createRunOnJS((q: Quad | null) => setQuad(q));
  const onStable = Worklets.createRunOnJS((uri: string) => onStableCard(uri));

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
        return;
      }

      // Quad centre → stability check.
      const cx = (q[0].x + q[1].x + q[2].x + q[3].x) / 4;
      const cy = (q[0].y + q[1].y + q[2].y + q[3].y) / 4;
      const now = Date.now();
      const moved = Math.abs(cx - lastX.value) > STABLE_PX || Math.abs(cy - lastY.value) > STABLE_PX;

      if (moved || lastTs.value === 0) {
        lastX.value = cx;
        lastY.value = cy;
        lastTs.value = now;
        return;
      }
      if (now - lastTs.value >= STABLE_MS) {
        const uri = rectifyCardCrop(buf, q);
        lastTs.value = now + 500; // brief cooldown so we don't re-fire instantly
        if (uri) onStable(uri);
      }
    },
    [resize],
  );

  if (!device) {
    return (
      <View style={[StyleSheet.absoluteFill, s.noDevice]}>
        <Text style={s.hint}>No camera</Text>
      </View>
    );
  }

  // Scale the quad (resized coords) → screen coords for the overlay polygon.
  const sx = screenW / RES_W;
  const sy = screenH / RES_H;
  const points = quad
    ? quad.map((p) => `${p.x * sx},${p.y * sy}`).join(' ')
    : null;

  return (
    <View style={StyleSheet.absoluteFill}>
      <Camera
        style={StyleSheet.absoluteFill}
        device={device}
        isActive={isActive}
        frameProcessor={frameProcessor}
        pixelFormat="yuv"
      />
      {points && (
        <Svg style={StyleSheet.absoluteFill} pointerEvents="none">
          <Polygon
            points={points}
            fill="rgba(34,197,94,0.12)"
            stroke="#22c55e"
            strokeWidth={3}
          />
        </Svg>
      )}
    </View>
  );
}

const s = StyleSheet.create({
  noDevice: { alignItems: 'center', justifyContent: 'center', backgroundColor: '#000' },
  hint: { color: colors.textMut, fontFamily: fonts.ui, fontSize: 14 },
});
