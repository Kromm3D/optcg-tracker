// Web stub — NativeScanCamera requires vision-camera + fast-opencv (native only).
// Metro prefers .web.tsx on the web platform so the native imports never load.
import React, { forwardRef } from 'react';

export type NativeScanCameraHandle = { triggerCapture: () => void };

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const NativeScanCamera = forwardRef<NativeScanCameraHandle, any>(
  function NativeScanCamera(_props, _ref) {
    return null;
  },
);
