// ScanScreen — on-device card recognition (two-stage, no recurring cost).
//
// UX inspirado en Sparkl: viewfinder limpio, píldora Aim/Ready arriba,
// miniatura de la última carta añadida (abajo-derecha) + botón Deshacer,
// sidebar derecho TAP/AUTO, shutter button abajo-centro.
//
// Stage-1 (detect + rectify):
//   • Native build → NativeScanCamera (vision-camera + fast-opencv)
//   • Expo Go      → expo-camera focus-box crop periódico
// Stage-2 (identify):
//   • lib/cardMatch.matchTopK → 24-bit RGB average hash + hamming
//   • Se confirma siempre el top match (sin hoja de confirmación)
//     → el usuario puede deshacer con el botón Undo en caso de error.
//
// Modos de escaneo:
//   AUTO — se añade automáticamente cuando la carta es estable.
//   TAP  — la carta se detecta ("Listo"), pero no se añade hasta que
//           el usuario pulsa el shutter.

import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Animated,
  Easing,
  Pressable,
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
import Svg, { Circle, Path } from 'react-native-svg';

import type { ScanScreenProps } from '../navigation';
import { smartGoBack } from '../lib/nav';
import type { Card, Variant } from '../types';
import { CARDS } from '../data/loadIndex';
import { adjust } from '../lib/collection';
import { Icon } from '../components/Icon';
import { CardThumb } from '../components/CardThumb';
import { matchTopK } from '../lib/cardMatch';
import { isCardDetectAvailable } from '../lib/cardDetect';
import { useT } from '../lib/i18n';
import { colors, fonts, radii, spacing, pressedStyle, HIT_SLOP } from '../theme';

// ── Lazy native camera component ─────────────────────────────────────────────

type NativeScanCameraHandle = { triggerCapture: () => void };

let NativeScanCameraComp: React.ForwardRefExoticComponent<
  React.RefAttributes<NativeScanCameraHandle> & {
    isActive: boolean;
    onCardReady: (uri: string) => void;
    onQuadChange?: (detected: boolean) => void;
  }
> | null = null;
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

// ── Perona Ghost (permission screen) ─────────────────────────────────────────

function PeronaGhost({ size = 64 }: { size?: number }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 64 64" fill="none">
      <Path
        d="M32 6C18 6 10 17 10 28c0 8 3 14 7 18l-3 8 6-4 4 6 4-8 4 8 4-6 6 4-3-8c4-4 7-10 7-18C47 17 46 6 32 6Z"
        fill="#ec4899"
        opacity={0.9}
      />
      <Circle cx="25" cy="27" r="3.5" fill="#0e0c1a" />
      <Circle cx="39" cy="27" r="3.5" fill="#0e0c1a" />
      <Circle cx="26" cy="26" r="1.2" fill="white" />
      <Circle cx="40" cy="26" r="1.2" fill="white" />
      <Path d="M26 34c1.5 2 10.5 2 12 0" stroke="#0e0c1a" strokeWidth={1.8} strokeLinecap="round" />
    </Svg>
  );
}

// ── Types ─────────────────────────────────────────────────────────────────────

type ScanMode = 'tap' | 'auto';

type LastAdded = {
  code: string;
  name: string;
  card: Card;
  variant: Variant;
  count: number;
};

// ── Card code regex (for manual input) ───────────────────────────────────────

const CARD_CODE_RE = /\b([A-Z]{2,4}\d{2}-\d{3})\b/;
function extractCode(text: string): string | null {
  const m = text.toUpperCase().match(CARD_CODE_RE);
  return m ? m[1] : null;
}

// ── ART_FOCUS constants (focus-box fallback) ──────────────────────────────────
export const ART_FOCUS_W = 220;
export const ART_FOCUS_H = 308;

// ── Main screen ───────────────────────────────────────────────────────────────

