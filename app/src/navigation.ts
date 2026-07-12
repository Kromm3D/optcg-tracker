// Tipos de navegacion. Stack raiz: Tabs + Detail + SetDetail + DeckDetail.
// Tabs: Home, Browse, Binder, Decks.

import type { CompositeScreenProps } from '@react-navigation/native';
import type { BottomTabScreenProps } from '@react-navigation/bottom-tabs';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';

export type RootStackParamList = {
  Tabs: undefined;
  Detail: { code: string; suffix?: string };
  Sets: undefined;
  SetDetail: { setCode: string };
  DeckDetail: { deckId: string };
  Scan: undefined;
  Settings: undefined;
  WishlistDetail: { wishlistId: string };
  Account: undefined;
  Friends: undefined;
  FriendProfile: { userId: string; username: string };
};

export type TabParamList = {
  Home: undefined;
  Browse: undefined;
  /** `tab` preselects a Binder sub-tab (Home "Wishlist" tile → wishlist). */
  Binder: { tab?: 'owned' | 'wishlist' | 'trade' } | undefined;
  Decks: undefined;
  Profile: undefined;
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

export type ProfileScreenProps = CompositeScreenProps<
  BottomTabScreenProps<TabParamList, 'Profile'>,
  NativeStackScreenProps<RootStackParamList>
>;

export type DetailScreenProps = NativeStackScreenProps<RootStackParamList, 'Detail'>;
export type SetDetailScreenProps = NativeStackScreenProps<RootStackParamList, 'SetDetail'>;
export type DeckDetailScreenProps = NativeStackScreenProps<RootStackParamList, 'DeckDetail'>;
export type ScanScreenProps = NativeStackScreenProps<RootStackParamList, 'Scan'>;
export type SettingsScreenProps = NativeStackScreenProps<RootStackParamList, 'Settings'>;
export type WishlistDetailScreenProps = NativeStackScreenProps<RootStackParamList, 'WishlistDetail'>;
export type AccountScreenProps = NativeStackScreenProps<RootStackParamList, 'Account'>;
export type FriendsScreenProps = NativeStackScreenProps<RootStackParamList, 'Friends'>;
export type FriendProfileScreenProps = NativeStackScreenProps<RootStackParamList, 'FriendProfile'>;
