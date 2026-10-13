--[[
    ==========================================================================
    ANIME ZERO — FARMING LOG  (Potassium / Synapse / generic executor)
    ==========================================================================
    WHAT THIS DOES
      1) อ่าน "บัญชี" ผ่าน account store ที่ Replicate มาฝั่ง client โดยตรง
         -> ตัวละคร (displayName, rarity ตาม RarityBox, level จาก XP,
            trait จาก traitConfig, favourite จาก UnlockedCharacters,
            ultimate ที่ปลดล็อก, icon)
         -> สกุลเงิน (money / gems / rolls / luckySpins / traitRerolls)
         -> วัสดุในคลัง (material: id -> count)
      2) สรุป JSON แล้ว POST ขึ้นเว็บ (Vercel: /api/ingest + /api/history) ทุก Config.INTERVAL วินาที
      3) โหมด DEBUG จะพิมพ์ payload แทนการยิงจริง

    ใช้ DATA_SOURCE == "store" ทำงานได้ตลอดเวลา ไม่ต้องเปิดหน้า UI ใด ๆ
    (ถ้าอยากได้ count ของ unit ที่ฟาร์มจริง เซ็ตยก Config.DATA_SOURCE = "ui")

    หมายเหตุ:
      * เกมนี้สคริปต์จะ "เก็บ" unit เหลือระดับหน่วยเดียว (summon -> 'dupe' ให้)
        ตัวเลข level/XP คือตัวชี้วัดการฟาร์มที่แม่นที่สุด
      * REFERENCE (มาตรฐานเกม): RarityBox / characterRollConfig / materialConfig
    ==========================================================================
]]

--// ===== SERVICES =====
local Players     = game:GetService("Players")
local HttpService = game:GetService("HttpService")
local ReplicatedStorage = game:GetService("ReplicatedStorage")

local LocalPlayer = Players.LocalPlayer

--// ===== CONFIG =====
local Config = {
    INGEST_URL    = "https://YOUR-PROJECT.vercel.app", -- <<< URL เว็บบน Vercel (ไม่มี "/" ปิดท้าย)
    INTERVAL      = 120,       -- ส่งข้อมูลทุก 120 วินาที (2 นาที) — เว็บใช้ตัดสถานะออนไลน์
    DEBUG         = true,      -- true = พิมพ์ payload แทนการยิงจริง
    SEND_HISTORY  = true,      -- ส่งประวัติการจบเกม (matchHistory) ขึ้นเว็บด้วย
    DATA_SOURCE   = "store",
    INCLUDE_CURRENCIES = true,
    INCLUDE_MATERIALS  = true,
    MIN_MATERIAL_COUNT = 0,
    INCLUDE_ACCESSORIES = false,
    MAX_CHARS      = 20,
    MAX_MATERIALS  = 40,
    MAX_HISTORY    = 60,       -- จำนวนประวัติรอบสูงสุดที่ส่งต่อรอบ (ตรงกับที่ server เก็บ)
    MIN_TEXT_LEN   = 2,
    REQUIRE_IMAGE  = true,
}

-- ถ้ามี config.luau อยู่ข้าง script ให้ load มา merge (ไฟล์เดียวกับที่แจก)
if script ~= nil and script.Parent then
    local configModule = script.Parent:FindFirstChild("config.luau")
    if configModule then
        local ok, cfg = pcall(function() return require(configModule) end)
        if ok and type(cfg) == "table" then
            for k, v in pairs(cfg) do Config[k] = v end
        end
    end
end

--// ===== HTTP ADAPTER =====
local httpRequest do
    local req = (syn and syn.request) or (http and http.request) or http_request or request
    if req then
        httpRequest = function(opts) return req(opts) end
    else
        httpRequest = nil
    end
end

local function log(...) print("[FarmLog]", ...) end
local function warnLog(...) warn("[FarmLog]", ...) end

--// ===== SAFE REQUIRE =====
local cache = {}
local function safeRequire(path)
    local key = table.concat(path, "/")
    if cache[key] then return cache[key] end
    local ok, res = pcall(function()
        local obj = game:GetService("ReplicatedStorage")
        for _, part in ipairs(path) do
            obj = obj:FindFirstChild(part)
            if not obj then return nil end
        end
        return require(obj)
    end)
    cache[key] = ok and res or nil
    return cache[key]
end

local charactersByName = nil
do
    local m = safeRequire({ "global", "constants", "characters" })
    if m and m.charactersByName then charactersByName = m.charactersByName end
