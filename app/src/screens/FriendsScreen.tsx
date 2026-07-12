// FriendsScreen — search players by username, manage incoming/outgoing requests,
// and list confirmed friends. Tapping a friend opens their profile (FriendProfile),
// which shows whatever they've shared (RLS-gated server-side).

import React, { useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { FriendsScreenProps } from '../navigation';
import { smartGoBack } from '../lib/nav';
import { colors, fonts, radii, spacing, pressedStyle, pressedSurface, HIT_SLOP } from '../theme';
import { Icon } from '../components/Icon';
import { useT } from '../lib/i18n';
import {
  acceptRequest,
  getFriends,
  getIncomingRequests,
  getOutgoingRequests,
  refreshEdges,
  removeEdge,
  searchUsers,
  sendRequest,
  subscribe as subFriends,
} from '../lib/friends';
import type { FriendEdge, FriendProfile } from '../types';

export function FriendsScreen({ navigation }: FriendsScreenProps) {
  const t = useT();
  const insets = useSafeAreaInsets();
  const [, force] = useState(0);
  useEffect(() => subFriends(() => force((n) => n + 1)), []);
  useEffect(() => { void refreshEdges(); }, []);

  const [query, setQuery] = useState('');
  const [results, setResults] = useState<FriendProfile[] | null>(null);
  const [searching, setSearching] = useState(false);

  const friends = getFriends();
  const incoming = getIncomingRequests();
  const outgoing = getOutgoingRequests();

  // ids already in some relationship → show "Requested"/hide in search.
  const knownIds = useMemo(
    () => new Set([...friends, ...incoming, ...outgoing].map((e) => e.profile.id)),
    [friends, incoming, outgoing],
  );

  useEffect(() => {
    const q = query.trim();
    if (q.length < 2) { setResults(null); return; }
    let active = true;
    setSearching(true);
    const handle = setTimeout(async () => {
      const r = await searchUsers(q);
      if (active) { setResults(r); setSearching(false); }
    }, 350);
    return () => { active = false; clearTimeout(handle); };
  }, [query]);

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <View style={[s.header, { paddingTop: insets.top + 12 }]}>
        <Pressable
          onPress={() => smartGoBack(navigation)}
          hitSlop={HIT_SLOP}
          accessibilityRole="button"
          accessibilityLabel={t('common.done')}
          style={({ pressed }) => [s.backBtn, pressed && pressedStyle]}
        >
          <Icon name="chevL" size={22} color={colors.text} />
        </Pressable>
        <Text style={s.headerTitle}>{t('friends.title')}</Text>
      </View>

      <ScrollView contentContainerStyle={s.scroll} keyboardShouldPersistTaps="handled">
        {/* Search */}
        <View style={s.searchBox}>
          <Icon name="search" size={18} color={colors.textMut} />
          <TextInput
            style={s.searchInput}
            value={query}
            onChangeText={setQuery}
            autoCapitalize="none"
            placeholder={t('friends.searchPlaceholder')}
            placeholderTextColor={colors.textDim}
          />
          {searching && <ActivityIndicator color={colors.accent} />}
        </View>

        {results !== null && (
          <View style={s.section}>
            {results.length === 0 ? (
              <Text style={s.desc}>{t('friends.noResults')}</Text>
            ) : (
              results.map((p) => (
                <View key={p.id} style={s.rowCard}>
                  <Avatar name={p.username} />
                  <Text style={s.name}>{p.username}</Text>
                  {knownIds.has(p.id) ? (
                    <Text style={s.mutedTag}>{t('friends.requested')}</Text>
                  ) : (
                    <Pressable
                      style={({ pressed }) => [s.btnSmall, pressed && pressedStyle]}
                      onPress={() => void sendRequest(p.id)}
                      accessibilityRole="button"
                      accessibilityLabel={t('friends.add')}
                    >
                      <Text style={s.btnSmallText}>{t('friends.add')}</Text>
                    </Pressable>
                  )}
                </View>
              ))
            )}
          </View>
        )}

        {/* Incoming requests */}
        {incoming.length > 0 && (
          <>
            <Text style={s.sectionLabel}>{t('friends.requests')}</Text>
            <View style={s.section}>
              {incoming.map((e) => (
                <View key={e.id} style={s.rowCard}>
                  <Avatar name={e.profile.username} />
                  <Text style={s.name}>{e.profile.username}</Text>
                  <Pressable
                    style={({ pressed }) => [s.btnSmall, pressed && pressedStyle]}
                    onPress={() => void acceptRequest(e.id)}
                    accessibilityRole="button"
                    accessibilityLabel={t('friends.accept')}
                  >
                    <Text style={s.btnSmallText}>{t('friends.accept')}</Text>
                  </Pressable>
                  <Pressable
                    style={({ pressed }) => [s.btnGhost, pressed && pressedStyle]}
                    onPress={() => void removeEdge(e.id)}
                    accessibilityRole="button"
                    accessibilityLabel={t('friends.decline')}
                  >
                    <Text style={s.btnGhostText}>{t('friends.decline')}</Text>
                  </Pressable>
                </View>
              ))}
            </View>
          </>
        )}

        {/* Outgoing requests */}
        {outgoing.length > 0 && (
          <View style={[s.section, { marginTop: 8 }]}>
            {outgoing.map((e) => (
              <View key={e.id} style={s.rowCard}>
                <Avatar name={e.profile.username} />
                <Text style={s.name}>{e.profile.username}</Text>
                <Text style={s.mutedTag}>{t('friends.requested')}</Text>
                <Pressable
                  style={({ pressed }) => [s.btnGhost, pressed && pressedStyle]}
                  onPress={() => void removeEdge(e.id)}
                  accessibilityRole="button"
                  accessibilityLabel={t('friends.cancel')}
                >
                  <Text style={s.btnGhostText}>{t('friends.cancel')}</Text>
                </Pressable>
              </View>
            ))}
          </View>
        )}

        {/* Friends list */}
        <Text style={s.sectionLabel}>{t('friends.yourFriends')}</Text>
        {friends.length === 0 ? (
          <View style={s.empty}>
            <Text style={s.emptyTitle}>{t('friends.empty')}</Text>
            <Text style={s.desc}>{t('friends.emptyDesc')}</Text>
          </View>
        ) : (
          <View style={s.section}>
            {friends.map((e: FriendEdge) => (
              <Pressable
                key={e.id}
                style={({ pressed }) => [s.rowCard, pressed && pressedSurface]}
                onPress={() =>
                  navigation.navigate('FriendProfile', { userId: e.profile.id, username: e.profile.username })
                }
                accessibilityRole="button"
                accessibilityLabel={e.profile.username}
              >
                <Avatar name={e.profile.username} />
                <Text style={s.name}>{e.profile.username}</Text>
                <Icon name="chevR" size={18} color={colors.textMut} />
              </Pressable>
            ))}
          </View>
        )}
      </ScrollView>
    </View>
  );
}

