// Pantalla "Mi colección": lista las variantes que el usuario ha
// añadido (count > 0). Se enlaza con el detalle para editar cantidades.

import React, { useCallback, useEffect, useState } from 'react';
import { FlatList, StyleSheet, Text, View } from 'react-native';
import type { CollectionScreenProps } from '../navigation';
import { CARDS } from '../data/loadIndex';
import { listCollection, subscribe } from '../lib/collection';
import type { CollectionItem, Variant } from '../types';
import { VariantThumb } from '../components/VariantThumb';

type Enriched = CollectionItem & {
  variant: Variant | null;
  cardName: string;
};

export function CollectionScreen({ navigation }: CollectionScreenProps) {
  const [items, setItems] = useState<Enriched[]>([]);

  const refresh = useCallback(() => {
    listCollection().then((rows) => {
      const enriched: Enriched[] = rows
        .map((row) => {
          const card = CARDS[row.code];
          const variant =
            card?.variants.find((v) => v.suffix === row.suffix) ?? null;
          return {
            ...row,
            variant,
            cardName: card?.name ?? '',
          };
        })
        .sort((a, b) => a.key.localeCompare(b.key, undefined, { numeric: true }));
      setItems(enriched);
    });
  }, []);

  useEffect(() => {
    refresh();
    return subscribe(refresh);
  }, [refresh]);

  const totalUnits = items.reduce((acc, it) => acc + it.count, 0);

  if (items.length === 0) {
    return (
      <View style={styles.empty}>
        <Text style={styles.emptyTitle}>Tu colección está vacía</Text>
        <Text style={styles.emptyBody}>
          Busca una carta en la pestaña "Buscar" y pulsa + en alguna variante
          para añadirla.
        </Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <Text style={styles.meta}>
        {items.length} variantes únicas · {totalUnits} unidades en total
      </Text>
      <FlatList
        data={items}
        keyExtractor={(it) => it.key}
        numColumns={2}
        columnWrapperStyle={{ justifyContent: 'space-between' }}
        contentContainerStyle={{ padding: 12 }}
        renderItem={({ item }) =>
          item.variant ? (
            <VariantThumb
              variant={item.variant}
              code={item.code}
              cardName={item.cardName}
              count={item.count}
              onPress={() =>
                navigation.navigate('Detail', { code: item.code })
              }
            />
          ) : null
        }
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0e1117' },
  meta: {
    color: '#8a93a6',
    fontSize: 12,
    paddingHorizontal: 14,
    paddingTop: 12,
  },
  empty: {
    flex: 1,
    backgroundColor: '#0e1117',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
  },
  emptyTitle: {
    color: '#e6e9ef',
    fontSize: 18,
    fontWeight: '700',
    marginBottom: 8,
  },
  emptyBody: { color: '#8a93a6', fontSize: 14, textAlign: 'center' },
});
