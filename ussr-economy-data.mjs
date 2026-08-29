/**
 * USSR Economy Data - full replication of bot.js economic system for website
 * Generates in-memory mock data matching bot's calculations so website can show ALL graphs
 */
export const SSR_REGIONS = {
  "Russian SFSR": { role_id: "665697828403806209", work_zone: "1538704167890329621", emoji: "🇷🇺", resources: ["Coal", "Iron Ore", "Timber", "Oil", "Natural Gas", "Gold"] },
  "Byelorussian SSR": { role_id: "666027277770817546", work_zone: "1538703449095676016", emoji: "🇧🇾", resources: ["Timber", "Peat", "Potash", "Wheat", "Flax"] },
  "Ukrainian SSR": { role_id: "666026868201488424", work_zone: "1538703449095676016", emoji: "🇺🇦", resources: ["Coal", "Iron Ore", "Wheat", "Sunflower", "Corn", "Salt"] },
  "Moldavian SSR": { role_id: "666356420656234516", work_zone: "1538703449095676016", emoji: "🇲🇩", resources: ["Wheat", "Corn", "Sunflower", "Grapes", "Wine"] },
  "Estonian SSR": { role_id: "666356003826171904", work_zone: "1538704231249354772", emoji: "🇪🇪", resources: ["Oil Shale", "Timber", "Phosphorite", "Peat", "Fish"] },
  "Latvian SSR": { role_id: "666355999120031749", work_zone: "1538704231249354772", emoji: "🇱🇻", resources: ["Timber", "Peat", "Limestone", "Wheat", "Fish"] },
  "Lithuanian SSR": { role_id: "666355995764719626", work_zone: "1538704231249354772", emoji: "🇱🇹", resources: ["Timber", "Peat", "Clay", "Limestone", "Flax", "Fish"] },
  "Georgian SSR": { role_id: "666356425877880832", work_zone: "1538703028524285962", emoji: "🇬🇪", resources: ["Manganese", "Copper", "Gold", "Grapes", "Tea", "Citrus"] },
  "Armenian SSR": { role_id: "666356429652885587", work_zone: "1538703028524285962", emoji: "🇦🇲", resources: ["Copper", "Gold", "Molybdenum", "Aluminium"] },
  "Azerbaijanian SSR": { role_id: "666356432417062922", work_zone: "1538703028524285962", emoji: "🇦🇿", resources: ["Oil", "Natural Gas", "Iron Ore", "Cotton"] },
  "Kazakh SSR": { role_id: "666379508022116366", work_zone: "1538703181733695600", emoji: "🇰🇿", resources: ["Coal", "Iron Ore", "Copper", "Gold", "Uranium", "Oil", "Wheat"] },
  "Uzbek SSR": { role_id: "666379512896028672", work_zone: "1538703181733695600", emoji: "🇺🇿", resources: ["Gold", "Oil", "Copper", "Cotton", "Natural Gas", "Uranium"] },
  "Turkmen SSR": { role_id: "666379517455106119", work_zone: "1538703181733695600", emoji: "🇹🇲", resources: ["Oil", "Natural Gas", "Cotton", "Sulphur"] },
  "Nuristani SSR": { role_id: "666379522316304397", work_zone: "1538704555670245448", emoji: "🇹🇯", resources: ["Aluminium", "Lead", "Zinc", "Uranium", "Gold"] },
  "Kirghiz SSR": { role_id: "666379534282522654", work_zone: "1538703181733695600", emoji: "🇰🇬", resources: ["Gold", "Uranium", "Coal", "Iron Ore", "Timber"] }
};

export const WORK_ZONES = {
  "Russian Federal Republic Region": "1538704167890329621",
  "Western Soviet Region": "1538703449095676016",
  "Baltic Soviet Region": "1538704231249354772",
  "Caucasus Soviet Region": "1538703028524285962",
  "Central Asian Soviet Region": "1538703181733695600",
  "Nuristani Soviet Region": "1538704555670245448"
};

