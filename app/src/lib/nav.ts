// Helper de navegación compartido por todas las pantallas con botón "atrás".

import type { NavigationProp } from '@react-navigation/native';

/** Vuelve a la pantalla anterior si hay historial (caso normal); si no lo hay
 *  (deep-link / cold start directo a esta pantalla), cae a Home en vez de
 *  no hacer nada. */
export function smartGoBack(navigation: NavigationProp<any>): void {
  if (navigation.canGoBack()) navigation.goBack();
  else (navigation.navigate as (...args: unknown[]) => void)('Tabs', { screen: 'Home' });
}
