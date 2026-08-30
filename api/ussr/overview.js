import fs from 'fs';
import path from 'path';

export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  res.setHeader("Cache-Control", "no-store");
  if (req.method === "OPTIONS") return res.status(200).end();

  // Helper to build snapshot from bot data
  function buildSnapshot(bot) {
        const RV={ Gold:150, "Iron Ore":24, Coal:16, Oil:64, "Natural Gas":48, Timber:13, Wheat:8, Fish:14, Copper:32, Lead:40, Uranium:320, Limestone:16, Clay:8, Sugar:10, Peat:13, Manganese:96, Phosphorite:40, "Aluminium Ore":64, Antimony:128, Molybdenum:160, Sunflower:12, Flax:18, Corn:10, Salt:8, Tea:30, Citrus:20, Grapes:20, Wine:60, Sulphur:25, Sulfur:25, Aluminium:80, Cotton:24, Potash:56, "Oil Shale":19, Zinc:38, Amber:75 };
        const REC={
          "Iron Ingot":{value:143,ingredients:{"Iron Ore":3,Coal:2}},"Steel Ingot":{value:337,ingredients:{"Iron Ingot":2,Coal:3}},
          "Copper Ingot":{value:173,ingredients:{Copper:3,Coal:2}},"Gold Bar":{value:586,ingredients:{Gold:3}},
          "Aluminium Ingot":{value:296,ingredients:{"Aluminium Ore":3,Coal:2}},"Timber Planks":{value:59,ingredients:{Timber:3}},
          "Bricks":{value:81,ingredients:{Clay:3,Coal:2}},"Concrete":{value:104,ingredients:{Limestone:4,Sand:2}},
          "Glass":{value:112,ingredients:{Limestone:3,Coal:2}},"Steel Beam":{value:1320,ingredients:{"Steel Ingot":4}},
          "Machine Parts":{value:1064,ingredients:{"Iron Ingot":3,"Steel Ingot":2}},"Fuel":{value:255,ingredients:{Oil:3}},
          "Refined Fuel":{value:501,ingredients:{Fuel:2}},"Uranium Rod":{value:1341,ingredients:{Uranium:3,Lead:2}},
          "Reactor Core":{value:8714,ingredients:{"Uranium Rod":2,"Steel Beam":3,"Machine Parts":2}},"Circuit Board":{value:603,ingredients:{"Copper Ingot":3,Lead:2}},
          "Flour":{value:40,ingredients:{Wheat:3}},"Bread":{value:84,ingredients:{Flour:2,Sugar:1}},"Cake":{value:161,ingredients:{Flour:3,Sugar:3,Wheat:2}},
          "Wine":{value:86,ingredients:{Grapes:4}},"Canned Food":{value:102,ingredients:{Wheat:3,"Iron Ore":2}},"Canned Fish":{value:107,ingredients:{Fish:2,"Iron Ore":2}},
          "Smoked Fish":{value:86,ingredients:{Fish:2,Coal:2}},"Fish Stew":{value:76,ingredients:{Fish:2,Wheat:2,Salt:1}},
          "Peat Fuel":{value:97,ingredients:{Peat:4,Coal:1}},"Shale Oil":{value:95,ingredients:{"Oil Shale":4}},"Gas Fuel":{value:194,ingredients:{"Natural Gas":3}},"Fertilizer":{value:177,ingredients:{Phosphorite:2,Peat:2,Sulphur:1}},
          "Cotton Fabric":{value:102,ingredients:{Cotton:3}},"Manganese Alloy":{value:409,ingredients:{Manganese:2,"Iron Ingot":1,Coal:1}},
          "Sunflower Oil":{value:56,ingredients:{Sunflower:3}},"Linen":{value:79,ingredients:{Flax:3}},"Corn Meal":{value:48,ingredients:{Corn:3}},
          "Tea Pack":{value:99,ingredients:{Tea:2,Sugar:1}},"Citrus Juice":{value:99,ingredients:{Citrus:3,Sugar:1}},
          "Antimony Alloy":{value:440,ingredients:{Antimony:2,Lead:2}},"Molybdenum Rod":{value:747,ingredients:{Molybdenum:2,"Steel Ingot":1}},"Aluminium Sheet":{value:235,ingredients:{Aluminium:2,Coal:1}}
        };
        const SSR={
          "Russian SFSR":{emoji:"🇷🇺",work_zone:"1538704167890329621",resources:["Coal","Iron Ore","Timber","Oil","Natural Gas","Gold"]},
          "Byelorussian SSR":{emoji:"🇧🇾",work_zone:"1538703449095676016",resources:["Timber","Peat","Wheat","Flax"]},
          "Ukrainian SSR":{emoji:"🇺🇦",work_zone:"1538703449095676016",resources:["Coal","Iron Ore","Wheat","Sunflower","Corn","Salt"]},
          "Moldavian SSR":{emoji:"🇲🇩",work_zone:"1538703449095676016",resources:["Wheat","Corn","Sunflower","Grapes","Wine"]},
          "Estonian SSR":{emoji:"🇪🇪",work_zone:"1538704231249354772",resources:["Timber","Phosphorite","Peat","Fish","Oil Shale"]},
          "Latvian SSR":{emoji:"🇱🇻",work_zone:"1538704231249354772",resources:["Timber","Peat","Limestone","Wheat","Fish"]},
          "Lithuanian SSR":{emoji:"🇱🇹",work_zone:"1538704231249354772",resources:["Timber","Peat","Clay","Limestone","Flax","Fish"]},
          "Georgian SSR":{emoji:"🇬🇪",work_zone:"1538703028524285962",resources:["Manganese","Copper","Gold","Grapes","Tea","Citrus","Antimony"]},
          "Armenian SSR":{emoji:"🇦🇲",work_zone:"1538703028524285962",resources:["Copper","Gold","Molybdenum","Aluminium Ore"]},
          "Azerbaijanian SSR":{emoji:"🇦🇿",work_zone:"1538703028524285962",resources:["Oil","Natural Gas","Iron Ore","Cotton"]},
          "Kazakh SSR":{emoji:"🇰🇿",work_zone:"1538703181733695600",resources:["Coal","Iron Ore","Copper","Gold","Uranium","Oil","Wheat"]},
          "Uzbek SSR":{emoji:"🇺🇿",work_zone:"1538703181733695600",resources:["Gold","Oil","Copper","Cotton","Natural Gas","Uranium"]},
          "Turkmen SSR":{emoji:"🇹🇲",work_zone:"1538703181733695600",resources:["Oil","Natural Gas","Cotton","Sulphur","Sand"]},
          "Nuristani SSR":{emoji:"🇹🇯",work_zone:"1538704555670245448",resources:["Aluminium Ore","Lead","Zinc","Uranium","Gold"]},
          "Kirghiz SSR":{emoji:"🇰🇬",work_zone:"1538703181733695600",resources:["Gold","Uranium","Coal","Iron Ore","Timber"]}
        };
        const WZ={"Russian Federal Republic Region":"1538704167890329621","Western Soviet Region":"1538703449095676016","Baltic Soviet Region":"1538704231249354772","Caucasus Soviet Region":"1538703028524285962","Central Asian Soviet Region":"1538703181733695600","Nuristani Soviet Region":"1538704555670245448"};
        const gsi = Array.isArray(bot.gsi_history) && bot.gsi_history.length ? bot.gsi_history : null;
        const inflHist = Array.isArray(bot.inflation_history) && bot.inflation_history.length ? bot.inflation_history : null;
        const inflation = typeof bot.inflation === "number" ? bot.inflation : (inflHist ? inflHist[inflHist.length-1] : 3.1);
        const money_printed = bot.money_printed || 420000;
        const total_bank_reserves = bot.total_bank_reserves || 900000;
        let companies = [];
        if (bot.companies && typeof bot.companies === "object") {
          const isArray = Array.isArray(bot.companies);
          const entries = isArray ? bot.companies : Object.entries(bot.companies);
          companies = entries.map(([id, c]) => {
            const comp = isArray ? c : c;
            const cid = isArray ? comp.id || id : id;
            const price = comp.share_price || comp.price || 100;
            const hist = Array.isArray(comp.price_history) && comp.price_history.length ? comp.price_history : Array.from({length:100},()=>price);
            return {
              id: cid,
              name: comp.name || cid,
              ticker: comp.ticker || cid.slice(0,3).toUpperCase(),
              specialization: comp.specialization || null,
              hq_ssr: comp.hq_ssr || comp.hq || "Russian SFSR",
              employees: comp.employees || 0,
              funds: comp.funds || 0,
              share_price: price,
              price_history: hist,
              market_cap: comp.market_cap || price * (comp.shares_total||1000),
              buildings: comp.buildings || {},
              inventory: comp.inventory || {},
              is_state_owned: !!comp.is_state_owned,
              shares_total: comp.shares_total || 1000,
              wage: comp.wage || 18
            };
          });
        }
        if (!companies.length) {
          const base=[
            {name:"State Nuclear Energy",ticker:"SNE",spec:"extraction",ssr:"Russian SFSR",emp:18,funds:240000,price:420},
            {name:"Soviet Steel Works",ticker:"SSW",spec:"production",ssr:"Ukrainian SSR",emp:24,funds:310000,price:380},
            {name:"State Oil & Gas",ticker:"SOG",spec:"extraction",ssr:"Azerbaijanian SSR",emp:16,funds:280000,price:510},
            {name:"Soviet Agriculture",ticker:"SAG",spec:"agriculture",ssr:"Kazakh SSR",emp:14,funds:180000,price:260},
            {name:"State Mining Corp",ticker:"SMC",spec:"extraction",ssr:"Nuristani SSR",emp:20,funds:350000,price:610},
            {name:"Baltic Timber & Harbour Co",ticker:"BTH",spec:"agriculture",ssr:"Estonian SSR",emp:12,funds:160000,price:220}
          ];
          companies = base.map((c,idx)=>{
            const hist=[]; let pr=c.price; for(let i=0;i<100;i++){ pr=Math.max(1,Math.floor(pr*(1+(Math.random()*0.07-0.035)))); hist.push(pr);} 
            return {id:"comp_"+idx,name:c.name,ticker:c.ticker,specialization:c.spec,hq_ssr:c.ssr,employees:c.emp,funds:c.funds,share_price:hist[hist.length-1],price_history:hist,market_cap:hist[hist.length-1]*1000,buildings:{"Store":{level:2}},inventory:{},is_state_owned:true,shares_total:1000,wage:18}
          });
        }
        const market_demand = bot.market_demand && Object.keys(bot.market_demand).length ? bot.market_demand : null;
        const market_supply = {};
        if (market_demand) {
          for(const k of Object.keys(market_demand)){
            let sup=0; companies.forEach(c=> sup+=(c.inventory[k]||0));
            market_supply[k]=sup;
          }
        }
        const demand_history = bot.demand_history && Object.keys(bot.demand_history).length ? bot.demand_history : null;
        const ai_store = bot.ai_store || {};
        const global_consumption = bot.global_consumption || {};
        const goldPrice=Math.max(1,Math.floor(RV.Gold*(1+inflation/100)));
        let goldStock = 0;
        if (bot.users) {
          for(const u of Object.values(bot.users)){
            goldStock += (u.resources && u.resources.Gold) || 0;
            goldStock += ((u.inventory && u.inventory["Gold Bar"]) || 0) * 3;
          }
        }
        for(const c of companies){ goldStock += (c.inventory && c.inventory.Gold) || 0; goldStock += ((c.inventory && c.inventory["Gold Bar"]) || 0)*3; }
        if (!goldStock) goldStock = 420 + Math.floor(Math.random()*380);
        let moneySupply = total_bank_reserves + money_printed;
        for(const c of companies) moneySupply += c.funds || 0;
        if (bot.users) for(const u of Object.values(bot.users)) moneySupply += (u.cash||0)+(u.bank||0);
        const backing=(goldStock*goldPrice/Math.max(1,moneySupply))*100;
        const status=backing>=100?"FULL GOLD STANDARD":backing>=50?"PARTIAL":backing>=20?"WEAK":"FIAT";
        const census={}; Object.keys(SSR).forEach(k=> census[k]=Math.floor(Math.random()*14)+4);
        const regions={};
        for(const [reg,zone] of Object.entries(WZ)){
          const ssrs=Object.entries(SSR).filter(([,v])=> v.work_zone===zone).map(([k])=>k);
          const pop=ssrs.reduce((s,k)=> s+(census[k]||0),0);
          const rc=companies.filter(c=> SSR[c.hq_ssr]?.work_zone===zone);
          const emp=rc.reduce((s,c)=> s+c.employees,0);
          let food=0; rc.forEach(c=>{ Object.entries(c.inventory||{}).forEach(([it,qty])=>{ const fv={Fish:2,Wheat:1,Corn:1,Sunflower:1,Grapes:1,Tea:1,Citrus:1,Flour:2,Sugar:1,Bread:3,Cake:3,Wine:2,"Canned Food":4,"Canned Fish":5,"Smoked Fish":4,"Fish Stew":5,"Sunflower Oil":1,"Corn Meal":2,"Tea Pack":1,"Citrus Juice":2}[it]; if(fv) food+= qty*fv; }); });
          const dem=Math.max(4, Math.ceil(Math.max(1,emp)*1 + pop*0.2));
          regions[reg]={ssrs,pop,employees:emp,companies:rc.length,foodStock:food,foodDemand:dem,zone,foodRatio:food/Math.max(1,dem)}
        }
        let finalGsi = gsi;
        if (!finalGsi) {
          finalGsi=[]; let p0=100; const now=Date.now(); for(let i=0;i<100;i++){ const d=(Math.random()*2-1)*0.015; p0=Math.max(1,Math.floor(p0*(1+d))); finalGsi.push({price:p0, change_percent:+(d*100).toFixed(2), recorded_at:new Date(now-(100-i)*3600000).toISOString()}); } finalGsi[0].change_percent=0;
        }
        let finalInfl = inflHist;
        if (!finalInfl) { finalInfl=[]; let inf2=inflation; for(let i=0;i<100;i++){ inf2+=(Math.random()-0.49)*0.7; inf2=Math.max(0,Math.min(42,inf2)); finalInfl.push(+inf2.toFixed(2)); } }
        const finalDemandHist = demand_history || {};
        if (!Object.keys(finalDemandHist).length) {
          for(const k of Object.keys(REC).slice(0,8)){
            const baseD = (market_demand && market_demand[k]) || 0.9;
            finalDemandHist[k]=Array.from({length:60},(_,i)=>({demand:+(baseD+(Math.random()*0.06-0.03)).toFixed(3), at:new Date(Date.now()-(60-i)*600000).toISOString(), supply:20}));
          }
        }
        const finalMarketDemand = market_demand || Object.fromEntries(Object.keys(REC).map(k=>[k, +(0.9+Math.random()*0.4).toFixed(3)]));
        const finalMarketSupply = Object.keys(finalMarketDemand).length ? market_supply : Object.fromEntries(Object.keys(REC).map(k=>[k, Math.floor(Math.random()*80)]));
        return {
          gsi_history: finalGsi,
          inflation_history: finalInfl,
          inflation,
          money_printed,
          total_bank_reserves,
          companies,
          market_demand: finalMarketDemand,
          market_supply: finalMarketSupply,
          demand_history: finalDemandHist,
          ai_store,
          global_consumption,
          consumption_history: bot.consumption_history || [],
          gold:{price:goldPrice,stock:goldStock,moneySupply,backing:+backing.toFixed(2),status},
          census, regions, ssr_regions:SSR, work_zones:WZ, resource_values:RV,
          crafting_recipes: Object.fromEntries(Object.entries(REC).map(([k,v])=>[k,{value:v.value,ingredients:v.ingredients,emoji:"■"}])),
          mines:{}, factories:{}, generated_at: new Date().toISOString(), _source:"github-live",
          ssr_resource_weights: bot.ssr_resource_weights || {},
          compensation_log: bot.compensation_log || [],
          top_workers: Object.entries(bot.users||{}).map(([id,u])=>({id, username:u.username||id.slice(0,6), work_count:u.work_count||0, ssr_region:u.ssr_region, employed_at:u.employed_at})).filter(u=>u.work_count>0).sort((a,b)=>b.work_count-a.work_count).slice(0,5)
        };
  }

  // 1) Try local bundled economy_data.json (Vercel includes it)
  try {
    const localPath = path.join(process.cwd(), 'economy_data.json');
    if (fs.existsSync(localPath)) {
      const raw = fs.readFileSync(localPath, 'utf8');
      const bot = JSON.parse(raw);
      if (bot && (bot.gsi_history || bot.companies)) {
        // check if stale — if older than 1h, still prefer GitHub
        const age = Date.now() - new Date(bot.gsi_history?.[bot.gsi_history.length-1]?.recorded_at || 0).getTime();
        if (age < 3600000) {
          const snap = buildSnapshot(bot);
          snap._source = "local-bundled";
          res.status(200).json(snap);
          return;
        }
      }
    }
  } catch(e) { console.error("local read failed", e.message); }

  // 2) Try GitHub live
  try {
    const ghUrl = process.env.GITHUB_ECONOMY_URL || "https://raw.githubusercontent.com/HyawiiGithub/USSR-stock/main/economy_data.json";
    const gh = await fetch(ghUrl + "?t=" + Date.now(), { signal: AbortSignal.timeout(3500) });
    if (gh.ok) {
      const bot = await gh.json();
      if (bot && (bot.gsi_history || bot.companies)) {
        const snap = buildSnapshot(bot);
        res.status(200).json(snap);
        return;
      }
    }
  } catch(e) {
    console.error("github fetch failed", e.message);
  }

  // 3) Check local again even if stale
  try {
    const localPath2 = path.join(process.cwd(), 'economy_data.json');
    if (fs.existsSync(localPath2)) {
      const raw2 = fs.readFileSync(localPath2, 'utf8');
      const bot2 = JSON.parse(raw2);
      if (bot2 && (bot2.gsi_history || bot2.companies)) {
        const snap2 = buildSnapshot(bot2);
        snap2._source = "local-stale";
        res.status(200).json(snap2);
        return;
      }
    }
  } catch(e) {}

  // 4) fallback mock — no data anywhere
  const RV2={ Gold:150, "Iron Ore":24, Coal:16, Oil:64, "Natural Gas":48, Timber:13, Wheat:8, Fish:14, Copper:32, Lead:40, Uranium:320, Limestone:16, Clay:8, Sugar:10, Peat:13, Manganese:96, Phosphorite:40, "Aluminium Ore":64, Antimony:128, Molybdenum:160, Sunflower:12, Flax:18, Corn:10, Salt:8, Tea:30, Citrus:20, Grapes:20, Wine:60, Sulphur:25, Sulfur:25, Aluminium:80, Cotton:24, Potash:56, "Oil Shale":19, Zinc:38, Amber:75 };
  const REC2={
    "Iron Ingot":{value:161,ingredients:{"Iron Ore":3,Coal:2}},"Steel Ingot":{value:371,ingredients:{"Iron Ingot":2,Coal:3}},
    "Copper Ingot":{value:194,ingredients:{Copper:3,Coal:2}},"Gold Bar":{value:639,ingredients:{Gold:3}},
    "Aluminium Ingot":{value:327,ingredients:{"Aluminium Ore":3,Coal:2}},"Timber Planks":{value:71,ingredients:{Timber:3}},
    "Bricks":{value:95,ingredients:{Clay:3,Coal:2}},"Concrete":{value:120,ingredients:{Limestone:4,Sand:2}},
    "Glass":{value:128,ingredients:{Limestone:3,Coal:2}},"Steel Beam":{value:1431,ingredients:{"Steel Ingot":4}},
    "Machine Parts":{value:1155,ingredients:{"Iron Ingot":3,"Steel Ingot":2}},"Fuel":{value:282,ingredients:{Oil:3}},
    "Refined Fuel":{value:547,ingredients:{Fuel:2}},"Uranium Rod":{value:1453,ingredients:{Uranium:3,Lead:2}},
    "Reactor Core":{value:9402,ingredients:{"Uranium Rod":2,"Steel Beam":3,"Machine Parts":2}},"Circuit Board":{value:658,ingredients:{"Copper Ingot":3,Lead:2}},
    "Flour":{value:51,ingredients:{Wheat:3}},"Bread":{value:98,ingredients:{Flour:2,Sugar:1}},"Cake":{value:180,ingredients:{Flour:3,Sugar:3,Wheat:2}},
    "Wine":{value:100,ingredients:{Grapes:4}},"Canned Food":{value:117,ingredients:{Wheat:3,"Iron Ore":2}},"Canned Fish":{value:122,ingredients:{Fish:2,"Iron Ore":2}},
    "Smoked Fish":{value:100,ingredients:{Fish:2,Coal:2}},"Fish Stew":{value:89,ingredients:{Fish:2,Wheat:2,Salt:1}},
    "Peat Fuel":{value:111,ingredients:{Peat:4,Coal:1}},"Shale Oil":{value:85,ingredients:{"Oil Shale":4}},"Gas Fuel":{value:194,ingredients:{"Natural Gas":3}},"Fertilizer":{value:198,ingredients:{Phosphorite:2,Peat:2,Sulphur:1}},
    "Cotton Fabric":{value:117,ingredients:{Cotton:3}},"Manganese Alloy":{value:448,ingredients:{Manganese:2,"Iron Ingot":1,Coal:1}},
    "Sunflower Oil":{value:67,ingredients:{Sunflower:3}},"Linen":{value:92,ingredients:{Flax:3}},"Corn Meal":{value:59,ingredients:{Corn:3}},
    "Tea Pack":{value:114,ingredients:{Tea:2,Sugar:1}},"Citrus Juice":{value:114,ingredients:{Citrus:3,Sugar:1}},
    "Antimony Alloy":{value:481,ingredients:{Antimony:2,Lead:2}},"Molybdenum Rod":{value:812,ingredients:{Molybdenum:2,"Steel Ingot":1}},"Aluminium Sheet":{value:260,ingredients:{Aluminium:2,Coal:1}}
  };
  const SSR2={
    "Russian SFSR":{emoji:"🇷🇺",work_zone:"1538704167890329621",resources:["Coal","Iron Ore","Timber","Oil","Natural Gas","Gold"]},
    "Byelorussian SSR":{emoji:"🇧🇾",work_zone:"1538703449095676016",resources:["Timber","Peat","Wheat","Flax"]},
    "Ukrainian SSR":{emoji:"🇺🇦",work_zone:"1538703449095676016",resources:["Coal","Iron Ore","Wheat","Sunflower","Corn","Salt"]},
    "Moldavian SSR":{emoji:"🇲🇩",work_zone:"1538703449095676016",resources:["Wheat","Corn","Sunflower","Grapes","Wine"]},
    "Estonian SSR":{emoji:"🇪🇪",work_zone:"1538704231249354772",resources:["Timber","Phosphorite","Peat","Fish","Oil Shale"]},
    "Latvian SSR":{emoji:"🇱🇻",work_zone:"1538704231249354772",resources:["Timber","Peat","Limestone","Wheat","Fish"]},
    "Lithuanian SSR":{emoji:"🇱🇹",work_zone:"1538704231249354772",resources:["Timber","Peat","Clay","Limestone","Flax","Fish"]},
    "Georgian SSR":{emoji:"🇬🇪",work_zone:"1538703028524285962",resources:["Manganese","Copper","Gold","Grapes","Tea","Citrus","Antimony"]},
    "Armenian SSR":{emoji:"🇦🇲",work_zone:"1538703028524285962",resources:["Copper","Gold","Molybdenum","Aluminium Ore"]},
    "Azerbaijanian SSR":{emoji:"🇦🇿",work_zone:"1538703028524285962",resources:["Oil","Natural Gas","Iron Ore","Cotton"]},
    "Kazakh SSR":{emoji:"🇰🇿",work_zone:"1538703181733695600",resources:["Coal","Iron Ore","Copper","Gold","Uranium","Oil","Wheat"]},
    "Uzbek SSR":{emoji:"🇺🇿",work_zone:"1538703181733695600",resources:["Gold","Oil","Copper","Cotton","Natural Gas","Uranium"]},
    "Turkmen SSR":{emoji:"🇹🇲",work_zone:"1538703181733695600",resources:["Oil","Natural Gas","Cotton","Sulphur","Sand"]},
    "Nuristani SSR":{emoji:"🇹🇯",work_zone:"1538704555670245448",resources:["Aluminium Ore","Lead","Zinc","Uranium","Gold"]},
    "Kirghiz SSR":{emoji:"🇰🇬",work_zone:"1538703181733695600",resources:["Gold","Uranium","Coal","Iron Ore","Timber"]}
  };
  const WZ2={"Russian Federal Republic Region":"1538704167890329621","Western Soviet Region":"1538703449095676016","Baltic Soviet Region":"1538704231249354772","Caucasus Soviet Region":"1538703028524285962","Central Asian Soviet Region":"1538703181733695600","Nuristani Soviet Region":"1538704555670245448"};
  const now2=Date.now();
  const gsi2=[]; let p02=100; for(let i=0;i<100;i++){ const d=(Math.random()*2-1)*0.015 + (Math.random()<0.06?(Math.random()*0.12-0.06):0); p02=Math.max(1,Math.floor(p02*(1+d))); gsi2.push({price:p02, change_percent:+(d*100).toFixed(2), recorded_at:new Date(now2-(100-i)*3600000).toISOString()}); } gsi2[0].change_percent=0; gsi2[0].price=100;
  const infl2=[]; let inf2=3.1; for(let i=0;i<100;i++){ inf2+=(Math.random()-0.49)*0.7; inf2=Math.max(0,Math.min(42,inf2)); infl2.push(+inf2.toFixed(2)); }
  const inflation2=infl2[infl2.length-1];
  const money_printed2=Math.floor(420000+inflation2*18000+Math.random()*50000);
  const total_bank_reserves2=Math.floor(900000+Math.random()*250000);
  const base2=[
    {name:"State Nuclear Energy",ticker:"SNE",spec:"extraction",ssr:"Russian SFSR",emp:18,funds:240000,price:420},
    {name:"Soviet Steel Works",ticker:"SSW",spec:"production",ssr:"Ukrainian SSR",emp:24,funds:310000,price:380},
    {name:"State Oil & Gas",ticker:"SOG",spec:"extraction",ssr:"Azerbaijanian SSR",emp:16,funds:280000,price:510},
    {name:"Soviet Agriculture",ticker:"SAG",spec:"agriculture",ssr:"Kazakh SSR",emp:14,funds:180000,price:260},
    {name:"State Mining Corp",ticker:"SMC",spec:"extraction",ssr:"Nuristani SSR",emp:20,funds:350000,price:610},
    {name:"Baltic Timber & Harbour Co",ticker:"BTH",spec:"agriculture",ssr:"Estonian SSR",emp:12,funds:160000,price:220},
    {name:"Red Star Steelworks",ticker:"RSS",spec:"production",ssr:"Ukrainian SSR",emp:9,funds:95000,price:180},
    {name:"Ural Heavy Industries",ticker:"UHI",spec:"extraction",ssr:"Russian SFSR",emp:11,funds:120000,price:210},
    {name:"Volga Shipbuilding",ticker:"VSB",spec:"production",ssr:"Russian SFSR",emp:7,funds:78000,price:145},
    {name:"Siberian Mining Co",ticker:"SMN",spec:"extraction",ssr:"Nuristani SSR",emp:13,funds:140000,price:260},
    {name:"Lenin Machine Works",ticker:"LMW",spec:"production",ssr:"Byelorussian SSR",emp:8,funds:88000,price:165},
    {name:"Caspian Drilling",ticker:"CDR",spec:"extraction",ssr:"Turkmen SSR",emp:6,funds:67000,price:135},
    {name:"Daugava Timber",ticker:"DGT",spec:"agriculture",ssr:"Latvian SSR",emp:5,funds:52000,price:110},
    {name:"Tbilisi Vineyards",ticker:"TBV",spec:"agriculture",ssr:"Georgian SSR",emp:4,funds:43000,price:95}
  ];
  const companies2=base2.map((c,idx)=>{
    const hist=[]; let pr=c.price; for(let i=0;i<100;i++){ pr=Math.max(1,Math.floor(pr*(1+(Math.random()*0.07-0.035)))); hist.push(pr);} hist[0]=Math.floor(c.price*0.6);
    const inv={}; const recKeys=Object.keys(REC2); for(let k=0;k<5;k++){ const item=recKeys[Math.floor(Math.random()*recKeys.length)]; inv[item]=Math.floor(Math.random()*24)+2; }
    const raws=["Iron Ore","Coal","Oil","Wheat","Timber","Fish","Gold"]; for(let k=0;k<3;k++) inv[raws[Math.floor(Math.random()*raws.length)]]=Math.floor(Math.random()*40)+5;
    const isState=idx<6;
    return {id:"comp_"+idx,name:c.name,ticker:c.ticker,specialization:c.spec,hq_ssr:c.ssr,employees:c.emp,funds:c.funds,share_price:hist[hist.length-1],price_history:hist,market_cap:hist[hist.length-1]*1000,buildings:isState?{"Iron Mine":{level:3},"Store":{level:2}}:{"Farm":{level:3},"Store":{level:2}},inventory:inv,is_state_owned:isState,shares_total:1000,wage:c.emp>15?22:18}
  });
  const employed2=companies2.reduce((s,c)=>s+c.employees,0);
  const market_demand2={}, market_supply2={}, demand_history2={};
  for(const k of Object.keys(REC2)){
    let sup=0; companies2.forEach(c=> sup+=(c.inventory[k]||0));
    market_supply2[k]=sup;
    const ideal=employed2*2.5; const ratio=sup/Math.max(1,ideal); let tgt=1.4 - Math.min(ratio,2)*0.4; tgt=Math.max(0.6,Math.min(1.4,tgt));
    market_demand2[k]=+(tgt + (Math.random()*0.08-0.04)).toFixed(3);
  }
  Object.keys(REC2).slice(0,8).forEach(k=>{
    demand_history2[k]=Array.from({length:60},(_,i)=>({demand:+(market_demand2[k]+(Math.random()*0.06-0.03)).toFixed(3), at:new Date(now2-(60-i)*600000).toISOString(), supply:20+Math.floor(Math.random()*40)}));
  });
  const ai_store2={}; Object.keys(REC2).forEach(k=>{ if(Math.random()<0.55) ai_store2[k]=Math.floor(Math.random()*48)+1; });
  const global_consumption2={}; Object.keys(REC2).forEach(k=>{ if(Math.random()<0.6) global_consumption2[k]=Math.floor(Math.random()*220)+5; });
  const goldPrice2=Math.max(1,Math.floor(RV2.Gold*(1+inflation2/100)));
  const goldStock2=420+Math.floor(Math.random()*380);
  const moneySupply2=total_bank_reserves2+money_printed2+companies2.reduce((s,c)=>s+c.funds,0);
  const backing2=(goldStock2*goldPrice2/Math.max(1,moneySupply2))*100;
  const status2=backing2>=100?"FULL GOLD STANDARD":backing2>=50?"PARTIAL":backing2>=20?"WEAK":"FIAT";
  const census2={}; Object.keys(SSR2).forEach(k=> census2[k]=Math.floor(Math.random()*14)+4);
  const regions2={};
  for(const [reg,zone] of Object.entries(WZ2)){
    const ssrs=Object.entries(SSR2).filter(([,v])=> v.work_zone===zone).map(([k])=>k);
    const pop=ssrs.reduce((s,k)=> s+(census2[k]||0),0);
    const rc=companies2.filter(c=> SSR2[c.hq_ssr]?.work_zone===zone);
    const emp=rc.reduce((s,c)=> s+c.employees,0);
    let food=0; rc.forEach(c=>{ Object.entries(c.inventory||{}).forEach(([it,qty])=>{ const fv={Fish:2,Wheat:1,Corn:1,Sunflower:1,Grapes:1,Tea:1,Citrus:1,Flour:2,Sugar:1,Bread:3,Cake:3,Wine:2,"Canned Food":4,"Canned Fish":5,"Smoked Fish":4,"Fish Stew":5,"Sunflower Oil":1,"Corn Meal":2,"Tea Pack":1,"Citrus Juice":2}[it]; if(fv) food+= qty*fv; }); });
    const dem=Math.max(4, Math.ceil(Math.max(1,emp)*1 + pop*0.2));
    regions2[reg]={ssrs,pop,employees:emp,companies:rc.length,foodStock:food,foodDemand:dem,zone,foodRatio:food/Math.max(1,dem)}
  }
  const data2={gsi_history:gsi2,inflation_history:infl2,inflation:inflation2,money_printed:money_printed2,total_bank_reserves:total_bank_reserves2,companies:companies2,market_demand:market_demand2,market_supply:market_supply2,demand_history:demand_history2,ai_store:ai_store2,global_consumption:global_consumption2,consumption_history:[],gold:{price:goldPrice2,stock:goldStock2,moneySupply:moneySupply2,backing:+backing2.toFixed(2),status:status2},census:census2,regions:regions2,ssr_regions:SSR2,work_zones:WZ2,resource_values:RV2,crafting_recipes:Object.fromEntries(Object.entries(REC2).map(([k,v])=>[k,{value:v.value,ingredients:v.ingredients,emoji:"■"}])),mines:{},factories:{},generated_at:new Date().toISOString(), _source:"mock", ssr_resource_weights:{}, compensation_log:[], top_workers:[] };
  res.status(200).json(data2);
}
