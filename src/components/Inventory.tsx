import React, { useState } from 'react';
import { Package, Star, Trash2, Shield, DollarSign, Filter } from 'lucide-react';
import { VaultItem } from '../types';
import { sound } from '../audio/soundEngine';

interface InventoryProps {
  items: VaultItem[];
  onSellItem: (item: VaultItem) => void;
}

export const Inventory: React.FC<InventoryProps> = ({ items, onSellItem }) => {
  const [filter, setFilter] = useState<string>('all');

  const filtered = filter === 'all' 
    ? items 
    : items.filter(i => i.rarity === filter);

  const totalDustValue = items.reduce((acc, curr) => acc + curr.dustValue, 0);

  return (
    <div className="space-y-4 select-none" dir="rtl">
      {/* Inventory Value Header */}
      <div className="card bg-slate-900 border border-slate-800 p-4 rounded-2xl shadow-xl flex justify-between items-center">
        <div className="flex items-center gap-2.5">
          <div className="p-2 rounded-xl bg-cyan-500/20 text-cyan-400">
            <Package size={20} />
          </div>
          <div>
            <h2 className="text-base font-black text-slate-100">حقيبة العتاد والخزينة</h2>
            <p className="text-xs text-slate-400">إجمالي العناصر المكتسبة: {items.length}</p>
          </div>
        </div>

        <div className="text-left font-mono">
          <span className="text-[10px] text-slate-400 block">القيمة بالغبار</span>
          <span className="text-base font-black text-cyan-300 flex items-center gap-1 justify-end">
            💎 {totalDustValue}
          </span>
        </div>
      </div>

      {/* Rarity Filter Tabs */}
      <div className="flex gap-1.5 overflow-x-auto pb-1 text-xs">
        {[
          { id: 'all', name: 'الكل' },
          { id: 'mythic', name: 'أسطوري' },
          { id: 'legendary', name: 'فريد' },
          { id: 'epic', name: 'ملحمي' },
          { id: 'rare', name: 'نادر' },
          { id: 'common', name: 'شائع' }
        ].map(t => (
          <button
            key={t.id}
            className={`btn btn-xs rounded-lg ${filter === t.id ? 'btn-primary font-bold' : 'btn-ghost text-slate-400'}`}
            onClick={() => {
              sound.playClick();
              setFilter(t.id);
            }}
          >
            {t.name}
          </button>
        ))}
      </div>

      {/* Items Grid */}
      {filtered.length === 0 ? (
        <div className="p-10 text-center text-slate-500 text-xs border border-dashed border-slate-800 rounded-2xl">
          لا توجد عناصر في هذا التصنيف حالياً. افتح بعض الخزائن أو لِف العجلة!
        </div>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
          {filtered.map((item, idx) => (
            <div 
              key={item.id + '_' + idx}
              className="card bg-slate-900 border border-slate-800 p-3 rounded-xl shadow flex flex-col justify-between items-center text-center relative group"
            >
              <div className="text-3xl my-2">{item.icon}</div>
              <div className="text-xs font-bold text-slate-100 line-clamp-1 w-full">{item.nameAr}</div>
              <span className={`badge badge-xs font-mono font-bold mt-1 uppercase ${item.color}`}>
                {item.rarity}
              </span>

              <div className="w-full pt-3 mt-2 border-t border-slate-800/80 flex items-center justify-between text-xs">
                <span className="font-mono text-[11px] text-cyan-300 font-bold">
                  💎 {item.dustValue}
                </span>
                <button 
                  className="btn btn-ghost btn-xs text-red-400 hover:bg-red-500/20"
                  onClick={() => onSellItem(item)}
                  title="بيع واسترداد غبار"
                >
                  بيع
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};
