export type ItemRarity = 'common' | 'rare' | 'epic' | 'legendary' | 'mythic';

export interface VaultItem {
  id: string;
  name: string;
  nameAr: string;
  rarity: ItemRarity;
  icon: string;
  starValue: number; // Value in Telegram Stars if sold
  dustValue: number; // Value in Star Dust
  color: string;
  bgGlow: string;
}

export interface VaultCase {
  id: string;
  name: string;
  nameAr: string;
  descriptionAr: string;
  tagAr: string;
  starsPrice: number;
  dustPrice?: number;
  badge: string;
  accentColor: string;
  isDailyFree?: boolean;
  items: VaultItem[];
}

export interface WheelSegment {
  id: string;
  labelAr: string;
  rewardType: 'stars' | 'dust' | 'key' | 'multiplier' | 'jackpot';
  amount: number;
  color: string;
  probability: number;
}

export interface UserProfile {
  id: number;
  username: string;
  firstName: string;
  avatar?: string;
  stars: number; // Telegram Stars balance
  starDust: number; // In-game currency
  keys: { [caseId: string]: number };
  level: number;
  isVip: boolean;
  inventory: VaultItem[];
  lastDailySpin: number;
  lastFreeCase: number;
  refCode: string;
  referralsCount: number;
  referralStarsEarned: number;
  autoMinerActiveUntil?: number;
  trophies: number; // PvP Ranking Trophies
  equippedLoadout?: {
    weaponItemId?: string;
    armorItemId?: string;
    droneItemId?: string;
  };
}

export interface BattleRoom {
  id: string;
  caseId: string;
  caseNameAr: string;
  entryStars: number;
  creator: {
    id: number;
    name: string;
    avatar: string;
  };
  opponent?: {
    id: number;
    name: string;
    avatar: string;
    isBot?: boolean;
  };
  status: 'waiting' | 'rolling' | 'finished';
  creatorItem?: VaultItem;
  opponentItem?: VaultItem;
  winnerId?: number;
  createdAt: number;
}

export interface StarPackage {
  id: string;
  titleAr: string;
  starsAmount: number;
  priceUsd: number;
  bonusStars: number;
  badgeAr?: string;
  popular?: boolean;
}

// =================== MULTIPLAYER (SHOOTER P2P) ===================

export interface MultiplayerMessage {
  type: 'JOIN_ROOM' | 'SYNC_SHOOTER_STATE' | 'SHOOT_BULLETS' | 'BULLET_HIT' | 'LOOT_TAKEN' | 'GAME_OVER';
  senderId: number;
  payload: any;
  timestamp: number;
}