export function ScanScreen({ navigation }: ScanScreenProps) {
  const t = useT();
  const insets = useSafeAreaInsets();
  const isFocused = useIsFocused();
  const { width: screenW, height: screenH } = useWindowDimensions();
  const cameraRef = useRef<CameraView>(null);
  const [permission, requestPermission] = useCameraPermissions();

  const [nativeMode] = useState(() => isCardDetectAvailable() && getNativeScanCamera() != null);
  const [scanMode, setScanMode] = useState<ScanMode>('auto');
  const [isCardDetected, setIsCardDetected] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [lastAdded, setLastAdded] = useState<LastAdded | null>(null);
  const [showManual, setShowManual] = useState(false);
  const [manualInput, setManualInput] = useState('');
  const [noMatchVisible, setNoMatchVisible] = useState(false);

  // URI de la última carta rectificada (usada en TAP mode para el shutter).
  const pendingUriRef = useRef<string | null>(null);
  const pausedRef = useRef(false);
  const lastScan = useRef(0);
  const busyRef = useRef(false);
  // Imperative ref to the native camera component (for triggerCapture).
  const nativeCamRef = useRef<NativeScanCameraHandle | null>(null);
  // Timeout pendiente del shutter nativo (no-match feedback). Se guarda en un
  // ref para poder cancelarlo si el componente se desmonta a mitad de captura.
  const shutterTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Flash overlay opacity (success = pink, no-match = amber)
  const flashAnim    = useRef(new Animated.Value(0)).current;
  const noMatchAnim  = useRef(new Animated.Value(0)).current;

  // ── Core: add card to collection ───────────────────────────────────────────

  const handleCodeFound = useCallback(
    async (rawCode: string, variantSuffix?: string) => {
      const now = Date.now();
      if (now - lastScan.current < 800) return;
      lastScan.current = now;

      const code = rawCode.toUpperCase().trim();
      const card = CARDS[code];
      if (!card) return;

      setIsProcessing(true);
      const suffix  = variantSuffix ?? card.variants[0]?.suffix ?? '';
      const variant = card.variants.find((v) => v.suffix === suffix) ?? card.variants[0];
      const newCount = await adjust(code, suffix, 1);
      setIsProcessing(false);

      setLastAdded({ code, name: card.name, card, variant, count: newCount });
      setManualInput('');

      await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);

      Animated.sequence([
        Animated.timing(flashAnim, { toValue: 0.35, duration: 60, useNativeDriver: true }),
        Animated.timing(flashAnim, { toValue: 0,    duration: 350, useNativeDriver: true }),
      ]).start();

      // Auto-dismiss toast after 3.5 s
      setTimeout(() => setLastAdded((prev) => (prev?.code === code ? null : prev)), 3500);
    },
    [flashAnim],
  );

  // ── No-match feedback ─────────────────────────────────────────────────────

  const showNoMatch = useCallback(() => {
    setNoMatchVisible(true);
    Animated.sequence([
      Animated.timing(noMatchAnim, { toValue: 1,   duration: 80,  useNativeDriver: true }),
      Animated.timing(noMatchAnim, { toValue: 0.6, duration: 150, useNativeDriver: true }),
      Animated.timing(noMatchAnim, { toValue: 0,   duration: 600, useNativeDriver: true }),
    ]).start(() => setNoMatchVisible(false));
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
  }, [noMatchAnim]);

  // ── Undo last scan ─────────────────────────────────────────────────────────

  const handleUndo = useCallback(async () => {
    if (!lastAdded) return;
    await adjust(lastAdded.code, lastAdded.variant.suffix, -1);
    setLastAdded(null);
  }, [lastAdded]);

  // ── Resolve hash results → add top match ───────────────────────────────────
  // No confirmation sheet: top match wins. Undo is the escape hatch.

  const handleScanResults = useCallback(
    (results: Array<{ code: string; suffix: string; score: number }>) => {
      if (!results.length) return;
      const top = results[0];
      handleCodeFound(top.code, top.suffix);
    },
    [handleCodeFound],
  );

  // ── Native camera callbacks ────────────────────────────────────────────────

  const onNativeCardReady = useCallback(
    async (uri: string) => {
      if (pausedRef.current) return;
      pendingUriRef.current = uri;

      if (scanMode === 'auto') {
        pausedRef.current = true; // evitar re-fire mientras se procesa
        const results = await matchTopK(uri, undefined, 3);
        pausedRef.current = false;
        if (results.length) handleScanResults(results);
        // No-match feedback only in auto mode; in tap mode the shutter handles it.
      }
      // En TAP mode solo guardamos la URI; el shutter la dispara.
    },
    [scanMode, handleScanResults],
  );

  const onQuadChange = useCallback((detected: boolean) => {
    setIsCardDetected(detected);
    if (!detected) pendingUriRef.current = null;
  }, []);

  // ── Shutter button ────────────────────────────────────────────────────────
  // Siempre activo. Prioridad:
  //   1. URI rectificada pendiente del detector nativo → matchTopK directo.
  //   2. Modo no-nativo (Expo Go) → captura con expo-camera y recorta el focus-box.
  //   3. Modo nativo sin detección → espera a que OpenCV detecte una carta.

  const handleShutter = useCallback(async () => {
    if (isProcessing) return;

    // 1. URI rectificada pendiente del detector nativo → matchTopK directo.
    const pending = pendingUriRef.current;
    if (pending) {
      setIsProcessing(true);
      const results = await matchTopK(pending, undefined, 3);
      setIsProcessing(false);
      if (results.length) handleScanResults(results);
      else showNoMatch();
      return;
    }

    // 2. Expo Go fallback: captura foto + recorta focus-box.
    if (!nativeMode) {
      setIsProcessing(true);
      try {
        const photo = await cameraRef.current?.takePictureAsync({ quality: 0.5 });
        if (!photo?.uri) { showNoMatch(); return; }
        const photoW = photo.width  ?? screenW;
        const photoH = photo.height ?? screenH;
        const scaleX = photoW / screenW;
        const scaleY = photoH / screenH;
        const boxLeft = (screenW - ART_FOCUS_W) / 2;
        const boxTop  = screenH * 0.35 - ART_FOCUS_H / 2;
        const cropX = Math.max(0, Math.round(boxLeft * scaleX));
        const cropY = Math.max(0, Math.round(boxTop  * scaleY));
        const cropW = Math.min(Math.round(ART_FOCUS_W * scaleX), photoW - cropX);
        const cropH = Math.min(Math.round(ART_FOCUS_H * scaleY), photoH - cropY);
        if (cropW > 0 && cropH > 0) {
          const results = await matchTopK(
            photo.uri,
            { originX: cropX, originY: cropY, width: cropW, height: cropH },
            3,
          );
          if (results.length) handleScanResults(results);
          else showNoMatch();
        } else {
          showNoMatch();
        }
      } finally {
        setIsProcessing(false);
      }
      return;
    }

    // 3. Modo nativo sin URI pendiente: pedir al detector que fuerce una captura
    //    en el siguiente frame que contenga un quad. Si en 1.2 s no llega ningún
    //    resultado el usuario verá el feedback "no match".
    nativeCamRef.current?.triggerCapture();
    if (shutterTimeoutRef.current) clearTimeout(shutterTimeoutRef.current);
    shutterTimeoutRef.current = setTimeout(() => {
      // Si onNativeCardReady ya disparó en este intervalo, pendingUriRef.current
      // habrá cambiado y handleScanResults ya habrá corrido — no hacer nada.
      // Si no → el detector no encontró ninguna carta en el frame: dar feedback.
      if (!pendingUriRef.current) showNoMatch();
      shutterTimeoutRef.current = null;
    }, 1200);
  }, [isProcessing, nativeMode, handleScanResults, showNoMatch, screenW, screenH]);

  // Cancelar cualquier timeout de shutter pendiente al desmontar.
  useEffect(() => () => {
    if (shutterTimeoutRef.current) clearTimeout(shutterTimeoutRef.current);
  }, []);

  // ── Manual code submit ─────────────────────────────────────────────────────

  const handleManualSubmit = useCallback(() => {
    const code = extractCode(manualInput);
    if (code) handleCodeFound(code);
  }, [manualInput, handleCodeFound]);

  // ── Focus-box scan loop (Expo Go fallback) ─────────────────────────────────

  useEffect(() => {
    if (nativeMode || !isFocused || !permission?.granted) return;

    let cancelled = false;
    const scanOnce = async () => {
      if (busyRef.current || cancelled || pausedRef.current) return;
      busyRef.current = true;
      try {
        const photo = await cameraRef.current?.takePictureAsync({ quality: 0.5 });
        if (!photo?.uri || cancelled) return;

        const photoW = photo.width  ?? screenW;
        const photoH = photo.height ?? screenH;
        const scaleX = photoW / screenW;
        const scaleY = photoH / screenH;
        const boxLeft = (screenW - ART_FOCUS_W) / 2;
        const boxTop  = screenH * 0.35 - ART_FOCUS_H / 2;

        const cropX = Math.max(0, Math.round(boxLeft * scaleX));
        const cropY = Math.max(0, Math.round(boxTop  * scaleY));
        const cropW = Math.min(Math.round(ART_FOCUS_W * scaleX), photoW - cropX);
        const cropH = Math.min(Math.round(ART_FOCUS_H * scaleY), photoH - cropY);
        if (cropW <= 0 || cropH <= 0) return;

        if (scanMode === 'auto') {
          const results = await matchTopK(
            photo.uri,
            { originX: cropX, originY: cropY, width: cropW, height: cropH },
            3,
          );
          if (!cancelled && !pausedRef.current) {
            if (results.length) handleScanResults(results);
            // No showNoMatch here — auto-loop runs every 1.5 s so continuous
            // "not found" pulses would be noisy. Silence is fine for the loop.
          }
        }
      } catch {
        // ignore transient errors
      } finally {
        busyRef.current = false;
      }
    };

    const interval = setInterval(scanOnce, 1500);
    return () => { cancelled = true; clearInterval(interval); };
  }, [nativeMode, isFocused, permission?.granted, scanMode, handleScanResults, screenW, screenH]);

  // ── Permission gate ────────────────────────────────────────────────────────

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
        <Pressable
          style={({ pressed }) => [s.permBtn, pressed && pressedStyle]}
          onPress={requestPermission}
          accessibilityRole="button"
          accessibilityLabel={t('scan.grant')}
        >
          <Text style={s.permBtnText}>{t('scan.grant')}</Text>
        </Pressable>
      </View>
    );
  }

  // ── Camera viewport ────────────────────────────────────────────────────────

  const NativeComp = getNativeScanCamera();
  const statusReady = nativeMode ? isCardDetected : true; // fallback siempre "ready"

  return (
    <View style={s.root}>

      {/* ── Camera feed ── */}
      {nativeMode && NativeComp ? (
        <NativeComp
          ref={nativeCamRef}
          isActive={isFocused}
          onCardReady={onNativeCardReady}
          onQuadChange={onQuadChange}
        />
      ) : (
        <CameraView ref={cameraRef} style={StyleSheet.absoluteFill} facing="back" />
      )}

      {/* ── Focus-box corners (Expo Go fallback) ── */}
      {!nativeMode && (
        <>
          <View style={s.dimOverlay} pointerEvents="none" />
          <View style={[s.focusBox, { top: screenH * 0.35 - ART_FOCUS_H / 2 }]} pointerEvents="none">
            {CORNER_POSITIONS.map((cs, i) => (
              <View key={i} style={[s.corner, cs as object]} />
            ))}
          </View>
        </>
      )}

      {/* ── Flash overlay (success) ── */}
      <Animated.View style={[s.flashOverlay, { opacity: flashAnim }]} pointerEvents="none" />

      {/* ── No-match overlay ── */}
      {noMatchVisible && (
        <Animated.View style={[s.noMatchOverlay, { opacity: noMatchAnim }]} pointerEvents="none">
          <Text style={s.noMatchText}>{t('scan.noMatch')}</Text>
        </Animated.View>
      )}

      {/* ── Status pill (top-center) ── */}
      <View style={[s.statusWrap, { top: insets.top + 16 }]} pointerEvents="none">
        <View style={[s.statusPill, statusReady && s.statusPillReady]}>
          {statusReady && <View style={s.statusDot} />}
          <Text style={[s.statusText, statusReady && s.statusTextReady]}>
            {statusReady ? t('scan.statusReady') : t('scan.statusAim')}
          </Text>
        </View>
      </View>

      {/* ── Close button (top-left) ── */}
      <Pressable
        style={({ pressed }) => [s.closeBtn, { top: insets.top + 12 }, pressed && pressedStyle]}
        onPress={() => smartGoBack(navigation)}
        hitSlop={HIT_SLOP}
        accessibilityRole="button"
        accessibilityLabel={t('common.done')}
      >
        <Icon name="close" size={20} color="#fff" />
      </Pressable>

      {/* ── Right sidebar: TAP / AUTO ── */}
      <View style={[s.sidebar, { top: screenH * 0.35, bottom: 120 + insets.bottom }]}>
        {(['tap', 'auto'] as ScanMode[]).map((mode) => (
          <Pressable
            key={mode}
            style={({ pressed }) => [s.sideBtn, scanMode === mode && s.sideBtnActive, pressed && pressedStyle]}
            onPress={() => setScanMode(mode)}
            accessibilityRole="button"
            accessibilityState={{ selected: scanMode === mode }}
            accessibilityLabel={t(mode === 'tap' ? 'scan.modeTap' : 'scan.modeAuto')}
          >
            <Text style={[s.sideBtnText, scanMode === mode && s.sideBtnTextActive]}>
              {t(mode === 'tap' ? 'scan.modeTap' : 'scan.modeAuto')}
            </Text>
          </Pressable>
        ))}
        {/* Manual code toggle */}
        <Pressable
          style={({ pressed }) => [s.sideBtn, showManual && s.sideBtnActive, pressed && pressedStyle]}
          onPress={() => setShowManual((v) => !v)}
          accessibilityRole="button"
          accessibilityState={{ selected: showManual }}
          accessibilityLabel={t('scan.manualCode')}
        >
          <Text style={[s.sideBtnText, showManual && s.sideBtnTextActive]}>
            {t('scan.manualCode')}
          </Text>
        </Pressable>
      </View>

      {/* ── Manual code input (collapsible) ── */}
      {showManual && (
        <View style={[s.manualPanel, { bottom: 120 + insets.bottom }]}>
          <TextInput
            style={s.manualInput}
            value={manualInput}
            onChangeText={setManualInput}
            placeholder="OP01-001"
            placeholderTextColor={colors.textDim}
            autoCapitalize="characters"
            autoCorrect={false}
            returnKeyType="done"
            onSubmitEditing={handleManualSubmit}
            autoFocus
          />
          <Pressable
            style={({ pressed }) => [s.manualAddBtn, !manualInput && { opacity: 0.4 }, pressed && pressedStyle]}
            onPress={handleManualSubmit}
            disabled={!manualInput || isProcessing}
            accessibilityRole="button"
            accessibilityLabel={t('scan.add')}
          >
            {isProcessing
              ? <ActivityIndicator color="#fff" size="small" />
              : <Text style={s.manualAddText}>{t('scan.add')}</Text>}
          </Pressable>
        </View>
      )}

      {/* ── Bottom row: shutter + last-added thumbnail ── */}
      <View style={[s.bottomRow, { bottom: 28 + insets.bottom }]}>

        {/* Shutter button — siempre pulsable */}
        <Pressable
          style={({ pressed }) => [s.shutter, isCardDetected && s.shutterReady, pressed && pressedStyle]}
          onPress={handleShutter}
          disabled={isProcessing}
          accessibilityRole="button"
          accessibilityLabel={t('scan.add')}
        >
          {isProcessing
            ? <ActivityIndicator color={colors.accent} size="small" />
            : <View style={s.shutterInner} />}
        </Pressable>

        {/* Last-added card thumbnail */}
        {lastAdded && (
          <View style={s.lastAddedWrap}>
            <View style={s.lastAddedThumb}>
              <CardThumb card={lastAdded.card} variant={lastAdded.variant} width={56} />
            </View>
            <View style={s.lastAddedInfo}>
              <View style={s.lastAddedBadge}>
                <View style={s.lastAddedDot} />
                <Text style={s.lastAddedBadgeText}>{t('scan.added')}</Text>
              </View>
              <Text style={s.lastAddedName} numberOfLines={1}>{lastAdded.name}</Text>
              <Pressable
                style={({ pressed }) => [s.undoBtn, pressed && pressedStyle]}
                onPress={handleUndo}
                hitSlop={HIT_SLOP}
                accessibilityRole="button"
                accessibilityLabel={t('scan.undo')}
              >
                <Text style={s.undoBtnText}>{t('scan.undo')}</Text>
              </Pressable>
            </View>
          </View>
        )}
      </View>

    </View>
  );
}

