/* ============================================================
   Paduk — Farming Log :: app.js
   อ่านข้อมูลจาก assets/mock.json (ค่าเริ่มต้น) หรือ Firebase
   ถ้าใส่ window.FIREBASE_URL จะดึงข้อมูลจริงแทน
   ------------------------------------------------------------
   โครงข้อมูล (เหมือนที่ potassium_farmlog.luau POST ขึ้น Firebase)
     data.farminglog[player] = {
       player, displayName, level, ts,
       characters: [{ name, tier, trait, count, favorite, level, icon }],
       materials:  { [id]: count },
       currencies: { money, gems, rolls, ... }
     }
     data.orders[orderId] = {
       id, customer, game, package, qty, status, progress, price, updatedAt
     }
   ============================================================ */
"use strict";

// ---- config ----
// ตั้ง FIREBASE_URL ได้จาก index.html (<script>window.FIREBASE_URL = "..."</script>) หรือ console
const FIREBASE_URL = typeof window.FIREBASE_URL === "string" ? window.FIREBASE_URL.replace(/\/+$/, "") : "";
const FARMING_PATH = "farminglog";
const ORDERS_PATH = "orders";
const REFRESH_MS = 15000;
const ONLINE_WINDOW = 300; // วินาที — สคริปต์ส่งทุก 2 นาที ถ้าเกิน 5 นาทีไม่ส่ง = ออฟไลน์

const RARITY_ORDER = ["Common", "Epic", "Legendary", "Mythic", "Arcane", "Zenless"];

// gradient ต่อ rarity (ใช้เป็น inline style เพราะ .char-tags span ทับ background ได้)
const RARITY_GRAD = {
  Common:    "linear-gradient(135deg,#ffffff,#dcdcdc)",
  Epic:      "linear-gradient(135deg,#5457ff,#60a0ff)",
  Legendary: "linear-gradient(135deg,#a742ff,#f587ff)",
  Mythic:    "linear-gradient(135deg,#ff7e4b,#ffe83e)",
  Arcane:    "linear-gradient(135deg,#ff7e4b,#ff4144)",
  Zenless:   "linear-gradient(135deg,#859bff,#6d49ff)",
};
function rarityStyle(tier) {
  return "background:" + (RARITY_GRAD[tier] || RARITY_GRAD.Common) + ";color:#111827;font-weight:700;border:0";
}

const GAMES = [
  {
    name: "Anime Zero",
    code: "ANIME ZERO",
    cover: "assets/img/anime-zero.png",
    desc: "ติดตามงานฟาร์ม ตัวละคร ไอเทม และความคืบหน้าของบัญชี Anime Zero ได้ในหน้าเดียว",
  },
  {
    name: "Slayer 2",
    code: "SLAYER 2",
    cover: "assets/img/slayer-2.png",
    desc: "พื้นที่สำหรับตรวจสอบงาน Slayer 2 พร้อมระบบค้นหา ประวัติรัน และสรุปผลการฟาร์ม",
  },
];

const STATUS_TH = { FARMING: "กำลังฟาร์ม", PENDING: "รอเริ่ม", DONE: "เสร็จสิ้น", CANCEL: "ยกเลิก" };
const STATUS_CLASS = { FARMING: "status-farming", PENDING: "status-pending", DONE: "status-done", CANCEL: "status-cancel" };

// ---- state ----
const state = {
  data: null,          // { farminglog, orders }
  selectedGame: null,
  listView: false,
  listFilter: "",
  statusFilter: "all",
  gameSearch: "",
  detailOrderId: null,
};

