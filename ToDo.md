# ToDo — Sistema Premium (HoroHoro.tcg)

> Backlog de monetización organizado por tier. Marca `[x]` cuando el **gating**
> esté implementado y verificado, no cuando la feature exista.
>
> **Distinción clave:** muchas features de la tabla premium **ya están construidas**
> (sync, histórico de precio, temas, bulk scan…). Lo que falta casi siempre es el
> *entitlement*, no la funcionalidad. Cada línea marca `[BUILT]` cuando la feature
> ya existe y solo falta capar/desbloquear.

**Leyenda:** `[BUILT]` feature ya en el código · `[NEW]` hay que construirla ·
`[INFRA]` fontanería de pago/entitlements

---

## 0. Guardrails — lo que NUNCA se limita

Acordado el 2026-07-13. No convertir en premium bajo ninguna circunstancia:

- [x] **Tamaño de la colección** — es la promesa core del tracker. Caparlo invita reseñas de 1★.
- [x] **Escaneo unitario de cartas** — es on-device, coste marginal cero.
- [x] **Construcción de decks como tal** — se limita el *número de slots*, nunca la capacidad de construir.
- [x] **Amigos / social** — gratis para hacer crecer el grafo de usuarios.

> Estas casillas están marcadas como "decisión tomada", no como trabajo hecho.

---

## 1. Infraestructura (prerrequisito de todo lo demás)

- [x] `[INFRA]` **Capa de entitlements** (`lib/entitlements.ts`) — eje separado de
      `FeatureKey`/`isFeatureEnabled` de [`settings.ts`](app/src/lib/settings.ts).
      Preferencia ≠ entitlement: el usuario alterna la primera, nunca la segunda.
      Incluye `FREE_LIMITS` (topes en un único sitio), `canAddMore()` y
      `setDevEntitlements()` para probar el paywall sin store (no-op fuera de `__DEV__`).
- [ ] `[INFRA]` **Fuente de verdad = recibo de la store**, espejado a Supabase para
      multi-dispositivo, cacheado local para offline (la app es local-first).
      🔒 **Bloqueado** — depende de RevenueCat (línea de abajo); sin un
      recibo real que verificar no hay nada que espejar. Ver sección
      "Bloqueados" al final del documento.
- [ ] `[INFRA]` **RevenueCat** (`react-native-purchases`) como config-plugin del prebuild.
      Android **obliga** a Google Play Billing para bienes digitales (nada de Stripe).
      🔒 **Bloqueado** — necesita cuenta de Google Play Console + cuenta de
      RevenueCat, ambas del usuario. Ver "Bloqueados" al final.
- [x] `[INFRA]` **Paywall UI** — `PremiumScreen.tsx`, entrada desde Ajustes.
      Lista los 3 productos con copy honesto ("Próximamente", sin botón de
      compra que no lleva a ningún sitio) + panel de dev tools (`__DEV__`
      only) para forzar entitlements y probar los gates sin RevenueCat. Sin
      estados de restauración de compra todavía — eso depende de #38 (RevenueCat).
- [x] `[INFRA]` **Modo degradado**: qué pasa al expirar la suscripción (los datos NO
      se borran ni se bloquean; solo se congelan las features de coste recurrente).
      Resuelto (2026-08-17) como propiedad **emergente** de cómo se construyeron
      todos los gates de `cloud` esta sesión, no como código nuevo aparte: cuando
      `hasEntitlement('cloud')` pasa a `false` (expiración), `lib/sync.ts` deja de
      sincronizar pero no borra nada local; `VaultValueCard` sigue mostrando el
      valor actual (sólo se oculta el histórico) y `recordDailySnapshot()` sigue
      corriendo igual, así que el histórico no se pierde, sólo se deja de enseñar;
      decks/wishlists archivados o no siguen intactos en local. Verificado
      revisando cada gate de esta sesión uno a uno — ninguno borra ni bloquea
      datos, todos sólo esconden la vista/acción tras un teaser.
