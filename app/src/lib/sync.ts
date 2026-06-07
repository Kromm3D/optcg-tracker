// Capa de sincronización local-first con Supabase.
//
// Contrato:
//   * La app funciona 100% offline sin cuenta. Esta capa solo actúa cuando hay
//     sesión iniciada (lib/auth) y el backend está configurado (config.ts).
//   * Al iniciar sesión se hace un RECONCILE (pull + merge LWW + escribir en
//     ambos lados) para fusionar lo local con lo del servidor.
//   * Tras cualquier cambio local (vía syncBus) se agenda un PUSH con debounce
//     que refleja el estado local en el servidor (upsert + borrado de extras).
//
// Resolución de conflictos = last-write-wins por `updatedAt` (ms). El reconcile
// hace UNIÓN (no borra) para no perder datos en el primer login; los borrados se
// propagan después mediante el mirror push. La sincronización en tiempo real
// entre dispositivos (realtime) queda fuera de v1 — se reconcilia en cada login.

import { supabase } from './supabase';
import { getUser, onAuthChange } from './auth';
import { onLocalChange, type SyncDomain } from './syncBus';
import type { CollectionItem, Wishlist } from '../types';
import {
  getCacheSync as getCollectionCache,
  replaceAllFromSync as replaceCollection,
} from './collection';
import {
  getCachedDecks,
  replaceAllFromSync as replaceDecks,
  type Deck,
} from './decks';
import { getCachedWishlists, replaceAllFromSync as replaceWishlists } from './wishlists';
import {
  applyFromSync as applySettings,
  getCachedSettings,
  type Settings,
} from './settings';

export type SyncStatus = 'idle' | 'syncing' | 'error' | 'offline';

let userId: string | null = null;
let status: SyncStatus = 'idle';
let lastSyncedAt: number | null = null;
let reconciling = false;
const pushTimers: Partial<Record<SyncDomain, ReturnType<typeof setTimeout>>> = {};
const listeners = new Set<() => void>();

const PUSH_DEBOUNCE_MS = 1500;

function setStatus(s: SyncStatus): void {
  status = s;
  listeners.forEach((l) => l());
}

/** Estado actual de la sincronización (para la UI). */
export function getSyncStatus(): SyncStatus {
  return status;
}

/** Timestamp (ms) del último sync completado, o null. */
export function getLastSyncedAt(): number | null {
  return lastSyncedAt;
}

export function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

const toMs = (iso: string | null | undefined): number => (iso ? Date.parse(iso) : 0);
const toIso = (ms: number | undefined): string => new Date(ms ?? 0).toISOString();

// ─── Arranque: reaccionar a login/logout ────────────────────────────────────
if (supabase) {
  onAuthChange(() => {
    const u = getUser();
    const nextId = u?.id ?? null;
    if (nextId === userId) return;
    userId = nextId;
    if (userId) void reconcileAll();
    else setStatus('idle');
  });

  // Cambios locales → push con debounce (solo si hay sesión y no reconciliando).
  onLocalChange((domain) => {
    if (!userId || reconciling) return;
    if (pushTimers[domain]) clearTimeout(pushTimers[domain]);
    pushTimers[domain] = setTimeout(() => {
      pushTimers[domain] = undefined;
      void pushDomain(domain);
    }, PUSH_DEBOUNCE_MS);
  });
}

/** Fuerza un reconcile completo (botón "Sincronizar ahora"). */
export async function syncNow(): Promise<void> {
  if (!userId) return;
  await reconcileAll();
}

async function reconcileAll(): Promise<void> {
  if (!supabase || !userId) return;
  reconciling = true;
  setStatus('syncing');
  try {
    await reconcileCollection();
    await reconcileSettings();
    await reconcileWishlists();
    await reconcileDecks();
    lastSyncedAt = Date.now();
    setStatus('idle');
  } catch (e) {
    console.warn('[sync] reconcile error:', e);
    setStatus('error');
  } finally {
    reconciling = false;
  }
}

async function pushDomain(domain: SyncDomain): Promise<void> {
  if (!supabase || !userId) return;
  setStatus('syncing');
  try {
    if (domain === 'collection') await pushCollection();
    else if (domain === 'settings') await pushSettings();
    else if (domain === 'wishlists') await pushWishlists();
    else if (domain === 'decks') await pushDecks();
    lastSyncedAt = Date.now();
    setStatus('idle');
  } catch (e) {
    console.warn(`[sync] push ${domain} error:`, e);
    setStatus('error');
  }
}

// ─── Collection (LWW bidireccional por item) ────────────────────────────────

