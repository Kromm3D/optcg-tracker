// Toast unificado: provider + hook. Sustituye a los toasts reimplementados
// por pantalla (DeckDetail setTimeout, etc.) por uno con animación, cola
// (un toast a la vez, el nuevo reemplaza al viejo) y acción opcional (Undo).
// P5.
import React, { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import { Animated, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Touchable } from './Touchable';
import { colors, fonts, type, radii, spacing, elevation } from '../theme';

interface ToastOpts {
  message: string;
  actionLabel?: string;
  onAction?: () => void;
  duration?: number;
}

type ShowFn = (opts: ToastOpts) => void;

const ToastContext = createContext<ShowFn>(() => {});

export function useToast(): ShowFn {
  return useContext(ToastContext);
}

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toast, setToast] = useState<ToastOpts | null>(null);
  const opacity = useRef(new Animated.Value(0)).current;
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const insets = useSafeAreaInsets();

  const hide = useCallback(() => {
    Animated.timing(opacity, { toValue: 0, duration: 180, useNativeDriver: true }).start(() =>
      setToast(null),
    );
  }, [opacity]);

  const show = useCallback<ShowFn>(
    (opts) => {
      clearTimeout(timer.current);
      setToast(opts);
      opacity.setValue(0);
      Animated.timing(opacity, { toValue: 1, duration: 200, useNativeDriver: true }).start();
      timer.current = setTimeout(hide, opts.duration ?? 2600);
    },
    [hide, opacity],
  );

  useEffect(() => () => clearTimeout(timer.current), []);

  return (
    <ToastContext.Provider value={show}>
      {children}
      {toast && (
        <Animated.View
          pointerEvents="box-none"
          style={[styles.wrap, { opacity, bottom: insets.bottom + 96 }]}
        >
          <View style={styles.toast}>
            <Text style={styles.msg} numberOfLines={2}>
              {toast.message}
            </Text>
            {toast.actionLabel && toast.onAction ? (
              <Touchable
                onPress={() => {
                  toast.onAction?.();
                  hide();
                }}
                accessibilityLabel={toast.actionLabel}
              >
                <Text style={styles.action}>{toast.actionLabel}</Text>
              </Touchable>
            ) : null}
          </View>
        </Animated.View>
      )}
    </ToastContext.Provider>
  );
}

const styles = StyleSheet.create({
  wrap: { position: 'absolute', left: 0, right: 0, alignItems: 'center', paddingHorizontal: spacing.lg },
  toast: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    maxWidth: 480,
    backgroundColor: colors.surface2,
    borderRadius: radii.lg,
    borderWidth: 1,
    borderColor: colors.border,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.lg,
    ...elevation.card,
  },
  msg: { flexShrink: 1, fontSize: type.body, fontFamily: fonts.uiMed, color: colors.text },
  action: { fontSize: type.body, fontFamily: fonts.uiBold, color: colors.accent },
});
