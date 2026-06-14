// SettingsScreen — language, set-completion mode, playset size, grid columns.
// All controls read/write lib/settings.ts; the i18n layer re-renders on change.

import React, { useEffect, useRef, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { SettingsScreenProps } from '../navigation';
import { colors, fonts, radii, spacing, pressedStyle, HIT_SLOP } from '../theme';
import { Icon } from '../components/Icon';
import { Counter } from '../components/Counter';
import { useT } from '../lib/i18n';
import {
  getSettings,
  setColumns,
  setCountParallels,
  setImagesDownloaded,
  setLanguage,
  setPlaysetSize,
  setShowAlternateArt,
  setWishlistDefaultVariant,
  subscribe as subSettings,
  type Language,
  type WishlistDefaultVariant,
} from '../lib/settings';
import {
  prefetchAllImages,
  type PrefetchCancel,
  type PrefetchProgress,
} from '../lib/imagePrefetch';

export function SettingsScreen({ navigation }: SettingsScreenProps) {
  const t = useT();
  const insets = useSafeAreaInsets();
  const [, force] = useState(0);
  useEffect(() => subSettings(() => force((n) => n + 1)), []);
  const settings = getSettings();

  const [dlProgress, setDlProgress] = useState<PrefetchProgress | null>(null);
  const cancelRef = useRef<PrefetchCancel>({ cancelled: false });
  const downloading = dlProgress !== null;

  async function startDownload() {
    cancelRef.current = { cancelled: false };
    setDlProgress({ done: 0, total: 0 });
    await setImagesDownloaded(false);
    const completed = await prefetchAllImages(
      (p) => setDlProgress(p),
      cancelRef.current,
    );
    setDlProgress(null);
    if (completed) await setImagesDownloaded(true);
  }

  function cancelDownload() {
    cancelRef.current.cancelled = true;
    setDlProgress(null);
  }

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <View style={[s.header, { paddingTop: insets.top + 12 }]}>
        <Pressable
          onPress={() => navigation.goBack()}
          hitSlop={HIT_SLOP}
          accessibilityRole="button"
          accessibilityLabel={t('common.done')}
          style={({ pressed }) => [s.backBtn, pressed && pressedStyle]}
        >
          <Icon name="chevL" size={22} color={colors.text} />
        </Pressable>
        <Text style={s.headerTitle}>{t('settings.title')}</Text>
      </View>

      <ScrollView contentContainerStyle={s.scroll}>
        {/* Account & cloud sync */}
        <Pressable
          style={({ pressed }) => [s.accountRow, pressed && pressedStyle]}
          onPress={() => navigation.navigate('Account')}
          accessibilityRole="button"
          accessibilityLabel={t('account.openSettings')}
        >
          <Icon name="user" size={18} color={colors.accent} />
          <Text style={s.accountRowText}>{t('account.openSettings')}</Text>
          <Icon name="chevR" size={18} color={colors.textMut} />
        </Pressable>

        {/* Language */}
        <Text style={s.sectionLabel}>{t('settings.language')}</Text>
        <View style={s.row}>
          {(['en', 'es'] as Language[]).map((lang) => {
            const on = settings.language === lang;
            return (
              <Pressable
                key={lang}
                style={({ pressed }) => [s.chip, on && s.chipOn, pressed && pressedStyle]}
                onPress={() => setLanguage(lang)}
                accessibilityRole="button"
                accessibilityState={{ selected: on }}
                accessibilityLabel={lang === 'en' ? t('settings.english') : t('settings.spanish')}
              >
                <Text style={[s.chipText, on && s.chipTextOn]}>
                  {lang === 'en' ? t('settings.english') : t('settings.spanish')}
                </Text>
              </Pressable>
            );
          })}
        </View>

        {/* Count parallels */}
        <Text style={s.sectionLabel}>{t('settings.countParallels')}</Text>
        <Text style={s.desc}>{t('settings.countParallelsDesc')}</Text>
        <Pressable
          style={[s.toggle, settings.countParallels && s.toggleOn]}
          onPress={() => setCountParallels(!settings.countParallels)}
          accessibilityRole="switch"
          accessibilityState={{ checked: settings.countParallels }}
          accessibilityLabel={t('settings.countParallels')}
        >
          <View style={[s.knob, settings.countParallels && s.knobOn]} />
        </Pressable>

        {/* Playset size */}
        <Text style={s.sectionLabel}>{t('settings.playsetSize')}</Text>
        <Text style={s.desc}>{t('settings.playsetSizeDesc')}</Text>
        <View style={s.stepper}>
          <Counter
            value={settings.playsetSize}
            onAdjust={(d) => setPlaysetSize(settings.playsetSize + d)}
            min={1}
            max={4}
            label={t('settings.playsetSize')}
          />
        </View>

        {/* Show alternate art */}
        <Text style={s.sectionLabel}>{t('settings.showAltArt')}</Text>
        <Text style={s.desc}>{t('settings.showAltArtDesc')}</Text>
        <Pressable
          style={[s.toggle, settings.showAlternateArt && s.toggleOn]}
          onPress={() => setShowAlternateArt(!settings.showAlternateArt)}
          accessibilityRole="switch"
          accessibilityState={{ checked: settings.showAlternateArt }}
          accessibilityLabel={t('settings.showAltArt')}
        >
          <View style={[s.knob, settings.showAlternateArt && s.knobOn]} />
        </Pressable>

        {/* Wishlist default variant */}
        <Text style={s.sectionLabel}>{t('settings.wishlistDefault')}</Text>
        <View style={s.row}>
          {(['normal', 'parallel'] as WishlistDefaultVariant[]).map((v) => {
            const on = settings.wishlistDefaultVariant === v;
            return (
              <Pressable
                key={v}
                style={({ pressed }) => [s.chip, on && s.chipOn, pressed && pressedStyle]}
                onPress={() => setWishlistDefaultVariant(v)}
                accessibilityRole="button"
                accessibilityState={{ selected: on }}
                accessibilityLabel={v === 'normal' ? t('settings.wishlistNormal') : t('settings.wishlistParallel')}
              >
                <Text style={[s.chipText, on && s.chipTextOn]}>
                  {v === 'normal' ? t('settings.wishlistNormal') : t('settings.wishlistParallel')}
                </Text>
              </Pressable>
            );
          })}
        </View>

        {/* Grid columns */}
        <Text style={s.sectionLabel}>{t('settings.gridColumns')}</Text>
        <View style={s.row}>
          {([2, 3, 4, 5] as const).map((n) => {
            const on = settings.columns === n;
            return (
              <Pressable
                key={n}
                style={({ pressed }) => [s.chip, on && s.chipOn, pressed && pressedStyle]}
                onPress={() => setColumns(n)}
                accessibilityRole="button"
                accessibilityState={{ selected: on }}
                accessibilityLabel={`${n}`}
              >
                <Text style={[s.chipText, on && s.chipTextOn]}>{n}</Text>
              </Pressable>
            );
          })}
        </View>

        {/* Offline images */}
        <Text style={s.sectionLabel}>{t('offline.title')}</Text>
        <Text style={s.desc}>{t('offline.desc')}</Text>

        {downloading && dlProgress ? (
          <View style={s.offlineBox}>
            <View style={s.progressTrack}>
              <View
                style={[
                  s.progressFill,
                  {
                    width: dlProgress.total > 0
                      ? `${Math.round((dlProgress.done / dlProgress.total) * 100)}%`
                      : '0%',
                  },
                ]}
              />
            </View>
            <Text style={s.progressLabel}>
              {t('offline.progress')
                .replace('{done}', String(dlProgress.done))
                .replace('{total}', String(dlProgress.total))}
            </Text>
            <Pressable
              style={({ pressed }) => [s.btnOutline, pressed && pressedStyle]}
              onPress={cancelDownload}
              accessibilityRole="button"
              accessibilityLabel={t('offline.cancel')}
            >
              <Text style={s.btnOutlineText}>{t('offline.cancel')}</Text>
            </Pressable>
          </View>
        ) : settings.imagesDownloaded ? (
          <View style={s.offlineBox}>
            <View style={s.offlineDoneRow}>
              <Icon name="check" size={16} color={colors.accent} />
              <Text style={s.offlineDoneText}>{t('offline.doneDesc')}</Text>
            </View>
            <Pressable
              style={({ pressed }) => [s.btnOutline, pressed && pressedStyle]}
              onPress={startDownload}
              accessibilityRole="button"
              accessibilityLabel={t('offline.redownload')}
            >
              <Text style={s.btnOutlineText}>{t('offline.redownload')}</Text>
            </Pressable>
          </View>
        ) : (
          <Pressable
            style={({ pressed }) => [s.btnPrimary, pressed && pressedStyle]}
            onPress={startDownload}
            accessibilityRole="button"
            accessibilityLabel={t('offline.download')}
          >
            <Text style={s.btnPrimaryText}>{t('offline.download')}</Text>
          </Pressable>
        )}
      </ScrollView>
    </View>
  );
}

