// Miniatura de carta. Imagen real con overlays: dot de color, nombre,
// rareza y badge de owned. Modo "compact" para 3+ columnas. Modo
// "quickActions" para mostrar +/- directamente sobre la card (afecta
// a la primera variante).

import React, { useEffect, useRef, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { CachedImage } from './CachedImage';
import { Icon } from './Icon';
import { Touchable } from './Touchable';
import { Counter } from './Counter';
import { colors, fonts, HIT_SLOP, pressedStyle, pressedSurface } from '../theme';
import { resolveImageUris } from '../lib/images';
import { adjust, getCount, getCountSync, subscribe as subColl } from '../lib/collection';
import {
  getOwnedFor,
  getVariantOwned,
  getOwnedVariantCount,
  subscribe as subOwned,
} from '../lib/ownedAggregate';
import type { Card, Variant } from '../types';

// Hook: cantidad poseída en vivo, suscrito a ownedAggregate. Solo provoca
// re-render cuando *su* contador cambia (bail-out con Object.is), así editar
// una carta no re-renderiza las demás miniaturas montadas.
function useLiveOwned(code: string | undefined, suffix: string | undefined): number {
  const [n, setN] = useState(() =>
    code == null ? 0 : suffix != null ? getVariantOwned(code, suffix) : getOwnedFor(code),
  );
  useEffect(() => {
    if (code == null) return;
    const compute = () => (suffix != null ? getVariantOwned(code, suffix) : getOwnedFor(code));
    const update = () => setN((prev) => { const v = compute(); return prev === v ? prev : v; });
    update();
    return subOwned(update);
  }, [code, suffix]);
  return n;
}

// Hook: nº de variantes distintas poseídas (para el indicador "varias artes").
function useLiveVariantCount(code: string | undefined): number {
  const [n, setN] = useState(() => (code == null ? 0 : getOwnedVariantCount(code)));
  useEffect(() => {
    if (code == null) return;
    const update = () => setN((prev) => { const v = getOwnedVariantCount(code); return prev === v ? prev : v; });
    update();
    return subOwned(update);
  }, [code]);
  return n;
}

// Rareza → rango numérico (mayor = más rara). SEC en la cima.
const RARITY_RANK: Record<string, number> = {
  SEC: 8, SP: 7, TR: 6, SR: 5, R: 4, UC: 3, C: 2, L: 1, P: 1,
};
function rarityRank(r: string | undefined): number {
  return RARITY_RANK[(r ?? '').toUpperCase()] ?? 0;
}

const STACK_OFFSET = 4;  // px de desplazamiento por capa fantasma
const MAX_STACK    = 4;  // capas totales máximas (main + fantasmas)

type Props = {
  card: Card;
  /** Cuantas tienes (suma de variantes). Badge en la esquina. */
  owned?: number;
  /** Si true, recorta overlays (usar con 3-5 columnas). */
  compact?: boolean;
  /** Si true, muestra +/- en la parte de abajo y oculta el badge. */
  quickActions?: boolean;
  /** Si true, aplica una capa gris semitransparente (carta no poseída). */
  dimmed?: boolean;
  /** Set code where this variant was released, when it differs from the card's
   *  own set (e.g. "EB02" for Gold Leader parallels shown inside EB01). */
  sourceSet?: string;
  /** Si true, muestra un indicador de "varias artes poseídas". */
  multiArt?: boolean;
  /** Si true, dibuja un borde/overlay de selección (modo multi-select). */
  selected?: boolean;
  /** Explicit pixel width; overrides the default '100%' flex width. */
  width?: number;
  /** Override the variant used for image/display (default: variants[0]). */
  variant?: Variant;
  /** Inline +/- controls below the footer. qty = count shown between buttons. */
  onAdjust?: (delta: number) => void;
  /** Current count displayed in inline controls (when onAdjust is provided). */
  qty?: number;
  /** Muestra el footer (nombre + código) incluso en modo quickActions. */
  showFooter?: boolean;
  /** Modo "en vivo": deriva la cantidad poseída de ownedAggregate suscribiéndose
   *  internamente. Evita que el padre re-renderice toda la lista al editar una
   *  copia. Sustituye a `owned`/`qty`/`multiArt`/`dimmed` cuando está presente. */
  liveCode?: string;
  /** Con liveCode: cuenta la variante concreta (true) o el total del código (false). */
  livePerVariant?: boolean;
  /** Con liveCode: muestra el indicador de varias artes cuando posees ≥2 variantes. */
  liveMultiArt?: boolean;
  /** Con liveCode: aplica el overlay gris cuando la cantidad en vivo es 0. */
  dimWhenEmpty?: boolean;
  onPress?: () => void;
  onLongPress?: () => void;
};

function CardThumbBase({
  card,
  owned = 0,
  compact = false,
  quickActions = false,
  dimmed = false,
  sourceSet,
  multiArt = false,
  selected = false,
  width,
  variant,
  onAdjust,
  qty = 0,
  showFooter = false,
  liveCode,
  livePerVariant = false,
  liveMultiArt = false,
  dimWhenEmpty = false,
  onPress,
  onLongPress,
}: Props) {
  // Cantidad en vivo (cuando liveCode está presente). En modo per-variante usamos
  // el suffix de la variante explícita (siempre provista en ese modo).
  const liveOwned = useLiveOwned(liveCode, livePerVariant ? (variant?.suffix ?? '') : undefined);
  const liveVarCount = useLiveVariantCount(liveCode != null && liveMultiArt ? liveCode : undefined);

  const live = liveCode != null;
  const effectiveOwned = live ? liveOwned : owned;
  const effectiveMultiArt = live ? liveMultiArt && liveVarCount >= 2 : multiArt;
  const effectiveDimmed = live ? dimWhenEmpty && effectiveOwned === 0 : dimmed;
  const displayQty = live ? effectiveOwned : qty;
  // Variante mostrada encima: la más rara que se posea; en quickActions siempre
  // se usa variants[0] (o el override explícito) para no cambiar el control +/-.
  const v = (() => {
    if (variant) return variant;
    if (!quickActions && effectiveOwned > 0) {
      const ownedVars = card.variants
        .filter(vv => getCountSync(card.code, vv.suffix) > 0)
        .sort((a, b) => rarityRank(b.rarity) - rarityRank(a.rarity));
      if (ownedVars.length > 0) return ownedVars[0];
    }
    return card.variants[0];
  })();
  const { uri: primaryUrl, fallback: fallbackUrl } = v ? resolveImageUris(v) : { uri: '', fallback: undefined };

  // Capas fantasma: min(owned, MAX_STACK) - 1, nunca en quickActions ni compacto
  const ghostCount = quickActions ? 0 : Math.max(0, Math.min(effectiveOwned, MAX_STACK) - 1);

  // Hold-repeat: mantener pulsado → incrementar/decrementar continuamente.
  const holdRef = useRef<{ t?: ReturnType<typeof setTimeout>; i?: ReturnType<typeof setInterval> }>({});
  const stopHold = () => {
    clearTimeout(holdRef.current.t);
    clearInterval(holdRef.current.i);
    holdRef.current.t = undefined;
    holdRef.current.i = undefined;
  };
  const startHold = (action: () => void) => {
    // Idempotente: limpia cualquier timer pendiente antes de programar uno nuevo.
    // Sin esto, pulsar muy rápido encadena onPressIn sin su onPressOut, dejando
    // setTimeout/​setInterval huérfanos que disparan adjust() para siempre
    // (cientos de copias añadidas solas). Ver bug "buffering" al añadir rápido.
    stopHold();
    action();
    holdRef.current.t = setTimeout(() => {
      holdRef.current.i = setInterval(action, 80);
    }, 350);
  };
  // Limpia timers si la miniatura se desmonta a mitad de un hold (p.ej. al
  // hacer scroll con removeClippedSubviews) — evita un interval huérfano.
  useEffect(() => stopHold, []);

  // Para los +/- locales (modo quickActions sin liveCode) necesitamos el count
  // de la variante mostrada. En modo live, el badge usa effectiveOwned.
  const [vCount, setVCount] = useState(0);
  useEffect(() => {
    if (live || !quickActions || !v) return;
    let alive = true;
    getCount(card.code, v.suffix).then((n) => alive && setVCount(n));
    const unsub = subColl(() => {
      if (alive) setVCount(getCountSync(card.code, v.suffix));
    });
    return () => {
      alive = false;
      unsub();
    };
  }, [quickActions, card.code, v]);

  const qaCount = live ? effectiveOwned : vCount;

  return (
    <Pressable
      onPress={onPress}
      onLongPress={onLongPress}
      // Sin rol "button" cuando hay +/- anidados: en web evita un <button>
      // dentro de otro <button> (HTML inválido) sin afectar el comportamiento.
      accessibilityRole={(quickActions && v) || onAdjust ? undefined : 'button'}
      accessibilityLabel={`${card.name} ${card.code}`}
      style={({ pressed }) => [styles.wrap, width !== undefined && { width }, pressed && pressedSurface]}
    >
      {/* Contenedor externo: define tamaño, permite overflow para las capas fantasma */}
      <View style={styles.imgContainer}>
        {/* Capas fantasma: de atrás (i=0) hacia adelante (i=ghostCount-1) */}
        {Array.from({ length: ghostCount }, (_, i) => {
          const depth = ghostCount - i; // i=0 → más al fondo → mayor offset
          return (
            <View
              key={i}
              style={[
                StyleSheet.absoluteFill,
                styles.ghost,
                {
                  transform: [
                    { translateX: depth * STACK_OFFSET },
                    { translateY: depth * STACK_OFFSET },
                  ],
                  zIndex: i,
                },
              ]}
            />
          );
        })}

        {/* Carta principal (la más rara poseída, encima del stack) */}
        <View style={[StyleSheet.absoluteFill, styles.imgMain, { zIndex: ghostCount + 1 }]}>
          {primaryUrl ? (
            <CachedImage
              uri={primaryUrl}
              fallbackUri={fallbackUrl}
              style={styles.img}
              placeholderBg={colors.surface2}
            />
          ) : (
            <View style={[styles.img, styles.fallback]}>
              <Text style={styles.fallbackText}>{card.code}</Text>
            </View>
          )}

          {/* Dim overlay for missing cards. */}
          {effectiveDimmed && <View style={styles.dimOverlay} />}

          {/* Selection ring (multi-select mode). */}
          {selected && <View style={styles.selOverlay} />}

          {/* Multi-art indicator: owned across several art versions. */}
          {effectiveMultiArt && (
            <View style={styles.multiArt}>
              <Icon name="layers" size={12} color={colors.onAccent} stroke={2} />
            </View>
          )}

          {/* Source-set badge: shown when this variant released in a different set. */}
          {sourceSet && (
            <View style={styles.sourceSetBadge}>
              <Text style={styles.sourceSetText}>{sourceSet}</Text>
            </View>
          )}

          {/* Quick actions: dos botones circulares grandes centrados abajo.
              onPressIn inicia; mantener pulsado repite a 80 ms tras 350 ms. */}
          {quickActions && v ? (
            <View style={styles.qa}>
              <Pressable
                onPressIn={() => qaCount > 0 && startHold(() => adjust(card.code, v.suffix, -1))}
                onPressOut={stopHold}
                disabled={qaCount <= 0}
                hitSlop={HIT_SLOP}
                accessibilityRole="button"
                accessibilityLabel={`Remove one ${card.code}`}
                style={({ pressed }) => [styles.qaBtn, qaCount <= 0 && styles.qaBtnOff, pressed && pressedStyle]}
              >
                <Text style={styles.qaSign}>−</Text>
              </Pressable>
              <Pressable
                onPressIn={() => startHold(() => adjust(card.code, v.suffix, +1))}
                onPressOut={stopHold}
                hitSlop={HIT_SLOP}
                accessibilityRole="button"
                accessibilityLabel={`Add one ${card.code}`}
                style={({ pressed }) => [styles.qaBtn, pressed && pressedStyle]}
              >
                <Text style={styles.qaSign}>+</Text>
              </Pressable>
            </View>
          ) : null}
        </View>
      </View>

      {/* Count bubble — bleeds out of top-right corner of the image. */}
      {!quickActions && effectiveOwned > 0 && (
        <View style={styles.countBubble}>
          <Text style={styles.countBubbleText}>×{effectiveOwned}</Text>
        </View>
      )}

      {/* quickActions counter bubble: en modo live usa effectiveOwned, si no vCount */}
      {quickActions && (live ? effectiveOwned : vCount) > 0 && (
        <View style={styles.countBubble}>
          <Text style={styles.countBubbleText}>×{live ? effectiveOwned : vCount}</Text>
        </View>
      )}

      {/* Footer: card name bold + card ID below */}
      {(!quickActions || showFooter) && (
        <View style={styles.footer}>
          <Text style={[styles.cardName, compact && styles.cardNameSm]} numberOfLines={1}>{card.name}</Text>
          <Text style={[styles.code, compact && styles.codeSm]} numberOfLines={1}>
            {card.code}{v?.rarity ? ` · ${v.rarity}` : ''}
          </Text>
        </View>
      )}

      {/* Inline ±  controls — shown whenever onAdjust is provided */}
      {!quickActions && onAdjust && (
        <View style={styles.inlineControls}>
          <Counter value={displayQty} onAdjust={onAdjust} size="sm" label={card.code} />
        </View>
      )}
    </Pressable>
  );
}

// Memoizada: en un grid, editar una carta solo re-renderiza esa miniatura.
// Las props son refs estables (card/variant del índice) + callbacks estables
// desde renderItem, así el resto de celdas no se re-renderizan.
export const CardThumb = React.memo(CardThumbBase);

const styles = StyleSheet.create({
  wrap: { width: '100%', overflow: 'visible' },
  // Contenedor del stack: define el tamaño de la imagen y permite overflow visible
  // para que las capas fantasma asomen por fuera.
  imgContainer: {
    width: '100%',
    aspectRatio: 200 / 280,
    position: 'relative',
    overflow: 'visible',
  },
  // La carta principal (clipping container para la imagen y los overlays).
  imgMain: {
    borderRadius: 14,
    overflow: 'hidden',
    backgroundColor: colors.surface2,
  },
  // Capa fantasma: rectángulo con forma de carta que asoma detrás de la principal.
  ghost: {
    borderRadius: 14,
    backgroundColor: colors.surface2,
    borderWidth: 1,
    borderColor: colors.border,
    shadowColor: '#000',
    shadowOpacity: 0.35,
    shadowRadius: 4,
    shadowOffset: { width: 1, height: 2 },
    elevation: 2,
  },
  img: { width: '100%', height: '100%' },
  fallback: { alignItems: 'center', justifyContent: 'center' },
  fallbackText: { color: colors.textDim, fontSize: 12 },
  qa: {
    position: 'absolute',
    bottom: '12%',
    left: 0,
    right: 0,
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 14,
  },
  qaBtn: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: 'rgba(244,246,249,0.92)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  qaBtnOff: { backgroundColor: 'rgba(244,246,249,0.4)' },
  qaSign: { color: '#0d0f14', fontSize: 22, fontFamily: fonts.uiBold, lineHeight: 26 },
  // Bleeds slightly outside the top-right corner of the card image.
  countBubble: {
    position: 'absolute',
    top: -7,
    right: -7,
    minWidth: 26,
    height: 26,
    paddingHorizontal: 6,
    borderRadius: 13,
    backgroundColor: colors.badge,
    borderWidth: 2,
    borderColor: colors.bg,
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 10,
  },
  countBubbleText: { fontSize: 12, color: colors.onAccent, fontFamily: fonts.uiBold },
  footer: { marginTop: 5, marginBottom: 2 },
  inlineControls: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    marginTop: 4,
  },
  inlineBtn: {
    width: 26,
    height: 26,
    borderRadius: 13,
    backgroundColor: colors.surface2,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  inlineSign: { fontSize: 16, color: colors.text, fontFamily: fonts.uiBold, lineHeight: 20 },
  inlineQty: {
    fontSize: 13,
    fontFamily: fonts.display,
    color: colors.text,
    minWidth: 16,
    textAlign: 'center',
  },
  cardName: { fontSize: 11, fontFamily: fonts.uiBold, color: colors.text, lineHeight: 14 },
  cardNameSm: { fontSize: 9.5 },
  code: { fontSize: 10, fontFamily: fonts.uiSemi, color: colors.textMut, lineHeight: 13 },
  codeSm: { fontSize: 8.5 },
  dimOverlay: {
    ...StyleSheet.absoluteFill,
    backgroundColor: 'rgba(19,16,25,0.65)',
  },
  selOverlay: {
    ...StyleSheet.absoluteFill,
    borderWidth: 3,
    borderColor: colors.accent,
    borderRadius: 14,
    backgroundColor: colors.accentDim,
  },
  multiArt: {
    position: 'absolute',
    top: 5,
    left: 5,
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: colors.accent,
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 10,
  },
  sourceSetBadge: {
    position: 'absolute',
    bottom: 5,
    left: 5,
    paddingHorizontal: 5,
    paddingVertical: 2,
    borderRadius: 4,
    backgroundColor: 'rgba(19,16,25,0.78)',
    zIndex: 10,
  },
  sourceSetText: { fontSize: 9, fontFamily: fonts.uiBold, color: '#fff', letterSpacing: 0.3 },
});