- [x] `[INFRA]` Tabla/columna de entitlement en Supabase + política RLS asociada.
      Construido (2026-08-17): migración `add_entitlements_table` —
      `public.entitlements(user_id pk, granted text[], updated_at)`, RLS
      activada con **solo** política de `SELECT` (`auth.uid() = user_id`).
      A propósito **sin** política de INSERT/UPDATE/DELETE para
      `authenticated`/`anon`: el cliente nunca debe poder auto-concederse
      entitlements (a diferencia de `profiles.is_premium`, que sí es
      escribible por el propio usuario porque es cosmético y sin valor
      económico). Solo `service_role` (el futuro webhook de RevenueCat) podrá
      escribir. **No cableado desde el cliente todavía** — con la tabla
      siempre vacía (sin RevenueCat) no hay nada real que tirar/mezclar
      todavía; hacerlo ahora sería código sin comportamiento correcto que
      probar. Eso queda para cuando exista el webhook (bloqueado, ver punto
      "Reportar bloqueados").

### Prerrequisitos legales (bloquean el lanzamiento monetizado)

🔒 **Bloqueados los tres** — decisiones legales/de negocio del usuario
(razón social, jurisdicción, hosting del documento). Ver "Bloqueados" al final.

- [ ] Política de privacidad publicada.
- [ ] Consentimiento GDPR/UMP (obligatorio para usuarios UE/España).
- [ ] `app-ads.txt` (si se activan ads).

---

## 2. Tier gratis — límites propuestos

- [x] `[BUILT]` **Decks**: máx. 5 decks activos simultáneos. Cableado en
      `DecksScreen` — gate en los dos botones de creación (nuevo + importar) y
      re-chequeo en el commit por si la sync cruza el tope con el modal abierto.
- [x] `[NEW]`   **Archivado de decks**: archivar/restaurar gratis e ilimitado
      (fricción, no bloqueo duro — alternativa suave al cap de slots).
      Construido (2026-08-17): `Deck.archived` en `lib/decks.ts` +
      `archiveDeck(id, archived)`. Los archivados no cuentan contra
      `FREE_LIMITS.decks`. `DecksScreen` separa activos/archivados (sección
      "Archived · N" al pie de la lista) y sustituye el menú "..." de cada
      mazo por un modal de opciones (Archivar/Restaurar + Borrar). **Nota de
      sync**: `Deck.archived` no tiene columna en Supabase todavía — funciona
      perfecto en local; `lib/sync.ts` conserva el valor local en cada
      reconcile para que no se resetee en silencio, pero no viaja entre
      dispositivos hasta que se añada la columna (ver `[INFRA]` en §1).
- [x] `[BUILT]` **Wishlists**: 1 wishlist. Gateado en los **4** sitios que crean
      wishlist (BinderScreen, WishlistPickerModal, BulkTargetSheet,
      SetBulkAddSheet) vía el nuevo `<PremiumLimitModal>` compartido y el hook
      `useLimit()` — evita repetir la copia/estilo del aviso 4 veces.
- [ ] `[NEW]`   **Binder**: 1 layout/orden guardado. Corregido de `[BUILT]` a `[NEW]`
      tras revisar el código (2026-08-16): `sort` en `BinderScreen` es `useState`
      en memoria, nada persistido — no hay nada que gatear todavía, hay que
      construir la persistencia primero. Aparcado hasta que se decida si merece
      la pena como feature en sí (fuera del alcance de "solo cablear un gate").
      🅿️ **Aparcado**.
- [x] `[BUILT]` **Bulk scan**: máx. 20 cartas *distintas* por sesión en `ScanScreen`
      (`enqueue`); repetir una carta ya encolada no cuenta. El escaneo unitario
      (modos TAP/AUTO) sigue sin tope. La cola se vacía al confirmar — eso ya
      es el límite de "sesión", no hace falta un contador aparte. Feedback:
      háptico distinto (Warning) + toast, porque el usuario está mirando las
      cartas, no la pantalla.
- [x] `[BUILT]` **Sync**: solo local, sin respaldo en la nube. Gateado
      (2026-08-17) en `lib/sync.ts` — `reconcileAll()`/`pushDomain()` no
      hacen nada sin `hasEntitlement('cloud')`, aunque haya sesión iniciada
      (Amigos/perfil público siguen gratis, no pasan por este módulo).
      `AccountScreen` muestra `<CloudLockedTeaser>` en vez del botón
      "Sincronizar ahora" cuando falta el entitlement.
