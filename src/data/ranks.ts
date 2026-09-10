// ============================================================
// Star Vault — competitive ranks (MMR tiers)
// ============================================================
// A player's rating is their trophy count (already server-authoritative
// from settled matches). Ranks are pure display tiers over that number,
// so the header, lobby and ranks screen all agree.

export interface RankTier {
  id: string;
  nameAr: string;
  icon: string;
  /** Minimum trophies to hold this rank (inclusive). */
  min: number;
  /** Accent color used for the rank badge. */
  color: string;
  /** Short Arabic tagline shown in the ranks screen. */
  tagAr: string;
}

export const RANKS: RankTier[] = [
  { id: 'bronze', nameAr: 'برونزي', icon: '🥉', min: 0, color: '#cd7f32', tagAr: 'بداية الطريق إلى القمة' },
  { id: 'silver', nameAr: 'فضي', icon: '🥈', min: 1000, color: '#c0c0c0', tagAr: 'مقاتل واعد في الساحة' },
  { id: 'gold', nameAr: 'ذهبي', icon: '🥇', min: 1500, color: '#ffd700', tagAr: 'نخبة المعارك الحقيقية' },
  { id: 'platinum', nameAr: 'بلاتيني', icon: '💠', min: 2000, color: '#7ef9ff', tagAr: 'مهارة تُحسب لها الساحة' },
  { id: 'diamond', nameAr: 'ماسي', icon: '💎', min: 2500, color: '#b9f2ff', tagAr: 'قناص لا يرحم الخصوم' },
  { id: 'master', nameAr: 'ماستر', icon: '👑', min: 3000, color: '#ff5c8a', tagAr: 'ضمن أفضل مقاتلي الخريطة' },
  { id: 'legend', nameAr: 'أسطورة', icon: '🌌', min: 3600, color: '#ff9e2c', tagAr: 'اسم يُروى في كل معركة' }
];

/** The highest rank tier whose threshold the rating meets. */
export function rankForTrophies(trophies: number): RankTier {
  const t = Math.max(0, Math.round(trophies));
  let current = RANKS[0];
  for (const r of RANKS) if (t >= r.min) current = r;
  return current;
}

/** The next tier above the current one, or null at the top. */
export function nextRank(trophies: number): RankTier | null {
  const idx = RANKS.indexOf(rankForTrophies(trophies));
  return idx < RANKS.length - 1 ? RANKS[idx + 1] : null;
}

/** Progress 0..1 toward the next tier (1 when already at the top). */
export function rankProgress(trophies: number): number {
  const cur = rankForTrophies(trophies);
  const next = nextRank(trophies);
  if (!next) return 1;
  const span = next.min - cur.min;
  return span <= 0 ? 1 : Math.max(0, Math.min(1, (trophies - cur.min) / span));
}
