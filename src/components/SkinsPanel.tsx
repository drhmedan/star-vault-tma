import React, { useState } from 'react';
import { Check, Loader2, Palette, Sparkles } from 'lucide-react';
import { UserProfile } from '../types';
import {
  ALL_SKINS, WEAPON_SKINS, SOLDIER_SKINS,
  DEFAULT_WEAPON_SKIN_ID, DEFAULT_SOLDIER_SKIN_ID, Skin, WeaponSkin, SoldierSkin
} from '../data/skins';
import { ledger, LedgerError } from '../services/ledger';
import { sound } from '../audio/soundEngine';

interface SkinsPanelProps {
  user: UserProfile;
  onUserChange: (next: UserProfile) => void;
  onOpenShop: () => void;
}

const DEFAULT_OWNED = [DEFAULT_WEAPON_SKIN_ID, DEFAULT_SOLDIER_SKIN_ID];

const rarityAr: Record<string, string> = {
  common: 'شائع', rare: 'نادر', epic: 'ملحمي', legendary: 'أسطوري', mythic: 'خارق'
};
const rarityColor: Record<string, string> = {
  common: 'text-slate-400 border-slate-600', rare: 'text-sky-300 border-sky-600/60',
  epic: 'text-violet-300 border-violet-500/60', legendary: 'text-amber-300 border-amber-500/60', mythic: 'text-rose-300 border-rose-500/60'
};

function swatches(skin: Skin): number[] {
  if (skin.kind === 'weapon') {
    const w = skin as WeaponSkin;
    return [w.colors.poly, w.colors.accent, w.colors.metal];
  }
  const s = skin as SoldierSkin;
  return [s.colors.fabric, s.colors.accent, s.colors.vest];
}

