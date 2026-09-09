import { VaultCase, VaultItem, WheelSegment, StarPackage } from '../types';

export const ALL_ITEMS: Record<string, VaultItem> = {
  // Common Items
  scrap_metal: {
    id: 'scrap_metal',
    name: 'Cyber Scrap Alloy',
    nameAr: 'خردة سيبرانية معدنية',
    rarity: 'common',
    icon: '⚙️',
    starValue: 2,
    dustValue: 20,
    color: 'text-slate-400',
    bgGlow: 'from-slate-500/20 to-slate-800/40'
  },
  combat_knife: {
    id: 'combat_knife',
    name: 'Tactical Trench Blade',
    nameAr: 'خنجر العمليات التكتيكي',
    rarity: 'common',
    icon: '🗡️',
    starValue: 4,
    dustValue: 40,
    color: 'text-slate-300',
    bgGlow: 'from-slate-500/20 to-slate-800/40'
  },
  drone_battery: {
    id: 'drone_battery',
    name: 'Micro Energy Cell',
    nameAr: 'خلية طاقة دقيقة',
    rarity: 'common',
    icon: '🔋',
    starValue: 5,
    dustValue: 50,
    color: 'text-slate-300',
    bgGlow: 'from-slate-500/20 to-slate-800/40'
  },

  // Rare Items
  silver_bar: {
    id: 'silver_bar',
    name: 'Pure Silver Bullion',
    nameAr: 'سبيكة فضة خالصة 100g',
    rarity: 'rare',
    icon: '🥈',
    starValue: 15,
    dustValue: 150,
    color: 'text-blue-400',
    bgGlow: 'from-blue-600/30 to-blue-950/50'
  },
  cyber_revolver: {
    id: 'cyber_revolver',
    name: 'Laser Pulse Revolver',
    nameAr: 'مسدس ليزري نبضي',
    rarity: 'rare',
    icon: '🔫',
    starValue: 22,
    dustValue: 220,
    color: 'text-blue-400',
    bgGlow: 'from-blue-600/30 to-blue-950/50'
  },
  recon_goggles: {
    id: 'recon_goggles',
    name: 'Night-Vision HUD Visor',
    nameAr: 'نظارات استطلاع ليلية HUD',
    rarity: 'rare',
    icon: '🥽',
    starValue: 28,
    dustValue: 280,
    color: 'text-blue-400',
    bgGlow: 'from-blue-600/30 to-blue-950/50'
  },

  // Epic Items
  plasma_rifle: {
    id: 'plasma_rifle',
    name: 'Vortex Plasma Rifle',
    nameAr: 'بندقية البلازما الدوامية',
    rarity: 'epic',
    icon: '⚡',
    starValue: 65,
    dustValue: 650,
    color: 'text-purple-400',
    bgGlow: 'from-purple-600/30 to-purple-950/50'
  },
  gold_ingot: {
    id: 'gold_ingot',
    name: 'Refined 24K Gold Ingot',
    nameAr: 'سبيكة ذهب عيار 24 قيراط',
    rarity: 'epic',
    icon: '🥇',
    starValue: 90,
    dustValue: 900,
    color: 'text-purple-400',
    bgGlow: 'from-purple-600/30 to-purple-950/50'
  },
  exo_skeleton: {
    id: 'exo_skeleton',
    name: 'Titan Exoskeleton Arm',
    nameAr: 'هيكل خارجي تيتانيوم',
    rarity: 'epic',
    icon: '🦾',
    starValue: 120,
    dustValue: 1200,
    color: 'text-purple-400',
    bgGlow: 'from-purple-600/30 to-purple-950/50'
  },

  // Legendary Items
  dragon_sniper: {
    id: 'dragon_sniper',
    name: 'AWP Sovereign Dragon Lore',
    nameAr: 'قناصة تنين السيادة AWP',
    rarity: 'legendary',
    icon: '🐉',
    starValue: 280,
    dustValue: 2800,
    color: 'text-amber-400',
    bgGlow: 'from-amber-600/35 to-amber-950/60'
  },
  golden_crown: {
    id: 'golden_crown',
    name: 'Emperor Diamond Crown',
    nameAr: 'تاج الإمبراطور المرصع',
    rarity: 'legendary',
    icon: '👑',
    starValue: 350,
    dustValue: 3500,
    color: 'text-amber-400',
    bgGlow: 'from-amber-600/35 to-amber-950/60'
  },
  quantum_hyperdrive: {
    id: 'quantum_hyperdrive',
    name: 'Quantum Warp Engine',
    nameAr: 'محرك القفز الكمي الفضائي',
    rarity: 'legendary',
    icon: '🌌',
    starValue: 420,
    dustValue: 4200,
    color: 'text-amber-400',
    bgGlow: 'from-amber-600/35 to-amber-950/60'
  },

  // Mythic Items (Jackpot Class)
  star_jackpot_1000: {
    id: 'star_jackpot_1000',
    name: '1,000 Telegram Stars Vault',
    nameAr: 'خزنة 1,000 نجمة تيليجرام فورية!',
    rarity: 'mythic',
    icon: '🌟',
    starValue: 1000,
    dustValue: 10000,
    color: 'text-red-500 font-black animate-pulse',
    bgGlow: 'from-red-600/40 via-amber-500/30 to-black'
  },
  black_hole_sword: {
    id: 'black_hole_sword',
    name: 'Singularity Dark Matter Blade',
    nameAr: 'نصل المادة المظلمة الأسطوري',
    rarity: 'mythic',
    icon: '⚔️',
    starValue: 1500,
    dustValue: 15000,
    color: 'text-red-500 font-black animate-pulse',
    bgGlow: 'from-red-600/40 via-purple-600/30 to-black'
  }
};