- [x] `[BUILT]` **Precios**: precio actual por carta, sin histórico. Gateado
      (2026-08-17): `PriceChart` en `DetailScreen` sólo se muestra con
      `hasEntitlement('cloud')`; si no, `<CloudLockedTeaser>` enlaza a
      `PremiumScreen`. El precio actual (sin histórico) sigue siendo gratis.
- [x] `[BUILT]` **Estadísticas**: básicas (nº cartas, nº únicas). Revisado
      (2026-08-17): ya construidas y visibles en `HomeScreen` sin ningún gate
      — son parte de la promesa gratis core (guardrail §0, "tamaño de la
      colección"), no hay nada que capar aquí. Distinto del **dashboard
      avanzado** (§4), que sí es de pago y ya está gateado (ver arriba).
- [ ] `[NEW]`   **Temas**: corregido de `[BUILT]` a `[NEW]` (2026-08-16) — solo
      existen 2 modos (`light`/`dark`, formas Regular/Thundercloud de
      `themeMode.ts`), ambos gratis, sin paleta premium construida. Diseñar
      temas nuevos es una decisión de marca/diseño del usuario, no algo para
      improvisar en una sesión de código — aparcado hasta que se decida.
      🅿️ **Aparcado**.
- [ ] `[NEW]`   **Ads**: banner adaptativo no invasivo (≈7% vertical, bajo el cap del 10%).
      ⚠ Colisiona con la tab bar de 5 pestañas — apilar con cuidado usando safe-area.
      🔒 **Bloqueado** — necesita cuenta de AdMob del usuario (app registrada,
      ad unit IDs) antes de poder integrar el SDK. Ver "Bloqueados" al final.

---

## 3. Premium — compra única (coste marginal cero)

> Precio simbólico. Todo lo que no le cuesta dinero recurrente al desarrollador.

- [ ] `[NEW]`   **Quitar ads**. 🔒 **Bloqueado transitivamente** — no hay ads
      que quitar hasta que existan (bloqueado en §2, cuenta AdMob) ni forma
      de venderlo hasta que exista RevenueCat (bloqueado en §1).
- [ ] `[NEW]`   **Temas adicionales**. Corregido de `[BUILT]` (2026-08-16) — ver
      nota arriba en §2. Requiere diseñar la paleta antes de poder gatearla.
      🅿️ **Aparcado** — decisión de diseño/marca del usuario, no de código.
- [x] `[BUILT]` **Pack de imágenes offline** (ya construido). Gateado
      (2026-08-17) tras `hasEntitlement('unlocks')` en `SettingsScreen` —
      antes era descargable por cualquiera sin ningún entitlement. Mismo
      patrón `<CloudLockedTeaser>`+`PremiumScreen` que el resto de gates de
      `unlocks` de esta sesión.
- [~] `[NEW]`   **Export**: deck/colección a PDF, CSV e imagen compartible.
      Parcial (2026-08-17), gateado tras `unlocks`: mazo → imagen compartible
      (`ShareSheet`+`lib/shareImage.ts`, ya construido para trade, reusado tal
      cual desde `DeckDetailScreen`); colección → CSV (nuevo
      `lib/exportCsv.ts`, compartido vía `Share.share()`/clipboard igual que
      el código OPTCGSim, sin depender de ninguna librería nativa nueva).
      **Sin construir todavía**: PDF (cualquier formato), e imagen
      compartible de la colección completa (sólo tiene sentido para mazos —
      una colección de miles de cartas no cabe en una imagen razonable).
- [x] `[BUILT]` **Decks ilimitados**. Revisado (2026-08-17): ya era cierto por
      construcción — `getLimit()` en `lib/entitlements.ts` devuelve `null`
      (sin tope) en cuanto `hasEntitlement('unlocks')`, y `DecksScreen` ya
      usa ese límite. Nada que cablear, sólo confirmar que el mecanismo
      compartido ya cubre esto.
- [x] `[BUILT]` **Wishlists ilimitadas** + wishlist compartible/pública.
      La parte "ilimitadas" ya era cierta por el mismo mecanismo que decks
      (`getLimit()`). La parte "compartible/pública" era la que faltaba de
      verdad — construida 2026-08-17: nuevo `lib/publicWishlist.ts`
      (`fetchPublicWishlist()`, mismo patrón de sólo-lectura anónima que
      `publicBinder.ts` — la RLS de `wishlists`/`wishlist_cards` ya abría
      estas lecturas al rol `anon` cuando la privacidad es `'public'`, sólo
      faltaba el fetcher y la pantalla) + nueva `PublicWishlistScreen.tsx`
      (ruta `u/:username/wishlist`). Gate en el lado del **dueño**: en
      `AccountScreen`, la opción de privacidad "Público" de la wishlist
      (no las de colección/decks, que siguen libres) está bloqueada tras
      `hasEntitlement('unlocks')` — tocarla sin el entitlement lleva a
      Premium en vez de aplicar el cambio. Nueva fila "Compartir mi
      wishlist" en `ProfileScreen` (junto a la de compartir binder, que
      sigue gratis), gateada igual. **No verificado en el preview web**:
      requiere sesión de Supabase, sin credenciales de prueba en este
      entorno (misma limitación de siempre esta sesión). `npm run
      typecheck` limpio.
