// Parser for OPTCGSim deck codes, e.g.:
//   "1xOP11-041 4xOP14-102 2xOP06-106 4xOP11-106"
// Tokens may be separated by whitespace or newlines. Codes not present in the
// local card database are skipped.

import { CARDS } from '../data/loadIndex';

export interface ParsedEntry {
  code: string;
  qty: number;
}

// "4xOP14-102", "1 x op06-106" — qty, optional spaces around x, then card code.
const ENTRY_RE = /(\d+)\s*[xX]\s*([A-Z]{2,4}\d{2}-\d{3})/gi;

/** Parse an OPTCGSim deck code into { code, qty } entries that exist in CARDS. */
export function parseOptcgSim(text: string): ParsedEntry[] {
  const byCode = new Map<string, number>();
  let m: RegExpExecArray | null;
  ENTRY_RE.lastIndex = 0;
  while ((m = ENTRY_RE.exec(text)) !== null) {
    const qty = parseInt(m[1], 10);
    const code = m[2].toUpperCase();
    if (!qty || qty <= 0) continue;
    if (!CARDS[code]) continue; // skip unknown codes
    byCode.set(code, (byCode.get(code) ?? 0) + qty);
  }
  return [...byCode.entries()].map(([code, qty]) => ({ code, qty }));
}

/** Pick the leader code from parsed entries (first card of type Leader). */
export function findLeader(entries: ParsedEntry[]): string | undefined {
  return entries.find((e) => CARDS[e.code]?.type === 'Leader')?.code;
}

/** Generate a default deck name: "LeaderName - SetCode" (e.g. "Enel - OP15").
 *  Falls back to "OPTCGSim deck" when no leader is found. */
export function defaultDeckName(entries: ParsedEntry[]): string {
  const leaderCode = findLeader(entries);
  if (!leaderCode) return 'OPTCGSim deck';
  const leaderCard = CARDS[leaderCode];
  const leaderName = leaderCard?.name ?? leaderCode;
  const setCode = leaderCode.split('-')[0] ?? '';
  return `${leaderName} - ${setCode}`;
}
