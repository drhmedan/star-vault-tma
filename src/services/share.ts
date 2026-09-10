/**
 * Party-room invite sharing.
 *
 * Builds a Telegram deep link (t.me/<bot>?startapp=pvp_<CODE>) so a friend
 * opens the Mini App straight into the room, and shares it through Telegram's
 * own share sheet (openTelegramLink). Falls back to copying the code when the
 * bot username or the Mini App bridge is unavailable.
 */

import { config } from '../config';
import { getTelegramWebApp } from './telegramAuth';
import { modeLabel } from './partyCode';
import { GameMode } from './matchmaking';

/** The deep link a friend taps to join this exact room. */
export function buildPartyDeepLink(roomCode: string): string | null {
  if (!config.botUsername) return null;
  return `https://t.me/${config.botUsername}?startapp=pvp_${encodeURIComponent(roomCode)}`;
}

/** Invite text shown in the share sheet / clipboard. */
export function partyInviteText(roomCode: string, mode: GameMode): string {
  const link = buildPartyDeepLink(roomCode);
  const base = `🎮 انضم لمعركتي في Star Vault!\nالنمط: ${modeLabel(mode)}\nالرمز: ${roomCode}`;
  return link ? `${base}\n${link}` : base;
}

/** Open Telegram's share sheet to send the invite. Returns false on failure. */
export function sharePartyInvite(roomCode: string, mode: GameMode): boolean {
  const tg = getTelegramWebApp();
  if (!tg?.openTelegramLink) return false;
  const link = buildPartyDeepLink(roomCode) ?? 'https://t.me';
  const shareUrl =
    'https://t.me/share/url?url=' + encodeURIComponent(link) + '&text=' + encodeURIComponent(partyInviteText(roomCode, mode));
  try {
    tg.openTelegramLink(shareUrl);
    return true;
  } catch {
    return false;
  }
}

/** Copy text to the clipboard with a legacy fallback for sandboxed webviews. */
export function copyText(text: string): boolean {
  try {
    if (navigator.clipboard && typeof navigator.clipboard.writeText === 'function') {
      void navigator.clipboard.writeText(text);
      return true;
    }
  } catch { /* fall through to legacy path */ }
  try {
    const ta = document.createElement('textarea');
    ta.value = text;
    ta.style.position = 'fixed';
    ta.style.opacity = '0';
    document.body.appendChild(ta);
    ta.select();
    const copied = document.execCommand('copy');
    document.body.removeChild(ta);
    return copied;
  } catch {
    return false;
  }
}
