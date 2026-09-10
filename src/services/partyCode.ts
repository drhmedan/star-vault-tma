/**
 * Party-room code helpers (shared by the lobby, the deep-link join and the
 * invite share flow).
 *
 * A party code self-describes the room rules so a friend can join with the
 * correct mode and squad from nothing but the code string:
 *
 *   SV-{MODE}-{TEAM}-{ID}   e.g. SV-2V2-A-X8K2Q
 *   MODE ∈ FFA | 2V2 | TDM (tdm4v4)   TEAM ∈ A | B (host's squad)
 */

import { GameMode } from './matchmaking';

export interface PartyCode {
  mode: GameMode;
  /** The squad the HOST occupies (0 = A, 1 = B). */
  hostTeam: 0 | 1;
}

/** Parse a party code; returns null for anything else (legacy codes, junk). */
export function parsePartyCode(raw: string): PartyCode | null {
  const m = raw.trim().toUpperCase().match(/^SV-(FFA|2V2|TDM)-([AB])-([A-Z0-9]{4,8})$/);
  if (!m) return null;
  const mode: GameMode = m[1] === '2V2' ? '2v2' : m[1] === 'TDM' ? 'tdm4v4' : 'ffa';
  return { mode, hostTeam: m[2] === 'A' ? 0 : 1 };
}

/** The squad a JOINER gets (opposite of the host). */
export function joinerTeam(hostTeam: 0 | 1): 0 | 1 {
  return hostTeam === 0 ? 1 : 0;
}

const MODE_LABELS: Record<GameMode, string> = {
  ffa: 'معركة حرة',
  '2v2': 'ثنائي ضد ثنائي',
  tdm4v4: 'صراع الفرق ٤ ضد ٤',
  squad: 'فرق ٤ ضد ٤',
  quick: 'مواجهة سريعة',
  ranked: 'التنافسي المُصنّف'
};

/** Arabic label of a mode for share copy. */
export function modeLabel(mode: GameMode): string {
  return MODE_LABELS[mode] ?? mode;
}
