/* ============================================================
   ROLLINSHOP — Admin page logic
   ใช้ /api/admin (Vercel serverless) — รหัสแอดมินเก็บใน sessionStorage
   ============================================================ */
"use strict";

const API = "/api/admin";
const ONLINE_WINDOW = 300; // วินาที — ถ้าสคริปต์ส่งภายใน 5 นาทีล่าสุด = ออนไลน์

const $ = (sel, root) => (root || document).querySelector(sel);
const $$ = (sel, root) => Array.prototype.slice.call((root || document).querySelectorAll(sel));

function esc(s) {
  return String(s == null ? "" : s)
    .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}
function fmt(n) { return Number(n || 0).toLocaleString("en-US"); }
function timeAgo(ts) {
  if (!ts) return "—";
  const secs = Math.floor(Date.now() / 1000) - Number(ts);
  if (secs < 60) return "เมื่อสักครู่";
  if (secs < 3600) return Math.floor(secs / 60) + " นาทีที่แล้ว";
  if (secs < 86400) return Math.floor(secs / 3600) + " ชม.ที่แล้ว";
  return Math.floor(secs / 86400) + " วันก่อน";
}
function isOnline(ts) { return Number(ts || 0) > 0 && (Date.now() / 1000 - Number(ts)) <= ONLINE_WINDOW; }

const STATUS_TH = { FARMING: "กำลังฟาร์ม", PENDING: "รอเริ่ม", DONE: "เสร็จสิ้น", CANCEL: "ยกเลิก" };

let ADMIN_KEY = sessionStorage.getItem("rs_admin_key") || "";
let cache = { farminglog: {}, orders: {} };

let toastTimer = null;
function toast(msg) {
  const host = $("#toastHost");
  if (!host) return;
  host.innerHTML = '<div class="toast">' + esc(msg) + "</div>";
  if (toastTimer) clearTimeout(toastTimer);
  toastTimer = setTimeout(function () { host.innerHTML = ""; }, 3200);
}

async function callApi(action, extra) {
  const res = await fetch(API, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(Object.assign({ key: ADMIN_KEY, action }, extra || {})),
  });
  const data = await res.json().catch(() => ({ ok: false, error: "ตอบกลับไม่ใช่ JSON" }));
  if (!res.ok || !data.ok) throw new Error(data.error || ("HTTP " + res.status));
  return data;
}

async function refresh() {
  const d = await callApi("list");
  cache = { farminglog: d.farminglog || {}, orders: d.orders || {} };
  renderOrders();
  renderAccounts();
}

function renderOrders() {
  const host = $("#orderList");
  const q = ($("#adminSearch").value || "").toLowerCase();
  const arr = Object.keys(cache.orders).map(function (k) {
    const o = Object.assign({}, cache.orders[k]); o.id = o.id || k; return o;
  }).filter(function (o) {
    if (!q) return true;
    return String(o.id).toLowerCase().indexOf(q) >= 0 ||
           String(o.customer).toLowerCase().indexOf(q) >= 0 ||
           String(o.game || "").toLowerCase().indexOf(q) >= 0;
  }).sort(function (a, b) { return Number(b.updatedAt || 0) - Number(a.updatedAt || 0); });

  $("#orderCount").textContent = arr.length + " งาน";
  if (!arr.length) {
    host.innerHTML = '<div class="empty-state" style="grid-column:1/-1"><strong>ไม่มีงาน</strong>ยังไม่มีข้อมูลงานในระบบ</div>';
    return;
  }

  host.innerHTML = arr.map(function (o) {
    const status = o.status || "PENDING";
    return '' +
      '<div class="admin-card" data-order="' + esc(o.id) + '">' +
        '<div class="row"><span class="name">' + esc(o.id) + '</span>' +
          '<span class="status-chip status-' + esc(status.toLowerCase()) + '">' + esc(STATUS_TH[status] || status) + "</span></div>" +
        '<div class="sub">' + esc(o.customer || "-") + " · " + esc(o.game || "-") + " · " + esc(o.package || "-") + " · ฿" + fmt(o.price) + " · " + esc(timeAgo(o.updatedAt)) + "</div>" +
        '<div class="btn-row">' +
          "<select data-order-status>" +
            ["FARMING", "PENDING", "DONE", "CANCEL"].map(function (s) {
              return '<option value="' + s + '"' + (s === status ? " selected" : "") + ">" + STATUS_TH[s] + "</option>";
            }).join("") +
          "</select>" +
          '<button class="ok-btn" data-save-order>บันทึกสถานะ</button>' +
          '<button class="danger-btn" data-del-order>🗑 ลบงาน</button>' +
        "</div>" +
      "</div>";
  }).join("");
}