// ---- tiny dom helpers ----
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
function clockOf(ts) {
  if (!ts) return "—";
  const d = new Date(Number(ts) * 1000);
  const p = (x) => String(x).padStart(2, "0");
  return p(d.getHours()) + ":" + p(d.getMinutes()) + ":" + p(d.getSeconds());
}
function rarityRank(t) { const i = RARITY_ORDER.indexOf(t); return i < 0 ? 0 : i + 1; }
// สถานะออนไลน์: สคริปต์ในเกมส่งทุก 2 นาที — ถ้าเกิน 5 นาทีไม่ส่ง = ออฟไลน์
function isOnline(ts) { return Number(ts || 0) > 0 && (Date.now() / 1000 - Number(ts)) <= ONLINE_WINDOW; }
// แปลง asset id ของ Roblox เป็น URL รูป (icon ตัวละครจากเกม)
function iconUrl(icon) {
  const s = String(icon == null ? "" : icon).trim();
  if (!s || s === "0" || !/^\d+$/.test(s)) return "";
  return "https://tr.rbxcdn.com/v1/asset/id/" + s + "/size/150x150/image/png";
}
function maskName(name) {
  const s = String(name || "");
  if (s.length <= 3) return s;
  return s.slice(0, 2) + "***" + s.slice(-2);
}
function initials(name) {
  const s = String(name || "?").replace(/[^A-Za-z0-9]/g, "");
  return (s.slice(0, 2) || "?").toUpperCase();
}
// ============ data loading ============
async function fetchJson(url) {
  const res = await fetch(url, { cache: "no-store" });
  if (!res.ok) throw new Error("HTTP " + res.status);
  return res.json();
}

async function loadData() {
  if (FIREBASE_URL) {
    try {
      const both = await Promise.all([
        fetchJson(FIREBASE_URL + "/" + FARMING_PATH + ".json"),
        fetchJson(FIREBASE_URL + "/" + ORDERS_PATH + ".json"),
      ]);
      return { farminglog: both[0] || {}, orders: both[1] || {}, live: true };
    } catch (e) {
      console.warn("[FarmLog] Firebase load failed, falling back to mock:", e);
      toast("โหลด Firebase ไม่ได้ — แสดงข้อมูล mock แทน");
    }
  }
  const mock = await fetchJson("assets/mock.json");
  return { farminglog: mock.farminglog || {}, orders: mock.orders || {}, live: false };
}

function ordersArray() {
  const src = (state.data && state.data.orders) || {};
  return Object.keys(src).map((k) => {
    const o = Object.assign({}, src[k]);
    o.id = o.id || k;
    return o;
  });
}

function gamesInData() {
  const set = {};
  ordersArray().forEach((o) => { if (o.game) set[o.game] = true; });
  const list = GAMES.slice();
  Object.keys(set).forEach((name) => {
    if (!list.some((g) => g.name === name)) {
      list.push({ name: name, code: String(name).toUpperCase(), cover: "", desc: "พื้นที่สำหรับตรวจสอบงาน " + name + " พร้อมระบบค้นหาและสรุปผลการฟาร์ม" });
    }
  });
  return list;
}

// ============ toast ============
let toastTimer = null;
function toast(msg) {
  const host = $("#toastHost");
  if (!host) return;
  host.innerHTML = '<div class="toast">' + esc(msg) + "</div>";
  if (toastTimer) clearTimeout(toastTimer);
  toastTimer = setTimeout(function () { host.innerHTML = ""; }, 3200);
}

// ============ page switching ============
function showPage(name) {
  ["dashboard", "detail", "shop", "support"].forEach(function (p) {
    const el = $("#" + p + "Page");
    if (!el) return;
    const show = p === name;
    el.hidden = !show;
    // ต้อง toggle class ด้วย เพราะ .hidden ใช้ display:none!important ทับ attribute hidden
    el.classList.toggle("hidden", !show);
  });
  $$(".navbtn").forEach(function (b) {
    b.classList.toggle("active", b.dataset.page === name);
  });
  window.scrollTo({ top: 0, behavior: "smooth" });
}

