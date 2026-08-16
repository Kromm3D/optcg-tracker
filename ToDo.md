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
- [ ] `[INFRA]` **RevenueCat** (`react-native-purchases`) como config-plugin del prebuild.
      Android **obliga** a Google Play Billing para bienes digitales (nada de Stripe).
- [ ] `[INFRA]` **Paywall UI** + estados de restauración de compra.
- [ ] `[INFRA]` **Modo degradado**: qué pasa al expirar la suscripción (los datos NO
      se borran ni se bloquean; solo se congelan las features de coste recurrente).
- [ ] `[INFRA]` Tabla/columna de entitlement en Supabase + política RLS asociada.

### Prerrequisitos legales (bloquean el lanzamiento monetizado)

- [ ] Política de privacidad publicada.
- [ ] Consentimiento GDPR/UMP (obligatorio para usuarios UE/España).
- [ ] `app-ads.txt` (si se activan ads).

---

## 2. Tier gratis — límites propuestos

- [x] `[BUILT]` **Decks**: máx. 5 decks activos simultáneos. Cableado en
      `DecksScreen` — gate en los dos botones de creación (nuevo + importar) y
      re-chequeo en el commit por si la sync cruza el tope con el modal abierto.
- [ ] `[NEW]`   **Archivado de decks**: archivar/restaurar gratis e ilimitado
      (fricción, no bloqueo duro — alternativa suave al cap de slots).
- [ ] `[BUILT]` **Wishlists**: 1 wishlist.
- [ ] `[BUILT]` **Binder**: 1 layout/orden guardado.
- [ ] `[BUILT]` **Bulk scan**: limitado a N cartas por sesión (el escaneo unitario sigue ilimitado).
- [ ] `[BUILT]` **Sync**: solo local, sin respaldo en la nube.
- [ ] `[BUILT]` **Precios**: precio actual por carta, sin histórico.
- [ ] `[BUILT]` **Estadísticas**: básicas (nº cartas, nº únicas).
- [ ] `[BUILT]` **Temas**: solo el tema por defecto.
- [ ] `[NEW]`   **Ads**: banner adaptativo no invasivo (≈7% vertical, bajo el cap del 10%).
      ⚠ Colisiona con la tab bar de 5 pestañas — apilar con cuidado usando safe-area.

---

## 3. Premium — compra única (coste marginal cero)

> Precio simbólico. Todo lo que no le cuesta dinero recurrente al desarrollador.

- [ ] `[NEW]`   **Quitar ads**.
- [ ] `[BUILT]` **Temas adicionales** (el sistema multi-forma ya existe).
- [ ] `[BUILT]` **Pack de imágenes offline** (ya construido).
- [ ] `[NEW]`   **Export**: deck/colección a PDF, CSV e imagen compartible.
- [ ] `[BUILT]` **Decks ilimitados**.
- [ ] `[BUILT]` **Wishlists ilimitadas** + wishlist compartible/pública.
- [ ] `[NEW]`   **Binders múltiples**: carpetas custom, orden por set/rareza/valor, guardados.
- [ ] `[BUILT]` **Bulk scan ilimitado**.
- [ ] `[NEW]`   **Insignia de perfil premium** visible para amigos (cosmético, coste cero).

---

## 4. Premium — suscripción (coste recurrente real)

> Solo lo que consume infraestructura de forma continuada (Supabase, notificaciones).

- [ ] `[BUILT]` **Cloud sync + backup multi-dispositivo**.
- [ ] `[NEW]`   **Backup versionado**: snapshots históricos, recuperar el estado de hace N semanas.
- [ ] `[NEW]`   **Prioridad de sync**: gratis = sync al abrir la app; premium = tiempo real/background.
- [ ] `[BUILT]` **Histórico de precio** por carta (gráfica).
- [ ] `[BUILT]` **Gráfica de valor de la colección** en el tiempo.
- [ ] `[BUILT]` **Alertas de precio** personalizadas.
- [ ] `[NEW]`   **Push de sets nuevos** (el calendario de sets ya existe; falta la notificación).
- [ ] `[NEW]`   **Dashboard avanzado**: valor por set, % de completitud, cartas más valiosas,
      distribución por rareza.
- [ ] `[BUILT]` **Historial de trades**.
- [ ] `[NEW]`   **Sugerencias de match**: wishlist de un amigo ↔ mi colección.

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
2. [ ] Test cerrado con compañeros del usuario para feedback.
3. [ ] Prerrequisitos legales (política de privacidad + consentimiento GDPR).
4. [ ] Paywall RevenueCat + banner AdMob.
