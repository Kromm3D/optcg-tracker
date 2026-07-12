// Entry point personalizado (sustituye a expo/AppEntry.js). Lee el modo de
// tema guardado ANTES de requerir App — y por tanto antes de que cualquier
// pantalla evalúe su StyleSheet.create con `colors` de theme.ts — para que
// arranque ya con la forma de Zeus correcta sin parpadeo. Ver lib/themeMode.ts.
//
// IMPORTANTE: `registerRootComponent` debe llamarse SÍNCRONAMENTE en la
// evaluación del módulo. En nativo (Android/iOS) el bridge llama a
// `AppRegistry.runApplication("main", …)` justo tras cargar el bundle; si el
// registro está detrás de un `await` (como antes), llega tarde y la app
// revienta con "App entry point named 'main' was not registered" — no
// reproducible en web, solo visto en build nativo real. Por eso el componente
// raíz se registra ya mismo y es él quien espera de forma async (devolviendo
// `null` mientras tanto) antes de requerir `./App`.
import { registerRootComponent } from 'expo';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useEffect, useState, createElement } from 'react';

const THEME_MODE_KEY = 'optcg.themeMode.v1';

function Root() {
  const [ready, setReady] = useState(false);

  useEffect(() => {
    (async () => {
      let mode = 'dark';
      try {
        const stored = await AsyncStorage.getItem(THEME_MODE_KEY);
        if (stored === 'light' || stored === 'dark') mode = stored;
      } catch {
        // sin storage disponible (primer arranque/error) -> Thundercloud por defecto
      }
      globalThis.__INITIAL_THEME_MODE__ = mode;
      setReady(true);
    })();
  }, []);

  if (!ready) return null;

  // require() diferido a propósito: un import estático de ./App se evaluaría
  // de inmediato (antes de que __INITIAL_THEME_MODE__ esté listo), arrastrando
  // consigo todas las pantallas y sus StyleSheet.create ya congelados con el
  // tema por defecto.
  const App = require('./App').default;
  return createElement(App);
}

registerRootComponent(Root);