end

local rarityByCharacter, summonAnims = nil, nil
do
    local m = safeRequire({ "assets", "config", "characterRollConfig" })
    if m then
        rarityByCharacter = m.rarityByCharacter
        summonAnims = m.summoningAnimationIds
    end
end

--// ===== TIER/NAME/ICON HELPERS =====
-- มาตรฐานเดียวกับเกม (RarityBox.TIER_ORDER / Colors)
local RARITY_ORDER = { "Common", "Epic", "Legendary", "Mythic", "Arcane", "Zenless" }
local RARITY_COLORS = {
    Common    = { "FFFFFF", "DCDCDC" },
    Epic      = { "5457FF", "60A0FF" },
    Legendary = { "A742FF", "F587FF" },
    Mythic    = { "FF7E4B", "FFE83E" },
    Arcane    = { "FF7E4B", "FF4144" },
    Zenless   = { "859BFF", "6D49FF" },
}
-- traitConfig: เก็บ Id -> ชื่อ
local TRAIT_NAMES = {
    [7] = "Power 1", [8] = "Swift 1", [9] = "Focus 1", [10] = "Fortune",
    [11] = "Vitality", [12] = "Hunter", [13] = "Ferocity", [14] = "Supernova",
    [15] = "Power 2", [16] = "Power 3", [17] = "Swift 2", [18] = "Swift 3",
    [19] = "Focus 2", [20] = "Focus 3", [21] = "Razor Focus", [22] = "Overkill",
    [23] = "Sniper", [24] = "Deadeye",
}

local function tierRank(t)
    for i, name in ipairs(RARITY_ORDER) do if name == t then return i end end
    return 0
end

-- แปล slug -> displayName, tier, icon
local function lookup(slug)
    local displayName = charactersByName and charactersByName[slug] and charactersByName[slug].displayName or nil
    if not displayName then
        -- ตารางสำรอง
        local alias = {
            luffy = "Rubber Man", goku = "Cosmic Warrior", killua = "Thunder Prodigy",
            juuzou = "Twisted Agony", nagumo = "Kings Gambit",
            saber = "Lights of Divinity", guts = "Dragon Eclipse", alucard = "Immortal Sovereign",
            sukuna = "Cursed King", shanks = "Divine Emperor", katakuri = "Mochi Commander",
            miyabi = "Cataclysm", hutao = "Flame Director", sung_jinwoo = "Shadow Monarch",
        }
        displayName = alias[slug] or slug
    end
    local tier = rarityByCharacter and rarityByCharacter[slug] or "Common"
    local icon = summonAnims and summonAnims[slug] or nil
    return displayName, tier, icon
end
--// ===== ACCOUNT STORE READERS =====
-- เกมใช้ dime library: แต่ละ node มี __index.get และ :getAll / :forKeys
local function getNode(node)
    if type(node) ~= "table" then return node end
    local mt = getmetatable(node)
    if mt and type(mt.__index) == "table" and typeof(mt.__index.get) == "function" then
        local ok, res = pcall(function() return node:get() end)
        if ok then return res end
    end
    return node
end

local account, accountReady = nil, false
local function ensureAccount()
    if accountReady then return account end
    local ok, res = pcall(function()
        local m = safeRequire({ "global", "stores", "accountNamespace" })
        if not m then return nil end
        return m.getLocalPlayerAccount()
    end)
    if ok then account = res end
    accountReady = true
    return account
end

local function readCurrencies(node)
    local out = {}
    for _, key in ipairs({ "money", "gems", "rolls", "luckySpins", "traitRerolls" }) do
        local v = node and node[key]
        if type(v) == "table" then out[key] = getNode(v) end
    end
    return out
end

local function readMaterialMap(node)
    local out = {}
    if type(node) ~= "table" then return out end
    local ok, res = pcall(function() return node:getAll() end)
    if not ok or type(res) ~= "table" then return out end
    for k, v in pairs(res) do
        local count = v
        if type(count) == "table" then count = getNode(count) end
        if type(count) == "number" then out[tostring(k)] = count end
    end
    return out
end

--// ===== LEVEL FROM XP =====
-- ใช้ formular ของเกม (characterLevelProgression module) ถ้าอ่านได้
local lvlProg = safeRequire({ "global", "utils", "characterLevelProgression" })
local lvlFns = nil
if lvlProg and typeof(lvlProg.getLevel) == "function" then lvlFns = lvlProg end