async function reconcileCollection(): Promise<void> {
  const sb = supabase!;
  const { data, error } = await sb
    .from('collection_items')
    .select('code, suffix, count, updated_at')
    .eq('user_id', userId);
  if (error) throw error;

  const local = getCollectionCache();
  const merged: Record<string, CollectionItem> = {};
  const upserts: CollectionItem[] = [];

  for (const it of Object.values(local)) merged[it.key] = it;

  for (const row of data ?? []) {
    const key = `${row.code}${row.suffix}`;
    const serverMs = toMs(row.updated_at);
    const localItem = merged[key];
    if (!localItem) {
      merged[key] = { key, code: row.code, suffix: row.suffix, count: row.count, updatedAt: serverMs };
    } else if (serverMs > (localItem.updatedAt ?? 0)) {
      merged[key] = { ...localItem, count: row.count, updatedAt: serverMs };
    }
  }

  // Lo que el servidor no tiene o tiene desactualizado → upsert.
  const serverByKey = new Map((data ?? []).map((r) => [`${r.code}${r.suffix}`, r]));
  for (const item of Object.values(merged)) {
    const srv = serverByKey.get(item.key);
    if (!srv || toMs(srv.updated_at) < (item.updatedAt ?? 0) || srv.count !== item.count) {
      upserts.push(item);
    }
  }

  replaceCollection(Object.values(merged));
  if (upserts.length) await upsertCollectionRows(upserts);
}

async function pushCollection(): Promise<void> {
  const sb = supabase!;
  const local = Object.values(getCollectionCache());
  if (local.length) await upsertCollectionRows(local);

  // Borrar del servidor lo que ya no está en local (mirror).
  const { data } = await sb.from('collection_items').select('code, suffix').eq('user_id', userId);
  const localKeys = new Set(local.map((i) => i.key));
  const stale = (data ?? []).filter((r) => !localKeys.has(`${r.code}${r.suffix}`));
  for (const r of stale) {
    await sb.from('collection_items').delete().match({ user_id: userId, code: r.code, suffix: r.suffix });
  }
}

async function upsertCollectionRows(items: CollectionItem[]): Promise<void> {
  const sb = supabase!;
  const rows = items.map((i) => ({
    user_id: userId,
    code: i.code,
    suffix: i.suffix,
    count: i.count,
    updated_at: toIso(i.updatedAt),
  }));
  const { error } = await sb.from('collection_items').upsert(rows, { onConflict: 'user_id,code,suffix' });
  if (error) throw error;
}

// ─── Settings (LWW, una sola fila jsonb) ────────────────────────────────────

async function reconcileSettings(): Promise<void> {
  const sb = supabase!;
  const { data, error } = await sb
    .from('user_settings')
    .select('data, updated_at')
    .eq('user_id', userId)
    .maybeSingle();
  if (error) throw error;

  const local = getCachedSettings();
  const serverMs = toMs(data?.updated_at);
  const localMs = local?.updatedAt ?? 0;

  if (data && serverMs >= localMs) {
    await applySettings(data.data as Settings);
  } else if (local) {
    await pushSettings();
  }
}

async function pushSettings(): Promise<void> {
  const sb = supabase!;
  const local = getCachedSettings();
  if (!local) return;
  const { error } = await sb
    .from('user_settings')
    .upsert({ user_id: userId, data: local, updated_at: toIso(local.updatedAt) }, { onConflict: 'user_id' });
  if (error) throw error;
}

// ─── Wishlists (LWW por wishlist; cards reemplazados en bloque) ──────────────

async function reconcileWishlists(): Promise<void> {
  const sb = supabase!;
  const [wlRes, cardRes] = await Promise.all([
    sb.from('wishlists').select('id, name, created_at, updated_at').eq('user_id', userId),
    sb.from('wishlist_cards').select('wishlist_id, code, suffix, needed, added_at'),
  ]);
  if (wlRes.error) throw wlRes.error;
  if (cardRes.error) throw cardRes.error;

  const serverCardsByWl = new Map<string, Wishlist['cards']>();
  for (const c of cardRes.data ?? []) {
    const m = serverCardsByWl.get(c.wishlist_id) ?? {};
    m[`${c.code}${c.suffix}`] = { code: c.code, suffix: c.suffix, needed: c.needed, addedAt: toMs(c.added_at) };
    serverCardsByWl.set(c.wishlist_id, m);
  }

  const merged: Record<string, Wishlist> = {};
  for (const wl of getCachedWishlists()) merged[wl.id] = wl;

  for (const row of wlRes.data ?? []) {
    const serverMs = toMs(row.updated_at);
    const localWl = merged[row.id];
    if (!localWl || serverMs > (localWl.updatedAt ?? 0)) {
      merged[row.id] = {
        id: row.id,
        name: row.name,
        cards: serverCardsByWl.get(row.id) ?? {},
        createdAt: toMs(row.created_at),
        updatedAt: serverMs,
      };
    }
  }

  await replaceWishlists(Object.values(merged));
  await pushWishlistRows(Object.values(merged), wlRes.data?.map((r) => r.id) ?? []);
}

