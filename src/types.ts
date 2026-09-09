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

// =================== TACTICAL CYBER WAR (PVP) ===================

export type TacticalUnitType = 'mech' | 'sniper' | 'commando' | 'drone' | 'tech';

export interface TacticalUnitDefinition {
  type: TacticalUnitType;
  nameAr: string;
  roleAr: string;
  energyCost: number;
  hp: number;
  attack: number;
  attackSpeedSec: number; // Attack interval in seconds
  range: number; // Attack range in grid units (1 to 5)
  speed: number; // Movement speed
  icon: string;
  color: string;
  descriptionAr: string;
}

export interface DeployedUnit {
  instanceId: string;
  ownerId: number; // Player 1 or 2 ID
  side: 'ally' | 'enemy';
  type: TacticalUnitType;
  x: number; // Visual X coordinate on grid (0-5)
  y: number; // Visual Y coordinate on grid (0-5)
  currentHp: number;
  maxHp: number;
  attack: number;
  range: number;
  shield: number;
  isStunned: boolean;
  lastAttackTime: number;
  targetInstanceId?: string;
}

export type CommanderAbilityType = 'orbital' | 'shield' | 'emp';

export interface CommanderAbility {
  id: CommanderAbilityType;
  nameAr: string;
  energyCost: number;
  cooldownSec: number;
  icon: string;
  descriptionAr: string;
}

export type BattlePhase = 'matchmaking' | 'deployment' | 'combat' | 'gameover';

export interface CombatLogEntry {
  id: string;
  textAr: string;
  type: 'damage' | 'kill' | 'ability' | 'system';
  timestamp: number;
}

export interface PvPPlayerInfo {
  id: number;
  name: string;
  avatar: string;
  trophies: number;
  isHost: boolean;
  isReady: boolean;
  energy: number;
  maxEnergy: number;
  equippedWeapon?: VaultItem;
  equippedArmor?: VaultItem;
}

export interface MultiplayerMessage {
  type: 'JOIN_ROOM' | 'READY' | 'DEPLOY_UNIT' | 'USE_ABILITY' | 'COMBAT_START' | 'SYNC_DAMAGE' | 'SURRENDER' | 'GAME_OVER' | 'PING' | 'SYNC_SHOOTER_STATE' | 'SHOOT_BULLETS' | 'BULLET_HIT' | 'LOOT_TAKEN';
  senderId: number;
  payload: any;
  timestamp: number;
}