// ============ game picker ============
function renderGameCards() {
  const host = $("#gameCards");
  const q = (state.gameSearch || "").toLowerCase();
  const games = gamesInData().filter(function (g) {
    return !q || g.name.toLowerCase().indexOf(q) >= 0 || (g.code || "").toLowerCase().indexOf(q) >= 0;
  });

  if (!games.length) {
    host.innerHTML = '<div class="empty-state" style="grid-column:1/-1"><strong>ไม่พบเกม</strong>ลองพิมพ์ชื่อเกมอื่น</div>';
    return;
  }

  host.innerHTML = games.map(function (g, i) {
    const count = ordersArray().filter(function (o) { return o.game === g.name; }).length;
    const cover = g.cover
      ? '<img src="' + esc(g.cover) + '" alt="' + esc(g.name) + ' cover" loading="lazy">'
      : '<div style="width:100%;height:100%;display:grid;place-items:center;font:700 40px var(--display);color:#33415a">' + esc(initials(g.name)) + "</div>";
    return '' +
      '<button class="game-select-card" data-select-game="' + esc(g.name) + '" aria-label="เลือก ' + esc(g.name) + '">' +
        '<div class="game-cover">' + cover +
          '<span class="game-tag"><span class="dot pulse"></span> AVAILABLE SERVICE</span>' +
          '<span class="game-cover-count">' + String(i + 1).padStart(2, "0") + " / GAME</span>" +
        "</div>" +
        '<div class="game-card-body">' +
          '<div class="game-card-heading"><h3 class="game-card-title">' + esc(g.name) + '</h3><span class="game-card-arrow">↗</span></div>' +
          '<p class="game-card-desc">' + esc(g.desc) + "</p>" +
          '<div class="game-card-foot"><span><strong>' + esc(g.code) + "</strong> · FARMING LOG · " + count + " งาน</span>" +
          '<span class="choose-label">เลือกเกม <span aria-hidden="true">→</span></span></div>' +
        "</div>" +
      "</button>";
  }).join("");
}
// ============ stats grid ============
function renderStats() {
  const host = $("#statsGrid");
  const arr = ordersArray();
  const farming = arr.filter(function (o) { return o.status === "FARMING"; }).length;
  const done = arr.filter(function (o) { return o.status === "DONE"; }).length;
  const pending = arr.filter(function (o) { return o.status === "PENDING"; }).length;
  const cancel = arr.filter(function (o) { return o.status === "CANCEL"; }).length;
  const income = arr.filter(function (o) { return o.status === "DONE"; })
    .reduce(function (s, o) { return s + Number(o.price || 0); }, 0);

  const cards = [
    { cls: "", icon: "◈", label: "รายได้รวม", num: "฿" + fmt(income), foot: "จากงานที่เสร็จสิ้น" },
    { cls: "farming-stat", icon: "◉", label: "กำลังฟาร์ม", num: fmt(farming), foot: "งานที่เดินอยู่ตอนนี้" },
    { cls: "", icon: "✓", label: "เสร็จสิ้น", num: fmt(done), foot: "งานที่ปิดแล้ว" },
    { cls: "", icon: "⏱", label: "รอเริ่ม", num: fmt(pending), foot: "รอคิวเริ่มงาน" },
    { cls: "", icon: "✕", label: "ยกเลิก", num: fmt(cancel), foot: "งานที่ถูกยกเลิก" },
  ];

  host.innerHTML = cards.map(function (c) {
    return '' +
      '<div class="stat-card ' + c.cls + '">' +
        '<div class="stat-icon">' + c.icon + "</div>" +
        '<div class="stat-label">' + esc(c.label) + "</div>" +
        '<div class="stat-number">' + c.num + "</div>" +
        '<div class="stat-foot">' + esc(c.foot) + "</div>" +
      "</div>";
  }).join("");
}

