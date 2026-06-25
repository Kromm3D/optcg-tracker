// Control segmentado unificado (track relleno con chips internos).
// Sustituye los 3 tratamientos divergentes de tabs internos (Binder /
// FriendProfile / Settings) por uno solo. M3.
import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { Touchable } from './Touchable';
import { colors, fonts, type, MIN_TOUCH } from '../theme';

export interface Segment<T extends string> {
  key: T;
  label: string;
}

interface Props<T extends string> {
  segments: ReadonlyArray<Segment<T>>;
  value: T;
  onChange: (key: T) => void;
}

export function SegmentedControl<T extends string>({ segments, value, onChange }: Props<T>) {
  return (
    <View style={styles.track} accessibilityRole="tablist">
      {segments.map((seg) => {
        const active = seg.key === value;
        return (
          <Touchable
            key={seg.key}
            style={[styles.seg, active && styles.segOn]}
            onPress={() => onChange(seg.key)}
            accessibilityRole="tab"
            accessibilityState={{ selected: active }}
            accessibilityLabel={seg.label}
          >
            <Text style={[styles.label, active && styles.labelOn]} numberOfLines={1}>
              {seg.label}
            </Text>
          </Touchable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  track: {
    flexDirection: 'row',
    backgroundColor: colors.surface,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: colors.border,
    padding: 4,
    gap: 4,
  },
  seg: {
    flex: 1,
    minHeight: MIN_TOUCH - 8,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 8,
  },
  segOn: { backgroundColor: colors.accent },
  label: { fontSize: type.label, fontFamily: fonts.uiSemi, color: colors.textMut },
  labelOn: { color: colors.onAccent, fontFamily: fonts.uiBold },
});
