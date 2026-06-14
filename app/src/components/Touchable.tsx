// Pressable base con feedback de pulsación + área táctil mínima + a11y.
// Resuelve C1 (sin feedback al pulsar en toda la app) y C2 (targets < 44pt)
// de forma centralizada: cualquier control construido sobre esto cumple ambos.
import React from 'react';
import {
  Pressable,
  StyleProp,
  ViewStyle,
  PressableProps,
} from 'react-native';
import { HIT_SLOP, pressedStyle, pressedSurface } from '../theme';

export interface TouchableProps extends Omit<PressableProps, 'style'> {
  style?: StyleProp<ViewStyle>;
  /** `surface` = hundimiento sutil (cards grandes); `control` = opacidad fuerte. */
  feedback?: 'control' | 'surface' | 'none';
  /** Aplica hitSlop por defecto (controles pequeños). Default true. */
  hitSlopOn?: boolean;
}

/** Pressable con opacidad al pulsar, hitSlop por defecto y rol de botón. */
export function Touchable({
  style,
  feedback = 'control',
  hitSlopOn = true,
  hitSlop,
  accessibilityRole,
  children,
  disabled,
  ...rest
}: TouchableProps) {
  const press =
    feedback === 'surface' ? pressedSurface : feedback === 'none' ? null : pressedStyle;
  return (
    <Pressable
      accessibilityRole={accessibilityRole ?? 'button'}
      hitSlop={hitSlop ?? (hitSlopOn ? HIT_SLOP : undefined)}
      disabled={disabled}
      style={({ pressed }) => [
        style,
        pressed && !disabled && press,
        disabled && { opacity: 0.4 },
      ]}
      {...rest}
    >
      {children}
    </Pressable>
  );
}