// ============ account (order) cards ============
function filteredOrders() {
  const q = (state.listFilter || "").toLowerCase();
  return ordersArray()
    .filter(function (o) { return !state.selectedGame || o.game === state.selectedGame; })
    .filter(function (o) { return state.statusFilter === "all" || o.status === state.statusFilter; })
    .filter(function (o) {
      if (!q) return true;
      return String(o.id).toLowerCase().indexOf(q) >= 0 ||
             String(o.customer).toLowerCase().indexOf(q) >= 0 ||
             String(o.package).toLowerCase().indexOf(q) >= 0;
    })
    .sort(function (a, b) { return Number(b.updatedAt || 0) - Number(a.updatedAt || 0); });
}

function orderCard(o) {
  const status = o.status || "PENDING";
  const progress = Math.max(0, Math.min(100, Number(o.progress || 0)));
  const stale = Number(o.updatedAt || 0) > 0 && (Date.now() / 1000 - Number(o.updatedAt)) > 86400;

  return '' +
    '<button class="account-card' + (stale ? " stale" : "") + '" data-order-id="' + esc(o.id) + '">' +
      '<div class="account-top">' +
        '<span class="account-name">' + esc(o.id) + "</span>" +
        '<span class="status-chip ' + (STATUS_CLASS[status] || "status-pending") + '">' + esc(STATUS_TH[status] || status) + "</span>" +
      "</div>" +
      '<div class="account-identity">' +
        '<div class="avatar">' + esc(initials(o.customer)) + "</div>" +
        '<div><div class="account-name" style="font-size:15px">' + esc(maskName(o.customer)) + "</div>" +
        '<div class="account-sub">ลูกค้า · ' + esc(o.game || "-") + "</div></div>" +
      "</div>" +
      '<div class="game-row"><span class="game-icon">◈</span>' + esc(o.game || "-") + "</div>" +
      '<div class="package-row">📦 ' + esc(o.package || "-") + " · qty " + fmt(o.qty || 1) + "</div>" +
      '<div class="progress-head"><span>ความคืบหน้า</span><strong>' + progress + "%</strong></div>" +
      '<div class="progress-wrap"><div class="progress-track"><div class="progress-fill" style="width:' + progress + '%"></div></div></div>' +
      '<div class="account-footer">' +
        "<span>฿" + fmt(o.price || 0) + "</span>" +
        "<span>" + esc(timeAgo(o.updatedAt)) + ' · <span class="detail-link">ดูรายละเอียด →</span></span>' +
      "</div>" +
    "</button>";
}

function renderAccounts() {
  const host = $("#accountsList");
  const arr = filteredOrders();
  host.className = state.listView ? "account-list" : "";

  if (!arr.length) {
    host.innerHTML = '<div class="empty-state"><strong>ไม่พบงานที่ตรงเงื่อนไข</strong>ลองเปลี่ยน game / status หรือล้างคำค้นหา</div>';
    return;
  }

  if (state.listView) {
    host.innerHTML = arr.map(function (o) {
      const status = o.status || "PENDING";
      const progress = Math.max(0, Math.min(100, Number(o.progress || 0)));
      return '' +
        '<div class="account-card" data-order-id="' + esc(o.id) + '" style="margin-bottom:10px">' +
          '<span class="account-name">' + esc(o.id) + "</span>" +
          '<span class="account-identity"><span class="avatar" style="width:38px;height:38px;font-size:14px;border-radius:10px">' + esc(initials(o.customer)) + "</span>" +
          '<span><span style="font-weight:600">' + esc(maskName(o.customer)) + '</span><span class="account-sub" style="display:block">' + esc(o.game || "-") + " · " + esc(o.package || "-") + "</span></span></span>" +
          '<span class="progress-wrap"><span class="progress-track" style="display:block"><span class="progress-fill" style="display:block;width:' + progress + '%"></span></span></span>' +
          '<span class="mono">฿' + fmt(o.price || 0) + "</span>" +
          '<span class="status-chip ' + (STATUS_CLASS[status] || "status-pending") + '">' + esc(STATUS_TH[status] || status) + "</span>" +
        "</div>";
    }).join("");
    return;
  }

  host.innerHTML = '<div class="accounts-grid">' + arr.map(orderCard).join("") + "</div>";
}
// ============ detail page ============
// ค่า placeholder ของ trait ที่ควรถือว่า "ไม่มี trait"
const TRAIT_PLACEHOLDERS = ["-", "—", "–", "", "n/a", "none"];
function cleanTrait(t) {
  const s = String(t == null ? "" : t).trim();
  return TRAIT_PLACEHOLDERS.indexOf(s.toLowerCase()) >= 0 ? "" : s;
}