export const RESOURCE_VALUES = {
  "Gold": 150, "Oil": 64, "Copper": 32, "Coal": 16,
  "Lead": 40, "Uranium": 320, "Cotton": 24, "Iron Ore": 24,
  "Timber": 13, "Wheat": 8, "Limestone": 16, "Clay": 8,
  "Sand": 5, "Sugar": 10, "Potash": 56, "Peat": 13,
  "Natural Gas": 48, "Manganese": 96, "Oil Shale": 19,
  "Phosphorite": 40, "Aluminium Ore": 64, "Antimony": 128,
  "Molybdenum": 160, "Sunflower": 12, "Flax": 18,
  "Corn": 10, "Salt": 8, "Tea": 30, "Citrus": 20,
  "Grapes": 20, "Wine": 60, "Sulphur": 25, "Aluminium": 80,
  "Fish": 14
};

export const FOOD_VALUES = {
  "Fish": 2, "Wheat": 1, "Corn": 1, "Sunflower": 1, "Grapes": 1, "Tea": 1, "Citrus": 1,
  "Flour": 2, "Sugar": 1, "Bread": 3, "Cake": 3, "Wine": 2, "Canned Food": 4,
  "Canned Fish": 5, "Smoked Fish": 4, "Fish Stew": 5
};

export const CRAFTING_RECIPES = {
  "Iron Ingot": {"ingredients": {"Iron Ore": 3, "Coal": 2}, "value": 40, "emoji": "🔩"},
  "Steel Ingot": {"ingredients": {"Iron Ingot": 2, "Coal": 3}, "value": 80, "emoji": "⚙️"},
  "Copper Ingot": {"ingredients": {"Copper": 3, "Coal": 2}, "value": 48, "emoji": "🟠"},
  "Gold Bar": {"ingredients": {"Gold": 3}, "value": 560, "emoji": "🥇"},
  "Aluminium Ingot": {"ingredients": {"Aluminium Ore": 3, "Coal": 2}, "value": 55, "emoji": "🔘"},
  "Timber Planks": {"ingredients": {"Timber": 3}, "value": 16, "emoji": "🪵"},
  "Bricks": {"ingredients": {"Clay": 3, "Coal": 2}, "value": 29, "emoji": "🧱"},
  "Concrete": {"ingredients": {"Limestone": 4, "Sand": 2}, "value": 40, "emoji": "🏗️"},
  "Glass": {"ingredients": {"Limestone": 3, "Coal": 2}, "value": 32, "emoji": "🪟"},
  "Steel Beam": {"ingredients": {"Steel Ingot": 4}, "value": 128, "emoji": "📏"},
  "Machine Parts": {"ingredients": {"Iron Ingot": 3, "Steel Ingot": 2}, "value": 72, "emoji": "🔧"},
  "Fuel": {"ingredients": {"Oil": 3}, "value": 64, "emoji": "⛽"},
  "Refined Fuel": {"ingredients": {"Fuel": 2}, "value": 128, "emoji": "🔥"},
  "Uranium Rod": {"ingredients": {"Uranium": 3, "Lead": 2}, "value": 256, "emoji": "☢️"},
  "Reactor Core": {"ingredients": {"Uranium Rod": 2, "Steel Beam": 3, "Machine Parts": 2}, "value": 800, "emoji": "⚛️"},
  "Circuit Board": {"ingredients": {"Copper Ingot": 3, "Lead": 2}, "value": 88, "emoji": "💻"},
  "Flour": {"ingredients": {"Wheat": 3}, "value": 25, "emoji": "🌾"},
  "Sugar": {"ingredients": {"Sugar": 2}, "value": 20, "emoji": "🍬"},
  "Bread": {"ingredients": {"Flour": 2, "Sugar": 1}, "value": 45, "emoji": "🍞"},
  "Cake": {"ingredients": {"Flour": 3, "Sugar": 3, "Wheat": 2}, "value": 80, "emoji": "🎂"},
  "Wine": {"ingredients": {"Grapes": 4}, "value": 60, "emoji": "🍷"},
  "Canned Food": {"ingredients": {"Wheat": 3, "Iron Ore": 2}, "value": 48, "emoji": "🥫"},
  "Canned Fish": {"ingredients": {"Fish": 2, "Iron Ore": 2}, "value": 62, "emoji": "🐟"},
  "Smoked Fish": {"ingredients": {"Fish": 2, "Coal": 2}, "value": 48, "emoji": "🔥🐟"},
  "Fish Stew": {"ingredients": {"Fish": 2, "Wheat": 2, "Salt": 1}, "value": 55, "emoji": "🍲"}
};

