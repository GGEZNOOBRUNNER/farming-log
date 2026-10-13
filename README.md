# 📊 Paduk — Farming Log

ระบบจดบันทึกการฟาร์ม Anime Zero (All) บน Potassium: อ่านข้อมูลในเกมแบบเรียลไทม์
แล้ว POST ขึ้น **เว็บบน Vercel** (เก็บลง Firebase Realtime DB) พร้อม **เว็บ dashboard ธีม PADUK**
(การ์ดงานฟาร์ม + หน้าตัวละครไล่สีตาม rarity + ประวัติจบเกม + สถานะออนไลน์ + หน้าหลังบ้าน)

---

## 📁 โครงสร้างไฟล์

```
farming-log/
├── potassium_farmlog.luau   ← สคริปต์หลัก (inject ในเกม)
├── config.luau              ← ตั้งค่า (สคริปต์หลักโหลดอันนี้ถ้าวางคู่กัน)
├── index.html               ← หน้าเว็บ dashboard (ธีม PADUK)
├── admin.html               ← หน้าหลังบ้าน (เฉพาะแอดมิน — ลบงาน/แก้สถานะ)
├── api/                     ← Vercel serverless functions
│   ├── ingest.js            ← รับข้อมูลบัญชีจากสคริปต์เกม
│   ├── history.js           ← รับประวัติการจบเกม
│   └── admin.js             ← หลังบ้าน (ลบงาน/แก้สถานะ — ต้องใช้ ADMIN_KEY)
├── vercel.json              ← ตั้งค่าสำหรับ deploy Vercel
├── DEPLOY-VERCEL.md         ← คู่มือขึ้นเว็บให้คนอื่นดู (อ่านไฟล์นี้!)
├── README.md
└── assets/
    ├── app.js               ← ตัวเว็บ (การ์ดงาน / ตัวละคร / วัสดุ / deep link)
    ├── admin.js             ← ตรรกะหน้าหลังบ้าน
    ├── styles.css           ← สไตล์เว็บ (ธีมดำ-ทอง + gradient ตาม rarity)
    ├── mock.json            ← ข้อมูลจำลอง (ตอนยังไม่ตั้งค่า)
    └── img/
        ├── anime-zero.png   ← ปกเกม Anime Zero
        └── slayer-2.png     ← ปกเกม Slayer 2
```

---

## 🌐 หน้าเว็บมีอะไรบ้าง

| หน้า | ฟีเจอร์ |
|------|---------|
| 🏠 **Dashboard** | เลือกเกม (Anime Zero / Slayer 2) → สถิติ 5 การ์ด → บัตรงานฟาร์ม + ค้นหา + กรองสถานะ + สลับ Grid/List |
| 🎴 **Detail** | กดบัตรงาน → การ์ดตัวละครไล่สีตาม rarity (Common → Zenless) + **รูปไอคอนจากเกม**, ULT badge, ★ favorite, level ×count, trait + วัสดุ + สกุลเงิน + **ป้ายออนไลน์/ออฟไลน์ + ประวัติจบเกม 20 รอบล่าสุด** |
| 🛠 **Admin** (`/admin`) | ใส่ ADMIN_KEY → ลบงาน / บันทึกสถานะ / ลบบัญชี / ดู-ลบประวัติจบเกม |
| 🛒 **Shop** | แคตตาล็อกบริการ (ตัวอย่าง UI) |
| 🎫 **Support** | ฟอร์มแจ้งปัญหารหัสงาน |

**Deep link** — แชร์ลิงก์เจาะจงได้เลย:

```
https://เว็บของคุณ/#game=Anime%20Zero      → เปิดที่เกม Anime Zero
https://เว็บของคุณ/#order=AZ-118           → เปิดรายละเอียดงาน AZ-118
```

---

## 🔥 ตอนที่ 1 — ตั้ง Firebase (ครั้งแรก)

