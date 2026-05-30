// Sets: lista de expansiones con progreso de coleccion. Tap -> SetDetail.

import React, { useEffect, useMemo, useState } from 'react';
import {
  FlatList,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { RootStackParamList } from '../navigation';
type SetsScreenProps = NativeStackScreenProps<RootStackParamList, 'Sets'>;
import { colors, fonts } from '../theme';
import { listSetCodes, summarizeSet } from '../lib/setsStats';
import { setNameFor, setDateFor } from '../lib/setMeta';
import { SetBadge } from '../components/SetBadge';
import { subscribe as subOwned } from '../lib/ownedAggregate';

export function SetsScreen({ navigation }: SetsScreenProps) {
  const [, force] = useState(0);
  useEffect(() => subOwned(() => force((n) => n + 1)), []);

  const sets = useMemo(() => {
    return listSetCodes().map((code) => summarizeSet(code));
  }, []);

  // Recalculamos tras cada cambio en collection. summarizeSet usa CARDS_BY_SET
  // pero los owned son dinamicos, asi que forzamos rerender en lugar de memo.
  const live = sets.map((s) => summarizeSet(s.code));

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <Text style={s.meta}>{live.length} sets</Text>
      <FlatList
        data={live}
        keyExtractor={(it) => it.code}
        contentContainerStyle={{ paddingHorizontal: 18, paddingBottom: 110 }}
        renderItem={({ item }) => (
          <Pressable
            onPress={() => navigation.navigate('SetDetail', { setCode: item.code })}
            style={s.row}
          >
            <SetBadge setCode={item.code} size={56} />
            <View style={{ flex: 1 }}>
              <View style={s.headRow}>
                <Text style={s.title}>{setNameFor(item.code)}</Text>
                <Text style={s.pct}>{item.pct}%</Text>
              </View>
              {setDateFor(item.code) ? (
                <Text style={s.date}>{setDateFor(item.code)}</Text>
              ) : null}
              <View style={s.barTrack}>
                <View
                  style={[
                    s.barFill,
                    { width: `${item.pct}%` },
                  ]}
                />
              </View>
              <Text style={s.sub}>
                {item.owned} / {item.total} cards
              </Text>
            </View>
          </Pressable>
        )}
      />
    </View>
  );
}

const s = StyleSheet.create({
  meta: {
    color: colors.textDim,
    fontFamily: fonts.ui,
    fontSize: 13,
    paddingHorizontal: 18,
    paddingVertical: 12,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 14,
    padding: 14,
    marginBottom: 12,
  },
  date: {
    fontSize: 12,
    fontFamily: fonts.ui,
    color: colors.textMut,
    marginTop: 2,
  },
  headRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    justifyContent: 'space-between',
  },
  title: {
    fontSize: 15,
    fontFamily: fonts.display,
    color: colors.text,
    flex: 1,
    marginRight: 8,
  },
  pct: {
    fontSize: 14,
    fontFamily: fonts.uiBold,
    color: colors.accent,
  },
  barTrack: {
    height: 6,
    backgroundColor: colors.surface2,
    borderRadius: 99,
    marginTop: 8,
    overflow: 'hidden',
  },
  barFill: {
    height: '100%',
    backgroundColor: colors.accent,
    borderRadius: 99,
  },
  sub: {
    fontSize: 12,
    fontFamily: fonts.ui,
    color: colors.textDim,
    marginTop: 6,
  },
});
