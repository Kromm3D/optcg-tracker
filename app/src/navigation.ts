// Tipos compartidos para la navegación.
//
// Arquitectura:
//   - Stack raíz con dos rutas: Tabs (las pestañas) y Detail (pantalla de
//     carta, se abre por encima de las tabs).
//   - Dentro de Tabs viven Search y Collection.
//
// SearchScreen y CollectionScreen necesitan CompositeScreenProps porque
// navegan al Detail del stack padre.

import type { CompositeScreenProps } from '@react-navigation/native';
import type { BottomTabScreenProps } from '@react-navigation/bottom-tabs';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';

export type RootStackParamList = {
  Tabs: undefined;
  Detail: { code: string };
};

export type TabParamList = {
  Search: undefined;
  Collection: undefined;
};

export type SearchScreenProps = CompositeScreenProps<
  BottomTabScreenProps<TabParamList, 'Search'>,
  NativeStackScreenProps<RootStackParamList>
>;

export type CollectionScreenProps = CompositeScreenProps<
  BottomTabScreenProps<TabParamList, 'Collection'>,
  NativeStackScreenProps<RootStackParamList>
>;

export type DetailScreenProps = NativeStackScreenProps<RootStackParamList, 'Detail'>;
