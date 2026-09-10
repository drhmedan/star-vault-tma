// ============================================================
// Star Vault — daily quests
// ============================================================
// A rotating pool of daily tasks. Four quests are active each day
// (chosen deterministically from the calendar date, so every player
// sees the same set on the same day). Star rewards are credited
// through the server ledger (idempotent, daily-capped grant); dust is
// a soft-currency bonus credited client-side.

export type QuestMetric = 'matches' | 'wins' | 'kills' | 'damage' | 'headshots' | 'stakes';

export interface DailyQuestDef {
  id: string;
  nameAr: string;
  descAr: string;
  icon: string;
  metric: QuestMetric;
  target: number;
  rewardStars: number;
  rewardDust: number;
}

export const DAILY_QUESTS: DailyQuestDef[] = [
  { id: 'q_play', nameAr: 'نشاط اليوم', descAr: 'العب مباراة واحدة', icon: '🎮', metric: 'matches', target: 1, rewardStars: 6, rewardDust: 25 },
  { id: 'q_play3', nameAr: 'مجنون الساحة', descAr: 'العب ٣ مباريات', icon: '🔥', metric: 'matches', target: 3, rewardStars: 10, rewardDust: 40 },
  { id: 'q_win', nameAr: 'المنتصر', descAr: 'اربح مباراة حقيقية', icon: '🏆', metric: 'wins', target: 1, rewardStars: 12, rewardDust: 50 },
  { id: 'q_kills5', nameAr: 'صياد اليوم', descAr: 'اقضِ على ٥ أهداف', icon: '🎯', metric: 'kills', target: 5, rewardStars: 8, rewardDust: 30 },
  { id: 'q_kills15', nameAr: 'عاصفة القتال', descAr: 'اقضِ على ١٥ هدفاً', icon: '💥', metric: 'kills', target: 15, rewardStars: 12, rewardDust: 50 },
  { id: 'q_dmg', nameAr: 'أضرار مركّزة', descAr: 'ألحق ٥٠٠ ضرر', icon: '⚔️', metric: 'damage', target: 500, rewardStars: 8, rewardDust: 30 },
  { id: 'q_dmg1500', nameAr: 'مدمّر الساحة', descAr: 'ألحق ١٥٠٠ ضرر', icon: '☄️', metric: 'damage', target: 1500, rewardStars: 10, rewardDust: 40 },
  { id: 'q_head', nameAr: 'قناص دقيق', descAr: 'سجّل ٥ إصابات رأس', icon: '🧿', metric: 'headshots', target: 5, rewardStars: 10, rewardDust: 40 },
  { id: 'q_stake', nameAr: 'المقامر', descAr: 'العب مباراة برهان', icon: '🃏', metric: 'stakes', target: 1, rewardStars: 8, rewardDust: 30 }
];

const ACTIVE_PER_DAY = 4;

/** Local date key (YYYY-MM-DD) for a given timestamp. */
export function questDateKey(ts: number): string {
  const d = new Date(ts);
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${d.getFullYear()}-${m}-${day}`;
}

/** Deterministic daily selection: the same set for everyone on a given date. */
export function questsForDate(dateKey: string): DailyQuestDef[] {
  let seed = 0;
  for (let i = 0; i < dateKey.length; i++) seed = (seed * 31 + dateKey.charCodeAt(i)) >>> 0;
  const picked: DailyQuestDef[] = [];
  const pool = DAILY_QUESTS.slice();
  while (picked.length < ACTIVE_PER_DAY && pool.length > 0) {
    seed = (seed * 1103515245 + 12345) >>> 0;
    const idx = seed % pool.length;
    picked.push(pool.splice(idx, 1)[0]);
  }
  return picked;
}
