import { Obstacle, LootItem } from './types';

export const MAP_WIDTH = 2200;
export const MAP_HEIGHT = 2200;

export function generateBattleMap(): { obstacles: Obstacle[]; lootItems: LootItem[] } {
  const obstacles: Obstacle[] = [];
  const lootItems: LootItem[] = [];

  // 1. Boundary Perimeter Walls (حدود الخريطة)
  obstacles.push(
    { id: 'bound-top', x: 0, y: 0, w: MAP_WIDTH, h: 30, type: 'wall', color: '#334155', blocksBullets: true, blocksVision: true },
    { id: 'bound-bottom', x: 0, y: MAP_HEIGHT - 30, w: MAP_WIDTH, h: 30, type: 'wall', color: '#334155', blocksBullets: true, blocksVision: true },
    { id: 'bound-left', x: 0, y: 0, w: 30, h: MAP_HEIGHT, type: 'wall', color: '#334155', blocksBullets: true, blocksVision: true },
    { id: 'bound-right', x: MAP_WIDTH - 30, y: 0, w: 30, h: MAP_HEIGHT, type: 'wall', color: '#334155', blocksBullets: true, blocksVision: true }
  );

  // 2. Central Military Bunker & Hangar (المستودع العسكري المركزي)
  // Outer walls with door openings
  obstacles.push(
    // Top wall with door
    { id: 'hangar-top-1', x: 950, y: 950, w: 120, h: 25, type: 'building', color: '#1e293b', blocksBullets: true, blocksVision: true },
    { id: 'hangar-top-2', x: 1130, y: 950, w: 120, h: 25, type: 'building', color: '#1e293b', blocksBullets: true, blocksVision: true },
    // Bottom wall with door
    { id: 'hangar-bot-1', x: 950, y: 1225, w: 120, h: 25, type: 'building', color: '#1e293b', blocksBullets: true, blocksVision: true },
    { id: 'hangar-bot-2', x: 1130, y: 1225, w: 120, h: 25, type: 'building', color: '#1e293b', blocksBullets: true, blocksVision: true },
    // Left & Right walls
    { id: 'hangar-left', x: 950, y: 950, w: 25, h: 300, type: 'building', color: '#1e293b', blocksBullets: true, blocksVision: true },
    { id: 'hangar-right', x: 1225, y: 950, w: 25, h: 300, type: 'building', color: '#1e293b', blocksBullets: true, blocksVision: true }
  );

  // 3. Residential Houses (منازل وقواعد سكنية 4 في الزوايا)
  const houseLocations = [
    { x: 350, y: 350, name: 'house-nw' },
    { x: 1650, y: 350, name: 'house-ne' },
    { x: 350, y: 1650, name: 'house-sw' },
    { x: 1650, y: 1650, name: 'house-se' }
  ];

  houseLocations.forEach(h => {
    // 4 house walls with open doorway
    obstacles.push(
      { id: `${h.name}-w1`, x: h.x, y: h.y, w: 180, h: 20, type: 'building', color: '#3f3f46', blocksBullets: true, blocksVision: true },
      { id: `${h.name}-w2`, x: h.x, y: h.y + 160, w: 100, h: 20, type: 'building', color: '#3f3f46', blocksBullets: true, blocksVision: true },
      { id: `${h.name}-w3`, x: h.x, y: h.y, w: 20, h: 180, type: 'building', color: '#3f3f46', blocksBullets: true, blocksVision: true },
      { id: `${h.name}-w4`, x: h.x + 160, y: h.y, w: 20, h: 180, type: 'building', color: '#3f3f46', blocksBullets: true, blocksVision: true }
    );
  });

  // 4. Tactical Shipping Containers & Cover Crates (حاويات شحن وسواتر قتالية)
  const crates = [
    { x: 750, y: 650, w: 90, h: 45, color: '#dc2626' },
    { x: 860, y: 650, w: 90, h: 45, color: '#2563eb' },
    { x: 1350, y: 750, w: 45, h: 90, color: '#16a34a' },
    { x: 1350, y: 860, w: 45, h: 90, color: '#d97706' },
    { x: 700, y: 1450, w: 90, h: 45, color: '#2563eb' },
    { x: 1450, y: 1450, w: 90, h: 45, color: '#dc2626' },
    { x: 1050, y: 750, w: 40, h: 40, color: '#78716c' },
    { x: 1120, y: 1400, w: 40, h: 40, color: '#78716c' }
  ];

  crates.forEach((c, idx) => {
    obstacles.push({
      id: `crate-${idx}`,
      x: c.x,
      y: c.y,
      w: c.w,
      h: c.h,
      type: 'crate',
      color: c.color,
      blocksBullets: true,
      blocksVision: true
    });
  });

  // 5. Dense Bushes for Ambush & Stealth (شجيرات للتخفي ونصب الكمائن)
  const bushes = [
    { x: 600, y: 500, r: 40 },
    { x: 1500, y: 550, r: 45 },
    { x: 550, y: 1350, r: 40 },
    { x: 1600, y: 1350, r: 50 },
    { x: 850, y: 1100, r: 35 },
    { x: 1320, y: 1100, r: 35 },
    { x: 1080, y: 500, r: 45 },
    { x: 1080, y: 1700, r: 45 }
  ];

  bushes.forEach((b, idx) => {
    obstacles.push({
      id: `bush-${idx}`,
      x: b.x,
      y: b.y,
      w: b.r * 2,
      h: b.r * 2,
      type: 'bush',
      color: '#15803d',
      blocksBullets: false,
      blocksVision: false
    });
  });

  // 6. Ground Loot Generation (أسلحة وذخيرة وميدكت)
  // Interior of houses
  houseLocations.forEach((h, idx) => {
    lootItems.push(
      {
        id: `loot-gun-house-${idx}`,
        x: h.x + 60,
        y: h.y + 60,
        type: 'weapon',
        weaponType: idx % 2 === 0 ? 'ak47' : 'mp5',
        nameAr: idx % 2 === 0 ? 'AK-47 هجومي' : 'MP5 سريع',
        icon: idx % 2 === 0 ? '⚡' : '🔫',
        color: idx % 2 === 0 ? '#f59e0b' : '#8b5cf6'
      },
      {
        id: `loot-med-${idx}`,
        x: h.x + 110,
        y: h.y + 60,
        type: 'medkit',
        amount: 50,
        nameAr: 'حقيبة إسعاف (Medkit)',
        icon: '🩹',
        color: '#22c55e'
      }
    );
  });

  // Center Hangar Loot (AWM Sniper & Armor)
  lootItems.push(
    {
      id: 'loot-awm-center',
      x: 1090,
      y: 1080,
      type: 'weapon',
      weaponType: 'awm',
      nameAr: 'قناصة AWM الأسطورية',
      icon: '🎯',
      color: '#10b981'
    },
    {
      id: 'loot-armor-center',
      x: 1040,
      y: 1080,
      type: 'armor',
      amount: 100,
      nameAr: 'درع عسكري Level 3',
      icon: '🛡️',
      color: '#3b82f6'
    },
    {
      id: 'loot-airdrop-box',
      x: 1140,
      y: 1080,
      type: 'airdrop',
      nameAr: 'صندوق الإمداد الذهبي (Airdrop)',
      icon: '📦',
      color: '#ef4444'
    }
  );

  // Scattered Shotguns & Drinks
  const scattered = [
    { x: 800, y: 720, type: 'weapon', w: 'shotgun', name: 'شوزن قتالي', icon: '💥', col: '#ef4444' },
    { x: 1400, y: 720, type: 'medkit', name: 'مشروب طاقة', icon: '⚡', col: '#06b6d4' },
    { x: 800, y: 1520, type: 'armor', name: 'سترة واقية L2', icon: '🛡️', col: '#3b82f6' },
    { x: 1400, y: 1520, type: 'weapon', w: 'ak47', name: 'AK-47', icon: '⚡', col: '#f59e0b' }
  ];

  scattered.forEach((s, idx) => {
    lootItems.push({
      id: `loot-scatter-${idx}`,
      x: s.x,
      y: s.y,
      type: s.type as any,
      weaponType: s.w as any,
      nameAr: s.name,
      icon: s.icon,
      color: s.col
    });
  });

  return { obstacles, lootItems };
}
