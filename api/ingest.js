/* ============================================================
   ROLLINSHOP — Ingest API (Vercel serverless)
   รับข้อมูลบัญชีจากสคริปต์ในเกม แล้วเก็บลง Firebase:
     /farminglog/<player> = { player, displayName, level, ts, characters, materials, currencies }
   สคริปต์ยิงมาทุก 2 นาที — เว็บใช้ค่า ts หา "ออนไลน์" (ส่งภายใน 5 นาทีล่าสุด)
   ============================================================ */
"use strict";

const FIREBASE_URL = (process.env.FIREBASE_DB_URL || "").replace(/\/+$/, "");
const FIREBASE_SECRET = process.env.FIREBASE_DB_SECRET || "";

function fb(path, method, body) {
  const url = FIREBASE_URL + path + (path.indexOf("?") >= 0 ? "&" : "?") + "auth=" + encodeURIComponent(FIREBASE_SECRET);
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
  if (!FIREBASE_URL) return json(res, 500, { ok: false, error: "ยังไม่ได้ตั้ง FIREBASE_DB_URL ใน Vercel env" });

  let b = {};
  try { b = typeof req.body === "object" ? req.body : JSON.parse(req.body || "{}"); } catch (e) { b = {}; }

  const player = String(b.player || "").trim();
  if (!player) return json(res, 400, { ok: false, error: "ต้องระบุ player" });

  // ตัด history ออกจาก payload หลัก (สคริปต์ส่งทาง /api/history แยกต่างหาก)
  delete b.history;

  try {
    await fb("/farminglog/" + encodeURIComponent(player) + ".json", "PUT", b);
    return json(res, 200, { ok: true });
  } catch (e) {
    return json(res, 500, { ok: false, error: String(e && e.message || e) });
  }
};