1. เข้า [console.firebase.google.com](https://console.firebase.google.com) → **สร้างโปรเจกต์**
2. เมนู Build → **Realtime Database** → **Create Database**
3. แท็บ **Rules** ตั้งค่า (ให้เว็บอ่านได้ แต่ห้ามเขียนจากภายนอก):

```json
{
  "rules": {
    ".read": true,
    ".write": false
  }
}
```

> เดิมสคริปต์เกมต้องเขียนเองจึงต้องเปิด `.write: true` — ตอนนี้ตัวเขียนคือ Vercel API
> ที่ใช้ secret จาก Environment Variables จึงปิด `.write` ได้ (ปลอดภัยกว่าเดิมมาก)

4. คัดลอก **Database URL** (`https://xxx-default-rtdb.firebaseio.com`) และ
   **Database secret** (Project Settings → Service accounts → Database secrets)
5. ตั้ง Environment Variables ใน Vercel (Settings → Environment Variables):

| ชื่อ | ค่า |
|---|---|
| `FIREBASE_DB_URL` | `https://xxx-default-rtdb.firebaseio.com` |
| `FIREBASE_DB_SECRET` | secret จากข้อ 4 |
| `ADMIN_KEY` | รหัสลับที่คุณตั้งเอง (เอาไว้เข้าหน้าหลังบ้าน) |

> ตั้งเสร็จต้อง **Redeploy** อีกครั้งเพื่อให้ env มีผล

---

## 🎮 ตอนที่ 2 — รันสคริปต์ในเกม

1. เปิด **Anime Zero** บน Roblox แล้วเข้าเซิร์ฟเวอร์จริง
2. เปิด executor (Potassium) แล้ว **inject**
3. วาง `potassium_farmlog.luau` ไว้คู่กับ `config.luau`
4. แก้ `config.luau` — ใส่ URL เว็บ Vercel ของคุณ:

```lua
Config.INGEST_URL = "https://your-project.vercel.app" -- ไม่มี "/" ปิดท้าย
Config.DEBUG      = false  -- ปิด debug เพื่อยิงจริง
Config.INTERVAL   = 120    -- ส่งทุก 2 นาที
```

5. รันสคริปต์ → จะเห็น log:

```
[FarmLog] เริ่มทำงาน — player: xxx | PlaceId: 114574503491412
[FarmLog] รอบ 12:34:56 | xxx | characters=14 materials=12 (ok)
[FarmLog] history: ส่ง 3 รอบใหม่ (ok)
```

> 💡 รอบแรกให้เปิด `DEBUG = true` ไว้ดู payload ก่อน แล้วค่อยปิดเพื่อยิงจริง
>
> 📶 เว็บตัดสิน "ออนไลน์" จากการส่งล่าสุด — สคริปต์ต้องรันค้างไว้ในเกม
> ถ้าหยุดส่งเกิน 5 นาที สถานะจะเปลี่ยนเป็น **ออฟไลน์** อัตโนมัติ

---

## 🚀 ตอนที่ 3 — เอาขึ้นเว็บให้คนอื่นดู

ดูคู่มือละเอียดที่ **[DEPLOY-VERCEL.md](DEPLOY-VERCEL.md)**

สรุปสั้น ๆ (วิธีง่ายสุด ไม่ต้องใช้ Terminal):

1. สร้าง repo ใหม่บน [github.com/new](https://github.com/new)
2. กด **uploading an existing file** → ลาก `index.html` + `admin.html` + `assets/` + `api/` + `vercel.json` ขึ้นไป
3. เข้า [vercel.com/new](https://vercel.com/new) → เลือก repo → **Deploy**
4. ตั้ง Environment Variables (`FIREBASE_DB_URL`, `FIREBASE_DB_SECRET`, `ADMIN_KEY`) แล้ว **Redeploy**
5. ได้ลิงก์ `https://xxx.vercel.app` → ส่งให้ใครก็ได้เปิดดู 🎉 (หลังบ้านที่ `/admin`)

หรือถ้าถนัด Terminal:

```bash
npx vercel --prod
```

---

## ⚙️ การตั้งค่าเว็บ

### ใช้ข้อมูลจำลอง (ไม่ต้องมี Firebase)
เปิด `index.html` ผ่านลิงก์เว็บ → โหลด `assets/mock.json` ให้เอง

### ใช้ Firebase จริง
แก้ใน `index.html` ใกล้ท้ายไฟล์:

```html
<script>
  window.FIREBASE_URL = "https://xxx-default-rtdb.firebaseio.com";
</script>
```

หรือเปิด Console เบราว์เซอร์แล้วพิมพ์:

```js
window.FIREBASE_URL = "https://xxx-default-rtdb.firebaseio.com";
location.reload();
```

---

## ⚙️ Config ยอดฮิต (`config.luau`)

```lua
Config.INGEST_URL    = "https://your-project.vercel.app" -- เว็บ Vercel ของคุณ (ไม่มี / ปิดท้าย)
Config.DEBUG         = false   -- ปิด debug เพื่อยิงจริง
Config.INTERVAL      = 120     -- ส่งทุก 2 นาที (แนะนำ 60-300)
Config.SEND_HISTORY  = true    -- ส่งประวัติจบเกมที่ยังไม่เคยส่ง
Config.DATA_SOURCE   = "store" -- อ่านจาก account store โดยตรง (แม่นสุด)
Config.MAX_CHARS     = 20      -- จำกัดจำนวนตัวละคร
Config.MAX_MATERIALS = 40      -- กัน payload ใหญ่เกิน
```

---

## 🧠 หมายเหตุทางเทคนิค

- เกมยัด `CharactersData` ลง store → อ่านฝั่ง client ได้เลย ไม่ต้องสแกน UI
- `level` มาจาก `Progression.Xp` ผ่าน `characterLevelProgression.getLevel(xp)`
- trait id → ชื่อ ตามตาราง `traitConfig` (Golden / Fractured / Scrambled ...)
- สถานะออนไลน์ = เว็บดูว่า `ts` ห่างจากเวลาปัจจุบัน ≤ 300 วิ (สคริปต์ส่งทุก 120 วิ)
- ประวัติจบเกมมาจาก `matchHistory` node → `/api/history` เก็บที่
  `farminglog.<player>.history.<runId>` (ส่งเฉพาะรอบใหม่ กันซ้ำด้วย client-side diff)
- `_dirty` / `_order` เป็น key ภายใน ต้องข้ามตอน iterate
- เว็บรองรับทั้ง payload จากสคริปต์ (`favourite`, `ultimate`, ไม่มี `count`)
  และ mock (`favorite`, `unlocked`, `count`)
- ถ้า HTTP ถูกบล็อก ตัวสคริปต์จะ fallback ที่ `syn.request` / `http_request` / `request`
- หน้าหลังบ้านเรียก `/api/admin` เท่านั้น (ต้องมี ADMIN_KEY) — เว็บสาธารณะไม่มีสิทธิ์เขียน

---

เจอ error ไหม? ตรวจ Console ในเกม / DevTools (F12) หน้าเว็บ แล้วแจ้งได้เลย 💪