export const MINES = {
  "Iron Mine": {"cost": 15000, "upgrade_mult": 2.0, "emoji": "⛏️", "produces": ["Iron Ore"], "rate": 2, "max_level": 10},
  "Coal Mine": {"cost": 12000, "upgrade_mult": 2.0, "emoji": "🪨", "produces": ["Coal"], "rate": 3, "max_level": 10},
  "Copper Mine": {"cost": 18000, "upgrade_mult": 2.0, "emoji": "🟫", "produces": ["Copper"], "rate": 2, "max_level": 10},
  "Gold Mine": {"cost": 50000, "upgrade_mult": 2.5, "emoji": "💎", "produces": ["Gold"], "rate": 1, "max_level": 8, "rare": true},
  "Uranium Mine": {"cost": 60000, "upgrade_mult": 2.5, "emoji": "☢️", "produces": ["Uranium"], "rate": 1, "max_level": 8, "rare": true},
  "Oil Rig": {"cost": 45000, "upgrade_mult": 2.0, "emoji": "🛢️", "produces": ["Oil", "Natural Gas"], "rate": 2, "max_level": 10},
  "Timber Camp": {"cost": 10000, "upgrade_mult": 1.8, "emoji": "🌲", "produces": ["Timber"], "rate": 3, "max_level": 10},
  "Farm": {"cost": 12000, "upgrade_mult": 1.8, "emoji": "🌾", "produces": ["Wheat", "Sugar"], "rate": 3, "max_level": 10}
};

export const FACTORIES = {
  "Steel Mill": {"cost": 50000, "upgrade_mult": 2.0, "emoji": "🏭", "produces": ["Steel Ingot"], "requires": {"Iron Ore": 2, "Coal": 3}, "rate": 2, "max_level": 10},
  "Machine Shop": {"cost": 45000, "upgrade_mult": 2.0, "emoji": "🔩", "produces": ["Machine Parts"], "requires": {"Steel Ingot": 2, "Iron Ore": 3}, "rate": 2, "max_level": 10},
  "Refinery": {"cost": 55000, "upgrade_mult": 2.0, "emoji": "🛢️", "produces": ["Fuel"], "requires": {"Oil": 3}, "rate": 2, "max_level": 10},
  "Nuclear Processing": {"cost": 100000, "upgrade_mult": 2.5, "emoji": "⚛️", "produces": ["Uranium Rod"], "requires": {"Uranium": 2, "Lead": 2}, "rate": 1, "max_level": 8},
  "Electronics Factory": {"cost": 60000, "upgrade_mult": 2.0, "emoji": "💻", "produces": ["Circuit Board"], "requires": {"Copper Ingot": 3, "Lead": 2}, "rate": 2, "max_level": 10},
  "Bakery": {"cost": 30000, "upgrade_mult": 1.8, "emoji": "🍞", "produces": ["Bread", "Cake"], "requires": {"Wheat": 3, "Sugar": 2}, "rate": 3, "max_level": 10},
  "Winery": {"cost": 35000, "upgrade_mult": 1.8, "emoji": "🍷", "produces": ["Wine"], "requires": {"Grapes": 4}, "rate": 2, "max_level": 10}
};

export const STORE = {"cost": 25000, "upgrade_mult": 1.5, "emoji": "🏪", "rate": 3, "max_level": 10};

export const SPECIALIZATIONS = {
  extraction: { label: 'Extraction', emoji: '⛏️', desc: 'Mines & oil rigs +25% output' },
  agriculture: { label: 'Agriculture', emoji: '🌾', desc: 'Farms & timber +25%' },
  production: { label: 'Production', emoji: '🏭', desc: 'Factories +25% & +15% sale price' }
};

