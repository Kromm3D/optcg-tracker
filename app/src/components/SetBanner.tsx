// Banner de cabecera de SetDetail: código + título + progreso a la izquierda,
// key art del set ("mv.webp") ocupando la derecha y FUNDIÉNDOSE en la cápsula
// mediante una máscara alpha horizontal (transparente a la izquierda → opaca a
// la derecha) — el arte se disuelve de verdad en el fondo, no se tapa con un
// rectángulo del color de la cápsula. Encima, un velo de legibilidad mantiene
// el texto de la izquierda nítido. La mayoría de sets no tienen key art (el
// sitio oficial solo mantiene la página del set vigente — ver
// scripts/build_card_database.py), así que caen a un degradado temático
// determinista por set, tratado con la misma máscara para que case visualmente.

import React from 'react';
import { Pressable, ScrollView, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import Svg, { Defs, Image as SvgImage, LinearGradient, Mask, Rect, Stop } from 'react-native-svg';
import { ProgressRing } from './ProgressRing';
import { Icon } from './Icon';
import { hasBoxArt, boxArtUrl } from '../lib/setBoxArt';
import { COLOR_KEYS, OPTCG_COLORS, colors, fonts, pressedStyle, HIT_SLOP, onScrim } from '../theme';
import { useT } from '../lib/i18n';
import type { RarityBucket } from '../lib/setsStats';

type Props = {
  setCode: string;
  title: string;
  date?: string;
  owned: number;
  total: number;
  pct: number;
  onBack: () => void;
  /** Desglose por rareza — si se pasa, se dibuja como segunda fila dentro de
   *  la propia cápsula en vez de como una tira aparte debajo (un set debería
   *  leerse como una sola pieza visual). */
  rarities?: RarityBucket[];
};

const BANNER_H = 132;
const BANNER_H_WITH_RARITIES = 172;
/** Fracción del ancho de la cápsula que ocupa el panel de arte (anclado a la
 *  derecha). El arte se desvanece dentro de este panel; su mitad izquierda
 *  queda transparente y deja ver la cápsula. */
const ART_FRACTION = 0.72;
/** Tope de ancho del panel de arte = ancho nativo del key art (480px). Sin
 *  esto, en pantallas anchas (navegador a Full HD) la cápsula mide ~1900px, el
 *  panel ~1360px, y el `slice` ampliaría el arte de 480px ~2.8× recortándolo a
 *  una franja superior borrosa. Con el tope, el arte se mantiene nítido y bien
 *  encuadrado a cualquier resolución, anclado a la derecha. */
const ART_MAX_W = 480;
/** Márgenes horizontales de la cápsula (marginHorizontal 14 · 2). */
const CAPSULE_MARGIN = 28;

/** Degradado temático estable por set (mismo código → mismo color siempre),
 *  usando los tonos de OPTCG_COLORS ya documentados en DESIGN.md. */
function fallbackToneFor(setCode: string): string {
  let hash = 0;
  for (let i = 0; i < setCode.length; i++) hash = (hash * 31 + setCode.charCodeAt(i)) >>> 0;
  const key = COLOR_KEYS[hash % COLOR_KEYS.length];
  return OPTCG_COLORS[key]?.tone ?? colors.surface2;
}

export function SetBanner({ setCode, title, date, owned, total, pct, onBack, rarities }: Props) {
  const t = useT();
  const hasArt = hasBoxArt(setCode);
  const fallbackTone = hasArt ? undefined : fallbackToneFor(setCode);
  const showRarities = !!rarities?.length;
  const bannerH = showRarities ? BANNER_H_WITH_RARITIES : BANNER_H;

  // Ancho de la cápsula derivado del ancho de ventana (idiomático en RN y, a
  // diferencia de onLayout en web, fiable y reactivo a cambios de resolución).
  // El SVG necesita píxeles reales para que el `slice` recorte sin deformar.
  const { width: winW } = useWindowDimensions();
  const w = Math.max(280, Math.round(winW) - CAPSULE_MARGIN);
  // Suelo del 50%: el cap absoluto (ART_MAX_W) evita pixelado en pantallas
  // anchas, pero nunca debe encoger el panel de arte por debajo de la mitad
  // de la cápsula.
  const artW = Math.max(Math.round(w * 0.5), Math.min(Math.round(w * ART_FRACTION), ART_MAX_W));
  const artX = w - artW;

  return (
    <View style={[s.capsule, { height: bannerH }]}>
      {/* Capa de arte enmascarada — siempre detrás del contenido. */}
      <View style={StyleSheet.absoluteFill} pointerEvents="none">
        <Svg width={w} height={bannerH}>
          <Defs>
            {/* Máscara alpha: el arte va de transparente (izq) a opaco (der).
                Luminancia blanca con opacidad creciente = más visible. */}
            <LinearGradient id="setArtFade" x1="0" y1="0" x2="1" y2="0">
              <Stop offset="0" stopColor="#fff" stopOpacity={0} />
              <Stop offset="0.5" stopColor="#fff" stopOpacity={0.55} />
              <Stop offset="0.82" stopColor="#fff" stopOpacity={1} />
              <Stop offset="1" stopColor="#fff" stopOpacity={1} />
            </LinearGradient>
            <Mask id="setArtMask">
              <Rect x={artX} y={0} width={artW} height={bannerH} fill="url(#setArtFade)" />
            </Mask>
            {/* Velo de legibilidad: base de la cápsula opaca a la izquierda que
                se va a 0 antes del punto de interés del arte (der), para que el
                texto quede sobre una base limpia sin tapar la cara/acción. */}
            <LinearGradient id="setArtScrim" x1="0" y1="0" x2="1" y2="0">
              <Stop offset="0" stopColor={colors.surface2} stopOpacity={0.92} />
              <Stop offset="0.42" stopColor={colors.surface2} stopOpacity={0.5} />
              <Stop offset="0.66" stopColor={colors.surface2} stopOpacity={0} />
            </LinearGradient>
          </Defs>

          {hasArt ? (
            <SvgImage
              href={{ uri: boxArtUrl(setCode) }}
              x={artX}
              y={0}
              width={artW}
              height={bannerH}
              // slice = cubre el panel recortando; yMin encuadra la parte alta
              // del arte (caras/acción), el "punto de interés" de la mayoría de
              // key arts de OPTCG.
              preserveAspectRatio="xMidYMin slice"
              mask="url(#setArtMask)"
            />
          ) : (
            <Rect x={artX} y={0} width={artW} height={bannerH} fill={fallbackTone} mask="url(#setArtMask)" />
          )}

          {/* Velo encima del arte: protege la legibilidad del texto. */}
          <Rect x={0} y={0} width={w} height={bannerH} fill="url(#setArtScrim)" />
        </Svg>
      </View>

      {/* Botón atrás */}
      <Pressable
        onPress={onBack}
        accessibilityRole="button"
        accessibilityLabel={t('common.done')}
        hitSlop={HIT_SLOP}
        style={({ pressed }) => [s.backBtn, pressed && pressedStyle]}
      >
        <Icon name="chevL" size={18} color={onScrim} />
      </Pressable>

      {/* Contenido */}
      <View style={s.contentCol}>
        <View style={s.contentRow}>
          <ProgressRing pct={pct} size={52} />
          <View style={s.info}>
            <Text style={s.code}>{setCode}</Text>
            <Text style={s.title} numberOfLines={1}>{title}</Text>
            <Text style={s.count}>{t('set.ownedOfTotal', { owned, total })}</Text>
            {date ? <Text style={s.date}>{date}</Text> : null}
          </View>
        </View>

        {showRarities ? (
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            style={s.rarityScroll}
            contentContainerStyle={s.rarityRow}
          >
            {rarities!.map((b) => (
              <View key={b.rarity} style={s.rarityCol}>
                <Text style={s.rarityVal}>{b.owned}/{b.total}</Text>
                <Text style={s.rarityLab}>{b.rarity}</Text>
              </View>
            ))}
          </ScrollView>
        ) : null}
      </View>
    </View>
  );
}

const s = StyleSheet.create({
  capsule: {
    marginHorizontal: 14,
    height: BANNER_H,
    borderRadius: 26,
    backgroundColor: colors.surface2,
    borderWidth: 1,
    borderColor: colors.border,
    overflow: 'hidden',
  },
  backBtn: {
    position: 'absolute',
    top: 12,
    left: 12,
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: 'rgba(21,22,26,0.55)',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 2,
  },
  contentCol: {
    flex: 1,
    justifyContent: 'center',
    paddingLeft: 54,
    paddingRight: 40,
    gap: 12,
  },
  contentRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingRight: 64,
    gap: 14,
  },
  info: { flex: 1 },
  code: { fontSize: 22, fontFamily: fonts.display, color: colors.text, letterSpacing: -0.4 },
  title: { fontSize: 13, fontFamily: fonts.uiSemi, color: colors.textMut, marginTop: 1 },
  count: { fontSize: 12, fontFamily: fonts.uiBold, color: colors.ghost, marginTop: 6 },
  date: { fontSize: 11, fontFamily: fonts.ui, color: colors.textDim, marginTop: 2 },
  rarityScroll: { flexGrow: 0 },
  rarityRow: { alignItems: 'center', gap: 16, paddingRight: 8 },
  rarityCol: { alignItems: 'center', minWidth: 32 },
  rarityVal: { fontSize: 14, fontFamily: fonts.display, color: colors.text },
  rarityLab: { fontSize: 10, fontFamily: fonts.uiSemi, color: colors.textMut, marginTop: 2 },
});
