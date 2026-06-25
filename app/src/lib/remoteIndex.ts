// Comprueba si hay un set nuevo publicado en el CDN, lo descarga y valida en
// segundo plano, y deja el resultado cacheado en memoria listo para aplicar
// con un solo tap (ver components/SetUpdateBanner.tsx). Sigue el mismo patrón
// que settings.ts/wishlists.ts: cache en memoria + AsyncStorage + listeners.
//
// Fallo silencioso en cualquier punto (offline, CDN caído, JSON inválido,
// schema_version que este build no entiende): el índice bundleado sigue
// sirviendo sin que el usuario vea ningún error. El aviso solo aparece una
// vez el índice nuevo ya está descargado, validado y listo para aplicarse.

import AsyncStorage from '@react-native-async-storage/async-storage';
import { DATA_BASE_URL } from '../config';
import type { IndexMetaPayload, IndexPayload } from '../types';
import { BUNDLED_META, INDEX_META, SET_META, applyIndexPayload } from '../data/loadIndex';

const STORAGE_KEY = 'optcg.remoteIndex.v1';
/** Debe coincidir con INDEX_SCHEMA_VERSION en scripts/build_card_database.py. */
const SUPPORTED_SCHEMA_VERSION = 1;

type HashPayload = {
  hash_algo: string;
  hash_size: number;
  hash_count: number;
  hashes: Record<string, string>;
};

type PendingUpdate = {
  version: number;
  newestSet: string | null;
  /** Códigos de set presentes en el payload remoto pero no en el índice activo. */
  newSets: string[];
  payload: IndexPayload;
  hashes?: HashPayload;
};

let pending: PendingUpdate | null = null;
let lastSeenVersion = Math.max(BUNDLED_META.version ?? 0, INDEX_META.version ?? 0);
let checked = false;
const listeners = new Set<() => void>();

function emit(): void {
  listeners.forEach((l) => l());
}

export function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/** Snapshot síncrono del update listo para aplicar, o null si no hay ninguno. */
export function getPendingUpdate(): { version: number; newestSet: string | null; newSets: string[] } | null {
  if (!pending) return null;
  return { version: pending.version, newestSet: pending.newestSet, newSets: pending.newSets };
}

async function readLastSeenVersion(): Promise<number> {
  try {
    const raw = await AsyncStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as { lastSeenVersion?: number };
      if (typeof parsed.lastSeenVersion === 'number') {
        return Math.max(lastSeenVersion, parsed.lastSeenVersion);
      }
    }
  } catch {
    // Storage ilegible: tratamos como "nunca visto" y seguimos.
  }
  return lastSeenVersion;
}

async function writeLastSeenVersion(version: number): Promise<void> {
  lastSeenVersion = version;
  try {
    await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify({ lastSeenVersion: version }));
  } catch {
    // No-op: el peor caso es volver a descargar el mismo índice la próxima vez.
  }
}

/**
 * Lanza la comprobación en segundo plano. Pensado para llamarse una vez al
 * arrancar la app (ver App.tsx, justo después de que carguen las fuentes).
 * Nunca lanza — cualquier fallo se traga y el índice bundleado sigue activo.
 */
export async function checkForUpdate(): Promise<void> {
  if (checked) return; // una comprobación por sesión de app basta
  checked = true;
  try {
    lastSeenVersion = await readLastSeenVersion();

    const metaRes = await fetch(`${DATA_BASE_URL}/meta.json`);
    if (!metaRes.ok) return;
    const remoteMeta = (await metaRes.json()) as IndexMetaPayload;

    if (remoteMeta.schema_version !== SUPPORTED_SCHEMA_VERSION) return;
    if (!remoteMeta.version || remoteMeta.version <= lastSeenVersion) return;

    const indexRes = await fetch(`${DATA_BASE_URL}/index.json`);
    if (!indexRes.ok) return;
    const remotePayload = (await indexRes.json()) as IndexPayload;
    if (remotePayload.schema_version !== SUPPORTED_SCHEMA_VERSION) return;
    if (!remotePayload.cards || typeof remotePayload.cards !== 'object') return;

    let hashes: HashPayload | undefined;
    try {
      const hashRes = await fetch(`${DATA_BASE_URL}/hashes.json`);
      if (hashRes.ok) hashes = (await hashRes.json()) as HashPayload;
    } catch {
      // Los hashes solo alimentan el escáner por arte; seguimos sin ellos si fallan.
    }

    const newSets = Object.keys(remotePayload.set_meta ?? {}).filter((code) => !(code in SET_META));

    pending = {
      version: remotePayload.version ?? remoteMeta.version,
      newestSet: remoteMeta.newest_set,
      newSets,
      payload: remotePayload,
      hashes,
    };
    emit();
  } catch {
    // Offline, CDN caído, JSON inválido... silencioso por diseño (ver brief).
  }
}

/** Aplica el update pendiente (si hay uno) y limpia el estado. Idempotente. */
export function applyPendingUpdate(): void {
  if (!pending) return;
  applyIndexPayload(pending.payload, pending.hashes);
  void writeLastSeenVersion(pending.version);
  pending = null;
  emit();
}