async function pushWishlists(): Promise<void> {
  const sb = supabase!;
  const { data } = await sb.from('wishlists').select('id').eq('user_id', userId);
  await pushWishlistRows(getCachedWishlists(), (data ?? []).map((r) => r.id));
}

async function pushWishlistRows(local: Wishlist[], serverIds: string[]): Promise<void> {
  const sb = supabase!;
  const localIds = new Set(local.map((w) => w.id));

  // Borrar wishlists del servidor que ya no existen en local (cascada borra cards).
  const stale = serverIds.filter((id) => !localIds.has(id));
  if (stale.length) await sb.from('wishlists').delete().in('id', stale);

  for (const wl of local) {
    const { error } = await sb.from('wishlists').upsert(
      { id: wl.id, user_id: userId, name: wl.name, created_at: toIso(wl.createdAt), updated_at: toIso(wl.updatedAt) },
      { onConflict: 'id' },
    );
    if (error) throw error;
    // Reemplazar cards en bloque (dataset pequeño).
    await sb.from('wishlist_cards').delete().eq('wishlist_id', wl.id);
    const cards = Object.values(wl.cards);
    if (cards.length) {
      const { error: cErr } = await sb.from('wishlist_cards').insert(
        cards.map((c) => ({
          wishlist_id: wl.id,
          code: c.code,
          suffix: c.suffix,
          needed: c.needed,
          added_at: toIso(c.addedAt),
        })),
      );
      if (cErr) throw cErr;
    }
  }
}

// ─── Decks (LWW por deck; cards reemplazados en bloque) ──────────────────────

async function reconcileDecks(): Promise<void> {
  const sb = supabase!;
  const [deckRes, cardRes] = await Promise.all([
    sb.from('decks').select('id, name, leader_id, created_at, updated_at').eq('user_id', userId),
    sb.from('deck_cards').select('deck_id, code, qty'),
  ]);
  if (deckRes.error) throw deckRes.error;
  if (cardRes.error) throw cardRes.error;

  const serverCardsByDeck = new Map<string, Deck['cards']>();
  for (const c of cardRes.data ?? []) {
    const arr = serverCardsByDeck.get(c.deck_id) ?? [];
    arr.push({ code: c.code, qty: c.qty });
    serverCardsByDeck.set(c.deck_id, arr);
  }

  const merged: Record<string, Deck> = {};
  for (const d of getCachedDecks()) merged[d.id] = d;

  for (const row of deckRes.data ?? []) {
    const serverMs = toMs(row.updated_at);
    const localD = merged[row.id];
    if (!localD || serverMs > (localD.updatedAt ?? 0)) {
      merged[row.id] = {
        id: row.id,
        name: row.name,
        leaderId: row.leader_id ?? undefined,
        cards: serverCardsByDeck.get(row.id) ?? [],
        createdAt: toMs(row.created_at),
        updatedAt: serverMs,
      };
    }
  }

  await replaceDecks(Object.values(merged));
  await pushDeckRows(Object.values(merged), deckRes.data?.map((r) => r.id) ?? []);
}

async function pushDecks(): Promise<void> {
  const sb = supabase!;
  const { data } = await sb.from('decks').select('id').eq('user_id', userId);
  await pushDeckRows(getCachedDecks(), (data ?? []).map((r) => r.id));
}

async function pushDeckRows(local: Deck[], serverIds: string[]): Promise<void> {
  const sb = supabase!;
  const localIds = new Set(local.map((d) => d.id));
  const stale = serverIds.filter((id) => !localIds.has(id));
  if (stale.length) await sb.from('decks').delete().in('id', stale);

  for (const d of local) {
    const { error } = await sb.from('decks').upsert(
      {
        id: d.id,
        user_id: userId,
        name: d.name,
        leader_id: d.leaderId ?? null,
        created_at: toIso(d.createdAt),
        updated_at: toIso(d.updatedAt),
      },
      { onConflict: 'id' },
    );
    if (error) throw error;
    await sb.from('deck_cards').delete().eq('deck_id', d.id);
    if (d.cards.length) {
      const { error: cErr } = await sb
        .from('deck_cards')
        .insert(d.cards.map((c) => ({ deck_id: d.id, code: c.code, qty: c.qty })));
      if (cErr) throw cErr;
    }
  }
}
