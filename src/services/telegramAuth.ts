/**
 * Telegram Mini App identity helpers.
 *
 * The raw signed `initData` string is forwarded to the server on every
 * ledger call so the server can verify the HMAC-SHA256 signature with the
 * bot token and derive the player id itself. The client never relies on
 * `initDataUnsafe` for anything the server must trust.
 */

interface TelegramWebAppLike {
  initData?: string;
  initDataUnsafe?: { user?: { id?: number; first_name?: string; last_name?: string; username?: string } };
  openInvoice?: (url: string, callback?: (status: 'paid' | 'cancelled' | 'failed' | 'pending') => void) => void;
}

function telegramWebApp(): TelegramWebAppLike | undefined {
  try {
    const bridge = (window as unknown as { Telegram?: { WebApp?: TelegramWebAppLike } }).Telegram;
    return bridge?.WebApp;
  } catch {
    return undefined;
  }
}

/** The raw, signed initData string (empty outside the Telegram Mini App). */
export function getTelegramInitData(): string {
  const raw = telegramWebApp()?.initData;
  return typeof raw === 'string' ? raw : '';
}

/** The Mini App bridge (undefined in a plain browser). */
export function getTelegramWebApp(): TelegramWebAppLike | undefined {
  return telegramWebApp();
}
