// Punto de entrada. NavigationContainer con stack raiz + tabs (4).
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import {
  NavigationContainer,
  DefaultTheme,
  useNavigation,
  createNavigationContainerRef,
} from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import {
  useFonts,
  Sora_500Medium,
  Sora_700Bold,
} from '@expo-google-fonts/sora';
import {
  Manrope_400Regular,
  Manrope_500Medium,
  Manrope_600SemiBold,
  Manrope_700Bold,
} from '@expo-google-fonts/manrope';

import { SafeAreaProvider, useSafeAreaInsets } from 'react-native-safe-area-context';
import { HomeScreen }       from './src/screens/HomeScreen';
import { BrowseScreen }     from './src/screens/BrowseScreen';
import { BinderScreen }     from './src/screens/BinderScreen';
import { DecksScreen }      from './src/screens/DecksScreen';
import { ProfileScreen }    from './src/screens/ProfileScreen';
import { DetailScreen }     from './src/screens/DetailScreen';
import { SetsScreen }       from './src/screens/SetsScreen';
import { SetDetailScreen }  from './src/screens/SetDetailScreen';
import { DeckDetailScreen } from './src/screens/DeckDetailScreen';
import { ScanScreen }            from './src/screens/ScanScreen';
import { SettingsScreen }        from './src/screens/SettingsScreen';
import { WishlistDetailScreen }  from './src/screens/WishlistDetailScreen';
import { AccountScreen }         from './src/screens/AccountScreen';
import { FriendsScreen }         from './src/screens/FriendsScreen';
import { FriendProfileScreen }   from './src/screens/FriendProfileScreen';
import './src/lib/sync'; // side-effect: arranca el listener de login/logout para la sync
import { Icon }             from './src/components/Icon';
import { ToastProvider }    from './src/components/Toast';
import { colors, fonts, pressedStyle, HIT_SLOP } from './src/theme';
import { useT }             from './src/lib/i18n';
import { checkForUpdate, getPendingUpdate, subscribe as subRemoteIndex } from './src/lib/remoteIndex';
import { initPriceHistory } from './src/lib/priceHistory';
import { MAX_CONTENT_WIDTH } from './src/lib/layout';
import type { TKey }        from './src/i18n/en';
import type { RootStackParamList, TabParamList } from './src/navigation';

const Stack = createNativeStackNavigator<RootStackParamList>();
const Tabs  = createBottomTabNavigator<TabParamList>();

const NavTheme = {
  ...DefaultTheme,
  dark: true,
  colors: {
    ...DefaultTheme.colors,
    background: colors.bg,
    card: colors.bg,
    text: colors.text,
    border: colors.border,
    primary: colors.accent,
    notification: colors.accent,
  },
};

const TAB_META: Record<keyof TabParamList, { labelKey: TKey; icon: string }> = {
  Home:    { labelKey: 'tab.home',    icon: 'home'   },
  Browse:  { labelKey: 'tab.cards',   icon: 'grid'   },
  Binder:  { labelKey: 'tab.binder',  icon: 'binder' },
  Decks:   { labelKey: 'tab.decks',   icon: 'layers' },
  Profile: { labelKey: 'tab.profile', icon: 'user'   },
};

const MAIN_TABS: (keyof TabParamList)[] = ['Home', 'Browse', 'Binder', 'Decks', 'Profile'];

// Pantallas en las que la barra flotante se oculta — modales a pantalla
// completa (zoom de carta, cámara) donde el patrón habitual es no mostrar
// navegación de fondo, no "escenas" normales del árbol de tabs.
const HIDE_TAB_BAR_ON = new Set(['Detail', 'Scan']);

type TabBarProps = {
  activeTab: keyof TabParamList;
  onNavigate: (name: keyof TabParamList) => void;
};

