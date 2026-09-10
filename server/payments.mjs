// ============================================================
// Star Vault — Telegram Stars payments
// ============================================================
// Real-money-adjacent purchases flow through Telegram's Bot API:
//
//   1. The client (already Telegram-verified) POSTs /api/create-invoice.
//   2. The server calls createInvoiceLink with currency "XTR" and a
//      payload that encodes { userId, packageId } — no pending-invoice
//      store is needed because Telegram echoes the payload back on
//      payment, and the webhook secret proves the update is genuine.
//   3. The client opens the link via Telegram.WebApp.openInvoice.
//   4. Telegram delivers pre_checkout_query (answered after validating
//      the amount) and then message.successful_payment — which credits
//      the ledger idempotently (topupId = invoice payload).
//
// The ledger's /ledger/topup stays closed to clients; it is called from
// here, server-to-server, after Telegram confirms the payment.
// ============================================================

// Authoritative package catalog (id -> charged stars + bonus stars).
// Prices are in Telegram Stars (currency "XTR"), 1 XTR = 1 star. This
// MUST mirror the client's STAR_PACKAGES in src/data/vaultsData.ts.
export const STAR_PACKAGES = [
  { id: 'pack_bronze', starsAmount: 50, bonusStars: 5, title: 'حزمة المبتدئ السريعة' },
  { id: 'pack_silver', starsAmount: 150, bonusStars: 25, title: 'باقة المحارب التكتيكي' },
  { id: 'pack_gold', starsAmount: 500, bonusStars: 100, title: 'خزينة القائد الذهبية' },
  { id: 'pack_whale', starsAmount: 1500, bonusStars: 400, title: 'صندوق الحيتان الإمبراطوري' }
];

const PACKAGE_BY_ID = new Map(STAR_PACKAGES.map((p) => [p.id, p]));

/** Bot API base — overridable for tests; production points at Telegram. */
const API_BASE = (process.env.TELEGRAM_API_BASE || 'https://api.telegram.org').replace(/\/+$/, '');

/** Call a Telegram Bot API method (native fetch — no extra dependencies). */
export async function botApi(botToken, method, params = {}) {
  const res = await fetch(`${API_BASE}/bot${botToken}/${method}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(params)
  });
  const data = await res.json();
  if (!res.ok || data.ok !== true) {
    const err = new Error(data.description || `Bot API ${method} failed`);
    err.code = 'bot_api';
    throw err;
  }
  return data.result;
}

/** Create a Stars invoice link for a package purchase. */
export function createInvoiceLink(botToken, pkg, userId) {
  return botApi(botToken, 'createInvoiceLink', {
    title: `${pkg.starsAmount} نجوم — Star Vault`,
    description: pkg.title,
    payload: payloadFor(userId, pkg.id),
    provider_token: '', // empty = Telegram Stars
    currency: 'XTR',
    prices: [{ label: `${pkg.starsAmount} نجوم`, amount: pkg.starsAmount }]
  });
}

// ---- Invoice payload: SV-{userId}-{packageId}-{nonce} -------------------
// Encodes the buyer and the product so the payment webhook can credit the
// right account without any server-side invoice table. A payload can only
// reach successful_payment by being genuinely paid through Telegram.

export function payloadFor(userId, packageId, nonce = '') {
  const suffix = nonce || Math.random().toString(36).slice(2, 8);
  return `SV-${userId}-${packageId}-${suffix}`;
}

/** Parse an invoice payload back into { userId, packageId }. */
export function parsePayload(payload) {
  const m = /^SV-(\d+)-([A-Za-z0-9_]+)-([A-Za-z0-9]+)$/.exec(String(payload || ''));
  if (!m) return null;
  const userId = Number(m[1]);
  const pkg = PACKAGE_BY_ID.get(m[2]);
  if (!Number.isFinite(userId) || !pkg) return null;
  return { userId, packageId: m[2], pkg };
}

/**
 * Validate a Telegram payment against the catalog. Returns an error string
 * or null when the amount/currency match a real package.
 */
export function validatePayment({ payload, currency, totalAmount }) {
  const parsed = parsePayload(payload);
  if (!parsed) return 'فاتورة غير معروفة';
  if (currency !== 'XTR') return 'عملة غير مدعومة';
  if (totalAmount !== parsed.pkg.starsAmount) return 'مبلغ الدفع لا يطابق الحزمة';
  return null;
}