// แปลงข้อมูลตัวละครให้เป็นรูปแบบเดียว รองรับทั้ง payload จาก Lua (favourite/ultimate)
// และ mock.json (favorite/unlocked/count)
function normalizeUnit(c) {
  return {
    name: c.name || c.slug || "?",
    tier: c.tier || "Common",
    trait: cleanTrait(c.trait),
    level: c.level != null ? c.level : null,
    xp: Number(c.xp || 0),
    count: c.count != null ? Number(c.count) : 1,
    favorite: !!(c.favorite != null ? c.favorite : c.favourite),
    unlocked: !!(c.unlocked != null ? c.unlocked : c.ultimate),
    icon: c.icon || "0",
  };
}

function accountEntries() {
  const src = (state.data && state.data.farminglog) || {};
  return Object.keys(src).map(function (k) {
    const a = Object.assign({}, src[k]);
    a.player = a.player || k;
    const units = a.characters || a.units || [];
    a.characters = (Array.isArray(units) ? units : []).map(normalizeUnit);
    return a;
  });
}

function findAccountForOrder() {
  const entries = accountEntries();
  if (!entries.length) return null;
  return entries[0];
}

function characterCard(c) {
  const tier = c.tier || "Common";
  // xp% คร่าว ๆ จาก xp สะสม (payload จากเกมไม่มี %) — ใช้เป็นหลอดระดับ
  const xpPct = c.xpPercent != null ? Number(c.xpPercent) : (c.xp ? Math.min(100, Math.round((c.xp % 1000) / 10)) : 0);
  const lvl = c.level != null ? c.level : "—";
  const img = iconUrl(c.icon);
  const portrait = img
    ? '<img src="' + esc(img) + '" alt="" loading="lazy" onerror="this.remove()">'
    : esc(initials(c.name));
  return '' +
    '<div class="char-card">' +
      '<div class="char-portrait rar-' + esc(tier) + '">' + portrait +
        (c.unlocked ? '<span class="ult">ULT</span>' : "") +
      "</div>" +
      '<div class="char-name">' + (c.favorite ? "★ " : "") + esc(c.name) + "</div>" +
      '<div class="char-tags"><span style="' + rarityStyle(tier) + '">' + esc(tier) + "</span>" +
        (c.trait ? "<span>" + esc(c.trait) + "</span>" : "") + "</div>" +
      '<div class="char-level"><span>Lv.' + esc(lvl) + "</span><span>×" + fmt(c.count || 0) + "</span></div>" +
      '<div class="char-xp"><span style="width:' + Math.max(0, Math.min(100, xpPct)) + '%"></span></div>' +
      (c.trait ? '<div class="trait">Trait: ' + esc(c.trait) + "</div>" : "") +
    "</div>";
}