- [ ] `[NEW]`   **Binders múltiples**: carpetas custom, orden por set/rareza/valor, guardados.
      🅿️ **Aparcado** — depende de que primero exista un layout de binder
      persistido (§2, también aparcado); no tiene sentido construir "varios"
      de algo que todavía no existe "uno" persistido.
- [x] `[BUILT]` **Bulk scan ilimitado**. Revisado (2026-08-17): mismo
      mecanismo compartido (`getLimit('bulkScanPerSession')` → `null` con
      `unlocks`), ya cableado en `ScanScreen` desde antes de esta sesión.
- [x] `[NEW]`   **Insignia de perfil premium** visible para amigos (cosmético, coste cero).
      Construido (2026-08-17): columna `profiles.is_premium` en Supabase
      (migración `add_profiles_is_premium`, sin política RLS nueva — el
      `UPDATE ... WHERE id = auth.uid()` ya existente cubre escribir la
      propia fila, y `SELECT` ya era abierto a cualquier usuario logueado).
      `lib/friends.ts` → `pushPremiumBadge()` refleja `isPremium()` ahí en
      cada cambio de sesión/entitlement (ver `lib/sync.ts`); no depende de
      `cloud`, es puramente cosmético. Insignia (`<PremiumBadge>`, icono
      `sparkle`) visible en `FriendsScreen` (lista + búsqueda) y en la
      cabecera de `FriendProfileScreen`.

---

## 4. Premium — suscripción (coste recurrente real)

> Solo lo que consume infraestructura de forma continuada (Supabase, notificaciones).

- [x] `[BUILT]` **Cloud sync + backup multi-dispositivo**. Gateado (2026-08-17),
      ver nota en §2 arriba.
- [ ] `[NEW]`   **Backup versionado**: snapshots históricos, recuperar el estado de hace N semanas.
      🅿️ **Necesita decisión del usuario antes de construir** — no es un
      gate, es una feature de infra nueva con coste real de almacenamiento
      en Supabase (cuántos snapshots, cuánto se guardan, formato). Cambio
      estructural — no algo para decidir unilateralmente en una sesión de
      gating.
- [ ] `[NEW]`   **Prioridad de sync**: gratis = sync al abrir la app; premium = tiempo real/background.
      🅿️ **Necesita decisión del usuario antes de construir** — "tiempo
      real" implica Supabase Realtime (suscripciones websocket) o sync en
      background (tareas periódicas nativas); ambas son cambios de
      arquitectura del módulo de sync, no un simple gate sobre lo que ya
      existe.
- [x] `[BUILT]` **Histórico de precio** por carta (gráfica). Gateado
      (2026-08-17) tras `hasEntitlement('cloud')` en `DetailScreen`.
- [x] `[BUILT]` **Gráfica de valor de la colección** en el tiempo. Gateado
      (2026-08-17) en `VaultValueCard` — el valor actual sigue siendo gratis,
      sólo se capa la serie histórica (sparkline, delta, selector 7D/30D/Todo).
- [x] `[BUILT]` **Alertas de precio** personalizadas. Gateado (2026-08-17) en
      `HomeScreen` (banner de disparadas) y `WishlistDetailScreen` (botón de
      objetivo por carta, sustituido por un candado que enlaza a Premium).
