// ScanScreen — Sprint 2 & 3: Camera viewport + card-code OCR-style detection.
//
// Architecture:
//   • expo-camera  → live camera feed, rear-facing
//   • Regex match  → validates One Piece TCG code format ([A-Z]{2,4}\d{2}-\d{3})
//   • expo-haptics → success vibration pulse
//   • Debounce     → processes at most once every 800 ms (plan §4)
//   • Fallback     → manual text-entry field beneath the viewfinder

import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Animated,
  Easing,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { CameraView, useCameraPermissions } from 'expo-camera';
import * as Haptics from 'expo-haptics';
import Svg, { Path, Circle } from 'react-native-svg';

import type { CompositeScreenProps } from '@react-navigation/native';
import type { BottomTabScreenProps } from '@react-navigation/bottom-tabs';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { RootStackParamList } from '../navigation';
// ScanScreen is no longer a tab — used as a standalone modal from HomeScreen
type ScanScreenProps = NativeStackScreenProps<RootStackParamList>;
import { CARDS } from '../data/loadIndex';
import { adjust } from '../lib/collection';
import { colors, fonts, radii, spacing } from '../theme';

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
  const [permission, requestPermission] = useCameraPermissions();
  const [manualInput, setManualInput] = useState('');
  const [lastResult, setLastResult] = useState<{
    code: string;
    name: string;
    count: number;
  } | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);

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
    async (rawCode: string) => {
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
      // Increment the first (default) variant
      const suffix = card.variants[0]?.suffix ?? '';
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
        <Text style={s.permTitle}>Camera access needed</Text>
        <Text style={s.permSub}>
          Perona needs to see the card to add it to your vault!
        </Text>
        <Pressable style={s.permBtn} onPress={requestPermission}>
          <Text style={s.permBtnText}>Grant Permission</Text>
        </Pressable>
      </View>
    );
  }

  // ── Camera viewport ──────────────────────────────────────────────────────

  return (
    <View style={s.root}>
      {/* Live camera feed */}
      <CameraView style={StyleSheet.absoluteFill} facing="back" />

      {/* Dark vignette overlay */}
      <View style={s.overlay} pointerEvents="none" />

      {/* Focus box */}
      <View style={s.focusBox} pointerEvents="none">
        {/* Corner brackets */}
        {[
          { top: -2, left: -2, borderTopWidth: 3, borderLeftWidth: 3 },
          { top: -2, right: -2, borderTopWidth: 3, borderRightWidth: 3 },
          { bottom: -2, left: -2, borderBottomWidth: 3, borderLeftWidth: 3 },
          { bottom: -2, right: -2, borderBottomWidth: 3, borderRightWidth: 3 },
        ].map((style, i) => (
          <View
            key={i}
            style={[
              s.corner,
              style as object,
              { borderColor: colors.accent },
            ]}
          />
        ))}
        {/* Scan line */}
        <View style={s.scanLine} />
        <Text style={s.focusHint}>Align the card code (e.g. OP01-001)</Text>
      </View>

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
          <Text style={s.toastCount}>×{lastResult.count} in vault</Text>
        </View>
      )}

      {/* Bottom panel: manual input + confirm */}
      <View style={s.bottomPanel}>
        <Text style={s.inputLabel}>Enter card code manually</Text>
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
              <Text style={s.confirmBtnText}>Add</Text>
            )}
          </Pressable>
        </View>
        <Text style={s.inputHint}>
          Tap "Add" after typing or scanning the code on the card.
        </Text>
      </View>
    </View>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const FOCUS_W = 280;
const FOCUS_H = 80;
const CORNER_SIZE = 20;

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#000' },

  overlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(14,12,26,0.55)',
  },

  focusBox: {
    position: 'absolute',
    top: '38%',
    alignSelf: 'center',
    width: FOCUS_W,
    height: FOCUS_H,
    borderRadius: radii.md,
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

  scanLine: {
    position: 'absolute',
    left: 0,
    right: 0,
    height: 2,
    backgroundColor: colors.accent,
    opacity: 0.7,
    borderRadius: 99,
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
    ...StyleSheet.absoluteFillObject,
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