function renderAccounts() {
  const host = $("#accountList");
  const q = ($("#adminSearch").value || "").toLowerCase();
  const arr = Object.keys(cache.farminglog).map(function (k) {
    const a = Object.assign({}, cache.farminglog[k]); a.player = a.player || k; return a;
  }).filter(function (a) {
    if (!q) return true;
    return String(a.player).toLowerCase().indexOf(q) >= 0 ||
           String(a.displayName || "").toLowerCase().indexOf(q) >= 0;
  }).sort(function (a, b) { return Number(b.ts || 0) - Number(a.ts || 0); });

  $("#accountCount").textContent = arr.length + " บัญชี";
  if (!arr.length) {
    host.innerHTML = '<div class="empty-state" style="grid-column:1/-1"><strong>ไม่มีบัญชี</strong>ยังไม่มีสคริปต์ส่งข้อมูลเข้ามา</div>';
    return;
  }

  host.innerHTML = arr.map(function (a) {
    const online = isOnline(a.ts);
    const nChars = Array.isArray(a.characters) ? a.characters.length : 0;
    const nHist = a.history ? Object.keys(a.history).length : 0;
    return '' +
      '<div class="admin-card" data-account="' + esc(a.player) + '">' +
        '<div class="row"><span class="name">' +
          (online ? '<span class="online-dot"></span>' : '<span class="offline-dot"></span>') +
          esc(a.player) + "</span>" +
          '<span class="sub">' + (online ? "ออนไลน์" : "ออฟไลน์ · " + esc(timeAgo(a.ts))) + "</span></div>" +
        '<div class="sub">ตัวละคร ' + nChars + " · ประวัติ " + nHist + " รอบ · " + esc(a.displayName || "-") + "</div>" +
        '<div class="btn-row">' +
          '<button class="ok-btn" data-view-history>📄 ดูประวัติ</button>' +
          '<button class="danger-btn" data-del-account>🗑 ลบบัญชี</button>' +
        "</div>" +
      "</div>";
  }).join("");
}



// ============ history modal ============
function showHistory(player) {
  const acc = cache.farminglog[player];
  if (!acc) { toast("ไม่พบบัญชี"); return; }
  $("#historyTitle").textContent = "ประวัติการจบเกม — " + player;
  const hist = acc.history || {};
  const arr = Object.keys(hist).map(function (k) {
    const h = Object.assign({}, hist[k]); h.runId = h.runId || k; return h;
  }).sort(function (a, b) { return Number(b.ts || 0) - Number(a.ts || 0); });

  $("#historyList").innerHTML = arr.length ? arr.map(function (h) {
    const win = String(h.result).toLowerCase() === "win";
    return '' +
      '<div class="history-item">' +
        '<div class="h-main">' +
          '<div class="h-title">' + (win ? "🏆" : "💀") + " " + esc(h.mode || "?") + " — " + esc(h.result || "?") + " · " + esc(h.mapName || "-") + "</div>" +
          '<div class="h-sub">' + esc(timeAgo(h.ts)) + " · " + fmt(h.duration) + " วิ · wave " + fmt(h.waves) + "</div>" +
        "</div>" +
        '<button class="danger-btn" data-del-run="' + esc(h.runId) + '">ลบ</button>' +
      "</div>";
  }).join("") : '<div class="empty-state"><strong>ยังไม่มีประวัติ</strong>สคริปต์ยังไม่เคยส่งประวัติรอบมา</div>';

  $("#historyModal").style.display = "grid";
  $("#historyModal").dataset.player = player;
}