export const SkinsPanel: React.FC<SkinsPanelProps> = ({ user, onUserChange, onOpenShop }) => {
  const [busy, setBusy] = useState<string | null>(null);
  const [toast, setToast] = useState<{ text: string; tone: 'ok' | 'err' } | null>(null);

  const owned = (id: string) => (user.ownedSkins ?? DEFAULT_OWNED).includes(id);
  const equippedId = (kind: 'weapon' | 'soldier') =>
    (user.equippedSkins ?? { soldier: DEFAULT_SOLDIER_SKIN_ID, weapon: DEFAULT_WEAPON_SKIN_ID })[kind];

  const notify = (text: string, tone: 'ok' | 'err') => {
    setToast({ text, tone });
    window.setTimeout(() => setToast(null), 2600);
  };

  const addOwned = (id: string): string[] =>
    owned(id) ? (user.ownedSkins ?? DEFAULT_OWNED) : [...(user.ownedSkins ?? DEFAULT_OWNED), id];

  async function buy(skin: Skin) {
    if (busy || owned(skin.id)) return;
    setBusy(skin.id);
    try {
      if (skin.priceStars > 0) {
        if (ledger.available) {
          try {
            const r = await ledger.purchase(`${user.id}:skin:${skin.id}`, user.id, `skin:${skin.id}`, skin.priceStars);
            onUserChange({ ...user, stars: r.balance, ownedSkins: addOwned(skin.id) });
          } catch (e) {
            if ((e as LedgerError).code === 'insufficient') { onOpenShop(); return; }
            throw e;
          }
        } else {
          if (user.stars < skin.priceStars) { onOpenShop(); return; }
          onUserChange({ ...user, stars: user.stars - skin.priceStars, ownedSkins: addOwned(skin.id) });
        }
      } else if (skin.priceDust > 0) {
        if (user.starDust < skin.priceDust) { notify('غبار نجمي غير كافٍ', 'err'); return; }
        onUserChange({ ...user, starDust: user.starDust - skin.priceDust, ownedSkins: addOwned(skin.id) });
      }
      sound.playStarCoin();
      notify(`تم شراء ${skin.nameAr}`, 'ok');
    } catch (e) {
      notify((e as LedgerError).message || 'تعذر الشراء', 'err');
    } finally {
      setBusy(null);
    }
  }

  function equip(skin: Skin) {
    if (!owned(skin.id)) return;
    sound.playClick();
    const eq = { ...(user.equippedSkins ?? { soldier: DEFAULT_SOLDIER_SKIN_ID, weapon: DEFAULT_WEAPON_SKIN_ID }) };
    if (skin.kind === 'weapon') eq.weapon = skin.id;
    else eq.soldier = skin.id;
    onUserChange({ ...user, equippedSkins: eq });
    notify(`تم تجهيز ${skin.nameAr}`, 'ok');
  }

  const renderCard = (skin: Skin) => {
    const isOwned = owned(skin.id);
    const isEquipped = equippedId(skin.kind) === skin.id;
    const colors = swatches(skin);
    return (
      <div key={skin.id}
        className={`relative rounded-2xl border p-3 transition-all ${isEquipped ? 'border-cyan-300/50 bg-cyan-400/[0.07] shadow-[0_0_20px_rgba(34,211,238,.15)]' : 'border-white/10 bg-white/[0.03]'}`}>
        {isEquipped && (
          <span className="absolute -top-1.5 right-2 px-1.5 rounded-md bg-cyan-400/90 text-[8px] font-black text-slate-950">مجهّز</span>
        )}
        <div className="flex items-center gap-2.5">
          <span className="text-2xl">{skin.icon}</span>
          <div className="flex-1 min-w-0">
            <div className="text-xs font-black text-white truncate">{skin.nameAr}</div>
            <span className={`inline-block mt-0.5 px-1.5 rounded border text-[8px] font-bold ${rarityColor[skin.rarity]}`}>{rarityAr[skin.rarity]}</span>
          </div>
        </div>

        {/* Colour preview swatches */}
        <div className="mt-2 flex items-center gap-1">
          {colors.map((c, i) => (
            <span key={i} className="w-4 h-4 rounded-full border border-white/20" style={{ background: `#${c.toString(16).padStart(6, '0')}` }} />
          ))}
          <span className="mr-auto text-[9px] text-slate-500">{skin.kind === 'weapon' ? 'طلاء سلاح' : 'زي جندي'}</span>
        </div>

        <div className="mt-2.5">
          {isOwned ? (
            <button onClick={() => equip(skin)}
              className={`w-full py-1.5 rounded-lg text-[11px] font-black transition-all ${isEquipped ? 'bg-cyan-500/20 text-cyan-200 border border-cyan-300/30' : 'bg-slate-800/80 text-slate-200 hover:bg-slate-700 border border-white/10 active:scale-95'}`}>
              {isEquipped ? <span className="flex items-center justify-center gap-1"><Check className="w-3 h-3" /> مجهّز</span> : 'تجهيز'}
            </button>
          ) : (
            <button onClick={() => buy(skin)} disabled={busy === skin.id}
              className="w-full py-1.5 rounded-lg text-[11px] font-black bg-gradient-to-l from-amber-400/90 to-amber-500/90 text-slate-950 hover:brightness-110 active:scale-95 transition-all disabled:opacity-60">
              {busy === skin.id ? <Loader2 className="w-3.5 h-3.5 animate-spin mx-auto" />
                : skin.priceStars > 0 ? `⭐ ${skin.priceStars}` : skin.priceDust > 0 ? `💎 ${skin.priceDust}` : 'مجاني'}
            </button>
          )}
        </div>
      </div>
    );
  };

  return (
    <section className="space-y-5 text-right" dir="rtl">
      <div className="flex items-center gap-2">
        <span className="grid place-items-center w-9 h-9 rounded-xl bg-gradient-to-tr from-cyan-500/25 to-fuchsia-400/15 border border-white/15">
          <Palette className="w-4 h-4 text-cyan-300" />
        </span>
        <div>
          <p className="text-[9px] font-black uppercase tracking-[.3em] text-cyan-300/90">Appearance</p>
          <h2 className="text-lg font-black text-white leading-tight">سكنات الساحة</h2>
        </div>
        <span className="mr-auto flex items-center gap-1 text-[9px] text-slate-500">
          <Sparkles className="w-3 h-3 text-amber-300" /> تُعرض في المباريات مباشرة
        </span>
      </div>

      {/* Soldier skins */}
      <div>
        <h3 className="text-xs font-black text-slate-300 mb-2">🪖 زي الجندي</h3>
        <div className="grid grid-cols-2 gap-2">
          {SOLDIER_SKINS.map(renderCard)}
        </div>
      </div>

      {/* Weapon skins */}
      <div>
        <h3 className="text-xs font-black text-slate-300 mb-2">🔫 طلاء السلاح</h3>
        <div className="grid grid-cols-2 gap-2">
          {WEAPON_SKINS.map(renderCard)}
        </div>
      </div>

      <p className="text-[10px] text-slate-600 text-center">
        {ALL_SKINS.length} سكنات · الألوان إجرائية بلا نسيج — لا تؤثر على الأداء
      </p>

      {/* Toast */}
      {toast && (
        <div className="fixed bottom-20 inset-x-0 z-50 flex justify-center px-6 pointer-events-none">
          <div className={`px-4 py-2 rounded-xl text-xs font-black shadow-xl ${toast.tone === 'ok' ? 'bg-emerald-500/95 text-emerald-950' : 'bg-red-500/95 text-red-50'}`}>
            {toast.text}
          </div>
        </div>
      )}
    </section>
  );
};
