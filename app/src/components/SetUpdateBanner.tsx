// Aviso de "set nuevo disponible" en Home. Aparece solo cuando lib/remoteIndex
// ya descargó y validó un índice más reciente en segundo plano — nunca antes,
// así que tocarlo nunca falla. Tap = aplica el índice nuevo y vuelve a Tabs;
// la X descarta el aviso para esta sesión (vuelve a aparecer en el próximo
// arranque mientras no se aplique, vía lib/remoteIndex).
import React, { useEffect, useRef, useState } from 'react';
import { AccessibilityInfo, Animated, Pressable, StyleSheet, Text, View } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { getPendingUpdate, subscribe as subRemoteIndex, applyPendingUpdate } from '../lib/remoteIndex';
import { colors, fonts, radii, spacing, type, pressedSurface, pressedStyle, HIT_SLOP } from '../theme';
import { Icon } from './Icon';
import { useT } from '../lib/i18n';

export function SetUpdateBanner() {
  const t = useT();
  const navigation = useNavigation<any>();
  const [update, setUpdate] = useState(getPendingUpdate());
  const [dismissed, setDismissed] = useState(false);
  const opacity = useRef(new Animated.Value(0)).current;
  const translateY = useRef(new Animated.Value(-8)).current;

  useEffect(() => subRemoteIndex(() => setUpdate(getPendingUpdate())), []);

  const visible = !!update && !dismissed;

  useEffect(() => {
    if (!visible) return;
    let duration = 280;
    AccessibilityInfo.isReduceMotionEnabled?.().then((reduced) => {
      if (reduced) duration = 0;
      Animated.parallel([
        Animated.timing(opacity, { toValue: 1, duration, useNativeDriver: true }),
        Animated.timing(translateY, { toValue: 0, duration, useNativeDriver: true }),
      ]).start();
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible]);

  if (!visible || !update) return null;

  const message =
    update.newSets.length > 1
      ? t('setUpdate.bannerMulti')
      : t('setUpdate.bannerSingle', { set: update.newestSet ?? update.newSets[0] ?? '' });

  const onApply = () => {
    applyPendingUpdate();
    // Reset dentro del propio tab navigator (no del stack raiz): "Home" es la
    // entry tab, y este componente vive dentro de ese navigator.
    navigation.reset({ index: 0, routes: [{ name: 'Home' }] });
  };

  return (
    <Animated.View style={{ opacity, transform: [{ translateY }] }}>
      {/* Sin rol 'button' en el contenedor: hay un botón Dismiss anidado
          (ver mismo fix en CardThumb.tsx) — evita <button> dentro de <button>
          (HTML inválido) sin afectar el tap-to-apply. */}
      <Pressable
        onPress={onApply}
        accessibilityLabel={message}
        style={({ pressed }) => [s.banner, pressed && pressedSurface]}
      >
        <View style={s.iconWrap}>
          <Icon name="ghost" size={18} color={colors.ghost} stroke={1.8} />
        </View>
        <Text style={s.msg} numberOfLines={2}>{message}</Text>
        <Pressable
          onPress={() => setDismissed(true)}
          accessibilityRole="button"
          accessibilityLabel={t('setUpdate.dismiss')}
          hitSlop={HIT_SLOP}
          style={({ pressed }) => [s.dismissBtn, pressed && pressedStyle]}
        >
          <Icon name="close" size={14} color={colors.textMut} stroke={2} />
        </Pressable>
      </Pressable>
    </Animated.View>
  );
}

const s = StyleSheet.create({
  banner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    marginHorizontal: spacing.lg,
    marginBottom: spacing.md,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
    borderRadius: radii.lg,
    backgroundColor: colors.ghostDim,
    borderWidth: 1,
    borderColor: colors.ghostGlow,
  },
  iconWrap: { width: 28, height: 28, borderRadius: radii.md, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.surface2 },
  msg: { flex: 1, fontSize: type.label, fontFamily: fonts.uiSemi, color: colors.text },
  dismissBtn: { width: 28, height: 28, alignItems: 'center', justifyContent: 'center' },
});
