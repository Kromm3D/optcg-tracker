// Banner de cabecera de SetDetail: código + título + progreso a la
// izquierda, box art del booster a la derecha con un fade horizontal que la
// funde con el fondo de la cápsula. La mayoría de sets no tienen box art
// disponible (el sitio oficial solo mantiene la página del set vigente — ver
// scripts/build_card_database.py), así que caen a un degradado temático
// determinista por set en vez de dejar un hueco vacío.

import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import Svg, { Defs, LinearGradient, Rect, Stop } from 'react-native-svg';
import { CachedImage } from './CachedImage';
import { ProgressRing } from './ProgressRing';
import { Icon } from './Icon';
import { hasBoxArt, boxArtUrl } from '../lib/setBoxArt';
import { COLOR_KEYS, OPTCG_COLORS, colors, fonts, pressedStyle, HIT_SLOP } from '../theme';
import { useT } from '../lib/i18n';

type Props = {
  setCode: string;
  title: string;
  date?: string;
  owned: number;
  total: number;
  pct: number;
  onBack: () => void;
};

const ART_WIDTH = 132;

/** Degradado temático estable por set (mismo código → mismo color siempre),
 *  usando los tonos de OPTCG_COLORS ya documentados en DESIGN.md. */
function fallbackToneFor(setCode: string): string {
  let hash = 0;
  for (let i = 0; i < setCode.length; i++) hash = (hash * 31 + setCode.charCodeAt(i)) >>> 0;
  const key = COLOR_KEYS[hash % COLOR_KEYS.length];
  return OPTCG_COLORS[key]?.tone ?? colors.surface2;
}

export function SetBanner({ setCode, title, date, owned, total, pct, onBack }: Props) {
  const t = useT();
  const hasArt = hasBoxArt(setCode);
  const fallbackTone = hasArt ? undefined : fallbackToneFor(setCode);

  return (
    <View style={s.capsule}>
      {/* Capa de arte: imagen real o degradado temático, siempre detrás del fade. */}
      <View style={s.artLayer} pointerEvents="none">
        {hasArt ? (
          <CachedImage uri={boxArtUrl(setCode)} style={s.artImage} contentFit="cover" />
        ) : (
          <View style={[s.artImage, { backgroundColor: fallbackTone }]} />
        )}
        <Svg style={StyleSheet.absoluteFill} width="100%" height="100%">
          <Defs>
            <LinearGradient id="setBannerFade" x1="0" y1="0" x2="1" y2="0">
              <Stop offset="0" stopColor={colors.surface2} stopOpacity={1} />
              <Stop offset="0.55" stopColor={colors.surface2} stopOpacity={0.6} />
              <Stop offset="1" stopColor={colors.surface2} stopOpacity={0} />
            </LinearGradient>
          </Defs>
          <Rect x="0" y="0" width="100%" height="100%" fill="url(#setBannerFade)" />
        </Svg>
      </View>

      {/* Contenido */}
      <Pressable
        onPress={onBack}
        accessibilityRole="button"
        accessibilityLabel={t('common.done')}
        hitSlop={HIT_SLOP}
        style={({ pressed }) => [s.backBtn, pressed && pressedStyle]}
      >
        <Icon name="chevL" size={18} color={colors.text} />
      </Pressable>

      <View style={s.content}>
        <ProgressRing pct={pct} size={52} />
        <View style={s.info}>
          <Text style={s.code}>{setCode}</Text>
          <Text style={s.title} numberOfLines={1}>{title}</Text>
          <Text style={s.count}>{t('set.ownedOfTotal', { owned, total })}</Text>
          {date ? <Text style={s.date}>{date}</Text> : null}
        </View>
      </View>
    </View>
  );
}

const s = StyleSheet.create({
  capsule: {
    marginHorizontal: 14,
    borderRadius: 26,
    backgroundColor: colors.surface2,
    borderWidth: 1,
    borderColor: colors.border,
    overflow: 'hidden',
    minHeight: 120,
  },
  artLayer: StyleSheet.absoluteFill,
  artImage: {
    position: 'absolute',
    right: 0,
    top: 0,
    bottom: 0,
    width: ART_WIDTH,
  },
  backBtn: {
    position: 'absolute',
    top: 12,
    left: 12,
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: 'rgba(19,16,25,0.55)',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 2,
  },
  content: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 18,
    paddingLeft: 54,
    paddingRight: ART_WIDTH * 0.6,
    gap: 14,
  },
  info: { flex: 1 },
  code: { fontSize: 22, fontFamily: fonts.display, color: colors.text, letterSpacing: -0.4 },
  title: { fontSize: 13, fontFamily: fonts.uiSemi, color: colors.textMut, marginTop: 1 },
  count: { fontSize: 12, fontFamily: fonts.uiBold, color: colors.ghost, marginTop: 6 },
  date: { fontSize: 11, fontFamily: fonts.ui, color: colors.textDim, marginTop: 2 },
});
