# 🚀 วิธีเอาเว็บขึ้น Vercel (ให้คนอื่นเปิดดูได้)

คู่มือนี้จะพาไปทีละขั้น ตั้งแต่สมัคร → เอาขึ้นเว็บ → ได้ลิงก์แชร์ให้คนอื่น
ไม่ต้องมีความรู้เรื่อง server เลย

> **โครงระบบใหม่ (อัปเดตล่าสุด):**
> - สคริปต์ในเกมยิงข้อมูลเข้า **Vercel API** (`/api/ingest`, `/api/history`) **ทุก 2 นาที**
> - API เก็บข้อมูลลง **Firebase Realtime DB** (เขียนผ่าน secret ที่ตั้งใน Vercel — ปลอดภัยกว่าเดิม)
> - เว็บอ่านข้อมูลจาก Firebase โดยตรง (ตั้ง Rules ให้อ่านได้อย่างเดียว)
> - มี **หน้าหลังบ้าน `admin.html`** สำหรับลบงาน/แก้สถานะ (เฉพาะแอดมิน)

---

## สิ่งที่ต้องมีก่อน

| สิ่งที่ต้องมี | เช็คยังไง |
|---|---|
| บัญชี GitHub | ฟรี สมัครที่ [github.com](https://github.com) |
| บัญชี Vercel | ฟรี สมัครที่ [vercel.com](https://vercel.com) (ล็อกอินด้วย GitHub ได้เลย) |
| Git (ถ้าทำผ่าน command line) | เปิด Terminal พิมพ์ `git --version` |

> ถ้าเครื่องยังไม่มี Git ดาวน์โหลดได้ที่ [git-scm.com/download/win](https://git-scm.com/download/win)
> (แต่ถ้าใช้วิธีลากไฟล์ขึ้นเว็บ GitHub ก็ไม่ต้องใช้ Git）

---

## วิธีที่ 1 — ง่ายสุด: อัปผ่านเว็บ GitHub + Vercel (ไม่ต้องใช้ Terminal)

### ขั้นที่ 1: สร้าง repository บน GitHub

1. เข้า [github.com/new](https://github.com/new)
2. ตั้งชื่อ เช่น `farming-log`
3. เลือก **Public** หรือ **Private** ก็ได้ (Vercel อ่านได้ทั้งคู่)
4. **ไม่ต้อง** ติ๊ก "Add a README file"
5. กด **Create repository**

### ขั้นที่ 2: อัปโหลดไฟล์

1. ในหน้า repo ใหม่ กด **uploading an existing file**
2. ลากไฟล์/โฟลเดอร์ทั้งหมดจากโฟลเดอร์นี้เข้าไป:
   - `index.html` + `admin.html`
   - `assets/` (ทั้งโฟลเดอร์)
   - `api/` (ทั้งโฟลเดอร์ — ไฟล์ระบบหลังบ้าน)
   - `vercel.json`
   - `README.md`
3. **ไม่ต้องอัป**: `config.luau`, `potassium_farmlog.luau` (เป็นสคริปต์เกม ไม่เกี่ยวกับเว็บ)
   และ **ห้ามอัปไฟล์ที่มีความลับ** (เช่น Firebase secret)
4. กด **Commit changes**

### ขั้นที่ 3: เอาเข้า Vercel

1. เข้า [vercel.com/new](https://vercel.com/new)
2. กด **Continue with GitHub** แล้วอนุญาต
3. เลือก repo `farming-log` → กด **Import**
4. หน้าตั้งค่า:
   - **Framework Preset**: เลือก **Other**
   - **Build Command**: เว้นว่าง
   - **Output Directory**: เว้นว่าง
   - **Root Directory**: เว้นว่าง (ถ้าเอาทั้ง repo ขึ้น)
5. กด **Deploy** → รอ ~20 วินาที

### ขั้นที่ 4: ได้ลิงก์แล้ว! 🎉

Vercel จะให้ URL ประมาณ `https://farming-log-xxxx.vercel.app`
ส่งลิงก์นี้ให้ใครก็ได้ เปิดดูได้เลย (มือถือก็ได้)

---

## วิธีที่ 2 — ผ่าน Terminal (เร็วกว่า ถ้าถนัด)

เปิด Terminal ที่โฟลเดอร์ `farming-log` แล้วพิมพ์:

```bash
# 1) เตรียม git (ครั้งเดียว)
git init
git add index.html admin.html assets api vercel.json README.md
git commit -m "farming log dashboard"

# 2) ไปที่ GitHub สร้าง repo เปล่าชื่อ farming-log แล้วคัดลอก URL มาใส่
git remote add origin https://github.com/<ชื่อผู้ใช้>/farming-log.git
git branch -M main
git push -u origin main
```

จากนั้นไปที่ [vercel.com/new](https://vercel.com/new) → เลือก repo → **Deploy**
(เหมือนวิธีที่ 1 ตั้งแต่ขั้นที่ 3)

### หรือ Deploy ตรงจาก Terminal (ไม่ผ่าน GitHub)

```bash
npx vercel        # ครั้งแรกจะให้ล็อกอินผ่านเบราว์เซอร์
npx vercel --prod # ขึ้น production ได้ลิงก์จริง
```

> `npx vercel` จะถามชื่อโปรเจกต์ — กด Enter ใช้ค่าเริ่มต้นได้เลย

---

## ต่อ Firebase หลังจากขึ้นเว็บแล้ว

ระบบใหม่ใช้ Firebase เป็นที่เก็บข้อมูลกลาง ทำตามนี้ครั้งเดียว:

### 1. สร้าง Firebase Realtime Database

1. เข้า [console.firebase.google.com](https://console.firebase.google.com) → สร้างโปรเจกต์
2. Build → **Realtime Database** → **Create Database**
3. แท็บ **Rules** ตั้งค่า (เว็บอ่านได้ แต่ห้ามเขียนจากภายนอก):

```json
{
  "rules": {
    ".read": true,
    ".write": false
  }
}
```

> เดิมสคริปต์เกมต้องเขียนเอง ต้องเปิด `.write: true` — ตอนนี้ตัวที่เขียนคือ Vercel API
> ซึ่งใช้ secret จาก Environment Variables จึงปิด `.write` ได้ (ปลอดภัยกว่าเดิมมาก)

4. คัดลอก **Database URL** (`https://ชื่อโปรเจกต์-default-rtdb.firebaseio.com`)
   และ **Database secret** (Project Settings → Service accounts → Database secrets)

### 2. ตั้ง Environment Variables ใน Vercel

เข้า Vercel → โปรเจกต์ → **Settings → Environment Variables** เพิ่ม 3 ค่า:

| ชื่อ | ค่า | ใช้ทำอะไร |
|---|---|---|
| `FIREBASE_DB_URL` | `https://xxx-default-rtdb.firebaseio.com` | ที่อยู่ฐานข้อมูล |
| `FIREBASE_DB_SECRET` | secret จาก Firebase | ให้ API เขียนข้อมูลได้ |
| `ADMIN_KEY` | รหัสลับที่คุณตั้งเอง | รหัสเข้าหน้าหลังบ้าน |

หลังตั้งเสร็จ ต้อง **Redeploy** หนึ่งครั้งเพื่อให้ env มีผล

### 3. ใส่ URL Firebase ในหน้าเว็บ

แก้ไฟล์ `index.html` ใกล้ท้ายไฟล์:

```html
<script>
  window.FIREBASE_URL = "https://your-project-default-rtdb.firebaseio.com";
</script>
```

แล้วอัปขึ้น Vercel อีกครั้ง (แก้ไฟล์ → commit → Vercel deploy เอง หรือ `npx vercel --prod`)

### 4. หน้าหลังบ้าน (เฉพาะแอดมิน)

เข้า `https://เว็บของคุณ.vercel.app/admin` แล้วใส่ **ADMIN_KEY** ที่ตั้งไว้:

- 🗑 **ลบงาน** — เอางานออกจากหน้า dashboard ทันที
- ✏️ **บันทึกสถานะ** — เปลี่ยน FARMING / PENDING / DONE / CANCEL
- 🗑 **ลบบัญชี** — ลบข้อมูล farming log ของบัญชีนั้นทั้งหมด
- 📄 **ดู/ลบประวัติ** — จัดการประวัติการจบเกมแต่ละรอบ

> 💡 รหัสเก็บใน sessionStorage ของเบราว์เซอร์ — ปิดแท็บแล้วต้องใส่ใหม่

---

## ตั้งชื่อโดเมนสวย ๆ (ไม่บังคับ)

Vercel ให้แก้โดเมนฟรีเป็น `ชื่อที่ต้องการ.vercel.app`:

1. เข้าโปรเจกต์ใน Vercel → **Settings** → **Domains**
2. แก้ `farming-log-xxxx.vercel.app` เป็น `paduk-farming.vercel.app` (ถ้าชื่อว่าง)
3. กด **Save**

ถ้าอยากใช้โดเมนของตัวเอง (เช่น `farm.yourdomain.com`) ก็ทำได้
โดยเพิ่ม CNAME ตามที่ Vercel แนะนำ (ต้องมีโดเมนอยู่แล้ว)

---

## แก้ปัญหาเบื้องหลัง

| อาการ | สาเหตุ / วิธีแก้ |
|---|---|
| เปิดเว็บแล้วขึ้น "โหลดข้อมูลไม่ได้" | ยังไม่ได้ตั้ง `FIREBASE_URL` และเปิดไฟล์ไม่ผ่าน server → ใช้ลิงก์ Vercel ไม่ใช่ double-click ไฟล์ |
| หน้าเว็บขาว | เปิด DevTools (F12) ดู Console ว่ามี error อะไร |
| รูปปกเกมไม่ขึ้น | เช็คว่าโฟลเดอร์ `assets/img/` ถูกอัปขึ้นไปด้วย |
| Firebase ขึ้น CORS/403 | Rules ยังไม่เปิด `.read: true` |
| อยากอัปเดตเร็ว ๆ ไม่ผ่าน GitHub | `npx vercel --prod` ในโฟลเดอร์โปรเจกต์ |

---

## โครงสร้างที่ต้องอัปขึ้นเว็บ

```
farming-log/
├── index.html          ✅ ต้องอัป
├── admin.html          ✅ ต้องอัป (หน้าหลังบ้าน)
├── vercel.json         ✅ ต้องอัป
├── api/
│   ├── ingest.js       ✅ ต้องอัป (รับข้อมูลจากเกม)
│   ├── history.js      ✅ ต้องอัป (รับประวัติจบเกม)
│   └── admin.js        ✅ ต้องอัป (หลังบ้าน)
├── assets/
│   ├── app.js          ✅ ต้องอัป
│   ├── admin.js        ✅ ต้องอัป
│   ├── styles.css      ✅ ต้องอัป
│   ├── mock.json       ✅ ต้องอัป (ใช้ตอนยังไม่ตั้งค่า)
│   └── img/
│       ├── anime-zero.png  ✅ ต้องอัป
│       └── slayer-2.png    ✅ ต้องอัป
├── config.luau              ❌ ไม่ต้องอัป (สคริปต์ในเกม)
└── potassium_farmlog.luau   ❌ ไม่ต้องอัป
```