// AccountScreen — auth (sign in/up), profile, cloud-sync controls and the
// per-resource privacy toggles. The whole screen degrades gracefully when the
// Supabase backend is not configured (config.ts). The app stays fully usable
// offline regardless of sign-in state.

import React, { useEffect, useState } from 'react';
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
import type { AccountScreenProps } from '../navigation';
import { colors, fonts, radii, spacing, pressedStyle, HIT_SLOP } from '../theme';
import { Icon } from '../components/Icon';
import { useT } from '../lib/i18n';
import { isSupabaseEnabled } from '../lib/supabase';
import {
  getProfile,
  isSignedIn,
  signIn,
  signOut,
  signUp,
  subscribe as subAuth,
} from '../lib/auth';
import {
  getLastSyncedAt,
  getSyncStatus,
  subscribe as subSync,
  syncNow,
} from '../lib/sync';
import { getPrivacy, setPrivacy } from '../lib/friends';
import type { PrivacySettings, Visibility } from '../types';

const VIS_OPTIONS: Visibility[] = ['public', 'friends', 'private'];
const VIS_LABEL = {
  public: 'account.visPublic',
  friends: 'account.visFriends',
  private: 'account.visPrivate',
} as const;

export function AccountScreen({ navigation }: AccountScreenProps) {
  const t = useT();
  const insets = useSafeAreaInsets();
  const [, force] = useState(0);
  useEffect(() => subAuth(() => force((n) => n + 1)), []);
  useEffect(() => subSync(() => force((n) => n + 1)), []);

  const enabled = isSupabaseEnabled();
  const signedIn = isSignedIn();

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
        <Text style={s.headerTitle}>{t('account.title')}</Text>
      </View>

      <ScrollView contentContainerStyle={s.scroll}>
        {!enabled ? (
          <View style={s.box}>
            <Text style={s.boxTitle}>{t('account.disabled')}</Text>
            <Text style={s.desc}>{t('account.disabledDesc')}</Text>
          </View>
        ) : signedIn ? (
          <SignedInView onOpenFriends={() => navigation.navigate('Friends')} />
        ) : (
          <AuthForm />
        )}
      </ScrollView>
    </View>
  );
}

// ─── Signed-out: auth form ──────────────────────────────────────────────────

function AuthForm() {
  const t = useT();
  const [mode, setMode] = useState<'signin' | 'signup'>('signin');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [username, setUsername] = useState('');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  async function submit() {
    setBusy(true);
    setMsg(null);
    const res =
      mode === 'signin'
        ? await signIn(email, password)
        : await signUp(email, password, username);
    setBusy(false);
    if (!res.ok) setMsg(res.error ?? 'error');
    else if (res.needsConfirmation) setMsg(t('account.checkEmail'));
  }

  return (
    <View style={{ gap: 12 }}>
      <Text style={s.desc}>{t('account.localFirst')}</Text>

      <Text style={s.sectionLabel}>{t('account.email')}</Text>
      <TextInput
        style={s.input}
        value={email}
        onChangeText={setEmail}
        autoCapitalize="none"
        keyboardType="email-address"
        placeholder="you@example.com"
        placeholderTextColor={colors.textDim}
      />

      {mode === 'signup' && (
        <>
          <Text style={s.sectionLabel}>{t('account.username')}</Text>
          <TextInput
            style={s.input}
            value={username}
            onChangeText={setUsername}
            autoCapitalize="none"
            placeholder="luffy"
            placeholderTextColor={colors.textDim}
          />
        </>
      )}

      <Text style={s.sectionLabel}>{t('account.password')}</Text>
      <TextInput
        style={s.input}
        value={password}
        onChangeText={setPassword}
        secureTextEntry
        placeholder="••••••••"
        placeholderTextColor={colors.textDim}
      />

      {msg && <Text style={s.msg}>{msg}</Text>}

      <Pressable
        style={({ pressed }) => [s.btnPrimary, pressed && pressedStyle]}
        onPress={submit}
        disabled={busy}
        accessibilityRole="button"
        accessibilityLabel={mode === 'signin' ? t('account.signIn') : t('account.signUp')}
      >
        {busy ? (
          <ActivityIndicator color="#fff" />
        ) : (
          <Text style={s.btnPrimaryText}>
            {mode === 'signin' ? t('account.signIn') : t('account.signUp')}
          </Text>
        )}
      </Pressable>

      <Pressable
        onPress={() => { setMode(mode === 'signin' ? 'signup' : 'signin'); setMsg(null); }}
        hitSlop={HIT_SLOP}
        accessibilityRole="button"
        style={({ pressed }) => pressed && pressedStyle}
      >
        <Text style={s.link}>
          {mode === 'signin' ? t('account.noAccount') : t('account.haveAccount')}
        </Text>
      </Pressable>
    </View>
  );
}

// ─── Signed-in: profile + sync + privacy ────────────────────────────────────

