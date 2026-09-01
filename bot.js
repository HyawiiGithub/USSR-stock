// ============================================================
// USSR ECONOMY BOT - CLEAN VERSION (FIXED EMOJIS)
// ============================================================

require('reflect-metadata');
const { Client, GatewayIntentBits, EmbedBuilder, ButtonStyle, ActionRowBuilder, ButtonBuilder, Events, ModalBuilder, TextInputBuilder, TextInputStyle, StringSelectMenuBuilder, StringSelectMenuOptionBuilder, ComponentType, SlashCommandBuilder, REST, Routes } = require('discord.js');
const dotenv = require('dotenv');
const fs = require('fs');
const path = require('path');
const axios = require('axios');

dotenv.config();

// ============================================================
// CONFIGURATION
// ============================================================

const DISCORD_TOKEN = process.env.DISCORD_TOKEN;
const GUILD_ID = process.env.GUILD_ID;
const UNBELIEVABOAT_TOKEN = process.env.UNBELIEVABOAT_API_TOKEN;
const WORK_COOLDOWN = (() => {
    const parsed = parseInt(process.env.WORK_COOLDOWN);
    return Number.isFinite(parsed) && parsed > 0 ? parsed : 180;
})();
const WORK_BASE_REWARD = parseInt(process.env.WORK_BASE_REWARD) || 10;
const WORK_MAX_REWARD = parseInt(process.env.WORK_MAX_REWARD) || 25;
const BASE_WAGE_PRINT = 15; // state prints this much per -work shift; company pays the rest (wage - 15) from its funds
const GSI_BASE_PRICE = parseInt(process.env.GSI_BASE_PRICE) || 100;
const GSI_VOLATILITY = parseFloat(process.env.GSI_VOLATILITY) || 0.015;
const BOT_OWNER_ID = '1082686076491137115';
const BOT_OWNER_2_ID = '860203156222902332';
const GLOBE_USER_ID = '1379734184259747851';
const EVENT_CHANNEL_ID = '1074440886114586695';
const STATE_BANK_USER_ID = '1513968015048184039';
const COLLECT_COOLDOWN_HOURS = 6;
const FACTORYDEAL_COOLDOWN_SECS = (() => {
    const v = parseInt(process.env.FACTORYDEAL_COOLDOWN);
    return Number.isFinite(v) && v > 0 ? v : 1800; // 30 min per company
})();
const GOVCONTRACT_COOLDOWN_SECS = (() => {
    const v = parseInt(process.env.GOVCONTRACT_COOLDOWN);
    return Number.isFinite(v) && v > 0 ? v : 3600; // 1h global
})();
// ============================================================
// TAXATION CODE No. 001-2026 — increased 5% for balance (original in Google Doc)
// ============================================================
// WHERE WE INCREASED (tell user to edit Google Doc here):
// - Individual: 351-1000 5%→10% (+5), 1001-5000 10%→15% (+5), 5001-200k 15%→20% (+5), >200k 25%→30% (+5) [0-350 stays 0%]
// - Corporate: 5001-15000 5%→10% (+5), 15001-30000 8%→13% (+5), >30000 12%→17% (+5) [0-5000 stays 0%]
// - Stock: Buy 2%→7% (+5), Sell 5%→10% (+5)
// - Luxury: 5%→10% (+5)
const TAX_BRACKETS_INDIVIDUAL = [
    { upTo: 350, rate: 0 },          // 0-350 0% (unchanged)
    { upTo: 1000, rate: 10 },         // 351-1000 10% (was 5% +5)
    { upTo: 5000, rate: 15 },         // 1001-5000 15% (was 10% +5)
    { upTo: 200000, rate: 20 },       // 5001-200k 20% (was 15% +5)
    { upTo: Infinity, rate: 30 },     // >200k 30% (was 25% +5)
];
const TAX_BRACKETS_CORPORATE = [
    { upTo: 5000, rate: 0 },          // 0-5k 0% (unchanged)
    { upTo: 15000, rate: 10 },        // 5k-15k 10% (was 5% +5)
    { upTo: 30000, rate: 13 },        // 15k-30k 13% (was 8% +5)
    { upTo: Infinity, rate: 17 },     // >30k 17% (was 12% +5)
];
const TAX_STOCK_BUY = 7;  // was 2% +5
const TAX_STOCK_SELL = 10; // was 5% +5
const TAX_LUXURY = 10; // was 5% +5
function calculateIndividualTax(amount) {
    for (const b of TAX_BRACKETS_INDIVIDUAL) {
        if (amount <= b.upTo) return Math.floor(amount * b.rate / 100);
    }
    return 0;
}
function calculateCorporateTax(amount) {
    for (const b of TAX_BRACKETS_CORPORATE) {
        if (amount <= b.upTo) return Math.floor(amount * b.rate / 100);
    }
    return 0;
}
async function collectWeeklyTaxes(manual=false) {
    const data = loadData();
    // prevent double collection within same week unless manual
    if (!manual && data.last_weekly_tax) {
        const last = new Date(data.last_weekly_tax);
        const now = new Date();
        // same ISO week?
        const getWeek = (d) => { const dd = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate())); const dayNum = dd.getUTCDay() || 7; dd.setUTCDate(dd.getUTCDate() + 4 - dayNum); const yearStart = new Date(Date.UTC(dd.getUTCFullYear(),0,1)); return Math.ceil((((dd - yearStart) / 86400000) + 1)/7); };
        if (getWeek(last) === getWeek(now) && last.getUTCFullYear() === now.getUTCFullYear()) {
            return null; // already collected this week
        }
    }
    let totalFromUsers = 0, totalFromCompanies = 0, usersTaxed = 0, companiesTaxed = 0;
    const userDetails = []; // {uid, username, total, tax}
    const companyDetails = []; // {cid, name, funds, tax}
    // Individual: tax on total cash+bank (if >=100) — MUST deduct from UnbelievaBoat too, otherwise it just prints
    for (const [uid, u] of Object.entries(data.users || {})) {
        if (uid === STATE_BANK_USER_ID) continue;
        const total = (u.cash||0) + (u.bank||0);
        if (total < 100) continue; // skip <100 to reduce lag
        const tax = calculateIndividualTax(total);
        // even 0% bracket we still record (user had ≥100 but paid 0) — so "everyone" is listed
        if (tax <= 0) {
            userDetails.push({ uid, username: u.username || uid.slice(0,6), total, tax: 0 });
            usersTaxed++; // count as processed even if 0
            continue;
        }
        // deduct proportionally from bank first, then cash (both data.users AND UnbelievaBoat)
        const bankDeduct = Math.min(u.bank||0, tax);
        const cashDeduct = tax - bankDeduct;
        if (bankDeduct > 0) u.bank -= bankDeduct;
        if (cashDeduct > 0) u.cash = Math.max(0, (u.cash||0) - cashDeduct);
        // actually remove from UnbelievaBoat (otherwise it just prints to state bank) — 5s delay to avoid API limit
        try {
            if (UNBELIEVABOAT_TOKEN) {
                await updateUnbBalance(uid, -cashDeduct, -bankDeduct, `Weekly tax ${tax}`);
                await new Promise(r => setTimeout(r, 5000));
            }
        } catch {}
        totalFromUsers += tax;
        usersTaxed++;
        userDetails.push({ uid, username: u.username || uid.slice(0,6), total, tax });
    }
    // Corporate: tax on company funds (if >=100)
    for (const [cid, c] of Object.entries(data.companies || {})) {
        const funds = c.funds || 0;
        if (funds < 100) continue;
        const tax = calculateCorporateTax(funds);
        if (tax <= 0) {
            companyDetails.push({ cid, name: c.name, funds, tax: 0 });
            companiesTaxed++;
            continue;
        }
        c.funds = Math.max(0, funds - tax);
        totalFromCompanies += tax;
        companiesTaxed++;
        companyDetails.push({ cid, name: c.name, funds, tax });
    }
    const totalCollected = totalFromUsers + totalFromCompanies;
    if (totalCollected > 0) {
        // send to state bank
        const stateUser = ensureUserRecord(data, STATE_BANK_USER_ID);
        stateUser.bank = (stateUser.bank||0) + totalCollected;
        // also via UnbelievaBoat if available
        try { await addToStateBank(totalCollected, `Weekly taxes ${new Date().toISOString().slice(0,10)}`); } catch {}
    }
    data.last_weekly_tax = new Date().toISOString();
    // log with per-entity details (for audit)
    const detailStr = `collected ${formatMoney(totalCollected)} from ${usersTaxed} users + ${companiesTaxed} companies (individual ${formatMoney(totalFromUsers)}, corporate ${formatMoney(totalFromCompanies)}) | users: ${userDetails.slice(0,10).map(u=>`${u.username} ${formatMoney(u.tax)}`).join(', ')}${userDetails.length>10?' …':''} | companies: ${companyDetails.slice(0,10).map(c=>`${c.name} ${formatMoney(c.tax)}`).join(', ')}${companyDetails.length>10?' …':''}`;
    logOwnerAction(data, 'SYSTEM', 'GOSBANK', 'weekly_taxes', detailStr);
    saveData(data);
    return { totalCollected, totalFromUsers, totalFromCompanies, usersTaxed, companiesTaxed, userDetails, companyDetails };
}
const DATA_FILE = path.join(__dirname, 'economy_data.json');
// GitHub sync — pushes economy_data.json to USSR-stock so Vercel/Pages show LIVE bot data (no mock)
const GITHUB_TOKEN = process.env.GITHUB_TOKEN;
const GITHUB_REPO = process.env.GITHUB_REPO || "HyawiiGithub/USSR-stock";
const GITHUB_BRANCH = process.env.GITHUB_BRANCH || "main";
const GITHUB_ECONOMY_PATH = process.env.GITHUB_ECONOMY_PATH || "economy_data.json";

// ============================================================
// SSR REGIONS - CLEAN EMOJIS
// ============================================================

const SSR_REGIONS = {
    "Russian SFSR": {
        "role_id": "665697828403806209",
        "work_zone": "1538704167890329621",
        "emoji": "🇷🇺",
        "resources": ["Coal", "Iron Ore", "Timber", "Oil", "Natural Gas", "Gold"]
    },
    "Byelorussian SSR": {
        "role_id": "666027277770817546",
        "work_zone": "1538703449095676016",
        "emoji": "🇧🇾",
        "resources": ["Timber", "Peat", "Wheat", "Flax"]
    },
    "Ukrainian SSR": {
        "role_id": "666026868201488424",
        "work_zone": "1538703449095676016",
        "emoji": "🇺🇦",
        "resources": ["Coal", "Iron Ore", "Wheat", "Sunflower", "Corn", "Salt"]
    },
    "Moldavian SSR": {
        "role_id": "666356420656234516",
        "work_zone": "1538703449095676016",
        "emoji": "🇲🇩",
        "resources": ["Wheat", "Corn", "Sunflower", "Grapes", "Wine"]
    },
    "Estonian SSR": {
        "role_id": "666356003826171904",
        "work_zone": "1538704231249354772",
        "emoji": "🇪🇪",
        "resources": ["Timber", "Phosphorite", "Peat", "Fish", "Oil Shale"]
    },
    "Latvian SSR": {
        "role_id": "666355999120031749",
        "work_zone": "1538704231249354772",
        "emoji": "🇱🇻",
        "resources": ["Timber", "Peat", "Limestone", "Wheat", "Fish"]
    },
    "Lithuanian SSR": {
        "role_id": "666355995764719626",
        "work_zone": "1538704231249354772",
        "emoji": "🇱🇹",
        "resources": ["Timber", "Peat", "Clay", "Limestone", "Flax", "Fish"]
    },
    "Georgian SSR": {
        "role_id": "666356425877880832",
        "work_zone": "1538703028524285962",
        "emoji": "🇬🇪",
        "resources": ["Manganese", "Copper", "Gold", "Grapes", "Tea", "Citrus", "Antimony"]
    },
    "Armenian SSR": {
        "role_id": "666356429652885587",
        "work_zone": "1538703028524285962",
        "emoji": "🇦🇲",
        "resources": ["Copper", "Gold", "Molybdenum", "Aluminium Ore"]
    },
    "Azerbaijanian SSR": {
        "role_id": "666356432417062922",
        "work_zone": "1538703028524285962",
        "emoji": "🇦🇿",
        "resources": ["Oil", "Natural Gas", "Iron Ore", "Cotton"]
    },
    "Kazakh SSR": {
        "role_id": "666379508022116366",
        "work_zone": "1538703181733695600",
        "emoji": "🇰🇿",
        "resources": ["Coal", "Iron Ore", "Copper", "Gold", "Uranium", "Oil", "Wheat"]
    },
    "Uzbek SSR": {
        "role_id": "666379512896028672",
        "work_zone": "1538703181733695600",
        "emoji": "🇺🇿",
        "resources": ["Gold", "Oil", "Copper", "Cotton", "Natural Gas", "Uranium"]
    },
    "Turkmen SSR": {
        "role_id": "666379517455106119",
        "work_zone": "1538703181733695600",
        "emoji": "🇹🇲",
        "resources": ["Oil", "Natural Gas", "Cotton", "Sulphur", "Sand"]
    },
    "Nuristani SSR": {
        "role_id": "666379522316304397",
        "work_zone": "1538704555670245448",
        "emoji": "🇹🇯",
        "resources": ["Aluminium Ore", "Lead", "Zinc", "Uranium", "Gold"]
    },
    "Kirghiz SSR": {
        "role_id": "666379534282522654",
        "work_zone": "1538703181733695600",
        "emoji": "🇰🇬",
        "resources": ["Gold", "Uranium", "Coal", "Iron Ore", "Timber"]
    }
};

// ============================================================
// WORK ZONES
// ============================================================

const WORK_ZONES = {
    "Russian Federal Republic Region": "1538704167890329621",
    "Western Soviet Region": "1538703449095676016",
    "Baltic Soviet Region": "1538704231249354772",
    "Caucasus Soviet Region": "1538703028524285962",
    "Central Asian Soviet Region": "1538703181733695600",
    "Nuristani Soviet Region": "1538704555670245448"
};

// ============================================================
// RESOURCE VALUES
// ============================================================

const RESOURCE_VALUES = {
    "Gold": 150, "Oil": 64, "Copper": 32, "Coal": 16,
    "Lead": 40, "Uranium": 320, "Cotton": 24, "Iron Ore": 24,
    "Timber": 13, "Wheat": 8, "Limestone": 16, "Clay": 8,
    "Sand": 5, "Sugar": 10, "Peat": 13,
    "Natural Gas": 48, "Manganese": 96, "Phosphorite": 40, "Aluminium Ore": 64, "Antimony": 128,
    "Molybdenum": 160, "Sunflower": 12, "Flax": 18,
    "Corn": 10, "Salt": 8, "Tea": 30, "Citrus": 20,
    "Grapes": 20, "Wine": 60, "Sulphur": 25, "Sulfur": 25, "Aluminium": 80,
    "Fish": 14,
    // Restored: these were removed but still held in inventories — keep value so holdings stay valuable + per-SSR spawn can use them
    "Potash": 56, "Oil Shale": 19, "Zinc": 38, "Amber": 75
};

// Gold was weight 90 (the HIGHEST in the game — wheat/timber are 25), which
// made it rain from every shift. It is now genuinely rare: most shifts yield
// common resources; gold is a lucky strike worth celebrating.
const RESOURCE_WEIGHTS = {
    "Gold": 2, "Oil": 15, "Copper": 8, "Coal": 20,
    "Lead": 7, "Uranium": 1, "Cotton": 20, "Iron Ore": 18,
    "Timber": 25, "Wheat": 25, "Limestone": 12, "Clay": 8,
    "Sand": 5, "Sugar": 20, "Peat": 10,
    "Natural Gas": 10, "Manganese": 4, "Phosphorite": 5, "Aluminium Ore": 3, "Antimony": 3,
    "Molybdenum": 2, "Sunflower": 15, "Flax": 10,
    "Corn": 12, "Salt": 8, "Tea": 5, "Citrus": 8,
    "Grapes": 12, "Wine": 8, "Sulphur": 3, "Sulfur": 3, "Aluminium": 5,
    "Fish": 22,
    "Potash": 6, "Oil Shale": 10, "Zinc": 7, "Amber": 2
};

// Sulfur alias: accept both spellings, canonical is Sulphur (British, as in SSR list)
function canonRes(name){
  if(!name) return name;
  const low=name.toLowerCase();
  if(low==="sulfur"||low==="sulphur") return "Sulphur";
  return name;
}

// Per-SSR spawn rates — if set, overrides global RESOURCE_WEIGHTS for that SSR only.
// Changing weight here does NOT affect other SSRs. Structure: { "Russian SFSR": { "Gold": 2, "Coal": 20, ... }, ... }
// Loaded from economy_data.json .ssr_resource_weights; if missing, falls back to global.
const DEFAULT_SSR_WEIGHTS = {}; // no overrides by default — all SSRs use global
const pendingTrades = new Map(); // in-memory pending trade requests (source must be approved by target)

function getResourceWeight(ssrName, resource, data) {
  resource=canonRes(resource);
    const perSSR = data && data.ssr_resource_weights && data.ssr_resource_weights[ssrName];
    let base = perSSR && perSSR[resource] !== undefined && perSSR[resource] !== null ? perSSR[resource] : (RESOURCE_WEIGHTS[resource] || 5);
    // gold rush 50% boost for Gold in that SSR
    const rush = getActiveGoldRush(data);
    if (rush && rush.ssr === ssrName && resource === "Gold") {
        base = Math.max(1, Math.floor(base * (rush.factor || 1.5)));
    }
    return base;
}
function getActiveGoldRush(data) {
    if (!data?.gold_rush) return null;
    try {
        if (Date.now() > new Date(data.gold_rush.expiresAt).getTime()) return null;
        return data.gold_rush;
    } catch { return null; }
}

// Compensation for removed resources — one-time payout when resource was delisted but holdings remained
const REMOVED_RESOURCE_COMPENSATION = {
    "Potash": 56,
    "Oil Shale": 19,
    "Zinc": 38,
    "Amber": 75
};

// Food system — without food, workers can't collect. Baltics (Fish) trade to inland SSRs.
const FOOD_VALUES = {
    "Fish": 2, "Wheat": 1, "Corn": 1, "Sunflower": 1, "Grapes": 1, "Tea": 1, "Citrus": 1,
    "Flour": 2, "Sugar": 1, "Bread": 3, "Cake": 3, "Wine": 2, "Canned Food": 4,
    "Canned Fish": 5, "Smoked Fish": 4, "Fish Stew": 5,
    // new food from formerly useless resources
    "Sunflower Oil": 1, "Corn Meal": 2, "Tea Pack": 1, "Citrus Juice": 2
};
const FOOD_PER_EMPLOYEE = 1; // per -collect cycle (6h) — was 2, halved for balance (was eating all food)
const FOOD_PER_SSR_POP = 0.2; // per SSR citizen (role count) — was 0.5, reduced; encourages trade but not starvation
const FOOD_WARNING_THRESHOLD = 2; // warn when stock low

// Player factories & specialization — companies choose one focus, trade drives cycle
const SPECIALIZATIONS = {
    extraction: { label: 'Extraction', emoji: '⛏️', desc: 'Mines & oil rigs +25% output', mines: ['Iron Mine','Coal Mine','Copper Mine','Gold Mine','Uranium Mine','Oil Rig'], factories: [] },
    agriculture: { label: 'Agriculture', emoji: '🌾', desc: 'Farms & timber +25%', mines: ['Farm','Timber Camp'], factories: [] },
    production: { label: 'Production', emoji: '🏭', desc: 'Factories +25% & +15% sale price (player factories)', mines: [], factories: ['Steel Mill','Machine Shop','Refinery','Nuclear Processing','Electronics Factory','Bakery','Winery','Store'] }
};
const SPECIALIZATION_BONUS = 1.25;
const SPECIALIZATION_PENALTY = 0.85; // off-spec buildings produce 15% less
const SPECIALIZATION_SALE_BONUS = 1.15; // production corps get +15% when selling crafted goods to player factories/state

// ============================================================
// CRAFTING RECIPES - CLEAN EMOJIS
// ============================================================

const CRAFTING_RECIPES = {
    // Tuned down: 10 planks was 1.2k (too high) — now raw_cost×1.28+10 => ~28% profit, raw still tiny
    "Iron Ingot": {"ingredients": {"Iron Ore": 3, "Coal": 2}, "value": 143, "emoji": "🔩"},
    "Steel Ingot": {"ingredients": {"Iron Ingot": 2, "Coal": 3}, "value": 337, "emoji": "⚙️"},
    "Copper Ingot": {"ingredients": {"Copper": 3, "Coal": 2}, "value": 173, "emoji": "🟠"},
    "Gold Bar": {"ingredients": {"Gold": 3}, "value": 586, "emoji": "🥇"},
    "Aluminium Ingot": {"ingredients": {"Aluminium Ore": 3, "Coal": 2}, "value": 296, "emoji": "🔘"},
    "Timber Planks": {"ingredients": {"Timber": 3}, "value": 45, "emoji": "🪵"},
    "Bricks": {"ingredients": {"Clay": 3, "Coal": 2}, "value": 81, "emoji": "🧱"},
    "Concrete": {"ingredients": {"Limestone": 4, "Sand": 2}, "value": 104, "emoji": "🏗️"},
    "Glass": {"ingredients": {"Limestone": 3, "Coal": 2}, "value": 112, "emoji": "🪟"},
    "Steel Beam": {"ingredients": {"Steel Ingot": 4}, "value": 1320, "emoji": "📏"},
    "Machine Parts": {"ingredients": {"Iron Ingot": 3, "Steel Ingot": 2}, "value": 1064, "emoji": "🔧"},
    "Fuel": {"ingredients": {"Oil": 3}, "value": 255, "emoji": "⛽"},
    "Refined Fuel": {"ingredients": {"Fuel": 2}, "value": 501, "emoji": "🔥"},
    "Uranium Rod": {"ingredients": {"Uranium": 3, "Lead": 2}, "value": 1341, "emoji": "☢️"},
    "Reactor Core": {"ingredients": {"Uranium Rod": 2, "Steel Beam": 3, "Machine Parts": 2}, "value": 8714, "emoji": "⚛️"},
    "Circuit Board": {"ingredients": {"Copper Ingot": 3, "Lead": 2}, "value": 603, "emoji": "💻"},
    "Flour": {"ingredients": {"Wheat": 3}, "value": 40, "emoji": "🌾"},
    "Sugar": {"ingredients": {"Sugar": 2}, "value": 22, "emoji": "🍬"},
    "Bread": {"ingredients": {"Flour": 2, "Sugar": 1}, "value": 84, "emoji": "🍞"},
    "Cake": {"ingredients": {"Flour": 3, "Sugar": 3, "Wheat": 2}, "value": 161, "emoji": "🎂"},
    "Wine": {"ingredients": {"Grapes": 4}, "value": 86, "emoji": "🍷"},
    "Canned Food": {"ingredients": {"Wheat": 3, "Iron Ore": 2}, "value": 102, "emoji": "🥫"},
    "Canned Fish": {"ingredients": {"Fish": 2, "Iron Ore": 2}, "value": 107, "emoji": "🐟"},
    "Smoked Fish": {"ingredients": {"Fish": 2, "Coal": 2}, "value": 86, "emoji": "🔥🐟"},
    "Fish Stew": {"ingredients": {"Fish": 2, "Wheat": 2, "Salt": 1}, "value": 76, "emoji": "🍲"},
    "Peat Fuel": {"ingredients": {"Peat": 4, "Coal": 1}, "value": 97, "emoji": "🔥"},
    "Shale Oil": {"ingredients": {"Oil Shale": 4}, "value": 80, "emoji": "🪨"},
    "Gas Fuel": {"ingredients": {"Natural Gas": 3}, "value": 194, "emoji": "⛽"},
    "Fertilizer": {"ingredients": {"Phosphorite": 2, "Peat": 2, "Sulphur": 1}, "value": 177, "emoji": "🧪"},
    "Cotton Fabric": {"ingredients": {"Cotton": 3}, "value": 102, "emoji": "🧵"},
    "Manganese Alloy": {"ingredients": {"Manganese": 2, "Iron Ingot": 1, "Coal": 1}, "value": 409, "emoji": "⚙️"},
    "Sunflower Oil": {"ingredients": {"Sunflower": 3}, "value": 56, "emoji": "🌻"},
    "Linen": {"ingredients": {"Flax": 3}, "value": 79, "emoji": "🧶"},
    "Corn Meal": {"ingredients": {"Corn": 3}, "value": 48, "emoji": "🌽"},
    "Tea Pack": {"ingredients": {"Tea": 2, "Sugar": 1}, "value": 99, "emoji": "🍵"},
    "Citrus Juice": {"ingredients": {"Citrus": 3, "Sugar": 1}, "value": 99, "emoji": "🍊"},
    "Antimony Alloy": {"ingredients": {"Antimony": 2, "Lead": 2}, "value": 440, "emoji": "🔩"},
    "Molybdenum Rod": {"ingredients": {"Molybdenum": 2, "Steel Ingot": 1}, "value": 747, "emoji": "🔬"},
    "Aluminium Sheet": {"ingredients": {"Aluminium": 2, "Coal": 1}, "value": 235, "emoji": "📄"}
};

// ============================================================
// BUILDING DEFINITIONS - CLEAN EMOJIS
// ============================================================

const MINES = {
    "Iron Mine": {"cost": 15000, "upgrade_mult": 2.0, "emoji": "⛏️", "produces": ["Iron Ore"], "rate": 5, "max_level": 10},
    "Coal Mine": {"cost": 12000, "upgrade_mult": 2.0, "emoji": "🪨", "produces": ["Coal"], "rate": 6, "max_level": 10},
    "Copper Mine": {"cost": 18000, "upgrade_mult": 2.0, "emoji": "🟫", "produces": ["Copper"], "rate": 5, "max_level": 10},
    "Gold Mine": {"cost": 50000, "upgrade_mult": 2.5, "emoji": "💎", "produces": ["Gold"], "rate": 2, "max_level": 8, "rare": true},
    "Uranium Mine": {"cost": 60000, "upgrade_mult": 2.5, "emoji": "☢️", "produces": ["Uranium"], "rate": 2, "max_level": 8, "rare": true},
    "Oil Rig": {"cost": 45000, "upgrade_mult": 2.0, "emoji": "🛢️", "produces": ["Oil", "Natural Gas"], "rate": 5, "max_level": 10},
    "Timber Camp": {"cost": 10000, "upgrade_mult": 1.8, "emoji": "🌲", "produces": ["Timber"], "rate": 6, "max_level": 10},
    "Farm": {"cost": 12000, "upgrade_mult": 1.8, "emoji": "🌾", "produces": ["Wheat", "Sugar"], "rate": 6, "max_level": 10},
    "Sulfur Mine": {"cost": 14000, "upgrade_mult": 2.0, "emoji": "🟡", "produces": ["Sulphur"], "rate": 4, "max_level": 10}
};

const FACTORIES = {
    "Steel Mill": {"cost": 50000, "upgrade_mult": 2.0, "emoji": "🏭", "produces": ["Steel Ingot"], "requires": {"Iron Ore": 2, "Coal": 3}, "rate": 4, "max_level": 10},
    "Machine Shop": {"cost": 45000, "upgrade_mult": 2.0, "emoji": "🔩", "produces": ["Machine Parts"], "requires": {"Steel Ingot": 2, "Iron Ore": 3}, "rate": 4, "max_level": 10},
    "Refinery": {"cost": 55000, "upgrade_mult": 2.0, "emoji": "🛢️", "produces": ["Fuel"], "requires": {"Oil": 3}, "rate": 4, "max_level": 10},
    "Nuclear Processing": {"cost": 100000, "upgrade_mult": 2.5, "emoji": "⚛️", "produces": ["Uranium Rod"], "requires": {"Uranium": 2, "Lead": 2}, "rate": 3, "max_level": 8},
    "Electronics Factory": {"cost": 60000, "upgrade_mult": 2.0, "emoji": "💻", "produces": ["Circuit Board"], "requires": {"Copper Ingot": 3, "Lead": 2}, "rate": 4, "max_level": 10},
    "Bakery": {"cost": 30000, "upgrade_mult": 1.8, "emoji": "🍞", "produces": ["Bread", "Cake"], "requires": {"Wheat": 3, "Sugar": 2}, "rate": 5, "max_level": 10},
    "Winery": {"cost": 35000, "upgrade_mult": 1.8, "emoji": "🍷", "produces": ["Wine"], "requires": {"Grapes": 4}, "rate": 4, "max_level": 10},
    "Nuclear Reactor": {"cost": 180000, "upgrade_mult": 2.4, "emoji": "☢️", "produces": ["Power"], "requires": {"Uranium Rod": 2, "Steel Beam": 2}, "rate": 1, "max_level": 5, "power": 10, "desc": "Provides 10 power; factories need power — without it, factories run at 70%"},
    "Buildslot": {"cost": 75000, "upgrade_mult": 1.8, "emoji": "🏗️", "produces": [], "rate": 0, "max_level": 10, "desc": "Fake build — adds +1 slot for chosen building (extra Farm/Mine/etc)"}
};

const STORE = {"cost": 25000, "upgrade_mult": 1.5, "emoji": "🏪", "rate": 3, "max_level": 10};

const FACTORY_NAMES = [
    "Red Star Steelworks", "Soviet Iron Foundry", "Lenin Machine Works",
    "Stalin Tractor Plant", "Khrushchev Agricultural", "Brezhnev Auto Factory",
    "Siberian Mining Co", "Ural Heavy Industries", "Volga Shipbuilding"
];

const RANDOM_EVENTS = [
    {"name": "Economic Boom", "impact": 0.05, "emoji": "📈"},
    {"name": "Recession", "impact": -0.04, "emoji": "📉"},
    {"name": "Market Rally", "impact": 0.03, "emoji": "📊"},
    {"name": "Market Crash", "impact": -0.08, "emoji": "💥"},
    {"name": "Good Harvest", "impact": 0.04, "emoji": "🌾"},
    {"name": "Drought", "impact": -0.05, "emoji": "☀️"},
    {"name": "Tech Breakthrough", "impact": 0.07, "emoji": "💡"},
    {"name": "Oil Discovery", "impact": 0.06, "emoji": "🛢️"},
    {"name": "Oil Crisis", "impact": -0.07, "emoji": "⛽"},
    {"name": "Peace Treaty", "impact": 0.06, "emoji": "🕊️"},
    {"name": "Political Crisis", "impact": -0.05, "emoji": "🏛️"},
    {"name": "Global Recovery", "impact": 0.04, "emoji": "🌍"},
    {"name": "Global Recession", "impact": -0.06, "emoji": "🌎"},
    {"name": "Siberian Winter", "impact": -0.05, "emoji": "❄️"},
    {"name": "Five-Year Plan Success", "impact": 0.08, "emoji": "⭐"},
    {"name": "Grain Embargo", "impact": -0.06, "emoji": "🌾"},
    {"name": "Black Market Raid", "impact": -0.04, "emoji": "🚔"},
    {"name": "Siberian Pipeline Burst", "impact": -0.07, "emoji": "💥"},
    {"name": "Baltic Storm", "impact": -0.03, "emoji": "🌊"},
    {"name": "Caucasus Conflict", "impact": -0.06, "emoji": "⚔️"},
    {"name": "Arctic Convoy", "impact": 0.05, "emoji": "🚢"},
    {"name": "Chernobyl Incident", "impact": -0.09, "emoji": "☢️"},
    {"name": "Sputnik Launch", "impact": 0.07, "emoji": "🚀"}
];

const COLLECT_EVENTS = [
    {"name": "Good Harvest", "multiplier": 1.5, "emoji": "🌾"},
    {"name": "Bad Harvest", "multiplier": 0.5, "emoji": "🌾"},
    {"name": "Worker Strike", "multiplier": 0.3, "emoji": "✊"},
    {"name": "Tech Breakthrough", "multiplier": 2.0, "emoji": "💡"},
    {"name": "Resource Surplus", "multiplier": 1.8, "emoji": "📦"},
    {"name": "Normal Day", "multiplier": 1.0, "emoji": "📅"},
    {"name": "Government Subsidy", "multiplier": 2.5, "emoji": "🏛️"},
    {"name": "Harvest Festival", "multiplier": 1.6, "emoji": "🎉"},
    {"name": "Factory Fire", "multiplier": 0.4, "emoji": "🔥"},
    {"name": "Trade Union Deal", "multiplier": 1.7, "emoji": "🤝"},
    {"name": "Power Outage", "multiplier": 0.5, "emoji": "💡"},
    {"name": "Export Boom", "multiplier": 2.2, "emoji": "📦"}
];

// ============================================================
// DATA FUNCTIONS
// ============================================================

function defaultData() {
    return {
        "users": {},
        "companies": {},
        "gsi_history": [{"price": 100, "change_percent": 0, "recorded_at": new Date().toISOString()}],
        "factory_names": [...FACTORY_NAMES],
        "used_factory_names": [],
        "inflation": 0.0,
        "money_printed": 0,
        "total_bank_reserves": 0,
        "inflation_history": [],
        "company_id_counter": 0,
        "state_companies": [],
        "state_directors": {},
        "transaction_log": [],
        "market_demand": {},
        "market_last_sale": {},
        "last_govcontract": null,
        "ai_store": {},
        "global_consumption": {},
        "consumption_history": [],
        "demand_history": {},
        "blacklist": {},
        "bot_owners": [BOT_OWNER_ID, BOT_OWNER_2_ID],
        "ssr_resource_weights": {}, // per-SSR overrides: { "Russian SFSR": { "Gold": 2 }, ... }
        "compensation_log": [], // one-time compensation for removed resources
        "trade_schedules": [], // recurring trades: {id, fromCompanyId, toCompanyId, item, qty, interval: 'hourly'|'daily'|'weekly', nextAt, createdBy}
        "owner_logs": [], // audit: {at, by, username, action, details}
        "total_rubles_history": [], // 100 pts: total rubles of all citizens (cash+bank) even those with 0
        "gold_rush": null, // {ssr, factor, expiresAt, startedBy, startedAt, durationHours, percent} — configurable 24-48h, 25-100% gold boost
        "five_year_plan": {
            startAt: new Date().toISOString(),
            endAt: new Date(Date.now() + 5*24*3600*1000).toISOString(), // 5 days for game (represents 5 years)
            targets: {
                circulation: 600000, // total rubles in circulation
                goldBacking: 60, // % gold backing
                production: 3000, // total inventory units
                gsi: 150, // GSI index
                growth: 10 // % growth vs plan start (overall economy growth)
            },
            announced: false,
            startValues: null, // set on creation: {circulation, goldBacking, production, gsi}
            rewards: { bonus: "Shock workers honoured + 10% production boost if fulfilled" }
        }
    };
}

function loadData() {
    try {
        if (fs.existsSync(DATA_FILE)) {
            const data = JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'));
            const defaults = defaultData();
            for (const key in defaults) {
                if (!(key in data)) data[key] = defaults[key];
            }
            return data;
        }
        return defaultData();
    } catch (err) {
        console.error('Error loading data:', err);
        return defaultData();
    }
}

function saveData(data) {
    try {
        fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2), 'utf8');
        scheduleGithubPush("saveData");
    } catch (err) {
        console.error('Error saving data:', err);
    }
}
// ——— GitHub sync ———
let _lastGithubPush = 0;
let _githubPushTimer = null;
async function pushEconomyToGitHub(reason="auto") {
    if (!GITHUB_TOKEN) return;
    if (!fs.existsSync(DATA_FILE)) return;
    const now = Date.now();
    if (now - _lastGithubPush < 45000 && reason !== "force") { // debounce 45s
        if (_githubPushTimer) return;
        _githubPushTimer = setTimeout(()=>{ _githubPushTimer=null; pushEconomyToGitHub("debounced"); }, 50000);
        return;
    }
    _lastGithubPush = now;
    try {
        const content = fs.readFileSync(DATA_FILE, 'utf8');
        const b64 = Buffer.from(content, 'utf8').toString('base64');
        const apiUrl = `https://api.github.com/repos/${GITHUB_REPO}/contents/${encodeURIComponent(GITHUB_ECONOMY_PATH)}`;
        // get current sha if exists
        let sha = null;
        try {
            const get = await axios.get(apiUrl + `?ref=${GITHUB_BRANCH}`, { headers: { Authorization: `Bearer ${GITHUB_TOKEN}`, Accept: "application/vnd.github+json" } });
            sha = get.data.sha;
            // skip if identical
            if (get.data.content && get.data.content.replace(/\n/g,'') === b64.replace(/\n/g,'')) {
                console.log(`[github] economy_data.json unchanged — skip push (${reason})`);
                return;
            }
        } catch (e) { if (e.response && e.response.status !== 404) throw e; }
        const put = await axios.put(apiUrl, {
            message: `chore: sync economy_data.json — ${reason} ${new Date().toISOString()}`,
            content: b64,
            branch: GITHUB_BRANCH,
            sha: sha || undefined
        }, { headers: { Authorization: `Bearer ${GITHUB_TOKEN}`, Accept: "application/vnd.github+json" } });
        console.log(`[github] pushed economy_data.json ${put.data.commit.sha.slice(0,7)} (${reason})`);
    } catch (err) {
        console.error("[github] push failed:", err.response ? `${err.response.status} ${JSON.stringify(err.response.data).slice(0,400)}` : err.message);
    }
}
function scheduleGithubPush(reason="saveData") { if (!GITHUB_TOKEN) return; pushEconomyToGitHub(reason).catch(()=>{}); }

function getUser(userId) {
    const data = loadData();
    if (!data.users[userId]) {
        data.users[userId] = {
            "cash": 0, "bank": 0, "resources": {}, "inventory": {},
            "company_id": null, "gsi_shares": 0, "share_holdings": {},
            "last_work": null, "work_count": 0, "last_claim": null,
            "ssr_region": null, "employed_at": null, "is_employed": false,
            "is_state_director": false, "director_of": null,
            "ceo_of": null
        };
        saveData(data);
    }
    return data.users[userId];
}

function saveUser(userId, userData) {
    const data = loadData();
    data.users[userId] = userData;
    saveData(data);
}

function formatMoney(amount) {
    return `₽${amount.toLocaleString()}`;
}

// ============================================================
// SSR HELPER FUNCTIONS
// ============================================================

function getSSRFromRole(roleId) {
    for (const [ssrName, ssrData] of Object.entries(SSR_REGIONS)) {
        if (ssrData.role_id === roleId) {
            return ssrName;
        }
    }
    return null;
}

function getSSRFromChannel(channelId) {
    for (const [ssrName, ssrData] of Object.entries(SSR_REGIONS)) {
        if (ssrData.work_zone === channelId) {
            return ssrName;
        }
    }
    return null;
}

function getWorkZoneFromSSR(ssrName) {
    if (SSR_REGIONS[ssrName]) {
        return SSR_REGIONS[ssrName].work_zone;
    }
    return null;
}

function isWorkChannel(channelId) {
    for (const [ssrName, ssrData] of Object.entries(SSR_REGIONS)) {
        if (ssrData.work_zone === channelId) {
            return true;
        }
    }
    return false;
}

function isBotOwner(userId) {
    try {
        const d = loadData();
        if (Array.isArray(d.bot_owners) && d.bot_owners.includes(userId)) return true;
    } catch {}
    return userId === BOT_OWNER_ID || userId === BOT_OWNER_2_ID;
}
function isPrimaryOwner(userId) {
    return userId === BOT_OWNER_ID || userId === BOT_OWNER_2_ID;
}
function isCoPrimary(userId) { return userId === BOT_OWNER_2_ID; }

function logOwnerAction(data, userId, username, action, details) {
    if (!data.owner_logs) data.owner_logs = [];
    data.owner_logs.push({
        at: new Date().toISOString(),
        by: userId,
        username: username || userId.slice(0,6),
        action,
        details: details || ""
    });
    if (data.owner_logs.length > 500) data.owner_logs = data.owner_logs.slice(-500);
}

function isGlobe(userId) {
    return userId === GLOBE_USER_ID;
}

function isResourceNative(ssrName, resource) {
    const list = SSR_REGIONS[ssrName]?.resources || [];
    return list.includes(resource);
}

function getInflation() {
    const data = loadData();
    return data.inflation || 0;
}

function getInflationMultiplier() {
    return 1 + (getInflation() / 100);
}

// ============================================================
// GOLD STANDARD SYSTEM
// The ruble's credibility is measured by how much circulating gold backs
// the money supply. The official gold price floats with inflation so the
// peg erodes if the state prints recklessly.
// ============================================================

const GOLD_BAR_GOLD_EQUIVALENT = 3; // one Gold Bar = 3 units of raw gold

/** Official ruble price of one unit of gold (floats with inflation). */
function getGoldPrice() {
    return Math.max(1, Math.floor(RESOURCE_VALUES.Gold * getInflationMultiplier()));
}

/** Total gold in existence: citizen pockets + company vaults + bars (as raw-gold equivalent). */
function getGoldStock(data) {
    let stock = 0;
    for (const u of Object.values(data.users || {})) {
        stock += u.resources?.Gold || 0;
        stock += (u.inventory?.["Gold Bar"] || 0) * GOLD_BAR_GOLD_EQUIVALENT;
    }
    for (const c of Object.values(data.companies || {})) {
        stock += c.inventory?.Gold || 0;
        stock += (c.inventory?.["Gold Bar"] || 0) * GOLD_BAR_GOLD_EQUIVALENT;
    }
    return Math.floor(stock);
}

/** Broad money supply: all cash + bank deposits + state bank + company funds. */
function getMoneySupply(data) {
    let total = 0;
    for (const u of Object.values(data.users || {})) {
        total += u.cash || 0;
        total += u.bank || 0;
    }
    for (const c of Object.values(data.companies || {})) {
        total += c.funds || 0;
    }
    return Math.max(1, total);
}

/** Percentage of the money supply coverable by gold at the official price. */
function getGoldBackingRatio(data) {
    const goldValue = getGoldStock(data) * getGoldPrice();
    return (goldValue / getMoneySupply(data)) * 100;
}

function getGoldStandardStatus(ratio) {
    if (ratio >= 100) return { label: "FULL GOLD STANDARD", color: 0x4a8a68, note: "Every ruble in circulation is covered by gold." };
    if (ratio >= 50) return { label: "PARTIAL GOLD BACKING", color: 0xb8974a, note: "The ruble is majority gold-backed, but printing is outpacing bullion." };
    if (ratio >= 20) return { label: "WEAK BACKING", color: 0xd4b05c, note: "Warning: the ruble is drifting towards fiat money." };
    return { label: "FIAT CURRENCY", color: 0xb84545, note: "The ruble has effectively abandoned the gold standard." };
}

// Total rubles in circulation — sum of all citizens cash+bank (even those with 0, they are 0), includes state bank
function getTotalRubles(data) {
    let total = 0;
    for (const u of Object.values(data.users || {})) {
        total += (u.cash || 0) + (u.bank || 0);
    }
    return total;
}
function updateTotalRublesHistory(data) {
    if (!data.total_rubles_history) data.total_rubles_history = [];
    const total = getTotalRubles(data);
    const last = data.total_rubles_history[data.total_rubles_history.length-1];
    // push if changed significantly or time passed (avoid spam if same value within 5 min we still push every interval)
    data.total_rubles_history.push({ total, at: new Date().toISOString() });
    if (data.total_rubles_history.length > 100) data.total_rubles_history = data.total_rubles_history.slice(-100);
    return total;
}
function getTotalProduction(data) {
    let total = 0;
    for (const c of Object.values(data.companies||{})) {
        for (const qty of Object.values(c.inventory||{})) total += qty;
    }
    return total;
}
function getFiveYearPlanProgress(data) {
    const plan = data.five_year_plan;
    if (!plan || !plan.targets) return null;
    const totalRubles = getTotalRubles(data);
    const goldBacking = getGoldBackingRatio(data);
    const production = getTotalProduction(data);
    const gsi = getGSIPrice ? getGSIPrice() : (data.gsi_history?.[data.gsi_history.length-1]?.price||100);
    const targets = plan.targets;
    const start = plan.startValues || { circulation: totalRubles, goldBacking, production, gsi };
    // growth % vs start (overall economy growth)
    const growthCurrent = start.circulation ? ((totalRubles - start.circulation)/start.circulation*100) : 0;
    const growthTarget = targets.growth ?? 10;
    const growthPct = Math.min(120, Math.round(growthCurrent/growthTarget*100));
    const progress = {
        circulation: { current: totalRubles, target: targets.circulation, pct: Math.min(120, Math.round(totalRubles/targets.circulation*100)) },
        goldBacking: { current: goldBacking, target: targets.goldBacking, pct: Math.min(120, Math.round(goldBacking/targets.goldBacking*100)) },
        production: { current: production, target: targets.production, pct: Math.min(120, Math.round(production/targets.production*100)) },
        gsi: { current: gsi, target: targets.gsi, pct: Math.min(120, Math.round(gsi/targets.gsi*100)) },
        growth: { current: growthCurrent, target: growthTarget, pct: growthPct },
    };
    const overall = Math.round((progress.circulation.pct + progress.goldBacking.pct + progress.production.pct + progress.gsi.pct + progress.growth.pct)/5);
    return { progress, overall, plan };
}
function payCompanySalaries(data, companyId) {
    const company = data.companies[companyId];
    if (!company || !company.salary_config) return { paid: [], totalPaid: 0 };
    const cfg = company.salary_config;
    let totalPaid = 0;
    const paid = [];
    const fundsBefore = company.funds || 0;
    if (fundsBefore <= 0) return { paid, totalPaid };
    // CEO
    if (cfg.ceo > 0) {
        const ceoId = company.owner_id && !company.is_state_owned ? company.owner_id : (company.director_id || null);
        if (ceoId) {
            const amt = Math.floor(fundsBefore * cfg.ceo / 100);
            if (amt > 0 && company.funds >= amt) {
                const u = ensureUserRecord(data, ceoId);
                u.cash = (u.cash||0) + amt;
                company.funds -= amt;
                totalPaid += amt;
                paid.push({ role: 'ceo', userId: ceoId, amount: amt });
            }
        }
    }
    // Director (state only, if different from CEO)
    if (cfg.director > 0 && company.is_state_owned && company.director_id) {
        const amt = Math.floor(fundsBefore * cfg.director / 100);
        if (amt > 0 && company.funds >= amt) {
            const u = ensureUserRecord(data, company.director_id);
            u.cash = (u.cash||0) + amt;
            company.funds -= amt;
            totalPaid += amt;
            paid.push({ role: 'director', userId: company.director_id, amount: amt });
        }
    }
    // Managers
    if (cfg.manager > 0 && Array.isArray(company.managers) && company.managers.length) {
        for (const mid of company.managers) {
            const amt = Math.floor(fundsBefore * cfg.manager / 100);
            if (amt > 0 && company.funds >= amt) {
                const u = ensureUserRecord(data, mid);
                u.cash = (u.cash||0) + amt;
                company.funds -= amt;
                totalPaid += amt;
                paid.push({ role: 'manager', userId: mid, amount: amt });
            }
        }
    }
    return { paid, totalPaid };
}

function calculateCompanyValue(company) {
    if (!company) return 1;
    let total = (company.funds || 0);
    for (const [bName, bData] of Object.entries(company.buildings || {})) {
        if (MINES[bName]) total += MINES[bName].cost * (bData.level || 1);
        else if (FACTORIES[bName]) total += FACTORIES[bName].cost * (bData.level || 1);
        else if (bName === "Store") total += STORE.cost * (bData.level || 1);
    }
    for (const [item, qty] of Object.entries(company.inventory || {})) {
        if (CRAFTING_RECIPES[item]) total += qty * CRAFTING_RECIPES[item].value;
        else if (RESOURCE_VALUES[item]) total += qty * RESOURCE_VALUES[item];
    }
    return Math.max(1, total);
}

function calculateSharePrice(company) {
    if (!company) return 1;
    const total = calculateCompanyValue(company);
    const shares = company.shares_total || 1;
    return Math.max(1, Math.floor((total / shares) * getInflationMultiplier()));
}

function updateCompanyPrice(companyId) {
    const data = loadData();
    if (!data.companies[companyId]) return;
    const company = data.companies[companyId];
    const newPrice = calculateSharePrice(company);
    company.share_price = newPrice;
    company.market_cap = newPrice * (company.shares_total || 1);
    if (!company.price_history) company.price_history = [];
    company.price_history.push(newPrice);
    if (company.price_history.length > 100) company.price_history = company.price_history.slice(-100);
    data.companies[companyId] = company;
    saveData(data);
    return newPrice;
}

function getRandomFactoryName() {
    const data = loadData();
    if (!data.factory_names || data.factory_names.length === 0) {
        data.factory_names = [...FACTORY_NAMES];
        data.used_factory_names = [];
    }
    const name = data.factory_names[Math.floor(Math.random() * data.factory_names.length)];
    data.factory_names = data.factory_names.filter(n => n !== name);
    if (!data.used_factory_names) data.used_factory_names = [];
    data.used_factory_names.push(name);
    saveData(data);
    return name;
}

function getCollectEvent() {
    return COLLECT_EVENTS[Math.floor(Math.random() * COLLECT_EVENTS.length)];
}

function getGSIPrice() {
    const data = loadData();
    if (data.gsi_history && data.gsi_history.length > 0) {
        return data.gsi_history[data.gsi_history.length - 1].price;
    }
    return 100;
}

function updateGSI(eventImpact = 0) {
    const data = loadData();
    const current = getGSIPrice();
    // Work activity boost: recent work in last hour pushes GSI up (0.1% per 10 works)
    let workBoost = 0;
    try {
        const hourAgo = Date.now() - 3600000;
        let recentWorks = 0;
        for (const u of Object.values(data.users || {})) {
            if (u.last_work && new Date(u.last_work).getTime() > hourAgo) recentWorks++;
        }
        // also count total work_count delta? use recentWorks
        workBoost = Math.min(0.01, recentWorks * 0.0005); // max 1% per 5min if 20+ workers active
    } catch {}
    // Reduced volatility 1.5%→0.5% + work boost + inflation bias, with mean reversion to 100
    const reversion = (100 - current) * 0.0005; // pulls slowly to 100
    const change = (Math.random() * 2 - 1) * 0.005 + eventImpact + (getInflation() / 2000) + workBoost + reversion;
    const newPrice = Math.max(10, Math.floor(current * (1 + change)));
    data.gsi_history.push({
        "price": newPrice,
        "change_percent": change * 100,
        "recorded_at": new Date().toISOString()
    });
    if (data.gsi_history.length > 100) data.gsi_history = data.gsi_history.slice(-100);
    saveData(data);
    return newPrice;
}

function getCompanyCollectCooldown(companyId) {
    const data = loadData();
    const company = data.companies[companyId];
    if (!company || !company.last_collect) return 0;
    const elapsed = (Date.now() - new Date(company.last_collect).getTime()) / 1000;
    return Math.max(0, COLLECT_COOLDOWN_HOURS * 3600 - elapsed);
}

// ============================================================
// MARKET / DEMAND & SUPPLY HELPERS — factory AI + gov contracts
// ============================================================

function getMarketSupply(data, item) {
    let total = 0;
    for (const c of Object.values(data.companies || {})) {
        total += (c.inventory?.[item] || 0);
    }
    // also count personal inventories as latent supply (players could transfer)
    for (const u of Object.values(data.users || {})) {
        total += (u.inventory?.[item] || 0);
    }
    return total;
}

function getSupplyFactor(data, item) {
    const supply = getMarketSupply(data, item);
    // 0 supply -> 1.35x, 40 -> 1.0x, 100+ -> ~0.65x. Clamped 0.6-1.4
    const factor = 1.2 - (Math.min(supply, 120) / 120) * 0.4;
    return Math.max(0.8, Math.min(1.2, factor));
}

function getBalancedDemandTarget(data, item) {
    const totalEmployed = Object.values(data.users || {}).filter(u => u.is_employed).length || 1;
    const supply = getMarketSupply(data, item);
    const idealSupply = totalEmployed * 2.5; // 2.5 units per employed ideal — tunable balanced point
    const ratio = supply / Math.max(1, idealSupply);
    // ratio 0 => scarcity => 1.4, ratio 1 => 1.0, ratio 2+ => 0.6
    let target = 1.4 - Math.min(ratio, 2.0) * 0.4;
    return Math.max(0.6, Math.min(1.4, target));
}

function getDemandFactor(data, item) {
    if (!data.market_demand) data.market_demand = {};
    const v = data.market_demand[item];
    if (typeof v === 'number') return v;
    // no history → balanced target based on employed vs supply (not always 100%)
    return getBalancedDemandTarget(data, item);
}

function updateDemandAfterSale(data, item, qty, isGov) {
    if (!data.market_demand) data.market_demand = {};
    if (!data.market_last_sale) data.market_last_sale = {};
    const current = getDemandFactor(data, item);
    const drop = (isGov ? 0.07 : 0.045) * Math.max(1, qty / 2);
    const next = Math.max(0.6, Math.min(1.5, current - drop));
    data.market_demand[item] = next;
    data.market_last_sale[item] = new Date().toISOString();
    // slight sympathetic demand increase for other goods (scarcity spillover)
    for (const k of Object.keys(data.market_demand)) {
        if (k !== item && Math.random() < 0.15) {
            data.market_demand[k] = Math.min(1.5, data.market_demand[k] + 0.01);
        }
    }
}

function recoverMarketDemand(data) {
    if (!data.market_demand) return false;
    let changed = false;
    const now = Date.now();
    // ensure every crafted item has an entry so graph shows balanced values even without sales
    for (const k of Object.keys(CRAFTING_RECIPES)) {
        if (data.market_demand[k] === undefined) {
            data.market_demand[k] = getBalancedDemandTarget(data, k);
            changed = true;
        }
    }
    for (const [item, val] of Object.entries(data.market_demand)) {
        const lastSale = data.market_last_sale?.[item] ? new Date(data.market_last_sale[item]).getTime() : now - 3600000;
        const hoursSince = (now - lastSale) / 3600000;
        // recover toward BALANCED target (employed vs supply) — not fixed 1.0, so demand stays balanced
        const target = getBalancedDemandTarget(data, item);
        const diff = target - val;
        if (Math.abs(diff) < 0.005) continue;
        const recovered = val + diff * Math.min(0.25, hoursSince * 0.08);
        const next = Math.max(0.6, Math.min(1.5, recovered));
        if (Math.abs(next - val) > 0.001) {
            data.market_demand[item] = next;
            changed = true;
        }
    }
    return changed;
}

function getCooldownRemaining(lastIso, cooldownSecs) {
    if (!lastIso) return 0;
    const elapsed = (Date.now() - new Date(lastIso).getTime()) / 1000;
    return Math.max(0, cooldownSecs - elapsed);
}

function formatCooldown(secs) {
    const s = Math.ceil(secs);
    const h = Math.floor(s / 3600);
    const m = Math.floor((s % 3600) / 60);
    const rem = s % 60;
    if (h > 0) return `${h}h ${m}m`;
    if (m > 0) return `${m}m ${rem}s`;
    return `${rem}s`;
}

function isGoldItem(item) {
    return item === 'Gold' || item === 'Gold Bar';
}

function canSellGold(data) {
    // Gold sales only allowed when ruble is fully backed (100%+)
    return getGoldBackingRatio(data) >= 100;
}

function addToAIStore(data, item, qty) {
    if (!data.ai_store) data.ai_store = {};
    data.ai_store[item] = (data.ai_store[item] || 0) + qty;
}

function getAIStoreText(data, limit = 10) {
    const store = data.ai_store || {};
    const entries = Object.entries(store).filter(([, qty]) => qty > 0);
    if (entries.length === 0) return 'Store is empty — waiting for factory goods.';
    entries.sort((a, b) => b[1] - a[1]);
    return entries.slice(0, limit).map(([item, qty]) => `• ${item} x${qty}`).join('\n');
}

function recordConsumption(data, item, qty) {
    if (!data.global_consumption) data.global_consumption = {};
    data.global_consumption[item] = (data.global_consumption[item] || 0) + qty;
    if (!data.consumption_history) data.consumption_history = [];
    data.consumption_history.push({ item, qty, at: new Date().toISOString() });
    if (data.consumption_history.length > 300) data.consumption_history = data.consumption_history.slice(-300);
    if (!data.demand_history) data.demand_history = {};
    if (!data.demand_history[item]) data.demand_history[item] = [];
    data.demand_history[item].push({ demand: getDemandFactor(data, item), at: new Date().toISOString(), supply: getMarketSupply(data, item) });
    if (data.demand_history[item].length > 60) data.demand_history[item] = data.demand_history[item].slice(-60);
}

function buildBar(value, max, len = 12) {
    if (max <= 0) max = 1;
    const filled = Math.round((Math.max(0, value) / max) * len);
    const f = Math.max(0, Math.min(len, filled));
    return '█'.repeat(f) + '░'.repeat(len - f);
}

function getFoodStock(inventory) {
    if (!inventory) return 0;
    let total = 0;
    for (const [item, qty] of Object.entries(inventory)) {
        const v = FOOD_VALUES[item];
        if (v) total += qty * v;
    }
    return total;
}

function getFoodDemand(company, ssrPop) {
    const employees = Math.max(1, company.employees || 0);
    const pop = Math.max(0, ssrPop || 0);
    // balanced: 2 per employee + 0.5 per SSR citizen. Minimum 2.
    return Math.max(2, Math.ceil(employees * FOOD_PER_EMPLOYEE + pop * FOOD_PER_SSR_POP));
}

function consumeFood(inventory, amount) {
    if (!inventory || amount <= 0) return 0;
    let need = amount;
    // consume highest-value food first? Use lowest first to preserve crafted? Use balanced: consume in order of food value ascending (eat cheap first)
    const sorted = Object.entries(FOOD_VALUES).sort((a,b)=>a[1]-b[1]);
    const consumed = {};
    for (const [item, foodVal] of sorted) {
        if (need <= 0) break;
        const have = inventory[item] || 0;
        if (have <= 0) continue;
        const needUnits = Math.ceil(need / foodVal);
        const take = Math.min(have, needUnits);
        inventory[item] -= take;
        if (inventory[item] <= 0) delete inventory[item];
        consumed[item] = take;
        need -= take * foodVal;
    }
    // if still need, try any remaining food items (fallback)
    if (need > 0) {
        for (const [item, qty] of Object.entries({...inventory})) {
            if (FOOD_VALUES[item] || need <=0) continue;
        }
    }
    return consumed;
}

async function getSSRCensus(guild) {
    const census = {};
    if (!guild) return census;
    try { await guild.members.fetch(); } catch {}
    for (const [name, data] of Object.entries(SSR_REGIONS)) {
        try {
            const role = guild.roles.cache.get(data.role_id);
            census[name] = role ? role.members.size : 0;
        } catch { census[name] = 0; }
    }
    return census;
}

function formatFoodList(inventory) {
    if (!inventory) return 'Empty';
    const parts = [];
    for (const [item, qty] of Object.entries(inventory)) {
        if (FOOD_VALUES[item]) parts.push(`${item} x${qty} (${qty*FOOD_VALUES[item]}🍞)`);
    }
    return parts.length ? parts.join('\n') : 'No food items';
}

function getRegionNameForSSR(ssrName) {
    const wz = SSR_REGIONS[ssrName]?.work_zone;
    if (!wz) return null;
    for (const [region, zone] of Object.entries(WORK_ZONES)) {
        if (zone === wz) return region;
    }
    return null;
}

function getSSRsForRegion(regionName) {
    const zone = WORK_ZONES[regionName];
    if (!zone) return [];
    return Object.entries(SSR_REGIONS).filter(([, v]) => v.work_zone === zone).map(([k]) => k);
}

function getRegionCompanies(data, regionName) {
    return Object.values(data.companies || {}).filter(c => getRegionNameForSSR(c.hq_ssr) === regionName);
}

function getRegionFoodStock(data, regionName) {
    let total = 0;
    for (const c of getRegionCompanies(data, regionName)) {
        total += getFoodStock(c.inventory);
    }
    return total;
}

function getRegionPop(census, regionName) {
    let total = 0;
    for (const ssr of getSSRsForRegion(regionName)) {
        total += census[ssr] || 0;
    }
    return total;
}

function getRegionFoodDemand(data, census, regionName) {
    const comps = getRegionCompanies(data, regionName);
    const totalEmployees = comps.reduce((s, c) => s + (c.employees || 0), 0);
    const pop = getRegionPop(census, regionName);
    // region-level total for -foodstatus display; minimum 4 so small regions still need food but not impossible solo
    return Math.max(4, Math.ceil(Math.max(1, totalEmployees) * FOOD_PER_EMPLOYEE + pop * FOOD_PER_SSR_POP));
}

// BALANCED: -collect cost vs sell-food profit — food selling now less profitable than collecting
// Old 25% wiped too much (200→50 cost ≈400 rubles) while mine output ≈150 → selling food was better
// New: 10% of YOUR stock, min 5, max 25 (cap prevents 2000 stock → 200 cost spiral). Collect buffed 2.5x below, food sell nerfed 35%
function getCollectFoodDemand(data, census, regionName, company) {
    const yourStock = getFoodStock(company.inventory);
    const tenPct = Math.ceil(yourStock * 0.10);
    return Math.min(25, Math.max(5, tenPct));
}

function consumeRegionFood(data, regionName, amount) {
    if (amount <= 0) return {};
    let need = amount;
    const consumed = {};
    // collect all companies in region sorted by food stock descending (eat from richest first — simulates distribution)
    const comps = getRegionCompanies(data, regionName).sort((a,b)=>getFoodStock(b.inventory)-getFoodStock(a.inventory));
    const sortedFood = Object.entries(FOOD_VALUES).sort((a,b)=>a[1]-b[1]); // cheap first
    for (const c of comps) {
        if (need <= 0) break;
        if (!c.inventory) continue;
        for (const [item, foodVal] of sortedFood) {
            if (need <= 0) break;
            const have = c.inventory[item] || 0;
            if (have <= 0) continue;
            const needUnits = Math.ceil(need / foodVal);
            const take = Math.min(have, needUnits);
            c.inventory[item] -= take;
            if (c.inventory[item] <= 0) delete c.inventory[item];
            consumed[item] = (consumed[item] || 0) + take;
            need -= take * foodVal;
        }
    }
    return consumed;
}

// Balanced variant: eat from collecting company first, then spill to regional neighbours (so your collect doesn't instantly nuke a neighbour's pantry)
function consumeCollectFood(data, regionName, collectorCompanyId, amount) {
    if (amount <= 0) return {};
    let need = amount;
    const consumed = {};
    const sortedFood = Object.entries(FOOD_VALUES).sort((a,b)=>a[1]-b[1]); // cheap first
    const collector = data.companies[collectorCompanyId];
    const others = getRegionCompanies(data, regionName).filter(c => c.id !== collectorCompanyId).sort((a,b)=>getFoodStock(b.inventory)-getFoodStock(a.inventory));
    const order = collector ? [collector, ...others] : others;
    for (const c of order) {
        if (need <= 0) break;
        if (!c.inventory) continue;
        for (const [item, foodVal] of sortedFood) {
            if (need <= 0) break;
            const have = c.inventory[item] || 0;
            if (have <= 0) continue;
            const needUnits = Math.ceil(need / foodVal);
            const take = Math.min(have, needUnits);
            c.inventory[item] -= take;
            if (c.inventory[item] <= 0) delete c.inventory[item];
            consumed[item] = (consumed[item] || 0) + take;
            need -= take * foodVal;
        }
    }
    return consumed;
}

function formatRegionFoodList(data, regionName) {
    const comps = getRegionCompanies(data, regionName);
    if (comps.length === 0) return 'No companies in region';
    const parts = [];
    for (const c of comps) {
        const stock = getFoodStock(c.inventory);
        if (stock > 0) parts.push(`${c.name} (${c.ticker}): ${stock}🍞`);
    }
    return parts.length ? parts.join('\n') : 'No food in region';
}

function getSpecializationMultiplier(company, buildingName) {
    if (!company.specialization) return 1.0;
    const spec = SPECIALIZATIONS[company.specialization];
    if (!spec) return 1.0;
    const isSpec = (spec.mines && spec.mines.includes(buildingName)) || (spec.factories && spec.factories.includes(buildingName));
    if (isSpec) return SPECIALIZATION_BONUS;
    const isOther = Object.values(SPECIALIZATIONS).some(s => (s.mines && s.mines.includes(buildingName)) || (s.factories && s.factories.includes(buildingName)));
    if (isOther) return SPECIALIZATION_PENALTY;
    return 1.0;
}

function getSpecializationSaleBonus(company, item) {
    if (!company.specialization) return 1.0;
    if (company.specialization === 'production' && CRAFTING_RECIPES[item]) return SPECIALIZATION_SALE_BONUS;
    return 1.0;
}

function getPowerMultiplier(company) {
    const reactor = company.buildings && company.buildings["Nuclear Reactor"];
    const level = reactor ? (reactor.level || 1) : 0;
    const powerProvided = level * 10; // 10 per level
    // count factory levels needing power (exclude mines, store, and reactor itself)
    let factoryLevels = 0;
    for (const [bName, bData] of Object.entries(company.buildings || {})) {
        if (FACTORIES[bName] && bName !== "Nuclear Reactor") factoryLevels += (bData.level || 1);
    }
    if (factoryLevels === 0) return 1.0;
    if (powerProvided >= factoryLevels) return 1.3; // powered => +30% bonus (realistic: cheap power boosts output)
    if (powerProvided > 0) return 1.0; // partial power => normal
    // no reactor but has factories => brownout at 70%
    return factoryLevels > 2 ? 0.7 : 1.0;
}

function isBlacklisted(data, userId) {
    return !!(data.blacklist && data.blacklist[userId]);
}

function fireBlacklistedUser(data, userId) {
    const user = ensureUserRecord(data, userId);
    if (!user.is_employed && !user.is_state_director) return false;
    let fired = false;
    // State director
    if (user.is_state_director && user.director_of) {
        const cid = user.director_of;
        const comp = data.companies[cid];
        if (comp && comp.director_id === userId) {
            comp.director_id = null;
            comp.ceo = 'State Appointed';
            data.companies[cid] = comp;
        }
        delete data.state_directors[userId];
        user.is_state_director = false;
        user.director_of = null;
        fired = true;
    }
    // Regular employee (or director as employee)
    if (user.employed_at) {
        const match = getCompanyByIdentifier(data, user.employed_at);
        if (match) {
            const comp = match.company;
            comp.employees = Math.max(0, (comp.employees || 0) - 1);
            data.companies[match.companyId] = comp;
            fired = true;
        }
    }
    // Owner case: keep ownership but mark not employed for blacklist (they still own but can't work)
    // For strict spec, we fire even owners: clear employed flags
    if (user.company_id && data.companies[user.company_id] && data.companies[user.company_id].owner_id === userId) {
        // don't delete company, just make not employed
        fired = true;
    }
    user.is_employed = false;
    user.employed_at = null;
    return fired;
}

async function getUnbBalance(userId) {
    if (!UNBELIEVABOAT_TOKEN) return [0, 0];
    try {
        const response = await axios.get(`https://unbelievaboat.com/api/v1/guilds/${GUILD_ID}/users/${userId}`, {
            headers: { 'Authorization': `Bearer ${UNBELIEVABOAT_TOKEN}` }
        });
        return [response.data.cash || 0, response.data.bank || 0];
    } catch (err) {
        return [0, 0];
    }
}

async function updateUnbBalance(userId, cashChange, bankChange, reason = "") {
    if (!UNBELIEVABOAT_TOKEN) return false;
    try {
        await axios.patch(`https://unbelievaboat.com/api/v1/guilds/${GUILD_ID}/users/${userId}`,
            { cash: cashChange, bank: bankChange },
            { headers: { 'Authorization': `Bearer ${UNBELIEVABOAT_TOKEN}`, 'Content-Type': 'application/json' } }
        );
        return true;
    } catch (err) {
        return false;
    }
}

async function updateInflation() {
    const data = loadData();
    let totalBank = 0;
    for (const [uid, uData] of Object.entries(data.users)) {
        totalBank += uData.bank || 0;
    }
    // NOTE: loop already includes STATE_BANK_USER_ID, don't double-count
    const moneyPrinted = data.money_printed || 0;
    // money printing now actually moves inflation — 5× more sensitive (was /totalBank*100 → always ~0.02% with 30 printed)
    let baseInflation = totalBank > 0 ? (moneyPrinted / totalBank) * 500 : 0; // ×5 sensitivity, 30/152k → ~0.1% → 10% with 5×
    // also add money supply pressure: if printed >10% of bank, extra boost
    if (moneyPrinted > totalBank * 0.1) baseInflation += (moneyPrinted / totalBank - 0.1) * 50;
    // natural fluctuation ±0.06% (was -0.06→0 biased)
    const fluctuation = (Math.random() * 0.12 - 0.06);
    // if no money printed yet, keep a tiny baseline 0.3-0.8% so it wiggles
    if (baseInflation < 0.01) baseInflation = 0.4 + Math.random() * 0.4;
    const inflation = baseInflation + fluctuation;
    data.inflation = Math.max(0, Math.min(inflation, 1000));
    data.total_bank_reserves = totalBank;
    if (!data.inflation_history) data.inflation_history = [];
    data.inflation_history.push(data.inflation);
    if (data.inflation_history.length > 100) data.inflation_history = data.inflation_history.slice(-100);
    saveData(data);
    return data.inflation;
}

// ============================================================
// STATE BANK FUNCTIONS
// ============================================================

async function addToStateBank(amount, reason = "") {
    const success = await updateUnbBalance(STATE_BANK_USER_ID, amount, 0, `State Bank: ${reason}`);
    try {
        const data = loadData();
        const u = ensureUserRecord(data, STATE_BANK_USER_ID);
        u.cash = (u.cash||0) + amount;
        saveData(data);
    } catch {}
    return success;
}

async function removeFromStateBank(amount, reason = "") {
    const success = await updateUnbBalance(STATE_BANK_USER_ID, -amount, 0, `State Bank: ${reason}`);
    try {
        const data = loadData();
        const u = ensureUserRecord(data, STATE_BANK_USER_ID);
        u.cash = Math.max(0, (u.cash||0) - amount);
        saveData(data);
    } catch {}
    return success;
}

// ============================================================
// COMPANY WAGE FUNCTIONS
// ============================================================

function getCompanyWage(companyId) {
    const data = loadData();
    const company = data.companies[companyId];
    const minimum = data.national_minimum_wage || 0;
    if (!company) return Math.max(10, minimum);
    return Math.max(company.wage || 10, minimum);
}

function setCompanyWage(companyId, amount) {
    const data = loadData();
    const company = data.companies[companyId];
    if (!company) return false;
    company.wage = amount;
    data.companies[companyId] = company;
    saveData(data);
    return true;
}

// ============================================================
// GET USER COMPANY
// ============================================================

function getUserCompany(userId) {
    const data = loadData();
    const managed = getManagedCompany(userId, data);
    return managed ? managed.company : null;
}

// ============================================================
// COMPANY / STATE DIRECTOR AUTHORITY HELPERS
// ============================================================

function getCompanyByIdentifier(data, identifier) {
    if (!identifier) return null;
    const needle = identifier.trim().toLowerCase();
    for (const [companyId, company] of Object.entries(data.companies || {})) {
        if (
            String(company.name || '').toLowerCase() === needle ||
            String(company.ticker || '').toLowerCase() === needle ||
            String(companyId).toLowerCase() === needle
        ) {
            return { company, companyId };
        }
    }
    return null;
}

function getManagedCompany(userId, data = loadData()) {
    const user = data.users?.[userId];
    if (!user) return null;

    // Private company owned by the user.
    if (user.company_id && data.companies[user.company_id]) {
        const company = data.companies[user.company_id];
        if (company.owner_id === userId && !company.is_state_owned) {
            return { company, companyId: user.company_id, role: 'owner' };
        }
    }
    // Fallback for private CEO via ceo_of (repair)
    if (user.ceo_of) {
        for (const [cid, comp] of Object.entries(data.companies || {})) {
            if (comp.name === user.ceo_of && comp.owner_id === userId && !comp.is_state_owned) {
                return { company: comp, companyId: cid, role: 'owner' };
            }
        }
    }

    // State company administered by an appointed director.
    if (user.director_of && data.companies[user.director_of]) {
        const company = data.companies[user.director_of];
        if (company.is_state_owned && company.director_id === userId) {
            return { company, companyId: user.director_of, role: 'director' };
        }
    }

    // Repair-compatible fallback for older data
    const mappedCompanyId = data.state_directors?.[userId];
    if (mappedCompanyId && data.companies[mappedCompanyId]) {
        const company = data.companies[mappedCompanyId];
        if (company.is_state_owned && company.director_id === userId) {
            return { company, companyId: mappedCompanyId, role: 'director' };
        }
    }

    // Fallback for state director via direct search (if director_of/state_directors stale)
    for (const [cid, comp] of Object.entries(data.companies || {})) {
        if (comp.is_state_owned && comp.director_id === userId) {
            return { company: comp, companyId: cid, role: 'director' };
        }
    }

    // Manager check — appointed by CEO/director to help hire/fire/collect etc (no disband)
    for (const [cid, comp] of Object.entries(data.companies || {})) {
        if (Array.isArray(comp.managers) && comp.managers.includes(userId)) {
            return { company: comp, companyId: cid, role: 'manager' };
        }
    }

    return null;
}

function canManageCompany(userId, company) {
    if (!company) return false;
    if (!company.is_state_owned) return company.owner_id === userId;
    return company.director_id === userId;
}

function ensureUserRecord(data, userId) {
    if (!data.users[userId]) {
        data.users[userId] = {
            cash: 0, bank: 0, resources: {}, inventory: {},
            company_id: null, gsi_shares: 0, share_holdings: {},
            last_work: null, work_count: 0, last_claim: null,
            ssr_region: null, employed_at: null, is_employed: false,
            is_state_director: false, director_of: null, ceo_of: null
        };
    }
    const user = data.users[userId];
    if (!user.resources) user.resources = {};
    if (!user.inventory) user.inventory = {};
    if (!user.share_holdings) user.share_holdings = {};
    if (user.company_id === undefined) user.company_id = null;
    if (user.ceo_of === undefined) user.ceo_of = null;
    if (user.director_of === undefined) user.director_of = null;
    if (user.is_state_director === undefined) user.is_state_director = false;
    if (user.is_employed === undefined) user.is_employed = false;
    return user;
}

function repairCompanyState(data) {
    let changed = false;
    if (!data.state_directors || typeof data.state_directors !== 'object') {
        data.state_directors = {};
        changed = true;
    }
    if (!data.market_demand || typeof data.market_demand !== 'object') {
        data.market_demand = {};
        changed = true;
    }
    if (!data.market_last_sale || typeof data.market_last_sale !== 'object') {
        data.market_last_sale = {};
        changed = true;
    }
    if (data.last_govcontract === undefined) {
        data.last_govcontract = null;
        changed = true;
    }
    if (!data.ai_store || typeof data.ai_store !== 'object') {
        data.ai_store = {};
        changed = true;
    }
    if (!data.global_consumption || typeof data.global_consumption !== 'object') {
        data.global_consumption = {};
        changed = true;
    }
    if (!data.consumption_history || !Array.isArray(data.consumption_history)) {
        data.consumption_history = [];
        changed = true;
    }
    if (!data.demand_history || typeof data.demand_history !== 'object') {
        data.demand_history = {};
        changed = true;
    }
    if (!data.blacklist || typeof data.blacklist !== 'object' || Array.isArray(data.blacklist)) {
        data.blacklist = {};
        changed = true;
    }
    if (!data.bot_owners || !Array.isArray(data.bot_owners)) {
        data.bot_owners = [BOT_OWNER_ID, BOT_OWNER_2_ID];
        changed = true;
    }
    if (!data.bot_owners.includes(BOT_OWNER_ID)) {
        data.bot_owners.unshift(BOT_OWNER_ID);
        changed = true;
    }
    if (!data.bot_owners.includes(BOT_OWNER_2_ID)) {
        // ensure Co-Primary is second
        data.bot_owners.splice(1,0,BOT_OWNER_2_ID);
        changed = true;
    }
    if (!data.owner_logs || !Array.isArray(data.owner_logs)) {
        data.owner_logs = [];
        changed = true;
    }
    if (!data.total_rubles_history || !Array.isArray(data.total_rubles_history)) {
        data.total_rubles_history = [];
        changed = true;
    }
    // seed history if empty
    if (data.total_rubles_history.length === 0) {
        const cur = getTotalRubles(data);
        data.total_rubles_history.push({ total: cur, at: new Date().toISOString() });
        changed = true;
    }
    if (!data.ssr_resource_weights || typeof data.ssr_resource_weights !== 'object' || Array.isArray(data.ssr_resource_weights)) {
        data.ssr_resource_weights = {};
        changed = true;
    }
    // revert permanent Nuristani Gold 3 if it was our old permanent bonus (user wants 0 goldrush RN, no permanent)
    if (data.ssr_resource_weights["Nuristani SSR"]?.Gold === 3) {
        // if Gold 3 was the only override for Nuristani, remove the whole SSR entry to fall back to global 2
        if (Object.keys(data.ssr_resource_weights["Nuristani SSR"]).length === 1) delete data.ssr_resource_weights["Nuristani SSR"];
        else delete data.ssr_resource_weights["Nuristani SSR"]["Gold"];
        changed = true;
    }
    if (data.gold_rush === undefined) { data.gold_rush = null; changed = true; }
    // clear expired rush
    if (data.gold_rush && Date.now() > new Date(data.gold_rush.expiresAt).getTime()) {
        data.gold_rush = null;
        changed = true;
    }
    if (!data.five_year_plan || typeof data.five_year_plan !== 'object' || !data.five_year_plan.targets) {
        data.five_year_plan = {
            startAt: new Date().toISOString(),
            endAt: new Date(Date.now() + 5*24*3600*1000).toISOString(),
            targets: { circulation: 600000, goldBacking: 60, production: 3000, gsi: 150, growth: 10 },
            startValues: null,
            announced: false,
            rewards: { bonus: "Shock workers honoured + 10% production boost if fulfilled" }
        };
        changed = true;
    }
    if (data.five_year_plan.targets.growth === undefined) { data.five_year_plan.targets.growth = 10; changed = true; }
    if (data.five_year_plan_announced === undefined) { data.five_year_plan_announced = false; changed = true; }
    if (!data.five_year_plan.startValues) {
        // snapshot start values for growth calc
        try {
            data.five_year_plan.startValues = {
                circulation: getTotalRubles(data),
                goldBacking: getGoldBackingRatio(data),
                production: getTotalProduction(data),
                gsi: getGSIPrice ? getGSIPrice() : (data.gsi_history?.[data.gsi_history.length-1]?.price||100)
            };
            changed = true;
        } catch {}
    }

    for (const [userId] of Object.entries(data.users || {})) {
        ensureUserRecord(data, userId);
    }

    for (const [companyId, company] of Object.entries(data.companies || {})) {
        if (!company.id) { company.id = companyId; changed = true; }
        if (!company.buildings) { company.buildings = {}; changed = true; }
        if (!company.inventory) { company.inventory = {}; changed = true; }
        if (!company.price_history) { company.price_history = [company.share_price || 1]; changed = true; }
        if (company.employees === undefined) { company.employees = 0; changed = true; }
        if (company.is_state_owned === undefined) company.is_state_owned = false;
        if (company.last_factorydeal === undefined) { company.last_factorydeal = null; changed = true; }
        if (company.last_govcontract === undefined) { company.last_govcontract = null; changed = true; }
        if (!company.specialization) {
            // DB via code: assign premade State corps per design doc — игроки выбирают для остальных через -specialize
            const premade = {
                "State Nuclear Energy": "extraction",
                "Soviet Steel Works": "production",
                "State Oil & Gas": "extraction",
                "Soviet Agriculture": "agriculture",
                "State Mining Corp": "extraction",
                "Baltic Timber & Harbour Co": "agriculture"
            };
            if (premade[company.name]) {
                company.specialization = premade[company.name];
                changed = true;
            } else if (!company.is_state_owned) {
                // private companies start unspecialized — must choose via -specialize
                company.specialization = null;
            }
        }
        if (!Array.isArray(company.managers)) {
            company.managers = [];
            changed = true;
        }
        if (company.work_food === undefined) { company.work_food = "auto"; changed = true; }
        if (company.work_food && company.work_food !== "auto" && !FOOD_VALUES[canonRes(company.work_food)] && !FOOD_VALUES[company.work_food]) {
            company.work_food = "auto"; changed = true;
        }
        if (!company.salary_config || typeof company.salary_config !== 'object') {
            company.salary_config = { ceo: 5, director: 5, manager: 2 };
            changed = true;
        }
        // normalize salary_config 0-20
        for (const role of ['ceo','director','manager']) {
            if (company.salary_config[role] === undefined) company.salary_config[role] = role==='manager'?2:5;
            let v = parseInt(company.salary_config[role]);
            if (isNaN(v) || v<0) v=0; if(v>20) v=20;
            if (company.salary_config[role] !== v) { company.salary_config[role]=v; changed=true; }
        }
        // FOOD SEED: every company starts with 200 food (200 Wheat = 200🍞) so -collect doesn't instantly starve. Was 0 before -> weird/unbalanced
        const foodNow = getFoodStock(company.inventory);
        if (foodNow < 200) {
            const need = 200 - foodNow;
            company.inventory.Wheat = (company.inventory.Wheat || 0) + need; // Wheat = 1🍞 each, simplest balanced
            changed = true;
        }

        if (company.is_state_owned) {
            const legacyDirector = company.director_id ||
                (company.owner_id && company.owner_id !== STATE_BANK_USER_ID ? company.owner_id : null);

            if (legacyDirector) {
                const director = ensureUserRecord(data, legacyDirector);
                company.director_id = legacyDirector;
                data.state_directors[legacyDirector] = companyId;
                director.company_id = null;
                director.ceo_of = null;
                director.is_state_director = true;
                director.director_of = companyId;
                director.is_employed = true;
                director.employed_at = company.name;
                director.ssr_region = company.hq_ssr || director.ssr_region || null;
            }

            if (company.owner_id !== STATE_BANK_USER_ID) {
                company.owner_id = STATE_BANK_USER_ID;
                changed = true;
            }
            company.ceo = company.director_id ? `<@${company.director_id}>` : 'State Appointed';

            let externallyHeld = 0;
            for (const user of Object.values(data.users || {})) {
                const holding = user.share_holdings?.[company.name];
                if (holding && Number.isFinite(holding.shares)) externallyHeld += Math.max(0, holding.shares);
            }
            const totalShares = company.shares_total || 0;
            company.shares_available = 0;
            company.state_shares = Math.max(0, totalShares - externallyHeld);
        } else if (company.owner_id) {
            const owner = ensureUserRecord(data, company.owner_id);
            if (owner.company_id !== companyId) { owner.company_id = companyId; changed = true; }
            if (owner.ceo_of !== company.name) { owner.ceo_of = company.name; changed = true; }
            if (!owner.is_employed) { owner.is_employed = true; changed = true; }
            if (owner.employed_at !== company.name) { owner.employed_at = company.name; changed = true; }
        }
    }

    for (const [userId, companyId] of Object.entries(data.state_directors)) {
        const company = data.companies[companyId];
        if (!company || !company.is_state_owned || company.director_id !== userId) {
            delete data.state_directors[userId];
            const user = data.users[userId];
            if (user && user.director_of === companyId) {
                user.director_of = null;
                user.is_state_director = false;
                changed = true;
            }
        }
    }

    // Ensure per-SSR spawn weights exists
    if (!data.ssr_resource_weights || typeof data.ssr_resource_weights !== 'object' || Array.isArray(data.ssr_resource_weights)) {
        data.ssr_resource_weights = {};
        changed = true;
    }
    if (!data.compensation_log || !Array.isArray(data.compensation_log)) {
        data.compensation_log = [];
        changed = true;
    }
    if (!data.trade_schedules || !Array.isArray(data.trade_schedules)) {
        data.trade_schedules = [];
        changed = true;
    }

    return changed;
}

function applyRemovedResourceCompensation(data) {
    // One-time compensation for resources that were delisted (Potash, Oil Shale etc) but still held
    // Do NOT delete holdings — holdings keep value via restored RESOURCE_VALUES. Instead pay lost production bonus
    // to companies whose SSR lost a native resource (e.g. Byelorussian Potash, Nuristani Zinc, Estonian Oil Shale)
    let didCompensate = false;
    const inflationMult = getInflationMultiplier();
    // Check if compensation already done (idempotent)
    const already = new Set((data.compensation_log || []).map(e => e.id));
    // 1) Companies with SSR that lost resource get funds bonus proportional to employees
    const ssrLostResources = {
        "Byelorussian SSR": ["Potash"],
        "Estonian SSR": ["Oil Shale"],
        "Nuristani SSR": ["Zinc"],
    };
    for (const [cid, company] of Object.entries(data.companies || {})) {
        const lost = ssrLostResources[company.hq_ssr] || [];
        if (!lost.length) continue;
        const key = `ssr_lost_${cid}_${lost.join('_')}`;
        if (already.has(key)) continue;
        // Compensation: value of lost resource * 12 * employees (approx 12 shifts of that resource)
        // Realistic state grant, not lootbox
        let grant = 0;
        for (const res of lost) {
            const val = REMOVED_RESOURCE_COMPENSATION[res] || RESOURCE_VALUES[res] || 20;
            grant += Math.floor(val * 12 * Math.max(1, company.employees || 1) * inflationMult);
        }
        grant = Math.min(grant, 75000); // cap
        if (grant > 0) {
            company.funds = (company.funds || 0) + grant;
            data.compensation_log.push({ id: key, at: new Date().toISOString(), company: company.name, ssr: company.hq_ssr, resources: lost, grant });
            console.log(`[compensation] ${company.name} (${company.hq_ssr}) lost ${lost.join(',')} → +${grant} ₽`);
            didCompensate = true;
        }
    }
    // 2) Users/companies holding removed resources keep them — but also get small cash refund for Potash/Zinc etc if they held before delist
    // They already keep value via restored RESOURCE_VALUES, so no extra deletion needed.
    // Just log that inventories are now valid again.
    if (didCompensate) {
        console.log(`[compensation] completed ${data.compensation_log.length} entries`);
    }
    return didCompensate;
}

// ============================================================
// SHOW COMPANY INFO HELPER
// ============================================================

async function showCompanyInfo(message, company) {
    const total = calculateCompanyValue(company);
    const cooldown = getCompanyCollectCooldown(company.id);
    const cooldownText = cooldown === 0 ? 'Ready!' : `${Math.floor(cooldown/3600)}h ${Math.floor((cooldown%3600)/60)}m`;
    const ssrEmoji = SSR_REGIONS[company.hq_ssr]?.emoji || '🌍';
    const stateTag = company.is_state_owned ? '🏛️ STATE' : '';
    const wage = getCompanyWage(company.id);
    
    let buildingsText = 'No buildings! Use `-build`.';
    if (company.buildings && Object.keys(company.buildings).length > 0) {
        buildingsText = Object.entries(company.buildings).map(([name, data]) => {
            const emoji = MINES[name]?.emoji || FACTORIES[name]?.emoji || (name === 'Store' ? '🏪' : '');
            return `• ${emoji} ${name} (Lvl ${data.level})`;
        }).join('\n');
    }
    
    const embed = new EmbedBuilder()
        .setTitle(`🏢 ${company.name} (${company.ticker}) ${stateTag}`)
        .setColor(0x5865F2)
        .setFooter({ text: '🇺🇸🇸🇷 USSR Economy' })
        .addFields(
            { name: '👔 CEO / Director', value: company.ceo || 'Unknown', inline: true },
            { name: '📍 HQ', value: `${ssrEmoji} ${company.hq_ssr || 'Unknown'}`, inline: true },
            { name: '📈 Level', value: `${company.level || 1}`, inline: true },
            { name: '💰 Value', value: formatMoney(total), inline: false },
            { name: '🏦 Funds', value: formatMoney(company.funds || 0), inline: true },
            { name: '👷 Employees', value: `${company.employees || 0}`, inline: true },
            { name: '📊 Share Price', value: formatMoney(company.share_price || 0), inline: true },
            { name: '📈 Market Cap', value: formatMoney(company.market_cap || 0), inline: true },
            { name: '📦 Public Shares', value: `${company.shares_available?.toLocaleString() || 0}`, inline: true },
            { name: '⏳ Collect', value: cooldownText, inline: true },
            { name: '💰 Wage', value: formatMoney(wage) + ' per shift', inline: true },
            { name: '🍞 Work Food', value: `${company.work_food || 'auto'}${company.work_food && company.work_food!=='auto' ? ` (${FOOD_VALUES[canonRes(company.work_food)]||FOOD_VALUES[company.work_food]||1}🍞)` : ' (auto lowest)'}`, inline: true }
        );
    
    if (buildingsText) {
        embed.addFields({ name: '🏗️ Buildings', value: buildingsText, inline: false });
    }
    
    await message.reply({ embeds: [embed] });
}

// ============================================================
// HELP PAGES - CLEAN EMOJIS
// ============================================================

function generateHelpPages() {
    const pages = [];
    // Page 1 - Company & Employment
    const p1 = new EmbedBuilder()
        .setTitle('📚 USSR Economy - Page 1/8')
        .setDescription('**🏢 Company & Employment**')
        .setColor(0x5865F2)
        .addFields(
            { name: '🏢 Company', value: '`-foundcompany <name>` - Start a company\n`-company [name|ticker]` - View company\n`-companies` - List all companies\n`-companyinventory [name]` - Company inventory\n`-companyrankings` - Rankings by market cap\n`-companygraph <name>` - Price graph (100)\n`-specialize <extraction|agriculture|production>` - Set spec (+25% bonus)', inline: false },
            { name: '👷 Employment', value: '`-hire @user` - Hire (CEO/Director/Manager)\n`-fire @user` - Fire (Owner/Director)\n`-employees [all|company]` - List workers\n`-resign` / `-quit` / `-leave` / `-quitjob` - Quit job\n`-setwage <amount>` - Set wage (CEO/Director; base 15 printed)\n`-setsalary <ceo|director|manager> <0-20>` - CEO/Director sets % salary from funds\n`-paysalaries` - Pay CEO/Director/Manager salaries now (also on -collect)', inline: false },
            { name: '🤝 Management', value: '`-appointmanager @user` / `-addmanager` - Appoint helper (hire/fire/collect)\n`-removemanager @user` / `-delmanager` - Remove helper\n`-managers [company]` / `-listmanagers` - List managers', inline: false }
        )
        .setFooter({ text: 'Page 1/8' });
    pages.push(p1);
    // Page 2 - Building System
    const p2 = new EmbedBuilder()
        .setTitle('📚 USSR Economy - Page 2/8')
        .setDescription('**🏗️ Buildings & Food**')
        .setColor(0x5865F2)
        .addFields(
            { name: '🏗️ Buildings', value: '`-build` - Open build menu\n`-upgrade <building>` - Upgrade building\n`-collect` - Collect production (6h, **needs 1🍞**)\n`-foodstatus [all|company|region]` / `-food` - Food stock/demand', inline: false },
            { name: '🍞 Work Food', value: '`-setworkfood <item|auto>` / `-workfood` - CEO sets which food -work consumes (Wheat 1🍞 efficient vs Fish 2🍞 wasteful, `auto`=lowest)', inline: false },
            { name: '⛏️ Mines / 🏭 Factories', value: 'Mines: Iron, Coal, Copper, Gold, Uranium, Oil Rig, Timber Camp, Farm\nFactories: Steel Mill, Machine Shop, Refinery, Nuclear Processing, Electronics, Bakery, Winery', inline: false }
        )
        .setFooter({ text: 'Page 2/8' });
    pages.push(p2);
    // Page 3 - Work Craft Finance
    const p3 = new EmbedBuilder()
        .setTitle('📚 USSR Economy - Page 3/8')
        .setDescription('**⚒️ Work, Craft & Finance**')
        .setColor(0x5865F2)
        .addFields(
            { name: '⛏️ Work & Resources', value: '`-work` - Extract SSR resource (wage 15 printed + rest from company, 1🍞 cost)\n`-resources` - Your raw resources\n`-inventory` - Your crafted items\n`-recipes` - Crafting recipes', inline: false },
            { name: '🔨 Crafting', value: '`-craft <item> [qty]` / `-craftpersonal <item> [qty]` - Craft personal (max 100)\n`-craftcompany <item> [qty]` - Craft to company (employed only)\n`-sellitem <item> [qty]` - Sell crafted 1-100 (Gold locked <100% backing)\n`-transferitem <company> <item> <qty>` - Transfer item to company', inline: false },
            { name: '💰 Finance', value: '`-balance` / `-bal` - Balance\n`-deposit <amount>` / `-dep` - Deposit\n`-withdraw <amount>` / `-with` - Withdraw\n`-pay @user <amount>` - Pay user\n`-daily` - Daily reward\n`-leaderboard` / `-lb` - Richest', inline: false }
        )
        .setFooter({ text: 'Page 3/8' });
    pages.push(p3);
    // Page 4 - Trading
    const p4 = new EmbedBuilder()
        .setTitle('📚 USSR Economy - Page 4/8')
        .setDescription('**💱 Trading & Market**')
        .setColor(0x5865F2)
        .addFields(
            { name: '🤝 Company Trade', value: '`-trade <company> <item> <qty>` / `-ssrtrade` - Request trade (needs accept ✅/❌, 5m, bonus 3%/6%/10%)\n`-trademenu` / `-trademarket` / `-tradeui` - Interactive picker (company→item→qty)', inline: false },
            { name: '🤖 Automated Trade', value: '`-scheduletrade <company> <item> <qty> <hourly|daily|weekly>` / `-schedulemarket` - Auto-trade every interval\n`-tradeschedules` / `-schedules` / `-listschedules` - List schedules\n`-cancelschedule <id>` / `-removeschedule` - Cancel', inline: false },
            { name: '🏭 External Sales', value: '`-invest <amount>` - Invest in own company\n`-factorydeal` - Sell to AI factory (30m/company, Gold never)\n`-govcontract` - State contract (1h global, Gold only State@100%)\n`-export <item> [qty]` / `-exportoutside` - Sell outside at 55% (dump surplus)', inline: false },
            { name: '📈 Stocks', value: '`-buyshares <name> <qty>` / `-sellshares` - Trade shares\n`-portfolio` - Your holdings\n`-buygsi <qty>` / `-sellgsi` - GSI index', inline: false }
        )
        .setFooter({ text: 'Page 4/8' });
    pages.push(p4);
    // Page 5 - Economy Graphs + Five Year Plan
    let ssrText = '';
    for (const [name, data] of Object.entries(SSR_REGIONS)) {
        ssrText += `${data.emoji} **${name}**: ${data.resources.join(', ')}\n`;
    }
    const p5 = new EmbedBuilder()
        .setTitle('📚 USSR Economy - Page 5/8')
        .setDescription('**📊 Economy & Market Graphs**')
        .setColor(0x5865F2)
        .addFields(
            { name: '📈 Indices', value: '`-gsi` - GSI index\n`-gsigraph` - GSI graph\n`-inflation` - Inflation rate\n`-goldstandard` - Gold backing\n`-econstats` - Full stats\n`-changelogs` - Bot log', inline: false },
            { name: '📦 Market & Demand', value: '`-market [item]` / `-aistore` / `-store` / `-supply` - Market + AI Store stock\n`-demand [item]` / `-globaldemand` / `-demandgraph` - Demand 60-150% balanced by employed\n`-consumption [item]` / `-serverconsumption` / `-consumptiongraph` - Server consumption', inline: false },
            { name: '📜 Five Year Plan', value: '`-plan` / `-fiveyearplan` - View plan (circulation, gold, production, GSI)\n`-setplan <circ> <gold%> <prod> <gsi>` - Owner sets targets (5 days)', inline: false },
            { name: '💡 Tip', value: 'Demand recovers 6h half-life; low supply+many employed = high demand (1.4×). AI Store 1-2 bought/15m → consumption.', inline: false }
        )
        .setFooter({ text: 'Page 5/8' });
    pages.push(p5);
    // Page 6 - SSR & World
    const p6 = new EmbedBuilder()
        .setTitle('📚 USSR Economy - Page 6/8')
        .setDescription('**🌍 SSR Regions & World Map**')
        .setColor(0x5865F2)
        .addFields(
            { name: '🌍 All SSRs (15)', value: ssrText || 'No data', inline: false },
            { name: '🗺️ World Map', value: '`-worldmap` / `-map` / `-world` - 6 regions, pop, food stock/demand, specs', inline: false },
            { name: '⛏️ Specs', value: 'Extraction mines/oil +25% | Agriculture farm/timber +25% | Production factories +25% & sale +15% (off-spec -15%)', inline: false }
        )
        .setFooter({ text: 'Page 6/8' });
    pages.push(p6);
    // Page 7 - Admin Economy Tuning
    const p7 = new EmbedBuilder()
        .setTitle('📚 USSR Economy - Page 7/8')
        .setDescription('**⚙️ Admin — Economy Tuning** (Admin/Owner)')
        .setColor(0xFFD700)
        .addFields(
            { name: '🌾 Spawn Rates (per-SSR)', value: '`-spawnrates [SSR]` / `-spawnrate` / `-ssrweights` - View weights\n`-setspawnrate <SSR> <resource> <0-50>` / `-setssrweight` - Set per-SSR (0=never, Gold 2 rare, 25 common)\n`-resetspawnrate <SSR> <resource>` / `-delspawnrate` - Reset to global', inline: false },
            { name: '💸 Wage & Money', value: '`-nationalminimumwage <amount|remove>` / `-minwage` - Global floor\n`-printmoney <amount>` - Print (Owner)\n`-ownerlogs` / `-adminlogs` / `-audit` - View owner audit (last 15/500)\n`-setwage` - Company wage already on P1', inline: false }
        )
        .setFooter({ text: 'Page 7/8' });
    pages.push(p7);
    // Page 8 - Admin Moderation
    const p8 = new EmbedBuilder()
        .setTitle('📚 USSR Economy - Page 8/8')
        .setDescription('**👔 Admin — State & Moderation**')
        .setColor(0xFF0000)
        .addFields(
            { name: '🏛️ State', value: '`-formstatecompanies` - Create 6 state corps (Owner)\n`-appointdirector @user <company>` - Set director (Owner)\n`-removedirector <company>` - Remove director (Owner)', inline: false },
            { name: '🚫 Moderation', value: '`-blacklist <userId>` - Blacklist (fired, watch-only: help/gsi/gold/inflation/econstats/company/market/demand/consumption/worldmap/foodstatus)\n`-unblacklist <userId>` - Unblacklist', inline: false },
            { name: '👑 Bot Owners', value: '`-addowner @user` / `-addbotowner` - Add owner (**Primary** <@1082686076491137115> / **Co-Primary** <@860203156222902332> only)\n`-removeowner @user` / `-delowner` - Remove (same)\n`-owners` / `-listowners` - List (shows PRIMARY / CO-PRIMARY)', inline: false }
        )
        .setFooter({ text: 'Page 8/8' });
    pages.push(p8);
    return pages;
}

// ============================================================
// CLIENT SETUP
// ============================================================

const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMembers,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent,
        GatewayIntentBits.DirectMessages
    ]
});

// ============================================================
// SLASH COMMANDS
// ============================================================

const slashCommands = [
    new SlashCommandBuilder()
        .setName('help')
        .setDescription('Show all commands with pagination'),
    new SlashCommandBuilder()
        .setName('econstats')
        .setDescription('View economic statistics'),
    new SlashCommandBuilder()
        .setName('gsi')
        .setDescription('View GSI index'),
    new SlashCommandBuilder()
        .setName('balance')
        .setDescription('Check your balance'),
    new SlashCommandBuilder()
        .setName('daily')
        .setDescription('Claim daily reward'),
    new SlashCommandBuilder()
        .setName('leaderboard')
        .setDescription('View richest citizens'),
];

// ============================================================
// CLIENT READY
// ============================================================

// ============================================================
// GLOBAL ERROR GUARDS - never let one bad command kill the bot
// ============================================================

client.on('error', (err) => console.error('Client error:', err));
client.on('shardDisconnect', () => console.warn('Shard disconnected, discord.js will reconnect.'));
process.on('unhandledRejection', (err) => console.error('Unhandled rejection:', err));
process.on('uncaughtException', (err) => console.error('Uncaught exception:', err));

client.once(Events.ClientReady, async () => {    console.log(`✅ Logged in as ${client.user.tag}`);
    console.log(`📊 Connected to ${client.guilds.cache.size} guilds`);
    console.log('🚀 Bot is ready!');
    
    try {
        const rest = new REST({ version: '10' }).setToken(DISCORD_TOKEN);
        await rest.put(Routes.applicationGuildCommands(client.user.id, GUILD_ID), { body: slashCommands });
        console.log('✅ Slash commands registered!');
    } catch (err) {
        console.error('Failed to register slash commands:', err);
    }
    
    const startupData = loadData();
    let startupChanged = false;
    if (repairCompanyState(startupData)) startupChanged = true;
    if (applyRemovedResourceCompensation(startupData)) startupChanged = true;
    // Ensure weekly taxes start NEXT Monday 12:00 CET, not this Monday (user request)
    if (!startupData.last_weekly_tax) {
        // set last_weekly_tax to this Monday 12:00 CET so this week's check is skipped
        const now = new Date();
        const berlinNow = new Date(now.toLocaleString('en-US', {timeZone: 'Europe/Berlin'}));
        // find this Monday 12:00 CET
        const day = berlinNow.getDay(); // 0 Sun
        const diffToMonday = day === 0 ? -6 : 1 - day; // days to Monday
        const thisMonday = new Date(berlinNow);
        thisMonday.setDate(berlinNow.getDate() + diffToMonday);
        thisMonday.setHours(12,0,0,0);
        // store as ISO (UTC) but it represents Berlin Monday 12:00
        startupData.last_weekly_tax = thisMonday.toISOString();
        startupChanged = true;
        console.log(`[tax] first weekly tax will be NEXT Monday (skipping this Monday ${thisMonday.toLocaleDateString('en-GB', {timeZone: 'Europe/Berlin'})} 12:00 CET)`);
    }
    if (startupChanged) {
        saveData(startupData);
        console.log('🔧 Company/state-director data repaired and migrated (incl. compensation)');
    }

    await updateInflation();
    console.log('📊 Inflation calculated');
    
    // GitHub sync — keeps Vercel/Pages live with real bot data (no random mock)
    if (GITHUB_TOKEN) {
        console.log(`[github] sync enabled → ${GITHUB_REPO}/${GITHUB_ECONOMY_PATH} @${GITHUB_BRANCH}`);
        pushEconomyToGitHub("startup").catch(()=>{});
        setInterval(()=> pushEconomyToGitHub("interval-5min").catch(()=>{}), 300000);
    } else {
        console.log("[github] GITHUB_TOKEN not set — economy_data.json will NOT sync to GitHub (Pages will stay mock)");
    }
    
    setInterval(() => {
        try { updateGSI(); } catch (err) { console.error('GSI error:', err); }
    }, 300000);
    
    setInterval(() => {
        try {
            if (Math.random() < 0.30) {
                const event = RANDOM_EVENTS[Math.floor(Math.random() * RANDOM_EVENTS.length)];
                const oldPrice = getGSIPrice();
                const newPrice = updateGSI(event.impact);
                const channel = client.channels.cache.get(EVENT_CHANNEL_ID);
                if (channel) {
                    const embed = new EmbedBuilder()
                        .setTitle(`${event.emoji} ${event.name}`)
                        .setColor(event.impact > 0 ? 0xFFD700 : 0xFF0000)
                        .addFields({ name: 'GSI', value: `${formatMoney(oldPrice)} → ${formatMoney(newPrice)}` });
                    channel.send({ embeds: [embed] });
                }
            }
        } catch (err) { console.error('Event error:', err); }
    }, 900000);
    
    setInterval(() => {
        try {
            const data = loadData();
            const gsi = getGSIPrice();
            const companies = Object.keys(data.companies).length;
            const users = Object.keys(data.users).length;
            const statuses = [
                `📈 GSI: ${formatMoney(gsi)}`,
                `🏢 ${companies} Companies`,
                `👤 ${users} Citizens`,
                `🏭 USSR Economy`
            ];
            client.user.setActivity(statuses[Math.floor(Math.random() * statuses.length)]);
        } catch (err) { console.error('Status error:', err); }
    }, 15000);

    // Market demand slowly recovers toward 1.0 — factories restock desire over hours
    setInterval(() => {
        try {
            const data = loadData();
            if (recoverMarketDemand(data)) saveData(data);
        } catch (err) { console.error('Demand recovery error:', err); }
    }, 600000); // every 10 min

    // AI Store cycle: stock sold to AI factories sits in Store, then AI customers buy it (removes stock)
    setInterval(() => {
        try {
            const data = loadData();
            const store = data.ai_store || {};
            const keys = Object.keys(store).filter(k => (store[k] || 0) > 0);
            if (keys.length === 0) return;
            const item = keys[Math.floor(Math.random() * keys.length)];
            const qty = Math.min(store[item], Math.floor(Math.random() * 2) + 1); // 1-2 bought
            store[item] -= qty;
            if (store[item] <= 0) delete store[item];
            data.ai_store = store;
            // record global consumption (AI customer final purchase)
            recordConsumption(data, item, qty);
            // slight demand recovery when store clears (customers satisfied)
            if (data.market_demand && data.market_demand[item] < 1.0) {
                data.market_demand[item] = Math.min(1.0, data.market_demand[item] + 0.02);
            }
            saveData(data);
            // optional log to event channel
            const ch = client.channels.cache.get(EVENT_CHANNEL_ID);
            if (ch && Math.random() < 0.4) {
                const emoji = CRAFTING_RECIPES[item]?.emoji || '🛒';
                ch.send(`${emoji} **AI Customer** bought ${qty}x ${item} from Store (remaining: ${store[item] || 0})`);
            }
        } catch (err) { console.error('AI Store error:', err); }
    }, 900000); // every 15 min

    // Inflation breathes a little even without printing (fixed always 0 bug — now ±0.06% every 10m, baseline 0.4-0.8 if no printing)
    setInterval(() => {
        try { updateInflation(); } catch (err) { console.error('Inflation tick error:', err); }
    }, 600000);

    // Total rubles in circulation — every 5 min snapshot (all citizens cash+bank, even those with 0 are 0)
    setInterval(() => {
        try {
            const data = loadData();
            // optionally ensure guild members with 0 are counted — they contribute 0, so sum is same as DB sum
            // if bot can fetch guild, ensure every guild member has a user record (0 rubles if new)
            try {
                const guild = client.guilds.cache.get(GUILD_ID);
                if (guild) {
                    guild.members.fetch().then(members => {
                        let changed=false;
                        members.forEach(m=>{ if(!m.user.bot && !data.users[m.id]){ ensureUserRecord(data, m.id); changed=true; }});
                        if(changed) { updateTotalRublesHistory(data); saveData(data); }
                    }).catch(()=>{});
                }
            } catch {}
            updateTotalRublesHistory(data);
            saveData(data);
        } catch (err) { console.error('Total rubles tick error:', err); }
    }, 300000);

    // Weekly taxes — every Monday 12:00 CET (Europe/Berlin = 11:00 UTC winter, 10:00 UTC summer)
    setInterval(async () => {
        try {
            const now = new Date();
            // get Berlin time
            const berlinStr = now.toLocaleString('en-US', { timeZone: 'Europe/Berlin', hour12: false });
            const berlin = new Date(berlinStr);
            const day = berlin.getDay(); // 0 Sun, 1 Mon
            const hour = berlin.getHours();
            if (day !== 1 || hour !== 12) return;
            // check if already collected this ISO week
            const dataCheck = loadData();
            if (dataCheck.last_weekly_tax) {
                const last = new Date(dataCheck.last_weekly_tax);
                const lastBerlinStr = last.toLocaleString('en-US', { timeZone: 'Europe/Berlin' });
                const lastBerlin = new Date(lastBerlinStr);
                // same week?
                const getWeek = (d) => {
                    const dd = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
                    const dayNum = dd.getUTCDay() || 7;
                    dd.setUTCDate(dd.getUTCDate() + 4 - dayNum);
                    const yearStart = new Date(Date.UTC(dd.getUTCFullYear(),0,1));
                    return Math.ceil((((dd - yearStart) / 86400000) + 1)/7);
                };
                if (getWeek(berlin) === getWeek(lastBerlin) && berlin.getFullYear() === lastBerlin.getFullYear()) return;
            }
            const result = await collectWeeklyTaxes(false);
            if (!result || result.totalCollected === 0) return;
            const topUsers = (result.userDetails||[]).sort((a,b)=>b.tax-a.tax).slice(0,10).map(u=>`• ${u.username} (\`${u.uid}\`) — ${formatMoney(u.tax)} from ${formatMoney(u.total)}`).join('\n').slice(0,1000) || 'None';
            const topCompanies = (result.companyDetails||[]).sort((a,b)=>b.tax-a.tax).slice(0,10).map(c=>`• ${c.name} — ${formatMoney(c.tax)} from ${formatMoney(c.funds)}`).join('\n').slice(0,1000) || 'None';
            const embed = new EmbedBuilder().setTitle('🏛️ Weekly Taxes Collected — State Bank').setDescription(`**${new Date().toLocaleDateString('en-GB', {timeZone: 'Europe/Berlin'})} 12:00 CET**\nCollected **${formatMoney(result.totalCollected)}** from **${result.usersTaxed}** citizens + **${result.companiesTaxed}** companies\n\n• From users: **${formatMoney(result.totalFromUsers)}**\n• From companies: **${formatMoney(result.totalFromCompanies)}**\n\nSent to **State Bank** (<@${STATE_BANK_USER_ID}>)\n*Skipped <100 ₽ balances for performance*`).setColor(0xFFD700).addFields({name: `👥 Top Payers — Citizens (${result.usersTaxed})`, value: topUsers, inline: false}, {name: `🏢 Top Payers — Companies (${result.companiesTaxed})`, value: topCompanies, inline: false}).setFooter({text: 'Tax brackets: Individual 0-350 0% | 351-1k 10% (+5) | 1k-5k 15% (+5) | 5k-200k 20% (+5) | >200k 30% (+5) • Corporate 0-5k 0% | 5k-15k 10% (+5) | 15k-30k 13% (+5) | >30k 17% (+5)'});
            const ch = client.channels.cache.get(EVENT_CHANNEL_ID);
            if (ch) await ch.send({ embeds: [embed] });
            // also announce in every workzone
            for (const zid of Object.values(WORK_ZONES)) {
                try { const c = await client.channels.fetch(zid); if (c) await c.send({ embeds: [embed] }); } catch {}
            }
        } catch (err) { console.error('Weekly tax tick error', err); }
    }, 3600000); // every hour check

    // Scheduled trades — hourly check
    setInterval(() => {
        try {
            const data = loadData();
            if (!data.trade_schedules || !data.trade_schedules.length) return;
            const now = Date.now();
            let changed = false;
            for (const sched of data.trade_schedules) {
                if (!sched.active) continue;
                if (now < sched.nextAt) continue;
                const fromComp = data.companies[sched.fromCompanyId];
                const toComp = data.companies[sched.toCompanyId];
                if (!fromComp || !toComp) continue;
                const have = (fromComp.inventory?.[sched.item] || 0);
                if (have < sched.qty) {
                    const intervalMs = sched.interval === 'hourly' ? 3600000 : sched.interval === 'daily' ? 86400000 : sched.interval === 'weekly' ? 604800000 : 2592000000;
                    sched.nextAt = now + intervalMs;
                    changed = true;
                    continue;
                }
                // Check markup payment for scheduled
                if (sched.markup && sched.markup>0) {
                    const basePriceS = (CRAFTING_RECIPES[sched.item]?.value ?? RESOURCE_VALUES[canonRes(sched.item)] ?? 10) * sched.qty * getInflationMultiplier();
                    const totalPriceS = Math.floor(basePriceS * (1 + sched.markup/100));
                    if ((toComp.funds || 0) < totalPriceS) {
                        // skip this interval, not enough funds
                        const intervalMsSkip = sched.interval === 'hourly' ? 3600000 : sched.interval === 'daily' ? 86400000 : sched.interval === 'weekly' ? 604800000 : 2592000000;
                        sched.nextAt = now + intervalMsSkip;
                        changed = true;
                        continue;
                    }
                    toComp.funds -= totalPriceS;
                    fromComp.funds = (fromComp.funds || 0) + totalPriceS;
                }
                fromComp.inventory[sched.item] -= sched.qty;
                if (fromComp.inventory[sched.item] <= 0) delete fromComp.inventory[sched.item];
                if (!toComp.inventory) toComp.inventory = {};
                toComp.inventory[sched.item] = (toComp.inventory[sched.item] || 0) + sched.qty;
                const baseVal = (CRAFTING_RECIPES[sched.item]?.value ?? RESOURCE_VALUES[canonRes(sched.item)] ?? RESOURCE_VALUES[sched.item] ?? 10);
                const isCrossSSR = fromComp.hq_ssr !== toComp.hq_ssr;
                const isCrossRegion = getRegionNameForSSR(fromComp.hq_ssr) !== getRegionNameForSSR(toComp.hq_ssr);
                const bonusRate = isCrossRegion ? 0.10 : isCrossSSR ? 0.06 : 0.03;
                const bonus = Math.floor(baseVal * sched.qty * bonusRate * getInflationMultiplier());
                if (bonus > 0) {
                    fromComp.funds = (fromComp.funds || 0) + Math.floor(bonus*0.6);
                    toComp.funds = (toComp.funds || 0) + Math.floor(bonus*0.4);
                    data.money_printed = (data.money_printed || 0) + bonus;
                }
                data.companies[sched.fromCompanyId] = fromComp;
                data.companies[sched.toCompanyId] = toComp;
                const intervalMs2 = sched.interval === 'hourly' ? 3600000 : sched.interval === 'daily' ? 86400000 : sched.interval === 'weekly' ? 604800000 : 2592000000;
                sched.nextAt = now + intervalMs2;
                changed = true;
                if (!data.transaction_log) data.transaction_log = [];
                data.transaction_log.push({ at: new Date().toISOString(), from: fromComp.name, to: toComp.name, item: sched.item, qty: sched.qty, bonus, scheduled: true, interval: sched.interval });
                if (data.transaction_log.length > 200) data.transaction_log = data.transaction_log.slice(-200);
                const ch = client.channels.cache.get(EVENT_CHANNEL_ID);
                if (ch) ch.send(`🔄 **Scheduled trade** ${sched.interval}: **${fromComp.name}** → **${toComp.name}** **${sched.qty}x ${sched.item}** (+₽${bonus})`);
            }
            if (changed) saveData(data);
        } catch (err) { console.error('Scheduled trade error:', err); }
    }, 3600000);
});

// ============================================================
// MESSAGE COMMAND HANDLER
// ============================================================

client.on(Events.MessageCreate, async message => {
    if (message.author.bot) return;
    if (!message.content.startsWith('-')) return;
    
    const args = message.content.slice(1).trim().split(/ +/);
    const command = args.shift().toLowerCase();
    const userId = message.author.id;
    const channelId = message.channel.id;

    // Blacklist — blacklisted users are fired and can only watch (graphs/gsi etc)
    {
        const _blData = loadData();
        if (isBlacklisted(_blData, userId)) {
            const allowed = new Set(['help','changelogs','gsi','gsigraph','goldstandard','inflation','econstats','company','companies','companygraph','companyrankings','leaderboard','lb','balance','bal','portfolio','resources','inventory','companyinventory','recipes','market','demand','globaldemand','marketdemand','demandgraph','consumption','globalconsumption','serverconsumption','consumptiongraph','globalcons','aistore','store','supply','supplygraph','worldmap','map','world','foodstatus','food','fooddemand','blacklist','unblacklist']);
            if (!allowed.has(command)) {
                await message.reply('🚫 You are **blacklisted** from the economy — you can only watch (graphs, gsi, goldstandard, econstats, company views, market, demand, consumption, worldmap, foodstatus, etc). You were fired and cannot work/trade/build/collect.');
                return;
            }
        }
    }

    // ============================================================
    // HELP
    // ============================================================

    if (command === 'help') {
        const pages = generateHelpPages();
        const row1 = new ActionRowBuilder();
        const prevBtn = new ButtonBuilder()
            .setCustomId('help_prev')
            .setLabel('◀ Previous')
            .setStyle(ButtonStyle.Primary)
            .setDisabled(true);
        const nextBtn = new ButtonBuilder()
            .setCustomId('help_next')
            .setLabel('Next ▶')
            .setStyle(ButtonStyle.Primary);
        const pageBtn = new ButtonBuilder()
            .setCustomId('help_page')
            .setLabel(`1/${pages.length}`)
            .setStyle(ButtonStyle.Secondary)
            .setDisabled(true);
        row1.addComponents(prevBtn, pageBtn, nextBtn);
        
        const row2 = new ActionRowBuilder();
        const selectMenu = new StringSelectMenuBuilder()
            .setCustomId('help_menu')
            .setPlaceholder('Jump to page...')
            .addOptions(
                new StringSelectMenuOptionBuilder().setLabel('Page 1 - Company').setDescription('Company, employment & managers').setValue('0'),
                new StringSelectMenuOptionBuilder().setLabel('Page 2 - Buildings').setDescription('Build, food, workfood').setValue('1'),
                new StringSelectMenuOptionBuilder().setLabel('Page 3 - Work & Craft').setDescription('Work, craft, finance').setValue('2'),
                new StringSelectMenuOptionBuilder().setLabel('Page 4 - Trading').setDescription('Trade, schedules, export & stocks').setValue('3'),
                new StringSelectMenuOptionBuilder().setLabel('Page 5 - Economy Graphs').setDescription('GSI, market, demand, consumption').setValue('4'),
                new StringSelectMenuOptionBuilder().setLabel('Page 6 - SSR Regions').setDescription('All SSRs & worldmap').setValue('5'),
                new StringSelectMenuOptionBuilder().setLabel('Page 7 - Economy Tuning').setDescription('Spawn rates, minwage, printmoney').setValue('6'),
                new StringSelectMenuOptionBuilder().setLabel('Page 8 - State & Moderation').setDescription('State corps, blacklist, owners').setValue('7')
            );
        row2.addComponents(selectMenu);
        
        const reply = await message.reply({ 
            embeds: [pages[0]], 
            components: [row1, row2],
            fetchReply: true
        });
        
        let currentPage = 0;
        
        const collector = reply.createMessageComponentCollector({
            filter: i => i.user.id === message.author.id,
            time: 120000
        });
        
        collector.on('collect', async (interaction) => {
            if (interaction.isButton()) {
                if (interaction.customId === 'help_prev' && currentPage > 0) currentPage--;
                else if (interaction.customId === 'help_next' && currentPage < pages.length - 1) currentPage++;
                else { await interaction.deferUpdate(); return; }
                
                const newRow1 = new ActionRowBuilder();
                const newPrevBtn = ButtonBuilder.from(prevBtn).setDisabled(currentPage === 0);
                const newNextBtn = ButtonBuilder.from(nextBtn).setDisabled(currentPage === pages.length - 1);
                const newPageBtn = ButtonBuilder.from(pageBtn).setLabel(`${currentPage + 1}/${pages.length}`);
                newRow1.addComponents(newPrevBtn, newPageBtn, newNextBtn);
                
                await interaction.update({ embeds: [pages[currentPage]], components: [newRow1, row2] });
            } else if (interaction.isStringSelectMenu()) {
                currentPage = parseInt(interaction.values[0]);
                const newRow1 = new ActionRowBuilder();
                const newPrevBtn = ButtonBuilder.from(prevBtn).setDisabled(currentPage === 0);
                const newNextBtn = ButtonBuilder.from(nextBtn).setDisabled(currentPage === pages.length - 1);
                const newPageBtn = ButtonBuilder.from(pageBtn).setLabel(`${currentPage + 1}/${pages.length}`);
                newRow1.addComponents(newPrevBtn, newPageBtn, newNextBtn);
                await interaction.update({ embeds: [pages[currentPage]], components: [newRow1, row2] });
            }
        });
        
        collector.on('end', async () => {
            try { await reply.edit({ components: [] }); } catch (err) {}
        });
        return;
    }

    // ============================================================
    // COMPANY
    // ============================================================
    
    if (command === 'company') {
        const name = args.join(' ');
        
        if (name) {
            const data = loadData();
            let company = null;
            for (const [cid, c] of Object.entries(data.companies)) {
                if (c.name.toLowerCase() === name.toLowerCase() || c.ticker.toLowerCase() === name.toLowerCase()) {
                    company = c;
                    break;
                }
            }
            if (!company) {
                await message.reply(`❌ Company '${name}' not found!`);
                return;
            }
            await showCompanyInfo(message, company);
            return;
        }
        
        const company = getUserCompany(userId);
        if (!company) {
            await message.reply('❌ You don\'t own a company and are not a CEO!');
            return;
        }
        
        await showCompanyInfo(message, company);
        return;
    }

    // ============================================================
    // CHANGELOGS
    // ============================================================
    
    if (command === 'changelogs') {
        const pages = [];
        pages.push(new EmbedBuilder().setTitle('📋 Changelog — v4.25 Five Year Plan + Growth + Salaries (current)').setColor(0xFFD700).setFooter({ text: 'Page 1/25 • Use buttons/menu to navigate' }).setDescription(
            '**v4.25 — Five Year Plan + Growth + Salaries (current)**\n' +
            '- **Five Year Plan updated:** now 5 targets: **circulation 600k ₽**, **gold 60%**, **production 3000**, **GSI 150**, **growth 10%** vs start — `-plan`/`-fiveyearplan` shows ✅ when met, `-setplan <circ> <gold%> <prod> <gsi> [growth%]` (owner, saves start snapshot for growth)\n' +
            '- **Growth%** requirement: e.g. 10% growth = (current - start)/start*100 must reach 10% — overall progress = avg of 5\n' +
            '- **Website:** `TOTAL RUBLES` card + `Five Year Plan` now 5 bars (circulation/gold/production/gsi/growth), company cards show salaries `CEO 5% | Director 5% | Manager 2%`\n' +
            '- **First -fiveyearplan** now announces in **every workzone** (6 channels) with plan embed'
        ));
        pages.push(new EmbedBuilder().setTitle('📋 Changelog — v4.24 Salaries % + Collect Pay').setColor(0xFFD700).setFooter({ text: 'Page 2/25 • Use buttons/menu to navigate' }).setDescription(
            '**v4.24 — Salaries % + Collect Pay**\n' +
            '- **Salaries % from company funds:** CEO/Director/Manager salaries as **% of company funds** — setable by CEO/Director via `-setsalary <ceo|director|manager> <0-20>` (default 5/5/2)\n' +
            '- **Payout:** `-paysalaries` (CEO/Director/Manager) pays `funds*%` to each role (CEO gets ceo%, each Manager gets manager%), also **auto-paid on `-collect`** with embed field `💼 Salaries Paid`\n' +
            '- **Example:** `-setsalary ceo 7` → CEO gets 7% of funds on next collect\n' +
            '- **Trade:** now clearly uses **company funds** (not CEO personal) — trademenu Step4 shows `Market 50 +5% = 52` from buyer company funds → seller'
        ));
        pages.push(new EmbedBuilder().setTitle('📋 Changelog — v4.23 Gold Rush Configurable').setColor(0xFFD700).setFooter({ text: 'Page 3/25 • Use buttons/menu to navigate' }).setDescription(
            '**v4.23 — Gold Rush Configurable (secret)**\n' +
            '- **No permanent bonus:** 0 RN — `-goldrush` (Primary/Co-Primary) menu Step1 SSR (gold SSRs only: Russian, Georgian, Armenian, Kazakh, Uzbek, Nuristani, Kirghiz) → Step2 duration 24/30/36/48h → Step3 boost 25/50/75/100/150%\n' +
            '- **Effect:** +XX% Gold weight for that SSR for YY hours via `-work` (Gold qty 2 during rush) and `-collect` Gold Mine (+50% prod), announced in chosen SSR work_zone + Nuristani workzone `1538704555670245448`\n' +
            '- **Visible:** `-spawnrates <SSR>` shows `⛏️ GOLD RUSH +XX%` weight, `gold_rush` exposed via API/website'
        ));
        pages.push(new EmbedBuilder().setTitle('📋 Changelog — v4.22 Total Rubles + Gold Fix').setColor(0xFFD700).setFooter({ text: 'Page 4/25 • Use buttons/menu to navigate' }).setDescription(
            '**v4.22 — Total Rubles + Gold Fix**\n' +
            '- **Total Rubles in Circulation:** new `total_rubles_history[100]` (Σ cash+bank for every citizen, even 0) — `api/ussr/overview` + `ussr.js` + website card `TOTAL RUBLES` with history graph (100 pts, 5min), `change %` now flat 0% until real data (was random)\n' +
            '- **Gold Standard % fix:** `moneySupply` now only `users+companies` (was incorrectly `+reserves+printed` → always ~0.3% FIAT) — matches `bot:getMoneySupply()`'
        ));
        pages.push(new EmbedBuilder().setTitle('📋 Changelog — v4.20 Work Food Setting (current)').setColor(0xFFD700).setFooter({ text: 'Page 5/25 • Use buttons/menu to navigate' }).setDescription(
            '**v4.20 — Work Food Setting (current)**\n' +
            '- **Company setting:** CEO/Director/Manager can now set **which food is consumed per -work** via `-setworkfood <item|auto>` / `-workfood` to view. Was always lowest food (Wheat 1🍞) — now you can choose Fish 2🍞 (wasteful if you have fish surplus) or Bread 3🍞 etc.\n' +
            '- **Why Fish 2🍞 is wasteful:** 1 work needs 1🍞, but Fish is 2🍞 — consuming 1 Fish wastes 1🍞 vs Wheat 1🍞. Set to `Wheat` to save fish for trade. `auto` = lowest first (most efficient).\n' +
            '- **Work now costs 1 food:** `1-2` resources per shift + `1🍞` from company (60% yield if hungry). Without food, 60% yield. Embed shows `🍞 -1 Fish x1` etc.\n' +
            '- `showCompanyInfo` now shows `🍞 Work Food` field.'
        ));
        pages.push(new EmbedBuilder().setTitle('📋 Changelog — v4.19 Trade Approval + Menu + Scheduled').setColor(0xFFD700).setFooter({ text: 'Page 2/20 • Use buttons/menu to navigate' }).setDescription(
            '**v4.19 — Trade Approval + Menu + Scheduled**\n' +
            '- **Approval:** `-trade <company> <item> <qty>` now creates **pending request** — target company owner/director/manager must **✅ Accept / ❌ Decline** within 5 min (buttons). No more instant steal. Cross-SSR 12% / cross-region 18% bonus only on accept.\n' +
            '- **Menu:** `-trademenu` / `-trademarket` — interactive 3-step Discord selects: pick company → pick item from your inventory → pick qty (1,2,3,5,10,25). Then sends same approval request.\n' +
            '- **Scheduled:** `-scheduletrade <company> <item> <qty> <hourly|daily|weekly>` — auto-sends every interval if you have stock (max 5 per company). `-tradeschedules` list, `-cancelschedule <id>`. Runs hourly check, notifies event channel.\n' +
            '- Fixes `pendingTrades` Map + `trade_schedules` in `economy_data.json`'
        ));
        pages.push(new EmbedBuilder().setTitle('📋 Changelog — v4.18 Work Balanced — Free Resources Nerfed').setColor(0xFFD700).setFooter({ text: 'Page 3/20 • Use buttons/menu to navigate' }).setDescription(
            '**v4.18 — Work Balanced — Free Resources Nerfed**\n' +
            '- **Work:** `1-3 → 1-2` per shift (free resources nerfed ~33%). Now costs **1🍞 food** from company (consumes lowest food). No food → **60% yield** (hungry). Must feed companies via Fish/Bread trade or farm.\n' +
            '- Fixes infinite free loop: work → free ore → craft → sell → inflation. Now work needs food upkeep, 10 planks ~800 not 1.2k, Shale Oil 95 not 107.\n' +
            '- Embed shows `🍞 -1 food (Wheat x1)` or `⚠️ No food — 60% yield`.\n' +
            '- `Shale Oil 107→95` already in v4.17 but work is the real balancer.'
        ));
        pages.push(new EmbedBuilder().setTitle('📋 Changelog — v4.17 Hotfix Planks + Export + Shale Oil').setColor(0xFFD700).setFooter({ text: 'Page 4/20 • Use buttons/menu to navigate' }).setDescription(
            '**v4.17 — Hotfix Planks + Export + Shale Oil**\n' +
            '- **Planks nerf:** `Timber Planks 71→59` (was 1.2k for 10) — raw_cost×1.28+10 now, `Iron 161→143` etc, Store `1.5×→1.25×` — 10 planks now ~590 base → ~800-900 with bonuses (was 1.2k)\n' +
            '- **Oil Shale:** was dead — now `Shale Oil` `Oil Shale 4 → 95 🪨` (was 85, now 95 after tuning) (Estonian exclusive), Baltic now trade-relevant for fuel\n' +
            '- **Export:** `-export <item> [qty]` sells outside USSR at **55%×inflation** (intentionally not profitable vs `factorydeal 100-150%` + trade 18%) — dump surplus only\n' +
            '- `v3.4.2` bump, synced `bot.js` `mjs` `js` `overview.js`'
                ));
pages.push(new EmbedBuilder().setTitle('📋 Changelog — v4.18 Work Balanced — Free Resources Nerfed').setColor(0xFFD700).setFooter({ text: 'Page 2/19 • Use buttons/menu to navigate' }).setDescription(
            '**v4.18 — Work Balanced — Free Resources Nerfed**\n' +
            '- **Work:** `1-3 → 1-2` per shift (free resources nerfed ~33%). Now costs **1🍞 food** from company (consumes lowest food). No food → **60% yield** (hungry). Must feed companies via Fish/Bread trade or farm.\n' +
            '- Fixes infinite free loop: work → free ore → craft → sell → inflation. Now work needs food upkeep, 10 planks ~800 not 1.2k, Shale Oil 95 not 107.\n' +
            '- Embed shows `🍞 -1 food (Wheat x1)` or `⚠️ No food — 60% yield`.\n' +
            '- `Shale Oil 107→95` already in v4.17 but work is the real balancer.'
        ));
        pages.push(new EmbedBuilder().setTitle('📋 Changelog — v4.17 Hotfix Planks + Export + Shale Oil').setColor(0xFFD700).setFooter({ text: 'Page 3/19 • Use buttons/menu to navigate' }).setDescription(
            '**v4.17 — Hotfix Planks + Export + Shale Oil**\n' +
            '- **Planks nerf:** `Timber Planks 71→59` (was 1.2k for 10) — raw_cost×1.28+10 now, `Iron 161→143` etc, Store `1.5×→1.25×` — 10 planks now ~590 base → ~800-900 with bonuses (was 1.2k)\n' +
            '- **Oil Shale:** was dead — now `Shale Oil` `Oil Shale 4 → 95 🪨` (was 85, now 95 after tuning) (Estonian exclusive), Baltic now trade-relevant for fuel\n' +
            '- **Export:** `-export <item> [qty]` sells outside USSR at **55%×inflation** (intentionally not profitable vs `factorydeal 100-150%` + trade 18%) — dump surplus only\n' +
            '- `v3.4.2` bump, synced `bot.js` `mjs` `js` `overview.js`'
        ));
        pages.push(new EmbedBuilder().setTitle('📋 Changelog — v4.16 Trade Encouragement & SSR Ores').setColor(0xFFD700).setFooter({ text: 'Page 2/17 • Use buttons/menu to navigate' }).setDescription(
            '**v4.16 — Trade Encouragement & SSR Ores**\n' +
            '- SSR realism: Armenian/Nuristani `Aluminium → Aluminium Ore`, Turkmen `+Sand`, Georgian `+Antimony`, Estonian `Oil Shale` restored — fixes unobtainable Sand/Aluminium Ore/Cement; each high-tier recipe now needs cross-SSR ore\n' +
            '- Trade subsidy: `-trade` now pays **3% intra-SSR / 6% cross-SSR / 10% cross-region** (state printed, 60/40 split). Fertilizer (Phosphorite Baltic + Sulphur Turkmen), Manganese Alloy (Georgian), Aluminium Ore trade all profitable\n' +
            '- Website: **Trade Opportunities** panel shows deficits (e.g. Steel plant needs Manganese), production search already, reactor power note; raw Fish 14 still sellable tiny vs Canned Fish 107 = ~40% leaf profit\n' +
            '- Also rebased SSR lists on website/API (`ussr-economy-data.mjs` `ussr.js` `overview.js`)'
        ));
        pages.push(new EmbedBuilder().setTitle('📋 Changelog — v4.15 Crafting Rebalanced + Sulfur + Search + Nuclear Power').setColor(0xFFD700).setFooter({ text: 'Page 2/16 • Use buttons/menu to navigate' }).setDescription(
            '**v4.15 — Crafting Rebalanced + Sulfur Alias + Search + Nuclear Reactor**\n' +
            '- **Balance:** leaf `raw_cost×1.38+18` → `Iron 40→161`, `Steel 80→371`, `Steel Beam 128→1431`, `Reactor Core 800→9402`, `Canned Fish 38→122` etc — raw Fish 14 vs Canned 122 = ~60% profit over raw+iron, so crafting beats raw but raw still tiny profit\n' +
            '- **Sulfur:** `Sulphur`/`Sulfur` alias both `25`/`3` — `canonRes()` normalizes, SSR Turkmen Sand added\n' +
            '- **Search:** Production `CRAFTING` now has live `#recipeSearch` filtering item/ingredients + count, margin vs leaf raw\n' +
            '- **Nuclear Reactor:** `180k` `Uranium Rod2+Steel Beam2` `+30%` factories when powered, `70%` brownout if >2 factories unpowered (`getPowerMultiplier`)\n' +
            '- Synced `bot.js` `ussr-economy-data.mjs` `ussr.js` `overview.js` values + `v3.2.0` bump'
        ));
        pages.push(new EmbedBuilder().setTitle('📋 Changelog — v4.14 Per-SSR Spawn + Compensation + Admin + Live Fix').setColor(0xFFD700).setFooter({ text: 'Page 3/16 • Use buttons/menu to navigate' }).setDescription(
            '**v4.14 — Per-SSR Spawn Rates + Compensation + Admin Overhaul + Live CORS Fix**\n' +
            '- **Per-SSR weights:** `RESOURCE_WEIGHTS` global fallback + `ssr_resource_weights[SSR][res]` override — `getResourceWeight(SSR,res)` — `-spawnrates` / `-setspawnrate <SSR> <res> <0-50>` / `-resetspawnrate` (admin only). Changing Russian Gold 2→5 does NOT affect Estonian.\n' +
            '- **Compensation:** restored `Potash 56/6, Oil Shale 19/10, Zinc 38/7, Amber 75/2` + one-time grant `Byelorussian Potash / Estonian Oil Shale / Nuristani Zinc` (State Mining +1836, Baltic +1606) + `repairCompanyState` init\n' +
            '- **Admin:** UnbelievaBoat-style dark sidebar redesign, per-SSR editor, live stats, compensation log (wording without attribution)\n' +
            '- **Live:** `api/ussr/overview` CORS headers + `includeFiles: economy_data.json`, `ussr.js` retries `l6ycclr1f`/`hxprrwyds` + raw GitHub fallback + `v3.3.0` bust; `Pravda` ticker + Five-Year Plan + Stakhanovite'
        ));
        pages.push(new EmbedBuilder().setTitle('📋 Changelog — v4.13 Collect Profit Fixed').setColor(0xFFD700).setFooter({ text: 'Page 4/16 • Use buttons/menu to navigate' }).setDescription(
            '**v4.13 — Collect Profit Fixed**\n' +
            '- -collect cost: 25% → 10% of YOUR stock, min 5 max 25 (was 50 on 200) — never wipes; 200 → 20 not 50\n' +
            '- MINES buffed 2.5×: Iron 2→5, Coal 3→6, Copper 2→5, Gold 1→2, Uranium 1→2, Oil Rig 2→5, Timber 3→6, Farm 3→6\n' +
            '- FACTORIES buffed: Steel Mill/Machine Shop/Refinery 2→4, Nuclear 1→3, Electronics 2→4, Bakery 3→5, Winery 2→4\n' +
            '- Food sell nerf -35%: Bread 45→28, Cake 80→45, Wine 60→35, Canned Food 48→30, Canned Fish 62→38, Smoked Fish 48→28, Fish Stew 55→32, Tea Pack 50→32, Citrus Juice 48→30 — collecting now ~2.5× more profitable than selling food'
        ));
        pages.push(new EmbedBuilder().setTitle('📋 Changelog — v4.12 Useless Resources Fixed').setColor(0xFFD700).setFooter({ text: 'Page 7/13 • Use buttons/menu to navigate' }).setDescription(
            '**v4.12 — Useless Resources Fixed**\n' +
            '- 14 dead resources now useful: Peat→Peat Fuel (Peat 4+Coal1→58), Natural Gas→Gas Fuel (Gas 3→64), Phosphorite+Peat+Sulphur→Fertilizer, Cotton→Fabric, Manganese→Alloy, Sunflower→Oil, Flax→Linen, Corn→Meal, Tea→Pack, Citrus→Juice, Antimony/Molybdenum→Alloy/Rod, Aluminium→Sheet\n' +
            '- FOOD_VALUES added: Sunflower Oil 1, Corn Meal 2, Tea Pack 1, Citrus Juice 2 — farming those now feeds -collect\n' +
            '- Website sync: ussr.js + ussr-economy-data.mjs updated with same 13 recipes\n' +
            '- Remaining: Wine raw duplicate noted, all other SSR resources now have crafted value'
        ));
        pages.push(new EmbedBuilder().setTitle('📋 Changelog — v4.11 Balanced Food & Admin Security').setColor(0xFFD700).setFooter({ text: 'Page 8/13 • Use buttons/menu to navigate' }).setDescription(
            '**v4.11 — Balanced Food & Admin Security**\n' +
            '- Food halved: FOOD_PER_EMPLOYEE 2→1, FOOD_PER_SSR_POP 0.5→0.2; -collect now per-company (getCollectFoodDemand = your employees*1 + pop*0.2/companies, min 3) not region-total (was 110 per collect → 11)\n' +
            '- New consumeCollectFood: eats your pantry first, spills to neighbours only if short (was richest-first wiped neighbours)\n' +
            '- Every SSR seeded 200 food: new companies start 200 Wheat (repairCompanyState tops <200), state corps 200 Wheat, mock data 200 Wheat — no instant starvation\n' +
            '- Admin password removed from public GitHub (was const PASS GOSPLAN2024). Now POST /api/admin/verify uses Vercel env ADMIN_PASSWORD, local dev falls back to browser localStorage. GitHub Pages has no secret.'
        ));
        pages.push(new EmbedBuilder().setTitle('📋 Changelog — v4.10 Canned Fish & Trade Variants').setColor(0xFFD700).setFooter({ text: 'Page 9/13 • Use buttons/menu to navigate' }).setDescription(
            '**v4.10 — Canned Fish Variants & Trade Incentives**\n' +
            '- New recipes: **Canned Fish** (Fish 2 + Iron Ore 2 → 5 food, 62 rubles, 🐟), **Smoked Fish** (Fish 2 + Coal 2 → 4 food), **Fish Stew** (Fish 2 + Wheat 2 + Salt 1 → 5 food) — each needs Baltic Fish + inland Iron/Coal/Wheat/Salt → forces inter-SSR trade via -trade\n' +
            '- Added to FOOD_VALUES (Canned Fish 5, Smoked Fish 4, Fish Stew 5) and CRAFTING_RECIPES; -recipes auto-lists them; Fish now high trade value\n' +
            '- Trade bundle: -trade already supports qty 1-10, now more cross-region recipes encourage bulk hardware/food trade; validCommands fixed to include goldstandard + all aliases (no Unknown command errors)\n' +
            '- Help updated: Page 3 notes craft with qty, Page 5 notes market/demand; guide: Fish variants encourage SSR interdependence'
        ));
        pages.push(new EmbedBuilder().setTitle('📋 Changelog — v4.9 Player Factories & Specialization').setColor(0xFFD700).setFooter({ text: 'Page 10/13' }).setDescription(
            '**v4.9 — Player Factories, Specialization, More Events & World Map**\n' +
            '- Player factories: companies choose specialization via -specialize <extraction|agriculture|production> (DB via code: State corps pre-assigned, private must choose). Production = player factories buy raw from extraction/agri via -trade, get +15% sale bonus to factories/state.\n' +
            '- Specialization bonus: extraction mines/oil +25%, agriculture farm/timber +25%, production factories +25% & sale +15%; off-spec -15% (collect). Non-native mine half yield (×0.5) still applies.\n' +
            '- More events: 10 new RANDOM_EVENTS (Siberian Winter, Five-Year Plan, Grain Embargo, Black Market Raid, Pipeline Burst, Baltic Storm, Caucasus Conflict, Arctic Convoy, Chernobyl, Sputnik) + 5 COLLECT_EVENTS (Harvest Festival, Factory Fire, Trade Union Deal, Power Outage, Export Boom)\n' +
            '- World map: -worldmap / -map / -world shows 6 regions, 15 SSRs, pop, food stock/demand, specs, trade tip'
        ));
        pages.push(new EmbedBuilder().setTitle('📋 Changelog — v4.8 Resign & Work Timer').setColor(0xFFD700).setFooter({ text: 'Page 11/13 • Use buttons/menu to navigate' }).setDescription(
            '**v4.8 — Resign & Work Timer**\n' +
            '- -resign / -quit / -leave / -quitjob — any employed worker/director can quit; owner blocked, director clears State Director, worker decrements employees, atomic saveData\n' +
            '- Work cooldown now Discord local timer: Try again <t:unix:R> (<t:unix:F> — Xm Ys left) and work complete footer Next <t:unix:R>\n' +
            '- Help updated to list resign and timer'
        ));
        pages.push(new EmbedBuilder().setTitle('📋 Changelog — v4.7 Bulk Selling').setColor(0xFFD700).setFooter({ text: 'Page 12/13 • Use buttons/menu to navigate' }).setDescription(
            '**v4.7 — Bulk Selling**\n' +
            '- -craftpersonal / -craftcompany now accept qty: -craft Steel Ingot 3, -craftcompany Steel Ingot 10 (max 100, scales ingredients)\n' +
            '- -factorydeal chooser now 2-step: pick item -> pick qty 1-10 (up to stock, smart options 1,2,3,5,10), hardware 3 at once works\n' +
            '- -govcontract same: item then qty 1-10 chooser (State), price scales with qty * supply/demand\n' +
            '- -sellitem / -transferitem / -trade already supported qty 1-100; help updated to show [qty]'
        ));
        pages.push(new EmbedBuilder().setTitle('📋 Changelog — v4.6 Demand Balanced & Help').setColor(0xFFD700).setFooter({ text: 'Page 13/13 • Use buttons/menu to navigate' }).setDescription(
            '**v4.6 — Demand Balanced & Help Complete**\n' +
            '- Demand now balanced by employed count: getBalancedDemandTarget = 1.4 - (supply/(employed*2.5))*0.4, recover toward balanced target (not fixed 100%), initial demand = balanced (not always high)\n' +
            '- Low supply per employee => high demand, glut => low demand (approx 60-140%)\n' +
            '- Help updated: shows ALL commands with aliases (-balance/-bal, -leaderboard/-lb, -trade/-ssrtrade, -foodstatus/-food, -demand/-globaldemand, -consumption/-serverconsumption, -market/-aistore/-store/-supply, -nationalminimumwage/-minwage, wage split note)\n' +
            '- Wage split clarified: BASE_WAGE_PRINT=15 state prints min(wage,15), company pays max(0,wage-15) from funds, blocked if short'
        ));
        pages.push(new EmbedBuilder().setTitle('📋 Changelog — v4.5 SSR Food & Trade (region-level)').setColor(0xFFD700).setFooter({ text: 'Page 14/13 • Use buttons/menu to navigate' }).setDescription(
            '**v4.5 — SSR Food & Trade (v4.5.1 region-level)**\n' +
            '- Baltic SSRs now produce Fish (2 food, 14 rubles, weight 22) — Estonia/Latvia/Lithuania\n' +
            '- Food system: REGION-LEVEL stockpile (6 WORK_ZONES, not company/SSR) — -collect needs regional food (regionEmployees*2 + regionPop*0.5), census via SSR roles summed per region\n' +
            '- Without food region cannot -collect (shows region need/have); food consumed via consumeRegionFood across all companies in region (shared pool, Fish feeds its region)\n' +
            '- -trade <company> <item> <qty> — inter-region trade, auto-detects multi-word names, gold-locked\n' +
            '- -foodstatus [all|<company|region|SSR>] — shows REGION demand vs stock (all 6 regions, or single region), Fish tip\n' +
            '- Values: Fish 2, Bread 3, Canned 4, etc. Inland regions must import Fish via trade'
        ));
        pages.push(new EmbedBuilder().setTitle('📋 Changelog — v4.4 Fish + Market Graphs').setColor(0xFFD700).setFooter({ text: 'Page 15/13 • Use buttons/menu to navigate' }).setDescription(
            '**v4.4 — Fish + Market Graphs**\n' +
            '- Fish added to Baltics as above\n' +
            '- -demand [item] / -globaldemand: demand 60-150% bars, per-item history (60 cap)\n' +
            '- -consumption [item] / -globalconsumption: server AI-Store consumption totals + per-item history\n' +
            '- -market [item] / -aistore / -supply: overview top Store/Consumed/Demand/Supply, AI Store text'
        ));
        pages.push(new EmbedBuilder().setTitle('📋 Changelog — v4.3 Balanced Market, Gold Lock & AI Store').setColor(0xFFD700).setFooter({ text: 'Page 16/13 • Use buttons/menu to navigate' }).setDescription(
            '**v4.3 — Balanced Market, Gold Lock & AI Store Cycle**\n' +
            '- Cooldowns: -factorydeal 30m/company, -govcontract 1h global (getCooldownRemaining)\n' +
            '- Supply/Demand: getSupplyFactor (0 stock->1.35x, 120->0.6x) & getDemandFactor (0.6-1.5), recovers 10m ticks 6h half-life\n' +
            '- No premiums — price = base x inflation x supply x demand x quality (0.95-1.05)\n' +
            '- Gold lock: Gold/Gold Bar never to AI factories, only State when getGoldBackingRatio >=100% (sellitem/govcontract blocked)\n' +
            '- Chooser UI: -factorydeal & -govcontract now show select menu of owned crafted items (warning crafted > raw), 60s collector\n' +
            '- AI Store cycle: ai_store receives sold goods, AI customers buy 1-2/15m, recordConsumption, addToAIStore'
        ));
        pages.push(new EmbedBuilder().setTitle('📋 Changelog — v4.2 Craft & v4.1 Fire/Employees').setColor(0xFFD700).setFooter({ text: 'Page 17/13 • Use buttons/menu to navigate' }).setDescription(
            '**v4.2 — Craft Personal/Company**\n' +
            '- -craftpersonal <item> / -craft alias: uses personal resources/inventory (raw->resources, crafted->inventory)\n' +
            '- -craftcompany <item>: uses company inventory (employed/director only), updates price\n\n' +
            '**v4.1 — Fire & Employees**\n' +
            '- -fire @user: owner/director only, decrements employees, DM to fired\n' +
            '- -employees [all|<company>]: employees/directors only, sorts managers first, shows 25, all-companies overview'
        ));
        pages.push(new EmbedBuilder().setTitle('📋 Changelog — v4.0 & Earlier').setColor(0xFFD700).setFooter({ text: 'Page 18/13 • Use buttons/menu to navigate' }).setDescription(
            '**v4.0 — Fix Employed Can\'t -work**\n' +
            '- Atomic ensureUserRecord + single saveData fixes hire/-foundcompany double-save overwriting is_employed\n' +
            '- Affected: -work, hire accept, foundcompany, transferitem/invest/buyshares/sellshares\n' +
            '- -work now ensureUserRecord, supply/demand wage, SSR role auto-detect single save\n\n' +
            '**v3.4 — SSR Region Mapping**\n- Fixed SSR to work_zone mapping\n\n' +
            '**v3.3 — CEO Detection**\n- Fixed getUserCompany()\n\n' +
            '**v3.2 — Wage System**\n- Added -setwage, company pays wage from funds'
        ));
        // dynamic footer + page counter
        pages.forEach((p,i)=> p.setFooter({ text: `Page ${i+1}/${pages.length} • Use buttons/menu to navigate` }));
        const row1 = new ActionRowBuilder();
        const prevBtn = new ButtonBuilder().setCustomId('cl_prev').setLabel('◀ Previous').setStyle(ButtonStyle.Primary).setDisabled(true);
        const nextBtn = new ButtonBuilder().setCustomId('cl_next').setLabel('Next ▶').setStyle(ButtonStyle.Primary);
        const pageBtn = new ButtonBuilder().setCustomId('cl_page').setLabel(`1/${pages.length}`).setStyle(ButtonStyle.Secondary).setDisabled(true);
        row1.addComponents(prevBtn, pageBtn, nextBtn);
        const row2 = new ActionRowBuilder();
        const menu = new StringSelectMenuBuilder().setCustomId('cl_menu').setPlaceholder('Jump to version...').addOptions(
            new StringSelectMenuOptionBuilder().setLabel('v4.20 Work Food Setting').setValue('0'),
            new StringSelectMenuOptionBuilder().setLabel('v4.19 Trade Approval + Menu/Scheduled').setValue('1'),
            new StringSelectMenuOptionBuilder().setLabel('v4.18 Work Balanced (free nerf)').setValue('2'),
            new StringSelectMenuOptionBuilder().setLabel('v4.17 Planks Hotfix + Export/Shale Oil').setValue('3'),
            new StringSelectMenuOptionBuilder().setLabel('v4.16 Trade & SSR Ores').setValue('4'),
            new StringSelectMenuOptionBuilder().setLabel('v4.15 Rebalance + Sulfur/Search/Reactor').setValue('5'),
            new StringSelectMenuOptionBuilder().setLabel('v4.14 Per-SSR Spawn + Compensation').setValue('6'),
            new StringSelectMenuOptionBuilder().setLabel('v4.13 Collect Profit').setValue('7'),
            new StringSelectMenuOptionBuilder().setLabel('v4.12 Useless Fix').setValue('8'),
            new StringSelectMenuOptionBuilder().setLabel('v4.11 Balanced Food').setValue('9'),
            new StringSelectMenuOptionBuilder().setLabel('v4.10 Canned Fish').setValue('10'),
            new StringSelectMenuOptionBuilder().setLabel('v4.9 Factories & Spec').setValue('11'),
            new StringSelectMenuOptionBuilder().setLabel('v4.8 Resign & Timer').setValue('12'),
            new StringSelectMenuOptionBuilder().setLabel('v4.7 Bulk').setValue('13'),
            new StringSelectMenuOptionBuilder().setLabel('v4.6 Demand Balanced').setValue('14'),
            new StringSelectMenuOptionBuilder().setLabel('v4.5 Food & Trade').setValue('15'),
            new StringSelectMenuOptionBuilder().setLabel('v4.4 Fish & Graphs').setValue('16'),
            new StringSelectMenuOptionBuilder().setLabel('v4.3 Market & Gold').setValue('17'),
            new StringSelectMenuOptionBuilder().setLabel('v4.2-4.1 Craft/Fire').setValue('18'),
            new StringSelectMenuOptionBuilder().setLabel('v4.0 & earlier').setValue('19')
        );
        row2.addComponents(menu);
        const reply = await message.reply({ embeds: [pages[0]], components: [row1, row2], fetchReply: true });
        let cur = 0;
        const collector = reply.createMessageComponentCollector({ filter: i => i.user.id === message.author.id, time: 120000 });
        collector.on('collect', async (interaction) => {
            if (interaction.isButton()) {
                if (interaction.customId === 'cl_prev' && cur > 0) cur--;
                else if (interaction.customId === 'cl_next' && cur < pages.length - 1) cur++;
                else { await interaction.deferUpdate(); return; }
                const newRow1 = new ActionRowBuilder();
                const newPrev = ButtonBuilder.from(prevBtn).setDisabled(cur === 0);
                const newNext = ButtonBuilder.from(nextBtn).setDisabled(cur === pages.length - 1);
                const newPage = ButtonBuilder.from(pageBtn).setLabel(`${cur+1}/${pages.length}`);
                newRow1.addComponents(newPrev, newPage, newNext);
                await interaction.update({ embeds: [pages[cur]], components: [newRow1, row2] });
            } else if (interaction.isStringSelectMenu()) {
                cur = parseInt(interaction.values[0]);
                const newRow1 = new ActionRowBuilder();
                const newPrev = ButtonBuilder.from(prevBtn).setDisabled(cur === 0);
                const newNext = ButtonBuilder.from(nextBtn).setDisabled(cur === pages.length - 1);
                const newPage = ButtonBuilder.from(pageBtn).setLabel(`${cur+1}/${pages.length}`);
                newRow1.addComponents(newPrev, newPage, newNext);
                await interaction.update({ embeds: [pages[cur]], components: [newRow1, row2] });
            }
        });
        collector.on('end', async () => { try { await reply.edit({ components: [] }); } catch {} });
        return;
    }

    // ============================================================
    // ECONSTATS
    // ============================================================
    
    if (command === 'econstats') {
        const data = loadData();
        let totalCash = 0, totalBank = 0, totalEmployees = 0;
        for (const [uid, uData] of Object.entries(data.users)) {
            totalCash += uData.cash || 0;
            totalBank += uData.bank || 0;
            if (uData.is_employed) totalEmployees++;
        }
        let totalCompanyValue = 0, totalMarketCap = 0;
        for (const [cid, company] of Object.entries(data.companies)) {
            totalCompanyValue += calculateCompanyValue(company);
            totalMarketCap += company.market_cap || 0;
        }
        // State bank — now correctly counted (was missing live UnbelievaBoat sync, now fixed via addToStateBank sync)
        const stateBank = data.users[STATE_BANK_USER_ID] || {};
        const stateBankCash = stateBank.cash || 0;
        const stateBankBank = stateBank.bank || 0;
        const stateBankTotal = stateBankCash + stateBankBank;
        // Try live fetch for most accurate (if token available, else use cached)
        let liveStateBank = stateBankTotal;
        try {
            const [liveCash, liveBank] = await getUnbBalance(STATE_BANK_USER_ID);
            if (liveCash + liveBank > 0) liveStateBank = liveCash + liveBank;
        } catch {}
        const totalRubles = totalCash + totalBank; // includes state bank cash+bank (now synced)
        const totalRublesLive = totalRubles - stateBankTotal + liveStateBank; // use live if available
        const inflation = data.inflation || 0;
        const moneyPrinted = data.money_printed || 0;
        const gsi = getGSIPrice();
        
        const citizenDeposits = Math.max(0, totalBank - stateBankBank);
        const citizenCash = Math.max(0, totalCash - stateBankCash);
        const embed = new EmbedBuilder()
            .setTitle('📊 Economic Statistics')
            .setColor(0x5865F2)
            .setFooter({ text: '🇺🇸🇸🇷 USSR Economy — State Bank now counted in circulation & total' })
            .addFields(
                { name: '💰 Total Rubles', value: `${formatMoney(totalRublesLive)}${totalRublesLive!==totalRubles?` (${formatMoney(totalRubles)} cached)`:''}`, inline: true },
                { name: '💵 Total Cash', value: `${formatMoney(totalCash)} (citizen ${formatMoney(citizenCash)} + state ${formatMoney(stateBankCash)})`, inline: true },
                { name: '🏦 Citizen Deposits', value: formatMoney(citizenDeposits), inline: true },
                { name: '🏛️ State Bank', value: `${formatMoney(liveStateBank)} (cash ${formatMoney(stateBankCash)} + bank ${formatMoney(stateBankBank)}${liveStateBank!==stateBankTotal?` live ${formatMoney(liveStateBank)}`:''})`, inline: true },
                { name: '📈 GSI Price', value: formatMoney(gsi), inline: true },
                { name: '🏢 Companies', value: `${Object.keys(data.companies).length}`, inline: true },
                { name: '👤 Citizens', value: `${Object.keys(data.users).length}`, inline: true },
                { name: '👷 Employed', value: `${totalEmployees}`, inline: true },
                { name: '📊 Inflation', value: `${inflation.toFixed(2)}%`, inline: true },
                { name: '💸 Money Printed', value: formatMoney(moneyPrinted), inline: true },
                { name: '🏗️ Company Value', value: formatMoney(totalCompanyValue), inline: true },
                { name: '📈 Market Cap', value: formatMoney(totalMarketCap), inline: true }
            );
        await message.reply({ embeds: [embed] });
        return;
    }

    // ============================================================
    // GSI
    // ============================================================
    
    if (command === 'gsi') {
        const price = getGSIPrice();
        const data = loadData();
        const history = data.gsi_history || [];
        let change = 0;
        if (history.length >= 2) {
            const old = history[0].price;
            change = ((price - old) / old * 100);
        }
        const embed = new EmbedBuilder()
            .setTitle('📈 GSI Index')
            .setColor(0xFFD700)
            .setFooter({ text: '🇺🇸🇸🇷 USSR Economy' })
            .addFields(
                { name: 'Current', value: formatMoney(price), inline: true },
                { name: 'Change', value: `${change.toFixed(2)}%`, inline: true },
                { name: 'Inflation', value: `${getInflation().toFixed(2)}%`, inline: true }
            );
        await message.reply({ embeds: [embed] });
        return;
    }

    // ============================================================
    // GOLDSTANDARD - ruble/gold parity dashboard
    // ============================================================

    if (command === 'goldstandard') {
        const data = loadData();
        const goldPrice = getGoldPrice();
        const stock = getGoldStock(data);
        const supply = getMoneySupply(data);
        const ratio = getGoldBackingRatio(data);
        const status = getGoldStandardStatus(ratio);

        const barLength = 20;
        const filled = Math.min(barLength, Math.round((Math.min(ratio, 100) / 100) * barLength));
        const bar = '█'.repeat(filled) + '░'.repeat(barLength - filled);

        const embed = new EmbedBuilder()
            .setTitle(`🥇 Gold Standard — ${status.label}`)
            .setColor(status.color)
            .setDescription(status.note)
            .setFooter({ text: '🇺🇸🇸🇷 USSR Economy' })
            .addFields(
                { name: '₽ / Gold Unit', value: formatMoney(goldPrice), inline: true },
                { name: 'Gold in Circulation', value: `${stock.toLocaleString()} units`, inline: true },
                { name: 'Money Supply', value: formatMoney(supply), inline: true },
                { name: 'Gold Coverage', value: `${ratio.toFixed(2)}%\n\`${bar}\``, inline: false },
                { name: 'Inflation', value: `${getInflation().toFixed(2)}% (erodes the peg)`, inline: true }
            );
        await message.reply({ embeds: [embed] });
        return;
    }

    // ============================================================
    // GSIGRAPH
    // ============================================================
    
    if (command === 'gsigraph') {
        const data = loadData();
        const history = data.gsi_history || [];
        if (history.length < 2) {
            await message.reply('Not enough data!');
            return;
        }
        const prices = history.map(h => h.price);
        const current = prices[prices.length - 1];
        const minVal = Math.min(...prices);
        const maxVal = Math.max(...prices);
        const range = Math.max(1, maxVal - minVal);
        const display = prices.slice(-10);
        let lines = [`**Current:** ${formatMoney(current)}`, ''];
        for (let i = 0; i < display.length; i++) {
            const barLen = Math.floor((display[i] - minVal) / range * 12) + 1;
            const bar = '▬'.repeat(Math.min(barLen, 20));
            lines.push(`${String(i+1).padStart(2, '0')} ${bar} ${formatMoney(display[i])}`);
        }
        lines.push('');
        lines.push(`**High:** ${formatMoney(maxVal)}  **Low:** ${formatMoney(minVal)}`);
        if (prices.length >= 2) {
            const change = ((prices[prices.length-1] - prices[0]) / prices[0] * 100);
            const emoji = change > 0 ? '📈' : change < 0 ? '📉' : '➖';
            lines.push(`**Change:** ${emoji} ${change.toFixed(2)}%`);
        }
        const embed = new EmbedBuilder()
            .setTitle('📈 GSI History')
            .setDescription('```\n' + lines.join('\n') + '\n```')
            .setColor(0xFFD700)
            .setFooter({ text: '🇺🇸🇸🇷 USSR Economy' });
        await message.reply({ embeds: [embed] });
        return;
    }

    // ============================================================
    // MARKET — DEMAND / CONSUMPTION / STORE GRAPHS
    // ============================================================

    if (command === 'demand' || command === 'globaldemand' || command === 'marketdemand' || command === 'demandgraph') {
        const data = loadData();
        const query = args.join(' ').trim();
        if (query) {
            const item = Object.keys(CRAFTING_RECIPES).find(k => k.toLowerCase() === query.toLowerCase()) || query;
            if (!CRAFTING_RECIPES[item] && !RESOURCE_VALUES[item]) {
                await message.reply(`❌ Unknown item '${query}'. Try \`-demand\` for all items or \`-recipes\` for list.`);
                return;
            }
            const hist = (data.demand_history && data.demand_history[item]) || [];
            const curDemand = getDemandFactor(data, item);
            const curSupply = getMarketSupply(data, item);
            const supplyF = getSupplyFactor(data, item);
            if (hist.length < 2) {
                const bar = buildBar(curDemand, 1.5, 15);
                const embed = new EmbedBuilder()
                    .setTitle(`📈 Demand — ${item} ${CRAFTING_RECIPES[item]?.emoji || ''}`)
                    .setColor(0x5865F2)
                    .setDescription(`\`${bar}\` **${(curDemand*100).toFixed(0)}% demand**\n\`${buildBar(supplyF,1.4,15)}\` **${(supplyF*100).toFixed(0)}% supply** (stock ${curSupply})`)
                    .addFields(
                        { name: '📦 Supply in market', value: `${curSupply} units`, inline: true },
                        { name: '📈 Supply factor', value: `${(supplyF*100).toFixed(0)}%`, inline: true },
                        { name: '🏪 In AI Store', value: `${(data.ai_store?.[item]||0)}`, inline: true },
                        { name: '💡 Tip', value: 'Demand drops after factory/state sales, recovers ~6h. Supply high → price low.', inline: false }
                    )
                    .setFooter({ text: 'No history yet — sell to factories to generate demand curve.' });
                await message.reply({ embeds: [embed] });
                return;
            }
            const demands = hist.map(h => h.demand);
            const min = Math.min(...demands, 0.6);
            const max = Math.max(...demands, 1.5);
            const range = Math.max(0.1, max - min);
            const display = demands.slice(-12);
            let lines = [`**${item}** demand history (last ${display.length})`, `Current: ${(curDemand*100).toFixed(0)}%  Supply: ${curSupply} (${(supplyF*100).toFixed(0)}%)`, ''];
            display.forEach((d, i) => {
                const len = Math.floor((d - min) / range * 12) + 1;
                const bar = '▬'.repeat(Math.min(len, 12));
                lines.push(`${String(i+1).padStart(2,'0')} ${bar} ${(d*100).toFixed(0)}%`);
            });
            lines.push('');
            lines.push(`High: ${(max*100).toFixed(0)}%  Low: ${(min*100).toFixed(0)}%`);
            const embed = new EmbedBuilder()
                .setTitle(`📈 Demand History — ${item}`)
                .setDescription('```\n' + lines.join('\n') + '\n```')
                .setColor(0x5865F2)
                .setFooter({ text: '🇺🇸🇸🇷 USSR Economy • Demand 60-150%' });
            await message.reply({ embeds: [embed] });
            return;
        }
        // Overview all items
        const items = Object.keys(CRAFTING_RECIPES);
        const entries = items.map(item => ({
            item,
            demand: getDemandFactor(data, item),
            supply: getMarketSupply(data, item),
            supplyF: getSupplyFactor(data, item),
            store: data.ai_store?.[item] || 0
        })).sort((a,b) => b.demand - a.demand);
        const maxDemand = 1.5;
        let lines = ['**Global Demand** (60-150% • 100% = baseline)', ''];
        for (let i=0; i<Math.min(entries.length, 15); i++) {
            const e = entries[i];
            const bar = buildBar(e.demand, maxDemand, 10);
            const emoji = CRAFTING_RECIPES[e.item]?.emoji || '📦';
            lines.push(`${String(i+1).padStart(2,'0')} ${bar} ${emoji} ${e.item} ${(e.demand*100).toFixed(0)}% sup:${(e.supplyF*100).toFixed(0)}%`);
        }
        if (entries.length>15) lines.push(`...and ${entries.length-15} more — use \`-demand <item>\` for detail`);
        const embed = new EmbedBuilder()
            .setTitle('📈 Global Demand — All Crafted Goods')
            .setDescription('```\n' + lines.join('\n') + '\n```')
            .setColor(0x5865F2)
            .setFooter({ text: '🇺🇸🇸🇷 USSR Economy • Use -demand <item> for history graph' })
            .addFields({ name: 'ℹ️ How it works', value: 'Sell to AI factories → demand drops (~4-7%). Recovers ~10m ticks toward 100% over ~6h. High demand = higher price.', inline: false });
        await message.reply({ embeds: [embed] });
        return;
    }

    if (command === 'consumption' || command === 'globalconsumption' || command === 'serverconsumption' || command === 'consumptiongraph' || command === 'globalcons') {
        const data = loadData();
        const query = args.join(' ').trim();
        const cons = data.global_consumption || {};
        if (query) {
            const item = Object.keys(CRAFTING_RECIPES).find(k => k.toLowerCase() === query.toLowerCase()) || query;
            if (!CRAFTING_RECIPES[item] && !RESOURCE_VALUES[item]) {
                await message.reply(`❌ Unknown item '${item}'.`);
                return;
            }
            const total = cons[item] || 0;
            const hist = (data.consumption_history || []).filter(h => h.item === item).slice(-12);
            if (hist.length < 2) {
                const embed = new EmbedBuilder()
                    .setTitle(`🛒 Consumption — ${item}`)
                    .setDescription(`Total consumed (AI customers): **${total}** units\n\nNo history yet.`)
                    .setColor(0x00FF00)
                    .addFields({ name: '🏪 AI Store stock', value: `${data.ai_store?.[item]||0}`, inline: true }, { name: '📦 Market supply', value: `${getMarketSupply(data,item)}`, inline: true });
                await message.reply({ embeds: [embed] });
                return;
            }
            // build cumulative
            let cum = 0;
            const vals = [];
            hist.forEach(h => { cum += h.qty; vals.push(cum); });
            const min = Math.min(...vals);
            const max = Math.max(...vals);
            const range = Math.max(1, max-min);
            let lines = [`**${item}** consumption (cumulative)`, `Total: ${total}`, ''];
            hist.forEach((h, i) => {
                const v = vals[i];
                const len = Math.floor((v-min)/range*12)+1;
                const bar = '▬'.repeat(Math.min(len,12));
                lines.push(`${String(i+1).padStart(2,'0')} ${bar} ${v}`);
            });
            const embed = new EmbedBuilder().setTitle(`🛒 Consumption History — ${item}`).setDescription('```\n'+lines.join('\n')+'\n```').setColor(0x00FF00).setFooter({text:'🇺🇸🇸🇷 USSR Economy • AI Store → Customer'});
            await message.reply({ embeds: [embed] });
            return;
        }
        const entries = Object.entries(cons).filter(([,q])=>q>0).sort((a,b)=>b[1]-a[1]);
        if (entries.length===0) {
            await message.reply('📊 No server consumption yet — AI customers haven\'t bought from Store. Sell to factories (`-factorydeal`) to stock Store, then AI buys every ~15m.');
            return;
        }
        const max = Math.max(...entries.map(([,q])=>q));
        let lines = ['**Server Consumption** — units bought by AI customers from AI Store', ''];
        for (let i=0;i<Math.min(entries.length,15);i++) {
            const [item, qty] = entries[i];
            const bar = buildBar(qty, max, 12);
            const emoji = CRAFTING_RECIPES[item]?.emoji || '📦';
            lines.push(`${String(i+1).padStart(2,'0')} ${bar} ${emoji} ${item} x${qty}`);
        }
        if (entries.length>15) lines.push(`...and ${entries.length-15} more — use \`-consumption <item>\` for detail`);
        lines.push('');
        const totalUnits = Object.values(cons).reduce((a,b)=>a+b,0);
        lines.push(`Unique: ${entries.length}  Total units: ${totalUnits}`);
        const embed = new EmbedBuilder().setTitle('🛒 Global Consumption — Server Total').setDescription('```\n'+lines.join('\n')+'\n```').setColor(0x00FF00).setFooter({text:'🇺🇸🇸🇷 USSR Economy • Use -consumption <item> for per-item history'}).addFields({name:'🏪 AI Store now', value: getAIStoreText(data,5).substring(0,1024) || 'Empty', inline:false});
        await message.reply({ embeds: [embed] });
        return;
    }

    if (command === 'market' || command === 'aistore' || command === 'store' || command === 'supply' || command === 'supplygraph') {
        const data = loadData();
        const query = args.join(' ').trim();
        if (query) {
            const item = Object.keys({ ...RESOURCE_VALUES, ...CRAFTING_RECIPES }).find(k => k.toLowerCase() === query.toLowerCase()) || query;
            const supply = getMarketSupply(data, item);
            const cons = data.global_consumption?.[item] || 0;
            const demand = getDemandFactor(data, item);
            const supplyF = getSupplyFactor(data, item);
            const store = data.ai_store?.[item] || 0;
            const embed = new EmbedBuilder()
                .setTitle(`🏪 Market — ${item} ${CRAFTING_RECIPES[item]?.emoji || RESOURCE_VALUES[item] ? '📦' : ''}`)
                .setColor(0x5865F2)
                .addFields(
                    { name: '📦 Supply (market)', value: `${supply} units\n\`${buildBar(supplyF,1.4,12)}\` ${(supplyF*100).toFixed(0)}% factor`, inline: true },
                    { name: '📈 Demand', value: `${(demand*100).toFixed(0)}%\n\`${buildBar(demand,1.5,12)}\``, inline: true },
                    { name: '🛒 Consumed (AI)', value: `${cons} units`, inline: true },
                    { name: '🏪 AI Store', value: `${store} units`, inline: true },
                    { name: '💰 Base value', value: CRAFTING_RECIPES[item] ? formatMoney(CRAFTING_RECIPES[item].value) : RESOURCE_VALUES[item] ? formatMoney(RESOURCE_VALUES[item]) : '—', inline: true }
                )
                .setFooter({ text: '🇺🇸🇸🇷 USSR Economy • High supply → low price • High demand → high price' });
            await message.reply({ embeds: [embed] });
            return;
        }
        // overview top 10 by market activity
        const allItems = [...new Set([...Object.keys(RESOURCE_VALUES), ...Object.keys(CRAFTING_RECIPES)])].slice(0, 30);
        // show top store + top consumption + demand extremes
        const storeEntries = Object.entries(data.ai_store || {}).filter(([,q])=>q>0).sort((a,b)=>b[1]-a[1]).slice(0,5);
        const consEntries = Object.entries(data.global_consumption || {}).sort((a,b)=>b[1]-a[1]).slice(0,5);
        const demandEntries = Object.keys(CRAFTING_RECIPES).map(k=>[k, getDemandFactor(data,k)]).sort((a,b)=>b[1]-a[1]).slice(0,5);
        const supplyEntries = allItems.map(k=>[k, getMarketSupply(data,k)]).sort((a,b)=>b[1]-a[1]).slice(0,5);
        const embed = new EmbedBuilder()
            .setTitle('🏪 Market Overview — Supply / Demand / Store / Consumption')
            .setColor(0xFFD700)
            .setFooter({ text: '🇺🇸🇸🇷 USSR Economy • Use -market <item>, -demand, -consumption, -aistore for details' })
            .addFields(
                { name: '🏪 AI Store (top)', value: storeEntries.length ? storeEntries.map(([item,qty],i)=>`${i+1}. ${CRAFTING_RECIPES[item]?.emoji||'📦'} ${item} x${qty} ${buildBar(qty, storeEntries[0][1],6)}`).join('\n') : 'Empty', inline: false },
                { name: '🛒 Top Consumed', value: consEntries.length ? consEntries.map(([item,qty],i)=>`${i+1}. ${item} x${qty} ${buildBar(qty, consEntries[0][1],6)}`).join('\n') : 'None yet', inline: true },
                { name: '📈 Top Demand', value: demandEntries.length ? demandEntries.map(([item,d])=>`${CRAFTING_RECIPES[item]?.emoji||'📦'} ${item} ${(d*100).toFixed(0)}% ${buildBar(d,1.5,6)}`).join('\n') : '—', inline: true },
                { name: '📦 Top Supply', value: supplyEntries.length ? supplyEntries.map(([item,s])=>`${item} x${s} ${buildBar(s, supplyEntries[0][1]||1,6)}`).join('\n') : '—', inline: true },
                { name: '🐟 Baltic Bonus', value: 'Fish now in Baltics (Estonia/Latvia/Lithuania) — value ₽14, weight 22', inline: false }
            );
        await message.reply({ embeds: [embed] });
        return;
    }

    // ============================================================
    // WORLDMAP — SSR world map
    // ============================================================
    
    if (command === 'worldmap' || command === 'map' || command === 'world') {
        const data = loadData();
        let census = {};
        try { census = await getSSRCensus(message.guild); } catch {}
        const regionLines = Object.entries(WORK_ZONES).map(([region, zone]) => {
            const ssrs = getSSRsForRegion(region);
            const pop = getRegionPop(census, region);
            const stock = getRegionFoodStock(data, region);
            const demand = (()=>{ try{return getRegionFoodDemand(data,census,region);}catch{return 0;}})();
            const comps = getRegionCompanies(data, region);
            const spec = comps.length ? comps.map(c=> c.specialization ? SPECIALIZATIONS[c.specialization]?.emoji || '' : '⚪').join('') : '—';
            const emoji = ssrs.map(s=>SSR_REGIONS[s]?.emoji||'').join('');
            return `**${region}** ${emoji} pop:${pop} food:${stock}/${demand} comps:${comps.length} specs:${spec} zone:${zone.substring(0,6)}...`;
        }).join('\n');
        const ssrLines = Object.entries(SSR_REGIONS).map(([name, d])=> `${d.emoji} **${name}** → ${getRegionNameForSSR(name)} | ${d.resources.slice(0,3).join(', ')}`).join('\n');
        const embed = new EmbedBuilder().setTitle('🗺️ USSR World Map — Regions & SSRs').setColor(0x5865F2).setDescription(`**6 Regions (work zones) — companies share regional food stockpile**\n${regionLines}`).addFields({name:'📍 SSRs (15)', value: ssrLines.substring(0,1024), inline:false},{name:'⛏️ Specializations', value:'Extraction ⛏️ mines/oil +25% | Agriculture 🌾 farm/timber +25% | Production 🏭 factories +25% & +15% sale (player factories buy raw)', inline:false},{name:'💡 Trade', value:'Fish → inland. Use `-trade <company> <item> <qty>` between regions. Check `-foodstatus all`', inline:false}).setFooter({text:'🇺🇸🇸🇷 USSR Economy • Regions total, not company'});
        await message.reply({ embeds: [embed] });
        return;
    }

    // ============================================================
    // INFLATION
    // ============================================================
    
    if (command === 'inflation') {
        const data = loadData();
        const inflation = data.inflation || 0;
        const printed = data.money_printed || 0;
        const reserves = data.total_bank_reserves || 0;
        const embed = new EmbedBuilder()
            .setTitle('📊 Inflation Report')
            .setColor(inflation > 10 ? 0xFF8C00 : 0x00FF00)
            .setFooter({ text: '🇺🇸🇸🇷 USSR Economy' })
            .addFields(
                { name: 'Rate', value: `${inflation.toFixed(2)}%`, inline: true },
                { name: 'Money Printed', value: formatMoney(printed), inline: true },
                { name: 'Bank Reserves', value: formatMoney(reserves), inline: true },
                { name: 'Multiplier', value: `${getInflationMultiplier().toFixed(2)}x`, inline: true },
                { name: 'Status', value: inflation > 50 ? '🚨 HYPERINFLATION!' : inflation > 20 ? '⚠️ High Inflation!' : inflation > 10 ? '⚡ Moderate Inflation!' : inflation > 3 ? '📈 Mild Inflation!' : '✅ Low Inflation!', inline: false }
            );
        await message.reply({ embeds: [embed] });
        return;
    }

    // ============================================================
    // BALANCE
    // ============================================================
    
    if (command === 'balance' || command === 'bal') {
        const [cash, bank] = await getUnbBalance(userId);
        const user = getUser(userId);
        user.cash = cash;
        user.bank = bank;
        saveUser(userId, user);
        const embed = new EmbedBuilder()
            .setTitle(`💰 ${message.author.displayName}'s Balance`)
            .setColor(0xFFD700)
            .setFooter({ text: '🇺🇸🇸🇷 USSR Economy' })
            .addFields(
                { name: 'Cash', value: formatMoney(cash), inline: true },
                { name: 'Bank', value: formatMoney(bank), inline: true }
            );
        await message.reply({ embeds: [embed] });
        return;
    }

    // ============================================================
    // DEPOSIT
    // ============================================================
    
    if (command === 'deposit' || command === 'dep') {
        let amount;
        if (args[0] && args[0].toLowerCase() === 'all') {
            const [cash] = await getUnbBalance(userId);
            amount = cash;
            if (amount <= 0) { await message.reply('❌ No cash to deposit!'); return; }
        } else {
            amount = parseInt(args[0]);
            if (isNaN(amount) || amount <= 0) { await message.reply('❌ Positive amount! Use `-deposit <amount>` or `-deposit all`'); return; }
        }
        const [cash, bank] = await getUnbBalance(userId);
        if (cash < amount) {
            await message.reply(`❌ Only ${formatMoney(cash)} cash!`);
            return;
        }
        const success = await updateUnbBalance(userId, -amount, amount, `Deposited ${formatMoney(amount)}`);
        if (!success) {
            await message.reply('❌ Failed to update balance!');
            return;
        }
        const user = getUser(userId);
        const [newCash, newBank] = await getUnbBalance(userId);
        user.cash = newCash;
        user.bank = newBank;
        saveUser(userId, user);
        const embed = new EmbedBuilder()
            .setTitle('🏦 Deposit Complete')
            .setDescription(`Deposited ${formatMoney(amount)}`)
            .setColor(0x5865F2)
            .setFooter({ text: '🇺🇸🇸🇷 USSR Economy' })
            .addFields(
                { name: 'Cash', value: formatMoney(newCash), inline: true },
                { name: 'Bank', value: formatMoney(newBank), inline: true }
            );
        await message.reply({ embeds: [embed] });
        return;
    }

    // ============================================================
    // WITHDRAW
    // ============================================================
    
    if (command === 'withdraw' || command === 'with') {
        let amount;
        if (args[0] && args[0].toLowerCase() === 'all') {
            const [, bankBal] = await getUnbBalance(userId);
            amount = bankBal;
            if (amount <= 0) { await message.reply('❌ No bank balance to withdraw!'); return; }
        } else {
            amount = parseInt(args[0]);
            if (isNaN(amount) || amount <= 0) { await message.reply('❌ Positive amount! Use `-withdraw <amount>` or `-withdraw all`'); return; }
        }
        const [cash, bank] = await getUnbBalance(userId);
        if (bank < amount) {
            await message.reply(`❌ Only ${formatMoney(bank)} in bank!`);
            return;
        }
        const success = await updateUnbBalance(userId, amount, -amount, `Withdrew ${formatMoney(amount)}`);
        if (!success) {
            await message.reply('❌ Failed to update balance!');
            return;
        }
        const user = getUser(userId);
        const [newCash, newBank] = await getUnbBalance(userId);
        user.cash = newCash;
        user.bank = newBank;
        saveUser(userId, user);
        const embed = new EmbedBuilder()
            .setTitle('🏦 Withdrawal Complete')
            .setDescription(`Withdrew ${formatMoney(amount)}`)
            .setColor(0x5865F2)
            .setFooter({ text: '🇺🇸🇸🇷 USSR Economy' })
            .addFields(
                { name: 'Cash', value: formatMoney(newCash), inline: true },
                { name: 'Bank', value: formatMoney(newBank), inline: true }
            );
        await message.reply({ embeds: [embed] });
        return;
    }

    // ============================================================
    // PAY
    // ============================================================
    
    if (command === 'pay') {
        if (args.length < 2) {
            await message.reply('❌ Usage: -pay @user <amount>');
            return;
        }
        const mention = args[0];
        const amount = parseInt(args[1]);
        if (isNaN(amount) || amount <= 0) {
            await message.reply('❌ Positive amount!');
            return;
        }
        const targetId = mention.replace(/[<@!>]/g, '');
        if (targetId === userId) {
            await message.reply('❌ Can\'t pay yourself!');
            return;
        }
        const [senderCash] = await getUnbBalance(userId);
        if (senderCash < amount) {
            await message.reply(`❌ Only ${formatMoney(senderCash)}!`);
            return;
        }
        const success1 = await updateUnbBalance(userId, -amount, 0, `Paid ${formatMoney(amount)} to <@${targetId}>`);
        const success2 = await updateUnbBalance(targetId, amount, 0, `Received ${formatMoney(amount)} from ${message.author.username}`);
        if (!success1 || !success2) {
            await message.reply('❌ Failed to update balance!');
            return;
        }
        const embed = new EmbedBuilder()
            .setTitle('💸 Payment Sent')
            .setDescription(`Sent ${formatMoney(amount)} to <@${targetId}>`)
            .setColor(0x00FF00)
            .setFooter({ text: '🇺🇸🇸🇷 USSR Economy' });
        await message.reply({ embeds: [embed] });
        return;
    }

    // ============================================================
    // DAILY
    // ============================================================
    
    if (command === 'daily') {
        const user = getUser(userId);
        if (user.last_claim) {
            const lastDate = new Date(user.last_claim).toDateString();
            const today = new Date().toDateString();
            if (lastDate === today) {
                await message.reply('❌ Already claimed today!');
                return;
            }
        }
        let reward = Math.floor(Math.random() * 100) + 50;
        const inflation = getInflation();
        if (inflation > 20) {
            reward = Math.max(1, Math.floor(reward * (1 - (inflation / 200))));
        }
        const success = await updateUnbBalance(userId, reward, 0, 'Daily reward');
        if (!success) {
            await message.reply('❌ Failed to update balance!');
            return;
        }
        user.cash = (user.cash || 0) + reward;
        user.last_claim = new Date().toISOString();
        saveUser(userId, user);
        const embed = new EmbedBuilder()
            .setTitle('🎁 Daily Reward')
            .setDescription(`You received ${formatMoney(reward)}!`)
            .setColor(0xFFD700)
            .setFooter({ text: '🇺🇸🇸🇷 USSR Economy' });
        await message.reply({ embeds: [embed] });
        return;
    }

    // ============================================================
    // LEADERBOARD
    // ============================================================
    
    if (command === 'leaderboard' || command === 'lb') {
        const data = loadData();
        const users = [];
        for (const [uid, uData] of Object.entries(data.users)) {
            const [cash, bank] = await getUnbBalance(uid);
            users.push({ id: uid, total: cash + bank });
        }
        users.sort((a, b) => b.total - a.total);
        if (users.length === 0) {
            await message.reply('No citizens yet!');
            return;
        }
        // unified -lb and -leaderboard now same paginated view (was 2 different before due to slash vs message)
        const perPage = 10;
        const totalPages = Math.max(1, Math.ceil(users.length / perPage));
        const makePage = async (pageIdx) => {
            const start = pageIdx * perPage;
            const slice = users.slice(start, start + perPage);
            const embed = new EmbedBuilder()
                .setTitle(`👑 Richest Citizens — Page ${pageIdx+1}/${totalPages}`)
                .setColor(0xFFD700)
                .setFooter({ text: `🇺🇸🇸🇷 USSR Economy • ${users.length} citizens • -lb and -leaderboard are now identical` });
            for (let i = 0; i < slice.length; i++) {
                const u = slice[i];
                const rank = start + i + 1;
                let name = u.id.slice(0, 8);
                try { const m = await client.users.fetch(u.id); name = m.displayName || m.username; } catch {}
                embed.addFields({ name: `#${rank} ${name}`, value: `💰 ${formatMoney(u.total)}`, inline: false });
            }
            return embed;
        };
        const firstEmbed = await makePage(0);
        if (totalPages === 1) {
            await message.reply({ embeds: [firstEmbed] });
            return;
        }
        const row = new ActionRowBuilder()
            .addComponents(
                new ButtonBuilder().setCustomId('lb_prev').setLabel('◀ Prev').setStyle(ButtonStyle.Primary).setDisabled(true),
                new ButtonBuilder().setCustomId('lb_page').setLabel(`1/${totalPages}`).setStyle(ButtonStyle.Secondary).setDisabled(true),
                new ButtonBuilder().setCustomId('lb_next').setLabel('Next ▶').setStyle(ButtonStyle.Primary)
            );
        const reply = await message.reply({ embeds: [firstEmbed], components: [row], fetchReply: true });
        let cur = 0;
        const collector = reply.createMessageComponentCollector({ filter: i => i.user.id === message.author.id, time: 120000 });
        collector.on('collect', async (interaction) => {
            if (interaction.customId === 'lb_prev' && cur > 0) cur--;
            else if (interaction.customId === 'lb_next' && cur < totalPages - 1) cur++;
            else { await interaction.deferUpdate(); return; }
            const embed = await makePage(cur);
            const newRow = new ActionRowBuilder()
                .addComponents(
                    ButtonBuilder.from(row.components[0]).setDisabled(cur === 0),
                    ButtonBuilder.from(row.components[1]).setLabel(`${cur+1}/${totalPages}`),
                    ButtonBuilder.from(row.components[2]).setDisabled(cur === totalPages - 1)
                );
            await interaction.update({ embeds: [embed], components: [newRow] });
        });
        collector.on('end', async () => { try { await reply.edit({ components: [] }); } catch {} });
        return;
    }

    // ============================================================
    // FOUNDCOMPANY
    // ============================================================
    
    function buildCompanyModal() {
    const modal = new ModalBuilder()
        .setCustomId('createCompany')
        .setTitle('🏢 Start a Company');

    const nameInput = new TextInputBuilder()
        .setCustomId('companyName')
        .setLabel('Company Name')
        .setStyle(TextInputStyle.Short)
        .setRequired(true)
        .setMaxLength(50);

    const tickerInput = new TextInputBuilder()
        .setCustomId('companyTicker')
        .setLabel('Stock Ticker (2-5 letters)')
        .setStyle(TextInputStyle.Short)
        .setRequired(true)
        .setMaxLength(5)
        .setMinLength(2);

    const investInput = new TextInputBuilder()
        .setCustomId('companyInvestment')
        .setLabel('Investment (₽)')
        .setStyle(TextInputStyle.Short)
        .setRequired(true)
        .setPlaceholder('Minimum ₽1,000');

    const sharesInput = new TextInputBuilder()
        .setCustomId('companyShares')
        .setLabel('Total Shares')
        .setStyle(TextInputStyle.Short)
        .setRequired(false)
        .setPlaceholder('Default: 100,000');

    modal.addComponents(
        new ActionRowBuilder().addComponents(nameInput),
        new ActionRowBuilder().addComponents(tickerInput),
        new ActionRowBuilder().addComponents(investInput),
        new ActionRowBuilder().addComponents(sharesInput)
    );
    return modal;
}

if (command === 'foundcompany') {
        const user = getUser(userId);
        if (user.company_id || user.director_of) {
            await message.reply('❌ You already own or direct a company!');
            return;
        }
        const [cash] = await getUnbBalance(userId);
        if (cash < 1000) {
            await message.reply(`❌ Need at least ₽1,000! You have ${formatMoney(cash)}`);
            return;
        }

        const openBtn = new ButtonBuilder()
            .setCustomId('found_company_open')
            .setLabel('🏢 Open company form')
            .setStyle(ButtonStyle.Success);
        const row = new ActionRowBuilder().addComponents(openBtn);
        await message.reply({ content: 'Click below to open the company registration form:', components: [row] });
        return;
    }

    // ============================================================
    // COMPANIES
    // ============================================================
    
    if (command === 'companies') {
        const data = loadData();
        const companies = Object.values(data.companies);
        if (companies.length === 0) {
            await message.reply('No companies!');
            return;
        }
        companies.sort((a, b) => (b.market_cap || 0) - (a.market_cap || 0));
        const embed = new EmbedBuilder()
            .setTitle('🏢 Soviet Companies')
            .setDescription(`${companies.length} registered`)
            .setColor(0x5865F2)
            .setFooter({ text: '🇺🇸🇸🇷 USSR Economy' });
        
        for (let i = 0; i < Math.min(companies.length, 15); i++) {
            const c = companies[i];
            const ssrEmoji = SSR_REGIONS[c.hq_ssr]?.emoji || '🌍';
            const state = c.is_state_owned ? '🏛️ ' : '';
            embed.addFields({
                name: `#${i+1} ${state}${c.name} (${c.ticker})`,
                value: `${ssrEmoji} ${c.hq_ssr || 'Unknown'}\nPrice: ${formatMoney(c.share_price || 0)}\nEmployees: ${c.employees || 0}`,
                inline: true
            });
        }
        await message.reply({ embeds: [embed] });
        return;
    }

    // ============================================================
    // BUYGSI
    // ============================================================
    
    if (command === 'buygsi') {
        const shares = parseInt(args[0]);
        if (isNaN(shares) || shares <= 0) {
            await message.reply('❌ Must buy at least 1!');
            return;
        }
        const price = getGSIPrice();
        const total = Math.floor(price * shares * getInflationMultiplier());
        const [cash] = await getUnbBalance(userId);
        if (cash < total) {
            await message.reply(`❌ Need ${formatMoney(total)}! Have ${formatMoney(cash)}`);
            return;
        }
        
        const success = await updateUnbBalance(userId, -total, 0, `Bought ${shares} GSI shares`);
        if (!success) {
            await message.reply('❌ Failed to update balance!');
            return;
        }
        
        await addToStateBank(total, `GSI shares sold to ${message.author.username}`);
        
        const user = getUser(userId);
        user.cash = cash - total;
        user.gsi_shares = (user.gsi_shares || 0) + shares;
        saveUser(userId, user);
        
        const embed = new EmbedBuilder()
            .setTitle('📈 GSI Bought')
            .setDescription(`Bought ${shares.toLocaleString()} GSI shares`)
            .setColor(0x00FF00)
            .setFooter({ text: '🇺🇸🇸🇷 USSR Economy' })
            .addFields(
                { name: 'Price/Share', value: formatMoney(price), inline: true },
                { name: 'Total', value: formatMoney(total), inline: true },
                { name: 'Total GSI Shares', value: `${user.gsi_shares.toLocaleString()}`, inline: true }
            );
        await message.reply({ embeds: [embed] });
        return;
    }

    // ============================================================
    // SELLGSI
    // ============================================================
    
    if (command === 'sellgsi') {
        const shares = parseInt(args[0]);
        if (isNaN(shares) || shares <= 0) {
            await message.reply('❌ Must sell at least 1!');
            return;
        }
        const user = getUser(userId);
        if ((user.gsi_shares || 0) < shares) {
            await message.reply(`❌ Only have ${user.gsi_shares || 0} shares!`);
            return;
        }
        const price = getGSIPrice();
        const total = Math.floor(price * shares * getInflationMultiplier());
        
        const [stateCash] = await getUnbBalance(STATE_BANK_USER_ID);
        if (stateCash < total) {
            await message.reply(`❌ State Bank doesn't have enough funds! Needs ${formatMoney(total)}, has ${formatMoney(stateCash)}`);
            return;
        }
        
        await removeFromStateBank(total, `GSI shares bought back from ${message.author.username}`);
        
        const [cash] = await getUnbBalance(userId);
        const success = await updateUnbBalance(userId, total, 0, `Sold ${shares} GSI shares`);
        if (!success) {
            await message.reply('❌ Failed to update balance!');
            return;
        }
        
        user.cash = cash + total;
        user.gsi_shares = (user.gsi_shares || 0) - shares;
        saveUser(userId, user);
        
        const embed = new EmbedBuilder()
            .setTitle('📈 GSI Sold')
            .setDescription(`Sold ${shares.toLocaleString()} GSI shares`)
            .setColor(0x00FF00)
            .setFooter({ text: '🇺🇸🇸🇷 USSR Economy' })
            .addFields(
                { name: 'Price/Share', value: formatMoney(price), inline: true },
                { name: 'Total', value: formatMoney(total), inline: true },
                { name: 'Remaining', value: `${user.gsi_shares.toLocaleString()}`, inline: true }
            );
        await message.reply({ embeds: [embed] });
        return;
    }

    // ============================================================
    // COMPANYRANKINGS
    // ============================================================
    
    if (command === 'companyrankings') {
        const data = loadData();
        const companies = Object.values(data.companies);
        if (companies.length === 0) {
            await message.reply('No companies!');
            return;
        }
        const byMc = [...companies].sort((a, b) => (b.market_cap || 0) - (a.market_cap || 0)).slice(0, 5);
        const byVal = [...companies].sort((a, b) => calculateCompanyValue(b) - calculateCompanyValue(a)).slice(0, 5);
        const byFunds = [...companies].sort((a, b) => (b.funds || 0) - (a.funds || 0)).slice(0, 5);
        
        const embed = new EmbedBuilder()
            .setTitle('👑 Company Rankings')
            .setColor(0xFFD700)
            .setFooter({ text: '🇺🇸🇸🇷 USSR Economy' });
        
        let mcText = '';
        byMc.forEach((c, i) => { mcText += `${i+1}. ${c.name} - ${formatMoney(c.market_cap || 0)}\n`; });
        embed.addFields({ name: 'Market Cap', value: mcText || 'No data', inline: true });
        
        let valText = '';
        byVal.forEach((c, i) => { valText += `${i+1}. ${c.name} - ${formatMoney(calculateCompanyValue(c))}\n`; });
        embed.addFields({ name: 'Total Value', value: valText || 'No data', inline: true });
        
        let fundsText = '';
        byFunds.forEach((c, i) => { fundsText += `${i+1}. ${c.name} - ${formatMoney(c.funds || 0)}\n`; });
        embed.addFields({ name: 'Funds', value: fundsText || 'No data', inline: true });
        
        await message.reply({ embeds: [embed] });
        return;
    }

    // ============================================================
    // COMPANYGRAPH
    // ============================================================
    
    if (command === 'companygraph') {
        const name = args.join(' ');
        if (!name) {
            await message.reply('❌ Specify a company! `-companygraph <name>`');
            return;
        }
        const data = loadData();
        let target = null;
        for (const [cid, c] of Object.entries(data.companies)) {
            if (c.name.toLowerCase() === name.toLowerCase() || c.ticker.toLowerCase() === name.toLowerCase()) {
                target = c;
                break;
            }
        }
        if (!target) {
            await message.reply(`❌ Company '${name}' not found!`);
            return;
        }
        const history = target.price_history || [];
        if (history.length < 2) {
            await message.reply(`Not enough data for ${target.name}!`);
            return;
        }
        const current = target.share_price || 0;
        const minVal = Math.min(...history);
        const maxVal = Math.max(...history);
        const range = Math.max(1, maxVal - minVal);
        const display = history.slice(-10);
        let lines = [`**Current:** ${formatMoney(current)}`, ''];
        for (let i = 0; i < display.length; i++) {
            const barLen = Math.floor((display[i] - minVal) / range * 12) + 1;
            const bar = '▬'.repeat(Math.min(barLen, 20));
            lines.push(`${String(i+1).padStart(2, '0')} ${bar} ${formatMoney(display[i])}`);
        }
        lines.push('');
        lines.push(`**High:** ${formatMoney(maxVal)}  **Low:** ${formatMoney(minVal)}`);
        if (history.length >= 2) {
            const change = ((history[history.length-1] - history[0]) / history[0] * 100);
            const emoji = change > 0 ? '📈' : change < 0 ? '📉' : '➖';
            lines.push(`**Change:** ${emoji} ${change.toFixed(2)}%`);
        }
        const embed = new EmbedBuilder()
            .setTitle(`📈 ${target.name} (${target.ticker})`)
            .setDescription('```\n' + lines.join('\n') + '\n```')
            .setColor(0x5865F2)
            .setFooter({ text: '🇺🇸🇸🇷 USSR Economy' });
        await message.reply({ embeds: [embed] });
        return;
    }

    // ============================================================
    // BUILD
    // ============================================================
    
    if (command === 'build') {
        const user = getUser(userId);
        const data = loadData();
        const managed = getManagedCompany(userId, data);
        const companyId = managed?.companyId;
        if (!managed) {
            await message.reply('❌ You do not own or direct a company!');
            return;
        }
        
        const company = managed.company;
        const buildingOptions = [];
        
        for (const [name, config] of Object.entries(MINES)) {
            if (!company.buildings || !company.buildings[name]) {
                const cost = Math.floor(config.cost * getInflationMultiplier());
                const rarity = config.rare ? ' ⚠️ VERY RARE!' : '';
                buildingOptions.push({
                    label: name,
                    description: `${formatMoney(cost)}${rarity}`,
                    value: `mine_${name}`,
                    emoji: config.emoji
                });
            }
        }
        
        for (const [name, config] of Object.entries(FACTORIES)) {
            if (!company.buildings || !company.buildings[name]) {
                const cost = Math.floor(config.cost * getInflationMultiplier());
                buildingOptions.push({
                    label: name,
                    description: formatMoney(cost),
                    value: `factory_${name}`,
                    emoji: config.emoji
                });
            }
        }
        
        if (!company.buildings || !company.buildings.Store) {
            const cost = Math.floor(STORE.cost * getInflationMultiplier());
            buildingOptions.push({
                label: 'Store',
                description: formatMoney(cost),
                value: 'store',
                emoji: '🏪'
            });
        }
        
        if (buildingOptions.length === 0) {
            await message.reply('❌ You already have all buildings!');
            return;
        }
        
        const selectMenu = new StringSelectMenuBuilder()
            .setCustomId('build_select')
            .setPlaceholder('Select a building...')
            .addOptions(buildingOptions.slice(0, 25));
        
        const row = new ActionRowBuilder().addComponents(selectMenu);
        const embed = new EmbedBuilder()
            .setTitle('🏗️ Build Menu')
            .setDescription('Select a building to construct!')
            .setColor(0x5865F2)
            .setFooter({ text: '🇺🇸🇸🇷 USSR Economy' });
        
        const reply = await message.reply({ embeds: [embed], components: [row] });
        
        const collector = reply.createMessageComponentCollector({
            componentType: ComponentType.StringSelect,
            time: 60000
        });
        
        collector.on('collect', async (interaction) => {
            if (interaction.user.id !== userId) {
                await interaction.reply({ content: 'Not your menu!', ephemeral: true });
                return;
            }
            const value = interaction.values[0];
            const separator = value.indexOf('_');
            const type = separator === -1 ? value : value.slice(0, separator);
            const name = separator === -1 ? '' : value.slice(separator + 1);
            
            if (type === 'factory') {
                const modal = new ModalBuilder()
                    .setCustomId('factory_specialize')
                    .setTitle('🏭 Choose Factory Type');
                
                const specInput = new TextInputBuilder()
                    .setCustomId('factorySpec')
                    .setLabel('Factory Type')
                    .setStyle(TextInputStyle.Short)
                    .setRequired(true)
                    .setPlaceholder('Steel Mill, Machine Shop, etc.');
                
                const row = new ActionRowBuilder().addComponents(specInput);
                modal.addComponents(row);
                
                await interaction.showModal(modal);
                return;
            }
            
            if (type === 'mine') {
                const config = MINES[name];
                const cost = Math.floor(config.cost * getInflationMultiplier());
                if (company.funds < cost) {
                    await interaction.reply({ content: `❌ Need ${formatMoney(cost)}! Have ${formatMoney(company.funds)}`, ephemeral: true });
                    return;
                }
                if (!company.buildings) company.buildings = {};
                company.buildings[name] = { level: 1, built_at: new Date().toISOString(), type: 'mine' };
                company.funds -= cost;
                data.companies[companyId] = company;
                saveData(data);
                updateCompanyPrice(companyId);
                const rarity = config.rare ? ' ⚠️ VERY RARE!' : '';
                const embed2 = new EmbedBuilder()
                    .setTitle(`${config.emoji} ${name} Built!`)
                    .setDescription(`**${company.name}** now has a ${name}!${rarity}`)
                    .setColor(0x00FF00)
                    .setFooter({ text: '🇺🇸🇸🇷 USSR Economy' })
                    .addFields(
                        { name: 'Cost', value: formatMoney(cost), inline: true },
                        { name: 'Produces', value: config.produces.join(', '), inline: true },
                        { name: '📈 New Share Price', value: formatMoney(company.share_price || 0), inline: true }
                    );
                await interaction.reply({ embeds: [embed2] });
                collector.stop();
                return;
            }
            
            if (value === 'store') {
                const cost = Math.floor(STORE.cost * getInflationMultiplier());
                if (company.funds < cost) {
                    await interaction.reply({ content: `❌ Need ${formatMoney(cost)}! Have ${formatMoney(company.funds)}`, ephemeral: true });
                    return;
                }
                if (!company.buildings) company.buildings = {};
                company.buildings.Store = { level: 1, built_at: new Date().toISOString(), type: 'store' };
                company.funds -= cost;
                data.companies[companyId] = company;
                saveData(data);
                updateCompanyPrice(companyId);
                const embed2 = new EmbedBuilder()
                    .setTitle('🏪 Store Built!')
                    .setDescription(`**${company.name}** now has a Store!`)
                    .setColor(0x00FF00)
                    .setFooter({ text: '🇺🇸🇸🇷 USSR Economy' })
                    .addFields(
                        { name: 'Cost', value: formatMoney(cost), inline: true },
                        { name: '📈 New Share Price', value: formatMoney(company.share_price || 0), inline: true }
                    );
                await interaction.reply({ embeds: [embed2] });
                collector.stop();
                return;
            }
        });
        
        collector.on('end', async () => {
            try {
                await reply.edit({ components: [] });
            } catch (err) {}
        });
        return;
    }

    // ============================================================
    // UPGRADE
    // ============================================================
    
    if (command === 'upgrade') {
        const buildingName = args.join(' ');
        if (!buildingName) {
            await message.reply('❌ Specify a building! `-upgrade <name>`');
            return;
        }
        const data = loadData();
        const user = getUser(userId);
        const managed = getManagedCompany(userId, data);
        const companyId = managed?.companyId;
        if (!managed) {
            await message.reply('❌ You do not own or direct a company!');
            return;
        }
        const company = managed.company;
        let found = null;
        for (const [bName, bData] of Object.entries(company.buildings || {})) {
            if (bName.toLowerCase() === buildingName.toLowerCase()) {
                found = bName;
                break;
            }
        }
        if (!found) {
            await message.reply(`❌ Building '${buildingName}' not found!`);
            return;
        }
        const bData = company.buildings[found];
        const currentLevel = bData.level || 1;
        
        let config = null;
        if (MINES[found]) config = MINES[found];
        else if (FACTORIES[found]) config = FACTORIES[found];
        else if (found === 'Store') config = STORE;
        else {
            await message.reply('❌ Unknown building!');
            return;
        }
        
        const maxLevel = config.max_level || 10;
        if (currentLevel >= maxLevel) {
            await message.reply(`❌ ${found} is already max level (${currentLevel})!`);
            return;
        }
        
        const cost = Math.floor(config.cost * (currentLevel + 1) * getInflationMultiplier() * (config.upgrade_mult || 2.0));
        if (company.funds < cost) {
            await message.reply(`❌ Need ${formatMoney(cost)}! Have ${formatMoney(company.funds)}`);
            return;
        }
        
        company.buildings[found].level = currentLevel + 1;
        company.funds -= cost;
        data.companies[companyId] = company;
        saveData(data);
        const newPrice = updateCompanyPrice(companyId);
        
        const embed = new EmbedBuilder()
            .setTitle(`⬆️ ${found} Upgraded!`)
            .setDescription(`Now Level ${currentLevel + 1}!`)
            .setColor(0xFFD700)
            .setFooter({ text: '🇺🇸🇸🇷 USSR Economy' })
            .addFields(
                { name: 'Cost', value: formatMoney(cost), inline: true },
                { name: '📈 Share Price', value: formatMoney(newPrice || 0), inline: true }
            );
        await message.reply({ embeds: [embed] });
        return;
    }

    // ============================================================
    // COLLECT
    // ============================================================
    
    if (command === 'collect') {
        const data = loadData();
        const user = getUser(userId);
        const managed = getManagedCompany(userId, data);
        const companyId = managed?.companyId;
        if (!managed) {
            await message.reply('❌ You do not own or direct a company!');
            return;
        }
        const company = managed.company;
        const cooldown = getCompanyCollectCooldown(companyId);
        if (cooldown > 0) {
            const hours = Math.floor(cooldown/3600);
            const mins = Math.floor((cooldown%3600)/60);
            await message.reply(`⏳ Wait ${hours}h ${mins}m!`);
            return;
        }
        const buildings = company.buildings || {};
        if (Object.keys(buildings).length === 0) {
            await message.reply('❌ No buildings! Use `-build`.');
            return;
        }
        // Food demand: REGION-LEVEL stockpile — Baltics Fish feeds the whole region, inland must trade between regions
        let census = {};
        try { census = await getSSRCensus(message.guild); } catch {}
        const regionName = getRegionNameForSSR(company.hq_ssr) || company.hq_ssr || 'Unknown Region';
        // FIXED: -collect ONLY uses 25% of YOUR food stockpile (never wipes you)
        const yourStock = getFoodStock(company.inventory);
        const foodDemand = getCollectFoodDemand(data, census, regionName, company);
        const regionDemand = getRegionFoodDemand(data, census, regionName); // for info only
        const foodStock = getRegionFoodStock(data, regionName);
        if (foodStock < foodDemand || yourStock < foodDemand) {
            const need = Math.max(foodDemand - foodStock, foodDemand - yourStock);
            const regionPop = getRegionPop(census, regionName);
            const regionEmployees = getRegionCompanies(data, regionName).reduce((s,c)=>s+(c.employees||0),0);
            await message.reply(`🍽️ **Hungry!** **${company.name}** needs **${foodDemand}🍞** (25% of your stock ${yourStock}🍞) to \`-collect\` — region **${regionName}** has **${foodStock}🍞**, you have **${yourStock}🍞** (short **${need}🍞**).\nRegion total demand is ${regionDemand}🍞 across ${getRegionCompanies(data, regionName).length} companies, pop ${regionPop}, employees ${regionEmployees}.\n**Always 25%** — you keep 75%. Trade via \`-trade <company> <item> <qty>\` — Fish 2🍞, Wheat 1🍞, Bread 3🍞, etc. Check \`-foodstatus\``);
            return;
        }
        const consumedFood = consumeCollectFood(data, regionName, companyId, foodDemand);
        const event = getCollectEvent();
        const eventMult = event.multiplier;
        const inflationMult = getInflationMultiplier();
        const totalResources = {};
        let totalRevenue = 0;
        const missing = [];
        const penalties = [];
        const consumed = {};
        
        for (const [bName, bData] of Object.entries(buildings)) {
            const level = bData.level || 1;
            
            if (MINES[bName]) {
                const config = MINES[bName];
                let prod = Math.floor(config.rate * level * eventMult * inflationMult);
                prod = Math.max(1, Math.floor(prod * (0.7 + Math.random() * 0.6)));
                if (config.rare) prod = Math.max(1, Math.floor(prod * 0.05));
                const specMult = getSpecializationMultiplier(company, bName);
                if (specMult !== 1.0) {
                    const before = prod;
                    prod = Math.max(1, Math.floor(prod * specMult));
                    if (specMult > 1) penalties.push(`✨ ${bName} +25% spec bonus (${company.specialization}) ${before}→${prod}`);
                    else penalties.push(`⚠️ ${bName} -15% off-spec (${company.specialization}) ${before}→${prod}`);
                }
                // Gold Rush 50% boost for Gold Mine in active SSR (both -work and -collect)
                const rush = getActiveGoldRush(data);
                if (rush && rush.ssr === company.hq_ssr && bName === "Gold Mine") {
                    const beforeRush = prod;
                    prod = Math.max(1, Math.floor(prod * (rush.factor || 1.5)));
                    penalties.push(`⛏️ GOLD RUSH +${rush.percent||50}% for ${rush.ssr} ${beforeRush}→${prod}`);
                }
                for (const r of config.produces) {
                    const native = isResourceNative(company.hq_ssr, r);
                    const adj = native ? prod : Math.max(1, Math.floor(prod * 0.5));
                    totalResources[r] = (totalResources[r] || 0) + adj;
                    if (!native) penalties.push(`⚠️ ${bName} ×0.5 — ${r} not native to ${company.hq_ssr}`);
                }
            } else if (FACTORIES[bName]) {
                const config = FACTORIES[bName];
                let canProduce = true;
                for (const [r, qty] of Object.entries(config.requires)) {
                    const required = qty * level;
                    const current = (company.inventory || {})[r] || 0;
                    if (current < required) {
                        canProduce = false;
                        missing.push(`${r} (need ${required}, have ${current})`);
                        break;
                    }
                }
                if (canProduce) {
                    for (const [r, qty] of Object.entries(config.requires)) {
                        const required = qty * level;
                        consumed[r] = (consumed[r] || 0) + required;
                        if (!company.inventory) company.inventory = {};
                        company.inventory[r] = (company.inventory[r] || 0) - required;
                    }
                    let prod = Math.floor(config.rate * level * eventMult * inflationMult);
                    prod = Math.max(1, prod);
                    const specMult = getSpecializationMultiplier(company, bName);
                    if (specMult !== 1.0) {
                        const before = prod;
                        prod = Math.max(1, Math.floor(prod * specMult));
                        if (specMult > 1) penalties.push(`✨ ${bName} +25% spec bonus (${company.specialization}) ${before}→${prod}`);
                        else penalties.push(`⚠️ ${bName} -15% off-spec ${before}→${prod}`);
                    }
                    const powerMult = getPowerMultiplier(company);
                    if (powerMult !== 1.0) {
                        const before = prod;
                        prod = Math.max(1, Math.floor(prod * powerMult));
                        if (powerMult > 1) penalties.push(`⚡ ${bName} +30% Nuclear power ${before}→${prod}`);
                        else penalties.push(`⚡ ${bName} 70% brownout (need Nuclear Reactor) ${before}→${prod}`);
                    }
                    for (const r of config.produces) {
                        totalResources[r] = (totalResources[r] || 0) + prod;
                    }
                }
            } else if (bName === 'Store') {
                let prod = Math.floor(STORE.rate * level * eventMult * inflationMult);
                prod = Math.max(1, prod);
                const specMult = getSpecializationMultiplier(company, bName);
                if (specMult !== 1.0) prod = Math.max(1, Math.floor(prod * specMult));
                const inventory = company.inventory || {};
                const items = [];
                for (const [item, qty] of Object.entries(inventory)) {
                    if (CRAFTING_RECIPES[item] && qty > 0) {
                        items.push([item, qty, CRAFTING_RECIPES[item].value]);
                    }
                }
                if (items.length > 0) {
                    const [item, qty, val] = items[Math.floor(Math.random() * items.length)];
                    const sell = Math.min(Math.floor(Math.random() * 3) + 1, qty);
                    let revenue = Math.floor(val * sell * 1.1 * inflationMult);
                    if (specMult !== 1.0) revenue = Math.floor(revenue * specMult);
                    totalRevenue += revenue;
                    company.inventory[item] = qty - sell;
                    if (company.inventory[item] <= 0) delete company.inventory[item];
                } else {
                    totalRevenue += prod * 5;
                }
            }
        }
        
        if (!company.inventory) company.inventory = {};
        for (const [r, qty] of Object.entries(totalResources)) {
            company.inventory[r] = (company.inventory[r] || 0) + qty;
        }
        if (totalRevenue > 0) company.funds = (company.funds || 0) + totalRevenue;
        // Salaries: % from company funds to CEO/Director/Managers (set via -setsalary)
        let salaryInfo = null;
        try {
            const sal = payCompanySalaries(data, companyId);
            if (sal.totalPaid > 0) {
                salaryInfo = sal;
                logOwnerAction(data, userId, message.author.username, 'collect-salaries', `${company.name} paid ₽${sal.totalPaid} salaries ${sal.paid.map(p=>`${p.role} ${p.userId} ₽${p.amount}`).join(', ')}`);
            }
        } catch {}
        company.last_collect = new Date().toISOString();
        data.companies[companyId] = company;
        saveData(data);
        const newPrice = updateCompanyPrice(companyId);
        try { updateGSI(0.001); } catch {}
        
        const embed = new EmbedBuilder()
            .setTitle(`📦 Collected! ${event.emoji}`)
            .setDescription(`Event: ${event.name}`)
            .setColor(0x5865F2)
            .setFooter({ text: `⏳ Next in ${COLLECT_COOLDOWN_HOURS} hours` })
            .addFields(
                { name: 'Multiplier', value: `${eventMult.toFixed(1)}x`, inline: true }
            );
        
        if (Object.keys(totalResources).length > 0) {
            embed.addFields({ name: 'Produced', value: Object.entries(totalResources).map(([r, qty]) => `• ${qty}x ${r}`).join('\n'), inline: false });
        }
        if (salaryInfo && salaryInfo.totalPaid > 0) {
            embed.addFields({ name: '💼 Salaries Paid', value: salaryInfo.paid.map(p=>`• ${p.role} <@${p.userId}> ₽${p.amount.toLocaleString()}`).join('\n') + `\nTotal ₽${salaryInfo.totalPaid.toLocaleString()} from funds`, inline: false });
        }
        if (Object.keys(consumed).length > 0) {
            embed.addFields({ name: 'Consumed', value: Object.entries(consumed).map(([r, qty]) => `• ${qty}x ${r}`).join('\n'), inline: false });
        }
        if (Object.keys(consumedFood).length > 0) {
            embed.addFields({ name: '🍽️ Region food consumed', value: `${regionName}: ` + Object.entries(consumedFood).map(([it,qty])=>`• ${qty}x ${it} (${qty*FOOD_VALUES[it]}🍞)`).join('\n') + `\nTotal: ${foodDemand}🍞 fed from regional pool`, inline: false });
        }
        if (penalties.length > 0) {
            embed.addFields({ name: '⛏️ Non-native penalty (×0.5)', value: penalties.slice(0,5).join('\n') + (penalties.length>5?`\n…and ${penalties.length-5} more` : ''), inline: false });
        }
        if (missing.length > 0) {
            embed.addFields({ name: '⚠️ Missing', value: missing.join('\n'), inline: false });
        }
        if (totalRevenue > 0) {
            embed.addFields({ name: '💰 Revenue', value: formatMoney(totalRevenue), inline: true });
        }
        embed.addFields({ name: '📈 Share Price', value: formatMoney(newPrice || 0), inline: true });
        embed.addFields({ name: '🍞 Region stock left', value: `${regionName}: ${getRegionFoodStock(data, regionName)}🍞`, inline: true });
        await message.reply({ embeds: [embed] });
        return;
    }

    // ============================================================
    // COMPANYINVENTORY
    // ============================================================
    
    if (command === 'companyinventory') {
        const data = loadData();
        const user = getUser(userId);
        const managed = getManagedCompany(userId, data);
        const companyId = managed?.companyId;
        if (!managed) {
            await message.reply('❌ You do not own or direct a company!');
            return;
        }
        const company = managed.company;
        const inventory = company.inventory || {};
        if (Object.keys(inventory).length === 0) {
            await message.reply('📦 Inventory is empty!');
            return;
        }
        let total = 0;
        const lines = [];
        for (const [item, qty] of Object.entries(inventory)) {
            if (CRAFTING_RECIPES[item]) {
                const val = qty * CRAFTING_RECIPES[item].value;
                total += val;
                lines.push(`• ${CRAFTING_RECIPES[item].emoji} ${item} x${qty} (${formatMoney(val)})`);
            } else if (RESOURCE_VALUES[item]) {
                const val = qty * RESOURCE_VALUES[item];
                total += val;
                lines.push(`• ${item} x${qty} (${formatMoney(val)})`);
            }
        }
        const embed = new EmbedBuilder()
            .setTitle(`📦 ${company.name} Inventory`)
            .setDescription(lines.slice(0, 20).join('\n'))
            .setColor(0xFFD700)
            .setFooter({ text: '🇺🇸🇸🇷 USSR Economy' })
            .addFields({ name: 'Total Value', value: formatMoney(total), inline: false });
        await message.reply({ embeds: [embed] });
        return;
    }

    // ============================================================
    // TRANSFERITEM
    // ============================================================
    
    if (command === 'transferitem') {
        if (args.length < 2) {
            await message.reply('❌ Usage: -transferitem <item> <qty>');
            return;
        }
        const itemName = args[0];
        const quantity = parseInt(args[1]) || 1;
        const data = loadData();
        const user = ensureUserRecord(data, userId);
        const managed = getManagedCompany(userId, data);
        const companyId = managed?.companyId;
        if (!managed) {
            await message.reply('❌ You do not own or direct a company!');
            return;
        }
        const company = managed.company;
        if (!user.inventory || !user.inventory[itemName] || user.inventory[itemName] < quantity) {
            await message.reply(`❌ You don't have ${quantity}x ${itemName}!`);
            return;
        }
        user.inventory[itemName] -= quantity;
        if (user.inventory[itemName] <= 0) delete user.inventory[itemName];
        if (!company.inventory) company.inventory = {};
        company.inventory[itemName] = (company.inventory[itemName] || 0) + quantity;
        data.companies[companyId] = company;
        saveData(data);
        updateCompanyPrice(companyId);
        const embed = new EmbedBuilder()
            .setTitle('📦 Transfer Complete')
            .setDescription(`Transferred ${quantity}x ${itemName} to ${company.name}`)
            .setColor(0x00FF00)
            .setFooter({ text: '🇺🇸🇸🇷 USSR Economy' });
        await message.reply({ embeds: [embed] });
        return;
    }

    // ============================================================
    // INVEST
    // ============================================================
    
    if (command === 'invest') {
        const amount = parseInt(args[0]);
        if (isNaN(amount) || amount <= 0) {
            await message.reply('❌ Positive amount!');
            return;
        }
        const data = loadData();
        const user = ensureUserRecord(data, userId);
        const managed = getManagedCompany(userId, data);
        const companyId = managed?.companyId;
        if (!managed) {
            await message.reply('❌ You do not own or direct a company!');
            return;
        }
        if (managed.role !== 'owner' || companyId == null) {
            await message.reply('❌ State directors cannot personally invest in state companies.');
            return;
        }
        const company = managed.company;
        const [cash] = await getUnbBalance(userId);
        if (cash < amount) {
            await message.reply(`❌ Need ${formatMoney(amount)}! Have ${formatMoney(cash)}`);
            return;
        }
        const oldPrice = company.share_price || 1;
        company.funds = (company.funds || 0) + amount;
        company.invested_capital = (company.invested_capital || 0) + amount;
        const success = await updateUnbBalance(userId, -amount, 0, `Invested ${formatMoney(amount)}`);
        if (!success) {
            await message.reply('❌ Failed to update balance!');
            return;
        }
        user.cash = cash - amount;
        data.companies[companyId] = company;
        saveData(data);
        const newPrice = updateCompanyPrice(companyId);
        const embed = new EmbedBuilder()
            .setTitle('💰 Investment Made')
            .setDescription(`Invested ${formatMoney(amount)} into ${company.name}`)
            .setColor(0x00FF00)
            .setFooter({ text: '🇺🇸🇸🇷 USSR Economy' })
            .addFields(
                { name: 'Old Price', value: formatMoney(oldPrice), inline: true },
                { name: 'New Price', value: formatMoney(newPrice || 0), inline: true },
                { name: 'Increase', value: `${(((newPrice || 0) - oldPrice) / oldPrice * 100).toFixed(1)}%`, inline: true }
            );
        await message.reply({ embeds: [embed] });
        return;
    }

    // ============================================================
    // BUYSHARES
    // ============================================================
    
    if (command === 'buyshares') {
        if (args.length < 2) {
            await message.reply('❌ Usage: -buyshares <name> <qty>');
            return;
        }
        const identifier = args[0];
        const quantity = parseInt(args[1]);
        if (isNaN(quantity) || quantity <= 0) {
            await message.reply('❌ Positive quantity!');
            return;
        }
        const data = loadData();
        let target = null;
        for (const [cid, c] of Object.entries(data.companies)) {
            if (c.name.toLowerCase() === identifier.toLowerCase() || c.ticker.toLowerCase() === identifier.toLowerCase()) {
                target = c;
                break;
            }
        }
        if (!target) {
            await message.reply(`❌ Company '${identifier}' not found!`);
            return;
        }
        if ((target.shares_available || 0) < quantity) {
            await message.reply(`❌ Only ${target.shares_available?.toLocaleString() || 0} available!`);
            return;
        }
        const price = target.share_price || 1;
        const total = Math.floor(price * quantity * getInflationMultiplier());
        const user = ensureUserRecord(data, userId);
        const [cash] = await getUnbBalance(userId);
        if (cash < total) {
            await message.reply(`❌ Need ${formatMoney(total)}! Have ${formatMoney(cash)}`);
            return;
        }
        const success = await updateUnbBalance(userId, -total, 0, `Bought ${quantity} shares of ${target.name}`);
        if (!success) {
            await message.reply('❌ Failed to update balance!');
            return;
        }
        user.cash = cash - total;
        if (!user.share_holdings) user.share_holdings = {};
        if (!user.share_holdings[target.name]) {
            user.share_holdings[target.name] = { shares: 0, avg_price: 0 };
        }
        const current = user.share_holdings[target.name];
        const totalShares = current.shares + quantity;
        const totalCost = (current.shares * current.avg_price) + (quantity * price);
        current.avg_price = Math.floor(totalCost / totalShares);
        current.shares = totalShares;
        target.shares_available = (target.shares_available || 0) - quantity;
        target.funds = (target.funds || 0) + total;
        data.companies[target.id] = target;
        saveData(data);
        const newPrice = updateCompanyPrice(target.id);
        const embed = new EmbedBuilder()
            .setTitle('✅ Shares Bought')
            .setDescription(`Bought ${quantity.toLocaleString()} shares of ${target.name}`)
            .setColor(0x00FF00)
            .setFooter({ text: '🇺🇸🇸🇷 USSR Economy' })
            .addFields(
                { name: 'Price/Share', value: formatMoney(price), inline: true },
                { name: 'Total', value: formatMoney(total), inline: true },
                { name: 'Held', value: `${current.shares.toLocaleString()}`, inline: true },
                { name: 'New Price', value: formatMoney(newPrice || 0), inline: true }
            );
        await message.reply({ embeds: [embed] });
        return;
    }

    // ============================================================
    // SELLSHARES
    // ============================================================
    
    if (command === 'sellshares') {
        if (args.length < 2) {
            await message.reply('❌ Usage: -sellshares <name> <qty>');
            return;
        }
        const identifier = args[0];
        const quantity = parseInt(args[1]);
        if (isNaN(quantity) || quantity <= 0) {
            await message.reply('❌ Positive quantity!');
            return;
        }
        const data = loadData();
        let target = null;
        for (const [cid, c] of Object.entries(data.companies)) {
            if (c.name.toLowerCase() === identifier.toLowerCase() || c.ticker.toLowerCase() === identifier.toLowerCase()) {
                target = c;
                break;
            }
        }
        if (!target) {
            await message.reply(`❌ Company '${identifier}' not found!`);
            return;
        }
        const user = ensureUserRecord(data, userId);
        if (!user.share_holdings || !user.share_holdings[target.name]) {
            await message.reply(`❌ You don't own shares of ${target.name}!`);
            return;
        }
        const holdings = user.share_holdings[target.name];
        if (holdings.shares < quantity) {
            await message.reply(`❌ Only have ${holdings.shares} shares!`);
            return;
        }
        const price = target.share_price || 1;
        const total = Math.floor(price * quantity * getInflationMultiplier());
        if ((target.funds || 0) < total) {
            await message.reply(`❌ Company can't buy back shares! Needs ${formatMoney(total)}, has ${formatMoney(target.funds || 0)}`);
            return;
        }
        const [cash] = await getUnbBalance(userId);
        const success = await updateUnbBalance(userId, total, 0, `Sold ${quantity} shares of ${target.name}`);
        if (!success) {
            await message.reply('❌ Failed to update balance!');
            return;
        }
        user.cash = cash + total;
        holdings.shares -= quantity;
        if (holdings.shares <= 0) delete user.share_holdings[target.name];
        target.shares_available = (target.shares_available || 0) + quantity;
        target.funds = (target.funds || 0) - total;
        data.companies[target.id] = target;
        saveData(data);
        const newPrice = updateCompanyPrice(target.id);
        const embed = new EmbedBuilder()
            .setTitle('✅ Shares Sold')
            .setDescription(`Sold ${quantity.toLocaleString()} shares of ${target.name}`)
            .setColor(0x00FF00)
            .setFooter({ text: '🇺🇸🇸🇷 USSR Economy' })
            .addFields(
                { name: 'Price/Share', value: formatMoney(price), inline: true },
                { name: 'Total', value: formatMoney(total), inline: true },
                { name: 'New Price', value: formatMoney(newPrice || 0), inline: true }
            );
        await message.reply({ embeds: [embed] });
        return;
    }

    // ============================================================
    // PORTFOLIO
    // ============================================================
    
    if (command === 'portfolio') {
        const user = getUser(userId);
        const holdings = user.share_holdings || {};
        if (Object.keys(holdings).length === 0) {
            await message.reply('📊 You don\'t own any shares!');
            return;
        }
        const data = loadData();
        let total = 0;
        const lines = [];
        for (const [name, h] of Object.entries(holdings)) {
            let company = null;
            for (const [cid, c] of Object.entries(data.companies)) {
                if (c.name === name) { company = c; break; }
            }
            if (!company) continue;
            const current = h.shares * (company.share_price || 0);
            const cost = h.shares * h.avg_price;
            const profit = current - cost;
            const pct = cost > 0 ? (profit / cost * 100) : 0;
            total += current;
            const emoji = profit > 0 ? '✅' : profit < 0 ? '❌' : '➖';
            lines.push(`**${name}** (${company.ticker})\n${h.shares.toLocaleString()} shares @ ${formatMoney(company.share_price || 0)}\n${emoji} ${formatMoney(profit)} (${pct.toFixed(1)}%)`);
        }
        const embed = new EmbedBuilder()
            .setTitle(`📊 ${message.author.displayName}'s Portfolio`)
            .setDescription(lines.join('\n\n'))
            .setColor(0xFFD700)
            .setFooter({ text: '🇺🇸🇸🇷 USSR Economy' })
            .addFields({ name: 'Total Value', value: formatMoney(total), inline: true });
        await message.reply({ embeds: [embed] });
        return;
    }

    // ============================================================
    // WORK - WITH WAGE SYSTEM AND FIXED SSR CHECK
    // ============================================================
    
    if (command === 'work') {
        if (!isWorkChannel(channelId)) {
            await message.reply('❌ Not a work zone!');
            return;
        }
        const data = loadData();
        const user = ensureUserRecord(data, userId);
        if (!user.is_employed) {
            await message.reply('❌ You are not employed! Get hired using `-hire`!');
            return;
        }
        
        let company = null;
        let companyId = null;
        const managed = getManagedCompany(userId, data);

        if (managed) {
            company = managed.company;
            companyId = managed.companyId;
        } else if (user.employed_at) {
            for (const [cid, c] of Object.entries(data.companies)) {
                if (c.name === user.employed_at) {
                    company = c;
                    companyId = cid;
                    break;
                }
            }
        }
        
        if (!company) {
            await message.reply('❌ Your employer company was not found!');
            return;
        }
        
        if (user.last_work) {
            const elapsed = (Date.now() - new Date(user.last_work).getTime()) / 1000;
            if (elapsed < WORK_COOLDOWN) {
                const nextTs = Math.floor(new Date(user.last_work).getTime()/1000 + WORK_COOLDOWN);
                const remaining = Math.floor(WORK_COOLDOWN - elapsed);
                const mins = Math.floor(remaining / 60);
                const secs = remaining % 60;
                await message.reply(`⏳ **On cooldown!** Try again <t:${nextTs}:R> (<t:${nextTs}:F> — ${mins}m ${secs}s left)`);
                return;
            }
        }
        
        // Get user's SSR from their stored region or role
        let userSSR = user.ssr_region;
        if (!userSSR) {
            try {
                const member = await message.guild.members.fetch(userId);
                for (const [ssrName, ssrData] of Object.entries(SSR_REGIONS)) {
                    if (member.roles.cache.has(ssrData.role_id)) {
                        userSSR = ssrName;
                        user.ssr_region = userSSR;
                        break;
                    }
                }
            } catch (err) {
                console.error('Error fetching member:', err);
            }
        }

        if (!userSSR) {
            await message.reply('❌ You don\'t have an SSR role! Contact an admin.');
            return;
        }

        // Work zones are shared across all SSRs of a region (e.g. Georgian,
        // Armenian and Azerbaijani citizens all work in the Caucasus work
        // zone), so compare work zones — not SSR names.
        const myWorkZone = SSR_REGIONS[userSSR]?.work_zone;
        if (myWorkZone !== channelId) {
            await message.reply(`❌ You are assigned to **${userSSR}**! You can only work in your region's work zone.`);
            return;
        }
        
        const resources = SSR_REGIONS[userSSR]?.resources || [];
        if (resources.length === 0) {
            await message.reply('❌ No resources in this SSR!');
            return;
        }
        
        const weights = resources.map(r => getResourceWeight(userSSR, r, data));
        const totalWeight = weights.reduce((a, b) => a + b, 0);
        let rand = Math.random() * totalWeight;
        let resource = resources[0];
        for (let i = 0; i < weights.length; i++) {
            rand -= weights[i];
            if (rand <= 0) { resource = resources[i]; break; }
        }
        // Gold is deliberately scarce: when it does drop, only ever 1 unit — except during Gold Rush (up to 2)
        let quantity = resource === 'Gold' ? 1 : (Math.floor(Math.random() * 2) + 1); // nerfed 1-3 -> 1-2 (free resources balanced)
        const rushQty = getActiveGoldRush(data);
        if (rushQty && rushQty.ssr === userSSR && resource === 'Gold') {
            quantity = rushQty.percent >= 50 ? 2 : Math.max(1, quantity);
        }
        
        const wage = Math.max(company.wage || 10, data.national_minimum_wage || 0);
        const companyTopUp = Math.max(0, wage - BASE_WAGE_PRINT);
        const printed = wage - companyTopUp;

        if (companyTopUp > 0 && (company.funds || 0) < companyTopUp) {
            await message.reply(`❌ **Payroll shortfall!** Wage is ${formatMoney(wage)} = ${formatMoney(printed)} printed (state) + ${formatMoney(companyTopUp)} from **${company.name}** funds. Company only has ${formatMoney(company.funds)} → needs ${formatMoney(companyTopUp)} extra. Lower wage with \`-setwage\` or add funds via sales.`);
            return;
        }
        if (companyTopUp > 0) {
            company.funds = (company.funds || 0) - companyTopUp;
        }
        // Balance: work now costs 1 food from company (must be fed). CEO can set which food via -setworkfood. Without food, 60% yield.
        let workFoodConsumed = {};
        let workEfficiency = 1.0;
        const foodStockBefore = getFoodStock(company.inventory);
        const workFoodPref = company.work_food && company.work_food !== "auto" ? canonRes(company.work_food) : null;
        const workFoodPrefCanon = workFoodPref ? (Object.keys(FOOD_VALUES).find(k=>k.toLowerCase()===workFoodPref.toLowerCase())||workFoodPref) : null;
        if (foodStockBefore < 1) {
            workEfficiency = 0.6;
            quantity = Math.max(1, Math.floor(quantity * workEfficiency));
        } else if (workFoodPrefCanon) {
            const havePref = (company.inventory[workFoodPrefCanon] || 0);
            if (havePref >= 1) {
                company.inventory[workFoodPrefCanon] -= 1;
                if (company.inventory[workFoodPrefCanon] <= 0) delete company.inventory[workFoodPrefCanon];
                workFoodConsumed = { [workFoodPrefCanon]: 1 };
            } else {
                // preferred food missing → 60% yield (hungry, wrong food)
                workEfficiency = 0.6;
                quantity = Math.max(1, Math.floor(quantity * workEfficiency));
            }
        } else {
            workFoodConsumed = consumeFood(company.inventory, 1);
        }

        // WORK: base printed by state, excess paid from company funds. Resources go to company inventory.
        const success = await updateUnbBalance(userId, wage, 0, `Work wage ${formatMoney(wage)} (${formatMoney(printed)} printed + ${formatMoney(companyTopUp)} company) from ${company.name}`);
        if (!success) {
            await message.reply('❌ Failed to update balance!');
            return;
        }

        if (!company.inventory) company.inventory = {};
        company.inventory[resource] = (company.inventory[resource] || 0) + quantity;

        user.cash = (user.cash || 0) + wage;
        user.last_work = new Date().toISOString();
        user.work_count = (user.work_count || 0) + 1;

        data.companies[companyId] = company;
        // single atomic save: user is already referenced inside data via ensureUserRecord
        saveData(data);

        updateCompanyPrice(companyId);
        // GSI boost from work activity (0.2% per work, keeps GSI from flatlining to 1)
        try { updateGSI(0.002); } catch {}

        const ssrEmoji = SSR_REGIONS[userSSR]?.emoji || '🌍';
        const foodNote = workEfficiency < 1 ? `⚠️ No food — 60% yield (need 1🍞)` : `🍞 -1 food (${Object.entries(workFoodConsumed).map(([k,v])=>k+' x'+v).join(', ')||'Wheat x1'})`;
        const wageBreakdown = companyTopUp > 0 ? `${formatMoney(printed)} printed + ${formatMoney(companyTopUp)} from ${company.name}` : `${formatMoney(printed)} printed (no company cost)`;
        const nextTs = Math.floor(Date.now()/1000 + WORK_COOLDOWN);
        const embed = new EmbedBuilder()
            .setTitle('⚒️ Work Complete')
            .setDescription(`${user.employed_at || 'Unknown'} - ${userSSR}`)
            .setColor(0x00FF00)
            .setFooter({ text: `⏳ Next <t:${nextTs}:R> • <t:${nextTs}:F>` })
            .addFields(
                { name: '💰 Wage Earned', value: `${formatMoney(wage)} (${wageBreakdown})`, inline: true },
                { name: '📦 Resources Produced', value: `${quantity}x ${resource} → company inventory${workEfficiency<1?' (60% — hungry!)':''}`, inline: false },
                { name: '🍞 Food', value: foodNote, inline: true },
                { name: '📍 Region', value: `${ssrEmoji} ${userSSR}`, inline: true },
                { name: '👷 Shift #', value: `${user.work_count}`, inline: true },
                { name: '🏦 Company Funds', value: formatMoney(company.funds) + (companyTopUp>0 ? ` (-${formatMoney(companyTopUp)} paid)` : ''), inline: true }
            );
        await message.reply({ embeds: [embed] });
        return;
    }

    // ============================================================
    // SETWAGE - Set worker wage
    // ============================================================
    
    if (command === 'setwage') {
        const amount = parseInt(args[0]);
        if (isNaN(amount) || amount <= 0) {
            await message.reply('❌ Please specify a positive amount! Usage: `-setwage <amount>`');
            return;
        }
        
        const data = loadData();
        const managed = getManagedCompany(userId, data);
        if (!managed) {
            await message.reply('❌ You do not own or direct a company!');
            return;
        }
        const company = managed.company;
        const companyId = managed.companyId;
        if (!canManageCompany(userId, company)) {
            await message.reply('❌ You do not have management authority over this company!');
            return;
        }
        
        const oldWage = getCompanyWage(companyId);
        setCompanyWage(companyId, amount);
        
        const updatedData = loadData();
        const updatedCompany = updatedData.companies[companyId];
        
        const embed = new EmbedBuilder()
            .setTitle('💰 Wage Updated')
            .setDescription(`Worker wage for **${company.name}** has been updated!`)
            .setColor(0xFFD700)
            .setFooter({ text: '🇺🇸🇸🇷 USSR Economy' })
            .addFields(
                { name: '🏢 Company', value: company.name, inline: true },
                { name: '📊 Old Wage', value: formatMoney(oldWage), inline: true },
                { name: '📈 New Wage', value: formatMoney(amount), inline: true },
                { name: '🏦 Company Funds', value: formatMoney(updatedCompany.funds || 0), inline: true },
                { name: '💡 Note', value: 'Workers will be paid this amount per shift from company funds.', inline: false }
            );
        await message.reply({ embeds: [embed] });
        return;
    }

    // ============================================================
    // RESOURCES
    // ============================================================
    
    if (command === 'setworkfood' || command === 'workfood' || command === 'work_food' || command === 'setwagefood') {
        const data = loadData();
        const managed = getManagedCompany(userId, data);
        if (!managed) { await message.reply('❌ Only company owners/directors/managers can set work food!'); return; }
        const company = managed.company;
        const cid = managed.companyId;
        if (args.length === 0) {
            const current = company.work_food || "auto";
            const fv = current !== "auto" ? (FOOD_VALUES[canonRes(current)] ?? FOOD_VALUES[current] ?? 1) : 1;
            const stock = getFoodStock(company.inventory);
            const invList = Object.entries(company.inventory||{}).filter(([k])=>FOOD_VALUES[k]).map(([k,v])=>`${k} x${v} (${v*(FOOD_VALUES[k])}🍞)`).join(', ') || 'no food';
            await message.reply(`🍞 **${company.name}** work food: **${current}**${current!=="auto"?` (${fv}🍞 per work)`:''} (stock ${stock}🍞: ${invList})\nSet via \`-setworkfood <item|auto>\` — e.g. \`-setworkfood Wheat\` (1🍞 efficient) or \`-setworkfood Fish\` (2🍞 wasteful if you have fish surplus) or \`-setworkfood Bread\` (3🍞). \`auto\` = lowest food first (most efficient). Fish 2🍞 for 1 work is indeed wasteful — use Wheat 1🍞 to save.`);
            return;
        }
        const input = args.join(' ').trim();
        if (input.toLowerCase() === 'auto' || input.toLowerCase() === 'default' || input.toLowerCase() === 'none') {
            company.work_food = "auto";
            data.companies[cid] = company;
            saveData(data);
            await message.reply(`✅ **${company.name}** work food set to **auto** (lowest food first, most efficient — Wheat 1🍞 before Fish 2🍞).`);
            return;
        }
        let newFood = canonRes(input);
        const matched = Object.keys(FOOD_VALUES).find(k => k.toLowerCase() === newFood.toLowerCase());
        if (!matched) {
            await message.reply(`❌ '${input}' is not a food! Valid foods: ${Object.keys(FOOD_VALUES).join(', ')} or \`auto\``);
            return;
        }
        newFood = matched;
        company.work_food = newFood;
        data.companies[cid] = company;
        saveData(data);
        const fv2 = FOOD_VALUES[newFood];
        await message.reply(`✅ **${company.name}** work food set to **${newFood}** (${fv2}🍞 per work). 1 work will now consume **1× ${newFood}** (${fv2}🍞) if available, else 60% yield. Tip: Fish 2🍞 for 1 work wastes 1🍞 vs Wheat 1🍞 — set to Wheat to save fish for trade.`);
        return;
    }

    if (command === 'resources') {
        const user = getUser(userId);
        const resources = user.resources || {};
        if (Object.keys(resources).length === 0) {
            await message.reply('📦 No resources! Use `-work`.');
            return;
        }
        let total = 0;
        const lines = [];
        for (const [r, qty] of Object.entries(resources)) {
            const val = Math.floor(qty * (RESOURCE_VALUES[r] || 0) * getInflationMultiplier());
            total += val;
            lines.push(`• ${r} x${qty} (${formatMoney(val)})`);
        }
        const embed = new EmbedBuilder()
            .setTitle(`📦 ${message.author.displayName}'s Resources`)
            .setDescription(lines.slice(0, 20).join('\n'))
            .setColor(0x5865F2)
            .setFooter({ text: '🇺🇸🇸🇷 USSR Economy' })
            .addFields({ name: 'Total Value', value: formatMoney(total), inline: false });
        await message.reply({ embeds: [embed] });
        return;
    }

    // ============================================================
    // INVENTORY
    // ============================================================
    
    if (command === 'inventory') {
        const user = getUser(userId);
        const inv = user.inventory || {};
        if (Object.keys(inv).length === 0) {
            await message.reply('📦 Inventory empty! Use `-craft`.');
            return;
        }
        let total = 0;
        const lines = [];
        for (const [item, qty] of Object.entries(inv)) {
            if (CRAFTING_RECIPES[item]) {
                const val = Math.floor(qty * CRAFTING_RECIPES[item].value * getInflationMultiplier());
                total += val;
                lines.push(`• ${CRAFTING_RECIPES[item].emoji} ${item} x${qty} (${formatMoney(val)})`);
            }
        }
        const embed = new EmbedBuilder()
            .setTitle(`📦 ${message.author.displayName}'s Inventory`)
            .setDescription(lines.slice(0, 20).join('\n'))
            .setColor(0xFFD700)
            .setFooter({ text: '🇺🇸🇸🇷 USSR Economy' })
            .addFields({ name: 'Total Value', value: formatMoney(total), inline: false });
        await message.reply({ embeds: [embed] });
        return;
    }

    // ============================================================
    // CRAFT - PERSONAL vs COMPANY
    // ============================================================
    
    if (command === 'craftpersonal' || command === 'craft') {
        // support qty: -craftpersonal Steel Ingot 3
        let qtyMake = 1;
        let itemName = args.join(' ');
        if (args.length >= 2) {
            const maybeQty = parseInt(args[args.length - 1]);
            if (!isNaN(maybeQty) && maybeQty > 0 && maybeQty <= 100) {
                const cand = args.slice(0, -1).join(' ');
                if (CRAFTING_RECIPES[cand]) { itemName = cand; qtyMake = maybeQty; }
            }
        }
        if (!itemName) {
            await message.reply('❌ Specify an item! `-craftpersonal <item> [qty]` or `-craft <item> [qty]` — e.g. `-craft Steel Ingot 3`');
            return;
        }
        if (!CRAFTING_RECIPES[itemName]) {
            await message.reply(`❌ Unknown recipe! Use \`-recipes\`.`);
            return;
        }
        const data = loadData();
        const user = ensureUserRecord(data, userId);
        const recipe = CRAFTING_RECIPES[itemName];
        const missing = [];
        for (const [r, qty] of Object.entries(recipe.ingredients)) {
            const need = qty * qtyMake;
            let current = 0;
            if (RESOURCE_VALUES[r] !== undefined) current = (user.resources || {})[r] || 0;
            else if (CRAFTING_RECIPES[r] !== undefined) current = (user.inventory || {})[r] || 0;
            else current = ((user.resources || {})[r] || 0) + ((user.inventory || {})[r] || 0);
            if (current < need) missing.push(`${r} (need ${need}, have ${current})`);
        }
        if (missing.length > 0) {
            await message.reply('❌ Missing (personal) for x' + qtyMake + ':\n' + missing.join('\n'));
            return;
        }
        for (const [r, qty] of Object.entries(recipe.ingredients)) {
            const need = qty * qtyMake;
            if (RESOURCE_VALUES[r] !== undefined) {
                user.resources[r] = (user.resources[r] || 0) - need;
                if (user.resources[r] <= 0) delete user.resources[r];
            } else if (CRAFTING_RECIPES[r] !== undefined) {
                user.inventory[r] = (user.inventory[r] || 0) - need;
                if (user.inventory[r] <= 0) delete user.inventory[r];
            } else {
                let rem = need;
                const resHave = (user.resources[r] || 0);
                if (resHave >= rem) { user.resources[r] = resHave - rem; if (user.resources[r] <= 0) delete user.resources[r]; }
                else { if (resHave > 0) { delete user.resources[r]; rem -= resHave; } user.inventory[r] = (user.inventory[r] || 0) - rem; if (user.inventory[r] <= 0) delete user.inventory[r]; }
            }
        }
        if (!user.inventory) user.inventory = {};
        user.inventory[itemName] = (user.inventory[itemName] || 0) + qtyMake;
        saveData(data);
        const embed = new EmbedBuilder()
            .setTitle(`🔨 Crafted ${recipe.emoji} ${itemName} x${qtyMake}! (Personal)`)
            .setDescription(`Value each: ${formatMoney(recipe.value)} • Total: ${formatMoney(recipe.value*qtyMake)}\nAdded to personal inventory.`)
            .setColor(0xFFD700)
            .setFooter({ text: '🇺🇸🇸🇷 USSR Economy • Personal craft — add qty, e.g. -craft Steel Ingot 3' });
        await message.reply({ embeds: [embed] });
        return;
    }

    if (command === 'craftcompany') {
        let qtyMake = 1;
        let itemName = args.join(' ');
        if (args.length >= 2) {
            const maybeQty = parseInt(args[args.length - 1]);
            if (!isNaN(maybeQty) && maybeQty > 0 && maybeQty <= 100) {
                const cand = args.slice(0, -1).join(' ');
                if (CRAFTING_RECIPES[cand]) { itemName = cand; qtyMake = maybeQty; }
            }
        }
        if (!itemName) {
            await message.reply('❌ Specify an item! `-craftcompany <item> [qty]` — e.g. `-craftcompany Steel Ingot 3`');
            return;
        }
        if (!CRAFTING_RECIPES[itemName]) {
            await message.reply(`❌ Unknown recipe! Use \`-recipes\`.`);
            return;
        }
        const data = loadData();
        const user = ensureUserRecord(data, userId);
        if (!user.is_employed) {
            await message.reply('❌ You must be employed to craft with company resources! Get hired using `-hire`.');
            return;
        }
        let company = null;
        let companyId = null;
        const managed = getManagedCompany(userId, data);
        if (managed) { company = managed.company; companyId = managed.companyId; }
        else if (user.employed_at) {
            const match = getCompanyByIdentifier(data, user.employed_at);
            if (match) { company = match.company; companyId = match.companyId; }
        }
        if (!company) {
            await message.reply('❌ Your employer company was not found!');
            return;
        }
        const recipe = CRAFTING_RECIPES[itemName];
        const missing = [];
        for (const [r, qty] of Object.entries(recipe.ingredients)) {
            const need = qty * qtyMake;
            const current = (company.inventory || {})[r] || 0;
            if (current < need) missing.push(`${r} (need ${need}, have ${current})`);
        }
        if (missing.length > 0) {
            await message.reply(`❌ Missing (company **${company.name}**) for x${qtyMake}:\n` + missing.join('\n'));
            return;
        }
        for (const [r, qty] of Object.entries(recipe.ingredients)) {
            const need = qty * qtyMake;
            company.inventory[r] = (company.inventory[r] || 0) - need;
            if (company.inventory[r] <= 0) delete company.inventory[r];
        }
        if (!company.inventory) company.inventory = {};
        company.inventory[itemName] = (company.inventory[itemName] || 0) + qtyMake;
        data.companies[companyId] = company;
        saveData(data);
        updateCompanyPrice(companyId);
        const embed = new EmbedBuilder()
            .setTitle(`🏭 Crafted ${recipe.emoji} ${itemName} x${qtyMake}! (Company)`)
            .setDescription(`Value each: ${formatMoney(recipe.value)} • Total: ${formatMoney(recipe.value*qtyMake)}\nAdded to **${company.name}** inventory.`)
            .setColor(0x5865F2)
            .setFooter({ text: '🇺🇸🇸🇷 USSR Economy • Company craft — add qty, e.g. -craftcompany Steel Ingot 3' })
            .addFields({ name: '🏢 Company', value: company.name, inline: true }, { name: '📦 Company Funds', value: formatMoney(company.funds || 0), inline: true });
        await message.reply({ embeds: [embed] });
        return;
    }

    // ============================================================
    // RECIPES
    // ============================================================
    
    if (command === 'recipes') {
        const embed = new EmbedBuilder()
            .setTitle('📖 Crafting Recipes')
            .setColor(0x5865F2)
            .setFooter({ text: '🇺🇸🇸🇷 USSR Economy' });
        let text = '';
        for (const [name, recipe] of Object.entries(CRAFTING_RECIPES)) {
            const ingredients = Object.entries(recipe.ingredients).map(([r, qty]) => `${qty}x ${r}`).join(', ');
            text += `${recipe.emoji} ${name} - ${formatMoney(recipe.value)}\n  📋 ${ingredients}\n\n`;
        }
        embed.setDescription(text);
        await message.reply({ embeds: [embed] });
        return;
    }

    // ============================================================
    // SELLITEM
    // ============================================================
    
    if (command === 'sellitem') {
        if (args.length < 2) {
            await message.reply('❌ Usage: -sellitem <item> <qty>');
            return;
        }
        const itemName = args[0];
        const quantity = parseInt(args[1]) || 1;
        const user = getUser(userId);
        if (!user.inventory || !user.inventory[itemName] || user.inventory[itemName] < quantity) {
            await message.reply(`❌ Don't have ${quantity}x ${itemName}!`);
            return;
        }
        if (!CRAFTING_RECIPES[itemName]) {
            await message.reply('❌ That has no value!');
            return;
        }
        if (isGoldItem(itemName)) {
            const d = loadData();
            if (!canSellGold(d)) {
                await message.reply(`🔒 **Gold sales locked!** Gold Standard is ${getGoldBackingRatio(d).toFixed(1)}% — must be 100% to sell Gold/Gold Bar. Sell only to the State via gov contracts when unlocked.`);
                return;
            }
        }
        const value = Math.floor(CRAFTING_RECIPES[itemName].value * quantity * getInflationMultiplier());
        user.inventory[itemName] -= quantity;
        if (user.inventory[itemName] <= 0) delete user.inventory[itemName];
        const success = await updateUnbBalance(userId, value, 0, `Sold ${quantity}x ${itemName}`);
        if (!success) {
            await message.reply('❌ Failed to update balance!');
            return;
        }
        user.cash = (user.cash || 0) + value;
        saveUser(userId, user);
        const embed = new EmbedBuilder()
            .setTitle('💰 Item Sold')
            .setDescription(`Sold ${quantity}x ${itemName} for ${formatMoney(value)}`)
            .setColor(0x00FF00)
            .setFooter({ text: '🇺🇸🇸🇷 USSR Economy' });
        await message.reply({ embeds: [embed] });
        return;
    }

    // ============================================================
    // HIRE
    // ============================================================
    
    if (command === 'hire') {
        if (args.length === 0) {
            await message.reply('❌ Usage: -hire @user');
            return;
        }
        const mention = args[0];
        const targetId = mention.replace(/[<@!>]/g, '');
        if (targetId === userId) {
            await message.reply('❌ Can\'t hire yourself!');
            return;
        }
        const data = loadData();
        const user = getUser(userId);
        const managed = getManagedCompany(userId, data);
        const companyId = managed?.companyId;
        if (!managed) {
            await message.reply('❌ You do not own or direct a company!');
            return;
        }
        const company = managed.company;
        const target = getUser(targetId);
        {
            const _bd = loadData();
            if (isBlacklisted(_bd, targetId)) {
                await message.reply(`❌ <@${targetId}> is **blacklisted** from the economy — cannot be hired (can only watch graphs etc).`);
                return;
            }
        }
        if (target.is_employed) {
            await message.reply(`❌ <@${targetId}> is already employed!`);
            return;
        }
        try {
            await client.users.fetch(targetId);
        } catch (err) {
            await message.reply(`❌ That user doesn't exist!`);
            return;
        }

        const embed = new EmbedBuilder()
            .setTitle('📨 Job Offer!')
            .setDescription(`<@${targetId}>, you have been offered a job at **${company.name}**!`)
            .setColor(0x5865F2)
            .addFields(
                { name: '🏢 Company', value: company.name, inline: true },
                { name: '📍 HQ SSR', value: company.hq_ssr || 'Unknown', inline: true },
                { name: '👔 Offered By', value: `${message.author}`, inline: true },
                { name: '💰 Wage', value: formatMoney(getCompanyWage(companyId)) + ' per shift', inline: true }
            )
            .setFooter({ text: 'Only the offered citizen can respond. Offer expires in 5 minutes.' });

        const acceptBtn = new ButtonBuilder()
            .setCustomId(`hire_accept_${companyId}_${targetId}`)
            .setLabel('✅ Accept')
            .setStyle(ButtonStyle.Success);
        const declineBtn = new ButtonBuilder()
            .setCustomId(`hire_decline_${companyId}_${targetId}`)
            .setLabel('❌ Decline')
            .setStyle(ButtonStyle.Danger);
        const row = new ActionRowBuilder().addComponents(acceptBtn, declineBtn);

        await message.reply({ content: `<@${targetId}>`, embeds: [embed], components: [row] });
        return;
    }

    // ============================================================
    // FIRE
    // ============================================================
    
    if (command === 'fire') {
        if (args.length === 0) {
            await message.reply('❌ Usage: -fire @user');
            return;
        }
        const mention = args[0];
        const targetId = mention.replace(/[<@!>]/g, '');
        if (targetId === userId) {
            await message.reply('❌ You can\'t fire yourself!');
            return;
        }
        const data = loadData();
        const managed = getManagedCompany(userId, data);
        if (!managed) {
            await message.reply('❌ You do not own or direct a company! Only owners/directors can fire.');
            return;
        }
        const company = managed.company;
        const companyId = managed.companyId;
        const target = ensureUserRecord(data, targetId);
        // Check if target exists as employed user (if never seen, ensureUserRecord creates empty - treat as not employed)
        const isTargetActuallyEmployed = target.is_employed && target.employed_at === company.name;
        // Also check if target record was just created (work_count 0 and no employment history) vs real user
        // Use data.users existence check: if target was newly created and never employed, treat as not employed
        if (!isTargetActuallyEmployed) {
            await message.reply(`❌ <@${targetId}> is not employed at **${company.name}**!`);
            return;
        }
        if (target.company_id === companyId || target.director_of === companyId) {
            await message.reply('❌ You cannot fire an owner or director! Use `-removedirector` for state directors.');
            return;
        }
        if (targetId === company.owner_id || targetId === company.director_id) {
            await message.reply('❌ You cannot fire the company owner/director!');
            return;
        }
        target.is_employed = false;
        target.employed_at = null;
        // keep ssr_region as is for potential re-hire, but clear employment
        company.employees = Math.max(0, (company.employees || 0) - 1);
        data.companies[companyId] = company;
        saveData(data);
        const embed = new EmbedBuilder()
            .setTitle('🔥 Worker Fired')
            .setDescription(`<@${targetId}> has been fired from **${company.name}**.`)
            .setColor(0xFF0000)
            .addFields(
                { name: '🏢 Company', value: company.name, inline: true },
                { name: '👔 Fired By', value: `${message.author}`, inline: true },
                { name: '👷 Remaining Employees', value: `${company.employees}`, inline: true }
            )
            .setFooter({ text: '🇺🇸🇸🇷 USSR Economy' });
        await message.reply({ embeds: [embed] });
        try {
            const firedUser = await client.users.fetch(targetId);
            const dmEmbed = new EmbedBuilder()
                .setTitle('🔥 You Have Been Fired')
                .setDescription(`You have been fired from **${company.name}**.`)
                .setColor(0xFF0000)
                .setFooter({ text: 'You can seek employment elsewhere with -hire.' });
            await firedUser.send({ embeds: [dmEmbed] });
        } catch (err) {}
        return;
    }

    // ============================================================
    // EMPLOYEES
    // ============================================================
    
    if (command === 'employees') {
        const data = loadData();
        const caller = ensureUserRecord(data, userId);
        // Permission: must be employed (worker) or manager/director
        if (!caller.is_employed) {
            await message.reply('❌ Only employees and company directors can use `-employees`! You are not employed.');
            return;
        }
        // Special case: list all companies
        if (args.length > 0 && args[0].toLowerCase() === 'all') {
            const companies = Object.values(data.companies);
            if (companies.length === 0) {
                await message.reply('No companies!');
                return;
            }
            const embedAll = new EmbedBuilder()
                .setTitle('👷 Employees — All Companies')
                .setColor(0x5865F2)
                .setFooter({ text: '🇺🇸🇸🇷 USSR Economy • Use -employees <company> for details' });
            for (const comp of companies.slice(0, 15)) {
                const ssrEmoji = SSR_REGIONS[comp.hq_ssr]?.emoji || '🌍';
                const count = Object.values(data.users).filter(u => u.is_employed && u.employed_at === comp.name).length;
                const stateTag = comp.is_state_owned ? '🏛️' : '';
                embedAll.addFields({
                    name: `${stateTag} ${comp.name} (${comp.ticker}) ${ssrEmoji}`,
                    value: `👷 ${count} workers • ${comp.ceo || 'Unknown'}`,
                    inline: true
                });
            }
            if (companies.length > 15) embedAll.setDescription(`Showing 15 of ${companies.length} companies. Use \`-employees <name>\` for full roster.`);
            await message.reply({ embeds: [embedAll] });
            return;
        }
        let targetCompany = null;
        let targetCompanyId = null;
        if (args.length > 0) {
            const identifier = args.join(' ');
            const match = getCompanyByIdentifier(data, identifier);
            if (!match) {
                await message.reply(`❌ Company '${identifier}' not found!`);
                return;
            }
            targetCompany = match.company;
            targetCompanyId = match.companyId;
        } else {
            const managed = getManagedCompany(userId, data);
            if (managed) {
                targetCompany = managed.company;
                targetCompanyId = managed.companyId;
            } else if (caller.employed_at) {
                const match = getCompanyByIdentifier(data, caller.employed_at);
                if (match) {
                    targetCompany = match.company;
                    targetCompanyId = match.companyId;
                }
            }
            if (!targetCompany) {
                await message.reply('❌ Could not determine your company! Use `-employees <company name>` or `-employees all`');
                return;
            }
        }
        const ssrEmoji = SSR_REGIONS[targetCompany.hq_ssr]?.emoji || '🌍';
        const stateTag = targetCompany.is_state_owned ? '🏛️ STATE' : '';
        // Collect all users employed at this company
        const employeeEntries = [];
        for (const [uid, uData] of Object.entries(data.users)) {
            if (uData.is_employed && uData.employed_at === targetCompany.name) {
                // Exclude owner/director from worker list? Keep them but mark
                employeeEntries.push({ uid, uData });
            }
        }
        // Sort: managers first, then by work_count descending
        employeeEntries.sort((a, b) => {
            const aIsManager = a.uid === targetCompany.owner_id || a.uid === targetCompany.director_id;
            const bIsManager = b.uid === targetCompany.owner_id || b.uid === targetCompany.director_id;
            if (aIsManager && !bIsManager) return -1;
            if (!aIsManager && bIsManager) return 1;
            return (b.uData.work_count || 0) - (a.uData.work_count || 0);
        });
        const embed = new EmbedBuilder()
            .setTitle(`👷 Employees — ${targetCompany.name} ${stateTag}`)
            .setColor(0x5865F2)
            .setFooter({ text: '🇺🇸🇸🇷 USSR Economy' })
            .addFields(
                { name: '🏢 Company', value: `${ssrEmoji} ${targetCompany.hq_ssr || 'Unknown'}`, inline: true },
                { name: '👔 CEO / Director', value: targetCompany.ceo || 'Unknown', inline: true },
                { name: '👷 Total', value: `${employeeEntries.length} (recorded: ${targetCompany.employees || 0})`, inline: true }
            );
        if (employeeEntries.length === 0) {
            embed.setDescription('No employees found for this company.');
        } else {
            const lines = employeeEntries.slice(0, 25).map(({ uid, uData }, idx) => {
                const isManager = uid === targetCompany.owner_id || uid === targetCompany.director_id;
                const role = isManager ? (targetCompany.is_state_owned ? 'Director' : 'Owner') : 'Worker';
                const shifts = uData.work_count || 0;
                const region = uData.ssr_region || 'Unknown';
                return `${idx + 1}. <@${uid}> — **${role}** | Shifts: ${shifts} | ${region}`;
            });
            let desc = lines.join('\n');
            if (employeeEntries.length > 25) desc += `\n...and ${employeeEntries.length - 25} more`;
            embed.setDescription(desc);
        }
        await message.reply({ embeds: [embed] });
        return;
    }

    // ============================================================
    // MANAGERS — CEO/Director appoints helpers (hire/fire/collect/build, no disband)
    // ============================================================
    
    if (command === 'appointmanager' || command === 'addmanager' || command === 'managers_add') {
        const data = loadData();
        const managed = getManagedCompany(userId, data);
        if (!managed || !['owner','director'].includes(managed.role)) {
            await message.reply('❌ Only CEOs/Directors can appoint managers (managers cannot appoint).');
            return;
        }
        if (args.length === 0) {
            await message.reply('❌ Usage: `-appointmanager @user`');
            return;
        }
        const targetId = args[0].replace(/[<@!>]/g, '');
        if (targetId === userId) { await message.reply('❌ Cannot appoint yourself!'); return; }
        const company = managed.company;
        const cid = managed.companyId;
        if (!Array.isArray(company.managers)) company.managers = [];
        if (company.managers.includes(targetId)) { await message.reply(`❌ <@${targetId}> is already a manager of **${company.name}**.`); return; }
        if (company.managers.length >= 5) { await message.reply('❌ Max 5 managers per company.'); return; }
        const target = ensureUserRecord(data, targetId);
        if (isBlacklisted(data, targetId)) { await message.reply('❌ That user is blacklisted.'); return; }
        if (target.company_id && data.companies[target.company_id]?.owner_id === targetId) { await message.reply('❌ Target owns a private company.'); return; }
        if (target.director_of) { await message.reply('❌ Target is already a State Director.'); return; }
        // check if already manager elsewhere
        for (const [otherCid, comp] of Object.entries(data.companies)) {
            if (Array.isArray(comp.managers) && comp.managers.includes(targetId)) {
                await message.reply(`❌ <@${targetId}> is already manager of **${comp.name}**.`);
                return;
            }
        }
        if (target.is_employed && target.employed_at && target.employed_at !== company.name) {
            await message.reply(`❌ <@${targetId}> is already employed at **${target.employed_at}**. Must resign first.`);
            return;
        }
        company.managers.push(targetId);
        data.companies[cid] = company;
        // make them employed at this company if not already
        if (!target.is_employed) {
            target.is_employed = true;
            target.employed_at = company.name;
            target.ssr_region = company.hq_ssr || target.ssr_region;
            company.employees = Math.max(0, (company.employees || 0));
            // don't increment employees for manager? Managers are not counted as employees? Keep as is - managers are separate, but they are employed
            // we won't increment employees count for managers (they are helpers)
        }
        saveData(data);
        const embed = new EmbedBuilder().setTitle('👔 Manager Appointed').setDescription(`<@${targetId}> is now a **Manager** of **${company.name}**.\nThey can hire/fire/collect/build/upgrade/factorydeal — but cannot disband, invest, or appoint other managers.`).setColor(0x5865F2).setFooter({text: 'CEO/Director retains ownership'});
        await message.reply({ embeds: [embed] });
        return;
    }

    if (command === 'removemanager' || command === 'delmanager' || command === 'managers_remove') {
        const data = loadData();
        const managed = getManagedCompany(userId, data);
        if (!managed || !['owner','director'].includes(managed.role)) {
            await message.reply('❌ Only CEOs/Directors can remove managers.');
            return;
        }
        if (args.length === 0) { await message.reply('❌ Usage: `-removemanager @user`'); return; }
        const targetId = args[0].replace(/[<@!>]/g, '');
        const company = managed.company;
        const cid = managed.companyId;
        if (!Array.isArray(company.managers) || !company.managers.includes(targetId)) {
            await message.reply(`❌ <@${targetId}> is not a manager of **${company.name}**.`);
            return;
        }
        company.managers = company.managers.filter(id => id !== targetId);
        data.companies[cid] = company;
        // optionally keep them employed as worker? Keep employed
        saveData(data);
        await message.reply(`✅ Removed <@${targetId}> as manager of **${company.name}**.`);
        return;
    }

    if (command === 'managers' || command === 'listmanagers') {
        const data = loadData();
        let targetCompany = null;
        const q = args.join(' ').trim();
        if (q) {
            const m = getCompanyByIdentifier(data, q);
            if (!m) { await message.reply(`❌ Company '${q}' not found.`); return; }
            targetCompany = m.company;
        } else {
            const managed = getManagedCompany(userId, data);
            if (managed) targetCompany = managed.company;
            else {
                const caller = ensureUserRecord(data, userId);
                if (caller.employed_at) {
                    const m = getCompanyByIdentifier(data, caller.employed_at);
                    if (m) targetCompany = m.company;
                }
            }
            if (!targetCompany) { await message.reply('❌ Could not find your company. Use `-managers <company>`'); return; }
        }
        const list = (targetCompany.managers || []).map(id=>`• <@${id}> \`${id}\``).join('\n') || 'No managers appointed. CEOs/Directors can add with `-appointmanager @user` (max 5).';
        const embed = new EmbedBuilder().setTitle(`👔 Managers — ${targetCompany.name}`).setDescription(list).setColor(0x5865F2).setFooter({text: 'Managers can hire/fire/collect/build — not disband/invest'});
        await message.reply({ embeds: [embed] });
        return;
    }

    // ============================================================
    // TRADE — SSR balanced trade (food & resources)
    // ============================================================
    
    if (command === 'trade' || command === 'ssrtrade' || command === 'companytrade') {
        // Syntax: -trade <targetCompany> <item> <qty>  (quotes not needed, auto-detects company name)
        // Example: -trade "Baltic Timber & Harbour Co" Fish 5  or  -trade SovietSteel Iron Ore 10
        if (args.length < 3) {
            await message.reply('❌ Usage: `-trade <company> <item> <qty>`\nExample: `-trade StateOil Gas Fish 5` or `-trade "Soviet Steel Works" Wheat 10`\n💡 **Tip: Fish (2🍞) is key food — trade via -trade!**');
            return;
        }
        const qtyRaw = args[args.length - 1];
        let qty = parseInt(qtyRaw);
        let itemTokens, companyTokens;
        if (!isNaN(qty) && qty > 0) {
            // qty is last token
            // try to find company by longest prefix
            let found = null;
            for (let i = args.length - 1; i >= 1; i--) {
                const compCand = args.slice(0, i).join(' ');
                const itemCand = args.slice(i, args.length - 1).join(' ');
                if (!itemCand) continue;
                if (getCompanyByIdentifier(loadData(), compCand)) {
                    found = { compCand, itemCand, qty };
                    break;
                }
            }
            if (!found) {
                // fallback: assume first token is company ticker/id and item is second token
                await message.reply('❌ Could not resolve target company. Use exact name/ticker/ID. Check `-companies`.');
                return;
            }
            companyTokens = found.compCand;
            itemTokens = found.itemCand;
        } else {
            // no qty supplied, default 1
            qty = 1;
            let found = null;
            for (let i = args.length; i >= 1; i--) {
                const compCand = args.slice(0, i).join(' ');
                const itemCand = args.slice(i).join(' ');
                if (!itemCand) continue;
                if (getCompanyByIdentifier(loadData(), compCand)) {
                    found = { compCand, itemCand, qty };
                    break;
                }
            }
            if (!found) {
                await message.reply('❌ Could not resolve target company/item. Usage: `-trade <company> <item> <qty>`');
                return;
            }
            companyTokens = found.compCand;
            itemTokens = found.itemCand;
        }
        let targetIdentifier = companyTokens;
        let itemName = itemTokens;
        let markup = 0;
        {
            const lastArg = args[args.length-1];
            if (lastArg && /^\d+%?$/.test(lastArg) && args.length >= 4) {
                const maybeMarkup = parseInt(lastArg.replace('%',''));
                if (!isNaN(maybeMarkup) && maybeMarkup>=0 && maybeMarkup<=50) {
                    const secondLast = args[args.length-2];
                    const maybeQty = parseInt(secondLast);
                    if (!isNaN(maybeQty) && maybeQty>0) {
                        const argsNoMarkup = args.slice(0,-1);
                        for(let i=argsNoMarkup.length-1;i>=1;i--){
                            const compCand=argsNoMarkup.slice(0,i).join(' ');
                            const itemCand=argsNoMarkup.slice(i, argsNoMarkup.length-1).join(' ');
                            if(!itemCand) continue;
                            if(getCompanyByIdentifier(loadData(), compCand)){
                                markup = maybeMarkup;
                                break;
                            }
                        }
                    }
                }
            }
        }
        if (markup > 0) {
            const argsNoMarkup = args.slice(0,-1);
            qty = parseInt(argsNoMarkup[argsNoMarkup.length-1]);
            for(let i=argsNoMarkup.length-1;i>=1;i--){
                const compCand=argsNoMarkup.slice(0,i).join(' ');
                const itemCand=argsNoMarkup.slice(i, argsNoMarkup.length-1).join(' ');
                if(!itemCand) continue;
                if(getCompanyByIdentifier(loadData(), compCand)){
                    targetIdentifier = compCand;
                    itemName = itemCand;
                    break;
                }
            }
        }
        itemName = canonRes(itemName);
        const data = loadData();
        const managed = getManagedCompany(userId, data);
        if (!managed) {
            await message.reply('❌ Only company owners/directors can initiate trades! You must manage a company.');
            return;
        }
        const sourceCompany = managed.company;
        const sourceId = managed.companyId;
        const match = getCompanyByIdentifier(data, targetIdentifier);
        if (!match) {
            await message.reply(`❌ Target company '${targetIdentifier}' not found!`);
            return;
        }
        const targetCompany = match.company;
        const targetId = match.companyId;
        if (targetId === sourceId) {
            await message.reply('❌ Cannot trade to yourself!');
            return;
        }
        // allow any inventory item (resource or crafted)
        const have = (sourceCompany.inventory?.[itemName] || 0);
        if (have < qty) {
            await message.reply(`❌ Your company **${sourceCompany.name}** only has ${have}x ${itemName} (need ${qty}). Try smaller amount or craft/get resources.`);
            return;
        }
        // Gold lock: cannot trade gold until 100% (factories never, but trade is peer — allow only if backed?)
        if (isGoldItem(itemName) && !canSellGold(data)) {
            await message.reply(`🔒 Gold trade locked until Gold Standard 100% (now ${getGoldBackingRatio(data).toFixed(1)}%).`);
            return;
        }
        // Create pending trade request for target approval
        const tradeId = `trade_${Date.now()}_${Math.random().toString(36).slice(2,6)}`;
        pendingTrades.set(tradeId, { sourceId, targetId, itemName, qty, markup, requesterId: userId, createdAt: Date.now() });
        const isFood2 = FOOD_VALUES[itemName] ? ` 🍞 ${FOOD_VALUES[itemName]} food each` : '';
        const ssrFrom2 = sourceCompany.hq_ssr || 'Unknown';
        const ssrTo2 = targetCompany.hq_ssr || 'Unknown';
        const regionFrom2 = getRegionNameForSSR(ssrFrom2) || ssrFrom2;
        const regionTo2 = getRegionNameForSSR(ssrTo2) || ssrTo2;
        const targetAuthIds = [targetCompany.owner_id, targetCompany.director_id, ...(targetCompany.managers||[])].filter(Boolean);
        const targetMention = targetAuthIds.length ? targetAuthIds.map(id=>`<@${id}>`).join(' ') : targetCompany.name;
        const basePrice = (CRAFTING_RECIPES[itemName]?.value ?? RESOURCE_VALUES[canonRes(itemName)] ?? 10) * qty * getInflationMultiplier();
        const markupPrice = markup>0 ? Math.floor(basePrice * markup / 100) : 0;
        const totalPrice = Math.floor(basePrice + markupPrice);
        const embedReq = new EmbedBuilder()
            .setTitle('🤝 Trade Request — Awaiting Approval')
            .setDescription(`**${sourceCompany.name}** (${regionFrom2}) wants to send **${qty}x ${itemName}**${isFood2} to **${targetCompany.name}** (${regionTo2})\nMarket: ${formatMoney(basePrice)}${markup>0 ? ` + ${markup}% markup = **${formatMoney(totalPrice)}** (profit ${formatMoney(markupPrice)})` : ' *(no markup — just subsidy)*'}\nBuyer **${targetCompany.name}** pays **from company funds** (not CEO personal) → Seller **${sourceCompany.name}** receives ${markup>0?`market + markup`:'market'}\n\n${targetMention} — **Accept** or **Decline** within 5 minutes.`)
            .setColor(0xFFD700)
            .addFields(
                { name: '📤 From', value: `${sourceCompany.name}\n${ssrFrom2}`, inline: true },
                { name: '📥 To', value: `${targetCompany.name}\n${ssrTo2}`, inline: true },
                { name: '📦 Item', value: `${itemName} x${qty}${isFood2}`, inline: false },
                { name: '💡 Bonus', value: `If accepted: **3% intra-SSR / 6% cross-SSR / 10% cross-region** subsidy (state printed) — ${getRegionNameForSSR(ssrFrom2) !== getRegionNameForSSR(ssrTo2) ? '10% cross-region!' : ssrFrom2 !== ssrTo2 ? '6% cross-SSR' : '6%'}`, inline: false }
            )
            .setFooter({ text: `Trade ID ${tradeId} • Requested by ${message.author.tag} • Target must approve` });
        const acceptBtn = new ButtonBuilder().setCustomId(`trade_accept_${tradeId}`).setLabel('✅ Accept').setStyle(ButtonStyle.Success);
        const declineBtn = new ButtonBuilder().setCustomId(`trade_decline_${tradeId}`).setLabel('❌ Decline').setStyle(ButtonStyle.Danger);
        const row = new ActionRowBuilder().addComponents(acceptBtn, declineBtn);
        const tradeMsg = await message.reply({ content: `${targetMention}`, embeds: [embedReq], components: [row], fetchReply: true });
        // Collector for target auth only
        const collector = tradeMsg.createMessageComponentCollector({ filter: i => i.customId === `trade_accept_${tradeId}` || i.customId === `trade_decline_${tradeId}`, time: 300000 });
        collector.on('collect', async (interaction) => {
            const isAccept = interaction.customId === `trade_accept_${tradeId}`;
            // check auth
            if (!targetAuthIds.includes(interaction.user.id) && !isBotOwner(interaction.user.id)) {
                await interaction.reply({ content: `❌ Only ${targetCompany.name} managers/director can respond ( <@${targetAuthIds.join('> <@')}> )`, ephemeral: true });
                return;
            }
            collector.stop(isAccept ? 'accepted' : 'declined');
            pendingTrades.delete(tradeId);
            // re-load data to avoid stale
            const curData = loadData();
            const curSource = curData.companies[sourceId];
            const curTarget = curData.companies[targetId];
            if (!curSource || !curTarget) {
                await interaction.update({ content: `❌ Trade failed — company not found`, embeds: [], components: [] });
                return;
            }
            if (!isAccept) {
                await interaction.update({ content: `❌ **${curTarget.name}** declined trade **${qty}x ${itemName}** from **${curSource.name}**.`, embeds: [], components: [] });
                return;
            }
            // check source still has qty
            const haveNow = (curSource.inventory?.[itemName] || 0);
            if (haveNow < qty) {
                await interaction.update({ content: `❌ **${curSource.name}** no longer has ${qty}x ${itemName} (has ${haveNow}).`, embeds: [], components: [] });
                return;
            }
            // perform transfer with subsidy + markup payment (buyer pays seller)
            const pendingMarkup = pendingTrades.get(tradeId)?.markup ?? markup;
            let markupPaid = 0;
            let markupVal = pendingMarkup || 0;
            if (markupVal > 0) {
                const basePriceM = (CRAFTING_RECIPES[itemName]?.value ?? RESOURCE_VALUES[canonRes(itemName)] ?? 10) * qty * getInflationMultiplier();
                const totalPriceM = Math.floor(basePriceM * (1 + markupVal/100));
                if ((curTarget.funds || 0) < totalPriceM) {
                    await interaction.update({ content: `❌ **${curTarget.name}** lacks funds to pay ${formatMoney(totalPriceM)} (market ${formatMoney(Math.floor(basePriceM))} + ${markupVal}% markup) — has ${formatMoney(curTarget.funds||0)}`, embeds: [], components: [] });
                    return;
                }
                curTarget.funds -= totalPriceM;
                curSource.funds = (curSource.funds || 0) + totalPriceM;
                markupPaid = totalPriceM;
            }
            curSource.inventory[itemName] -= qty;
            if (curSource.inventory[itemName] <= 0) delete curSource.inventory[itemName];
            if (!curTarget.inventory) curTarget.inventory = {};
            curTarget.inventory[itemName] = (curTarget.inventory[itemName] || 0) + qty;
            const baseVal = (CRAFTING_RECIPES[itemName]?.value ?? RESOURCE_VALUES[canonRes(itemName)] ?? RESOURCE_VALUES[itemName] ?? 10);
            const isCrossSSR2 = curSource.hq_ssr !== curTarget.hq_ssr;
            const isCrossRegion2 = getRegionNameForSSR(curSource.hq_ssr) !== getRegionNameForSSR(curTarget.hq_ssr);
            const bonusRate2 = isCrossRegion2 ? 0.10 : isCrossSSR2 ? 0.06 : 0.03;
            const bonus2 = Math.floor(baseVal * qty * bonusRate2 * getInflationMultiplier());
            if (bonus2 > 0) {
                if (!curData.trade_volume) curData.trade_volume = 0;
                curData.trade_volume += qty;
                const expBonus2 = Math.floor(bonus2 * 0.6);
                const impBonus2 = bonus2 - expBonus2;
                curSource.funds = (curSource.funds || 0) + expBonus2;
                curTarget.funds = (curTarget.funds || 0) + impBonus2;
                curData.money_printed = (curData.money_printed || 0) + bonus2;
                if (!curData.transaction_log) curData.transaction_log = [];
                curData.transaction_log.push({ at: new Date().toISOString(), from: curSource.name, to: curTarget.name, item: itemName, qty, bonus: bonus2, crossRegion: isCrossRegion2 });
                if (curData.transaction_log.length > 200) curData.transaction_log = curData.transaction_log.slice(-200);
            }
            curData.companies[sourceId] = curSource;
            curData.companies[targetId] = curTarget;
            saveData(curData);
            updateCompanyPrice(sourceId);
            updateCompanyPrice(targetId);
            try { updateGSI(0.001); } catch {}
            const bonusText2 = bonus2 > 0 ? `\n💰 Trade subsidy **+₽${bonus2.toLocaleString()}** (${isCrossRegion2 ? '10% cross-region' : isCrossSSR2 ? '6% cross-SSR' : '3% intra-SSR'})` : '';
            const doneEmbed = new EmbedBuilder()
                .setTitle('✅ Trade Accepted — Completed')
                .setDescription(`**${curSource.name}** → **${curTarget.name}**\n**${qty}x ${itemName}** transferred.${bonusText2}`)
                .setColor(0x00FF00)
                .setFooter({ text: `Accepted by ${interaction.user.tag} • ${isCrossRegion2 ? 'CROSS-REGION 10% bonus' : isCrossSSR2 ? 'CROSS-SSR 6%' : 'Intra-SSR 3%'}` });
            await interaction.update({ content: `✅ Trade **${tradeId}** accepted by <@${interaction.user.id}>`, embeds: [doneEmbed], components: [] });
        });
        collector.on('end', async (collected, reason) => {
            if (reason === 'time' && pendingTrades.has(tradeId)) {
                pendingTrades.delete(tradeId);
                try { await tradeMsg.edit({ content: `⏰ Trade **${tradeId}** expired after 5 minutes — no response from **${targetCompany.name}**.`, embeds: [], components: [] }); } catch {}
            }
        });
        return;

    }

    // ============================================================
    // TRADE MENU — interactive Discord selects (company → item → qty)
    // ============================================================
    if (command === 'trademenu' || command === 'trademarket' || command === 'tradeui') {
        const data = loadData();
        const managed = getManagedCompany(userId, data);
        if (!managed) { await message.reply('❌ Only company owners/directors/managers can open trade menu!'); return; }
        const sourceCompany = managed.company;
        const sourceId = managed.companyId;
        const otherCompanies = Object.entries(data.companies).filter(([cid])=>cid!==sourceId).slice(0,25);
        if (!otherCompanies.length) { await message.reply('❌ No other companies to trade with!'); return; }
        const companyOptions = otherCompanies.map(([cid,c])=> new StringSelectMenuOptionBuilder().setLabel(`${c.name} (${c.ticker})`).setDescription(`${c.hq_ssr} • ${c.employees} workers`).setValue(cid).setEmoji(c.is_state_owned?'🏛️':'🏢'));
        const companyMenu = new StringSelectMenuBuilder().setCustomId('trademenu_company').setPlaceholder('Select target company...').addOptions(companyOptions);
        const rowCompany = new ActionRowBuilder().addComponents(companyMenu);
        const embedMenu = new EmbedBuilder().setTitle('🤝 Trade Menu — Step 1/3').setDescription(`**${sourceCompany.name}** → select **target company**`).setColor(0x5865F2).setFooter({text: 'Step 1: pick company • Step 2: pick item from your inventory • Step 3: qty'});
        const menuMsg = await message.reply({ embeds: [embedMenu], components: [rowCompany], fetchReply: true });
        const collector = menuMsg.createMessageComponentCollector({ filter: i=>i.user.id===userId, time: 120000 });
        let selectedCompanyId = null;
        let selectedItem = null;
        collector.on('collect', async (interaction) => {
            if (interaction.customId === 'trademenu_company') {
                selectedCompanyId = interaction.values[0];
                const targetCompany = data.companies[selectedCompanyId];
                const invItems = Object.entries(sourceCompany.inventory||{}).filter(([,qty])=>qty>0).slice(0,25);
                if (!invItems.length) {
                    await interaction.update({ content: `❌ **${sourceCompany.name}** has no items to trade!`, embeds: [], components: [] });
                    collector.stop('no_items');
                    return;
                }
                const itemOptions = invItems.map(([item,qty])=> {
                    const val = CRAFTING_RECIPES[item]?.value ?? RESOURCE_VALUES[canonRes(item)] ?? 10;
                    return new StringSelectMenuOptionBuilder().setLabel(`${item} x${qty}`).setDescription(`Value ${val} • ${qty} available`).setValue(item);
                });
                const itemMenu = new StringSelectMenuBuilder().setCustomId('trademenu_item').setPlaceholder('Select item to send...').addOptions(itemOptions);
                const rowItem = new ActionRowBuilder().addComponents(itemMenu);
                const embedItem = new EmbedBuilder().setTitle('🤝 Trade Menu — Step 2/3').setDescription(`**${sourceCompany.name}** → **${targetCompany.name}**\nSelect **item** from your inventory`).setColor(0x5865F2);
                await interaction.update({ embeds: [embedItem], components: [rowItem] });
            } else if (interaction.customId === 'trademenu_item') {
                selectedItem = interaction.values[0];
                const have = sourceCompany.inventory[selectedItem]||0;
                const qtyChoices = [1,2,3,5,10,25,50].filter(q=>q<=have).slice(0,5);
                if (!qtyChoices.length) qtyChoices.push(1);
                const qtyOptions = qtyChoices.map(q=> new StringSelectMenuOptionBuilder().setLabel(`${q}x ${selectedItem}`).setDescription(`${q} available ${have}`).setValue(String(q)));
                const qtyMenu = new StringSelectMenuBuilder().setCustomId('trademenu_qty').setPlaceholder('Select quantity...').addOptions(qtyOptions);
                const rowQty = new ActionRowBuilder().addComponents(qtyMenu);
                const embedQty = new EmbedBuilder().setTitle('🤝 Trade Menu — Step 3/3').setDescription(`**${sourceCompany.name}** → **${data.companies[selectedCompanyId].name}**\n**${selectedItem}** x${have} available — select **qty**`).setColor(0x5865F2);
                await interaction.update({ embeds: [embedQty], components: [rowQty] });
            } else if (interaction.customId === 'trademenu_qty') {
                const qty = parseInt(interaction.values[0]);
                const targetCompany = data.companies[selectedCompanyId];
                const have = sourceCompany.inventory[selectedItem]||0;
                if (have < qty) { await interaction.update({ content: `❌ Not enough ${selectedItem} (have ${have}, need ${qty})`, embeds: [], components: [] }); collector.stop('no_qty'); return; }
                // Step 4: markup selection
                const basePriceMenu = (CRAFTING_RECIPES[selectedItem]?.value ?? RESOURCE_VALUES[canonRes(selectedItem)] ?? 10) * qty * getInflationMultiplier();
                const markupOptions = [0,2,5,10,20].map(m=> {
                    const total = m===0 ? basePriceMenu : Math.floor(basePriceMenu*(1+m/100));
                    return new StringSelectMenuOptionBuilder().setLabel(`${m}% ${m===0?'(market)': `→ ${formatMoney(total)}`}`).setDescription(m===0?`Market ${formatMoney(basePriceMenu)}`:`+${m}% = ${formatMoney(total)} profit`).setValue(String(m));
                });
                const markupMenu = new StringSelectMenuBuilder().setCustomId('trademenu_markup').setPlaceholder('Select markup % above market (company funds pay you)...').addOptions(markupOptions);
                const rowMarkup = new ActionRowBuilder().addComponents(markupMenu);
                const embedMarkup = new EmbedBuilder().setTitle('🤝 Trade Menu — Step 4/4 — Set Price').setDescription(`**${sourceCompany.name}** → **${targetCompany.name}**\n**${qty}x ${selectedItem}** — Market **${formatMoney(basePriceMenu)}**\nSelect **markup % above market** — buyer **${targetCompany.name}** pays from **company funds** (not CEO personal), you receive **market + markup**\n*Example: Bread 50 + 5% = 52*`).setColor(0x5865F2);
                // store qty/item for next step via closure vars
                collector._pendingQty = qty;
                await interaction.update({ embeds: [embedMarkup], components: [rowMarkup] });
                return;
            } else if (interaction.customId === 'trademenu_markup') {
                const markup = parseInt(interaction.values[0]);
                const qty = collector._pendingQty;
                const targetCompany = data.companies[selectedCompanyId];
                const tradeId = `trade_${Date.now()}_${Math.random().toString(36).slice(2,6)}`;
                pendingTrades.set(tradeId, { sourceId, targetId: selectedCompanyId, itemName: selectedItem, qty, markup, requesterId: userId, createdAt: Date.now() });
                const targetAuthIds = [targetCompany.owner_id, targetCompany.director_id, ...(targetCompany.managers||[])].filter(Boolean);
                const targetMention = targetAuthIds.length ? targetAuthIds.map(id=>`<@${id}>`).join(' ') : targetCompany.name;
                const basePriceMenu2 = (CRAFTING_RECIPES[selectedItem]?.value ?? RESOURCE_VALUES[canonRes(selectedItem)] ?? 10) * qty * getInflationMultiplier();
                const totalPriceMenu2 = markup>0 ? Math.floor(basePriceMenu2*(1+markup/100)) : 0;
                const priceLineMenu = markup>0 ? `Market **${formatMoney(basePriceMenu2)}** + ${markup}% markup = **${formatMoney(totalPriceMenu2)}**\nBuyer **${targetCompany.name}** pays **from company funds** → Seller **${sourceCompany.name}** receives` : `Market **${formatMoney(basePriceMenu2)}** *(no markup — only subsidy 3-10%)*\nBuyer pays nothing extra (subsidy from state)`;
                const embedReq = new EmbedBuilder().setTitle('🤝 Trade Request — Awaiting Approval (via Menu)').setDescription(`**${sourceCompany.name}** → **${targetCompany.name}**\n**${qty}x ${selectedItem}**\n${priceLineMenu}\n\n${targetMention} — **Accept/Decline** within 5 min`).setColor(0xFFD700);
                const acceptBtn = new ButtonBuilder().setCustomId(`trade_accept_${tradeId}`).setLabel('✅ Accept').setStyle(ButtonStyle.Success);
                const declineBtn = new ButtonBuilder().setCustomId(`trade_decline_${tradeId}`).setLabel('❌ Decline').setStyle(ButtonStyle.Danger);
                const row = new ActionRowBuilder().addComponents(acceptBtn, declineBtn);
                await interaction.update({ content: `${targetMention} — trade menu request`, embeds: [embedReq], components: [row] });
                const tradeMsg = await interaction.fetchReply();
                const collector2 = tradeMsg.createMessageComponentCollector({ filter: i => i.customId === `trade_accept_${tradeId}` || i.customId === `trade_decline_${tradeId}`, time: 300000 });
                collector2.on('collect', async (inter2) => {
                    const isAccept = inter2.customId === `trade_accept_${tradeId}`;
                    if (!targetAuthIds.includes(inter2.user.id) && !isBotOwner(inter2.user.id)) {
                        await inter2.reply({ content: `❌ Only ${targetCompany.name} managers can respond`, ephemeral: true });
                        return;
                    }
                    collector2.stop(isAccept ? 'accepted' : 'declined');
                    pendingTrades.delete(tradeId);
                    const curData = loadData();
                    const curSource = curData.companies[sourceId];
                    const curTarget = curData.companies[selectedCompanyId];
                    if (!curSource || !curTarget) { await inter2.update({ content: `❌ Trade failed — company not found`, embeds: [], components: [] }); return; }
                    if (!isAccept) { await inter2.update({ content: `❌ **${curTarget.name}** declined **${qty}x ${selectedItem}**`, embeds: [], components: [] }); return; }
                    const haveNow = (curSource.inventory?.[selectedItem]||0);
                    if (haveNow < qty) { await inter2.update({ content: `❌ **${curSource.name}** no longer has ${qty}x ${selectedItem} (has ${haveNow})`, embeds: [], components: [] }); return; }
                    // markup payment for menu trade
                    const pendingM = pendingTrades.get(tradeId);
                    const markupValM = pendingM?.markup || 0;
                    if (markupValM > 0) {
                        const basePriceM2 = (CRAFTING_RECIPES[selectedItem]?.value ?? RESOURCE_VALUES[canonRes(selectedItem)] ?? 10) * qty * getInflationMultiplier();
                        const totalPriceM2 = Math.floor(basePriceM2 * (1 + markupValM/100));
                        if ((curTarget.funds || 0) < totalPriceM2) {
                            await inter2.update({ content: `❌ **${curTarget.name}** lacks funds to pay ${formatMoney(totalPriceM2)} for ${markupValM}% markup`, embeds: [], components: [] });
                            return;
                        }
                        curTarget.funds -= totalPriceM2;
                        curSource.funds = (curSource.funds || 0) + totalPriceM2;
                    }
                    curSource.inventory[selectedItem]-=qty; if(curSource.inventory[selectedItem]<=0) delete curSource.inventory[selectedItem];
                    if(!curTarget.inventory) curTarget.inventory={}; curTarget.inventory[selectedItem]=(curTarget.inventory[selectedItem]||0)+qty;
                    const baseVal=(CRAFTING_RECIPES[selectedItem]?.value ?? RESOURCE_VALUES[canonRes(selectedItem)] ?? 10);
                    const isCrossSSR=curSource.hq_ssr!==curTarget.hq_ssr; const isCrossRegion=getRegionNameForSSR(curSource.hq_ssr)!==getRegionNameForSSR(curTarget.hq_ssr); const bonusRate=isCrossRegion?0.10:isCrossSSR?0.06:0.06; const bonus=Math.floor(baseVal*qty*bonusRate*getInflationMultiplier());
                    if(bonus>0){ curSource.funds=(curSource.funds||0)+Math.floor(bonus*0.6); curTarget.funds=(curTarget.funds||0)+Math.floor(bonus*0.4); curData.money_printed=(curData.money_printed||0)+bonus; }
                    curData.companies[sourceId]=curSource; curData.companies[selectedCompanyId]=curTarget; saveData(curData); updateCompanyPrice(sourceId); updateCompanyPrice(selectedCompanyId);
                    const priceText = (()=>{ const base=(CRAFTING_RECIPES[selectedItem]?.value??RESOURCE_VALUES[canonRes(selectedItem)]??10)*qty*getInflationMultiplier(); const mk=markup; const tot=mk?Math.floor(base*(1+mk/100)):0; return tot?`💰 Paid **${formatMoney(tot)}** from **${curTarget.name}** funds → **${curSource.name}** (${mk}% markup)`:'No markup — only subsidy'; })();
                    const doneEmbed=new EmbedBuilder().setTitle('✅ Trade Accepted (Menu)').setDescription(`**${curSource.name}** → **${curTarget.name}** **${qty}x ${selectedItem}**\n${priceText}`+(bonus>0?`\n💰 Subsidy +₽${bonus} (state)`:'')).setColor(0x00FF00);
                    await inter2.update({ content: `✅ Trade **${tradeId}** accepted by <@${inter2.user.id}>`, embeds: [doneEmbed], components: [] });
                });
                collector2.on('end', async (c,reason)=>{ if(reason==='time' && pendingTrades.has(tradeId)){ pendingTrades.delete(tradeId); try{ await tradeMsg.edit({ content:`⏰ Trade **${tradeId}** expired`, embeds:[], components:[]}); }catch{}}});
                collector.stop('menu_done');
            }
        });
        collector.on('end', async (c,reason)=>{ if(reason==='time'){ try{ await menuMsg.edit({ content:'⏰ Trade menu expired (2 min)', embeds:[], components:[]}); }catch{}}});
        return;
    }

    // ============================================================
    // SCHEDULED TRADES — weekly/daily/hourly auto-send
    // ============================================================
    if (command === 'scheduletrade' || command === 'schedulemarket' || command === 'autotrade') {
        if (args.length < 4) { await message.reply('❌ Usage: `-scheduletrade <company> <item> <qty> <hourly|daily|weekly>`\nExample: `-scheduletrade \"State Oil & Gas\" Fish 5 daily` — auto-sends every interval (needs inventory each time)'); return; }
        let intervalRaw = args[args.length-1].toLowerCase();
        let markupSched = 0;
        if (args.length >= 5) {
            const maybeMarkupRaw = args[args.length-2];
            if (maybeMarkupRaw && /^\d+%?$/.test(maybeMarkupRaw)) {
                const maybeMarkup = parseInt(maybeMarkupRaw.replace('%',''));
                if (!isNaN(maybeMarkup) && maybeMarkup>=0 && maybeMarkup<=50 && ['hourly','daily','weekly','monthly'].includes(intervalRaw)) {
                    markupSched = maybeMarkup;
                    // Remove markup from args for parsing (keep interval as last)
                    args = [...args.slice(0, -2), args[args.length-1]];
                }
            }
        }
        if (!['hourly','daily','weekly','monthly'].includes(intervalRaw)) { await message.reply('❌ Interval must be `hourly`, `daily`, `weekly` or `monthly`'); return; }
        const qtyRaw = args[args.length-2];
        const qty = parseInt(qtyRaw);
        if (isNaN(qty) || qty<=0 || qty>1000) { await message.reply('❌ Qty must be 1-1000'); return; }
        const rest = args.slice(0, -2).join(' ').trim();
        let targetId=null, itemName=null;
        for(let i=rest.length;i>0;i--){
            const candCompany = rest.substring(0,i).trim();
            const candItem = rest.substring(i).trim();
            if(!candItem) continue;
            const match=getCompanyByIdentifier(loadData(), candCompany);
            if(match){ targetId=match.companyId; itemName=candItem; break; }
        }
        if(!targetId || !itemName){ await message.reply('❌ Could not parse company/item. Use exact company name/ticker.'); return; }
        itemName=canonRes(itemName);
        let realItem = Object.keys(CRAFTING_RECIPES).find(k=>k.toLowerCase()===itemName.toLowerCase()) || Object.keys(RESOURCE_VALUES).find(k=>k.toLowerCase()===itemName.toLowerCase());
        if(!realItem){ await message.reply(`❌ Unknown item '${itemName}'`); return; }
        itemName=realItem;
        const data=loadData();
        const managed=getManagedCompany(userId,data);
        if(!managed){ await message.reply('❌ Only company managers can schedule trades!'); return; }
        const sourceId=managed.companyId;
        if(sourceId===targetId){ await message.reply('❌ Cannot schedule to yourself!'); return; }
        const intervalMs = intervalRaw==='hourly'?3600000:intervalRaw==='daily'?86400000:intervalRaw==='weekly'?604800000:2592000000;
        const nextAt = Date.now() + intervalMs;
        const id = `sched_${Date.now()}_${Math.random().toString(36).slice(2,6)}`;
        if(!data.trade_schedules) data.trade_schedules=[];
        if(data.trade_schedules.filter(s=>s.fromCompanyId===sourceId && s.active).length >= 5){ await message.reply('❌ Max 5 active schedules per company. Cancel one with `-cancelschedule <id>`'); return; }
        data.trade_schedules.push({ id, fromCompanyId: sourceId, toCompanyId: targetId, item: itemName, qty, interval: intervalRaw, markup: markupSched, nextAt, createdBy: userId, active: true, createdAt: new Date().toISOString() });
        saveData(data);
        const embed=new EmbedBuilder().setTitle('🔄 Scheduled Trade Created').setDescription(`**${managed.company.name}** → **${data.companies[targetId].name}**\n**${qty}x ${itemName}** every **${intervalRaw}**\nNext: <t:${Math.floor(nextAt/1000)}:R> (<t:${Math.floor(nextAt/1000)}:F>)`).setColor(0x5865F2).setFooter({text:`ID ${id} • -tradeschedules to view • -cancelschedule ${id}`});
        await message.reply({embeds:[embed]});
        return;
    }
    if (command === 'tradeschedules' || command === 'listschedules' || command === 'schedules') {
        const data=loadData();
        const managed=getManagedCompany(userId,data);
        if(!managed){ await message.reply('❌ Only managers can view schedules!'); return; }
        const list=(data.trade_schedules||[]).filter(s=>s.fromCompanyId===managed.companyId || s.toCompanyId===managed.companyId);
        if(!list.length){ await message.reply('📭 No scheduled trades for your company. Create with `-scheduletrade <company> <item> <qty> <hourly|daily|weekly>`'); return; }
        const lines=list.map(s=> {
            const from=data.companies[s.fromCompanyId]?.name||s.fromCompanyId;
            const to=data.companies[s.toCompanyId]?.name||s.toCompanyId;
            const next=`<t:${Math.floor(s.nextAt/1000)}:R>`;
            return `• \`${s.id}\` **${from} → ${to}** ${s.qty}x ${s.item} **${s.interval}** next ${next} ${s.active?'✅':'⏸️'}`;
        }).join('\n');
        const embed=new EmbedBuilder().setTitle('🔄 Trade Schedules').setDescription(lines.slice(0,3800)).setColor(0x5865F2).setFooter({text:'-cancelschedule <id> to stop'});
        await message.reply({embeds:[embed]});
        return;
    }
    if (command === 'cancelschedule' || command === 'cancelschedulemarket' || command === 'removeschedule') {
        if(args.length===0){ await message.reply('❌ Usage: `-cancelschedule <id>` — get ID from `-tradeschedules`'); return; }
        const id=args[0];
        const data=loadData();
        const idx=(data.trade_schedules||[]).findIndex(s=>s.id===id);
        if(idx===-1){ await message.reply(`❌ Schedule \`${id}\` not found`); return; }
        const sched=data.trade_schedules[idx];
        const managed=getManagedCompany(userId,data);
        if(!managed || (managed.companyId!==sched.fromCompanyId && !isBotOwner(userId))){ await message.reply('❌ Only the source company manager or bot owner can cancel this schedule'); return; }
        data.trade_schedules.splice(idx,1);
        saveData(data);
        await message.reply(`✅ Cancelled schedule \`${id}\` **${sched.qty}x ${sched.item}** ${sched.interval}`);
        return;
    }

    // ============================================================
    // EXPORT — outside USSR

    // ============================================================
    // EXPORT — outside USSR, intentionally NOT profitable (55% price) — dump surplus only
    // ============================================================
    if (command === 'export' || command === 'exportoutside' || command === 'foreignsell') {
        // Usage: -export <item> <qty>  (from company inventory to foreign market at 55% price)
        if (args.length < 1) { await message.reply('❌ Usage: `-export <item> [qty]` — sells **outside USSR** at **55%** price (not profitable vs internal `-factorydeal`/`-govcontract` 100-150% + trade 12-18% bonus). Use only to dump surplus. Example: `-export \"Oil Shale\" 10`'); return; }
        let qty=1;
        let itemName=args.join(' ');
        if (args.length>=2) {
            const maybeQty=parseInt(args[args.length-1]);
            if(!isNaN(maybeQty) && maybeQty>0 && maybeQty<=1000){
                const cand=args.slice(0,-1).join(' ');
                // allow both CRAFTING and RESOURCE
                if (CRAFTING_RECIPES[cand] || RESOURCE_VALUES[canonRes(cand)]!==undefined || RESOURCE_VALUES[cand]!==undefined) { itemName=cand; qty=maybeQty; }
            }
        }
        // alias Sulfur
        itemName=canonRes(itemName);
        // normalize case-insensitive find
        let realItem = Object.keys(CRAFTING_RECIPES).find(k=>k.toLowerCase()===itemName.toLowerCase()) || Object.keys(RESOURCE_VALUES).find(k=>k.toLowerCase()===itemName.toLowerCase());
        if (!realItem) { await message.reply(`❌ Unknown item '${itemName}'. Check \`-recipes\` or raw resources.`); return; }
        itemName=realItem;
        if (isGoldItem(itemName) && !canSellGold(loadData())) { await message.reply(`🔒 Gold export locked — Gold Standard ${getGoldBackingRatio(loadData()).toFixed(1)}% (need 100%).`); return; }
        const data=loadData();
        const managed=getManagedCompany(userId,data);
        if (!managed) { await message.reply('❌ Only company owners/directors can export!'); return; }
        const company=managed.company;
        const cid=managed.companyId;
        const have=(company.inventory?.[itemName]||0);
        if (have < qty) { await message.reply(`❌ **${company.name}** has ${have}x ${itemName} (need ${qty}).`); return; }
        const base = CRAFTING_RECIPES[itemName]?.value ?? RESOURCE_VALUES[itemName] ?? 10;
        const price = Math.floor(base * qty * 0.55 * getInflationMultiplier());
        company.inventory[itemName]-=qty;
        if (company.inventory[itemName]<=0) delete company.inventory[itemName];
        company.funds=(company.funds||0)+price;
        data.companies[cid]=company;
        if (!data.global_consumption) data.global_consumption={};
        // track as foreign export (not AI store)
        if (!data.export_volume) data.export_volume={};
        data.export_volume[itemName]=(data.export_volume[itemName]||0)+qty;
        saveData(data);
        updateCompanyPrice(cid);
        const embed=new EmbedBuilder().setTitle('🚢 Export — Outside USSR (55%)').setDescription(`**${company.name}** exported **${qty}x ${itemName}** to foreign market for **${formatMoney(price)}** (55% × inflation).`).setColor(0x8a0f14).addFields(
            { name:'📦 Item', value:`${itemName} x${qty} — base ${formatMoney(base)} each`, inline:true },
            { name:'💱 Got', value:formatMoney(price), inline:true },
            { name:'⚠️ Note', value:'Exports are **intentionally not profitable** vs internal `-factorydeal` (100%+) or `cross-region trade 18%`. Use to dump surplus only, not for profit.', inline:false }
        ).setFooter({text:'🇺🇸🇸🇷 USSR Economy • Export = 55% price — internal crafting/trade pays more'});
        await message.reply({embeds:[embed]});
        return;
    }

    // ============================================================
    // FOODSTATUS — check food demand / SSR census / trade needs
    // ============================================================
    
    if (command === 'foodstatus' || command === 'food' || command === 'fooddemand') {
        const data = loadData();
        const query = args.join(' ').trim();
        let census = {};
        try { census = await getSSRCensus(message.guild); } catch {}
        if (query.toLowerCase() === 'all' || query.toLowerCase() === 'global') {
            let lines = ['**Region Food Demand — Server Census (region totals)**', ''];
            const totalPop = Object.values(census).reduce((a,b)=>a+b,0);
            for (const [regionName, zone] of Object.entries(WORK_ZONES)) {
                const pop = getRegionPop(census, regionName);
                const demand = getRegionFoodDemand(data, census, regionName);
                const stock = getRegionFoodStock(data, regionName);
                const comps = getRegionCompanies(data, regionName);
                const totalEmployees = comps.reduce((s,c)=>s+(c.employees||0),0);
                const status = stock >= demand ? '✅' : stock >= demand*0.5 ? '⚠️' : '❌';
                const ssrs = getSSRsForRegion(regionName).map(s=>SSR_REGIONS[s].emoji).join('');
                lines.push(`${status} **${regionName}** ${ssrs} pop:${pop} emp:${totalEmployees} comps:${comps.length} demand:${demand}🍞 stock:${stock}🍞`);
            }
            lines.push('');
            lines.push(`Total SSR population: ${totalPop}`);
            lines.push(`Food per employee: ${FOOD_PER_EMPLOYEE}🍞 + per region citizen ${FOOD_PER_SSR_POP}🍞 (region totals)`);
            lines.push(`Baltic Region has **Fish (2🍞)** — inland regions must trade! Use \`-trade\` between regions.`);
            const embed = new EmbedBuilder().setTitle('🍽️ Food Status — All Regions').setDescription(lines.join('\n').substring(0,3800)).setColor(totalPop>0?0x00FF00:0xFFD700).setFooter({text:'🇺🇸🇸🇷 USSR Economy • Without food region cannot -collect • Stock is regional pool'});
            await message.reply({ embeds: [embed] });
            return;
        }
        // single company or region query — resolve to region
        let targetCompany = null;
        let targetRegion = null;
        if (query) {
            // try region name first
            const regionMatch = Object.keys(WORK_ZONES).find(r => r.toLowerCase() === query.toLowerCase());
            if (regionMatch) targetRegion = regionMatch;
            else {
                // try SSR name
                const ssrMatch = Object.keys(SSR_REGIONS).find(s => s.toLowerCase() === query.toLowerCase());
                if (ssrMatch) targetRegion = getRegionNameForSSR(ssrMatch);
                else {
                    const m = getCompanyByIdentifier(data, query);
                    if (!m) { await message.reply(`❌ '${query}' not found as company/SSR/region. Use \`-foodstatus all\` for global or \`-foodstatus <company>\`.`); return; }
                    targetCompany = m.company;
                    targetRegion = getRegionNameForSSR(targetCompany.hq_ssr);
                }
            }
        } else {
            const managed = getManagedCompany(userId, data);
            if (managed) targetCompany = managed.company;
            else {
                const caller = ensureUserRecord(data, userId);
                if (caller.employed_at) {
                    const m = getCompanyByIdentifier(data, caller.employed_at);
                    if (m) targetCompany = m.company;
                }
            }
            if (!targetCompany) { await message.reply('❌ Could not find your company/region! Use `-foodstatus <company|region>` or `-foodstatus all`'); return; }
            targetRegion = getRegionNameForSSR(targetCompany.hq_ssr);
        }
        if (!targetRegion) { await message.reply('❌ Could not resolve region for that company/SSR.'); return; }
        const pop = getRegionPop(census, targetRegion);
        const demand = getRegionFoodDemand(data, census, targetRegion);
        const stock = getRegionFoodStock(data, targetRegion);
        const need = Math.max(0, demand - stock);
        const bar = buildBar(stock, Math.max(demand, stock, 1), 12);
        const comps = getRegionCompanies(data, targetRegion);
        const regionFoodBreakdown = comps.length ? comps.map(c=>`${c.name} (${c.ticker}): ${getFoodStock(c.inventory)}🍞`).join('\n').substring(0,1000) : 'No companies in region';
        const ssrs = getSSRsForRegion(targetRegion).join(', ');
        const embed = new EmbedBuilder()
            .setTitle(`🍽️ Food Status — ${targetRegion}`)
            .setColor(stock >= demand ? 0x00FF00 : stock >= demand*0.5 ? 0xFFD700 : 0xFF0000)
            .setDescription(`**Region stockpile** (not company — all companies in region share)\n\`${bar}\` **${stock}🍞 / ${demand}🍞** ${stock>=demand?'✅ Fed':'❌ Hungry'}${need>0?` (need ${need}🍞 more)` : ''}\nPop: ${pop} • Companies: ${comps.length} • Total employees: ${comps.reduce((s,c)=>s+(c.employees||0),0)}\nSSRs: ${ssrs}`)
            .addFields(
                { name: `🏭 Companies in ${targetRegion}`, value: regionFoodBreakdown.substring(0,1024), inline: false },
                { name: '📋 Food values', value: 'Fish 2🍞, Wheat 1🍞, Bread 3🍞, Canned Food 4🍞, Wine 2🍞, Flour 2🍞, Cake 3🍞, Corn/Sunflower/Grapes 1🍞', inline: false },
                { name: '💡 Trade', value: `Without **${demand}🍞** the **region cannot -collect**! Trade food between regions via \`-trade <company> <item> <qty>\` (Fish → inland).`, inline: false }
            )
            .setFooter({ text: `🇺🇸🇸🇷 USSR Economy • Region total • ${targetCompany ? targetCompany.name + ' is in ' + targetRegion : targetRegion}` });
        await message.reply({ embeds: [embed] });
        return;
    }

    // ============================================================
    // RESIGN — quit your job
    // ============================================================
    
    if (command === 'resign' || command === 'quit' || command === 'leave' || command === 'quitjob') {
        const data = loadData();
        const user = ensureUserRecord(data, userId);
        if (!user.is_employed) {
            await message.reply('❌ You are not employed anywhere to resign from!');
            return;
        }
        const managed = getManagedCompany(userId, data);
        if (managed && managed.role === 'owner') {
            await message.reply(`❌ You own private **${managed.company.name}** — you cannot resign. Transfer/dissolve the company instead. Directors and workers can \`-resign\`.`);
            return;
        }
        if (managed && managed.role === 'director') {
            const company = managed.company;
            const cid = managed.companyId;
            user.is_state_director = false;
            user.director_of = null;
            user.is_employed = false;
            user.employed_at = null;
            if (company.director_id === userId) {
                company.director_id = null;
                company.ceo = 'State Appointed';
                data.companies[cid] = company;
            }
            delete data.state_directors[userId];
            saveData(data);
            const embed = new EmbedBuilder().setTitle('🏳️ Resigned — State Director').setDescription(`You resigned as **State Director** of **${company.name}**. You are now unemployed.`).setColor(0xFFD700).setFooter({ text: '🇺🇸🇸🇷 USSR Economy • You can be hired again' });
            await message.reply({ embeds: [embed] });
            return;
        }
        const companyName = user.employed_at;
        const match = getCompanyByIdentifier(data, companyName);
        let company = null;
        let companyId = null;
        if (match) { company = match.company; companyId = match.companyId; company.employees = Math.max(0, (company.employees || 0) - 1); data.companies[companyId] = company; }
        user.is_employed = false;
        user.employed_at = null;
        saveData(data);
        const embed = new EmbedBuilder().setTitle('🏳️ Resigned').setDescription(`You resigned from **${companyName || 'your company'}**. You are now unemployed.\nUse \`-hire\` to get hired again.`).setColor(0xFFD700).addFields({ name: '🏢 Former employer', value: companyName || 'Unknown', inline: true }, { name: '👷 Remaining staff', value: company ? `${company.employees}` : '—', inline: true }).setFooter({ text: '🇺🇸🇸🇷 USSR Economy' });
        await message.reply({ embeds: [embed] });
        return;
    }

    // ============================================================
    // SPECIALIZE — choose extraction / agriculture / production
    // ============================================================
    
    if (command === 'specialize') {
        const choice = (args[0] || '').toLowerCase();
        const data = loadData();
        const managed = getManagedCompany(userId, data);
        if (!managed) {
            await message.reply('❌ Only owners/directors can specialize! You must manage a company. Use `-foundcompany` first.');
            return;
        }
        const company = managed.company;
        const cid = managed.companyId;
        if (company.specialization) {
            const spec = SPECIALIZATIONS[company.specialization];
            await message.reply(`ℹ️ **${company.name}** already specialized as **${spec.emoji} ${spec.label}** — ${spec.desc}. Contact an admin to reset if needed.`);
            return;
        }
        const norm = { extraction: 'extraction', extract: 'extraction', ext: 'extraction', agriculture: 'agriculture', agri: 'agriculture', farm: 'agriculture', production: 'production', prod: 'production', factory: 'production' }[choice];
        if (!norm || !SPECIALIZATIONS[norm]) {
            const opts = Object.entries(SPECIALIZATIONS).map(([k,v])=>`• ${v.emoji} **${k}** — ${v.desc} (allowed: ${[...v.mines, ...v.factories].slice(0,4).join(', ')}…)`).join('\n');
            await message.reply(`❌ Usage: \`-specialize <extraction|agriculture|production>\`\nChoose one specialization for **${company.name}** (HQ ${company.hq_ssr}):\n${opts}\n\nExtraction = mines+oil rigs +25%, Agriculture = farm/timber +25%, Production = factories/store +25% & +15% sale price to player factories. Trade required!`);
            return;
        }
        company.specialization = norm;
        data.companies[cid] = company;
        saveData(data);
        const spec = SPECIALIZATIONS[norm];
        const embed = new (require('discord.js').EmbedBuilder)().setTitle(`${spec.emoji} Specialized — ${spec.label}`).setDescription(`**${company.name}** is now **${spec.label}**!\n${spec.desc}`).setColor(0x00FF00).addFields({name:'🏭 Allowed bonus', value: spec.mines.length ? spec.mines.join(', ') : spec.factories.join(', '), inline:false},{name:'💡 Next',value:'Build matching buildings for +25% -collect, trade raw → production factories. Check `-worldmap` for SSR resources.',inline:false}).setFooter({text:'🇺🇸🇸🇷 USSR Economy • Specialization via DB'});
        await message.reply({ embeds: [embed] });
        return;
    }

    // ============================================================
    // GOVCONTRACT
    // ============================================================
    
    if (command === 'govcontract') {
        if (!isBotOwner(userId)) {
            await message.reply('❌ Only bot owners can issue government contracts!');
            return;
        }
        const data = loadData();
        const govRemaining = getCooldownRemaining(data.last_govcontract, GOVCONTRACT_COOLDOWN_SECS);
        if (govRemaining > 0) {
            await message.reply(`⏳ State procurement is on cooldown! Try again in **${formatCooldown(govRemaining)}**.`);
            return;
        }
        const companies = Object.values(data.companies);
        if (companies.length === 0) {
            await message.reply('❌ No companies!');
            return;
        }
        // Gold only to State and only when fully backed
        const canGold = canSellGold(data);
        const goldRatio = getGoldBackingRatio(data);
        // Pick a random company that has sellable (crafted) inventory, respecting gold lock
        let company = null;
        let items = [];
        const shuffled = [...companies].sort(() => Math.random() - 0.5);
        for (const c of shuffled) {
            const inv = c.inventory || {};
            const cand = [];
            for (const [item, qty] of Object.entries(inv)) {
                if (!CRAFTING_RECIPES[item] || qty <= 0) continue;
                if (isGoldItem(item) && !canGold) continue; // gold locked until 100
                cand.push([item, qty, CRAFTING_RECIPES[item].value]);
            }
            if (cand.length > 0) { company = c; items = cand; break; }
        }
        if (!company || items.length === 0) {
            if (!canGold) {
                await message.reply(`❌ No sellable crafted items! All companies either empty or only hold gold-locked goods (Gold Standard ${goldRatio.toFixed(1)}% < 100%).\n⚠️ **Crafted items make more profit** — use \`-craftcompany\` to create sellable goods. Gold/Gold Bar can only be sold to the State when Gold Standard is 100%`);
            } else {
                await message.reply('❌ No companies have crafted items to sell! Craft with `-craftcompany` (crafted > raw profit).');
            }
            return;
        }
        // Build chooser — Globe picks what State buys (warning: crafted > raw)
        const options = items.slice(0, 25).map(([item, qty, val]) => {
            const desc = `x${qty} • ${formatMoney(val)} ea` + (isGoldItem(item) ? ' • GOLD' : '');
            const opt = new StringSelectMenuOptionBuilder().setLabel(item.substring(0, 25)).setDescription(desc.substring(0, 50)).setValue(item);
            try { opt.setEmoji('📦'); } catch {}
            return opt;
        });
        const select = new StringSelectMenuBuilder().setCustomId('govcontract_select').setPlaceholder('Choose item to sell to State...').addOptions(options);
        const row = new ActionRowBuilder().addComponents(select);
        const listEmbed = new EmbedBuilder()
            .setTitle('🏛️ State Procurement — Choose Goods')
            .setDescription(`Buyer: **State** → Seller: **${company.name}** (${company.ticker})\nChoose what to sell. Items go to **AI Store** then AI customers buy them (full cycle).\n\n⚠️ **Warning: Crafted items make far more profit than raw resources!**\n${!canGold ? `🔒 Gold locked — Gold/Gold Bar only sellable to State when Gold Standard 100% (now ${goldRatio.toFixed(1)}%)` : '🥇 Gold is unlocked (100% backing).'}`)
            .setColor(0xFFD700)
            .setFooter({ text: `⏳ Cooldown ${formatCooldown(GOVCONTRACT_COOLDOWN_SECS)} • State Bank pays market price (no premium)` });
        let reply;
        try {
            reply = await message.reply({ embeds: [listEmbed], components: [row], fetchReply: true });
        } catch (err) {
            console.error('govcontract reply failed', err.code, err.message, JSON.stringify(err.errors||{}).slice(0,500));
            await message.reply('❌ State menu failed (50035). Try again.');
            return;
        }
        const collector = reply.createMessageComponentCollector({ componentType: ComponentType.StringSelect, filter: i => i.user.id === userId, time: 60000, max: 1 });
        collector.on('collect', async (interaction) => {
            const selectedItem = interaction.values[0];
            if (isGoldItem(selectedItem)) {
                const chk = loadData();
                if (!canSellGold(chk)) {
                    await interaction.update({ content: `🔒 Gold still locked (${getGoldBackingRatio(chk).toFixed(1)}% < 100%). Cannot sell Gold to State yet.`, components: [], embeds: [] });
                    return;
                }
            }
            const freshData = loadData();
            const freshCompany = freshData.companies[company.id];
            if (!freshCompany) { await interaction.update({ content: '❌ Company no longer exists.', components: [], embeds: [] }); return; }
            const qtyAvailable = freshCompany.inventory?.[selectedItem] || 0;
            if (qtyAvailable <= 0) { await interaction.update({ content: '❌ No longer available.', components: [], embeds: [] }); return; }
            const maxQty = Math.min(qtyAvailable, 10);
            const candidates = [1,2,3,5,10].filter(q=>q<=maxQty);
            if (!candidates.includes(maxQty) && maxQty>5) candidates.push(maxQty);
            const uniq = [...new Set(candidates)].sort((a,b)=>a-b);
            if (uniq.length===1 && maxQty>1) { for(let q=2;q<=Math.min(maxQty,3);q++) if(!uniq.includes(q)) uniq.push(q); uniq.sort((a,b)=>a-b); }
            const val = CRAFTING_RECIPES[selectedItem].value;
            const qtyOptions = uniq.map(q=>{
                const saleBonusEst2 = getSpecializationSaleBonus(freshData.companies[company.id] || freshCompany, selectedItem);
                const est = Math.floor(val*q*getInflationMultiplier()*getSupplyFactor(freshData, selectedItem)*getDemandFactor(freshData, selectedItem)*0.99*saleBonusEst2);
                return new StringSelectMenuOptionBuilder().setLabel(`${q}x ${selectedItem}`).setDescription(`~${formatMoney(est)} market`).setValue(`${selectedItem}|${q}`);
            });
            const qtySelect = new StringSelectMenuBuilder().setCustomId('govcontract_qty').setPlaceholder(`How many? (have ${qtyAvailable} — up to 10)`).addOptions(qtyOptions);
            const qtyRow = new ActionRowBuilder().addComponents(qtySelect);
            const qtyEmbed = new EmbedBuilder().setTitle(`🏛️ How many ${selectedItem}?`).setDescription(`**${freshCompany.name}** has **${qtyAvailable}x ${selectedItem}** @ ${formatMoney(val)} each.\nChoose **1 to ${maxQty} at once** (max 10 per contract).\n\n💡 Hardware: sell 3 at once works now!`).setColor(0xFFD700).setFooter({text:'Select quantity — market price, no premium'});
            await interaction.update({ embeds: [qtyEmbed], components: [qtyRow] });
            const qtyCollector = reply.createMessageComponentCollector({ componentType: ComponentType.StringSelect, filter: i=>i.user.id===userId && i.customId==='govcontract_qty', time: 30000, max:1 });
            qtyCollector.on('collect', async (qtyInteraction) => {
                const [item, qtyStr] = qtyInteraction.values[0].split('|');
                const sell = parseInt(qtyStr);
                const freshData2 = loadData();
                const freshCompany2 = freshData2.companies[company.id];
                if (!freshCompany2 || (freshCompany2.inventory?.[item]||0) < sell) {
                    await qtyInteraction.update({ content: '❌ Not enough stock anymore.', components:[], embeds:[]});
                    return;
                }
                if (isGoldItem(item) && !canSellGold(freshData2)) {
                    await qtyInteraction.update({ content: `🔒 Gold locked (${getGoldBackingRatio(freshData2).toFixed(1)}% <100).`, components:[], embeds:[]});
                    return;
                }
                const val2 = CRAFTING_RECIPES[item].value;
                const supplyFactor2 = getSupplyFactor(freshData2, item);
                const demandFactor2 = getDemandFactor(freshData2, item);
                const quality2 = 0.95 + Math.random()*0.10;
                const saleBonusGov = getSpecializationSaleBonus(freshData2.companies[company.id] || freshCompany2, item);
                const price2 = Math.floor(val2*sell*getInflationMultiplier()*supplyFactor2*demandFactor2*quality2*saleBonusGov);
                const [stateCash2] = await getUnbBalance(STATE_BANK_USER_ID);
                if (stateCash2 < price2) { await qtyInteraction.update({ content:`❌ State Bank broke: needs ${formatMoney(price2)} has ${formatMoney(stateCash2)}`, components:[], embeds:[]}); return; }
                await removeFromStateBank(price2, `Gov contract ${item} from ${freshCompany2.name}`);
                freshCompany2.inventory[item]-=sell;
                if (freshCompany2.inventory[item]<=0) delete freshCompany2.inventory[item];
                freshCompany2.funds=(freshCompany2.funds||0)+price2;
                freshData2.companies[freshCompany2.id]=freshCompany2;
                freshData2.last_govcontract=new Date().toISOString();
                updateDemandAfterSale(freshData2, item, sell, true);
                addToAIStore(freshData2, item, sell);
                logOwnerAction(freshData2, userId, message.author.username, 'govcontract', `State bought ${sell}x ${item} from ${freshCompany2.name} for ${formatMoney(price2)}`);
                saveData(freshData2);
                updateCompanyPrice(freshCompany2.id);
                const doneEmbed = new EmbedBuilder().setTitle('🏛️ Government Contract — Completed').setDescription(`State bought **${sell}x ${item}** from **${freshCompany2.name}** for ${formatMoney(price2)}.\n*Stock moved to **AI Store**.*`).setColor(0x00FF00).setFooter({text:`Next gov contract in ${formatCooldown(GOVCONTRACT_COOLDOWN_SECS)}`}).addFields({name:'Payment',value:formatMoney(price2),inline:true},{name:'📦 Supply',value:`${getMarketSupply(freshData2,item)} (${(supplyFactor2*100).toFixed(0)}%)`,inline:true},{name:'📈 Demand',value:`${(demandFactor2*100).toFixed(0)}%`,inline:true},{name:'🏪 AI Store',value:getAIStoreText(freshData2,5),inline:false});
                await qtyInteraction.update({ embeds:[doneEmbed], components:[]});
            });
            qtyCollector.on('end', async (collected)=>{ if(collected.size===0){ try{await reply.edit({components:[]});}catch{}}});
        });
        collector.on('end', async (collected) => {
            if (collected.size === 0) { try { await reply.edit({ components: [] }); } catch {} }
        });
        return;
    }

    // ============================================================
    // FACTORYDEAL — AI factory buys with cooldown + supply/demand
    // ============================================================
    
    if (command === 'factorydeal') {
        const data = loadData();
        const user = getUser(userId);
        const managed = getManagedCompany(userId, data);
        const companyId = managed?.companyId;
        if (!managed) {
            await message.reply('❌ You do not own or direct a company! (CEOs/Directors/Managers only — workers cannot `factorydeal`)');
            return;
        }
        const company = managed.company;
        const remaining = getCooldownRemaining(company.last_factorydeal, FACTORYDEAL_COOLDOWN_SECS);
        if (remaining > 0) {
            await message.reply(`⏳ **${company.name}** is on factory cooldown! Next deal in **${formatCooldown(remaining)}**.`);
            return;
        }
        const inv = company.inventory || {};
        const items = [];
        for (const [item, qty] of Object.entries(inv)) {
            if (!CRAFTING_RECIPES[item] || qty <= 0) continue;
            if (isGoldItem(item)) continue;
            items.push([item, qty, CRAFTING_RECIPES[item].value]);
        }
        if (items.length === 0) {
            const hasGoldOnly = Object.keys(inv).some(k => isGoldItem(k) && CRAFTING_RECIPES[k]);
            if (hasGoldOnly) {
                const ratio = getGoldBackingRatio(data);
                await message.reply(`❌ No factory-sellable items! Your inventory only has gold-locked goods.\n🔒 **Gold/Gold Bar can never be sold to AI factories — only to the State** and only when Gold Standard is 100% (now ${ratio.toFixed(1)}%).\n⚠️ **Tip: Crafted items make more profit — craft other goods to sell!**`);
            } else {
                await message.reply('❌ No crafted items to sell! Craft with `-craftcompany` — **crafted items make far more profit than raw**. Sell crafted goods to AI factories. Add qty like `-craftcompany Steel Ingot 3` to craft more at once.');
            }
            return;
        }
        const options = items.slice(0, 25).map(([item, qty, val]) => {
            const desc = `x${qty} • ${formatMoney(val)} ea`;
            const opt = new StringSelectMenuOptionBuilder().setLabel(item.substring(0, 25)).setDescription(desc.substring(0, 50)).setValue(item);
            // only set emoji if it's a valid unicode emoji (avoid ■ etc causing 50035)
            try { opt.setEmoji('📦'); } catch {}
            return opt;
        });
        const select = new StringSelectMenuBuilder().setCustomId('factorydeal_item').setPlaceholder('Choose item to sell to AI factory...').addOptions(options);
        const row = new ActionRowBuilder().addComponents(select);
        const factoryNamePreview = getRandomFactoryName();
        const listEmbed = new EmbedBuilder()
            .setTitle('🏭 AI Factory Deal — Choose Goods')
            .setDescription(`Factory **${factoryNamePreview}** wants to buy from **${company.name}**.\nChoose what to sell. Goods move to **AI Store** then AI customers buy them (cycle).\n\n⚠️ **Warning: Crafted items make far more profit than raw resources!** Already filtered to crafted goods. You can sell up to **10 at once** — next step choose quantity.\n🚫 Gold/Gold Bar never sold here — State only. Production spec +15% sale bonus.`)
            .setColor(0x5865F2)
            .setFooter({ text: `⏳ Cooldown ${formatCooldown(FACTORYDEAL_COOLDOWN_SECS)}/company • Market price (no premium) — supply/demand • Use -craftcompany <item> 3 to craft more` });
        let reply;
        try {
            reply = await message.reply({ embeds: [listEmbed], components: [row], fetchReply: true });
        } catch (err) {
            console.error('factorydeal reply failed', err.code, err.message, JSON.stringify(err.errors||{}).slice(0,500));
            await message.reply('❌ Factory menu failed to open (Discord 50035). Try again — if persists, report items: ' + items.map(i=>i[0]).join(', '));
            return;
        }
        const itemCollector = reply.createMessageComponentCollector({ componentType: ComponentType.StringSelect, filter: i => i.user.id === userId && i.customId === 'factorydeal_item', time: 60000, max: 1 });
        itemCollector.on('collect', async (interaction) => {
            const selectedItem = interaction.values[0];
            if (isGoldItem(selectedItem)) {
                await interaction.update({ content: '❌ Gold can never be sold to AI factories — only State when Gold Standard 100%.', components: [], embeds: [] });
                return;
            }
            const freshData = loadData();
            const freshCompany = freshData.companies[companyId];
            if (!freshCompany) { await interaction.update({ content: '❌ Company gone.', components: [], embeds: [] }); return; }
            const qtyAvailable = freshCompany.inventory?.[selectedItem] || 0;
            if (qtyAvailable <= 0) { await interaction.update({ content: '❌ No longer available.', components: [], embeds: [] }); return; }
            const val = CRAFTING_RECIPES[selectedItem].value;
            const maxQty = Math.min(qtyAvailable, 10);
            const candidates = [1,2,3,5,10].filter(q=>q<=maxQty);
            if (!candidates.includes(maxQty) && maxQty>5) candidates.push(maxQty);
            const uniq = [...new Set(candidates)].sort((a,b)=>a-b);
            if (uniq.length===1 && maxQty>1) { for(let q=2;q<=Math.min(maxQty,3);q++) if(!uniq.includes(q)) uniq.push(q); uniq.sort((a,b)=>a-b); }
            const qtyOptions = uniq.map(q=>{
                const saleBonus = getSpecializationSaleBonus(freshCompany, selectedItem);
                const est = Math.floor(val*q*getInflationMultiplier()*getSupplyFactor(freshData, selectedItem)*getDemandFactor(freshData, selectedItem)*0.99*saleBonus);
                return new StringSelectMenuOptionBuilder().setLabel(`${q}x ${selectedItem}`).setDescription(`~${formatMoney(est)}${saleBonus>1?' +15%':''} at market`).setValue(`${selectedItem}|${q}`);
            });
            const qtySelect = new StringSelectMenuBuilder().setCustomId('factorydeal_qty').setPlaceholder(`How many to sell? (you have ${qtyAvailable})`).addOptions(qtyOptions);
            const qtyRow = new ActionRowBuilder().addComponents(qtySelect);
            const qtyEmbed = new EmbedBuilder().setTitle(`🏭 How many ${selectedItem}?`).setDescription(`You have **${qtyAvailable}x ${selectedItem}** @ ${formatMoney(val)} each (crafted).\nChoose quantity — you can sell **1 to ${maxQty} at once** (max 10 per deal).\n\n💡 Tip: Craft more with \`-craftcompany ${selectedItem} 3\``).setColor(0xFFD700).setFooter({text:'Select quantity — market price: supply/demand, production +15% if specialized'});
            await interaction.update({ embeds: [qtyEmbed], components: [qtyRow] });
            const qtyCollector = reply.createMessageComponentCollector({ componentType: ComponentType.StringSelect, filter: i=>i.user.id===userId && i.customId==='factorydeal_qty', time:30000, max:1 });
            qtyCollector.on('collect', async (qtyInteraction)=>{
                const [item,qtyStr]=qtyInteraction.values[0].split('|');
                const sell=parseInt(qtyStr);
                const freshData2=loadData();
                const freshCompany2=freshData2.companies[companyId];
                if(!freshCompany2 || (freshCompany2.inventory?.[item]||0) < sell){ await qtyInteraction.update({content:'❌ Not enough stock anymore.',components:[],embeds:[]}); return; }
                const val2=CRAFTING_RECIPES[item].value;
                const supplyFactor2=getSupplyFactor(freshData2,item);
                const demandFactor2=getDemandFactor(freshData2,item);
                const quality2=0.97+Math.random()*0.06;
                const saleBonus2=getSpecializationSaleBonus(freshCompany2,item);
                const price2=Math.floor(val2*sell*getInflationMultiplier()*supplyFactor2*demandFactor2*quality2*saleBonus2);
                freshCompany2.inventory[item]-=sell;
                if(freshCompany2.inventory[item]<=0) delete freshCompany2.inventory[item];
                freshCompany2.funds=(freshCompany2.funds||0)+price2;
                freshCompany2.last_factorydeal=new Date().toISOString();
                freshData2.companies[companyId]=freshCompany2;
                updateDemandAfterSale(freshData2,item,sell,false);
                addToAIStore(freshData2,item,sell);
                saveData(freshData2);
                updateCompanyPrice(companyId);
                const buyer=getRandomFactoryName();
                const doneEmbed=new EmbedBuilder().setTitle('🏭 Factory Deal — Completed').setDescription(`**${buyer}** bought **${sell}x ${item}** from **${freshCompany2.name}** for ${formatMoney(price2)}${saleBonus2>1?' (+15% prod bonus)':''}.\n*Stock moved to **AI Store** — AI customers will buy it.*`).setColor(0x00FF00).setFooter({text:`Next deal for ${freshCompany2.name} in ${formatCooldown(FACTORYDEAL_COOLDOWN_SECS)}`}).addFields({name:'Payment',value:formatMoney(price2),inline:true},{name:'📦 Supply',value:`${getMarketSupply(freshData2,item)} in market (${(supplyFactor2*100).toFixed(0)}%)`,inline:true},{name:'📈 Demand',value:`${(demandFactor2*100).toFixed(0)}%`,inline:true},{name:'🏪 AI Store',value:getAIStoreText(freshData2,5),inline:false});
                await qtyInteraction.update({embeds:[doneEmbed],components:[]});
            });
            qtyCollector.on('end', async (collected)=>{ if(collected.size===0){ try{await reply.edit({components:[]});}catch{}}});
        });
        itemCollector.on('end', async (collected)=>{ if(collected.size===0){ try{await reply.edit({components:[]});}catch{}}});
        return;
    }

    // ============================================================
    // PRINTMONEY
    // ============================================================
    
    if (command === 'printmoney') {
        if (!isBotOwner(userId)) {
            await message.reply('❌ Owner only!');
            return;
        }
        const amount = parseInt(args[0]);
        if (isNaN(amount) || amount <= 0) {
            await message.reply('❌ Positive amount!');
            return;
        }
        const data = loadData();
        const oldInflation = data.inflation || 0;
        data.money_printed = (data.money_printed || 0) + amount;
        logOwnerAction(data, userId, message.author.username, 'printmoney', `printed ${formatMoney(amount)} (inflation ${oldInflation.toFixed(2)}%→${(data.inflation||0).toFixed(2)}%)`);
        saveData(data);
        const newInflation = await updateInflation();
        
        await addToStateBank(amount, `Money printed by ${message.author.username}`);
        
        const embed = new EmbedBuilder()
            .setTitle('💸 Money Printed')
            .setDescription(`Printed ${formatMoney(amount)}!`)
            .setColor(0xFFD700)
            .setFooter({ text: '🇺🇸🇸🇷 USSR Economy' })
            .addFields(
                { name: 'Inflation', value: `${oldInflation.toFixed(2)}% → ${newInflation.toFixed(2)}%`, inline: true }
            );
        await message.reply({ embeds: [embed] });
        return;
    }

    // ============================================================
    // FORMATECOMPANIES
    // ============================================================
    
    if (command === 'formstatecompanies') {
        if (!isBotOwner(userId)) {
            await message.reply('❌ Owner only!');
            return;
        }
        const data = loadData();
        const stateCompanies = [
            // Russia — Nuclear
            {"name": "State Nuclear Energy", "ssr": "Russian SFSR", "buildings": ["Uranium Mine", "Nuclear Processing"]},
            // Ukraine / Western region — Steel
            {"name": "Soviet Steel Works", "ssr": "Ukrainian SSR", "buildings": ["Iron Mine", "Coal Mine", "Steel Mill", "Machine Shop"]},
            // Azerbaijan / Transcaucasian region — Oil and Gas
            {"name": "State Oil & Gas", "ssr": "Azerbaijanian SSR", "buildings": ["Oil Rig", "Oil Rig", "Refinery"]},
            // Kazakh / Turkestan (Central Asian) region — Agriculture
            {"name": "Soviet Agriculture", "ssr": "Kazakh SSR", "buildings": ["Farm", "Farm", "Bakery"]},
            // Nuristan — Mining
            {"name": "State Mining Corp", "ssr": "Nuristani SSR", "buildings": ["Iron Mine", "Coal Mine", "Copper Mine", "Gold Mine"]},
            // Baltics — Forestry + coastal side business
            {"name": "Baltic Timber & Harbour Co", "ssr": "Estonian SSR", "buildings": ["Timber Camp", "Timber Camp", "Store"]}
        ];
        const created = [];
        const repaired = [];
        const buildEntry = (b) => {
            if (MINES[b]) return {"level": 1, "built_at": new Date().toISOString(), "type": "mine"};
            if (FACTORIES[b]) return {"level": 1, "built_at": new Date().toISOString(), "type": "factory"};
            if (b === "Store") return {"level": 1, "built_at": new Date().toISOString(), "type": "store"};
            return null;
        };
        // Count how many of each building a company should have (duplicates allowed)
        for (const sc of stateCompanies) {
            let existingCid = null;
            for (const [cid, c] of Object.entries(data.companies)) {
                if (c.name === sc.name) { existingCid = cid; break; }
            }

            // Already exists: repair it instead of skipping, so re-running the
            // command fixes HQ region and adds any missing/invalid buildings.
            if (existingCid) {
                const company = data.companies[existingCid];
                let changed = false;
                if (!company.is_state_owned) continue; // never touch private companies
                if (company.hq_ssr !== sc.ssr) { company.hq_ssr = sc.ssr; changed = true; }

                // Count current valid buildings by name
                const counts = {};
                for (const [bName, bData] of Object.entries(company.buildings || {})) {
                    if (!buildEntry(bName)) {
                        delete company.buildings[bName];
                        changed = true;
                        continue;
                    }
                    counts[bName] = (counts[bName] || 0) + 1;
                }
                // Add missing ones
                for (const b of sc.buildings) {
                    const entry = buildEntry(b);
                    if (!entry) continue;
                    if ((counts[b] || 0) > 0) { counts[b]--; continue; }
                    company.buildings[b] = entry;
                    changed = true;
                }
                if (changed) repaired.push(sc.name);
                continue;
            }

            data.company_id_counter = (data.company_id_counter || 0) + 1;
            const cid = `state_${data.company_id_counter}`;
            const totalShares = 1000000;
            const specMap = {
                "State Nuclear Energy": "extraction",
                "Soviet Steel Works": "production",
                "State Oil & Gas": "extraction",
                "Soviet Agriculture": "agriculture",
                "State Mining Corp": "extraction",
                "Baltic Timber & Harbour Co": "agriculture"
            };
            data.companies[cid] = {
                "id": cid, "name": sc.name, "ticker": `ST${data.company_id_counter}`,
                "owner_id": STATE_BANK_USER_ID, "ceo": "State Appointed",
                "hq_ssr": sc.ssr, "funds": 1000000, "invested_capital": 1000000,
                "shares_total": totalShares, "shares_available": 0,
                "state_shares": totalShares, "founder_shares": 0,
                "share_price": 100, "market_cap": 1000000,
                "employees": 0, "level": 1, "buildings": {}, "inventory": {"Wheat": 200},
                "created_at": new Date().toISOString(), "last_collect": null,
                "price_history": [100], "is_state_owned": true,
                "director_id": null,
                "specialization": specMap[sc.name] || "extraction",
                "salary_config": { "ceo": 5, "director": 5, "manager": 2 },
                "managers": []
            };
            for (const b of sc.buildings) {
                const entry = buildEntry(b);
                if (entry) data.companies[cid].buildings[b] = entry;
            }
            created.push(sc.name);
        }
        if (!data.state_companies) data.state_companies = [];
        data.state_companies = data.state_companies.concat(created);
        logOwnerAction(data, userId, message.author.username, 'formstatecompanies', `created ${created.length} (${created.join(', ')}) repaired ${repaired.length} (${repaired.join(', ')})`);
        saveData(data);
        const embed = new EmbedBuilder()
            .setTitle('🏢 State Companies Formed')
            .setDescription(
                `Created ${created.length} companies` +
                (repaired.length > 0 ? `, repaired ${repaired.length} existing` : '') +
                '!'
            )
            .setColor(0x00FF00)
            .setFooter({ text: '🇺🇸🇸🇷 USSR Economy' });
        if (created.length > 0) {
            embed.addFields({ name: 'Created', value: created.map(c => `• ${c}`).join('\n'), inline: true });
        }
        if (repaired.length > 0) {
            embed.addFields({ name: 'Repaired (HQ/buildings updated)', value: repaired.map(c => `• ${c}`).join('\n'), inline: true });
        }
        if (created.length === 0 && repaired.length === 0) {
            embed.setDescription('All state companies already exist and match the plan.');
        }
        await message.reply({ embeds: [embed] });
        return;
    }

    // ============================================================
    // APPOINTDIRECTOR
    // ============================================================

    if (command === 'appointdirector') {
        if (!isBotOwner(userId)) {
            await message.reply('❌ Owner only!');
            return;
        }
        if (args.length < 2) {
            await message.reply('❌ Usage: -appointdirector @user <company_name>');
            return;
        }

        const targetId = args[0].replace(/[<@!>]/g, '');
        const companyName = args.slice(1).join(' ');
        const data = loadData();
        const match = getCompanyByIdentifier(data, companyName);

        if (!match) {
            await message.reply(`❌ Company '${companyName}' not found!`);
            return;
        }

        const { company: target, companyId: cid } = match;
        if (!target.is_state_owned) {
            await message.reply(`❌ '${target.name}' is not state-owned!`);
            return;
        }

        const director = ensureUserRecord(data, targetId);

        if (director.company_id && data.companies[director.company_id] &&
            data.companies[director.company_id].owner_id === targetId) {
            await message.reply('❌ That user owns a private company. Remove their private company role before appointing them as a state director.');
            return;
        }

        if (target.director_id && target.director_id !== targetId) {
            const oldDirector = ensureUserRecord(data, target.director_id);
            oldDirector.director_of = null;
            oldDirector.is_state_director = false;
            if (oldDirector.employed_at === target.name) {
                oldDirector.employed_at = null;
                oldDirector.is_employed = false;
            }
            delete data.state_directors[target.director_id];
        }

        if (director.director_of && director.director_of !== cid) {
            const oldCompany = data.companies[director.director_of];
            if (oldCompany && oldCompany.director_id === targetId) {
                oldCompany.director_id = null;
                oldCompany.ceo = 'State Appointed';
                data.companies[director.director_of] = oldCompany;
            }
            delete data.state_directors[targetId];
        }

        if (director.employed_at && director.employed_at !== target.name) {
            const oldEmployment = getCompanyByIdentifier(data, director.employed_at);
            if (oldEmployment && oldEmployment.company.employees > 0) {
                oldEmployment.company.employees = Math.max(0, (oldEmployment.company.employees || 0) - 1);
                data.companies[oldEmployment.companyId] = oldEmployment.company;
            }
        }

        target.owner_id = STATE_BANK_USER_ID;
        target.is_state_owned = true;
        target.director_id = targetId;
        target.ceo = `<@${targetId}>`;
        target.shares_available = 0;
        target.state_shares = target.shares_total || target.state_shares || 0;

        director.company_id = null;
        director.ceo_of = null;
        director.is_state_director = true;
        director.director_of = cid;
        director.ssr_region = target.hq_ssr || director.ssr_region || null;
        director.is_employed = true;
        director.employed_at = target.name;

        data.state_directors[targetId] = cid;
        data.companies[cid] = target;
        logOwnerAction(data, userId, message.author.username, 'appointdirector', `appointed <@${targetId}> (${targetId}) as director of ${target.name} (${cid})`);
        saveData(data);

        const embed = new EmbedBuilder()
            .setTitle('🏛️ State Director Appointed')
            .setDescription(`<@${targetId}> is now the **State Director** of ${target.name}.`)
            .setColor(0xFFD700)
            .setFooter({ text: '🇺🇸🇸🇷 USSR Economy' })
            .addFields(
                { name: '🏢 Company', value: target.name, inline: true },
                { name: '👔 Director', value: `<@${targetId}>`, inline: true },
                { name: '📍 HQ SSR', value: target.hq_ssr || 'Unknown', inline: true },
                { name: '🏛️ Ownership', value: 'State-owned - ownership remains with the State Bank.', inline: false }
            );
        await message.reply({ embeds: [embed] });
        return;
    }

    // ============================================================
    // REMOVEDIRECTOR
    // ============================================================

    if (command === 'removedirector') {
        if (!isBotOwner(userId)) {
            await message.reply('❌ Owner only!');
            return;
        }
        if (args.length < 1) {
            await message.reply('❌ Usage: -removedirector <company_name>');
            return;
        }

        const data = loadData();
        const match = getCompanyByIdentifier(data, args.join(' '));
        if (!match) {
            await message.reply(`❌ Company '${args.join(' ')}' not found!`);
            return;
        }
        const { company, companyId } = match;
        if (!company.is_state_owned) {
            await message.reply('❌ That is not a state-owned company.');
            return;
        }
        if (!company.director_id) {
            await message.reply('❌ This state company has no director.');
            return;
        }

        const oldDirectorId = company.director_id;
        const oldDirector = ensureUserRecord(data, oldDirectorId);
        if (oldDirector.director_of === companyId) oldDirector.director_of = null;
        oldDirector.is_state_director = false;
        if (oldDirector.employed_at === company.name) {
            oldDirector.employed_at = null;
            oldDirector.is_employed = false;
        }

        delete data.state_directors[oldDirectorId];
        company.director_id = null;
        company.ceo = 'State Appointed';
        company.owner_id = STATE_BANK_USER_ID;
        data.companies[companyId] = company;
        logOwnerAction(data, userId, message.author.username, 'removedirector', `removed <@${oldDirectorId}> (${oldDirectorId}) from ${company.name} (${companyId})`);
        saveData(data);

        await message.reply(`✅ Removed <@${oldDirectorId}> as State Director of **${company.name}**.`);
        return;
    }

    // ============================================================
    // NATIONALMINIMUMWAGE - Set the country-wide wage floor
    // ============================================================

    if (command === 'nationalminimumwage' || command === 'minwage') {
        if (!isBotOwner(userId)) {
            await message.reply('❌ Owner only!');
            return;
        }
        const data = loadData();
        const current = data.national_minimum_wage || 0;

        if (args.length === 0) {
            const below = Object.values(data.companies || {}).filter(c => (c.wage || 10) < current);
            const embed = new EmbedBuilder()
                .setTitle('📜 National Minimum Wage')
                .setDescription(current > 0
                    ? `The national minimum wage is currently **${formatMoney(current)}** per shift.`
                    : 'No national minimum wage is in effect — companies set their own wages.')
                .setColor(0xFFD700)
                .setFooter({ text: 'Usage: -nationalminimumwage <amount> | -nationalminimumwage remove' })
                .addFields(
                    { name: '🏢 Companies Below Minimum', value: `${below.length}`, inline: true },
                    { name: '⚖️ Effect', value: 'All companies pay at least this amount per `-work` shift.', inline: false }
                );
            await message.reply({ embeds: [embed] });
            return;
        }

        if (args[0].toLowerCase() === 'remove') {
            data.national_minimum_wage = 0;
            logOwnerAction(data, userId, message.author.username, 'nationalminimumwage', `removed (was ${formatMoney(current)})`);
            saveData(data);
            await message.reply(`🗑️ National minimum wage removed. Companies may now pay any wage.`);
            return;
        }

        const amount = parseInt(args[0]);
        if (isNaN(amount) || amount <= 0) {
            await message.reply('❌ Usage: `-nationalminimumwage <amount>` or `-nationalminimumwage remove`');
            return;
        }

        data.national_minimum_wage = amount;
        logOwnerAction(data, userId, message.author.username, 'nationalminimumwage', `set to ${formatMoney(amount)} (was ${formatMoney(current)})`);
        saveData(data);

        const companies = Object.values(data.companies || {});
        const affected = companies.filter(c => (c.wage || 10) < amount);
        const embed = new EmbedBuilder()
            .setTitle('📜 National Minimum Wage Updated')
            .setDescription(`The national minimum wage is now **${formatMoney(amount)}** per shift.`)
            .setColor(0x00FF00)
            .setFooter({ text: '🇺🇸🇸🇷 USSR Economy' })
            .addFields(
                { name: '📊 Previous Minimum', value: current > 0 ? formatMoney(current) : 'None', inline: true },
                { name: '🏢 Companies Raised', value: `${affected.length} of ${companies.length} now pay more automatically`, inline: true },
                { name: '⚖️ Note', value: 'Company `-setwage` values below this are overridden until they raise above it.', inline: false }
            );
        if (affected.length > 0 && affected.length <= 15) {
            embed.addFields({ name: '⬆️ Affected Companies', value: affected.map(c => `• ${c.name} (${formatMoney(c.wage || 10)})`).join('\n'), inline: false });
        }
        await message.reply({ embeds: [embed] });
        return;
    }

    // ============================================================
    // SSR SPAWN RATES — per-SSR overrides (admin only)
    // Changing one SSR does NOT affect others; without override, global RESOURCE_WEIGHTS is used
    // ============================================================
    if (command === 'spawnrates' || command === 'spawnrate' || command === 'viewspawnrates' || command === 'ssrweights') {
        const q = args.join(' ').trim();
        const data = loadData();
        if (!data.ssr_resource_weights) data.ssr_resource_weights = {};
        if (!q) {
            // overview of all SSRs — show per-SSR overrides count
            const lines = [];
            for (const ssr of Object.keys(SSR_REGIONS)) {
                const overrides = data.ssr_resource_weights[ssr] || {};
                const cnt = Object.keys(overrides).length;
                const emoji = SSR_REGIONS[ssr].emoji;
                if (cnt) {
                    const detail = Object.entries(overrides).map(([r,w])=>`${r}:${w}`).join(', ');
                    lines.push(`${emoji} **${ssr}** — ${cnt} override(s): ${detail}`);
                } else {
                    lines.push(`${emoji} ${ssr} — (global) ${SSR_REGIONS[ssr].resources.join(', ')}`);
                }
            }
            const rushAll = getActiveGoldRush(data);
            const embed = new EmbedBuilder().setTitle('⚖️ Per-SSR Spawn Rates').setDescription(lines.join('\n').substring(0,3800)).setColor(0x5865F2)
                .setFooter({text: 'Global weights used when no override • -setspawnrate <SSR> <resource> <weight> • -resetspawnrate <SSR> <resource>'})
                .addFields({name:'ℹ️ Note', value:'Changing **one SSR** does not affect others. Weight 0 = never spawns, 1 = rarest, 25 = common. Gold default 2 is rare.', inline:false});
            if (rushAll) embed.addFields({name:'⛏️ Active Gold Rush', value:`**${rushAll.ssr}** +${rushAll.percent}% Gold until <t:${Math.floor(new Date(rushAll.expiresAt).getTime()/1000)}:R>`, inline:false});
            await message.reply({embeds:[embed]});
            return;
        }
        // single SSR detail
        const ssrMatch = Object.keys(SSR_REGIONS).find(s => s.toLowerCase() === q.toLowerCase());
        if (!ssrMatch) {
            await message.reply(`❌ SSR '${q}' not found. Valid: ${Object.keys(SSR_REGIONS).join(', ')}`);
            return;
        }
        const resources = SSR_REGIONS[ssrMatch].resources;
        const overrides = data.ssr_resource_weights[ssrMatch] || {};
        const rush = getActiveGoldRush(data);
        const lines = resources.map(r => {
            let w = overrides[r] !== undefined ? overrides[r] : RESOURCE_WEIGHTS[r] || 5;
            let src = overrides[r] !== undefined ? '🔧 SSR' : '🌐 global';
            if (rush && rush.ssr === ssrMatch && r === 'Gold') {
                w = Math.max(1, Math.floor(w * (rush.factor||1.5)));
                src = `⛏️ GOLD RUSH +${rush.percent}%`;
            }
            return `• ${r}: **${w}** ${src} (value ₽${RESOURCE_VALUES[r]||0})`;
        });
        const embed = new EmbedBuilder().setTitle(`${SSR_REGIONS[ssrMatch].emoji} ${ssrMatch} — Spawn Weights`).setDescription(lines.join('\n')).setColor(0x5865F2)
            .setFooter({text: `Use -setspawnrate ${ssrMatch} <resource> <weight> • 0-50`});
        await message.reply({embeds:[embed]});
        return;
    }
    if (command === 'setspawnrate' || command === 'setssrweight' || command === 'setweight') {
        if (!isBotOwner(userId)) { await message.reply('❌ Admin only! (bot owners)'); return; }
        if (args.length < 3) {
            await message.reply('❌ Usage: `-setspawnrate <SSR> <resource> <weight>`\nExample: `-setspawnrate \"Russian SFSR\" Gold 4` or `-setspawnrate Estonian SSR Fish 30`\nWeight 0=never, 1=rarest, 25=common. Only that SSR changes.');
            return;
        }
        const weight = parseInt(args[args.length-1]);
        if (isNaN(weight) || weight < 0 || weight > 50) { await message.reply('❌ Weight must be 0-50 (integer). 0 = never spawns, 2 = rare like Gold, 25 = very common.'); return; }
        const rest = args.slice(0, -1).join(' ').trim();
        // Find SSR by longest prefix
        let ssrMatch = null;
        let resourceName = null;
        for (let i = rest.length; i>0; i--) {
            const candSSR = rest.substring(0, i).trim();
            // try exact SSR match
            const ssr = Object.keys(SSR_REGIONS).find(s => s.toLowerCase() === candSSR.toLowerCase());
            if (ssr) {
                const resCand = rest.substring(i).trim();
                if (resCand) { ssrMatch = ssr; resourceName = resCand; break; }
            }
        }
        if (!ssrMatch) {
            // fallback: first two tokens maybe SSR
            await message.reply(`❌ Could not parse SSR. Valid SSRs: ${Object.keys(SSR_REGIONS).join(', ')}\nUsage: \`-setspawnrate <SSR> <resource> <weight>\``);
            return;
        }
        if (!resourceName) { await message.reply('❌ Missing resource name.'); return; }
        // resource validation: must be in that SSR or known resource
        const validResources = Object.keys(RESOURCE_VALUES);
        const matchedRes = validResources.find(r => r.toLowerCase() === resourceName.toLowerCase());
        if (!matchedRes) { await message.reply(`❌ Resource '${resourceName}' not found. Valid: ${validResources.join(', ')}`); return; }
        resourceName = canonRes(matchedRes);
        if (!SSR_REGIONS[ssrMatch].resources.includes(resourceName)) {
            await message.reply(`⚠️ **Warning:** ${resourceName} is not native to ${ssrMatch} (native: ${SSR_REGIONS[ssrMatch].resources.join(', ')}). It will still be set as override (only matters if resource is added to SSR). Continue? — setting anyway.`);
        }
        const data = loadData();
        if (!data.ssr_resource_weights) data.ssr_resource_weights = {};
        if (!data.ssr_resource_weights[ssrMatch]) data.ssr_resource_weights[ssrMatch] = {};
        const old = data.ssr_resource_weights[ssrMatch][resourceName] !== undefined ? data.ssr_resource_weights[ssrMatch][resourceName] : (RESOURCE_WEIGHTS[resourceName]||5);
        data.ssr_resource_weights[ssrMatch][resourceName] = weight;
        logOwnerAction(data, userId, message.author.username, 'setspawnrate', `${ssrMatch} ${resourceName} ${old}→${weight}`);
        saveData(data);
        const embed = new EmbedBuilder().setTitle('✅ Spawn Rate Updated (per-SSR)').setDescription(`${SSR_REGIONS[ssrMatch].emoji} **${ssrMatch}** — **${resourceName}**: ${old} → **${weight}**\nOnly this SSR affected; others keep global ${RESOURCE_WEIGHTS[resourceName]||5}.`).setColor(0x00FF00).setFooter({text:'Use -spawnrates to view all • -resetspawnrate to remove override'});
        await message.reply({embeds:[embed]});
        return;
    }
    if (command === 'resetspawnrate' || command === 'resetssrweight' || command === 'delspawnrate') {
        if (!isBotOwner(userId)) { await message.reply('❌ Admin only!'); return; }
        if (args.length < 2) { await message.reply('❌ Usage: `-resetspawnrate <SSR> <resource>` — removes per-SSR override and falls back to global.'); return; }
        const rest = args.join(' ').trim();
        let ssrMatch = null;
        let resourceName = null;
        for (let i = rest.length; i>0; i--) {
            const candSSR = rest.substring(0, i).trim();
            const ssr = Object.keys(SSR_REGIONS).find(s => s.toLowerCase() === candSSR.toLowerCase());
            if (ssr) { ssrMatch = ssr; resourceName = rest.substring(i).trim(); break; }
        }
        if (!ssrMatch || !resourceName) { await message.reply('❌ Could not parse SSR/resource.'); return; }
        const matchedRes = Object.keys(RESOURCE_VALUES).find(r => r.toLowerCase() === resourceName.toLowerCase());
        if (!matchedRes) { await message.reply(`❌ Resource '${resourceName}' not found.`); return; }
        resourceName = canonRes(matchedRes);
        const data = loadData();
        if (!data.ssr_resource_weights || !data.ssr_resource_weights[ssrMatch] || data.ssr_resource_weights[ssrMatch][resourceName] === undefined) {
            await message.reply(`ℹ️ No per-SSR override for ${resourceName} in ${ssrMatch} — already using global ${RESOURCE_WEIGHTS[resourceName]||5}.`);
            return;
        }
        const oldW = data.ssr_resource_weights[ssrMatch][resourceName];
        delete data.ssr_resource_weights[ssrMatch][resourceName];
        if (Object.keys(data.ssr_resource_weights[ssrMatch]).length === 0) delete data.ssr_resource_weights[ssrMatch];
        logOwnerAction(data, userId, message.author.username, 'resetspawnrate', `${ssrMatch} ${resourceName} ${oldW} → global ${RESOURCE_WEIGHTS[resourceName]||5}`);
        saveData(data);
        await message.reply(`✅ Reset **${ssrMatch}** ${resourceName} → now uses global weight **${RESOURCE_WEIGHTS[resourceName]||5}**.`);
        return;
    }

    // ============================================================
    // BLACKLIST — admin only, must be userid, fired, can only watch graphs etc
    // ============================================================
    
    if (command === 'blacklist') {
        if (!isBotOwner(userId)) {
            await message.reply('❌ Admin only! (bot owners)');
            return;
        }
        if (args.length === 0) {
            const data = loadData();
            const list = Object.entries(data.blacklist || {});
            if (list.length === 0) {
                await message.reply('✅ No blacklisted users.');
                return;
            }
            const lines = list.slice(0, 20).map(([id, info]) => `• <@${id}> \`${id}\` — by <@${info.by}> at ${new Date(info.at).toLocaleString()}${info.reason ? ' — ' + info.reason : ''}`).join('\n');
            const embed = new EmbedBuilder().setTitle('🚫 Blacklist').setDescription(lines.substring(0, 4000)).setColor(0xFF0000).setFooter({ text: `Total: ${list.length} — use -unblacklist <userid> to remove` });
            await message.reply({ embeds: [embed] });
            return;
        }
        const raw = args[0];
        const targetId = raw.replace(/[<@!>]/g, '');
        if (!/^\d{17,19}$/.test(targetId)) {
            await message.reply('❌ Must be **userid** (17-19 digits, e.g. `1379734184259747851`). You gave: `' + raw + '` — mentions like <@123> are okay but must resolve to a userid.');
            return;
        }
        if (targetId === userId) {
            await message.reply('❌ Cannot blacklist yourself!');
            return;
        }
        const data = loadData();
        if (data.blacklist && data.blacklist[targetId]) {
            await message.reply(`❌ <@${targetId}> is already blacklisted.`);
            return;
        }
        if (!data.blacklist) data.blacklist = {};
        data.blacklist[targetId] = { by: userId, at: new Date().toISOString(), reason: args.slice(1).join(' ') || 'No reason' };
        const wasFired = fireBlacklistedUser(data, targetId);
        logOwnerAction(data, userId, message.author.username, 'blacklist', `blacklisted <@${targetId}> (${targetId}) reason: ${data.blacklist[targetId].reason}${wasFired?' — fired':''}`);
        saveData(data);
        const embed = new EmbedBuilder().setTitle('🚫 User Blacklisted').setDescription(`<@${targetId}> \`${targetId}\` has been **blacklisted** from the economy.${wasFired ? '\n🔥 They were **fired** from their job.' : ''}\nThey can now only watch (graphs, gsi, goldstandard, econstats, etc) — cannot work/trade/collect/build.`).setColor(0xFF0000).addFields({ name: 'Reason', value: data.blacklist[targetId].reason.substring(0, 1024), inline: false }).setFooter({ text: 'Use -unblacklist <userid> to remove' });
        await message.reply({ embeds: [embed] });
        try {
            const u = await client.users.fetch(targetId);
            await u.send(`🚫 You have been **blacklisted** from the USSR Economy by <@${userId}>. You can only watch graphs etc. ${wasFired ? 'You were fired.' : ''}`);
        } catch {}
        return;
    }

    if (command === 'unblacklist') {
        if (!isBotOwner(userId)) {
            await message.reply('❌ Admin only! (bot owners)');
            return;
        }
        if (args.length === 0) {
            await message.reply('❌ Usage: `-unblacklist <userid>` — must be userid');
            return;
        }
        const raw = args[0];
        const targetId = raw.replace(/[<@!>]/g, '');
        if (!/^\d{17,19}$/.test(targetId)) {
            await message.reply('❌ Must be userid (17-19 digits).');
            return;
        }
        const data = loadData();
        if (!data.blacklist || !data.blacklist[targetId]) {
            await message.reply(`❌ <@${targetId}> is not blacklisted.`);
            return;
        }
        delete data.blacklist[targetId];
        logOwnerAction(data, userId, message.author.username, 'unblacklist', `unblacklisted <@${targetId}> (${targetId})`);
        saveData(data);
        await message.reply(`✅ <@${targetId}> has been **unblacklisted** — they can now use the economy again.`);
        return;
    }

    // ============================================================
    // BOT OWNERS — only 1082686076491137115 can add/remove
    // ============================================================
    
    if (command === 'addowner' || command === 'addbotowner' || command === 'owneradd') {
        if (!isPrimaryOwner(userId)) {
            await message.reply('❌ Only **Primary** <@1082686076491137115> / **Co-Primary** <@860203156222902332> can add bot owners.');
            return;
        }
        if (args.length === 0) {
            await message.reply('❌ Usage: `-addowner <userid>` — must be userid (17-19 digits).');
            return;
        }
        const raw = args[0];
        const targetId = raw.replace(/[<@!>]/g, '');
        if (!/^\d{17,19}$/.test(targetId)) {
            await message.reply('❌ Must be userid. You gave: `' + raw + '`');
            return;
        }
        const data = loadData();
        if (!Array.isArray(data.bot_owners)) data.bot_owners = [BOT_OWNER_ID, BOT_OWNER_2_ID];
        if (data.bot_owners.includes(targetId)) {
            await message.reply(`❌ <@${targetId}> is already a bot owner.`);
            return;
        }
        data.bot_owners.push(targetId);
        logOwnerAction(data, userId, message.author.username, 'addowner', `added <@${targetId}> (${targetId})`);
        saveData(data);
        await message.reply(`✅ Added <@${targetId}> as bot owner. Current owners: ${data.bot_owners.map(id=>`<@${id}>`).join(', ')}`);
        return;
    }

    if (command === 'removeowner' || command === 'removebotowner' || command === 'ownerremove' || command === 'delowner') {
        if (!isPrimaryOwner(userId)) {
            await message.reply('❌ Only **Primary** <@1082686076491137115> / **Co-Primary** <@860203156222902332> can remove bot owners.');
            return;
        }
        if (args.length === 0) {
            await message.reply('❌ Usage: `-removeowner <userid>`');
            return;
        }
        const raw = args[0];
        const targetId = raw.replace(/[<@!>]/g, '');
        if (targetId === BOT_OWNER_ID) {
            await message.reply('❌ Cannot remove **Primary** owner.');
            return;
        }
        if (targetId === BOT_OWNER_2_ID) {
            await message.reply('❌ Cannot remove **Co-Primary** owner. Demote via code only.');
            return;
        }
        const data = loadData();
        if (!data.bot_owners || !data.bot_owners.includes(targetId)) {
            await message.reply(`❌ <@${targetId}> is not a bot owner.`);
            return;
        }
        data.bot_owners = data.bot_owners.filter(id => id !== targetId);
        logOwnerAction(data, userId, message.author.username, 'removeowner', `removed <@${targetId}> (${targetId})`);
        saveData(data);
        await message.reply(`✅ Removed <@${targetId}> from bot owners. Remaining: ${data.bot_owners.map(id=>`<@${id}>`).join(', ') || 'none'}`);
        return;
    }

    // ============================================================
    // OWNER LOGS — view audit
    // ============================================================
    if (command === 'ownerlogs' || command === 'adminlogs' || command === 'audit' || command === 'logs') {
        if (!isBotOwner(userId)) { await message.reply('❌ Bot owners only!'); return; }
        const data = loadData();
        const logs = data.owner_logs || [];
        if (!logs.length) { await message.reply('📭 No owner logs yet.'); return; }
        const recent = logs.slice(-15).reverse();
        const lines = recent.map(e => {
            const t = new Date(e.at).toLocaleString();
            return `\`${t}\` **${e.username}** (${e.by}) — **${e.action}** ${e.details}`;
        }).join('\n');
        const embed = new EmbedBuilder().setTitle('📜 Owner Logs (last 15/500)').setDescription(lines.substring(0,4000)).setColor(0xFFD700).setFooter({text: `Total ${logs.length} — use panels in admin.html logs`});
        await message.reply({embeds:[embed]});
        return;
    }

    if (command === 'owners' || command === 'botowners' || command === 'listowners') {
        const data = loadData();
        const owners = data.bot_owners || [BOT_OWNER_ID, BOT_OWNER_2_ID];
        const lines = owners.map((id,i)=>{
            let tag=''; if(id===BOT_OWNER_ID) tag=' — **PRIMARY**'; else if(id===BOT_OWNER_2_ID) tag=' — **CO-PRIMARY**'; else tag=' — Owner';
            return `${i+1}. <@${id}> \`${id}\`${tag}`;
        }).join('\n');
        const embed = new EmbedBuilder().setTitle('👑 Bot Owners').setDescription(lines).setColor(0xFFD700).setFooter({text: 'Primary 1082686076491137115 / Co-Primary 860203156222902332 can add/remove'});
        await message.reply({ embeds: [embed] });
        return;
    }

    // ============================================================
    // GOLDRUSH — secret, Bot Owners only, 24-48h configurable boost for Gold SSRs
    // No permanent bonus: 0 RN, menu lets you pick SSR (gold only), duration 24-48h, boost %
    // ============================================================
    if (command === 'goldrush') {
        if (!isBotOwner(userId)) { await message.reply('❌ Secret — Bot owners only.'); return; }
        const goldSSRs = Object.entries(SSR_REGIONS).filter(([,v])=>v.resources.includes('Gold')).map(([name, v])=>({name, emoji: v.emoji, work_zone: v.work_zone}));
        if (!goldSSRs.length) { await message.reply('❌ No gold SSRs found.'); return; }
        const active = getActiveGoldRush(loadData());
        const activeText = active ? `Currently: **${active.ssr}** +${active.percent}% until <t:${Math.floor(new Date(active.expiresAt).getTime()/1000)}:R>` : 'Currently: **none** — 0 gold rush active';
        const ssrOptions = goldSSRs.map(s=> new StringSelectMenuOptionBuilder().setLabel(s.name).setDescription(`Gold SSR • ${SSR_REGIONS[s.name].resources.join(', ').slice(0,50)}`).setValue(s.name).setEmoji(s.emoji));
        const ssrMenu = new StringSelectMenuBuilder().setCustomId('goldrush_ssr').setPlaceholder('Which SSR gets Gold Rush? (gold SSRs only)').addOptions(ssrOptions);
        const row1 = new ActionRowBuilder().addComponents(ssrMenu);
        const embed1 = new EmbedBuilder().setTitle('⛏️ GOLD RUSH — Step 1/3').setDescription(`**Which SSR** do you want to give Gold Rush? Only gold SSRs listed.\n${activeText}`).setColor(0xFFD700).setFooter({text: 'Step 1: SSR • Step 2: duration 24-48h • Step 3: boost %'});
        const reply = await message.reply({ embeds: [embed1], components: [row1], fetchReply: true });
        let selectedSSR = null, selectedHours = null, selectedPercent = null;
        const collector = reply.createMessageComponentCollector({ filter: i=>i.user.id===userId, time: 120000 });
        collector.on('collect', async (interaction) => {
            if (interaction.customId === 'goldrush_ssr') {
                selectedSSR = interaction.values[0];
                const durOptions = [
                    new StringSelectMenuOptionBuilder().setLabel('24 hours — minimum').setValue('24').setEmoji('⏱️'),
                    new StringSelectMenuOptionBuilder().setLabel('30 hours').setValue('30').setEmoji('⏱️'),
                    new StringSelectMenuOptionBuilder().setLabel('36 hours').setValue('36').setEmoji('⏱️'),
                    new StringSelectMenuOptionBuilder().setLabel('48 hours — maximum').setValue('48').setEmoji('⏱️'),
                ];
                const durMenu = new StringSelectMenuBuilder().setCustomId('goldrush_dur').setPlaceholder(`Duration for ${selectedSSR}? (24-48h)`).addOptions(durOptions);
                const rowDur = new ActionRowBuilder().addComponents(durMenu);
                const embedDur = new EmbedBuilder().setTitle('⛏️ GOLD RUSH — Step 2/3').setDescription(`**${selectedSSR}** selected.\n**How long?** 24h min — 48h max.`).setColor(0xFFD700).setFooter({text: `SSR: ${selectedSSR} • Next: boost %`});
                await interaction.update({ embeds: [embedDur], components: [rowDur] });
            } else if (interaction.customId === 'goldrush_dur') {
                selectedHours = parseInt(interaction.values[0]);
                const boostOptions = [
                    new StringSelectMenuOptionBuilder().setLabel('25% — modest').setValue('25').setEmoji('📈'),
                    new StringSelectMenuOptionBuilder().setLabel('50% — standard').setValue('50').setEmoji('📈'),
                    new StringSelectMenuOptionBuilder().setLabel('75% — high').setValue('75').setEmoji('📈'),
                    new StringSelectMenuOptionBuilder().setLabel('100% — double').setValue('100').setEmoji('🚀'),
                    new StringSelectMenuOptionBuilder().setLabel('150% — insane').setValue('150').setEmoji('🚀'),
                ];
                const boostMenu = new StringSelectMenuBuilder().setCustomId('goldrush_boost').setPlaceholder(`Boost % for ${selectedSSR}? (${selectedHours}h)`).addOptions(boostOptions);
                const rowBoost = new ActionRowBuilder().addComponents(boostMenu);
                const embedBoost = new EmbedBuilder().setTitle('⛏️ GOLD RUSH — Step 3/3').setDescription(`**${selectedSSR}** • **${selectedHours}h**\n**How big % boost?**`).setColor(0xFFD700).setFooter({text: `SSR: ${selectedSSR} • Duration: ${selectedHours}h`});
                await interaction.update({ embeds: [embedBoost], components: [rowBoost] });
            } else if (interaction.customId === 'goldrush_boost') {
                selectedPercent = parseInt(interaction.values[0]);
                const factor = 1 + selectedPercent/100;
                const expiresAt = new Date(Date.now() + selectedHours*3600*1000).toISOString();
                const data = loadData();
                data.gold_rush = { ssr: selectedSSR, factor, percent: selectedPercent, durationHours: selectedHours, expiresAt, startedBy: userId, startedAt: new Date().toISOString() };
                logOwnerAction(data, userId, message.author.username, 'goldrush', `${selectedSSR} +${selectedPercent}% for ${selectedHours}h until ${expiresAt}`);
                saveData(data);
                const workZone = SSR_REGIONS[selectedSSR]?.work_zone || '1538704555670245448';
                const endTime = Math.floor(new Date(expiresAt).getTime()/1000);
                const announceEmbed = new EmbedBuilder().setTitle('⛏️ GOLD RUSH!').setDescription(`**${selectedSSR}** has a **Gold Rush!**\n**+${selectedPercent}%** higher chance of **Gold** for **${selectedHours} hours** (<t:${endTime}:R>)\nVia \`-work\` and \`-collect\` (Gold Mine)\nStarted by <@${userId}>`).setColor(0xFFD700).setFooter({text: `${selectedSSR} Gold Rush • factor x${factor.toFixed(2)}`});
                try {
                    const ch = await client.channels.fetch(workZone);
                    if (ch) await ch.send({ embeds: [announceEmbed] });
                } catch {}
                try {
                    const nurCh = await client.channels.fetch('1538704555670245448');
                    if (nurCh && workZone !== '1538704555670245448') await nurCh.send({ embeds: [announceEmbed] });
                } catch {}
                await interaction.update({ embeds: [new EmbedBuilder().setTitle('✅ Gold Rush Started').setDescription(`**${selectedSSR}** now has **+${selectedPercent}% Gold** for **${selectedHours}h** until <t:${endTime}:F> (<t:${endTime}:R>)\nAnnounced in <#${workZone}>`).setColor(0x00FF00)], components: [] });
                collector.stop();
            }
        });
        collector.on('end', async (collected) => { if (collected.size===0) { try{await reply.edit({components:[]});}catch{}} });
        return;
    }

    // ============================================================
    // SALARIES — % from company funds, setable by CEO/Director
    // ============================================================
    if (command === 'setsalary' || command === 'setsalaries' || command === 'salary') {
        const managed = getManagedCompany(userId, loadData());
        if (!managed || !['owner','director'].includes(managed.role)) {
            await message.reply('❌ Only **CEO** (private) or **Director** (state) can set salaries!');
            return;
        }
        if (args.length < 2) {
            const cfg = managed.company.salary_config || { ceo:5, director:5, manager:2 };
            await message.reply(`💼 **${managed.company.name}** salaries: CEO ${cfg.ceo}% | Director ${cfg.director}% | Manager ${cfg.manager}% (each manager)\nUsage: \`-setsalary <ceo|director|manager> <0-20>\` e.g. \`-setsalary ceo 7\` — % of company funds paid on \`-collect\` and \`-paysalaries\``);
            return;
        }
        const role = args[0].toLowerCase();
        if (!['ceo','director','manager'].includes(role)) { await message.reply('❌ Role must be `ceo`, `director`, or `manager`'); return; }
        const pct = parseInt(args[1]);
        if (isNaN(pct) || pct < 0 || pct > 20) { await message.reply('❌ Percent must be 0-20'); return; }
        const data = loadData();
        const fresh = getManagedCompany(userId, data);
        if (!fresh) { await message.reply('❌ Company not found'); return; }
        if (!fresh.company.salary_config) fresh.company.salary_config = { ceo:5, director:5, manager:2 };
        fresh.company.salary_config[role] = pct;
        data.companies[fresh.companyId] = fresh.company;
        logOwnerAction(data, userId, message.author.username, 'setsalary', `${fresh.company.name} ${role}=${pct}%`);
        saveData(data);
        await message.reply(`✅ **${fresh.company.name}** salary for **${role}** set to **${pct}%** of funds (paid on \`-collect\`/\`-paysalaries\`)`);
        return;
    }
    if (command === 'paysalaries' || command === 'paysalary') {
        const managed = getManagedCompany(userId, loadData());
        if (!managed || !['owner','director','manager'].includes(managed.role)) {
            await message.reply('❌ Only CEO/Director/Manager can pay salaries!');
            return;
        }
        const data = loadData();
        const fresh = getManagedCompany(userId, data);
        if (!fresh) { await message.reply('❌ Company not found'); return; }
        const result = payCompanySalaries(data, fresh.companyId);
        if (result.totalPaid === 0) {
            await message.reply(`💼 **${fresh.company.name}** has no salaries to pay (funds ₽${(fresh.company.funds||0).toLocaleString()} or all 0%) — set with \`-setsalary\``);
            return;
        }
        data.companies[fresh.companyId] = data.companies[fresh.companyId]; // already updated in pay
        logOwnerAction(data, userId, message.author.username, 'paysalaries', `${fresh.company.name} paid ₽${result.totalPaid} to ${result.paid.map(p=>`${p.role} <@${p.userId}> ₽${p.amount}`).join(', ')}`);
        saveData(data);
        const lines = result.paid.map(p=> `• ${p.role} <@${p.userId}> — ₽${p.amount.toLocaleString()}`).join('\n');
        await message.reply({ embeds: [new EmbedBuilder().setTitle(`💼 Salaries Paid — ${fresh.company.name}`).setDescription(lines).setColor(0xFFD700).addFields({name:'Total Paid', value: `₽${result.totalPaid.toLocaleString()} from funds`, inline:true}, {name:'Remaining Funds', value: `₽${(data.companies[fresh.companyId].funds||0).toLocaleString()}`, inline:true}).setFooter({text: `CEO ${fresh.company.salary_config?.ceo||5}% | Director ${fresh.company.salary_config?.director||5}% | Manager ${fresh.company.salary_config?.manager||2}%`})] });
        return;
    }

    // ============================================================
    // FIVE YEAR PLAN — updated with circulation, gold, production, gsi
    // ============================================================
    if (command === 'plan' || command === 'fiveyearplan' || command === 'fiveyear') {
        const data = loadData();
        const prog = getFiveYearPlanProgress(data);
        if (!prog) { await message.reply('❌ No plan data'); return; }
        const p = prog.progress;
        const bar = (pct)=> '█'.repeat(Math.min(20, Math.round(pct/5))) + '░'.repeat(20 - Math.min(20, Math.round(pct/5)));
        const chk = (pct)=> pct>=100 ? '✅' : '⬜';
        const embed = new EmbedBuilder().setTitle('📜 Five Year Plan — ЦК КПСС').setDescription(`**${new Date(prog.plan.startAt).toLocaleDateString()} → ${new Date(prog.plan.endAt).toLocaleDateString()}**\nOverall **${prog.overall}%** ${prog.overall>=100?'✅ ALL MET':''}`).setColor(prog.overall>=100?0x00FF00:0xFFD700)
            .addFields(
                { name: `${chk(p.circulation.pct)} 💰 Circulation ${p.circulation.pct}%`, value: `${bar(p.circulation.pct)}\n${p.circulation.current.toLocaleString()} / ${p.circulation.target.toLocaleString()} ₽ ${p.circulation.pct>=100?'✅':''}`, inline: false },
                { name: `${chk(p.goldBacking.pct)} 🥇 Gold Backing ${p.goldBacking.pct}%`, value: `${bar(p.goldBacking.pct)}\n${p.goldBacking.current.toFixed(1)}% / ${p.goldBacking.target}% ${p.goldBacking.pct>=100?'✅':''}`, inline: false },
                { name: `${chk(p.production.pct)} 🏭 Production ${p.production.pct}%`, value: `${bar(p.production.pct)}\n${p.production.current} / ${p.production.target} units ${p.production.pct>=100?'✅':''}`, inline: false },
                { name: `${chk(p.gsi.pct)} 📈 GSI ${p.gsi.pct}%`, value: `${bar(p.gsi.pct)}\n${p.gsi.current} / ${p.gsi.target} ${p.gsi.pct>=100?'✅':''}`, inline: false },
                { name: `${chk(p.growth.pct)} 📊 Growth ${p.growth.pct}%`, value: `${bar(p.growth.pct)}\n${p.growth.current.toFixed(1)}% / ${p.growth.target}% required ${p.growth.pct>=100?'✅':''} (vs start)`, inline: false }
            ).setFooter({text: prog.overall>=100 ? '✅ PLAN FULFILLED — Shock workers honoured!' : 'Central Committee urges: meet quotas! Requirements show ✅ when met.'});
        await message.reply({ embeds: [embed] });
        // First time announcement in every workzone
        if (!data.five_year_plan || !data.five_year_plan.announced) {
            if (data.five_year_plan) data.five_year_plan.announced = true;
            else data.five_year_plan_announced = true;
            saveData(data);
            const workZones = Object.values(WORK_ZONES);
            const zones = workZones.length ? workZones : ["1538704167890329621","1538703449095676016","1538704231249354772","1538703028524285962","1538703181733695600","1538704555670245448"];
            for (const zid of zones) {
                try {
                    const ch = await client.channels.fetch(zid);
                    if (ch) await ch.send({ embeds: [embed] });
                } catch {}
            }
        }
        return;
    }
    if (command === 'setplan' || command === 'setfiveyearplan') {
        if (!isBotOwner(userId)) { await message.reply('❌ Owner only!'); return; }
        if (args.length < 4) {
            const data = loadData();
            const plan = data.five_year_plan;
            await message.reply(`📜 Current plan: circulation ${plan.targets.circulation} ₽, gold ${plan.targets.goldBacking}%, production ${plan.targets.production}, gsi ${plan.targets.gsi}, growth ${plan.targets.growth||10}%\nUsage: \`-setplan <circulation> <gold%> <production> <gsi> [growth%]\` e.g. \`-setplan 800000 70 5000 180 15\``);
            return;
        }
        const circ = parseInt(args[0]), gold = parseInt(args[1]), prod = parseInt(args[2]), gsi = parseInt(args[3]), growth = args[4] ? parseInt(args[4]) : 10;
        if ([circ,gold,prod,gsi,growth].some(v=>isNaN(v)||v<=0)) { await message.reply('❌ All targets must be positive numbers'); return; }
        const data = loadData();
        const startVals = {
            circulation: getTotalRubles(data),
            goldBacking: getGoldBackingRatio(data),
            production: getTotalProduction(data),
            gsi: getGSIPrice ? getGSIPrice() : (data.gsi_history?.[data.gsi_history.length-1]?.price||100)
        };
        data.five_year_plan = {
            startAt: new Date().toISOString(),
            endAt: new Date(Date.now() + 5*24*3600*1000).toISOString(),
            targets: { circulation: circ, goldBacking: gold, production: prod, gsi: gsi, growth: growth },
            startValues: startVals,
            rewards: { bonus: "Shock workers honoured" }
        };
        logOwnerAction(data, userId, message.author.username, 'setplan', `circulation ${circ}, gold ${gold}%, prod ${prod}, gsi ${gsi}, growth ${growth}%`);
        saveData(data);
        await message.reply(`✅ Five Year Plan updated — targets: circulation ${circ.toLocaleString()} ₽, gold ${gold}%, production ${prod}, GSI ${gsi}, growth ${growth}% (5 days) — start snapshot saved`);
        // Announce new plan in every workzone
        try {
            const prog2 = getFiveYearPlanProgress(data);
            const p2 = prog2.progress;
            const bar2 = (pct)=> '█'.repeat(Math.min(20, Math.round(pct/5))) + '░'.repeat(20 - Math.min(20, Math.round(pct/5)));
            const embedAnn = new EmbedBuilder().setTitle('📜 New Five Year Plan — ЦК КПСС').setDescription(`**${new Date(data.five_year_plan.startAt).toLocaleDateString()} → ${new Date(data.five_year_plan.endAt).toLocaleDateString()}**\nTargets: circulation ${circ.toLocaleString()} ₽, gold ${gold}%, production ${prod}, GSI ${gsi}, growth ${growth}%\nOverall **${prog2.overall}%**`).setColor(0xFFD700)
                .addFields(
                    { name: `💰 Circulation`, value: `${bar2(p2.circulation.pct)}\n${p2.circulation.current.toLocaleString()} / ${p2.circulation.target.toLocaleString()} ₽`, inline: false },
                    { name: `🥇 Gold`, value: `${bar2(p2.goldBacking.pct)}\n${p2.goldBacking.current.toFixed(1)}% / ${p2.goldBacking.target}%`, inline: false },
                    { name: `🏭 Production`, value: `${bar2(p2.production.pct)}\n${p2.production.current} / ${p2.production.target}`, inline: false },
                    { name: `📈 GSI`, value: `${bar2(p2.gsi.pct)}\n${p2.gsi.current} / ${p2.gsi.target}`, inline: false },
                    { name: `📊 Growth`, value: `${bar2(p2.growth.pct)}\n${p2.growth.current.toFixed(1)}% / ${p2.growth.target}%`, inline: false }
                ).setFooter({text: `Set by ${message.author.username} — Central Committee`});
            const zones = Object.values(WORK_ZONES);
            const list = zones.length ? zones : ["1538704167890329621","1538703449095676016","1538704231249354772","1538703028524285962","1538703181733695600","1538704555670245448"];
            for (const zid of list) { try { const ch = await client.channels.fetch(zid); if (ch) await ch.send({ embeds: [embedAnn] }); } catch {} }
        } catch {}
        return;
    }

    // ============================================================
    // TAXES — weekly Monday 12:00 CET to State Bank, increased 5% for balance
    // ============================================================
    if (command === 'tax' || command === 'taxes' || command === 'taxinfo' || command === 'taxbrackets') {
        const embed = new EmbedBuilder().setTitle('🏛️ Taxation Code No. 001-2026 — +5% Balanced').setColor(0xFFD700)
            .addFields(
                { name: '👤 Individual', value: `0–350 **0%**\n351–1k **10%** *(was 5% +5)*\n1k–5k **15%** *(was 10% +5)*\n5k–200k **20%** *(was 15% +5)*\n>200k **30%** *(was 25% +5)*`, inline: true },
                { name: '🏢 Corporate', value: `0–5k **0%**\n5k–15k **10%** *(was 5% +5)*\n15k–30k **13%** *(was 8% +5)*\n>30k **17%** *(was 12% +5)*`, inline: true },
                { name: '📈 Stock / Luxury', value: `Buy **7%** *(was 2% +5)*\nSell **10%** *(was 5% +5)*\nLuxury **10%** *(was 5% +5)*`, inline: true },
                { name: '⏰ Weekly', value: `Every **Monday 12:00 CET** (11:00 UTC) → State Bank\nSkips <100 ₽ (lag) • Auto to <@${STATE_BANK_USER_ID}>`, inline: false },
                { name: '📍 Where increased', value: `All brackets **+5%** except 0% stays 0% — see Google Doc: increase each rate by 5 (Individual 5→10, 10→15, 15→20, 25→30; Corporate 5→10, 8→13, 12→17; Stock 2→7, 5→10; Luxury 5→10)`, inline: false }
            ).setFooter({text: 'Edit Google Doc: https://docs.google.com/document/d/18ydFdo2c0ybihok_sBCiNpCwJqpTbNkExyETRXhQ7x4/edit'});
        await message.reply({ embeds: [embed] });
        return;
    }
    if (command === 'collecttaxes' || command === 'collecttax' || command === 'runtaxes') {
        if (!isBotOwner(userId)) { await message.reply('❌ Owner only!'); return; }
        const result = await collectWeeklyTaxes(true);
        if (!result || result.totalCollected===0) { await message.reply('📭 No taxes collected (all <100 ₽ or already collected this week)'); return; }
        const topU = (result.userDetails||[]).sort((a,b)=>b.tax-a.tax).slice(0,10).map(u=>`• ${u.username} — ${formatMoney(u.tax)} from ${formatMoney(u.total)}`).join('\n').slice(0,1000) || 'None';
        const topC = (result.companyDetails||[]).sort((a,b)=>b.tax-a.tax).slice(0,10).map(c=>`• ${c.name} — ${formatMoney(c.tax)} from ${formatMoney(c.funds)}`).join('\n').slice(0,1000) || 'None';
        const embed = new EmbedBuilder().setTitle('✅ Manual Weekly Taxes — State Bank').setDescription(`Collected **${formatMoney(result.totalCollected)}** from **${result.usersTaxed}** users + **${result.companiesTaxed}** companies\n\n• From users: **${formatMoney(result.totalFromUsers)}**\n• From companies: **${formatMoney(result.totalFromCompanies)}**`).setColor(0xFFD700)
            .addFields({name: `👥 Citizens (${result.usersTaxed})`, value: topU, inline:false}, {name: `🏢 Companies (${result.companiesTaxed})`, value: topC, inline:false}).setFooter({text: `Sent to State Bank <@${STATE_BANK_USER_ID}>`});
        await message.reply({ embeds: [embed] });
        return;
    }

});

// ============================================================
// MODAL SUBMISSION HANDLER
// ============================================================

client.on(Events.InteractionCreate, async interaction => {
    if (!interaction.isModalSubmit()) return;
    
    if (interaction.customId === 'createCompany') {
        const companyName = interaction.fields.getTextInputValue('companyName');
        const ticker = interaction.fields.getTextInputValue('companyTicker');
        const investment = parseInt(interaction.fields.getTextInputValue('companyInvestment'));
        const totalShares = parseInt(interaction.fields.getTextInputValue('companyShares')) || 100000;
        
        if (isNaN(investment) || investment < 1000) {
            await interaction.reply({ content: '❌ Minimum investment is ₽1,000!', ephemeral: true });
            return;
        }
        
        const userId = interaction.user.id;
        const data = loadData();
        const user = ensureUserRecord(data, userId);
        
        if (user.company_id || user.director_of) {
            await interaction.reply({ content: '❌ You already own or direct a company!', ephemeral: true });
            return;
        }
        
        
        for (const [cid, c] of Object.entries(data.companies)) {
            if (c.ticker?.toUpperCase() === ticker.toUpperCase()) {
                await interaction.reply({ content: `❌ Ticker '${ticker.toUpperCase()}' is taken!`, ephemeral: true });
                return;
            }
        }
        for (const [cid, c] of Object.entries(data.companies)) {
            if (c.name?.toLowerCase() === companyName.toLowerCase()) {
                await interaction.reply({ content: `❌ Company name '${companyName}' is taken!`, ephemeral: true });
                return;
            }
        }
        
        const [cash] = await getUnbBalance(userId);
        if (cash < investment) {
            await interaction.reply({ content: `❌ Need ${formatMoney(investment)}! You have ${formatMoney(cash)}`, ephemeral: true });
            return;
        }
        
        data.company_id_counter = (data.company_id_counter || 0) + 1;
        const companyId = `comp_${data.company_id_counter}`;
        
        const stateShares = Math.floor(totalShares * 0.4);
        const founderShares = Math.floor(totalShares * 0.2);
        const publicShares = totalShares - stateShares - founderShares;
        
        const sharePrice = Math.max(1, Math.floor(investment / totalShares));
        const ssrName = user.ssr_region || 'Unknown SSR';
        
        data.companies[companyId] = {
            "id": companyId,
            "name": companyName,
            "ticker": ticker.toUpperCase(),
            "owner_id": userId,
            "ceo": interaction.user.displayName,
            "hq_ssr": ssrName,
            "funds": investment,
            "invested_capital": investment,
            "shares_total": totalShares,
            "shares_available": publicShares,
            "state_shares": stateShares,
            "founder_shares": founderShares,
            "share_price": sharePrice,
            "market_cap": investment,
            "employees": 1,
            "level": 1,
            "buildings": {},
            "inventory": { "Wheat": 200 },
            "created_at": new Date().toISOString(),
            "last_collect": null,
            "price_history": [sharePrice],
            "is_state_owned": false,
            "specialization": null,
            "salary_config": { "ceo": 5, "director": 5, "manager": 2 },
            "managers": []
        };
        
        const success = await updateUnbBalance(userId, -investment, 0, `Company: ${companyName}`);
        if (!success) {
            await interaction.reply({ content: '❌ Failed to update balance!', ephemeral: true });
            return;
        }
        
        user.cash = cash - investment;
        user.company_id = companyId;
        user.ceo_of = companyName;
        user.ssr_region = ssrName;
        
        user.is_employed = true;
        user.employed_at = companyName;
        
        if (!user.share_holdings) user.share_holdings = {};
        user.share_holdings[companyName] = {
            "shares": founderShares,
            "avg_price": sharePrice
        };
        
        // user is already data.users[userId] via ensureUserRecord, single atomic save
        saveData(data);
        updateCompanyPrice(companyId);
        const company = data.companies[companyId];
        const ssrEmoji = SSR_REGIONS[ssrName]?.emoji || '🌍';
        
        const embed = new EmbedBuilder()
            .setTitle('🏢 Company Founded!')
            .setDescription(`**${companyName}** (${ticker.toUpperCase()}) has been established!`)
            .setColor(0x00FF00)
            .addFields(
                { name: '👔 CEO', value: interaction.user.displayName, inline: true },
                { name: '📍 HQ SSR', value: `${ssrEmoji} ${ssrName}`, inline: true },
                { name: '💰 Investment', value: formatMoney(investment), inline: true },
                { name: '📊 Share Price', value: formatMoney(company.share_price || 0), inline: true },
                { name: '📈 Market Cap', value: formatMoney(company.market_cap || 0), inline: true },
                { name: '📈 Total Shares', value: totalShares.toLocaleString(), inline: true },
                { name: '🏛️ State Shares (40%)', value: stateShares.toLocaleString(), inline: true },
                { name: '👔 Founder Shares', value: `${founderShares.toLocaleString()} (20%)`, inline: true },
                { name: '📦 Public Shares', value: publicShares.toLocaleString(), inline: true },
                { name: '✅ Auto-Employed', value: 'You are now employed at your own company!', inline: false }
            )
            .setFooter({ text: 'Use -work in your SSR region to start earning! | Use -build to construct buildings!' });
        
        await interaction.reply({ embeds: [embed] });
        return;
    }
    
    if (interaction.customId === 'factory_specialize') {
        const specName = interaction.fields.getTextInputValue('factorySpec');
        const userId = interaction.user.id;
        const data = loadData();
        const managed = getManagedCompany(userId, data);
        const companyId = managed?.companyId;
        
        if (!managed) {
            await interaction.reply({ content: '❌ You do not own or direct a company!', ephemeral: true });
            return;
        }
        
        const company = managed.company;
        
        if (!FACTORIES[specName]) {
            await interaction.reply({ content: `❌ Unknown factory! Available: ${Object.keys(FACTORIES).join(', ')}`, ephemeral: true });
            return;
        }
        
        if (company.buildings && company.buildings[specName]) {
            await interaction.reply({ content: `❌ You already have a ${specName}!`, ephemeral: true });
            return;
        }
        
        const config = FACTORIES[specName];
        const cost = Math.floor(config.cost * getInflationMultiplier());
        
        if (company.funds < cost) {
            await interaction.reply({ content: `❌ Need ${formatMoney(cost)}! Have ${formatMoney(company.funds)}`, ephemeral: true });
            return;
        }
        
        if (!company.buildings) company.buildings = {};
        company.buildings[specName] = { level: 1, built_at: new Date().toISOString(), type: 'factory' };
        company.funds -= cost;
        data.companies[companyId] = company;
        saveData(data);
        const newPrice = updateCompanyPrice(companyId);
        
        const requiresText = Object.entries(config.requires).map(([r, qty]) => `• ${qty}x ${r}`).join('\n');
        const embed = new EmbedBuilder()
            .setTitle(`🏭 ${config.emoji} ${specName} Built!`)
            .setDescription(`**${company.name}** now has a ${specName}!`)
            .setColor(0x00FF00)
            .addFields(
                { name: 'Cost', value: formatMoney(cost), inline: true },
                { name: 'Produces', value: config.produces.join(', '), inline: true },
                { name: 'Requires per Cycle', value: requiresText, inline: false },
                { name: '📈 New Share Price', value: formatMoney(newPrice || 0), inline: true }
            )
            .setFooter({ text: 'Factory consumes resources when you -collect!' });
        
        await interaction.reply({ embeds: [embed] });
        return;
    }
});

// ============================================================
// BUTTON INTERACTION HANDLER (HIRE)
// ============================================================

client.on(Events.InteractionCreate, async interaction => {
    if (!interaction.isButton()) return;

    if (interaction.customId === 'found_company_open') {
        await interaction.showModal(buildCompanyModal());
        return;
    }

    if (!interaction.customId.startsWith('hire_')) return;
    
    const parts = interaction.customId.split('_');
    const action = parts[1];
    const targetId = parts[parts.length - 1];
    const companyId = parts.slice(2, -1).join('_');
    const userId = interaction.user.id;

    if (userId !== targetId) {
        await interaction.reply({ content: '❌ This job offer is not for you!', ephemeral: true });
        return;
    }

    if (action === 'accept') {
        const data = loadData();
        if (!data.companies[companyId]) {
            await interaction.reply({ content: '❌ This company no longer exists!', ephemeral: true });
            return;
        }
        const company = data.companies[companyId];
        const user = ensureUserRecord(data, userId);
        
        if (user.is_employed) {
            await interaction.reply({ content: '❌ You are already employed!', ephemeral: true });
            return;
        }
        
        user.is_employed = true;
        user.employed_at = company.name;
        user.ssr_region = company.hq_ssr || 'Unknown SSR';
        company.employees = (company.employees || 0) + 1;
        
        data.companies[companyId] = company;
        saveData(data);
        
        const embed = new EmbedBuilder()
            .setTitle('✅ You\'ve Been Hired!')
            .setDescription(`You are now employed at **${company.name}**!`)
            .setColor(0x00FF00)
            .addFields(
                { name: '🏢 Company', value: company.name, inline: true },
                { name: '📍 SSR Region', value: company.hq_ssr || 'Unknown', inline: true },
                { name: '👷 Employees', value: `${company.employees}`, inline: true }
            )
            .setFooter({ text: 'Use -work in your SSR region to start earning!' });
        
        await interaction.reply({ embeds: [embed] });
        await interaction.message.edit({ components: [] });
        
        try {
            const employerId = company.director_id || company.owner_id;
            const employer = await client.users.fetch(employerId);
            const employerEmbed = new EmbedBuilder()
                .setTitle('✅ Worker Hired!')
                .setDescription(`${interaction.user.mention} has accepted the job at **${company.name}**!`)
                .setColor(0x00FF00);
            await employer.send({ embeds: [employerEmbed] });
        } catch (err) {}
        
    } else if (action === 'decline') {
        const embed = new EmbedBuilder()
            .setTitle('❌ Offer Declined')
            .setDescription(`You have declined the job offer.`)
            .setColor(0xFF0000);
        
        await interaction.reply({ embeds: [embed] });
        await interaction.message.edit({ components: [] });
    }
});

// ============================================================
// DM MESSAGE HANDLER
// ============================================================

client.on(Events.MessageCreate, async message => {
    if (message.channel.type === 1) {
        if (message.author.bot) return;
        if (!isBotOwner(message.author.id)) {
            await message.reply('❌ This bot only accepts DMs from its owners.');
            return;
        }
    }
});

// ============================================================
// UNKNOWN COMMAND HANDLER
// ============================================================

client.on(Events.MessageCreate, async message => {
    if (message.author.bot) return;
    if (!message.content.startsWith('-')) return;
    
    const args = message.content.slice(1).trim().split(/ +/);
    const command = args.shift().toLowerCase();
    const validCommands = [
        'addbotowner', 'addmanager', 'addowner', 'adminlogs', 'aistore', 'appointdirector', 'appointmanager', 'audit', 'autotrade', 'bal',
        'balance', 'blacklist', 'botowners', 'build', 'buygsi', 'buyshares', 'cancelschedule', 'cancelschedulemarket',
        'changelogs', 'collect', 'collecttax', 'collecttaxes', 'companies', 'company', 'companygraph', 'companyinventory', 'companyrankings', 'companytrade',
        'consumption', 'consumptiongraph', 'craft', 'craftcompany', 'craftpersonal', 'daily', 'delmanager', 'delowner',
        'delspawnrate', 'demand', 'demandgraph', 'dep', 'deposit', 'econstats', 'employees', 'export',
        'exportoutside', 'factorydeal', 'fire', 'fiveyear', 'fiveyearplan', 'food', 'fooddemand', 'foodstatus', 'foreignsell', 'formstatecompanies',
        'foundcompany', 'globalcons', 'globalconsumption', 'globaldemand', 'goldrush', 'goldstandard', 'govcontract', 'gsi', 'gsigraph',
        'help', 'hire', 'inflation', 'inventory', 'invest', 'lb', 'leaderboard', 'leave',
        'listmanagers', 'listowners', 'listschedules', 'logs', 'managers', 'managers_add', 'managers_remove', 'map', 'market',
        'marketdemand', 'minwage', 'nationalminimumwage', 'owneradd', 'ownerlogs', 'ownerremove', 'owners', 'pay', 'paysalaries', 'paysalary', 'plan', 'portfolio',
        'printmoney', 'quit', 'quitjob', 'recipes', 'removebotowner', 'removedirector', 'removemanager', 'removeowner',
        'removeschedule', 'resetspawnrate', 'resetssrweight', 'resign', 'resources', 'runtaxes', 'salary', 'salaries', 'schedulemarket', 'schedules', 'scheduletrade',
        'sellgsi', 'sellitem', 'sellshares', 'serverconsumption', 'setfiveyearplan', 'setplan', 'setsalary', 'setsalaries', 'setspawnrate', 'setssrweight', 'setwage', 'setwagefood',
        'setweight', 'setworkfood', 'spawnrate', 'spawnrates', 'specialize', 'ssrtrade', 'ssrweights', 'store',
        'supply', 'supplygraph', 'tax', 'taxbrackets', 'taxes', 'taxinfo', 'trade', 'trademarket', 'trademenu', 'tradeschedules', 'tradeui', 'transferitem',
        'unblacklist', 'upgrade', 'viewspawnrates', 'with', 'withdraw', 'work', 'work_food', 'workfood',
        'world', 'worldmap'
    ];
    
    if (!validCommands.includes(command)) {
        await message.reply(`❌ Unknown command: ${command}. Use -help for a list of commands.`);
    }
});

// ============================================================
// LOGIN
// ============================================================

client.login(DISCORD_TOKEN);