const s = StyleSheet.create({
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.lg,
    paddingBottom: 14,
    gap: 12,
  },
  backBtn: { padding: 4 },
  headerTitle: { fontSize: 26, fontFamily: fonts.display, color: colors.text, letterSpacing: -0.4 },
  scroll: { padding: spacing.lg, gap: 10, paddingBottom: 60 },
  sectionLabel: {
    fontSize: 12,
    fontFamily: fonts.uiSemi,
    color: colors.textMut,
    textTransform: 'uppercase',
    letterSpacing: 0.6,
    marginTop: 14,
  },
  desc: { fontSize: 12, fontFamily: fonts.ui, color: colors.textMut, marginTop: -4 },
  row: { flexDirection: 'row', gap: 8, flexWrap: 'wrap' },
  chip: {
    paddingHorizontal: 16,
    paddingVertical: 9,
    borderRadius: radii.lg,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
  },
  chipOn: { backgroundColor: colors.accentDim, borderColor: colors.accent },
  chipText: { fontSize: 14, fontFamily: fonts.uiSemi, color: colors.textMut },
  chipTextOn: { color: colors.accent },
  toggle: {
    width: 52,
    height: 30,
    borderRadius: 15,
    backgroundColor: colors.surface2,
    borderWidth: 1,
    borderColor: colors.border,
    padding: 3,
    justifyContent: 'center',
  },
  toggleOn: { backgroundColor: colors.accentDim, borderColor: colors.accent },
  knob: { width: 22, height: 22, borderRadius: 11, backgroundColor: colors.textDim },
  knobOn: { backgroundColor: colors.accent, alignSelf: 'flex-end' },
  stepper: { flexDirection: 'row', alignItems: 'center', gap: 16 },
  stepBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: colors.surface2,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  stepSign: { fontSize: 20, color: colors.text, fontFamily: fonts.uiBold, lineHeight: 24 },
  stepVal: { fontSize: 20, fontFamily: fonts.display, color: colors.text, minWidth: 28, textAlign: 'center' },
  offlineBox: { gap: 10 },
  progressTrack: {
    height: 6,
    borderRadius: 3,
    backgroundColor: colors.surface2,
    overflow: 'hidden',
  },
  progressFill: {
    height: 6,
    borderRadius: 3,
    backgroundColor: colors.accent,
  },
  progressLabel: { fontSize: 12, fontFamily: fonts.ui, color: colors.textMut },
  offlineDoneRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  offlineDoneText: { fontSize: 13, fontFamily: fonts.ui, color: colors.textMut, flex: 1 },
  btnPrimary: {
    paddingHorizontal: 20,
    paddingVertical: 11,
    borderRadius: radii.lg,
    backgroundColor: colors.accent,
    alignSelf: 'flex-start',
  },
  btnPrimaryText: { fontSize: 14, fontFamily: fonts.uiSemi, color: '#fff' },
  btnOutline: {
    paddingHorizontal: 16,
    paddingVertical: 9,
    borderRadius: radii.lg,
    borderWidth: 1,
    borderColor: colors.border,
    alignSelf: 'flex-start',
  },
  btnOutlineText: { fontSize: 13, fontFamily: fonts.uiSemi, color: colors.textMut },
  accountRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: colors.surface,
    borderRadius: radii.lg,
    borderWidth: 1,
    borderColor: colors.border,
    paddingHorizontal: 14,
    paddingVertical: 14,
  },
  accountRowText: { flex: 1, fontSize: 15, fontFamily: fonts.uiSemi, color: colors.text },
});