// ── Corner positions for the focus-box fallback ───────────────────────────────

const CORNER_SIZE = 20;
const CORNER_POSITIONS = [
  { top: -2,    left:  -2,   borderTopWidth: 3,    borderLeftWidth: 3   },
  { top: -2,    right: -2,   borderTopWidth: 3,    borderRightWidth: 3  },
  { bottom: -2, left:  -2,   borderBottomWidth: 3, borderLeftWidth: 3   },
  { bottom: -2, right: -2,   borderBottomWidth: 3, borderRightWidth: 3  },
];

// ── Styles ────────────────────────────────────────────────────────────────────

const s = StyleSheet.create({
  root:  { flex: 1, backgroundColor: '#000' },

  // Permission screen
  center: {
    flex: 1, backgroundColor: colors.bg,
    alignItems: 'center', justifyContent: 'center',
    padding: spacing.xxl, gap: 16,
  },
  permTitle: { fontSize: 20, fontFamily: fonts.uiBold, color: colors.text, textAlign: 'center' },
  permSub:   { fontSize: 14, fontFamily: fonts.ui,     color: colors.textMut, textAlign: 'center', lineHeight: 22 },
  permBtn:   { marginTop: 8, paddingHorizontal: 28, paddingVertical: 14, borderRadius: radii.xl, backgroundColor: colors.accent },
  permBtnText: { fontSize: 15, fontFamily: fonts.uiBold, color: colors.onAccent },

  // Dim overlay for focus-box fallback
  dimOverlay: { ...StyleSheet.absoluteFill, backgroundColor: 'rgba(21,22,26,0.5)' },

  // Focus-box (Expo Go fallback)
  focusBox: {
    position: 'absolute',
    alignSelf: 'center',
    width: ART_FOCUS_W,
    height: ART_FOCUS_H,
    overflow: 'visible',
  },
  corner: {
    position: 'absolute',
    width: CORNER_SIZE,
    height: CORNER_SIZE,
    borderRadius: 3,
    borderColor: '#fff',
  },

  // Flash (success)
  flashOverlay: { ...StyleSheet.absoluteFill, backgroundColor: colors.accent },

  // No-match feedback
  noMatchOverlay: {
    ...StyleSheet.absoluteFill,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(239,68,68,0.25)',
  },
  noMatchText: {
    fontSize: 16,
    fontFamily: fonts.uiBold,
    color: '#fff',
    backgroundColor: 'rgba(0,0,0,0.55)',
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: 99,
    overflow: 'hidden',
  },

  // Status pill
  statusWrap: {
    position: 'absolute',
    alignSelf: 'center',
    left: 0, right: 0,
    alignItems: 'center',
    zIndex: 10,
  },
  statusPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 16,
    paddingVertical: 7,
    borderRadius: 99,
    backgroundColor: 'rgba(30,26,48,0.75)',
  },
  statusPillReady: {
    backgroundColor: 'rgba(34,197,94,0.20)',
    borderWidth: 1,
    borderColor: 'rgba(34,197,94,0.5)',
  },
  statusDot: {
    width: 7,
    height: 7,
    borderRadius: 4,
    backgroundColor: '#22c55e',
  },
  statusText: {
    fontSize: 13,
    fontFamily: fonts.uiSemi,
    color: 'rgba(255,255,255,0.85)',
    letterSpacing: 0.5,
  },
  statusTextReady: { color: '#22c55e' },

  // Close button
  closeBtn: {
    position: 'absolute',
    left: 16,
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: 'rgba(21,18,38,0.80)',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 10,
  },

  // Right sidebar
  sidebar: {
    position: 'absolute',
    right: 12,
    justifyContent: 'center',
    alignItems: 'flex-end',
    gap: 8,
    zIndex: 10,
  },
  sideBtn: {
    paddingHorizontal: 12,
    paddingVertical: 11,
    borderRadius: radii.lg,
    backgroundColor: 'rgba(21,18,38,0.85)',
    minWidth: 56,
    alignItems: 'center',
  },
  sideBtnActive: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.accent,
  },
  sideBtnText: {
    fontSize: 12,
    fontFamily: fonts.uiBold,
    color: 'rgba(255,255,255,0.85)',
    letterSpacing: 0.8,
  },
  sideBtnTextActive: { color: colors.accent },

  // Manual code input
  manualPanel: {
    position: 'absolute',
    left: 16,
    right: 80, // no tocar la sidebar
    flexDirection: 'row',
    gap: spacing.sm,
    alignItems: 'center',
    zIndex: 10,
  },
  manualInput: {
    flex: 1,
    height: 44,
    borderRadius: radii.lg,
    backgroundColor: 'rgba(21,18,38,0.90)',
    borderWidth: 1,
    borderColor: colors.border,
    paddingHorizontal: 14,
    fontSize: 15,
    fontFamily: fonts.display,
    color: colors.text,
    letterSpacing: 1,
  },
  manualAddBtn: {
    height: 44,
    paddingHorizontal: 16,
    borderRadius: radii.lg,
    backgroundColor: colors.accent,
    alignItems: 'center',
    justifyContent: 'center',
  },
  manualAddText: { fontSize: 14, fontFamily: fonts.uiBold, color: colors.onAccent },

  // Bottom row
  bottomRow: {
    position: 'absolute',
    left: 0,
    right: 0,
    flexDirection: 'row',
    alignItems: 'flex-end',
    justifyContent: 'center',
    paddingHorizontal: 24,
    gap: 20,
    zIndex: 10,
  },

  // Shutter button
  shutter: {
    width: 72,
    height: 72,
    borderRadius: 36,
    borderWidth: 3,
    borderColor: 'rgba(255,255,255,0.45)',
    backgroundColor: 'rgba(255,255,255,0.10)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  shutterReady: {
    borderColor: '#22c55e',
    backgroundColor: 'rgba(34,197,94,0.15)',
  },
  shutterInner: {
    width: 52,
    height: 52,
    borderRadius: 26,
    backgroundColor: 'rgba(255,255,255,0.80)',
  },

  // Last-added card
  lastAddedWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: 'rgba(21,18,38,0.88)',
    borderRadius: radii.xl,
    borderWidth: 1,
    borderColor: 'rgba(34,197,94,0.30)',
    padding: 8,
    flex: 1,
    maxWidth: 230,
  },
  lastAddedThumb: {
    borderRadius: radii.sm,
    overflow: 'hidden',
  },
  lastAddedInfo: {
    flex: 1,
    gap: 3,
  },
  lastAddedBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  lastAddedDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: '#22c55e',
  },
  lastAddedBadgeText: {
    fontSize: 10,
    fontFamily: fonts.uiBold,
    color: '#22c55e',
    letterSpacing: 0.5,
  },
  lastAddedName: {
    fontSize: 12,
    fontFamily: fonts.uiSemi,
    color: colors.text,
  },
  undoBtn: {
    alignSelf: 'flex-start',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: radii.sm,
    backgroundColor: colors.surface2,
    borderWidth: 1,
    borderColor: colors.border,
  },
  undoBtnText: {
    fontSize: 10,
    fontFamily: fonts.uiSemi,
    color: colors.textMut,
  },
});
