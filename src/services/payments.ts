/**
 * Telegram Stars payment client.
 *
 * The client only ever *requests* an invoice from the server and opens it
 * in the Mini App; the server (via the payment webhook) is the only party
 * that credits stars. The client never mints or credits its own balance.
 */

import { config } from '../config';
import { getTelegramInitData } from './telegramAuth';

export interface StarsInvoice {
  invoiceLink: string;
  packageId: string;
  starsAmount: number;
  bonusStars: number;
}

export class PaymentError extends Error {
  public readonly code: 'unavailable' | 'network' | 'invalid' | 'gateway';
  constructor(code: 'unavailable' | 'network' | 'invalid' | 'gateway', message: string) {
    super(message);
    this.code = code;
  }
}

/** Ask the server to create a Telegram Stars invoice for a package. */
export async function requestStarsInvoice(packageId: string): Promise<StarsInvoice> {
  if (!config.matchmakerAvailable) {
    throw new PaymentError('unavailable', 'بوابة الدفع غير متصلة');
  }
  let res: Response;
  try {
    res = await fetch(`${config.gameServer}/api/create-invoice`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Telegram-Init-Data': getTelegramInitData() },
      body: JSON.stringify({ packageId })
    });
  } catch {
    throw new PaymentError('network', 'تعذر الوصول إلى بوابة الدفع');
  }

  let data: { error?: string; code?: string } = {};
  try { data = await res.json(); } catch { /* empty */ }

  if (!res.ok) {
    if (res.status === 503) throw new PaymentError('unavailable', data.error || 'بوابة الدفع غير مفعّلة');
    if (res.status === 502) throw new PaymentError('gateway', data.error || 'تعذر إنشاء الفاتورة');
    if (res.status === 400) throw new PaymentError('invalid', data.error || 'حزمة غير معروفة');
    throw new PaymentError('network', data.error || 'تعذر إنشاء الفاتورة');
  }
  return data as unknown as StarsInvoice;
}