- [ ] `[NEW]`   **Push de sets nuevos** (el calendario de sets ya existe; falta la notificación).
      🔒 **Bloqueado** — necesita credenciales de push (proyecto Expo/FCM),
      guardar el push token de cada usuario, y un disparador server-side (se
      podría extender `.github/workflows/refresh-data.yml`, que ya corre el
      scraper, para detectar sets nuevos y llamar a la Expo Push API, pero
      eso exige un secret de acceso en el repo que sólo el usuario puede
      crear). Ver "Bloqueados" al final.
- [x] `[NEW]`   **Dashboard avanzado**: valor por set, % de completitud, cartas más valiosas,
      distribución por rareza. Construido (2026-08-17): nuevo `lib/dashboardStats.ts`
      agrega sobre infra ya existente (`setsStats.ts`, `portfolio.ts`, `setMeta.ts`,
      `ownedAggregate.ts`) — sin fuentes de datos nuevas. Nueva `StatsScreen.tsx`
      gateada entera tras `hasEntitlement('cloud')` (bloqueo a nivel de pantalla,
      no por sección — el ToDo lo enmarca como una sola feature). Entrada desde
      Ajustes (fila junto a Premium). Sin librería de gráficas: barras simples
      con `View`+% de ancho, consistente con el resto de la app.
- [x] `[NEW]`   **Historial de trades**. Corregido de `[BUILT]` (2026-08-17) —
      revisando el código no existía ninguna vista de historial: sólo se
      mostraban las ofertas abiertas (pendientes o aceptadas sin aplicar);
      las rechazadas/canceladas/completadas se cargaban en caché
      (`tradeOffers.ts`) pero nunca se enseñaban en ningún sitio. Construido
      ahora: `FriendProfileScreen` → pestaña Trade separa `openOffers` de
      `historyOffers` (declined/cancelled/accepted-y-ya-aplicada) y añade una
      sección de sólo lectura al final con las cerradas (estado + líneas +
      fecha, sin botones de acción). **Sin gate** a propósito, aunque el
      ToDo lo listaba en §4 (suscripción): el trading en sí (crear, aceptar,
      aplicar) nunca estuvo capado — es parte del guardrail "Amigos/social
      gratis" de §0 — así que su historial tampoco debería estarlo; mismo
      criterio que "Sugerencias de match" arriba, donde sólo el *digest
      agregado* entre todos los amigos es de pago, nunca la interacción
      1-a-1 con un amigo concreto. `npm run typecheck` limpio. **No
      verificado en el preview web** (requiere sesión + un amigo con
      historial real, sin credenciales de prueba en este entorno).
- [x] `[NEW]`   **Sugerencias de match**: wishlist de un amigo ↔ mi colección.
      Construido (2026-08-17). El matching en sí (por código base) ya existía
      en `lib/tradeMatch.ts` y estaba libre, cableado por-amigo en
      `FriendProfileScreen` → pestaña Trade (sin gate, sigue así — es parte
      del guardrail "Amigos/social gratis" de §0). Lo nuevo es el **digest
      agregado**: nuevo `lib/friendMatches.ts` (`getAllFriendMatches()`)
      recorre TODOS los amigos confirmados en paralelo, reusa el mismo
      matching puro, y devuelve sólo los que tienen solapamiento, ordenados
      por nº de matches. Nueva `MatchesScreen.tsx` (entrada desde
      `FriendsScreen`), gateada entera tras `hasEntitlement('cloud')` — sin
      esto se recorrería la wishlist/colección de cada amigo uno a uno bajo
      cuerda, así que gatear sólo el digest (no el matching por-amigo, que
      sigue gratis) es coherente con el guardrail.
      **No verificado en el preview web**: `Friends`/`Matches` sólo son
      alcanzables con sesión iniciada y no hay credenciales de Supabase de
      prueba en este entorno (misma limitación que la insignia premium,
      ver diario). Verificado por código: reusa 100% los fetchers/matching
      ya en producción (`getFriendCollection`/`getFriendWishlists`/
      `tradeMatch.ts`), y el patrón de bloqueo de pantalla es idéntico al de
      `StatsScreen` (ya sí verificado en el preview). `npm run typecheck`
      limpio.

