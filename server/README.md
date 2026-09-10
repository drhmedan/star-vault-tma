# Star Vault — Matchmaking & Signaling Server

سيرفر خفيف (Node) يشغّل على **Koyeb المجاني** مسؤوليتين على منفذ واحد:

| المسار | الوظيفة |
|---|---|
| `/match` | مطابقة WebSocket: طوابير → غرف (2..8) + ملء بالبوتات |
| `/peerjs` | إشارات WebRTC (استضافة ذاتية لـ PeerJS) |
| `/health` | فحص صحّة + عدد المنتظرين |

حركة اللعب الفعلية **P2P بين الهواتف** ولا تمر عبر هذا السيرفر.

## التشغيل محلياً

```bash
cd server
npm install
npm start            # يستمع على المنفذ 8000
```

### متغيّرات البيئة (اختيارية)

| المتغير | الافتراضي | الوصف |
|---|---|---|
| `PORT` | 8000 | منفذ الاستماع |
| `QUICK_MAX_HUMANS` | 2 | أقصى عدد بشر في غرفة الوضع السريع (1v1) |
| `QUICK_TOTAL_FIGHTERS` | 8 | إجمالي المقاتلين في المباراة (البشر + البوتات) |
| `QUICK_FILL_MS` | 30000 | نافذة التجميع بالمللي ثانية |
| `RANKED_MAX_HUMANS` | 8 | الوضع التنافسي يتطلب غرفة بشرية كاملة بلا بوتات |
| `RANKED_FILL_MS` | 60000 | نافذة التجميع التنافسي |

## اختبار سريع

```bash
QUICK_FILL_MS=1000 PORT=8080 npm start
# ثم في نافذة أخرى:
node -e "const w=new (require('ws'))('ws://127.0.0.1:8080/match');w.on('open',()=>w.send(JSON.stringify({type:'queue',payload:{id:1,name:'t',teamSize:1,mode:'quick'}})));w.on('message',d=>console.log(d.toString()))"
```

## النشر على Koyeb (مجاني)

1. **Create Service** → **Dockerfile** → المجلد `server/`.
2. المنطقة: `Frankfurt` (المجانية)، الحجم المجاني (512MB).
3. المنفذ: `8000`.
4. بعد النشر خذ رابط الخدمة (مثل `https://xxx.koyeb.app`) وحدّث ثوابت الاتصال في واجهة اللعبة:
   - WebSocket: `wss://xxx.koyeb.app/match`
   - PeerJS: `host: xxx.koyeb.app, port: 443, path: '/peerjs', secure: true`
