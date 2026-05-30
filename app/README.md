# OPTCG Collector — App (MVP)

App móvil para buscar cartas de One Piece TCG, ver sus variantes, marcar
una colección personal y consultar el precio en Cardmarket.

Hecha con **React Native + Expo** y TypeScript. Lee `../data/index.json`
y descarga las imágenes desde el CDN (jsDelivr) del repo.

## Requisitos

- Node.js 18 o superior.
- App **Expo Go** en tu móvil (iOS o Android) — o un emulador.
- Que el repo esté disponible en GitHub si quieres ver las imágenes en
  un dispositivo real (jsDelivr necesita un repo público).

## Arranque rápido

```bash
cd app
npm install
npm start
```

Esto abre Expo en el navegador. Escanea el QR con la app de Expo Go en
tu móvil y la app cargará en unos segundos.

## Configuración antes de probarla en serio

Antes de tener imágenes funcionando hay que ajustar el repo en
`src/config.ts`:

```ts
export const GITHUB_USER = 'tu-usuario';
export const GITHUB_REPO = 'OPTCG-Collector';
export const GITHUB_BRANCH = 'main';
```

La app construye las URLs de las imágenes así:
`https://cdn.jsdelivr.net/gh/{USER}/{REPO}@{BRANCH}/images/...`

Mientras `GITHUB_USER` siga siendo `TU_USUARIO`, las miniaturas se
mostrarán como placeholders. El resto de la app (búsqueda, colección,
enlace a Cardmarket) funciona igual.

## Estructura

```
app/
├── App.tsx                 # entrada: NavigationContainer + tabs + stack
├── package.json
├── app.json                # config Expo
├── babel.config.js
├── metro.config.js         # extiende watchFolders para leer ../data/
├── tsconfig.json
└── src/
    ├── config.ts           # usuario/repo de GitHub para el CDN
    ├── types.ts            # Card, Variant, CollectionItem
    ├── navigation.ts       # tipos de las rutas
    ├── data/
    │   └── loadIndex.ts    # require('../../../data/index.json')
    ├── lib/
    │   ├── images.ts       # imageUrl()
    │   ├── cardmarket.ts   # buildCardmarketSearchUrl()
    │   └── collection.ts   # AsyncStorage: get/set/adjust counts
    ├── components/
    │   └── VariantThumb.tsx
    └── screens/
        ├── SearchScreen.tsx
        ├── DetailScreen.tsx
        └── CollectionScreen.tsx
```

## Qué hace la app hoy

- **Buscar**: filtro en memoria por código o nombre sobre el índice
  completo (~2400 cartas). Sin retraso perceptible.
- **Detalle**: ves todas las variantes de una carta (Normal, Parallel,
  Manga, Alt Art...) con su imagen y rareza.
- **Mi colección**: por cada variante hay un contador `−` / `+` que se
  persiste con AsyncStorage. La pestaña "Mi colección" lista todas las
  variantes con count > 0 y muestra un badge con la cantidad.
- **Cardmarket**: cada variante tiene un botón "Ver en Cardmarket" que
  abre la búsqueda por código (`?searchString=OP01-001`) en el navegador.

## Lo que NO hace todavía

- OCR de cartas con la cámara (el README del repo lo menciona como
  objetivo futuro).
- Precio en Cardmarket dentro de la app (requeriría API oficial o
  scraping; el MVP solo abre la web).
- Sincronización entre dispositivos (la colección vive solo en local).
- Filtros avanzados (por set, color, rareza...).
- i18n (la UI está en español hardcodeado).

## Para extender

- **Filtros por set / color**: añadir botones de filtro en `SearchScreen`
  y enriquecer los datos del índice con esos campos (la API de OPTCG
  los devuelve, hay que mapearlos en `build_card_database.py`).
- **OCR**: integrar `expo-camera` + un servicio de OCR (Google ML Kit
  en nativo, o un endpoint propio). Cuando lea el código, navegar a
  `Detail` con ese code.
- **Precio inline de Cardmarket**: lo más realista es un backend tuyo
  que consuma la API oficial y cachee. Si te interesa, dilo y te
  preparo el endpoint.