---

## 5. Ideas sin decidir (parking)

- [ ] **Ads recompensados opt-in** ("ver anuncio → +N escaneos"). Encaja con la
      filosofía no invasiva, pero añade superficie de UX.
- [ ] Realidad de ingresos: en un nicho TCG el banner rinde céntimos/usuario/mes.
      Los ads son **palanca de conversión** ("quítalos"), no el negocio. El negocio
      son las suscripciones y la compra única.

---

## Secuenciación acordada (2026-07-13)

La monetización **no era lo siguiente**. Orden pactado:

1. [ ] Verificar el escáner on-device con carta real (el diferenciador de verdad, nunca probado en dispositivo).
      🔒 **Bloqueado** — necesita un dispositivo Android físico y `npm run
      android` (prebuild); el escáner OCR es un no-op en Expo Go y en el
      preview web (ver `lib/ocr.ts`). Ver "Bloqueados" al final.
2. [ ] Test cerrado con compañeros del usuario para feedback.
      🔒 **Bloqueado** — necesita que el usuario reclute a los testers y
      distribuya un build (closed testing track de Play Console o similar).
3. [ ] Prerrequisitos legales (política de privacidad + consentimiento GDPR).
      🔒 **Bloqueado** — ver §1 arriba.
4. [ ] Paywall RevenueCat + banner AdMob.
      🔒 **Bloqueado** — ver §1/§2 arriba.

---

## Bloqueados — necesitan acción externa del usuario

Todo lo marcado 🔒 arriba, resumido aquí para no tener que rastrearlo línea a
línea. Ninguno de estos es "difícil de programar" — todos requieren cuentas,
credenciales o decisiones que sólo el usuario puede crear/tomar; no hay
código que yo pueda escribir para destrabarlos.

1. **RevenueCat** (`react-native-purchases`) — necesita: cuenta de Google
   Play Console (con la app ya publicada al menos en un track interno),
   productos de compra única/suscripción creados ahí, cuenta de RevenueCat
   enlazada a esa app, y luego el config-plugin + prebuild nativo (que a su
   vez necesita probarse en dispositivo/emulador real, no en el preview
   web). Sin esto, `entitlements` y la tabla de Supabase de la entrada (9)
   se quedan como fontanería sin agua corriendo por ella — construidas y
   listas, pero vacías.
2. **AdMob** — necesita: cuenta de AdMob, la app registrada ahí, ad unit
   IDs generados, y `app-ads.txt` publicado en el dominio de la app. El
   banner en sí (UI, posición respetando la tab bar) es sencillo de
   construir una vez exista la cuenta.
3. **Legal**: política de privacidad publicada en una URL pública,
   consentimiento GDPR/UMP (obligatorio para España/UE), y `app-ads.txt`
   (si se activan ads). Esto es contenido legal y una decisión de
   jurisdicción/razón social — no algo que deba redactar y publicar por mi
   cuenta sin que el usuario lo revise primero.
4. **Test en dispositivo real** — el escáner OCR (`@react-native-ml-kit/
   text-recognition`) sólo funciona tras `npm run android` (prebuild
   nativo); es un no-op tanto en Expo Go como en el preview web usado toda
   esta sesión. Sigue sin verificarse "con carta real" desde la última
   sesión en dispositivo (ver diario, 2026-08-05).
5. **Test cerrado con compañeros** — necesita que el usuario reclute
   testers y distribuya un build (closed testing track), paso posterior al
   punto 4.
6. **Push de sets nuevos** — necesita credenciales de push (proyecto Expo/
   FCM) y, si se dispara desde el workflow de scraping ya existente
   (`.github/workflows/refresh-data.yml`), un secret de acceso a la Expo
   Push API en la config del repo — sólo el usuario tiene permisos para
   crear secrets de repo.

Nada de esto bloquea el resto del sistema premium: **todos los gates de
`cloud`/`unlocks` ya construidos esta sesión funcionan hoy mismo** vía el
panel de dev tools de `PremiumScreen` (`__DEV__` only) — lo único que falta
es la fontanería de pago real para que un usuario normal pueda comprar de
verdad, no la lógica de qué se desbloquea con qué.