export const VAULT_CASES: VaultCase[] = [
  {
    id: 'daily_bronze',
    name: 'Daily Free Vault',
    nameAr: 'الخزنة البرونزية اليومية',
    descriptionAr: 'لفة مجانية كل 8 ساعات! تحتوي على عتاد وسبائك ومفاتيح نادرة.',
    tagAr: 'مجاني كل 8 س',
    starsPrice: 0,
    dustPrice: 50,
    badge: 'FREE DAILY',
    accentColor: '#d97706',
    isDailyFree: true,
    items: [
      ALL_ITEMS.scrap_metal,
      ALL_ITEMS.combat_knife,
      ALL_ITEMS.drone_battery,
      ALL_ITEMS.silver_bar,
      ALL_ITEMS.gold_ingot
    ]
  },
  {
    id: 'cyber_silver',
    name: 'Cyberpunk Strike Case',
    nameAr: 'صندوق السايبر التكتيكي',
    descriptionAr: 'أسلحة ومعدات سيبرانية عالية القيمة وفرصة لربح سبائك الذهب.',
    tagAr: 'الأكثر شعبية',
    starsPrice: 25,
    dustPrice: 300,
    badge: '🌟 25 STARS',
    accentColor: '#0284c7',
    items: [
      ALL_ITEMS.combat_knife,
      ALL_ITEMS.drone_battery,
      ALL_ITEMS.silver_bar,
      ALL_ITEMS.cyber_revolver,
      ALL_ITEMS.recon_goggles,
      ALL_ITEMS.plasma_rifle,
      ALL_ITEMS.dragon_sniper
    ]
  },
  {
    id: 'gold_sovereign',
    name: 'Gold Sovereign Vault',
    nameAr: 'خزنة السيادة الذهبية',
    descriptionAr: 'خزنة كبار المستثمرين! نسب فوز مضاعفة لسبائك الذهب وقناصة التنين.',
    tagAr: 'عائد مرتفع 3x',
    starsPrice: 75,
    dustPrice: 900,
    badge: '🌟 75 STARS',
    accentColor: '#eab308',
    items: [
      ALL_ITEMS.silver_bar,
      ALL_ITEMS.cyber_revolver,
      ALL_ITEMS.recon_goggles,
      ALL_ITEMS.plasma_rifle,
      ALL_ITEMS.gold_ingot,
      ALL_ITEMS.exo_skeleton,
      ALL_ITEMS.dragon_sniper,
      ALL_ITEMS.golden_crown,
      ALL_ITEMS.star_jackpot_1000
    ]
  },
  {
    id: 'black_diamond',
    name: 'Black Diamond Mythic',
    nameAr: 'خزنة الماس الأسود الأسطورية',
    descriptionAr: 'الخزنة الأعلى ربحية على الإطلاق! نسبة مؤكدة لعناصر أسطورية ونصل المادة المظلمة.',
    tagAr: 'أسطوري VIP',
    starsPrice: 250,
    dustPrice: 3000,
    badge: '🌟 250 STARS',
    accentColor: '#ef4444',
    items: [
      ALL_ITEMS.plasma_rifle,
      ALL_ITEMS.gold_ingot,
      ALL_ITEMS.exo_skeleton,
      ALL_ITEMS.dragon_sniper,
      ALL_ITEMS.golden_crown,
      ALL_ITEMS.quantum_hyperdrive,
      ALL_ITEMS.star_jackpot_1000,
      ALL_ITEMS.black_hole_sword
    ]
  }
];

export const WHEEL_SEGMENTS: WheelSegment[] = [
  { id: 'w1', labelAr: '🌟 500 نجمة!', rewardType: 'jackpot', amount: 500, color: '#ef4444', probability: 0.02 },
  { id: 'w2', labelAr: '💎 100 غبار', rewardType: 'dust', amount: 100, color: '#3b82f6', probability: 0.25 },
  { id: 'w3', labelAr: '🌟 25 نجمة', rewardType: 'stars', amount: 25, color: '#eab308', probability: 0.12 },
  { id: 'w4', labelAr: '💎 250 غبار', rewardType: 'dust', amount: 250, color: '#06b6d4', probability: 0.20 },
  { id: 'w5', labelAr: '🌟 50 نجمة', rewardType: 'stars', amount: 50, color: '#f59e0b', probability: 0.08 },
  { id: 'w6', labelAr: '🗝️ مفتاح ذهبي', rewardType: 'key', amount: 1, color: '#8b5cf6', probability: 0.10 },
  { id: 'w7', labelAr: '🌟 10 نجوم', rewardType: 'stars', amount: 10, color: '#10b981', probability: 0.18 },
  { id: 'w8', labelAr: '🚀 مضاعف 2x', rewardType: 'multiplier', amount: 2, color: '#ec4899', probability: 0.05 }
];

export const STAR_PACKAGES: StarPackage[] = [
  { id: 'pack_bronze', titleAr: 'حزمة المبتدئ السريعة', starsAmount: 50, priceUsd: 0.99, bonusStars: 5 },
  { id: 'pack_silver', titleAr: 'باقة المحارب التكتيكي', starsAmount: 150, priceUsd: 2.99, bonusStars: 25, badgeAr: 'أكثر طلباً', popular: true },
  { id: 'pack_gold', titleAr: 'خزينة القائد الذهبية', starsAmount: 500, priceUsd: 9.99, bonusStars: 100, badgeAr: 'خصم 20%' },
  { id: 'pack_whale', titleAr: 'صندوق الحيتان الإمبراطوري', starsAmount: 1500, priceUsd: 29.99, bonusStars: 400, badgeAr: 'قيمة قصوى' }
];