function dropCard(id, count) {
  return '' +
    '<div class="drop-card">' +
      '<div class="game-icon">▣</div>' +
      '<div class="d-head"><span>' + esc(id) + "</span></div>" +
      '<div class="d-count">×' + fmt(count) + "</div>" +
    "</div>";
}
function renderDetail(orderId) {
  const container = $("#detailBody");
  const order = ordersArray().filter(function (o) { return String(o.id) === String(orderId); })[0] || null;
  const acc = findAccountForOrder();

  const titleEl = $("#detailTitle");
  if (titleEl) {
    titleEl.innerHTML = 'Farm <span class="shine">' + esc(order ? order.id : "Session Detail") + "</span>";
  }

  if (!acc) {
    container.innerHTML = '<div class="empty-state"><strong>ไม่พบข้อมูลบัญชี</strong>ยังไม่มีข้อมูลที่ถูกส่งขึ้น Firebase หรือ mock</div>';
    return;
  }

  const chars = (acc.characters || []).slice().sort(function (a, b) {
    const r = rarityRank(b.tier) - rarityRank(a.tier);
    return r !== 0 ? r : Number(b.count || 0) - Number(a.count || 0);
  });
  const materials = acc.materials || {};
  const matKeys = Object.keys(materials);
  const curr = acc.currencies || {};
  const status = (order && order.status) || "FARMING";
  const online = isOnline(acc.ts);

  // ประวัติการจบเกม (จาก /api/history → farminglog.<player>.history)
  const hist = acc.history || {};
  const runs = Object.keys(hist).map(function (k) {
    const h = Object.assign({}, hist[k]); h.runId = h.runId || k; return h;
  }).sort(function (a, b) { return Number(b.ts || 0) - Number(a.ts || 0); }).slice(0, 20);
  const runsHtml = runs.length
    ? runs.map(function (h) {
        const win = String(h.result).toLowerCase() === "win";
        return '' +
          '<div class="run-item">' +
            '<div class="r-main">' +
              '<div class="r-title">' + (win ? "🏆 ชนะ" : "💀 แพ้") + " · " + esc(h.mapName || h.mode || "-") + "</div>" +
              '<div class="r-sub">' + esc(h.mode || "?") + " · wave " + fmt(h.waves) + " · " + esc(timeAgo(h.ts)) + (h.kills ? " · ฆ่า " + fmt(h.kills) : "") + (h.difficulty ? " · " + esc(h.difficulty) : "") + "</div>" +
            "</div>" +
          "</div>";
      }).join("")
    : '<div class="empty-state" style="grid-column:1/-1"><strong>ยังไม่มีประวัติการจบเกม</strong>รอสคริปต์ส่งประวัติรอบแรก</div>';

  const rail = '' +
    '<aside class="panel detail-rail">' +
      '<div class="rail-top">' +
        '<span class="eyebrow">ACCOUNT</span>' +
        '<span class="status-chip ' + (STATUS_CLASS[status] || "status-farming") + '">' + esc(STATUS_TH[status] || status) + "</span>" +
      "</div>" +
      '<div class="rail-profile"><div class="avatar large">' + esc(initials(acc.displayName || acc.player)) + "</div>" +
        '<div><div class="account-name">' + esc(maskName(acc.displayName || acc.player)) + "</div>" +
        '<div class="rail-meta">LEVEL ' + fmt(acc.level || 0) + " · " + esc(timeAgo(acc.ts)) + "</div></div></div>" +
      '<div class="online-chip ' + (online ? "on" : "off") + '">' + (online ? "● ออนไลน์ในเกม" : "○ ออฟไลน์") + "</div>" +
      '<div class="package-panel"><div class="label">PACKAGE</div>' +
        '<div class="package-title">' + esc((order && order.package) || "-") + "</div>" +
        '<div class="package-game">' + esc((order && order.game) || "-") + " · qty " + fmt((order && order.qty) || 1) + "</div></div>" +
      '<div class="mini-stats">' +
        '<div class="mini-stat"><label>ตัวละคร</label><strong>' + fmt(chars.length) + "</strong></div>" +
        '<div class="mini-stat"><label>วัสดุ</label><strong>' + fmt(matKeys.length) + "</strong></div>" +
        '<div class="mini-stat"><label>ราคา</label><strong>฿' + fmt((order && order.price) || 0) + "</strong></div>" +
      "</div>" +
      '<div class="tiny-note">ข้อมูลอ่านจาก store ในเกมโดยตรง — ไม่มีการสแกน UI</div>' +
    "</aside>";

  const currencies = Object.keys(curr).length
    ? '<div class="subsection">สกุลเงิน</div><div class="drop-grid">' + Object.keys(curr).map(function (k) {
        return '<div class="drop-card"><div class="d-head"><span>' + esc(k) + '</span></div><div class="d-count">' + fmt(curr[k]) + "</div></div>";
      }).join("") + "</div>"
    : "";

  const main = '' +
    '<div class="detail-main">' +
      '<div class="panel game-header">' +
        '<div class="game-header-left">' +
          '<div class="ingame"><span class="dot pulse"></span> SYNC LIVE</div>' +
          '<div class="map-title">' + esc((order && order.game) || "Anime Zero") + "</div>" +
          '<div class="map-chips"><span>' + esc((order && order.id) || "-") + "</span><span>QTY " + fmt((order && order.qty) || 1) + " ชิ้น</span>" +
            "<span>" + esc((order && order.customer) || "-") + "</span></div>" +
        "</div>" +
        '<div class="game-numbers">' +
          '<div class="game-number"><label>ตัวละคร</label><strong>' + fmt(chars.length) + "</strong></div>" +
          '<div class="game-number"><label>LEVEL</label><strong>' + fmt(acc.level || 0) + "</strong></div>" +
          '<div class="game-number"><label>วัสดุ</label><strong>' + fmt(matKeys.length) + "</strong></div>" +
        "</div>" +
      "</div>" +
      currencies +
      '<div class="subsection">ประวัติการจบเกม (ล่าสุด ' + runs.length + " รอบ)</div>" +
      runsHtml +
      '<div class="subsection">ตัวละครทั้งหมด</div>' +
      '<div class="char-grid">' + (chars.length ? chars.map(characterCard).join("") : '<div class="empty-state" style="grid-column:1/-1"><strong>ยังไม่มีข้อมูลตัวละคร</strong></div>') + "</div>" +
      '<div class="subsection">วัสดุในคลัง</div>' +
      '<div class="drop-grid">' + (matKeys.length
        ? matKeys.sort(function (a, b) { return Number(materials[b]) - Number(materials[a]); }).map(function (k) { return dropCard(k, materials[k]); }).join("")
        : '<div class="empty-state" style="grid-column:1/-1"><strong>ยังไม่มีข้อมูลวัสดุ</strong></div>') + "</div>" +
    "</div>";

  container.innerHTML = rail + main;
}
// ============ game selection ============
function selectGame(name) {
  state.selectedGame = name;
  $("#gamePicker").classList.add("hidden");
  $("#dashboardWorkspace").classList.remove("hidden");
  $("#selectedGameName").textContent = name;
  const g = gamesInData().filter(function (x) { return x.name === name; })[0];
  $("#pickTitleWord").textContent = (g && g.code) || "FARM";
  $("#detailTitle").innerHTML = 'Farm <span class="shine">' + esc(name) + "</span>";
  renderStats();
  renderAccounts();
  showPage("dashboard");
}

