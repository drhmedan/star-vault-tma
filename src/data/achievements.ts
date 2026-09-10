// ============================================================
// Star Vault — achievements (career milestones)
// ============================================================
// Permanent, one-time milestones over a player's lifetime stats.
// Star rewards are credited through the server ledger (idempotent
// grant); dust and items are soft rewards credited client-side.

import { ALL_ITEMS } from './vaultsData';
import { QuestMetric } from './dailyQuests';

export type AchievementMetric = QuestMetric | 'bestTrophies';

export interface AchievementDef {
  id: string;
  nameAr: string;
  descAr: string;
  icon: string;
  metric: AchievementMetric;
  target: number;
  rewardStars: number;
  rewardDust: number;
  /** Optional vault item granted on claim. */
  itemId?: string;
}

export const ACHIEVEMENTS: AchievementDef[] = [
  { id: 'a_kill1', nameAr: 'أول دم', descAr: 'اقضِ على هدفك الأول', icon: '🩸', metric: 'kills', target: 1, rewardStars: 5, rewardDust: 20 },
  { id: 'a_kill50', nameAr: 'قاتل متمرّس', descAr: 'اقضِ على ٥٠ هدفاً', icon: '🎯', metric: 'kills', target: 50, rewardStars: 10, rewardDust: 60 },
  { id: 'a_kill200', nameAr: 'مقاتل محترف', descAr: 'اقضِ على ٢٠٠ هدف', icon: '⚔️', metric: 'kills', target: 200, rewardStars: 20, rewardDust: 120 },
  { id: 'a_kill1000', nameAr: 'أسطورة الساحة', descAr: 'اقضِ على ١٠٠٠ هدف', icon: '🌌', metric: 'kills', target: 1000, rewardStars: 50, rewardDust: 300, itemId: 'golden_crown' },
  { id: 'a_win5', nameAr: 'بطل المعارك', descAr: 'اربح ٥ مباريات حقيقية', icon: '🏆', metric: 'wins', target: 5, rewardStars: 10, rewardDust: 60 },
  { id: 'a_win50', nameAr: 'سيد الساحة', descAr: 'اربح ٥٠ مباراة حقيقية', icon: '👑', metric: 'wins', target: 50, rewardStars: 30, rewardDust: 180 },
  { id: 'a_match10', nameAr: 'جندي مثابر', descAr: 'أكمل ١٠ مباريات', icon: '🛡️', metric: 'matches', target: 10, rewardStars: 8, rewardDust: 50 },
  { id: 'a_match100', nameAr: 'محارب قديم', descAr: 'أكمل ١٠٠ مباراة', icon: '🎖️', metric: 'matches', target: 100, rewardStars: 25, rewardDust: 150 },
  { id: 'a_dmg10000', nameAr: 'مدمّر مدرّب', descAr: 'ألحق ١٠٬٠٠٠ ضرر', icon: '☄️', metric: 'damage', target: 10000, rewardStars: 15, rewardDust: 90 },
  { id: 'a_dmg50000', nameAr: 'محرقة الساحة', descAr: 'ألحق ٥٠٬٠٠٠ ضرر', icon: '🔥', metric: 'damage', target: 50000, rewardStars: 35, rewardDust: 200, itemId: 'plasma_rifle' },
  { id: 'a_head25', nameAr: 'عين الصقر', descAr: 'سجّل ٢٥ إصابة رأس', icon: '🦅', metric: 'headshots', target: 25, rewardStars: 12, rewardDust: 70 },
  { id: 'a_head250', nameAr: 'قناص أسطوري', descAr: 'سجّل ٢٥٠ إصابة رأس', icon: '🧿', metric: 'headshots', target: 250, rewardStars: 30, rewardDust: 180 },
  { id: 'a_rank_gold', nameAr: 'ذهب الساحة', descAr: 'بلغ رتبة ذهبي (١٥٠٠ كأس)', icon: '🥇', metric: 'bestTrophies', target: 1500, rewardStars: 25, rewardDust: 150, itemId: 'silver_bar' },
  { id: 'a_rank_diamond', nameAr: 'قمة الماس', descAr: 'بلغ رتبة ماسي (٢٥٠٠ كأس)', icon: '💎', metric: 'bestTrophies', target: 2500, rewardStars: 50, rewardDust: 300, itemId: 'gold_ingot' }
];

/** The vault item an achievement grants, resolved against the catalog. */
export function achievementItem(def: AchievementDef) {
  return def.itemId ? (ALL_ITEMS[def.itemId] ?? null) : null;
}

/** Current value of a metric for a player's career stats. */
export function achievementValue(def: AchievementDef, stats: CareerStats): number {
  switch (def.metric) {
    case 'kills': return stats.kills;
    case 'wins': return stats.wins;
    case 'matches': return stats.matches;
    case 'damage': return stats.damage;
    case 'headshots': return stats.headshots;
    case 'stakes': return stats.stakes;
    case 'bestTrophies': return stats.bestTrophies;
  }
}

export interface CareerStats {
  kills: number;
  wins: number;
  matches: number;
  damage: number;
  headshots: number;
  stakes: number;
  /** Highest trophy total ever reached (rank achievements use this). */
  bestTrophies: number;
}

export const EMPTY_CAREER: CareerStats = {
  kills: 0, wins: 0, matches: 0, damage: 0, headshots: 0, stakes: 0, bestTrophies: 0
};