local function lvlFromXp(xp)
    if type(xp) ~= "number" then xp = tonumber(xp) or 0 end
    if lvlFns then
        local ok, res = pcall(function() return lvlFns.getLevel(xp) end)
        if ok then return math.floor(res + 0.5) end
    end
    if xp <= 0 then return 1 end
    -- fallback: อย่างคร่าว ๆ (สังเกตระดับ 30+ -> ใช้ได้)
    return math.floor(math.sqrt(xp / 10)) + 1
end

--// ===== BUILD CHARACTER LIST (store-first) =====
local function collectCharacters()
    local acc = ensureAccount()
    if not acc or not acc.state then return nil end
    local st = acc.state
    local chars = st.CharactersData
    if not chars then return nil end

    -- favourite / placed จาก UnlockedCharacters (Slot1..4)
    local favouriteSlugs = {}
    local ul = st.UnlockedCharacters
    if ul then
        for i = 1, 4 do
            local slot = ul["Slot" .. i]
            if type(slot) == "table" then
                local okC, ch = pcall(function() return slot.Character:get() end)
                local okU, unlocked = pcall(function() return slot.Unlocked:get() end)
                local okF, fav = pcall(function() return slot.Favourite:get() end)
                if okC and type(ch) == "string" and ch ~= "" and okU and unlocked then
                    favouriteSlugs[ch] = (okF and fav) or false
                end
            end
        end
    end

    local list = {}
    for slug, cd in pairs(chars) do
        if slug ~= "_dirty" and slug ~= "_order" and type(cd) == "table" then
            local displayName, tier, icon = lookup(slug)
            local okX, xp = pcall(function() return cd.Progression.Xp:get() end)
            local okT, traitId = pcall(function() return cd.TraitData.Trait:get() end)
            local okU, ult = pcall(function() return cd.IsUltimateUnlocked:get() end)

            list[#list + 1] = {
                slug = slug,
                name = displayName,
                tier = tier,
                tierRank = tierRank(tier),
                level = okX and lvlFromXp(xp) or 1,
                xp = okX and (xp or 0) or 0,
                trait = okT and (TRAIT_NAMES[traitId] or "—") or "—",
                traitId = okT and traitId or 0,
                ultimate = okU and ult or false,
                favourite = favouriteSlugs[slug] or false,
                icon = icon,
            }
        end
    end

    table.sort(list, function(a, b)
        if a.tierRank ~= b.tierRank then return a.tierRank > b.tierRank end
        return a.name < b.name
    end)

    if #list > Config.MAX_CHARS then
        local trimmed = {}
        for i = 1, Config.MAX_CHARS do trimmed[i] = list[i] end
        list = trimmed
    end

    return list
end

--// ===== BUILD PAYLOAD =====
local function buildPayload(characters, materials, currencies)
    local jobId = game.JobId
    if jobId == "" then jobId = "studio" end

    local payload = {
        player      = LocalPlayer.Name,
        displayName = LocalPlayer.DisplayName,
        userId      = LocalPlayer.UserId,
        level       = 0,
        placeId     = game.PlaceId,
        gameId      = game.GameId,
        jobId       = jobId,
        ts          = os.time(),
        clientTs    = os.date("!%Y-%m-%dT%H:%M:%SZ"),
        source      = Config.DATA_SOURCE,
        characters  = characters,
    }

    if type(materials) == "table" then payload.materials = materials end
    if type(currencies) == "table" then payload.currencies = currencies end
    return payload
end

--// ===== PUSH TO WEBSITE (Vercel) =====
local function httpPostJson(url, body)
    if Config.DEBUG then
        log("[DEBUG] POST " .. url .. " (ยังไม่ยิงจริง)")
        print(HttpService:JSONEncode(body))
        return true
    end

    if not httpRequest then
        warnLog("ไม่พบฟังก์ชัน HTTP ของ executor (request / syn.request / http_request)")
        return false
    end

    local ok, err = pcall(function()
        return httpRequest({
            Url     = url,
            Method  = "POST",
            Headers = { ["Content-Type"] = "application/json" },
            Body    = HttpService:JSONEncode(body),
        })
    end)

    if ok then return true end
    warnLog("ส่งข้อมูลไม่สำเร็จ:", tostring(err))
    return false
end

