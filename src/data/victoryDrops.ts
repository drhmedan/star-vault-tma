// ============================================================
// Star Vault — victory loot drops
// ============================================================
// Winning a battle rolls one vault item as a "غنيمة النصر". Items
// are soft-currency (they sell for star dust, never stars), so the
// drop is cosmetic + dust-value only — it cannot mint real-money
// currency. Weighted so commons are frequent and mythics are a
// rare, genuinely exciting jackpot.

import { ALL_ITEMS } from './vaultsData';
import { VaultItem } from '../types';

interface DropEntry {
  itemId: string;
  weight: number;
}

const DROP_TABLE: DropEntry[] = [
  { itemId: 'scrap_metal', weight: 20 },
  { itemId: 'combat_knife', weight: 18 },
  { itemId: 'drone_battery', weight: 14 },
  { itemId: 'silver_bar', weight: 14 },
  { itemId: 'cyber_revolver', weight: 10 },
  { itemId: 'recon_goggles', weight: 8 },
  { itemId: 'gold_ingot', weight: 6 },
  { itemId: 'plasma_rifle', weight: 4 },
  { itemId: 'exo_skeleton', weight: 3 },
  { itemId: 'dragon_sniper', weight: 2 },
  { itemId: 'golden_crown', weight: 0.8 },
  { itemId: 'black_hole_sword', weight: 0.2 }
];

/** Roll a victory drop (never returns the star-jackpot item). */
export function rollVictoryDrop(): VaultItem | null {
  const total = DROP_TABLE.reduce((s, e) => s + e.weight, 0);
  let roll = Math.random() * total;
  for (const entry of DROP_TABLE) {
    roll -= entry.weight;
    if (roll <= 0) {
      const item = ALL_ITEMS[entry.itemId];
      return item ? { ...item } : null;
    }
  }
  return null;
}
