/* ============================================================
   Paduk — History Ingest API (Vercel serverless)
   รับประวัติการจบเกม (run) จากสคริปต์ในเกม แล้วเก็บลง Firebase:
     /farminglog/<player>/history/<runId> = { runId, ts, mode, result, ... }
   ประวัติเก็บสูงสุด 60 รายการ (ตัดรายการเก่าทิ้งอัตโนมัติ)
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

  try {
    // รายการเดียว: b.history = {...} หรือหลายรายการ: b.history = [ {...}, ... ]
    let items = Array.isArray(b.history) ? b.history : [b.history];
    items = items.filter((h) => h && typeof h === "object");
    if (!items.length) return json(res, 400, { ok: false, error: "ไม่มีข้อมูล history" });

    // เก็บทีละรายการ (key = runId ที่สคริปต์ให้มา)
    for (const h of items) {
      const runId = String(h.runId || h.jobId || ("run-" + (h.ts || Math.floor(Date.now() / 1000))));
      await fb(
        "/farminglog/" + encodeURIComponent(player) + "/history/" + encodeURIComponent(runId) + ".json",
        "PUT",
        {
          runId,
          ts: Number(h.ts) || Math.floor(Date.now() / 1000),
          mode: String(h.mode || "unknown"),
          result: String(h.result || "unknown"),
          duration: Number(h.duration) || 0,
          mapName: String(h.mapName || ""),
          waves: Number(h.waves) || 0,
          rewards: h.rewards || null,
          before: h.before || null,
          after: h.after || null,
        }
      );
    }

    // ตัดประวัติเก่าเกิน 60 รายการ (เรียงตาม ts)
    const hist = (await fb("/farminglog/" + encodeURIComponent(player) + "/history.json", "GET")) || {};
    const arr = Object.keys(hist).map((k) => Object.assign({ _k: k }, hist[k]))
      .sort((a, b) => (b.ts || 0) - (a.ts || 0));
    for (let i = 60; i < arr.length; i++) {
      await fb("/farminglog/" + encodeURIComponent(player) + "/history/" + encodeURIComponent(arr[i]._k) + ".json", "DELETE");
    }

    return json(res, 200, { ok: true, stored: items.length });
  } catch (e) {
    return json(res, 500, { ok: false, error: String(e && e.message || e) });
  }
};