// Helpers matching bot.js exactly
export function getGoldPrice(inflation) { return Math.max(1, Math.floor(RESOURCE_VALUES.Gold * (1 + inflation / 100))); }
export function getGoldBackingRatio(goldStock, moneySupply, inflation) {
  const goldValue = goldStock * getGoldPrice(inflation);
  return (goldValue / Math.max(1, moneySupply)) * 100;
}
export function getSupplyFactor(supply) {
  const factor = 1.35 - (Math.min(supply, 120) / 120) * 0.75;
  return Math.max(0.6, Math.min(1.4, factor));
}
export function getBalancedDemandTarget(supply, employed) {
  const ideal = Math.max(1, employed) * 2.5;
  const ratio = supply / Math.max(1, ideal);
  let target = 1.4 - Math.min(ratio, 2.0) * 0.4;
  return Math.max(0.6, Math.min(1.4, target));
}

// Generate synthetic economy_data.json equivalent
function seededRandom(seed) {
  let x = Math.sin(seed) * 10000;
  return x - Math.floor(x);
}

export function generateMockEconomy() {
  const now = Date.now();
  // GSI history - 100 points drifting with random events
  const gsiHistory = [];
  let price = 100;
  for (let i = 0; i < 100; i++) {
    const drift = (Math.random() * 2 - 1) * 0.015 + (Math.random() < 0.06 ? (Math.random() * 0.14 - 0.07) : 0);
    price = Math.max(1, Math.floor(price * (1 + drift)));
    gsiHistory.push({
      price,
      change_percent: +(drift * 100).toFixed(2),
      recorded_at: new Date(now - (100 - i) * 3600000).toISOString()
    });
  }
  gsiHistory[0].change_percent = 0;
  gsiHistory[0].price = 100;

  // Inflation history 100 points 0-12%
  const inflationHistory = [];
  let infl = 2.4;
  for (let i = 0; i < 100; i++) {
    infl += (Math.random() - 0.48) * 0.6;
    infl = Math.max(0, Math.min(42, infl));
    inflationHistory.push(+infl.toFixed(2));
  }
  const inflation = inflationHistory[inflationHistory.length - 1];
  const moneyPrinted = Math.floor(420000 + inflation * 18000 + Math.random() * 50000);
  const totalBankReserves = Math.floor(900000 + Math.random() * 300000);

  // Companies - 6 state + 8 private mock
  const stateCompanies = [
    { name: "State Nuclear Energy", ticker: "SNE", spec: "extraction", hq_ssr: "Russian SFSR", employees: 18, funds: 240000, share_price: 420, wage: 22 },
    { name: "Soviet Steel Works", ticker: "SSW", spec: "production", hq_ssr: "Ukrainian SSR", employees: 24, funds: 310000, share_price: 380, wage: 20 },
    { name: "State Oil & Gas", ticker: "SOG", spec: "extraction", hq_ssr: "Azerbaijanian SSR", employees: 16, funds: 280000, share_price: 510, wage: 24 },
    { name: "Soviet Agriculture", ticker: "SAG", spec: "agriculture", hq_ssr: "Kazakh SSR", employees: 14, funds: 180000, share_price: 260, wage: 18 },
    { name: "State Mining Corp", ticker: "SMC", spec: "extraction", hq_ssr: "Nuristani SSR", employees: 20, funds: 350000, share_price: 610, wage: 25 },
    { name: "Baltic Timber & Harbour Co", ticker: "BTH", spec: "agriculture", hq_ssr: "Estonian SSR", employees: 12, funds: 160000, share_price: 220, wage: 17 }
  ];
  const privateCompanies = [
    { name: "Red Star Steelworks", ticker: "RSS", spec: "production", hq_ssr: "Ukrainian SSR", employees: 9, funds: 95000, share_price: 180 },
    { name: "Ural Heavy Industries", ticker: "UHI", spec: "extraction", hq_ssr: "Russian SFSR", employees: 11, funds: 120000, share_price: 210 },
    { name: "Volga Shipbuilding", ticker: "VSB", spec: "production", hq_ssr: "Russian SFSR", employees: 7, funds: 78000, share_price: 145 },
    { name: "Siberian Mining Co", ticker: "SMN", spec: "extraction", hq_ssr: "Nuristani SSR", employees: 13, funds: 140000, share_price: 260 },
    { name: "Lenin Machine Works", ticker: "LMW", spec: "production", hq_ssr: "Byelorussian SSR", employees: 8, funds: 88000, share_price: 165 },
    { name: "Caspian Drilling", ticker: "CDR", spec: "extraction", hq_ssr: "Turkmen SSR", employees: 6, funds: 67000, share_price: 135 },
    { name: "Daugava Timber", ticker: "DGT", spec: "agriculture", hq_ssr: "Latvian SSR", employees: 5, funds: 52000, share_price: 110 },
    { name: "Tbilisi Vineyards", ticker: "TBV", spec: "agriculture", hq_ssr: "Georgian SSR", employees: 4, funds: 43000, share_price: 95 }
  ];
  const allCompanies = [...stateCompanies, ...privateCompanies].map((c, idx) => {
    const priceHistory = [];
    let p = c.share_price;
    for (let i = 0; i < 100; i++) {
      p = Math.max(1, Math.floor(p * (1 + (Math.random() * 0.08 - 0.04))));
      priceHistory.push(p);
    }
    priceHistory[0] = Math.floor(c.share_price * 0.6);
    // buildings mock
    const buildings = {};
    if (c.spec === "extraction") { buildings["Iron Mine"] = { level: 3 }; buildings["Oil Rig"] = { level: 2 }; }
    if (c.spec === "agriculture") { buildings["Farm"] = { level: 4 }; buildings["Timber Camp"] = { level: 2 }; }
    if (c.spec === "production") { buildings["Steel Mill"] = { level: 3 }; buildings["Machine Shop"] = { level: 2 }; }
    buildings["Store"] = { level: 2 };
    // inventory mock — seed 200 Wheat (200🍞) per company so food not weird/starving
    const inventory = { "Wheat": 200 };
    const items = Object.keys(CRAFTING_RECIPES);
    for (let k = 0; k < 5; k++) {
      const item = items[Math.floor(Math.random() * items.length)];
      inventory[item] = (inventory[item]||0) + Math.floor(Math.random() * 24) + 2;
    }
    // raw resources too
    const resources = ["Iron Ore", "Coal", "Oil", "Wheat", "Timber", "Fish", "Gold"];
    for (let k = 0; k < 3; k++) {
      const r = resources[Math.floor(Math.random() * resources.length)];
      inventory[r] = (inventory[r]||0) + Math.floor(Math.random() * 40) + 5;
    }

    const is_state = idx < 6;
    return {
      id: `comp_${idx}`,
      name: c.name,
      ticker: c.ticker,
      specialization: c.spec,
      hq_ssr: c.hq_ssr,
      employees: c.employees,
      funds: c.funds,
      share_price: priceHistory[priceHistory.length - 1],
      price_history: priceHistory,
      market_cap: priceHistory[priceHistory.length - 1] * 1000,
      buildings,
      inventory,
      is_state_owned: is_state,
      shares_total: 1000,
      shares_available: is_state ? 0 : Math.floor(Math.random() * 400),
      ceo: is_state ? "State Appointed" : `Comrade_${idx}`,
      wage: c.wage || 18
    };
  });

  // Market demand/supply
  const market_demand = {};
  const market_supply = {};
  const employedTotal = allCompanies.reduce((s, c) => s + c.employees, 0);
  for (const item of Object.keys(CRAFTING_RECIPES)) {
    let supply = 0;
    for (const c of allCompanies) supply += c.inventory[item] || 0;
    market_supply[item] = supply;
    // demand balanced target + small noise
    const target = getBalancedDemandTarget(supply, employedTotal);
    market_demand[item] = +(target + (Math.random() * 0.12 - 0.06)).toFixed(3);
    market_demand[item] = Math.max(0.6, Math.min(1.5, market_demand[item]));
  }

  // demand_history 60 points per item
  const demand_history = {};
  for (const item of Object.keys(CRAFTING_RECIPES).slice(0, 8)) {
    demand_history[item] = [];
    let d = market_demand[item];
    for (let i = 0; i < 60; i++) {
      d += (Math.random() * 0.08 - 0.04);
      d = Math.max(0.6, Math.min(1.5, d));
      demand_history[item].push({ demand: +d.toFixed(3), at: new Date(now - (60 - i) * 600000).toISOString(), supply: Math.floor(Math.random() * 80) });
    }
  }

  // AI store
  const ai_store = {};
  for (const item of Object.keys(CRAFTING_RECIPES)) {
    if (Math.random() < 0.55) ai_store[item] = Math.floor(Math.random() * 48) + 1;
  }

  // Global consumption
  const global_consumption = {};
  for (const item of Object.keys(CRAFTING_RECIPES)) {
    if (Math.random() < 0.6) global_consumption[item] = Math.floor(Math.random() * 220) + 5;
  }
  const consumption_history = Object.entries(global_consumption).flatMap(([item, qty]) =>
    Array.from({ length: 6 }, (_, i) => ({ item, qty: Math.floor(qty * (0.6 + Math.random() * 0.7)), at: new Date(now - i * 3600000).toISOString() }))
  );

  // Gold standard
  const goldStock = 420 + Math.floor(Math.random() * 380); // raw gold units
  const goldPrice = getGoldPrice(inflation);
  const moneySupply = totalBankReserves + moneyPrinted + allCompanies.reduce((s, c) => s + c.funds, 0);
  const goldBacking = getGoldBackingRatio(goldStock, moneySupply, inflation);
  const goldStatus = goldBacking >= 100 ? "FULL GOLD STANDARD" : goldBacking >= 50 ? "PARTIAL GOLD BACKING" : goldBacking >= 20 ? "WEAK BACKING" : "FIAT CURRENCY";

  // World map / food per region
  const census = {};
  for (const ssr of Object.keys(SSR_REGIONS)) census[ssr] = Math.floor(Math.random() * 18) + 3;
  const regions = {};
  for (const [region, zone] of Object.entries(WORK_ZONES)) {
    const ssrs = Object.entries(SSR_REGIONS).filter(([, v]) => v.work_zone === zone).map(([k]) => k);
    const pop = ssrs.reduce((s, k) => s + (census[k] || 0), 0);
    const regionCompanies = allCompanies.filter(c => SSR_REGIONS[c.hq_ssr]?.work_zone === zone);
    const employees = regionCompanies.reduce((s, c) => s + c.employees, 0);
    let foodStock = 0;
    for (const c of regionCompanies) {
      for (const [item, qty] of Object.entries(c.inventory)) {
        const fv = FOOD_VALUES[item];
        if (fv) foodStock += qty * fv;
      }
    }
    const demand = Math.max(4, Math.ceil(Math.max(1, employees) * 1 + pop * 0.2)); // balanced: was 2 + 0.5
    regions[region] = { ssrs, pop, employees, companies: regionCompanies.length, foodStock, foodDemand: demand, zone, foodRatio: foodStock / Math.max(1, demand) };
  }

  return {
    gsi_history: gsiHistory,
    inflation_history: inflationHistory,
    inflation,
    money_printed: moneyPrinted,
    total_bank_reserves: totalBankReserves,
    companies: allCompanies,
    market_demand,
    market_supply,
    demand_history,
    ai_store,
    global_consumption,
    consumption_history,
    gold: { price: goldPrice, stock: goldStock, moneySupply, backing: +goldBacking.toFixed(2), status: goldStatus },
    census,
    regions,
    ssr_regions: SSR_REGIONS,
    work_zones: WORK_ZONES,
    resource_values: RESOURCE_VALUES,
    crafting_recipes: CRAFTING_RECIPES,
    mines: MINES,
    factories: FACTORIES,
    generated_at: new Date().toISOString()
  };
}

// cache singleton with periodic jitter to feel live
let cached = null;
let cachedAt = 0;
export function getEconomySnapshot() {
  if (!cached || Date.now() - cachedAt > 10000) {
    cached = generateMockEconomy();
    cachedAt = Date.now();
  }
  return cached;
}