// ============ events ============
document.addEventListener("click", async function (e) {
  const t = e.target;

  const delRun = t.closest("[data-del-run]");
  if (delRun) {
    const player = $("#historyModal").dataset.player;
    if (!confirm("ลบรอบนี้ถาวร?")) return;
    try { await callApi("deleteRun", { player, runId: delRun.dataset.delRun }); toast("ลบรอบแล้ว"); showHistory(player); }
    catch (err) { toast("ผิดพลาด: " + err.message); }
    return;
  }

  const delOrder = t.closest("[data-del-order]");
  if (delOrder) {
    const id = delOrder.closest("[data-order]").dataset.order;
    if (!confirm("ลบงาน " + id + " ถาวร?")) return;
    try { await callApi("deleteOrder", { id }); toast("ลบงาน " + id + " แล้ว"); refresh(); }
    catch (err) { toast("ผิดพลาด: " + err.message); }
    return;
  }

  const saveOrder = t.closest("[data-save-order]");
  if (saveOrder) {
    const card = saveOrder.closest("[data-order]");
    const id = card.dataset.order;
    const status = card.querySelector("[data-order-status]").value;
    try { await callApi("updateOrder", { id, status }); toast("บันทึกสถานะ " + id + " แล้ว"); refresh(); }
    catch (err) { toast("ผิดพลาด: " + err.message); }
    return;
  }

  const delAcc = t.closest("[data-del-account]");
  if (delAcc) {
    const player = delAcc.closest("[data-account]").dataset.account;
    if (!confirm("ลบบัญชี " + player + " ทั้งหมด (รวมประวัติ)?")) return;
    try { await callApi("deleteAccount", { player }); toast("ลบบัญชี " + player + " แล้ว"); refresh(); }
    catch (err) { toast("ผิดพลาด: " + err.message); }
    return;
  }

  const viewHist = t.closest("[data-view-history]");
  if (viewHist) { showHistory(viewHist.closest("[data-account]").dataset.account); return; }

  if (t.closest("#historyClose") || e.target === $("#historyModal")) {
    $("#historyModal").style.display = "none";
    return;
  }

  if (t.closest("#refreshBtn")) { refresh().catch(function (err) { toast(err.message); }); return; }

  if (t.closest("#loginSubmit")) { doLogin(); return; }
  if (t.closest("#logoutBtn")) {
    ADMIN_KEY = ""; sessionStorage.removeItem("rs_admin_key");
    location.reload();
    return;
  }
});

document.addEventListener("keydown", function (e) {
  if (e.key === "Enter" && e.target.id === "keyInput") doLogin();
});

$("#adminSearch").addEventListener("input", function () { renderOrders(); renderAccounts(); });

async function doLogin() {
  const key = $("#keyInput").value.trim();
  if (!key) { $("#loginMsg").textContent = "กรุณาใส่รหัส"; return; }
  $("#loginMsg").textContent = "กำลังตรวจ...";
  ADMIN_KEY = key;
  try {
    await callApi("auth");
    sessionStorage.setItem("rs_admin_key", key);
    $("#loginPage").classList.add("hidden");
    $("#adminPage").classList.remove("hidden");
    $("#logoutBtn").style.display = "";
    $("#loginMsg").textContent = "";
    refresh().catch(function (err) { toast(err.message); });
  } catch (err) {
    ADMIN_KEY = "";
    $("#loginMsg").textContent = "❌ " + err.message;
  }
}

// ============ init ============
if (ADMIN_KEY) {
  callApi("auth").then(function () {
    $("#loginPage").classList.add("hidden");
    $("#adminPage").classList.remove("hidden");
    $("#logoutBtn").style.display = "";
    refresh().catch(function (err) { toast(err.message); });
  }).catch(function () {
    sessionStorage.removeItem("rs_admin_key");
    ADMIN_KEY = "";
  });
}
