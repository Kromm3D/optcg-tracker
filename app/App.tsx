// Punto de entrada de la app: NavigationContainer con stack raiz y tabs.
import React from 'react';
import { StatusBar } from 'expo-status-bar';
import { NavigationContainer, DefaultTheme } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import type { RouteProp } from '@react-navigation/native';

import { SearchScreen } from './src/screens/SearchScreen';
import { DetailScreen } from './src/screens/DetailScreen';
import { CollectionScreen } from './src/screens/CollectionScreen';
import type { RootStackParamList, TabParamList } from './src/navigation';

type DetailRouteProp = RouteProp<RootStackParamList, 'Detail'>;

function detailOptions({ route }: { route: DetailRouteProp }) {
  return { title: route.params.code };
}

const Stack = createNativeStackNavigator<RootStackParamList>();
const Tabs = createBottomTabNavigator<TabParamList>();

const Theme = {
  ...DefaultTheme,
  dark: true,
  colors: {
    ...DefaultTheme.colors,
    background: '#0e1117',
    card: '#0e1117',
    text: '#e6e9ef',
    border: '#1a1f29',
    primary: '#3a86ff',
    notification: '#e74c3c',
  },
};

function TabsScreen() {
  return (
    <Tabs.Navigator
      screenOptions={{
        headerStyle: { backgroundColor: '#0e1117' },
        headerTitleStyle: { color: '#e6e9ef' },
        tabBarStyle: { backgroundColor: '#0e1117', borderTopColor: '#1a1f29' },
        tabBarActiveTintColor: '#3a86ff',
        tabBarInactiveTintColor: '#8a93a6',
      }}
    >
      <Tabs.Screen
        name="Search"
        component={SearchScreen}
        options={{ title: 'Buscar' }}
      />
      <Tabs.Screen
        name="Collection"
        component={CollectionScreen}
        options={{ title: 'Mi coleccion' }}
      />
    </Tabs.Navigator>
  );
}

export default function App() {
  return (
    <NavigationContainer theme={Theme}>
      <StatusBar style="light" />
      <Stack.Navigator
        screenOptions={{
          headerStyle: { backgroundColor: '#0e1117' },
          headerTitleStyle: { color: '#e6e9ef' },
          headerTintColor: '#3a86ff',
        }}
      >
        <Stack.Screen
          name="Tabs"
          component={TabsScreen}
          options={{ headerShown: false }}
        />
        <Stack.Screen
          name="Detail"
          component={DetailScreen}
          options={detailOptions}
        />
      </Stack.Navigator>
    </NavigationContainer>
  );
}
