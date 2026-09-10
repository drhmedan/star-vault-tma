// ============================================================
// Ledger client — talks to the server-side economy ledger on the
// Koyeb container. The server is the sole authority for star
// movement; this client only escrows stakes, settles finished
// matches, and refunds escrows when a settle cannot be reached.
// ============================================================

import { config } from '../config';

export type MatchMode = 'host' | 'join' | 'ai' | 'matchmade';

export interface LedgerRewards {
  xp: number;
  trophies: number;
  dust: number;
  stars: number;
}

export interface Settlement {
  rewards: LedgerRewards;
  balance: number;
  trophies: number;
  dust: number;
  xp: number;
  verified: boolean;
}

export interface EscrowReceipt {
  escrowId: string;
  balance: number;
  amount: number;
}

export interface CancelReceipt {
  balance: number;
  refunded: boolean;
}

export interface MatchCompletion {
  won: boolean;
  kills: number;
  damage: number;
  accuracy: number;
  durationSec: number;
  mode: MatchMode;
  stake: number;
  matchId: string;
}

/** The deltas actually applied for a match — returned to the arena so its
 *  end screen always shows the real, settled numbers. */
export interface SettleOutcome {
  trophies: number;
  dust: number;
  stars: number;
  verified: boolean;
}

export class LedgerError extends Error {
  public readonly code: 'insufficient' | 'limited' | 'network' | 'invalid';
  constructor(code: 'insufficient' | 'limited' | 'network' | 'invalid', message: string) {
    super(message);
    this.code = code;
  }
}

const TIMEOUT_MS = 6000;

async function post<T>(path: string, body: unknown): Promise<T> {
  const url = `${config.gameServer}${path}`;
  const controller = new AbortController();
  const timer = window.setTimeout(() => controller.abort(), TIMEOUT_MS);
  let res: Response;
  try {
    res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal: controller.signal
    });
  } catch {
    throw new LedgerError('network', 'تعذر الوصول إلى سجل الحسابات');
  } finally {
    window.clearTimeout(timer);
  }

  let data: { error?: string; code?: string } = {};
  try { data = await res.json(); } catch { /* empty body */ }

  if (!res.ok) {
    if (res.status === 409 || data.code === 'insufficient') throw new LedgerError('insufficient', data.error || 'رصيد غير كافٍ');
    if (res.status === 429 || data.code === 'limited') throw new LedgerError('limited', data.error || 'تجاوزت الحد المسموح');
    if (res.status === 400 || res.status === 403) throw new LedgerError('invalid', data.error || 'طلب غير صالح');
    throw new LedgerError('network', 'تعذر تسجيل المباراة');
  }
  return data as unknown as T;
}

export const ledger = {
  /** True when a live backend is configured; otherwise the app runs offline. */
  get available(): boolean {
    return config.matchmakerAvailable;
  },

  escrow(playerId: number, amount: number, roomCode: string): Promise<EscrowReceipt> {
    return post<EscrowReceipt>('/ledger/stake', { playerId, amount, roomCode });
  },

  settle(result: MatchCompletion & { playerId: number; escrowId?: string }): Promise<Settlement> {
    return post<Settlement>('/ledger/settle', {
      matchId: result.matchId,
      playerId: result.playerId,
      escrowId: result.escrowId,
      won: result.won,
      kills: result.kills,
      damage: result.damage,
      accuracy: result.accuracy,
      durationSec: result.durationSec,
      mode: result.mode
    });
  },

  cancelEscrow(escrowId: string, playerId: number): Promise<CancelReceipt> {
    return post<CancelReceipt>('/ledger/escrow/cancel', { escrowId, playerId });
  }
};
