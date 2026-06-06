// Embedding database — loads the pre-computed MobileNetV2+PCA vectors and
// provides a cosine-similarity nearest-neighbour search.
//
// The database is stored as compact base64-encoded float32 binary in
// app/src/data/embeddings.json (built by scripts/build_embeddings.py).
// At ~1.5 MB it bundles with the app via Metro the same way as index.json.
//
// Cosine similarity = dot product of two L2-normalised unit vectors.
// The search is O(N * n_components) ≈ 4571 × 64 = 293K multiply-adds → <5 ms.

// @ts-ignore
import rawEmb from '../data/embeddings.json';

interface EmbeddingPayload {
  n_components: number;
  count: number;
  keys: string[];          // variantKey (code + suffix), same order as data
  data: string;            // base64 float32 binary, row-major (count × n_components)
}

const payload = rawEmb as EmbeddingPayload;

// ── Decode once at module load ────────────────────────────────────────────────
let _matrix: Float32Array | null = null;

function getMatrix(): Float32Array {
  if (_matrix) return _matrix;
  const bin = atob(payload.data);
  const buf = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) buf[i] = bin.charCodeAt(i);
  _matrix = new Float32Array(buf.buffer);
  return _matrix;
}

export const EMB_KEYS: string[] = payload.keys;
export const N_COMPONENTS: number = payload.n_components;

// ── Cosine dot-product search ─────────────────────────────────────────────────

export interface EmbeddingMatch {
  key: string;        // variantKey, e.g. "OP01-001_p1"
  score: number;      // cosine similarity in [0, 1]; 1 = perfect match
}

export const MATCH_THRESHOLD = 0.70; // below this → no match (different card)

/**
 * Find the best-matching variant for a query embedding.
 * Both the query and database vectors are L2-normalised, so
 * cosine similarity = dot product.
 *
 * Returns null if no entry exceeds MATCH_THRESHOLD.
 */
export function findNearestEmbedding(
  query: Float32Array,
  threshold = MATCH_THRESHOLD,
): EmbeddingMatch | null {
  const matrix = getMatrix();
  const n = payload.count;
  const d = N_COMPONENTS;

  let bestIdx = -1;
  let bestScore = -1;

  for (let i = 0; i < n; i++) {
    const offset = i * d;
    let dot = 0;
    for (let j = 0; j < d; j++) {
      dot += query[j] * matrix[offset + j];
    }
    if (dot > bestScore) {
      bestScore = dot;
      bestIdx = i;
    }
  }

  if (bestIdx === -1 || bestScore < threshold) return null;
  return { key: EMB_KEYS[bestIdx], score: bestScore };
}

/**
 * Return top-K matches (useful for debugging or letting the user pick a variant).
 */
export function findTopK(
  query: Float32Array,
  k = 3,
): EmbeddingMatch[] {
  const matrix = getMatrix();
  const n = payload.count;
  const d = N_COMPONENTS;

  const scores: { idx: number; score: number }[] = [];

  for (let i = 0; i < n; i++) {
    const offset = i * d;
    let dot = 0;
    for (let j = 0; j < d; j++) dot += query[j] * matrix[offset + j];
    scores.push({ idx: i, score: dot });
  }

  scores.sort((a, b) => b.score - a.score);
  return scores.slice(0, k).map(({ idx, score }) => ({
    key: EMB_KEYS[idx],
    score,
  }));
}
