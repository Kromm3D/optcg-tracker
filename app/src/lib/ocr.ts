// OCR wrapper. ID-first card scanning runs printed text through ML Kit's
// on-device text recognizer. The native module (@react-native-ml-kit/
// text-recognition) only exists in a custom dev build — never in Expo Go — so
// we load it lazily via require() and degrade gracefully when it's absent.
//
// NOTE: requires `npx expo run:android` (prebuild). Will no-op under Expo Go.

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

/**
 * Deferred (future phase): match a captured card image against the local card
 * art by perceptual hash when the printed ID can't be read. Returns the matched
 * card code, or null. Currently a no-op stub.
 */
export async function matchByArt(_imageUri: string): Promise<string | null> {
  // TODO: compute a perceptual hash of the cropped art region and compare it to
  // precomputed hashes of cached card images (lib/images.ts) to find the closest
  // match. Until then, OCR + manual entry are the only paths.
  return null;
}