// Barra flotante renderizada UNA VEZ a nivel global (fuera del Tabs.Navigator,
// ver TabsScreen más abajo) para que persista en cualquier pantalla del stack
// raíz (Sets, SetDetail, DeckDetail, Settings...), no solo dentro de las tabs.
// `activeTab` se deriva del estado de navegación global (ver App()).
//
// Estilo Collectr: 5 pestañas planas, la activa lleva una "píldora" (accentDim)
// detrás del icono + etiqueta. Ya no hay FAB central — el escaneo vive ahora en
// la barra de búsqueda (Browse/Binder), ver BrowseScreen/BinderScreen.
function TabBar({ activeTab, onNavigate }: TabBarProps) {
  const t = useT();
  const [hasUpdate, setHasUpdate] = useState(!!getPendingUpdate());
  useEffect(() => subRemoteIndex(() => setHasUpdate(!!getPendingUpdate())), []);

  return (
    <View style={s.tabBarWrap}>
      <View style={s.tabBar}>
        {MAIN_TABS.map((name) => {
          const focused = activeTab === name;
          const meta = TAB_META[name];
          // El tile "Sets" vive dentro de Home — el punto avisa aunque el
          // usuario esté en otra tab, sin duplicar el aviso completo del banner.
          const showDot = name === 'Home' && hasUpdate;
          return (
            <Pressable
              key={name}
              onPress={() => onNavigate(name)}
              accessibilityRole="tab"
              accessibilityState={{ selected: focused }}
              accessibilityLabel={
                showDot ? `${t(meta.labelKey)}, ${t('setUpdate.badgeA11y')}` : t(meta.labelKey)
              }
              style={({ pressed }) => [s.tabBtn, pressed && pressedStyle]}
            >
              <View style={[s.tabInner, focused && s.tabInnerOn]}>
                <View>
                  <Icon
                    name={meta.icon}
                    size={21}
                    color={focused ? colors.accent : colors.textMut}
                    stroke={focused ? 2.2 : 1.8}
                  />
                  {showDot && <View style={s.tabDot} />}
                </View>
                <Text
                  style={[
                    s.tabLabel,
                    { color: focused ? colors.accent : colors.textMut },
                    focused && { fontFamily: fonts.uiBold },
                  ]}
                  numberOfLines={1}
                >
                  {t(meta.labelKey)}
                </Text>
              </View>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

function Header({ titleKey }: { titleKey: TKey }) {
  const t = useT();
  const insets = useSafeAreaInsets();
  const navigation = useNavigation<any>();
  return (
    <View style={[s.header, { paddingTop: insets.top + 10 }]}>
      <Text style={s.headerTitle}>{t(titleKey)}</Text>
      <Pressable
        onPress={() => navigation.navigate('Settings')}
        accessibilityRole="button"
        accessibilityLabel={t('settings.title')}
        hitSlop={HIT_SLOP}
        style={({ pressed }) => [s.headerBtn, pressed && pressedStyle]}
      >
        <Icon name="gear" size={20} color={colors.textMut} stroke={1.8} />
        <Text style={s.headerBtnLabel}>{t('settings.title')}</Text>
      </Pressable>
    </View>
  );
}

// Splash de marca mientras cargan las fuentes / arranca la base de datos.
// Las fuentes aún no están listas aquí, así que el wordmark cae al system font
// un instante (aceptable). Logo = fantasma Horo Horo; spinner en cian espectral.
function LoadingSplash() {
  const t = useT();
  return (
    <View style={s.splash}>
      <View style={s.splashLogo}>
        <Icon name="cloud" size={46} color={colors.accent} stroke={1.8} />
      </View>
      <Text style={s.splashWord}>
        HoroHoro<Text style={{ color: colors.accent }}>.tcg</Text>
      </Text>
      <Text style={s.splashSub}>ONE PIECE TCG</Text>
      <ActivityIndicator color={colors.ghost} style={{ marginTop: 22 }} />
      <Text style={s.splashMsg}>{t('common.loadingDb')}</Text>
    </View>
  );
}

const HOME_HEADER   = () => null; // HomeScreen has no external header — it's self-contained
const BROWSE_HEADER = () => <Header titleKey="tab.cards" />;
const BINDER_HEADER = () => <Header titleKey="binder.title" />;
const DECKS_HEADER  = () => <Header titleKey="decks.title" />;

function TabsScreen() {
  return (
    <Tabs.Navigator
      // La barra se renderiza globalmente en App() (ver TabBar arriba) para
      // persistir fuera de las 4 tabs también; la nativa del navigator se
      // suprime aquí para no duplicarla.
      tabBar={() => null}
      screenOptions={{
        headerStyle: { backgroundColor: colors.bg, borderBottomWidth: 0 },
        headerTitleStyle: { color: colors.text, fontFamily: fonts.display },
        headerShadowVisible: false,
      }}
    >
      <Tabs.Screen name="Home"   component={HomeScreen}   options={{ headerShown: false }} />
      <Tabs.Screen name="Browse" component={BrowseScreen} options={{ header: BROWSE_HEADER }} />
      <Tabs.Screen name="Binder" component={BinderScreen} options={{ header: BINDER_HEADER }} />
      <Tabs.Screen name="Decks"  component={DecksScreen}  options={{ header: DECKS_HEADER }} />
      <Tabs.Screen name="Profile" component={ProfileScreen} options={{ headerShown: false }} />
    </Tabs.Navigator>
  );
}

const navigationRef = createNavigationContainerRef<RootStackParamList>();

export default function App() {
  const [fontsLoaded] = useFonts({
    Sora_500Medium,
    Sora_700Bold,
    Manrope_400Regular,
    Manrope_500Medium,
    Manrope_600SemiBold,
    Manrope_700Bold,
  });

  // Tab activa "recordada": la ruta enfocada solo es 'Home'/'Browse'/'Binder'/
  // 'Decks' mientras estamos dentro de Tabs. Al navegar a una pantalla del
  // stack raíz (Sets, SetDetail, Settings...) la ruta enfocada cambia de
  // nombre, pero la barra debe seguir resaltando la tab desde la que se entró
  // — por eso se "recuerda" en vez de derivarse en cada render.
  const [activeTab, setActiveTab] = useState<keyof TabParamList>('Home');
  const [currentRoute, setCurrentRoute] = useState<string | undefined>('Home');

  const syncFromNav = useCallback(() => {
    const name = navigationRef.isReady() ? navigationRef.getCurrentRoute()?.name : undefined;
    setCurrentRoute(name);
    if (name && (MAIN_TABS as string[]).includes(name)) {
      setActiveTab(name as keyof TabParamList);
    }
  }, []);

  useEffect(() => {
    if (fontsLoaded) {
      checkForUpdate();
      void initPriceHistory();
    }
  }, [fontsLoaded]);

  if (!fontsLoaded) {
    return <LoadingSplash />;
  }

  const showTabBar = !currentRoute || !HIDE_TAB_BAR_ON.has(currentRoute);

  return (
    <SafeAreaProvider>
      <ToastProvider>
      <NavigationContainer ref={navigationRef} theme={NavTheme} onReady={syncFromNav} onStateChange={syncFromNav}>
        <StatusBar style="light" />
        {/* Carcasa centrada: en web limita el ancho (MAX_CONTENT_WIDTH) en vez
            de estirar la app de borde a borde; en nativo es un flex:1 normal. La
            barra de tabs (absolute) se posiciona contra esta View, así que queda
            dentro de la columna centrada. */}
        <View style={s.appShell}>
        <Stack.Navigator
          screenOptions={{
            headerStyle: { backgroundColor: colors.bg },
            headerShadowVisible: false,
          }}
        >
          <Stack.Screen name="Tabs"       component={TabsScreen}       options={{ headerShown: false }} />
          <Stack.Screen name="Detail"     component={DetailScreen}     options={{ headerShown: false, presentation: 'modal' }} />
          <Stack.Screen name="Sets"       component={SetsScreen}       options={{ title: 'Sets' }} />
          <Stack.Screen name="SetDetail"  component={SetDetailScreen}  options={{ headerShown: false }} />
          <Stack.Screen name="DeckDetail" component={DeckDetailScreen} options={{ headerShown: false }} />
          <Stack.Screen name="Scan"           component={ScanScreen}           options={{ headerShown: false, presentation: 'modal' }} />
          <Stack.Screen name="Settings"       component={SettingsScreen}       options={{ headerShown: false }} />
          <Stack.Screen name="WishlistDetail" component={WishlistDetailScreen} options={{ headerShown: false }} />
          <Stack.Screen name="Account"        component={AccountScreen}        options={{ headerShown: false }} />
          <Stack.Screen name="Friends"        component={FriendsScreen}        options={{ headerShown: false }} />
          <Stack.Screen name="FriendProfile"  component={FriendProfileScreen}  options={{ headerShown: false }} />
        </Stack.Navigator>

        {showTabBar && (
          <TabBar
            activeTab={activeTab}
            onNavigate={(name) => navigationRef.navigate('Tabs', { screen: name } as never)}
          />
        )}
        </View>
      </NavigationContainer>
      </ToastProvider>
    </SafeAreaProvider>
  );
}

const s = StyleSheet.create({
  // Mobile-first: en web se centra en una columna; en nativo es flex:1 normal.
  appShell: {
    flex: 1,
    width: '100%',
    ...Platform.select({
      web: { maxWidth: MAX_CONTENT_WIDTH, alignSelf: 'center' },
      default: {},
    }),
  },
  splash: {
    flex: 1,
    backgroundColor: colors.bg,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 32,
  },
  splashLogo: {
    width: 74,
    height: 74,
    borderRadius: 24,
    backgroundColor: colors.accentDim,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 18,
  },
  splashWord: {
    fontSize: 26,
    fontFamily: fonts.display,
    color: colors.text,
    letterSpacing: -0.5,
  },
  splashSub: {
    fontSize: 11,
    fontFamily: fonts.uiSemi,
    color: colors.ghost,
    letterSpacing: 2,
    marginTop: 3,
  },
  splashMsg: {
    fontSize: 12,
    fontFamily: fonts.ui,
    color: colors.textMut,
    textAlign: 'center',
    marginTop: 14,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 18,
    paddingBottom: 10,
  },
  headerTitle: {
    fontSize: 30,
    fontFamily: fonts.display,
    color: colors.text,
    letterSpacing: -0.6,
  },
  headerBtn: { alignItems: 'center', justifyContent: 'center', gap: 2, minWidth: 40 },
  headerBtnLabel: { fontSize: 9.5, fontFamily: fonts.uiSemi, color: colors.textMut },
  tabBarWrap: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    paddingBottom: 26,
    paddingTop: 8,
    backgroundColor: 'transparent',
  },
  tabBar: {
    marginHorizontal: 12,
    height: 62,
    borderRadius: 22,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 4,
    backgroundColor: colors.tabBarWash,
    borderWidth: 1,
    borderColor: colors.border,
  },
  tabBtn: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  // Píldora interna que abraza el contenido (icono + etiqueta); sólo se pinta
  // (accentDim) en la pestaña activa, estilo Collectr.
  tabInner: {
    alignItems: 'center',
    gap: 3,
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 14,
  },
  tabInnerOn: { backgroundColor: colors.accentDim },
  tabDot: {
    position: 'absolute',
    top: -2,
    right: -5,
    width: 7,
    height: 7,
    borderRadius: 4,
    backgroundColor: colors.ghost,
    borderWidth: 1.5,
    borderColor: colors.bg,
  },
  tabLabel: { fontSize: 10.5, fontFamily: fonts.uiSemi },
});
