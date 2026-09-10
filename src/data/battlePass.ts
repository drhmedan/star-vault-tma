// ============================================================
// Star Vault — seasonal Battle Pass
// ============================================================
// One season, 30 levels, two tracks (free + premium). XP comes from
// every finished match; rewards are dust, vault items and stars.
// Star rewards are credited through the server ledger (idempotent
// grant) so the premium track can "pay for itself" safely.

import { ALL_ITEMS } from './vaultsData';
import { VaultItem } from '../types';

export type BpReward =
  | { kind: 'dust'; amount: number }
  | { kind: 'stars'; amount: number }
  | { kind: 'item'; itemId: string };

export interface BpLevel {
  level: number;
  /** Cumulative XP needed to unlock this level's rewards. */
  xpRequired: number;
  free: BpReward | null;
  premium: BpReward | null;
}

export interface BattlePassSeason {
  season: number;
  nameAr: string;
  taglineAr: string;
  premiumPriceStars: number;
  xpPerLevel: number;
  maxLevel: number;
  levels: BpLevel[];
}

function L(level: number, free: BpReward | null, premium: BpReward | null): BpLevel {
  return { level, xpRequired: level * 100, free, premium };
}

const dust = (amount: number): BpReward => ({ kind: 'dust', amount });
const stars = (amount: number): BpReward => ({ kind: 'stars', amount });
const item = (itemId: string): BpReward => ({ kind: 'item', itemId });

export const BATTLE_PASS: BattlePassSeason = {
  season: 1,
  nameAr: 'موسم صحراء النجوم',
  taglineAr: 'تقدم في المعارك واكسب غنائم أسطورية كل مستوى',
  premiumPriceStars: 99,
  xpPerLevel: 100,
  maxLevel: 30,
  levels: [
    L(1, dust(50), dust(150)),
    L(2, dust(50), dust(150)),
    L(3, item('scrap_metal'), item('combat_knife')),
    L(4, dust(60), dust(160)),
    L(5, item('silver_bar'), stars(15)),
    L(6, dust(60), dust(170)),
    L(7, dust(70), item('silver_bar')),
    L(8, item('drone_battery'), dust(180)),
    L(9, dust(70), item('drone_battery')),
    L(10, item('cyber_revolver'), stars(20)),
    L(11, dust(80), dust(190)),
    L(12, dust(80), item('cyber_revolver')),
    L(13, item('recon_goggles'), dust(200)),
    L(14, dust(90), item('recon_goggles')),
    L(15, item('gold_ingot'), stars(20)),
    L(16, dust(90), dust(210)),
    L(17, dust(100), item('gold_ingot')),
    L(18, item('exo_skeleton'), dust(220)),
    L(19, dust(100), item('exo_skeleton')),
    L(20, item('plasma_rifle'), stars(25)),
    L(21, dust(110), dust(240)),
    L(22, dust(110), item('plasma_rifle')),
    L(23, item('dragon_sniper'), dust(260)),
    L(24, dust(120), item('dragon_sniper')),
    L(25, item('golden_crown'), stars(25)),
    L(26, dust(130), dust(280)),
    L(27, dust(130), item('golden_crown')),
    L(28, item('quantum_hyperdrive'), stars(30)),
    L(29, dust(150), item('quantum_hyperdrive')),
    L(30, item('black_hole_sword'), item('black_hole_sword'))
  ]
};

/** The item a BpReward grants, resolved against the vault catalog. */
export function rewardItem(reward: BpReward | null): VaultItem | null {
  if (reward?.kind === 'item') return ALL_ITEMS[reward.itemId] ?? null;
  return null;
}

export function rewardLabelAr(reward: BpReward | null): string {
  if (!reward) return '—';
  if (reward.kind === 'dust') return `💎 ${reward.amount}`;
  if (reward.kind === 'stars') return `⭐ ${reward.amount}`;
  return rewardItem(reward)?.icon ?? '🎁';
}

export function rewardTitleAr(reward: BpReward | null): string {
  if (!reward) return 'لا مكافأة';
  if (reward.kind === 'dust') return `${reward.amount} غبار نجمي`;
  if (reward.kind === 'stars') return `${reward.amount} نجمة تيليجرام`;
  return rewardItem(reward)?.nameAr ?? 'غنيمة';
}

/** Effective level from cumulative XP (1..maxLevel). */
export function levelForXp(xp: number): number {
  return Math.min(BATTLE_PASS.maxLevel, Math.max(1, Math.floor(xp / BATTLE_PASS.xpPerLevel) + 1));
}

export interface BattlePassState {
  season: number;
  xp: number;
  premium: boolean;
  claimedFree: number[];
  claimedPremium: number[];
}

/** Normalise a persisted state for the current season (resets on new season). */
export function normalizeBattlePass(state: BattlePassState | undefined): BattlePassState {
  if (state && state.season === BATTLE_PASS.season) return state;
  return { season: BATTLE_PASS.season, xp: 0, premium: false, claimedFree: [], claimedPremium: [] };
}
