// ============================================================
// Star Vault — procedural skins catalog
// ============================================================
// Every skin is pure colour data applied to the procedural soldier
// and weapon materials at runtime — no textures, no models, no
// extra draw calls. Stars-priced skins are bought through the
// server ledger; dust-priced skins spend the soft currency locally.

import { ItemRarity } from '../types';
import { SoldierPalette, WeaponSkinColors } from '../game3d/types3d';

export interface SkinBase {
  id: string;
  nameAr: string;
  icon: string;
  rarity: ItemRarity;
  priceStars: number;
  priceDust: number;
}

export interface WeaponSkin extends SkinBase {
  kind: 'weapon';
  colors: WeaponSkinColors;
  /** Tracer tint override; undefined keeps the weapon's own tracer colour. */
  tracerColor?: number;
}

export interface SoldierSkin extends SkinBase {
  kind: 'soldier';
  colors: SoldierPalette;
}

export type Skin = WeaponSkin | SoldierSkin;

export const DEFAULT_WEAPON_SKIN_ID = 'w_default';
export const DEFAULT_SOLDIER_SKIN_ID = 's_default';

export const WEAPON_SKINS: WeaponSkin[] = [
  {
    id: DEFAULT_WEAPON_SKIN_ID, kind: 'weapon', nameAr: 'طلاء قياسي', icon: '🎯',
    rarity: 'common', priceStars: 0, priceDust: 0,
    colors: { poly: 0x1a1f26, metal: 0x11161c, accent: 0x3a4046, wood: 0x6b4a2b, tube: 0x4a5a3a }
  },
  {
    id: 'w_crimson', kind: 'weapon', nameAr: 'القرمزي الدموي', icon: '🔴',
    rarity: 'rare', priceStars: 0, priceDust: 1500,
    colors: { poly: 0x2a0a0d, metal: 0x1a0d0f, accent: 0xdc2626, wood: 0x3d1518, tube: 0x7f1d1d },
    tracerColor: 0xff6b6b
  },
  {
    id: 'w_arctic', kind: 'weapon', nameAr: 'جليد القطب الشمالي', icon: '❄️',
    rarity: 'rare', priceStars: 0, priceDust: 1800,
    colors: { poly: 0x0f1c26, metal: 0x1c2a33, accent: 0x38bdf8, wood: 0x27394a, tube: 0x0ea5e9 },
    tracerColor: 0x7dd3fc
  },
  {
    id: 'w_venom', kind: 'weapon', nameAr: 'سمّ الأفعى', icon: '🐍',
    rarity: 'epic', priceStars: 60, priceDust: 0,
    colors: { poly: 0x0f2013, metal: 0x142019, accent: 0x84cc16, wood: 0x1e3a24, tube: 0x4d7c0f },
    tracerColor: 0x86efac
  },
  {
    id: 'w_obsidian', kind: 'weapon', nameAr: 'حجر السبج', icon: '🟣',
    rarity: 'epic', priceStars: 0, priceDust: 2400,
    colors: { poly: 0x150a1f, metal: 0x1a1226, accent: 0x8b5cf6, wood: 0x241238, tube: 0x6d28d9 },
    tracerColor: 0xc4b5fd
  },
  {
    id: 'w_sovereign', kind: 'weapon', nameAr: 'السيادة الذهبية', icon: '👑',
    rarity: 'legendary', priceStars: 120, priceDust: 0,
    colors: { poly: 0x1f1508, metal: 0x241a0a, accent: 0xf59e0b, wood: 0x3d2b0f, tube: 0xd97706 },
    tracerColor: 0xfcd34d
  }
];

export const SOLDIER_SKINS: SoldierSkin[] = [
  {
    id: DEFAULT_SOLDIER_SKIN_ID, kind: 'soldier', nameAr: 'مشاة قياسي', icon: '🪖',
    rarity: 'common', priceStars: 0, priceDust: 0,
    colors: { fabric: 0x242c26, fabricDark: 0x171d19, vest: 0x171c18, accent: 0x22d3ee, webbing: 0x155e75 }
  },
  {
    id: 's_desert', kind: 'soldier', nameAr: 'وحدة الصحراء', icon: '🏜️',
    rarity: 'rare', priceStars: 0, priceDust: 1200,
    colors: { fabric: 0x4a3b28, fabricDark: 0x35291a, vest: 0x2e2417, accent: 0xf59e0b, webbing: 0x7c5a1e }
  },
  {
    id: 's_ghost', kind: 'soldier', nameAr: 'الشبح القطبي', icon: '🥶',
    rarity: 'epic', priceStars: 0, priceDust: 2200,
    colors: { fabric: 0x2a323c, fabricDark: 0x1e242c, vest: 0x232a33, accent: 0x93c5fd, webbing: 0x475569 }
  },
  {
    id: 's_shadow', kind: 'soldier', nameAr: 'الظل الأسود', icon: '🕶️',
    rarity: 'epic', priceStars: 60, priceDust: 0,
    colors: { fabric: 0x14181f, fabricDark: 0x0d1015, vest: 0x10141a, accent: 0xf43f5e, webbing: 0x3f1622 }
  },
  {
    id: 's_royal', kind: 'soldier', nameAr: 'الحارس الملكي', icon: '🔮',
    rarity: 'legendary', priceStars: 120, priceDust: 0,
    colors: { fabric: 0x221433, fabricDark: 0x180e26, vest: 0x1b0f29, accent: 0xfbbf24, webbing: 0x5b2bd6 }
  },
  {
    id: 's_gold', kind: 'soldier', nameAr: 'الأسطورة الذهبية', icon: '✨',
    rarity: 'legendary', priceStars: 150, priceDust: 0,
    colors: { fabric: 0x2a2410, fabricDark: 0x1f1a0a, vest: 0x241d0c, accent: 0xf59e0b, webbing: 0x8a6d1a }
  }
];

export const ALL_SKINS: Skin[] = [...WEAPON_SKINS, ...SOLDIER_SKINS];

export function skinById(id: string | undefined): Skin | undefined {
  if (!id) return undefined;
  return ALL_SKINS.find((s) => s.id === id);
}

export function weaponSkinById(id: string | undefined): WeaponSkin | undefined {
  const s = skinById(id);
  return s && s.kind === 'weapon' ? s : undefined;
}

export function soldierSkinById(id: string | undefined): SoldierSkin | undefined {
  const s = skinById(id);
  return s && s.kind === 'soldier' ? s : undefined;
}