function SignedInView({ onOpenFriends }: { onOpenFriends: () => void }) {
  const t = useT();
  const profile = getProfile();
  const status = getSyncStatus();
  const lastSynced = getLastSyncedAt();
  const [privacy, setPriv] = useState<PrivacySettings | null>(null);

  useEffect(() => {
    void getPrivacy().then(setPriv);
  }, []);

  async function changeVis(key: keyof PrivacySettings, vis: Visibility) {
    if (!privacy) return;
    const next = { ...privacy, [key]: vis };
    setPriv(next);
    await setPrivacy({ [key]: vis });
  }

  const syncLabel =
    status === 'syncing' ? t('account.syncing')
    : status === 'error' ? t('account.syncError')
    : t('account.synced');

  return (
    <View style={{ gap: 12 }}>
      <View style={s.box}>
        <Text style={s.desc}>{t('account.signedInAs')}</Text>
        <Text style={s.boxTitle}>{profile?.username ?? '…'}</Text>
      </View>

      {/* Sync */}
      <Text style={s.sectionLabel}>{syncLabel}</Text>
      <Text style={s.desc}>
        {t('account.lastSynced').replace(
          '{time}',
          lastSynced ? new Date(lastSynced).toLocaleTimeString() : t('account.never'),
        )}
      </Text>
      <Pressable
        style={({ pressed }) => [s.btnOutline, pressed && pressedStyle]}
        onPress={() => void syncNow()}
        disabled={status === 'syncing'}
        accessibilityRole="button"
        accessibilityLabel={t('account.syncNow')}
      >
        <Text style={s.btnOutlineText}>{t('account.syncNow')}</Text>
      </Pressable>

      {/* Friends */}
      <Pressable
        style={({ pressed }) => [s.navRow, pressed && pressedStyle]}
        onPress={onOpenFriends}
        accessibilityRole="button"
        accessibilityLabel={t('account.friends')}
      >
        <Icon name="binder" size={18} color={colors.accent} />
        <Text style={s.navRowText}>{t('account.friends')}</Text>
        <Icon name="chevR" size={18} color={colors.textMut} />
      </Pressable>

      {/* Privacy */}
      <Text style={s.sectionLabel}>{t('account.privacy')}</Text>
      <Text style={s.desc}>{t('account.privacyDesc')}</Text>
      {privacy &&
        ([
          ['collection', 'account.privCollection'],
          ['wishlist', 'account.privWishlist'],
          ['decks', 'account.privDecks'],
        ] as const).map(([key, labelKey]) => (
          <View key={key} style={{ gap: 6, marginTop: 6 }}>
            <Text style={s.privLabel}>{t(labelKey)}</Text>
            <View style={s.row}>
              {VIS_OPTIONS.map((vis) => {
                const on = privacy[key] === vis;
                return (
                  <Pressable
                    key={vis}
                    style={({ pressed }) => [s.chip, on && s.chipOn, pressed && pressedStyle]}
                    onPress={() => changeVis(key, vis)}
                    accessibilityRole="button"
                    accessibilityState={{ selected: on }}
                    accessibilityLabel={t(VIS_LABEL[vis])}
                  >
                    <Text style={[s.chipText, on && s.chipTextOn]}>{t(VIS_LABEL[vis])}</Text>
                  </Pressable>
                );
              })}
            </View>
          </View>
        ))}

      <Pressable
        style={({ pressed }) => [s.btnOutline, { marginTop: 20 }, pressed && pressedStyle]}
        onPress={() => void signOut()}
        accessibilityRole="button"
        accessibilityLabel={t('account.signOut')}
      >
        <Text style={[s.btnOutlineText, { color: colors.down }]}>{t('account.signOut')}</Text>
      </Pressable>
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
  box: {
    backgroundColor: colors.surface,
    borderRadius: radii.lg,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.lg,
    gap: 4,
  },
  boxTitle: { fontSize: 20, fontFamily: fonts.display, color: colors.text },
  sectionLabel: {
    fontSize: 12,
    fontFamily: fonts.uiSemi,
    color: colors.textMut,
    textTransform: 'uppercase',
    letterSpacing: 0.6,
    marginTop: 14,
  },
  privLabel: { fontSize: 14, fontFamily: fonts.uiSemi, color: colors.text },
  desc: { fontSize: 12, fontFamily: fonts.ui, color: colors.textMut },
  msg: { fontSize: 13, fontFamily: fonts.ui, color: colors.accent },
  link: { fontSize: 13, fontFamily: fonts.uiSemi, color: colors.accent, marginTop: 6 },
  input: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radii.lg,
    paddingHorizontal: 14,
    paddingVertical: 11,
    color: colors.text,
    fontFamily: fonts.ui,
    fontSize: 15,
  },
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
  navRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: colors.surface,
    borderRadius: radii.lg,
    borderWidth: 1,
    borderColor: colors.border,
    paddingHorizontal: 14,
    paddingVertical: 14,
    marginTop: 8,
  },
  navRowText: { flex: 1, fontSize: 15, fontFamily: fonts.uiSemi, color: colors.text },
  btnPrimary: {
    paddingHorizontal: 20,
    paddingVertical: 13,
    borderRadius: radii.lg,
    backgroundColor: colors.accent,
    alignItems: 'center',
  },
  btnPrimaryText: { fontSize: 15, fontFamily: fonts.uiSemi, color: '#fff' },
  btnOutline: {
    paddingHorizontal: 16,
    paddingVertical: 11,
    borderRadius: radii.lg,
    borderWidth: 1,
    borderColor: colors.border,
    alignSelf: 'flex-start',
  },
  btnOutlineText: { fontSize: 14, fontFamily: fonts.uiSemi, color: colors.textMut },
});
