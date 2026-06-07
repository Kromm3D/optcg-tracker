// Bus de eventos mínimo para desacoplar los stores (collection/decks/wishlists/
// settings) de la capa de sincronización (lib/sync.ts).
//
// Los stores llaman a notifyLocalChange('collection') dentro de su write(), sin
// importar sync.ts (evita imports circulares). sync.ts se suscribe con
// onLocalChange() y agenda el push correspondiente cuando hay sesión iniciada.

export type SyncDomain = 'collection' | 'wishlists' | 'decks' | 'settings';

type Listener = (domain: SyncDomain) => void;

const listeners = new Set<Listener>();

/** Un store notifica que su estado local cambió. */
export function notifyLocalChange(domain: SyncDomain): void {
  listeners.forEach((l) => l(domain));
}

/** La capa de sync se suscribe a cambios locales. Devuelve un unsubscribe. */
export function onLocalChange(listener: Listener): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}
