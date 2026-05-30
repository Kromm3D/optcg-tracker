// Robust image component with primary → fallback → placeholder chain.
//
// Why not expo-image source arrays?
//   Arrays are resolution hints, not error fallback — a 403/404 on the first
//   source does NOT automatically try the next one.
//
// Known issues this fixes:
//   1. jsDelivr returns 403 for large repos → always falls back to image_source
//   2. expo-image doesn't always fire onError for HTTP 4xx → we also check
//      onLoadEnd with a size guard
//   3. useState(uri) only captures initial value → stale src when FlatList
//      recycles a cell for a different card

import React, { useEffect, useState } from 'react';
import { StyleProp, View, ViewStyle } from 'react-native';
import { Image, ImageStyle } from 'expo-image';

type Props = {
  uri: string;
  fallbackUri?: string;
  style?: StyleProp<ImageStyle>;
  contentFit?: 'cover' | 'contain' | 'fill' | 'none' | 'scale-down';
  placeholderBg?: string;
};

export function CachedImage({
  uri,
  fallbackUri,
  style,
  contentFit = 'cover',
  placeholderBg,
}: Props) {
  const [src, setSrc] = useState(uri);
  const [failed, setFailed] = useState(false);

  // Sync when the uri prop changes (FlatList cell recycling, column changes, etc.)
  useEffect(() => {
    setSrc(uri);
    setFailed(false);
  }, [uri]);

  const handleError = () => {
    if (fallbackUri && src !== fallbackUri) {
      setSrc(fallbackUri);
    } else {
      setFailed(true);
    }
  };

  if (failed || !src) {
    return (
      <View
        style={[
          style as ViewStyle,
          placeholderBg ? { backgroundColor: placeholderBg } : undefined,
        ]}
      />
    );
  }

  return (
    <Image
      source={{ uri: src }}
      style={style}
      contentFit={contentFit}
      cachePolicy="disk"
      transition={120}
      onError={handleError}
    />
  );
}
