// Deck management: create / edit / delete named OPTCG decks.
// Each deck stores a list of { code, qty } slots (max 50 cards per OPTCG rules).
// Persisted as JSON in AsyncStorage under 'optcg.decks.v1'.

import AsyncStorage from '@react-native-async-storage/async-storage';

const STORAGE_KEY = 'optcg.decks.v1';

export interface DeckCard {
  /** Base card code (e.g. "OP01-001"). */
  code: string;
  /** Copies required in this deck (typically 1–4). */
  qty: number;
}

export interface Deck {
  id: string;
  name: string;
  /** Leader code (first card, 1 copy). */
  leaderId?: string;
  cards: DeckCard[];
  createdAt: number;
}

type DeckMap = Record<string, Deck>;

let cache: DeckMap | null = null;
const listeners = new Set<() => void>();

async function read(): Promise<DeckMap> {
  if (cache) return cache;
  try {
    const raw = await AsyncStorage.getItem(STORAGE_KEY);
    cache = raw ? (JSON.parse(raw) as DeckMap) : {};
  } catch {
    cache = {};
  }
  return cache;
}

async function write(map: DeckMap): Promise<void> {
  cache = map;
  try {
    await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(map));
  } catch (e) {
    console.warn('[decks] write error:', e);
  }
  listeners.forEach((l) => l());
}

export function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export async function listDecks(): Promise<Deck[]> {
  const map = await read();
  return Object.values(map).sort((a, b) => b.createdAt - a.createdAt);
}

export async function getDeck(id: string): Promise<Deck | null> {
  const map = await read();
  return map[id] ?? null;
}

export async function createDeck(name: string): Promise<Deck> {
  const map = { ...(await read()) };
  const deck: Deck = {
    id: `deck_${Date.now()}`,
    name: name.trim() || 'New Deck',
    cards: [],
    createdAt: Date.now(),
  };
  map[deck.id] = deck;
  await write(map);
  return deck;
}

export async function renameDeck(id: string, name: string): Promise<void> {
  const map = { ...(await read()) };
  if (!map[id]) return;
  map[id] = { ...map[id], name: name.trim() };
  await write(map);
}

export async function deleteDeck(id: string): Promise<void> {
  const map = { ...(await read()) };
  delete map[id];
  await write(map);
}

export async function setDeckCard(
  deckId: string,
  code: string,
  qty: number
): Promise<void> {
  const map = { ...(await read()) };
  if (!map[deckId]) return;
  const cards = map[deckId].cards.filter((c) => c.code !== code);
  if (qty > 0) cards.push({ code, qty });
  map[deckId] = { ...map[deckId], cards };
  await write(map);
}

/** Total cards (sum of all qtys) in a deck. */
export function deckTotal(deck: Deck): number {
  return deck.cards.reduce((acc, c) => acc + c.qty, 0);
}
