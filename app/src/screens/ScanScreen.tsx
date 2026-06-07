// ScanScreen — on-device card recognition (two-stage, no recurring cost).
//
// Stage-1 (detect + rectify):
//   • Native build → NativeScanCamera (vision-camera + fast-opencv): finds the
//     card quad live and perspective-warps it to a front-on crop. Robust to angle.
//   • Expo Go      → expo-camera focus-box: the user frames the card; we crop it.
// Stage-2 (identify):
//   • lib/cardMatch.matchTopK → 24-bit RGB average hash + hamming search over
//     PHASHES (pure JS). Ambiguous same-art reprints → variant confirmation sheet.
// Plus: expo-haptics success pulse, and a manual code fallback.
//
// The native path is loaded lazily (require) only when isCardDetectAvailable() so
// Expo Go degrades gracefully — same contract as lib/cardDetect / lib/phash.

import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Animated,
  Easing,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  useWindowDimensions,
  View,
} from 'react-native';
import { CameraView, useCameraPermissions } from 'expo-camera';
import { useIsFocused } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as Haptics from 'expo-haptics';
import Svg, { Path, Circle } from 'react-native-svg';

import type { ScanScreenProps } from '../navigation';
import type { Card, Variant } from '../types';
import { CARDS } from '../data/loadIndex';
import { adjust } from '../lib/collection';
import { Icon } from '../components/Icon';
import { CardThumb } from '../components/CardThumb';
import { matchTopK } from '../lib/cardMatch';
import { isCardDetectAvailable } from '../lib/cardDetect';
import { useT } from '../lib/i18n';
import { colors, fonts, radii, spacing } from '../theme';

// Lazily resolved native Stage-1 camera component. Only required in a custom dev
// build with vision-camera + fast-opencv linked; absent (→ null) in Expo Go.
let NativeScanCameraComp: React.ComponentType<{
  isActive: boolean;
  onStableCard: (uri: string) => void;
}> | null = null;
let nativeLoadAttempted = false;
function getNativeScanCamera() {
  if (!nativeLoadAttempted) {
    nativeLoadAttempted = true;
    try {
      NativeScanCameraComp = require('./NativeScanCamera').NativeScanCamera;
    } catch {
      NativeScanCameraComp = null;
    }
  }
  return NativeScanCameraComp;
}

// A scan candidate resolved to its card + exact variant for the confirmation sheet.
type ScanCandidate = { card: Card; variant: Variant; suffix: string; score: number };

// Auto-confirm only when the top match clearly beats the runner-up; otherwise the
// user disambiguates same-art reprints in the sheet (ManaBox-style). Score scale
// differs by path (ONNX cosine vs ahash) so we compare margin, not absolutes.
const AUTO_CONFIRM_MARGIN = 0.05;

// ─── Perona Ghost SVG ────────────────────────────────────────────────────────

function PeronaGhost({ size = 64 }: { size?: number }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 64 64" fill="none">
      {/* body */}
      <Path
        d="M32 6C18 6 10 17 10 28c0 8 3 14 7 18l-3 8 6-4 4 6 4-8 4 8 4-6 6 4-3-8c4-4 7-10 7-18C47 17 46 6 32 6Z"
        fill="#ec4899"
        opacity={0.9}
      />
      {/* eyes */}
      <Circle cx="25" cy="27" r="3.5" fill="#0e0c1a" />
      <Circle cx="39" cy="27" r="3.5" fill="#0e0c1a" />
      {/* pupils */}
      <Circle cx="26" cy="26" r="1.2" fill="white" />
      <Circle cx="40" cy="26" r="1.2" fill="white" />
      {/* mouth */}
      <Path
        d="M26 34c1.5 2 10.5 2 12 0"
        stroke="#0e0c1a"
        strokeWidth={1.8}
        strokeLinecap="round"
      />
    </Svg>
  );
}

// ─── Card-code regex ──────────────────────────────────────────────────────────

const CARD_CODE_RE = /\b([A-Z]{2,4}\d{2}-\d{3})\b/;

