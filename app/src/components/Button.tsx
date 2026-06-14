// Botón unificado (primario / secundario / fantasma). Press feedback,
// altura táctil mínima y estado disabled de serie. C1 / C2.
import React from 'react';
import { ActivityIndicator, StyleSheet, Text, StyleProp, ViewStyle } from 'react-native';
import { Touchable } from './Touchable';
import { Icon } from './Icon';
import { colors, fonts, type, MIN_TOUCH } from '../theme';

type Variant = 'primary' | 'secondary' | 'ghost' | 'danger';

interface Props {
  title: string;
  onPress?: () => void;
  variant?: Variant;
  icon?: string;
  disabled?: boolean;
  loading?: boolean;
  style?: StyleProp<ViewStyle>;
}

export function Button({ title, onPress, variant = 'primary', icon, disabled, loading, style }: Props) {
  const isPrimary = variant === 'primary';
  const isDanger = variant === 'danger';
  const fg = isPrimary || isDanger ? '#fff' : variant === 'secondary' ? colors.text : colors.textMut;
  return (
    <Touchable
      style={[styles.base, styles[variant], style]}
      onPress={onPress}
      disabled={disabled || loading}
      hitSlopOn={false}
      accessibilityRole="button"
      accessibilityLabel={title}
    >
      {loading ? (
        <ActivityIndicator color={fg} size="small" />
      ) : (
        <>
          {icon ? <Icon name={icon} size={18} color={fg} stroke={2} /> : null}
          <Text style={[styles.label, { color: fg }]}>{title}</Text>
        </>
      )}
    </Touchable>
  );
}

const styles = StyleSheet.create({
  base: {
    minHeight: MIN_TOUCH,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingHorizontal: 18,
    borderRadius: 14,
  },
  primary: { backgroundColor: colors.accent },
  danger: { backgroundColor: colors.down },
  secondary: { backgroundColor: colors.surface2, borderWidth: 1, borderColor: colors.border },
  ghost: { backgroundColor: 'transparent' },
  label: { fontSize: type.title, fontFamily: fonts.uiBold },
});
