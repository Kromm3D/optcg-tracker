// Capture a React view to a PNG and open the OS share sheet. Used to export a
// Wishlist or Trade binder page to send to market groups.
//
// react-native-view-shot and expo-sharing are native modules — only present in
// a custom dev build. Loaded lazily via require() so tsc/Expo Go don't break.

import type React from 'react';

let ViewShot: any | undefined;
let Sharing: any | undefined;
let loaded = false;

function loadModules() {
  if (loaded) return;
  loaded = true;
  try {
    ViewShot = require('react-native-view-shot');
  } catch {
    ViewShot = undefined;
  }
  try {
    Sharing = require('expo-sharing');
  } catch {
    Sharing = undefined;
  }
}

export function isShareAvailable(): boolean {
  loadModules();
  return ViewShot != null && Sharing != null;
}

/**
 * Capture the given ref (a View) to a temporary PNG and present the share sheet.
 * Returns true on success, false if the native modules are unavailable.
 */
export async function captureAndShare(ref: React.RefObject<any>): Promise<boolean> {
  loadModules();
  if (!ViewShot || !Sharing || !ref.current) return false;
  try {
    const uri: string = await ViewShot.captureRef(ref, {
      format: 'png',
      quality: 1,
      result: 'tmpfile',
    });
    const canShare = await Sharing.isAvailableAsync();
    if (canShare) {
      await Sharing.shareAsync(uri, { mimeType: 'image/png' });
    }
    return true;
  } catch (e) {
    console.warn('[shareImage] capture/share failed:', e);
    return false;
  }
}
