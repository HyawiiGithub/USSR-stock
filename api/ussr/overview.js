export default function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  res.setHeader("Cache-Control", "no-store");
  if (req.method === "OPTIONS") return res.status(200).end();
  // inline generator — no import, so Vercel bundling never fails
  const RV={ Gold:150, "Iron Ore":24, Coal:16, Oil:64, "Natural Gas":48, Timber:13, Wheat:8, Fish:14, Copper:32, Lead:40, Uranium:320, Limestone:16, Clay:8, Sugar:10, Potash:56, Peat:13, Manganese:96, "Oil Shale":19, Phosphorite:40, "Aluminium Ore":64, Antimony:128, Molybdenum:160, Sunflower:12, Flax:18, Corn:10, Salt:8, Tea:30, Citrus:20, Grapes:20, Wine:60, Sulphur:25, Aluminium:80, Cotton:24 };
  const REC={
    "Iron Ingot":{value:40,ingredients:{"Iron Ore":3,Coal:2}},"Steel Ingot":{value:80,ingredients:{"Iron Ingot":2,Coal:3}},
    "Copper Ingot":{value:48,ingredients:{Copper:3,Coal:2}},"Gold Bar":{value:560,ingredients:{Gold:3}},
    "Aluminium Ingot":{value:55,ingredients:{"Aluminium Ore":3,Coal:2}},"Timber Planks":{value:16,ingredients:{Timber:3}},
    "Bricks":{value:29,ingredients:{Clay:3,Coal:2}},"Concrete":{value:40,ingredients:{Limestone:4,Sand:2}},
    "Glass":{value:32,ingredients:{Limestone:3,Coal:2}},"Steel Beam":{value:128,ingredients:{"Steel Ingot":4}},
    "Machine Parts":{value:72,ingredients:{"Iron Ingot":3,"Steel Ingot":2}},"Fuel":{value:64,ingredients:{Oil:3}},
    "Refined Fuel":{value:128,ingredients:{Fuel:2}},"Uranium Rod":{value:256,ingredients:{Uranium:3,Lead:2}},
    "Reactor Core":{value:800,ingredients:{"Uranium Rod":2,"Steel Beam":3,"Machine Parts":2}},"Circuit Board":{value:88,ingredients:{"Copper Ingot":3,Lead:2}},
    "Flour":{value:25,ingredients:{Wheat:3}},"Bread":{value:45,ingredients:{Flour:2,Sugar:1}},"Cake":{value:80,ingredients:{Flour:3,Sugar:3,Wheat:2}},
    "Wine":{value:60,ingredients:{Grapes:4}},"Canned Food":{value:48,ingredients:{Wheat:3,"Iron Ore":2}},"Canned Fish":{value:62,ingredients:{Fish:2,"Iron Ore":2}},
    "Smoked Fish":{value:48,ingredients:{Fish:2,Coal:2}},"Fish Stew":{value:55,ingredients:{Fish:2,Wheat:2,Salt:1}}
  };
  const SSR={
    "Russian SFSR":{emoji:"🇷🇺",work_zone:"1538704167890329621",resources:["Coal","Iron Ore","Timber","Oil","Natural Gas","Gold"]},
    "Byelorussian SSR":{emoji:"🇧🇾",work_zone:"1538703449095676016",resources:["Timber","Peat","Potash","Wheat","Flax"]},
    "Ukrainian SSR":{emoji:"🇺🇦",work_zone:"1538703449095676016",resources:["Coal","Iron Ore","Wheat","Sunflower","Corn","Salt"]},
    "Moldavian SSR":{emoji:"🇲🇩",work_zone:"1538703449095676016",resources:["Wheat","Corn","Sunflower","Grapes","Wine"]},
    "Estonian SSR":{emoji:"🇪🇪",work_zone:"1538704231249354772",resources:["Oil Shale","Timber","Phosphorite","Peat","Fish"]},
    "Latvian SSR":{emoji:"🇱🇻",work_zone:"1538704231249354772",resources:["Timber","Peat","Limestone","Wheat","Fish"]},
    "Lithuanian SSR":{emoji:"🇱🇹",work_zone:"1538704231249354772",resources:["Timber","Peat","Clay","Limestone","Flax","Fish"]},
    "Georgian SSR":{emoji:"🇬🇪",work_zone:"1538703028524285962",resources:["Manganese","Copper","Gold","Grapes","Tea","Citrus"]},
    "Armenian SSR":{emoji:"🇦🇲",work_zone:"1538703028524285962",resources:["Copper","Gold","Molybdenum","Aluminium"]},
    "Azerbaijanian SSR":{emoji:"🇦🇿",work_zone:"1538703028524285962",resources:["Oil","Natural Gas","Iron Ore","Cotton"]},
    "Kazakh SSR":{emoji:"🇰🇿",work_zone:"1538703181733695600",resources:["Coal","Iron Ore","Copper","Gold","Uranium","Oil","Wheat"]},
    "Uzbek SSR":{emoji:"🇺🇿",work_zone:"1538703181733695600",resources:["Gold","Oil","Copper","Cotton","Natural Gas","Uranium"]},
    "Turkmen SSR":{emoji:"🇹🇲",work_zone:"1538703181733695600",resources:["Oil","Natural Gas","Cotton","Sulphur"]},
    "Nuristani SSR":{emoji:"🇹🇯",work_zone:"1538704555670245448",resources:["Aluminium","Lead","Zinc","Uranium","Gold"]},
    "Kirghiz SSR":{emoji:"🇰🇬",work_zone:"1538703181733695600",resources:["Gold","Uranium","Coal","Iron Ore","Timber"]}
  };
  const WZ={"Russian Federal Republic Region":"1538704167890329621","Western Soviet Region":"1538703449095676016","Baltic Soviet Region":"1538704231249354772","Caucasus Soviet Region":"1538703028524285962","Central Asian Soviet Region":"1538703181733695600","Nuristani Soviet Region":"1538704555670245448"};
  const now=Date.now();
  const gsi=[]; let p0=100; for(let i=0;i<100;i++){ const d=(Math.random()*2-1)*0.015 + (Math.random()<0.06?(Math.random()*0.12-0.06):0); p0=Math.max(1,Math.floor(p0*(1+d))); gsi.push({price:p0, change_percent:+(d*100).toFixed(2), recorded_at:new Date(now-(100-i)*3600000).toISOString()}); } gsi[0].change_percent=0; gsi[0].price=100;
  const infl=[]; let inf=3.1; for(let i=0;i<100;i++){ inf+=(Math.random()-0.49)*0.7; inf=Math.max(0,Math.min(42,inf)); infl.push(+inf.toFixed(2)); }
  const inflation=infl[infl.length-1];
  const money_printed=Math.floor(420000+inflation*18000+Math.random()*50000);
  const total_bank_reserves=Math.floor(900000+Math.random()*250000);
  const base=[
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
  const companies=base.map((c,idx)=>{
    const hist=[]; let pr=c.price; for(let i=0;i<100;i++){ pr=Math.max(1,Math.floor(pr*(1+(Math.random()*0.07-0.035)))); hist.push(pr);} hist[0]=Math.floor(c.price*0.6);
    const inv={}; const recKeys=Object.keys(REC); for(let k=0;k<5;k++){ const item=recKeys[Math.floor(Math.random()*recKeys.length)]; inv[item]=Math.floor(Math.random()*24)+2; }
    const raws=["Iron Ore","Coal","Oil","Wheat","Timber","Fish","Gold"]; for(let k=0;k<3;k++) inv[raws[Math.floor(Math.random()*raws.length)]]=Math.floor(Math.random()*40)+5;
    const isState=idx<6;
    return {id:"comp_"+idx,name:c.name,ticker:c.ticker,specialization:c.spec,hq_ssr:c.ssr,employees:c.emp,funds:c.funds,share_price:hist[hist.length-1],price_history:hist,market_cap:hist[hist.length-1]*1000,buildings:isState?{"Iron Mine":{level:3},"Store":{level:2}}:{"Farm":{level:3},"Store":{level:2}},inventory:inv,is_state_owned:isState,shares_total:1000,wage:c.emp>15?22:18}
  });
  const employed=companies.reduce((s,c)=>s+c.employees,0);
  const market_demand={}, market_supply={}, demand_history={};
  for(const k of Object.keys(REC)){
    let sup=0; companies.forEach(c=> sup+=(c.inventory[k]||0));
    market_supply[k]=sup;
    const ideal=employed*2.5; const ratio=sup/Math.max(1,ideal); let tgt=1.4 - Math.min(ratio,2)*0.4; tgt=Math.max(0.6,Math.min(1.4,tgt));
    market_demand[k]=+(tgt + (Math.random()*0.08-0.04)).toFixed(3);
  }
  Object.keys(REC).slice(0,8).forEach(k=>{
    demand_history[k]=Array.from({length:60},(_,i)=>({demand:+(market_demand[k]+(Math.random()*0.06-0.03)).toFixed(3), at:new Date(now-(60-i)*600000).toISOString(), supply:20+Math.floor(Math.random()*40)}));
  });
  const ai_store={}; Object.keys(REC).forEach(k=>{ if(Math.random()<0.55) ai_store[k]=Math.floor(Math.random()*48)+1; });
  const global_consumption={}; Object.keys(REC).forEach(k=>{ if(Math.random()<0.6) global_consumption[k]=Math.floor(Math.random()*220)+5; });
  const goldPrice=Math.max(1,Math.floor(RV.Gold*(1+inflation/100)));
  const goldStock=420+Math.floor(Math.random()*380);
  const moneySupply=total_bank_reserves+money_printed+companies.reduce((s,c)=>s+c.funds,0);
  const backing=(goldStock*goldPrice/Math.max(1,moneySupply))*100;
  const status=backing>=100?"FULL GOLD STANDARD":backing>=50?"PARTIAL":backing>=20?"WEAK":"FIAT";
  const census={}; Object.keys(SSR).forEach(k=> census[k]=Math.floor(Math.random()*14)+4);
  const regions={};
  for(const [reg,zone] of Object.entries(WZ)){
    const ssrs=Object.entries(SSR).filter(([,v])=> v.work_zone===zone).map(([k])=>k);
    const pop=ssrs.reduce((s,k)=> s+(census[k]||0),0);
    const rc=companies.filter(c=> SSR[c.hq_ssr]?.work_zone===zone);
    const emp=rc.reduce((s,c)=> s+c.employees,0);
    let food=0; rc.forEach(c=>{ Object.entries(c.inventory).forEach(([it,qty])=>{ const fv={Fish:2,Wheat:1,Corn:1,Sunflower:1,Grapes:1,Tea:1,Citrus:1,Flour:2,Sugar:1,Bread:3,Cake:3,Wine:2,"Canned Food":4,"Canned Fish":5,"Smoked Fish":4,"Fish Stew":5}[it]; if(fv) food+= qty*fv; }); });
    const dem=Math.max(4, Math.ceil(Math.max(1,emp)*2 + pop*0.5));
    regions[reg]={ssrs,pop,employees:emp,companies:rc.length,foodStock:food,foodDemand:dem,zone,foodRatio:food/Math.max(1,dem)}
  }
  const data={gsi_history:gsi,inflation_history:infl,inflation,money_printed,total_bank_reserves,companies,market_demand,market_supply,demand_history,ai_store,global_consumption,consumption_history:[],gold:{price:goldPrice,stock:goldStock,moneySupply,backing:+backing.toFixed(2),status},census,regions,ssr_regions:SSR,work_zones:WZ,resource_values:RV,crafting_recipes:Object.fromEntries(Object.entries(REC).map(([k,v])=>[k,{value:v.value,ingredients:v.ingredients,emoji:"■"}])),mines:{},factories:{},generated_at:new Date().toISOString()};
  res.status(200).json(data);
}
