import React from 'react';
import { Shield, Zap, Crosshair, ArrowLeft, Check, Sparkles, AlertCircle } from 'lucide-react';
import { UserProfile, VaultItem } from '../types';
import { sound } from '../audio/soundEngine';

interface CommanderLoadoutProps {
  user: UserProfile;
  onUpdateLoadout: (loadout: { weaponItemId?: string; armorItemId?: string; droneItemId?: string }) => void;
  onBack: () => void;
}

export const CommanderLoadout: React.FC<CommanderLoadoutProps> = ({ user, onUpdateLoadout, onBack }) => {
  const currentLoadout = user.equippedLoadout || {};

  const equippedWeapon = user.inventory.find(i => i.id === currentLoadout.weaponItemId);
  const equippedArmor = user.inventory.find(i => i.id === currentLoadout.armorItemId);
  const equippedDrone = user.inventory.find(i => i.id === currentLoadout.droneItemId);

  // Filter inventory items suitable for weapons / gear
  const weapons = user.inventory.filter(i => i.name.toLowerCase().includes('blade') || i.name.toLowerCase().includes('rifle') || i.name.toLowerCase().includes('sword') || i.name.toLowerCase().includes('laser') || i.rarity === 'mythic' || i.rarity === 'legendary');
  const armors = user.inventory.filter(i => i.name.toLowerCase().includes('armor') || i.name.toLowerCase().includes('shield') || i.name.toLowerCase().includes('core') || i.rarity === 'epic' || i.rarity === 'rare');
  const allGear = user.inventory;

  const handleEquip = (type: 'weapon' | 'armor' | 'drone', itemId: string) => {
    sound.playShield();
    const updated = { ...currentLoadout };
    if (type === 'weapon') {
      updated.weaponItemId = updated.weaponItemId === itemId ? undefined : itemId;
    } else if (type === 'armor') {
      updated.armorItemId = updated.armorItemId === itemId ? undefined : itemId;
    } else if (type === 'drone') {
      updated.droneItemId = updated.droneItemId === itemId ? undefined : itemId;
    }
    onUpdateLoadout(updated);
  };

  const getBuffPercentages = () => {
    let atkBuff = 0;
    let hpBuff = 0;
    let energyBuff = 0;

    if (equippedWeapon) {
      atkBuff += equippedWeapon.rarity === 'mythic' ? 50 : equippedWeapon.rarity === 'legendary' ? 35 : 20;
    }
    if (equippedArmor) {
      hpBuff += equippedArmor.rarity === 'mythic' ? 45 : equippedArmor.rarity === 'legendary' ? 30 : 15;
    }
    if (equippedDrone) {
      energyBuff += 20;
    }

    return { atkBuff, hpBuff, energyBuff };
  };

  const { atkBuff, hpBuff, energyBuff } = getBuffPercentages();

  return (
    <div className="space-y-4 pb-24">
      {/* Header */}
      <div className="flex items-center justify-between">
        <button
          onClick={() => {
            sound.playClick();
            onBack();
          }}
          className="flex items-center gap-1 text-xs text-slate-400 hover:text-white bg-slate-800/80 px-3 py-1.5 rounded-xl border border-slate-700/60"
        >
          <ArrowLeft className="w-4 h-4 transform rotate-180" />
          <span>رجوع للردهة</span>
        </button>
        <h2 className="text-base font-extrabold text-white flex items-center gap-2">
          <span>⚙️ تجهيز عتاد القائد (Loadout)</span>
        </h2>
        <div className="w-8" />
      </div>

      {/* Tactical Squad Modifiers Banner */}
      <div className="rounded-2xl bg-gradient-to-r from-slate-900 via-indigo-950/40 to-slate-900 p-4 border border-indigo-500/30 backdrop-blur-md shadow-xl">
        <div className="text-xs font-bold text-slate-300 mb-3 flex items-center justify-between">
          <span>إحصائيات التعزيز التكتيكي للجيش:</span>
          <span className="text-[10px] text-indigo-400 flex items-center gap-1">
            <Sparkles className="w-3 h-3" /> نشط في الساحة
          </span>
        </div>

        <div className="grid grid-cols-3 gap-2">
          <div className="bg-red-950/30 border border-red-500/30 rounded-xl p-2 text-center">
            <div className="text-red-400 text-xs font-bold flex items-center justify-center gap-1">
              <Crosshair className="w-3.5 h-3.5" />
              <span>هجوم</span>
            </div>
            <div className="text-lg font-extrabold text-white mt-0.5">+{atkBuff}%</div>
            <div className="text-[9px] text-slate-400">ضرر الوحدات</div>
          </div>

          <div className="bg-blue-950/30 border border-blue-500/30 rounded-xl p-2 text-center">
            <div className="text-blue-400 text-xs font-bold flex items-center justify-center gap-1">
              <Shield className="w-3.5 h-3.5" />
              <span>دروع</span>
            </div>
            <div className="text-lg font-extrabold text-white mt-0.5">+{hpBuff}%</div>
            <div className="text-[9px] text-slate-400">نقاط الحياة</div>
          </div>

          <div className="bg-emerald-950/30 border border-emerald-500/30 rounded-xl p-2 text-center">
            <div className="text-emerald-400 text-xs font-bold flex items-center justify-center gap-1">
              <Zap className="w-3.5 h-3.5" />
              <span>طاقة</span>
            </div>
            <div className="text-lg font-extrabold text-white mt-0.5">+{energyBuff}%</div>
            <div className="text-[9px] text-slate-400">تجديد نانو</div>
          </div>
        </div>
      </div>

      {/* 3 Equipment Slots */}
      <div className="grid grid-cols-3 gap-2.5">
        {/* Weapon Slot */}
        <div className="bg-slate-900/90 rounded-2xl p-3 border border-slate-800 text-center flex flex-col items-center">
          <span className="text-[11px] font-bold text-red-400 mb-2">سلاح الهجوم</span>
          <div className="w-16 h-16 rounded-2xl bg-red-950/20 border border-red-500/30 flex items-center justify-center text-3xl shadow-inner relative">
            {equippedWeapon ? (
              <>
                <span>{equippedWeapon.icon}</span>
                <span className="absolute -top-1 -right-1 w-4 h-4 rounded-full bg-emerald-500 text-white flex items-center justify-center text-[10px]">
                  ✓
                </span>
              </>
            ) : (
              <span className="text-slate-600 text-xl">⚔️</span>
            )}
          </div>
          <div className="text-xs font-bold text-slate-200 mt-2 truncate max-w-full">
            {equippedWeapon ? equippedWeapon.nameAr : 'غير مجهز'}
          </div>
          <div className="text-[10px] text-slate-500">
            {equippedWeapon ? `+${equippedWeapon.rarity === 'mythic' ? 50 : 30}% هجوم` : 'ضعف هجوم'}
          </div>
        </div>

        {/* Armor Slot */}
        <div className="bg-slate-900/90 rounded-2xl p-3 border border-slate-800 text-center flex flex-col items-center">
          <span className="text-[11px] font-bold text-blue-400 mb-2">درع الحماية</span>
          <div className="w-16 h-16 rounded-2xl bg-blue-950/20 border border-blue-500/30 flex items-center justify-center text-3xl shadow-inner relative">
            {equippedArmor ? (
              <>
                <span>{equippedArmor.icon}</span>
                <span className="absolute -top-1 -right-1 w-4 h-4 rounded-full bg-emerald-500 text-white flex items-center justify-center text-[10px]">
                  ✓
                </span>
              </>
            ) : (
              <span className="text-slate-600 text-xl">🛡️</span>
            )}
          </div>
          <div className="text-xs font-bold text-slate-200 mt-2 truncate max-w-full">
            {equippedArmor ? equippedArmor.nameAr : 'غير مجهز'}
          </div>
          <div className="text-[10px] text-slate-500">
            {equippedArmor ? `+${equippedArmor.rarity === 'mythic' ? 45 : 25}% حياة` : 'دفاع أساسي'}
          </div>
        </div>

        {/* Tactical Tech / Drone Slot */}
        <div className="bg-slate-900/90 rounded-2xl p-3 border border-slate-800 text-center flex flex-col items-center">
          <span className="text-[11px] font-bold text-emerald-400 mb-2">تقنية الدعم</span>
          <div className="w-16 h-16 rounded-2xl bg-emerald-950/20 border border-emerald-500/30 flex items-center justify-center text-3xl shadow-inner relative">
            {equippedDrone ? (
              <>
                <span>{equippedDrone.icon}</span>
                <span className="absolute -top-1 -right-1 w-4 h-4 rounded-full bg-emerald-500 text-white flex items-center justify-center text-[10px]">
                  ✓
                </span>
              </>
            ) : (
              <span className="text-slate-600 text-xl">⚡</span>
            )}
          </div>
          <div className="text-xs font-bold text-slate-200 mt-2 truncate max-w-full">
            {equippedDrone ? equippedDrone.nameAr : 'غير مجهز'}
          </div>
          <div className="text-[10px] text-slate-500">
            {equippedDrone ? '+20% طاقة' : 'طاقة عادية'}
          </div>
        </div>
      </div>

      {/* Inventory Items Available for Equipping */}
      <div className="bg-slate-900/80 rounded-2xl p-4 border border-slate-800">
        <div className="text-xs font-bold text-slate-300 mb-3 flex items-center justify-between">
          <span>غنائمك المستخرجة من الصناديق:</span>
          <span className="text-[10px] text-slate-500">{allGear.length} عنصر متاح</span>
        </div>

        {allGear.length === 0 ? (
          <div className="text-center py-8 text-slate-500 text-xs">
            <AlertCircle className="w-8 h-8 mx-auto mb-2 text-slate-600" />
            لا تمتلك أي أسلحة بعد! افتح الصناديق من تبويب الصناديق للحصول على معدات أسطورية.
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-2 max-h-64 overflow-y-auto pr-1">
            {allGear.map((item) => {
              const isWeapon = currentLoadout.weaponItemId === item.id;
              const isArmor = currentLoadout.armorItemId === item.id;
              const isDrone = currentLoadout.droneItemId === item.id;
              const isEquipped = isWeapon || isArmor || isDrone;

              return (
                <div
                  key={item.id}
                  className={`p-2.5 rounded-xl border transition-all ${
                    isEquipped
                      ? 'bg-indigo-950/40 border-indigo-500 shadow-md'
                      : 'bg-slate-950/60 border-slate-800 hover:border-slate-700'
                  }`}
                >
                  <div className="flex items-center gap-2.5">
                    <span className="text-2xl">{item.icon}</span>
                    <div className="flex-1 min-w-0">
                      <div className="text-xs font-bold text-white truncate">{item.nameAr}</div>
                      <div className="text-[10px] text-slate-400 capitalize">{item.rarity}</div>
                    </div>
                  </div>

                  <div className="mt-2.5 flex gap-1">
                    <button
                      onClick={() => handleEquip('weapon', item.id)}
                      className={`flex-1 py-1 rounded text-[10px] font-bold transition-all ${
                        isWeapon
                          ? 'bg-red-600 text-white'
                          : 'bg-slate-800 text-slate-300 hover:bg-slate-700'
                      }`}
                    >
                      {isWeapon ? 'سلاح ✓' : 'كسلاح'}
                    </button>
                    <button
                      onClick={() => handleEquip('armor', item.id)}
                      className={`flex-1 py-1 rounded text-[10px] font-bold transition-all ${
                        isArmor
                          ? 'bg-blue-600 text-white'
                          : 'bg-slate-800 text-slate-300 hover:bg-slate-700'
                      }`}
                    >
                      {isArmor ? 'درع ✓' : 'كدرع'}
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
};
