--[[
    Anime Zero — Farming Log :: Configuration
    ---------------------------------------------------------------
    แก้ไฟล์นี้ไฟล์เดียวก็พอ ห้ามแก้ตัวสคริปต์หลัก

    วิธีใช้:
      1) deploy เว็บขึ้น Vercel ก่อน (ดู DEPLOY-VERCEL.md)
      2) เอา URL เว็บมาใส่ที่ INGEST_URL ด้านล่าง  (ไม่ต้องมี "/" ปิดท้าย)
      3) ตั้ง DEBUG = true ครั้งแรกเพื่อดู payload ก่อน แล้วค่อยปิดเป็น false
]]

local Config = {}

-- ====== ตั้งค่าหลัก ======
-- URL ของเว็บบน Vercel (ไม่มี "/" ปิดท้าย) — สคริปต์จะยิง POST ไปที่ /api/ingest
Config.INGEST_URL = "https://YOUR-PROJECT.vercel.app" -- <<< แก้ตรงนี้

-- ====== จังหวะการส่งข้อมูล ======
Config.INTERVAL = 120    -- ส่งข้อมูลทุก 120 วินาที (2 นาที) — เว็บใช้ค่านี้แสดงสถานะออนไลน์
Config.DEBUG    = true   -- true = พิมพ์ payload อย่างเดียว ไม่ยิงจริง

-- ====== ส่งประวัติการจบเกม ======
Config.SEND_HISTORY = true  -- เก็บประวัติการจบเกม (run) ส่งขึ้นเว็บด้วย

-- ====== แหล่งข้อมูล ======
-- "store" = อ่านจาก account store โดยตรง (แม่นยำ 100%, ทำงานตลอด ไม่ต้องเปิด UI)
-- "ui"    = สแกนจาก UI ที่แสดงบนจอ (ต้องเปิดหน้า storage ค้างไว้)
-- "auto"  = พยายาม store ก่อน ถ้าไม่ได้ค่อย ui
Config.DATA_SOURCE = "store"

-- ====== เนื้อหาที่จะส่ง ======
Config.INCLUDE_CURRENCIES = true -- ส่ง money/gems/rolls/luckySpins/traitRerolls
Config.INCLUDE_MATERIALS  = true -- ส่งของในคลังวัสดุ (material)
Config.MIN_MATERIAL_COUNT = 0    -- เก็บเฉพาะรายการที่ count มากกว่านี้
Config.INCLUDE_ACCESSORIES = false -- ปิดไว้ (accessory เป็น id ไม่มีชื่อภาษาไทยครบ เท่าไหร่
                                  -- เลยไม่ค่อยมีประโยชน์กับเว็บ)

-- ====== ขีดจำกัด ======
Config.MAX_CHARS = 20  -- จำกัดจำนวนตัวละคร (มีทั้งหมด 14 ตัว)
Config.MAX_MATERIALS = 40 -- ป้องกัน payload ใหญ่เกิน

return Config