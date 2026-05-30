// Punto de entrada. NavigationContainer con stack raiz + tabs (4).
import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { NavigationContainer, DefaultTheme } from '@react-navigation/native';
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

import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { HomeScreen }       from './src/screens/HomeScreen';
import { BrowseScreen }     from './src/screens/BrowseScreen';
import { BinderScreen }     from './src/screens/BinderScreen';
import { DecksScreen }      from './src/screens/DecksScreen';
import { DetailScreen }     from './src/screens/DetailScreen';
import { SetsScreen }       from './src/screens/SetsScreen';
import { SetDetailScreen }  from './src/screens/SetDetailScreen';
import { DeckDetailScreen } from './src/screens/DeckDetailScreen';
import { Icon }             from './src/components/Icon';
import { colors, fonts }    from './src/theme';
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

const TAB_META: Record<keyof TabParamList, { label: string; icon: string }> = {
  Home:   { label: 'Home',   icon: 'home'   },
  Browse: { label: 'Cards',  icon: 'grid'   },
  Binder: { label: 'Binder', icon: 'binder' },
  Decks:  { label: 'Decks',  icon: 'layers' },
};

type TabBarProps = {
  state: { index: number; routes: Array<{ key: string; name: string }> };
  navigation: { navigate: (name: string) => void };
};

function TabBar({ state, navigation }: TabBarProps) {
  return (
    <View style={s.tabBarWrap}>
      <View style={s.tabBar}>
        {state.routes.map((route, index) => {
          const focused = state.index === index;
          const meta = TAB_META[route.name as keyof TabParamList];
          return (
            <Pressable
              key={route.key}
              onPress={() => navigation.navigate(route.name)}
              style={s.tabBtn}
            >
              <Icon
                name={meta.icon}
                size={22}
                color={focused ? colors.accent : colors.textDim}
                stroke={focused ? 2.2 : 1.8}
              />
              <Text
                style={[
                  s.tabLabel,
                  { color: focused ? colors.accent : colors.textDim },
                  focused && { fontFamily: fonts.uiBold },
                ]}
              >
                {meta.label}
              </Text>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

function Header({ title }: { title: string }) {
  const insets = useSafeAreaInsets();
  return (
    <View style={[s.header, { paddingTop: insets.top + 10 }]}>
      <Text style={s.headerTitle}>{title}</Text>
    </View>
  );
}

function renderTabBar(props: TabBarProps) {
  return <TabBar state={props.state} navigation={props.navigation} />;
}

const HOME_HEADER   = () => null; // HomeScreen has no external header — it's self-contained
const BROWSE_HEADER = () => <Header title="Cards" />;
const BINDER_HEADER = () => <Header title="My Binder" />;
const DECKS_HEADER  = () => <Header title="Decks" />;

function TabsScreen() {
  return (
    <Tabs.Navigator
      tabBar={renderTabBar}
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
    </Tabs.Navigator>
  );
}

export default function App() {
  const [fontsLoaded] = useFonts({
    Sora_500Medium,
    Sora_700Bold,
    Manrope_400Regular,
    Manrope_500Medium,
    Manrope_600SemiBold,
    Manrope_700Bold,
  });

  if (!fontsLoaded) {
    return (
      <View style={{ flex: 1, backgroundColor: colors.bg, alignItems: 'center', justifyContent: 'center' }}>
        <Text style={{ color: colors.textMut }}>Loading fonts…</Text>
      </View>
    );
  }

  return (
    <NavigationContainer theme={NavTheme}>
      <StatusBar style="light" />
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
      </Stack.Navigator>
    </NavigationContainer>
  );
}

const s = StyleSheet.create({
  header: { paddingHorizontal: 18, paddingBottom: 10 },
  headerTitle: {
    fontSize: 30,
    fontFamily: fonts.display,
    color: colors.text,
    letterSpacing: -0.6,
  },
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
    marginHorizontal: 16,
    height: 60,
    borderRadius: 22,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(21,18,38,0.94)',
    borderWidth: 1,
    borderColor: colors.border,
  },
  tabBtn: { flex: 1, alignItems: 'center', gap: 4 },
  tabLabel: { fontSize: 10.5, fontFamily: fonts.uiSemi },
});