function showGamePicker() {
  state.selectedGame = null;
  $("#gamePicker").classList.remove("hidden");
  $("#dashboardWorkspace").classList.add("hidden");
  renderGameCards();
}

// ============ refresh all ============
function renderAll() {
  renderGameCards();
  if (state.selectedGame) {
    renderStats();
    renderAccounts();
  }
  const accounts = Object.keys((state.data && state.data.farminglog) || {});
  const latest = accounts.length
    ? Math.max.apply(null, accounts.map(function (k) { return Number((state.data.farminglog[k] || {}).ts || 0); }))
    : Math.max.apply(null, [0].concat(ordersArray().map(function (o) { return Number(o.updatedAt || 0); })));
  const el = $("#lastUpdated");
  if (el) el.textContent = latest ? clockOf(latest) : "—";
  const label = $("#liveLabel");
  if (label) label.textContent = FIREBASE_URL ? "LIVE DATA" : "LIVE MOCK DATA";
  const note = $("#dataNote");
  if (note) note.textContent = (FIREBASE_URL ? "LIVE API" : "MOCK DATA") + " · AUTO REFRESH " + Math.round(REFRESH_MS / 1000) + "S";
}

// ============ events ============
document.addEventListener("click", function (e) {
  const game = e.target.closest("[data-select-game]");
  if (game) { selectGame(game.dataset.selectGame); return; }

  const card = e.target.closest("[data-order-id]");
  if (card) { renderDetail(card.dataset.orderId); showPage("detail"); return; }

  const nav = e.target.closest("[data-page]");
  if (nav) {
    const page = nav.dataset.page;
    if (page === "dashboard") { showPage("dashboard"); }
    else { showPage(page); }
    return;
  }

  if (e.target.closest("#changeGame")) { showGamePicker(); showPage("dashboard"); return; }
  if (e.target.closest("#backFromDetail")) { showPage("dashboard"); return; }
  if (e.target.closest("#gridView")) {
    state.listView = false;
    $("#gridView").classList.add("active");
    $("#listView").classList.remove("active");
    renderAccounts();
    return;
  }
  if (e.target.closest("#listView")) {
    state.listView = true;
    $("#listView").classList.add("active");
    $("#gridView").classList.remove("active");
    renderAccounts();
    return;
  }
  if (e.target.closest("#loginBtn")) { toast("ระบบล็อกอินยังไม่เชื่อมต่อ API"); return; }
  if (e.target.closest("#sendTicket")) { toast("บันทึกคำขอจำลองแล้ว — เชื่อม POST /api/tickets เมื่อต่อ backend"); return; }
});

