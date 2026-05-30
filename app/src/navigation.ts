// Tipos de navegacion. Stack raiz: Tabs + Detail + SetDetail + DeckDetail.
// Tabs: Home, Browse, Binder, Decks.

import type { CompositeScreenProps } from '@react-navigation/native';
import type { BottomTabScreenProps } from '@react-navigation/bottom-tabs';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';

export type RootStackParamList = {
  Tabs: undefined;
  Detail: { code: string };
  Sets: undefined;
  SetDetail: { setCode: string };
  DeckDetail: { deckId: string };
};

export type TabParamList = {
  Home: undefined;
  Browse: undefined;
  Binder: undefined;
  Decks: undefined;
};

export type HomeScreenProps = CompositeScreenProps<
  BottomTabScreenProps<TabParamList, 'Home'>,
  NativeStackScreenProps<RootStackParamList>
>;

export type BrowseScreenProps = CompositeScreenProps<
  BottomTabScreenProps<TabParamList, 'Browse'>,
  NativeStackScreenProps<RootStackParamList>
>;

export type BinderScreenProps = CompositeScreenProps<
  BottomTabScreenProps<TabParamList, 'Binder'>,
  NativeStackScreenProps<RootStackParamList>
>;

export type DecksScreenProps = CompositeScreenProps<
  BottomTabScreenProps<TabParamList, 'Decks'>,
  NativeStackScreenProps<RootStackParamList>
>;

export type DetailScreenProps = NativeStackScreenProps<RootStackParamList, 'Detail'>;
export type SetDetailScreenProps = NativeStackScreenProps<RootStackParamList, 'SetDetail'>;
export type DeckDetailScreenProps = NativeStackScreenProps<RootStackParamList, 'DeckDetail'>;
