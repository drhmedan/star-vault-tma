import { WeaponDef, WeaponType } from './types';

export const WEAPONS: Record<WeaponType, WeaponDef> = {
  ak47: {
    type: 'ak47',
    name: 'AK-47',
    nameAr: 'بندقية كلاشينكوف (AK-47)',
    damage: 34,
    fireRateMs: 115,
    magazineSize: 30,
    reloadTimeMs: 2000,
    bulletSpeed: 22,
    spread: 0.05,
    pellets: 1,
    range: 850,
    color: '#f59e0b',
    bulletColor: '#fbbf24',
    icon: '⚡'
  },
  awm: {
    type: 'awm',
    name: 'AWM Sniper',
    nameAr: 'قناصة AWM الأسطورية',
    damage: 120,
    fireRateMs: 1200,
    magazineSize: 5,
    reloadTimeMs: 2800,
    bulletSpeed: 38,
    spread: 0.005,
    pellets: 1,
    range: 1500,
    color: '#10b981',
    bulletColor: '#34d399',
    icon: '🎯'
  },
  shotgun: {
    type: 'shotgun',
    name: 'S1897 Shotgun',
    nameAr: 'شوزن قتالي (Shotgun)',
    damage: 24, // 6 pellets x 24 = 144 max damage
    fireRateMs: 800,
    magazineSize: 5,
    reloadTimeMs: 2400,
    bulletSpeed: 17,
    spread: 0.22,
    pellets: 6,
    range: 480,
    color: '#ef4444',
    bulletColor: '#f87171',
    icon: '💥'
  },
  mp5: {
    type: 'mp5',
    name: 'MP5 SMG',
    nameAr: 'رشاش خفيف (MP5)',
    damage: 22,
    fireRateMs: 80,
    magazineSize: 35,
    reloadTimeMs: 1700,
    bulletSpeed: 20,
    spread: 0.08,
    pellets: 1,
    range: 650,
    color: '#8b5cf6',
    bulletColor: '#a78bfa',
    icon: '🔫'
  },
  pistol: {
    type: 'pistol',
    name: 'P92 Pistol',
    nameAr: 'مسدس تكتيكي (P92)',
    damage: 26,
    fireRateMs: 240,
    magazineSize: 15,
    reloadTimeMs: 1400,
    bulletSpeed: 17,
    spread: 0.03,
    pellets: 1,
    range: 520,
    color: '#64748b',
    bulletColor: '#94a3b8',
    icon: '🔹'
  }
};