$("#gameSearch").addEventListener("input", function (e) {
  state.gameSearch = e.target.value;
  renderGameCards();
});

$("#accountSearch").addEventListener("input", function (e) {
  state.listFilter = e.target.value;
  renderAccounts();
});

$("#statusFilter").addEventListener("change", function (e) {
  state.statusFilter = e.target.value;
  renderAccounts();
});

$("#langToggle").addEventListener("click", function () {
  const btn = $("#langToggle");
  const en = btn.textContent.trim() === "TH / EN";
  btn.textContent = en ? "EN / TH" : "TH / EN";
  btn.classList.toggle("active", en);
  toast(en ? "English labels enabled for primary navigation" : "เปลี่ยน label หลักเป็นภาษาไทยแล้ว");
});

// ============ deep link (#game=Anime%20Zero&order=AZ-118) ============
function readHash() {
  const h = String((window.location && window.location.hash) || "").replace(/^#/, "");
  if (!h) return {};
  const out = {};
  h.split("&").forEach(function (kv) {
    const i = kv.indexOf("=");
    if (i > 0) out[decodeURIComponent(kv.slice(0, i))] = decodeURIComponent(kv.slice(i + 1));
  });
  return out;
}

function applyHash() {
  const h = readHash();
  if (h.game) {
    const exists = gamesInData().some(function (g) { return g.name === h.game; });
    if (exists) selectGame(h.game);
  }
  if (h.order) {
    const found = ordersArray().some(function (o) { return String(o.id) === String(h.order); });
    if (found) { renderDetail(h.order); showPage("detail"); }
  }
}

// ============ init ============
async function init() {
  try {
    state.data = await loadData();
    renderAll();
    showGamePicker();
    showPage("dashboard");
    applyHash();
  } catch (err) {
    console.error(err);
    const host = $("#gameCards");
    if (host) host.innerHTML = '<div class="error-state" style="grid-column:1/-1"><strong>โหลดข้อมูลไม่ได้</strong>' + esc(err.message) + "</div>";
  }
}

init();
setInterval(async function () {
  try {
    state.data = await loadData();
    renderAll();
    if (state.selectedGame) renderAccounts();
  } catch (err) {
    console.error(err);
  }
}, REFRESH_MS);