function extractCode(text: string): string | null {
  const match = text.toUpperCase().match(CARD_CODE_RE);
  return match ? match[1] : null;
}

// ─── Main screen ─────────────────────────────────────────────────────────────

export function ScanScreen({ navigation }: ScanScreenProps) {
  const t = useT();
  const insets = useSafeAreaInsets();
  const isFocused = useIsFocused();
  const { width: screenW, height: screenH } = useWindowDimensions();
  const cameraRef = useRef<CameraView>(null);
  const [permission, requestPermission] = useCameraPermissions();
  const [manualInput, setManualInput] = useState('');
  const [lastResult, setLastResult] = useState<{
    code: string;
    name: string;
    count: number;
  } | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  // Top-K candidates awaiting user confirmation (null = sheet hidden).
  const [candidates, setCandidates] = useState<ScanCandidate[] | null>(null);
  // Pause the live scan loop while the confirmation sheet is open.
  const pausedRef = useRef(false);
  // True in a custom dev build where Stage-1 (vision-camera + fast-opencv) links.
  // Resolved once; drives native-vs-focusbox rendering and the scan loop gate.
  const [nativeMode] = useState(() => isCardDetectAvailable() && getNativeScanCamera() != null);

  // Flash overlay opacity
  const flashAnim = useRef(new Animated.Value(0)).current;
  // Ghost float animation
  const floatAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.loop(
      Animated.sequence([
        Animated.timing(floatAnim, {
          toValue: -8,
          duration: 1200,
          easing: Easing.inOut(Easing.sin),
          useNativeDriver: true,
        }),
        Animated.timing(floatAnim, {
          toValue: 0,
          duration: 1200,
          easing: Easing.inOut(Easing.sin),
          useNativeDriver: true,
        }),
      ])
    ).start();
  }, [floatAnim]);

  // Debounce ref so we don't spam the look-up
  const lastScan = useRef(0);

  const handleCodeFound = useCallback(
    async (rawCode: string, variantSuffix?: string) => {
      const now = Date.now();
      if (now - lastScan.current < 800) return; // 800 ms debounce
      lastScan.current = now;

      const code = rawCode.toUpperCase().trim();
      const card = CARDS[code];
      if (!card) {
        setLastResult(null);
        return;
      }

      setIsProcessing(true);
      const suffix = variantSuffix ?? card.variants[0]?.suffix ?? '';
      const newCount = await adjust(code, suffix, 1);
      setIsProcessing(false);

      setLastResult({ code, name: card.name, count: newCount });
      setManualInput('');

      // Haptic pulse
      await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);

      // Pink screen flash
      Animated.sequence([
        Animated.timing(flashAnim, {
          toValue: 0.45,
          duration: 80,
          useNativeDriver: true,
        }),
        Animated.timing(flashAnim, {
          toValue: 0,
          duration: 400,
          useNativeDriver: true,
        }),
      ]).start();

      // Auto-dismiss toast after 2.5 s
      setTimeout(() => setLastResult(null), 2500);
    },
    [flashAnim]
  );

  const handleManualSubmit = useCallback(() => {
    const code = extractCode(manualInput);
    if (code) handleCodeFound(code);
  }, [manualInput, handleCodeFound]);

  // Resolve a raw {code, suffix, score} match to its card + exact variant.
  const resolveCandidate = useCallback(
    (code: string, suffix: string, score: number): ScanCandidate | null => {
      const card = CARDS[code.toUpperCase()];
      if (!card) return null;
      const variant = card.variants.find((v) => v.suffix === suffix) ?? card.variants[0];
      return { card, variant, suffix: variant.suffix, score };
    },
    []
  );

  // Auto-confirm the top candidate when it clearly beats the runner-up; otherwise
  // freeze the loop and show the picker for the user to disambiguate the variant.
  const decideCandidates = useCallback(
    (cands: ScanCandidate[]) => {
      if (cands.length === 0) return;
      const clearWinner =
        cands.length === 1 || cands[0].score - cands[1].score >= AUTO_CONFIRM_MARGIN;
      if (clearWinner) {
        handleCodeFound(cands[0].card.code, cands[0].suffix);
      } else {
        pausedRef.current = true; // freeze the loop until the user picks
        setCandidates(cands);
      }
    },
    [handleCodeFound]
  );

  // Resolve the art top-K matches to candidates and decide. The hash matches a
  // VARIANT image directly (code+suffix); same-art reprints land close together,
  // so the confirmation sheet lets the user pick the exact variant when the top
  // match isn't a clear winner (CLAUDE.md: code → variants → user picks).
  const handleScanResults = useCallback(
    (results: Array<{ code: string; suffix: string; score: number }>) => {
      const resolved = results
        .map((r) => resolveCandidate(r.code, r.suffix, r.score))
        .filter((c): c is ScanCandidate => c != null);
      decideCandidates(resolved);
    },
    [resolveCandidate, decideCandidates]
  );

  const confirmCandidate = useCallback(
    (c: ScanCandidate) => {
      setCandidates(null);
      pausedRef.current = false;
      handleCodeFound(c.card.code, c.suffix);
    },
    [handleCodeFound]
  );

  const dismissCandidates = useCallback(() => {
    setCandidates(null);
    pausedRef.current = false;
  }, []);

  // Native Stage-1 path: NativeScanCamera hands us an already-rectified crop.
  // Identify it (no crop rect — the URI is the card) and route to the same flow.
  const onNativeStableCard = useCallback(
    async (uri: string) => {
      if (pausedRef.current) return;
      const results = await matchTopK(uri, undefined, 3);
      if (results.length && !pausedRef.current) handleScanResults(results);
    },
    [handleScanResults]
  );

  // ── Live scan loop (art match + printed-code OCR) ───────────────────────────
  // 1. Capture a full photo from the camera.
  // 2. Map the on-screen focus box coords → photo pixel coords (crop the card).
  // 3. In parallel: art top-K (ONNX embedding / RGB-ahash) + ML Kit OCR of the code.
  // 4. Combine: OCR code → authoritative card; art ranks the variant. Confirm/auto-add.
  const busyRef = useRef(false);

  useEffect(() => {
    // The native path (NativeScanCamera) drives its own frame loop; only the
    // expo-camera focus-box fallback needs this polling loop.
    if (nativeMode || !isFocused || !permission?.granted) return;

    let cancelled = false;
    const scanOnce = async () => {
      if (busyRef.current || cancelled || pausedRef.current) return;
      busyRef.current = true;
      try {
        // No skipProcessing: it skips EXIF orientation on Android and the crop
        // coords map to the wrong region (B-05). quality 0.5 = better hash source.
        const photo = await cameraRef.current?.takePictureAsync({ quality: 0.5 });
        if (!photo?.uri || cancelled) return;

        // Map focus box screen coords → photo pixel coords.
        // The camera fills the screen; scale proportionally from each axis.
        const photoW: number = photo.width ?? screenW;
        const photoH: number = photo.height ?? screenH;
        const scaleX = photoW / screenW;
        const scaleY = photoH / screenH;

        const boxLeft = (screenW - ART_FOCUS_W) / 2;
        const boxTop = screenH * 0.25;

        const cropX = Math.max(0, Math.round(boxLeft * scaleX));
        const cropY = Math.max(0, Math.round(boxTop * scaleY));
        const cropW = Math.min(Math.round(ART_FOCUS_W * scaleX), photoW - cropX);
        const cropH = Math.min(Math.round(ART_FOCUS_H * scaleY), photoH - cropY);

        if (cropW <= 0 || cropH <= 0) return;

        // Art match (RGB-ahash top-K) over the focus-box crop.
        const results = await matchTopK(
          photo.uri,
          { originX: cropX, originY: cropY, width: cropW, height: cropH },
          3,
        );
        if (!cancelled && !pausedRef.current && results.length) {
          handleScanResults(results);
        }
      } catch {
        // ignore transient capture/recognition errors
      } finally {
        busyRef.current = false;
      }
    };

    const interval = setInterval(scanOnce, 1500);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [nativeMode, isFocused, permission?.granted, handleScanResults, screenW, screenH]);

  // ── Permission gate ──────────────────────────────────────────────────────

  if (!permission) {
    return (
      <View style={s.center}>
        <ActivityIndicator color={colors.accent} />
      </View>
    );
  }

  if (!permission.granted) {
    return (
      <View style={s.center}>
        <PeronaGhost size={72} />
        <Text style={s.permTitle}>{t('scan.permTitle')}</Text>
        <Text style={s.permSub}>{t('scan.permBody')}</Text>
        <Pressable style={s.permBtn} onPress={requestPermission}>
          <Text style={s.permBtnText}>{t('scan.grant')}</Text>
        </Pressable>
      </View>
    );
  }

  // ── Camera viewport ──────────────────────────────────────────────────────

  return (
    <View style={s.root}>
      {/* Live camera feed — native detect+rectify, or expo-camera focus-box. */}
      {nativeMode && NativeScanCameraComp ? (
        <NativeScanCameraComp
          isActive={isFocused && !candidates}
          onStableCard={onNativeStableCard}
        />
      ) : (
        <CameraView ref={cameraRef} style={StyleSheet.absoluteFill} facing="back" />
      )}

      {/* Close button */}
      <Pressable style={[s.closeBtn, { top: insets.top + 12 }]} onPress={() => navigation.goBack()}>
        <Icon name="close" size={24} color="#fff" />
      </Pressable>

      {/* Focus-box framing — only in the non-native fallback (native shows its own
          live polygon overlay). */}
      {!nativeMode && (
        <>
          <View style={s.overlay} pointerEvents="none" />
          <View style={s.focusBox} pointerEvents="none">
            {[
              { top: -2, left: -2, borderTopWidth: 3, borderLeftWidth: 3 },
              { top: -2, right: -2, borderTopWidth: 3, borderRightWidth: 3 },
              { bottom: -2, left: -2, borderBottomWidth: 3, borderLeftWidth: 3 },
              { bottom: -2, right: -2, borderBottomWidth: 3, borderRightWidth: 3 },
            ].map((style, i) => (
              <View
                key={i}
                style={[s.corner, style as object, { borderColor: colors.accent }]}
              />
            ))}
            <Text style={s.focusHint}>{t('scan.hintArt')}</Text>
          </View>
        </>
      )}

      {/* Floating ghost decoration */}
      <Animated.View
        style={[s.ghostWrap, { transform: [{ translateY: floatAnim }] }]}
        pointerEvents="none"
      >
        <PeronaGhost size={56} />
        <View style={s.speechBubble}>
          <Text style={s.speechText}>Horo, horo, horo! 👻</Text>
        </View>
      </Animated.View>

      {/* Pink flash overlay */}
      <Animated.View
        style={[s.flashOverlay, { opacity: flashAnim }]}
        pointerEvents="none"
      />

      {/* Success toast */}
      {lastResult && (
        <View style={s.toast}>
          <Text style={s.toastTitle}>Negative Hollow! 👻</Text>
          <Text style={s.toastCard} numberOfLines={1}>
            {lastResult.code} · {lastResult.name}
          </Text>
          <Text style={s.toastCount}>×{lastResult.count} {t('scan.inVault')}</Text>
        </View>
      )}

      {/* Variant confirmation sheet — shown when the match is ambiguous */}
      {candidates && (
        <View style={s.confirmBackdrop}>
          <View style={s.confirmSheet}>
            <Text style={s.confirmTitle}>{t('scan.pickVariant')}</Text>
            <Text style={s.confirmSub}>{t('scan.pickVariantHint')}</Text>
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={s.confirmRow}
            >
              {candidates.map((c) => (
                <Pressable
                  key={`${c.card.code}${c.suffix}`}
                  style={s.confirmCard}
                  onPress={() => confirmCandidate(c)}
                >
                  <CardThumb card={c.card} variant={c.variant} width={110} />
                  <Text style={s.confirmScore}>{Math.round(c.score * 100)}%</Text>
                </Pressable>
              ))}
            </ScrollView>
            <Pressable style={s.confirmCancel} onPress={dismissCandidates}>
              <Text style={s.confirmCancelText}>{t('scan.cancel')}</Text>
            </Pressable>
          </View>
        </View>
      )}

      {/* Bottom panel: manual input + confirm */}
      <View style={s.bottomPanel}>
        <Text style={s.inputLabel}>{t('scan.manualLabel')}</Text>
        <View style={s.inputRow}>
          <TextInput
            style={s.input}
            value={manualInput}
            onChangeText={setManualInput}
            placeholder="OP01-001"
            placeholderTextColor={colors.textDim}
            autoCapitalize="characters"
            autoCorrect={false}
            returnKeyType="done"
            onSubmitEditing={handleManualSubmit}
          />
          <Pressable
            style={[
              s.confirmBtn,
              !manualInput && { opacity: 0.4 },
            ]}
            onPress={handleManualSubmit}
            disabled={!manualInput || isProcessing}
          >
            {isProcessing ? (
              <ActivityIndicator color="#fff" size="small" />
            ) : (
              <Text style={s.confirmBtnText}>{t('scan.add')}</Text>
            )}
          </Pressable>
        </View>
        <Text style={s.inputHint}>{t('scan.manualHint')}</Text>
      </View>
    </View>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

// These must match the crop calculation in the scan loop (scanOnce).
export const ART_FOCUS_W = 220;
export const ART_FOCUS_H = 308; // ~5:7 OPTCG card ratio
const CORNER_SIZE = 20;

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#000' },

  overlay: {
    ...StyleSheet.absoluteFill,
    backgroundColor: 'rgba(14,12,26,0.55)',
  },

  closeBtn: {
    position: 'absolute',
    top: 52,
    right: 18,
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(21,18,38,0.85)',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 10,
  },

  focusBox: {
    position: 'absolute',
    top: '25%',
    alignSelf: 'center',
    width: ART_FOCUS_W,
    height: ART_FOCUS_H,
    borderRadius: radii.lg,
    overflow: 'visible',
    alignItems: 'center',
    justifyContent: 'center',
  },

  corner: {
    position: 'absolute',
    width: CORNER_SIZE,
    height: CORNER_SIZE,
    borderRadius: 3,
  },

  focusHint: {
    position: 'absolute',
    bottom: -28,
    fontSize: 12,
    color: 'rgba(255,255,255,0.6)',
    fontFamily: fonts.ui,
    textAlign: 'center',
  },

  ghostWrap: {
    position: 'absolute',
    top: '18%',
    alignSelf: 'center',
    alignItems: 'center',
    gap: 8,
  },

  speechBubble: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.accent,
    borderRadius: radii.lg,
    paddingHorizontal: 12,
    paddingVertical: 6,
  },

  speechText: {
    fontSize: 12,
    fontFamily: fonts.uiSemi,
    color: colors.accent,
  },

  flashOverlay: {
    ...StyleSheet.absoluteFill,
    backgroundColor: '#ec4899',
  },

  toast: {
    position: 'absolute',
    top: '12%',
    alignSelf: 'center',
    backgroundColor: colors.surface,
    borderWidth: 1.5,
    borderColor: colors.accent,
    borderRadius: radii.xl,
    paddingHorizontal: 20,
    paddingVertical: 14,
    alignItems: 'center',
    minWidth: 220,
    shadowColor: colors.accent,
    shadowOpacity: 0.4,
    shadowRadius: 14,
    elevation: 8,
  },

  toastTitle: {
    fontSize: 15,
    fontFamily: fonts.uiBold,
    color: colors.accent,
    marginBottom: 4,
  },

  toastCard: {
    fontSize: 13,
    fontFamily: fonts.uiMed,
    color: colors.text,
    maxWidth: 240,
  },

  toastCount: {
    fontSize: 12,
    fontFamily: fonts.ui,
    color: colors.textMut,
    marginTop: 2,
  },

  // ── Variant confirmation sheet ──────────────────────────────────────────
  confirmBackdrop: {
    ...StyleSheet.absoluteFill,
    backgroundColor: 'rgba(8,7,16,0.72)',
    justifyContent: 'flex-end',
    zIndex: 20,
  },

  confirmSheet: {
    backgroundColor: colors.surface,
    borderTopLeftRadius: radii.xl,
    borderTopRightRadius: radii.xl,
    borderTopWidth: 1.5,
    borderColor: colors.accent,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.lg,
    paddingBottom: 36,
    gap: spacing.sm,
  },

  confirmTitle: {
    fontSize: 17,
    fontFamily: fonts.uiBold,
    color: colors.text,
  },

  confirmSub: {
    fontSize: 12.5,
    fontFamily: fonts.ui,
    color: colors.textMut,
    marginBottom: spacing.sm,
  },

  confirmRow: {
    gap: spacing.md,
    paddingVertical: spacing.xs,
  },

  confirmCard: {
    alignItems: 'center',
    gap: 6,
  },

  confirmScore: {
    fontSize: 12,
    fontFamily: fonts.uiSemi,
    color: colors.accent,
  },

  confirmCancel: {
    marginTop: spacing.sm,
    alignSelf: 'center',
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: radii.lg,
    backgroundColor: colors.surface2,
    borderWidth: 1,
    borderColor: colors.border,
  },

  confirmCancelText: {
    fontSize: 14,
    fontFamily: fonts.uiSemi,
    color: colors.textMut,
  },

  bottomPanel: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: 'rgba(21,18,38,0.92)',
    borderTopWidth: 1,
    borderTopColor: colors.border,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.lg,
    paddingBottom: 100, // clear the tab bar
    gap: spacing.sm,
  },

  inputLabel: {
    fontSize: 12,
    fontFamily: fonts.uiSemi,
    color: colors.textMut,
    textTransform: 'uppercase',
    letterSpacing: 0.6,
  },

  inputRow: {
    flexDirection: 'row',
    gap: spacing.sm,
    alignItems: 'center',
  },

  input: {
    flex: 1,
    height: 48,
    borderRadius: radii.lg,
    backgroundColor: colors.surface2,
    borderWidth: 1,
    borderColor: colors.border,
    paddingHorizontal: 14,
    fontSize: 16,
    fontFamily: fonts.display,
    color: colors.text,
    letterSpacing: 1,
  },

  confirmBtn: {
    height: 48,
    paddingHorizontal: 20,
    borderRadius: radii.lg,
    backgroundColor: colors.accent,
    alignItems: 'center',
    justifyContent: 'center',
  },

  confirmBtnText: {
    fontSize: 15,
    fontFamily: fonts.uiBold,
    color: '#fff',
  },

  inputHint: {
    fontSize: 11.5,
    fontFamily: fonts.ui,
    color: colors.textDim,
    lineHeight: 16,
  },

  // Permission screen
  center: {
    flex: 1,
    backgroundColor: colors.bg,
    alignItems: 'center',
    justifyContent: 'center',
    padding: spacing.xxl,
    gap: 16,
  },

  permTitle: {
    fontSize: 20,
    fontFamily: fonts.uiBold,
    color: colors.text,
    textAlign: 'center',
  },

  permSub: {
    fontSize: 14,
    fontFamily: fonts.ui,
    color: colors.textMut,
    textAlign: 'center',
    lineHeight: 22,
  },

  permBtn: {
    marginTop: 8,
    paddingHorizontal: 28,
    paddingVertical: 14,
    borderRadius: radii.xl,
    backgroundColor: colors.accent,
  },

  permBtnText: {
    fontSize: 15,
    fontFamily: fonts.uiBold,
    color: '#fff',
  },
});
