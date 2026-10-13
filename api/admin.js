/* ============================================================
   Paduk — Admin API (Vercel serverless)
   หลังบ้านสำหรับแอดมิน: ตรวจรหัส, ลบงาน, แก้สถานะ, ลบบัญชี/ประวัติรอบ
   ข้อมูลทั้งหมดเก็บบน Firebase Realtime DB (ตัวเดียวกับสคริปต์เกม)

   Env ที่ต้องตั้งใน Vercel (Settings → Environment Variables):
     ADMIN_KEY          = รหัสแอดมิน (ใส่ในหน้า admin.html)
     FIREBASE_DB_URL    = https://xxx-default-rtdb.firebaseio.com
     FIREBASE_DB_SECRET = ค่า auth ของ Firebase (ถ้า rules ปิดเขียน)
   ============================================================ */
"use strict";

const FIREBASE_URL = (process.env.FIREBASE_DB_URL || "").replace(/\/+$/, "");
const FIREBASE_SECRET = process.env.FIREBASE_DB_SECRET || "";
const ADMIN_KEY = process.env.ADMIN_KEY || "";

function fb(path, method, body) {
  let url = FIREBASE_URL + path + (path.indexOf("?") >= 0 ? "&" : "?") + "auth=" + encodeURIComponent(FIREBASE_SECRET);
  const opts = { method: method || "GET", headers: { "Content-Type": "application/json" } };
  if (body !== undefined) opts.body = JSON.stringify(body);
  return fetch(url, opts).then(async (r) => {
    if (!r.ok) throw new Error("Firebase " + r.status);
    const text = await r.text();
    return text ? JSON.parse(text) : null;
  });
}

function json(res, code, obj) {
  res.statusCode = code;
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.end(JSON.stringify(obj));
}

module.exports = async (req, res) => {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  if (req.method === "OPTIONS") return res.status(204).end();
  if (req.method !== "POST") return json(res, 405, { ok: false, error: "POST only" });
  if (!ADMIN_KEY) return json(res, 500, { ok: false, error: "ยังไม่ได้ตั้ง ADMIN_KEY ใน Vercel env" });
  if (!FIREBASE_URL) return json(res, 500, { ok: false, error: "ยังไม่ได้ตั้ง FIREBASE_DB_URL ใน Vercel env" });

  let b = {};
  try { b = typeof req.body === "object" ? req.body : JSON.parse(req.body || "{}"); } catch (e) { b = {}; }
  const key = String(b.key || "");
  const action = String(b.action || "");

  // ตรวจรหัสแอดมินก่อนทุกกรณี (auth เองก็ใช้ ADMIN_KEY เดียวกัน)
  if (action !== "auth" || true) {
    if (key !== ADMIN_KEY) return json(res, 401, { ok: false, error: "รหัสแอดมินไม่ถูกต้อง" });
  }

  try {
    switch (b.action) {
      case "auth":
        return json(res, 200, { ok: true });

      case "list": {
        const farminglog = (await fb("/farminglog.json", "GET")) || {};
        const orders = (await fb("/orders.json", "GET")) || {};
        return json(res, 200, { ok: true, farminglog, orders });
      }

      case "deleteOrder": {
        const id = String(b.id || "");
        if (!id) return json(res, 400, { ok: false, error: "ต้องระบุ id" });
        await fb("/orders/" + encodeURIComponent(id) + ".json", "DELETE");
        return json(res, 200, { ok: true });
      }

      case "updateOrder": {
        const id = String(b.id || "");
        if (!id) return json(res, 400, { ok: false, error: "ต้องระบุ id" });
        const patch = {};
        if (b.status) patch.status = String(b.status);
        if (b.progress != null) patch.progress = Math.max(0, Math.min(100, Number(b.progress) || 0));
        patch.updatedAt = Math.floor(Date.now() / 1000);
        await fb("/orders/" + encodeURIComponent(id) + ".json", "PATCH", patch);
        return json(res, 200, { ok: true });
      }

      case "deleteAccount": {
        const player = String(b.player || "");
        if (!player) return json(res, 400, { ok: false, error: "ต้องระบุ player" });
        await fb("/farminglog/" + encodeURIComponent(player) + ".json", "DELETE");
        return json(res, 200, { ok: true });
      }

      case "deleteRun": {
        const player = String(b.player || "");
        const runId = String(b.runId || "");
        if (!player || !runId) return json(res, 400, { ok: false, error: "ต้องระบุ player และ runId" });
        await fb("/farminglog/" + encodeURIComponent(player) + "/history/" + encodeURIComponent(runId) + ".json", "DELETE");
        return json(res, 200, { ok: true });
      }

      default:
        return json(res, 400, { ok: false, error: "action ไม่รู้จัก: " + b.action });
    }
  } catch (e) {
    return json(res, 500, { ok: false, error: String(e && e.message || e) });
  }
};