function Avatar({ name }: { name: string }) {
  return (
    <View style={s.avatar}>
      <Text style={s.avatarText}>{name.slice(0, 1).toUpperCase()}</Text>
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
  scroll: { padding: spacing.lg, gap: 10, paddingBottom: 110 },
  searchBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: colors.surface,
    borderRadius: radii.lg,
    borderWidth: 1,
    borderColor: colors.border,
    paddingHorizontal: 14,
  },
  searchInput: { flex: 1, color: colors.text, fontFamily: fonts.ui, fontSize: 15, paddingVertical: 12 },
  section: { gap: 8 },
  sectionLabel: {
    fontSize: 12,
    fontFamily: fonts.uiSemi,
    color: colors.textMut,
    textTransform: 'uppercase',
    letterSpacing: 0.6,
    marginTop: 16,
  },
  desc: { fontSize: 12, fontFamily: fonts.ui, color: colors.textMut },
  rowCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: colors.surface,
    borderRadius: radii.lg,
    borderWidth: 1,
    borderColor: colors.border,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  avatar: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: colors.accentDim,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarText: { fontSize: 16, fontFamily: fonts.display, color: colors.accent },
  name: { flex: 1, fontSize: 15, fontFamily: fonts.uiSemi, color: colors.text },
  mutedTag: { fontSize: 12, fontFamily: fonts.uiSemi, color: colors.textMut },
  btnSmall: {
    paddingHorizontal: 14,
    paddingVertical: 7,
    borderRadius: radii.md,
    backgroundColor: colors.accent,
  },
  btnSmallText: { fontSize: 13, fontFamily: fonts.uiSemi, color: colors.onAccent },
  btnGhost: { paddingHorizontal: 10, paddingVertical: 7 },
  btnGhostText: { fontSize: 13, fontFamily: fonts.uiSemi, color: colors.textMut },
  empty: { gap: 4, paddingVertical: 12 },
  emptyTitle: { fontSize: 16, fontFamily: fonts.display, color: colors.text },
});
