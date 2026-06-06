// Prefetch offline — descarga todas las imágenes CDN al disco local usando
// expo-image, de forma que la app funcione sin conexión tras la primera descarga.

import { Image } from 'expo-image';
import { CARD_LIST } from '../data/loadIndex';
import { imageUrl } from './images';

export type PrefetchProgress = { done: number; total: number };
export type PrefetchCancel = { cancelled: boolean };

const BATCH = 8;

export function countAllImageUrls(): number {
  let n = 0;
  for (const card of CARD_LIST) {
    for (const v of card.variants) {
      if (imageUrl(v.image_local)) n++;
    }
  }
  return n;
}

/**
 * Descarga todas las imágenes CDN al disco local en lotes.
 * Llama a onProgress tras cada lote. Si cancel.cancelled = true, para limpiamente.
 * Devuelve true si completó, false si fue cancelado.
 */
export async function prefetchAllImages(
  onProgress: (p: PrefetchProgress) => void,
  cancel: PrefetchCancel,
): Promise<boolean> {
  const urls: string[] = [];
  for (const card of CARD_LIST) {
    for (const v of card.variants) {
      const url = imageUrl(v.image_local);
      if (url) urls.push(url);
    }
  }

  const total = urls.length;
  let done = 0;
  onProgress({ done, total });

  for (let i = 0; i < urls.length; i += BATCH) {
    if (cancel.cancelled) return false;
    const batch = urls.slice(i, i + BATCH);
    await Promise.allSettled(batch.map((url) => Image.prefetch(url)));
    done = Math.min(i + BATCH, total);
    onProgress({ done, total });
  }

  return true;
}
