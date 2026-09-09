import React, { useState } from 'react';
import { Swords, Users, Bot, Share2, ArrowRight, Shield, Trophy, Sparkles, Flame } from 'lucide-react';
import { UserProfile } from '../types';
import { sound } from '../audio/soundEngine';

interface PvPLobbyProps {
  user: UserProfile;
  onStartMatch: (roomCode: string, mode: 'host' | 'join' | 'ai', stakeStars: number) => void;
  onOpenLoadout: () => void;
}

export const PvPLobby: React.FC<PvPLobbyProps> = ({ user, onStartMatch, onOpenLoadout }) => {
  const [joinCode, setJoinCode] = useState('');
  const [stakeStars, setStakeStars] = useState<number>(0);
  const [activeTab, setActiveTab] = useState<'modes' | 'join'>('modes');

  const generateRoomCode = () => {
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    let code = '';
    for (let i = 0; i < 5; i++) {
      code += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return `CYBER-${code}`;
  };

  const handleCreateRoom = () => {
    sound.playClick();
    const code = generateRoomCode();
    onStartMatch(code, 'host', stakeStars);
  };

  const handleQuickMatch = () => {
    sound.playClick();
    const quickRoom = `QUICK-${Math.floor(Math.random() * 10)}`;
    onStartMatch(quickRoom, 'host', stakeStars);
  };

  const handleJoinByCode = () => {
    if (!joinCode.trim()) return;
    sound.playClick();
    onStartMatch(joinCode.toUpperCase().trim(), 'join', stakeStars);
  };

  const handleAiPractice = () => {
    sound.playClick();
    onStartMatch('AI-PRACTICE', 'ai', 0);
  };

  return (
    <div className="space-y-4 pb-24">
      {/* Top Banner: Commander Trophies & Loadout Shortcut */}
      <div className="relative overflow-hidden rounded-2xl bg-gradient-to-r from-cyan-900/60 via-blue-900/40 to-purple-950/60 p-4 border border-cyan-500/30 backdrop-blur-md shadow-xl">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-xl bg-cyan-500/20 border border-cyan-400/40 flex items-center justify-center text-2xl shadow-inner">
              🎖️
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="text-white font-bold text-base">{user.firstName}</span>
                <span className="text-xs bg-cyan-500/20 text-cyan-300 px-2 py-0.5 rounded-full border border-cyan-400/30">
                  قائد المستوى {user.level}
                </span>
              </div>
              <div className="flex items-center gap-3 text-xs text-slate-300 mt-1">
                <span className="flex items-center gap-1 text-amber-400 font-bold">
                  <Trophy className="w-3.5 h-3.5" />
                  {user.trophies || 0} كأس
                </span>
                <span className="text-slate-500">•</span>
                <span className="text-cyan-300">الرتبة: محارب سيبراني</span>
              </div>
            </div>
          </div>

          <button
            onClick={() => {
              sound.playClick();
              onOpenLoadout();
            }}
            className="px-3 py-2 bg-gradient-to-r from-purple-600 to-indigo-600 text-white text-xs font-bold rounded-xl border border-purple-400/40 flex items-center gap-1.5 shadow-lg active:scale-95 transition-all"
          >
            <Shield className="w-4 h-4 text-purple-200" />
            <span>عتاد القائد</span>
          </button>
        </div>
      </div>

      {/* Stakes Selector: Free Ranked vs Stars Stakes */}
      <div className="bg-slate-900/80 rounded-2xl p-3.5 border border-slate-800 backdrop-blur-sm">
        <div className="flex items-center justify-between mb-2.5">
          <span className="text-xs text-slate-400 font-bold flex items-center gap-1.5">
            <Flame className="w-4 h-4 text-amber-400" />
            نوع المعركة والرهان:
          </span>
          <span className="text-[11px] text-cyan-400">
            {stakeStars > 0 ? `رهان حقيقي: ${stakeStars} نجمة 🌟` : 'تصنيف مجاني بدون رهان'}
          </span>
        </div>

        <div className="grid grid-cols-3 gap-2">
          <button
            onClick={() => {
              sound.playClick();
              setStakeStars(0);
            }}
            className={`py-2 px-3 rounded-xl text-xs font-bold transition-all border ${
              stakeStars === 0
                ? 'bg-blue-600/30 border-blue-400 text-cyan-200 shadow-md'
                : 'bg-slate-800/60 border-slate-700/60 text-slate-400 hover:text-white'
            }`}
          >
            مجاني (كؤوس)
          </button>
          <button
            onClick={() => {
              sound.playClick();
              setStakeStars(25);
            }}
            className={`py-2 px-3 rounded-xl text-xs font-bold transition-all border flex items-center justify-center gap-1 ${
              stakeStars === 25
                ? 'bg-amber-600/30 border-amber-400 text-amber-300 shadow-md'
                : 'bg-slate-800/60 border-slate-700/60 text-slate-400 hover:text-white'
            }`}
          >
            <span>25</span>
            <span className="text-amber-400">🌟</span>
          </button>
          <button
            onClick={() => {
              sound.playClick();
              setStakeStars(100);
            }}
            className={`py-2 px-3 rounded-xl text-xs font-bold transition-all border flex items-center justify-center gap-1 ${
              stakeStars === 100
                ? 'bg-red-600/30 border-red-400 text-red-300 shadow-md'
                : 'bg-slate-800/60 border-slate-700/60 text-slate-400 hover:text-white'
            }`}
          >
            <span>100</span>
            <span className="text-amber-400">🌟</span>
          </button>
        </div>
      </div>

      {/* Main Action Cards */}
      <div className="grid grid-cols-1 gap-3">
        {/* 1. Quick Matchmaking */}
        <button
          onClick={handleQuickMatch}
          className="relative overflow-hidden rounded-2xl bg-gradient-to-r from-blue-600 to-cyan-600 p-4 text-left border border-cyan-400/40 shadow-xl shadow-cyan-950/40 active:scale-[0.98] transition-all group"
        >
          <div className="absolute -right-6 -bottom-6 w-28 h-28 bg-white/10 rounded-full blur-2xl group-hover:scale-150 transition-all pointer-events-none" />
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3.5">
              <div className="w-12 h-12 rounded-xl bg-black/20 flex items-center justify-center text-white">
                <Swords className="w-6 h-6 text-cyan-200" />
              </div>
              <div>
                <div className="text-base font-extrabold text-white flex items-center gap-2">
                  <span>بحث سريع عن لاعب أونلاين</span>
                  <span className="w-2 h-2 rounded-full bg-emerald-400 animate-ping" />
                </div>
                <div className="text-xs text-cyan-100/80 mt-0.5">
                  مطابقة فورية مع أي لاعب حقيقي يبحث عن معركة الآن
                </div>
              </div>
            </div>
            <ArrowRight className="w-5 h-5 text-white transform rotate-180 group-hover:-translate-x-1 transition-transform" />
          </div>
        </button>

        {/* 2. Create Private Room & Invite Telegram Friend */}
        <button
          onClick={handleCreateRoom}
          className="relative overflow-hidden rounded-2xl bg-gradient-to-r from-purple-700 via-indigo-700 to-purple-800 p-4 text-left border border-purple-400/40 shadow-xl shadow-purple-950/40 active:scale-[0.98] transition-all group"
        >
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3.5">
              <div className="w-12 h-12 rounded-xl bg-black/20 flex items-center justify-center text-white">
                <Users className="w-6 h-6 text-purple-200" />
              </div>
              <div>
                <div className="text-base font-extrabold text-white flex items-center gap-1.5">
                  <span>إنشاء غرفة وتحدي صديق</span>
                  <span className="text-[10px] bg-purple-500/30 text-purple-200 px-1.5 py-0.5 rounded border border-purple-400/30">
                    رابط تلجرام
                  </span>
                </div>
                <div className="text-xs text-purple-100/80 mt-0.5">
                  احصل على رمز خاص ورابط مشاركة مباشر لتحدي أصدقائك
                </div>
              </div>
            </div>
            <Share2 className="w-5 h-5 text-purple-200" />
          </div>
        </button>

        {/* 3. Join Room with Code */}
        <div className="bg-slate-900/90 rounded-2xl p-4 border border-slate-800 backdrop-blur-sm">
          <div className="text-xs font-bold text-slate-300 mb-2 flex items-center gap-2">
            <span>🔑 الانضمام لغرفة خاصة برمز:</span>
          </div>
          <div className="flex gap-2">
            <input
              type="text"
              value={joinCode}
              onChange={(e) => setJoinCode(e.target.value.toUpperCase())}
              placeholder="مثال: CYBER-X84"
              className="flex-1 bg-slate-950 border border-slate-700 rounded-xl px-3.5 py-2.5 text-sm text-white font-mono placeholder:text-slate-600 focus:outline-none focus:border-cyan-500 uppercase text-center"
            />
            <button
              onClick={handleJoinByCode}
              disabled={!joinCode.trim()}
              className="px-5 py-2.5 bg-cyan-600 hover:bg-cyan-500 disabled:opacity-40 text-white font-bold text-xs rounded-xl shadow-lg active:scale-95 transition-all"
            >
              دخول
            </button>
          </div>
        </div>

        {/* 4. AI Training Mode */}
        <button
          onClick={handleAiPractice}
          className="rounded-2xl bg-slate-900/60 hover:bg-slate-800/80 p-3.5 border border-slate-800/80 text-left active:scale-[0.98] transition-all flex items-center justify-between"
        >
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-slate-800 flex items-center justify-center text-slate-300">
              <Bot className="w-5 h-5 text-slate-400" />
            </div>
            <div>
              <div className="text-sm font-bold text-slate-200">تدريب ضد الذكاء الاصطناعي (AI Bot)</div>
              <div className="text-xs text-slate-500">جرّب استراتيجيتك وتشكيلتك التكتيكية في معركة تجريبية</div>
            </div>
          </div>
          <ArrowRight className="w-4 h-4 text-slate-500 transform rotate-180" />
        </button>
      </div>
    </div>
  );
};
