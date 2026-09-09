import { TacticalUnitDefinition, CommanderAbility } from '../types';

export const TACTICAL_UNITS: Record<string, TacticalUnitDefinition> = {
  mech: {
    type: 'mech',
    nameAr: 'المدرع الثقيل (Titan Mech)',
    roleAr: 'خط دفاع أمامي (Tank)',
    energyCost: 40,
    hp: 1200,
    attack: 50,
    attackSpeedSec: 1.5,
    range: 1,
    speed: 1,
    icon: '🛡️',
    color: 'from-blue-600 to-cyan-500',
    descriptionAr: 'درع هائل يمتص نيران العدو ويحمي الوحدات الهجومية الخلفية.'
  },
  sniper: {
    type: 'sniper',
    nameAr: 'قناص البلازما (Plasma Sniper)',
    roleAr: 'ضرر خارق بعيد المدى',
    energyCost: 35,
    hp: 420,
    attack: 160,
    attackSpeedSec: 2.2,
    range: 4,
    speed: 1,
    icon: '🎯',
    color: 'from-purple-600 to-pink-500',
    descriptionAr: 'يصطاد وحدات الخصم من مسافات بعيدة بطلقات طاقة مركزة.'
  },
  commando: {
    type: 'commando',
    nameAr: 'المقاتل السيبراني (Assault Commando)',
    roleAr: 'اقتحام وهجوم متواصل (DPS)',
    energyCost: 25,
    hp: 600,
    attack: 90,
    attackSpeedSec: 0.9,
    range: 2,
    speed: 2,
    icon: '⚡',
    color: 'from-amber-500 to-red-500',
    descriptionAr: 'سرعة عالية في الحركة ومعدل إطلاق نار مكثف لاختراق صفوف الخصم.'
  },
  drone: {
    type: 'drone',
    nameAr: 'طائرة النبض (EMP Drone)',
    roleAr: 'تعطيل الدروع وقصف جوي',
    energyCost: 30,
    hp: 450,
    attack: 65,
    attackSpeedSec: 1.3,
    range: 3,
    speed: 2,
    icon: '🛸',
    color: 'from-emerald-500 to-teal-400',
    descriptionAr: 'تحلق فوق تشكيلات العدو وتطلق نبضات تضعف دروع الخصم.'
  },
  tech: {
    type: 'tech',
    nameAr: 'مهندس النانو (Nanite Engineer)',
    roleAr: 'دعم وترميم الدروع (Support)',
    energyCost: 20,
    hp: 480,
    attack: 35,
    attackSpeedSec: 1.8,
    range: 3,
    speed: 1,
    icon: '🔧',
    color: 'from-indigo-500 to-blue-400',
    descriptionAr: 'يرمم دروع الوحدات الحليفة ويعيد شحن طاقتها في أرض المعركة.'
  }
};

export const COMMANDER_ABILITIES: CommanderAbility[] = [
  {
    id: 'orbital',
    nameAr: 'الضربة المدارية (Orbital Strike)',
    energyCost: 50,
    cooldownSec: 18,
    icon: '☄️',
    descriptionAr: 'قصف ليزري من مدار الفضاء يلحق 350 ضرر بجميع وحدات الخصم في الميدان.'
  },
  {
    id: 'shield',
    nameAr: 'قبة الحماية (Forcefield Overdrive)',
    energyCost: 35,
    cooldownSec: 14,
    icon: '🛡️',
    descriptionAr: 'تمنح درعاً بقوة 300 نقطة يمتص الضرر لكافة وحداتك النشطة.'
  },
  {
    id: 'emp',
    nameAr: 'النبض الإلكتروني (System EMP)',
    energyCost: 40,
    cooldownSec: 16,
    icon: '⚡',
    descriptionAr: 'شل حركة أسلحة ودروع جميع قوات الخصم لمدة 3 ثوانٍ كاملة.'
  }
];