local function pushToIngest(payload)
    local url = Config.INGEST_URL:gsub("/+$", "") .. "/api/ingest"
    return httpPostJson(url, payload)
end

-- ส่งประวัติการจบเกม (อ่านจาก account store: matchHistory)
local sentRunKeys = {}
local function pushHistory()
    if not Config.SEND_HISTORY then return end
    local acc = ensureAccount()
    if not acc or not acc.state or not acc.state.matchHistory then return end

    local ok, entries = pcall(function() return acc.state.matchHistory:get() end)
    if not ok then return end
    -- node:get() อาจคืนเป็น JSON string หรือ table แล้วแต่เวอร์ชัน dime
    if typeof(entries) == "string" then
        local okD, decoded = pcall(function() return HttpService:JSONDecode(entries) end)
        if not okD or type(decoded) ~= "table" then return end
        entries = decoded
    end
    if type(entries) ~= "table" then return end

    local pending = {}
    for _, h in ipairs(entries) do
        if type(h) == "table" and type(h.time) == "number" then
            local key = tostring(h.time) .. "|" .. tostring(h.mode or "") .. "|" .. tostring(h.map or "")
            if not sentRunKeys[key] then
                sentRunKeys[key] = true
                pending[#pending + 1] = {
                    runId     = "r" .. tostring(h.time) .. "-" .. tostring(h.mode or "?") .. "-" .. tostring(h.map or "?"),
                    ts        = h.time,
                    mode      = h.mode,
                    result    = h.won and "win" or "lose",
                    mapName   = h.map,
                    waves     = h.wave,
                    kills     = h.kills,
                    difficulty= h.difficulty,
                    character = h.character,
                }
            end
        end
    end

    if #pending == 0 then return end
    -- ส่งเฉพาะรอบที่ยังไม่เคยส่ง (diff ด้วย key = time+mode+map)
    if #pending > Config.MAX_HISTORY then
        local trimmed = {}
        for i = #pending - Config.MAX_HISTORY + 1, #pending do trimmed[#trimmed + 1] = pending[i] end
        pending = trimmed
    end

    local url = Config.INGEST_URL:gsub("/+$", "") .. "/api/history"
    local sent = httpPostJson(url, { player = LocalPlayer.Name, history = pending })
    log(string.format("history: ส่ง %d รอบใหม่ %s", #pending, sent and "(ok)" or "(fail)"))
end

--// ===== MAIN LOOP =====
local running = false

local function cycle()
    -- 1) characters
    local characters = collectCharacters()

    -- 2) currencies / materials
    local acc = ensureAccount()
    local currencies = {}
    if Config.INCLUDE_CURRENCIES and acc and acc.state then
        currencies = readCurrencies(acc.state.currencies)
    end
    local materials = {}
    if Config.INCLUDE_MATERIALS and acc and acc.state then
        materials = readMaterialMap(acc.state.material)
        -- ตัดเฉพาะ >= MIN
        for k, v in pairs(materials) do
            if v < Config.MIN_MATERIAL_COUNT then materials[k] = nil end
        end
    end

    local payload = buildPayload(characters, materials, currencies)
    local sent = pushToIngest(payload)

    -- ส่งประวัติการจบเกมที่ยังไม่เคยส่ง (diff ในเครื่อง)
    pcall(pushHistory)

    local charCount = type(characters) == "table" and #characters or 0
    local matCount = 0
    if type(materials) == "table" then for _ in pairs(materials) do matCount = matCount + 1 end end
    log(string.format("รอบ %s | %s | characters=%d materials=%d %s",
        os.date("%H:%M:%S"), payload.player, charCount, matCount, sent and "(ok)" or "(fail)"))
end

local function main()
    if running then return end
    running = true

    log("เริ่มทำงาน — player:", LocalPlayer.Name, "| PlaceId:", game.PlaceId)

    if Config.DEBUG then
        warnLog("โหมด DEBUG เปิด — ข้อมูลจะไม่ถูกส่งขึ้นเว็บ (แก้ที่ Config.DEBUG)")
    end
    if string.find(Config.INGEST_URL, "YOUR%-PROJECT") and not Config.DEBUG then
        warnLog("ยังไม่ได้ตั้ง Config.INGEST_URL — จะส่งไม่สำเร็จ")
    end

    task.spawn(function()
        while running do
            local ok, err = pcall(cycle)
            if not ok then warnLog("cycle error:", tostring(err)) end
            task.wait(Config.INTERVAL)
        end
    end)
end

main()