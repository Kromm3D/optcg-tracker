// PublicBinderScreen — el binder de alguien, visto desde un enlace.
//
// A diferencia de FriendProfileScreen, aquí NO se asume sesión: es la pantalla
// que ve alguien que ha pinchado un link compartido y puede que ni tenga la
// app instalada (build web). Por eso es de sólo lectura, sin acciones sobre la
// colección propia, y con una llamada a la acción al final.
//
// Los metadatos de cada carta salen del índice local (CARDS); por el cable
// sólo viajan las tuplas (code, suffix, count) del dueño.

import React, { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { PublicBinderScreenProps } from '../navigation';
import { colors, fonts, radii, spacing, pressedStyle } from '../theme';
import { Icon } from '../components/Icon';
import { CachedImage } from '../components/CachedImage';
import { useT } from '../lib/i18n';
import { CARDS } from '../data/loadIndex';
import { resolveImageUris } from '../lib/images';
import { fetchPublicBinder, type PublicBinder } from '../lib/publicBinder';

export function PublicBinderScreen({ route, navigation }: PublicBinderScreenProps) {
  const { username } = route.params;
  const t = useT();
  const insets = useSafeAreaInsets();
  // undefined = cargando, null = nada público que enseñar.
  const [binder, setBinder] = useState<PublicBinder | null | undefined>(undefined);

  useEffect(() => {
    void fetchPublicBinder(username).then(setBinder);
  }, [username]);

  // Se ordena por código para que el binder se lea como un catálogo, no como
  // el orden en que el dueño fue añadiendo cartas.
  const entries = useMemo(() => {
    if (!binder) return [];
    return [...binder.collection]
      .filter((i) => i.count > 0)
      .sort((a, b) => a.key.localeCompare(b.key, undefined, { numeric: true }));
  }, [binder]);

  const totals = useMemo(
    () => ({ unique: entries.length, units: entries.reduce((n, i) => n + i.count, 0) }),
    [entries],
  );

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <View style={[s.header, { paddingTop: insets.top + 12 }]}>
        <Text style={s.headerTitle}>{username}</Text>
        {binder ? (
          <Text style={s.headerSub}>
            {totals.unique} {t('binder.uniqueCards')} · {totals.units} {t('binder.units')}
          </Text>
        ) : null}
      </View>

      <ScrollView contentContainerStyle={s.scroll}>
        {binder === undefined ? (
          <ActivityIndicator color={colors.accent} style={{ marginTop: 40 }} />
        ) : binder === null ? (
          <View style={s.empty}>
            <Icon name="close" size={28} color={colors.textDim} />
            <Text style={s.emptyTitle}>{t('public.notFound')}</Text>
            <Text style={s.desc}>{t('public.notFoundDesc')}</Text>
          </View>
        ) : (
          <>
            <View style={s.grid}>
              {entries.map((item) => {
                const card = CARDS[item.code];
                const variant = card?.variants.find((v) => v.suffix === item.suffix) ?? card?.variants[0];
                if (!variant) return null;
                const { uri, fallback } = resolveImageUris(variant);
                return (
                  <View key={item.key} style={s.cell}>
                    <View>
                      <CachedImage uri={uri} fallbackUri={fallback} style={s.img} placeholderBg={colors.surface2} />
                      {item.count > 1 ? (
                        <View style={s.countBubble}>
                          <Text style={s.countText}>×{item.count}</Text>
                        </View>
                      ) : null}
                    </View>
                    <Text style={s.code} numberOfLines={1}>{item.code}{item.suffix}</Text>
                  </View>
                );
              })}
            </View>

            <Pressable
              onPress={() => navigation.navigate('Tabs', { screen: 'Home' })}
              accessibilityRole="button"
              style={({ pressed }) => [s.cta, pressed && pressedStyle]}
            >
              <Text style={s.ctaText}>{t('public.cta')}</Text>
            </Pressable>
          </>
        )}
      </ScrollView>
    </View>
  );
}

const s = StyleSheet.create({
  header: { paddingHorizontal: 18, paddingBottom: 12, gap: 2 },
  headerTitle: { fontSize: 22, fontFamily: fonts.display, color: colors.text },
  headerSub: { fontSize: 13, fontFamily: fonts.ui, color: colors.textMut },
  scroll: { padding: 18, gap: 18, paddingBottom: 60 },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, justifyContent: 'space-between' },
  cell: { width: '31%' },
  img: { width: '100%', aspectRatio: 5 / 7, borderRadius: radii.md },
  countBubble: {
    position: 'absolute',
    top: -6,
    right: -6,
    minWidth: 22,
    paddingHorizontal: 5,
    paddingVertical: 2,
    borderRadius: 999,
    backgroundColor: colors.accent,
    alignItems: 'center',
  },
  countText: { fontSize: 10, fontFamily: fonts.uiBold, color: colors.onAccent },
  code: { fontSize: 10, fontFamily: fonts.uiSemi, color: colors.textMut, marginTop: 4 },
  empty: { alignItems: 'center', gap: 8, paddingVertical: 60 },
  emptyTitle: { fontSize: 16, fontFamily: fonts.uiBold, color: colors.text },
  desc: { fontSize: 13, fontFamily: fonts.ui, color: colors.textMut, textAlign: 'center' },
  cta: {
    alignItems: 'center',
    backgroundColor: colors.accent,
    borderRadius: radii.lg,
    paddingVertical: 14,
    marginTop: spacing.lg,
  },
  ctaText: { fontSize: 15, fontFamily: fonts.uiBold, color: colors.onAccent },
});
