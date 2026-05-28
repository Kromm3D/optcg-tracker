// Pantalla principal: buscar carta por código o nombre.
//
// Estrategia simple: filtramos en memoria sobre CARD_LIST. Con ~2400
// cartas el filtro es instantáneo en cualquier móvil moderno. Si en algún
// momento el dataset crece mucho, aquí es donde meter un índice tipo
// FlexSearch o MiniSearch.

import React, { useMemo, useState } from 'react';
import {
  FlatList,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import type { SearchScreenProps } from '../navigation';
import { CARD_LIST, INDEX_META } from '../data/loadIndex';
import { VariantThumb } from '../components/VariantThumb';
import type { Card } from '../types';

export function SearchScreen({ navigation }: SearchScreenProps) {
  const [query, setQuery] = useState('');

  const results = useMemo<Card[]>(() => {
    const q = query.trim().toLowerCase();
    if (!q) return CARD_LIST.slice(0, 60); // sin query: muestra las primeras
    return CARD_LIST.filter(
      (c) =>
        c.code.toLowerCase().includes(q) ||
        c.name.toLowerCase().includes(q)
    ).slice(0, 200);
  }, [query]);

  return (
    <View style={styles.container}>
      <TextInput
        value={query}
        onChangeText={setQuery}
        placeholder="Buscar por código (OP01-001) o nombre"
        placeholderTextColor="#5b6478"
        autoCapitalize="characters"
        autoCorrect={false}
        style={styles.input}
      />
      <Text style={styles.meta}>
        {INDEX_META.cardCount} cartas en el índice · {results.length} resultados
      </Text>
      <FlatList
        data={results}
        keyExtractor={(item) => item.code}
        numColumns={2}
        columnWrapperStyle={{ justifyContent: 'space-between' }}
        contentContainerStyle={{ padding: 12 }}
        renderItem={({ item }) => {
          // En la lista mostramos solo la variante "normal" (la primera).
          const v = item.variants[0];
          return (
            <VariantThumb
              variant={v}
              code={item.code}
              cardName={item.name}
              onPress={() =>
                navigation.navigate('Detail', { code: item.code })
              }
            />
          );
        }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0e1117' },
  input: {
    margin: 12,
    paddingHorizontal: 14,
    paddingVertical: 10,
    backgroundColor: '#1a1f29',
    color: '#e6e9ef',
    borderRadius: 10,
    fontSize: 16,
  },
  meta: {
    color: '#8a93a6',
    fontSize: 12,
    paddingHorizontal: 14,
    marginBottom: 4,
  },
});
