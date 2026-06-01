// Sets: lista de expansiones agrupadas por tipo con secciones colapsables.

import React, { useEffect, useMemo, useState } from 'react';
import {
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { RootStackParamList } from '../navigation';
type SetsScreenProps = NativeStackScreenProps<RootStackParamList, 'Sets'>;
import { colors, fonts } from '../theme';
import { Icon } from '../components/Icon';
import { listSetCodes, summarizeSet, type SetSummary } from '../lib/setsStats';
import { setNameFor, setDateFor } from '../lib/setMeta';
import { SetBadge } from '../components/SetBadge';
import { subscribe as subOwned } from '../lib/ownedAggregate';
import { subscribe as subSettings } from '../lib/settings';
import { useT } from '../lib/i18n';

type GroupKey = 'regular' | 'starter' | 'promo' | 'other';

function setGroupOf(code: string): GroupKey {
  if (/^(OP|EB|PRB)\d/.test(code)) return 'regular';
  if (/^ST\d/.test(code)) return 'starter';
  if (code === 'P') return 'promo';
  return 'other';
}

export function SetsScreen({ navigation }: SetsScreenProps) {
  const t = useT();
  const [, force] = useState(0);
  const [expanded, setExpanded] = useState<Record<GroupKey, boolean>>({
    regular: true,
    starter: false,
    promo: false,
    other: false,
  });

  useEffect(() => {
    const u1 = subOwned(() => force((n) => n + 1));
    const u2 = subSettings(() => force((n) => n + 1));
    return () => { u1(); u2(); };
  }, []);

  const setCodes = useMemo(() => listSetCodes(), []);
  const live = setCodes.map((code) => summarizeSet(code));

  const groups = useMemo<Record<GroupKey, SetSummary[]>>(() => {
    const g: Record<GroupKey, SetSummary[]> = {
      regular: [], starter: [], promo: [], other: [],
    };
    for (const s of live) g[setGroupOf(s.code)].push(s);
    return g;
  }, [live]);

  const groupLabel: Record<GroupKey, string> = {
    regular: t('sets.groupBooster'),
    starter: t('sets.groupStarter'),
    promo: t('sets.groupPromo'),
    other: t('sets.groupOther'),
  };

  const toggle = (key: GroupKey) =>
    setExpanded((prev) => ({ ...prev, [key]: !prev[key] }));

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <View style={s.metaRow}>
        <Text style={s.meta}>{live.length} {t('sets.title')}</Text>
      </View>
      <ScrollView contentContainerStyle={s.scroll}>
        {(['regular', 'starter', 'promo', 'other'] as GroupKey[]).map((key) => {
          const items = groups[key];
          if (items.length === 0) return null;
          const open = expanded[key];
          return (
            <View key={key}>
              {/* Section header */}
              <Pressable style={s.sectionHeader} onPress={() => toggle(key)}>
                <Text style={s.sectionLabel}>{groupLabel[key]}</Text>
                <Text style={s.sectionCount}>{items.length}</Text>
                <Icon
                  name={open ? 'chevD' : 'chevR'}
                  size={16}
                  color={colors.textDim}
                />
              </Pressable>

              {/* Section rows */}
              {open && items.map((item) => (
                <Pressable
                  key={item.code}
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
                      <View style={[s.barFill, { width: `${item.pct}%` }]} />
                    </View>
                    <Text style={s.sub}>{item.owned} / {item.total} cards</Text>
                  </View>
                </Pressable>
              ))}
            </View>
          );
        })}
      </ScrollView>
    </View>
  );
}

const s = StyleSheet.create({
  metaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 18,
    paddingVertical: 12,
  },
  meta: {
    color: colors.textDim,
    fontFamily: fonts.ui,
    fontSize: 13,
  },
  scroll: {
    paddingHorizontal: 18,
    paddingBottom: 110,
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 10,
    gap: 8,
  },
  sectionLabel: {
    flex: 1,
    fontSize: 13,
    fontFamily: fonts.uiBold,
    color: colors.text,
    letterSpacing: 0.2,
  },
  sectionCount: {
    fontSize: 12,
    fontFamily: fonts.uiSemi,
    color: colors.textDim,
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
