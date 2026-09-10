// ============================================================
// Telegram Mini App initData verification
// ============================================================
// Telegram signs the initData query string it hands to a Mini App
// with an HMAC-SHA256 over the bot token, so a client can never
// forge another player's identity. The scheme (documented in
// Telegram's "Validating data received via the Mini App" guide):
//
//   1. secret_key = HMAC_SHA256(key="WebAppData", message=BOT_TOKEN)
//   2. data_check_string = all fields except `hash`, sorted by key,
//      joined as `key=value\n`
//   3. hash = hex( HMAC_SHA256(key=secret_key, message=data_check_string) )
//
// The ledger uses the verified `user.id` as the authoritative player
// identity, so `/ledger/*` never trusts a client-supplied id again.
// ============================================================

import { createHmac, timingSafeEqual } from 'node:crypto';

const DAY_MS = 24 * 60 * 60 * 1000;
/** Allow a little clock skew (auth_date slightly in the future). */
const SKEW_MS = 60 * 1000;

/** Parse an initData query string, URL-decoding keys and values. */
export function parseInitData(initData) {
  const fields = new Map();
  for (const pair of String(initData || '').split('&')) {
    if (!pair) continue;
    const eq = pair.indexOf('=');
    if (eq < 0) continue;
    let key, value;
    try {
      key = decodeURIComponent(pair.slice(0, eq));
      value = decodeURIComponent(pair.slice(eq + 1));
    } catch {
      continue; // malformed pair — ignore, signature will fail anyway
    }
    fields.set(key, value);
  }
  return fields;
}

/**
 * Verify a Telegram initData string against the bot token.
 *
 * @returns {ok:boolean, userId?:number, user?:object, code?:string, error?:string}
 */
export function verifyTelegramInitData(initData, botToken, options = {}) {
  const maxAgeMs = Number.isFinite(options.maxAgeMs) ? options.maxAgeMs : DAY_MS;

  if (!botToken) return { ok: false, code: 'no_token', error: 'bot token غير مضبوط على السيرفر' };
  if (!initData || typeof initData !== 'string' || !initData.trim()) {
    return { ok: false, code: 'missing', error: 'بيانات دخول تيليجرام مفقودة' };
  }

  const fields = parseInitData(initData);
  const hash = fields.get('hash');
  if (!hash) return { ok: false, code: 'missing_hash', error: 'توقيع الجلسة مفقود' };

  // data_check_string = sorted (key=value) pairs, newline-separated.
  const checkString = [...fields.entries()]
    .filter(([k]) => k !== 'hash')
    .sort((a, b) => (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0))
    .map(([k, v]) => `${k}=${v}`)
    .join('\n');

  const secretKey = createHmac('sha256', 'WebAppData').update(botToken).digest();
  const expected = createHmac('sha256', secretKey).update(checkString).digest();

  const provided = Buffer.from(hash, 'hex');
  if (provided.length !== expected.length || !timingSafeEqual(provided, expected)) {
    return { ok: false, code: 'bad_signature', error: 'توقيع جلسة غير صالح' };
  }

  // Reject stale sessions (replay protection) and wildly future timestamps.
  const authDate = Number(fields.get('auth_date') || 0);
  if (!Number.isFinite(authDate) || authDate <= 0) {
    return { ok: false, code: 'missing_auth_date', error: 'تاريخ الجلسة مفقود' };
  }
  const ageMs = Date.now() - authDate * 1000;
  if (ageMs < -SKEW_MS || ageMs > maxAgeMs) {
    return { ok: false, code: 'expired', error: 'انتهت صلاحية جلسة الدخول' };
  }

  // The user must exist and carry a numeric Telegram id.
  let user = null;
  try { user = JSON.parse(fields.get('user') || 'null'); } catch { user = null; }
  const userId = user && Number.isFinite(user.id) ? Number(user.id) : 0;
  if (!userId) return { ok: false, code: 'missing_user', error: 'مستخدم غير معروف' };

  return { ok: true, userId, user };
}
