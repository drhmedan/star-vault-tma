/**
 * Telegram Mini App Native Haptic Feedback Service
 * Triggers physical vibration on iOS and Android mobile devices
 */
export const tgHaptics = {
  impact: (style: 'light' | 'medium' | 'heavy' | 'rigid' | 'soft' = 'medium') => {
    try {
      const haptic = (window as any).Telegram?.WebApp?.HapticFeedback;
      if (haptic && typeof haptic.impactOccurred === 'function') {
        haptic.impactOccurred(style);
      }
    } catch (e) {}
  },

  notification: (type: 'error' | 'success' | 'warning') => {
    try {
      const haptic = (window as any).Telegram?.WebApp?.HapticFeedback;
      if (haptic && typeof haptic.notificationOccurred === 'function') {
        haptic.notificationOccurred(type);
      }
    } catch (e) {}
  },

  selection: () => {
    try {
      const haptic = (window as any).Telegram?.WebApp?.HapticFeedback;
      if (haptic && typeof haptic.selectionChanged === 'function') {
        haptic.selectionChanged();
      }
    } catch (e) {}
  }
};
