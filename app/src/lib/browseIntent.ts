// Intención de navegación cruzada hacia la pestaña Browse.
//
// Browse mantiene su estado de búsqueda en useState local (no hay store global
// de filtros), así que una pantalla de otra pestaña —p.ej. DetailScreen, en el
// stack modal— no puede empujarle una búsqueda por props. Este mini-store guarda
// una búsqueda "pendiente" que Browse consume una sola vez al recibir foco.
//
// Uso:
//   emisor:  setBrowseSearch('Straw Hat Crew'); navigation.navigate('Tabs', { screen: 'Browse' });
//   Browse:  useFocusEffect(() => { const q = consumeBrowseSearch(); if (q !== null) setQ(q); });

let pendingSearch: string | null = null;

/** Deja una búsqueda para que Browse la aplique la próxima vez que se enfoque. */
export function setBrowseSearch(query: string): void {
  pendingSearch = query;
}

/** Devuelve la búsqueda pendiente (y la limpia). null si no hay ninguna. */
export function consumeBrowseSearch(): string | null {
  const v = pendingSearch;
  pendingSearch = null;
  return v;
}
