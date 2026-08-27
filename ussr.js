// USSR Economy — brutal, offline-first, no AI gloss
const fmt = n => n==null||isNaN(n) ? '—' : new Intl.NumberFormat('en-US').format(n);
const money = n => '₽'+fmt(Math.round(n));
let data=null, charts={}, dmItem=null;

function setClock(){
  const d=new Date();
  const msk=new Date(d.toLocaleString('en-US',{timeZone:'Europe/Moscow'}));
  const el=document.getElementById('clock');
  if(el) el.textContent = msk.toLocaleTimeString('en-GB',{hour12:false})+' MSK';
}
setInterval(setClock,1000); setClock();

function nav(){
  document.querySelectorAll('#nav button').forEach(b=>b.addEventListener('click',()=>{
    document.querySelectorAll('#nav button').forEach(x=>x.classList.remove('active'));
    b.classList.add('active');
    const v=b.dataset.view;
    document.querySelectorAll('[id^="view-"]').forEach(el=>el.classList.add('hidden'));
    const target=document.getElementById('view-'+v);
    if(target) target.classList.remove('hidden');
    setTimeout(()=> Object.values(charts).forEach(c=>c && c.resize()), 80);
  }));
}
nav();

// FULL fallback — 15 SSRs, 6 regions, matches backend exactly
function fallbackMock(){
  const RV={ Gold:150, "Iron Ore":24, Coal:16, Oil:64, "Natural Gas":48, Timber:13, Wheat:8, Fish:14, Copper:32, Lead:40, Uranium:320, Limestone:16, Clay:8, Sugar:10, Potash:56, Peat:13, Manganese:96, "Oil Shale":19, Phosphorite:40, "Aluminium Ore":64, Antimony:128, Molybdenum:160, Sunflower:12, Flax:18, Corn:10, Salt:8, Tea:30, Citrus:20, Grapes:20, Wine:60, Sulphur:25, Aluminium:80, Cotton:24 };
  const REC = {
    "Iron Ingot": {value:40, ingredients:{"Iron Ore":3,Coal:2}}, "Steel Ingot": {value:80, ingredients:{"Iron Ingot":2,Coal:3}},
    "Copper Ingot": {value:48, ingredients:{Copper:3,Coal:2}}, "Gold Bar": {value:560, ingredients:{Gold:3}},
    "Aluminium Ingot": {value:55, ingredients:{"Aluminium Ore":3,Coal:2}}, "Timber Planks": {value:16, ingredients:{Timber:3}},
    "Bricks": {value:29, ingredients:{Clay:3,Coal:2}}, "Concrete": {value:40, ingredients:{Limestone:4,Sand:2}},
    "Glass": {value:32, ingredients:{Limestone:3,Coal:2}}, "Steel Beam": {value:128, ingredients:{"Steel Ingot":4}},
    "Machine Parts": {value:72, ingredients:{"Iron Ingot":3,"Steel Ingot":2}}, "Fuel": {value:64, ingredients:{Oil:3}},
    "Refined Fuel": {value:128, ingredients:{Fuel:2}}, "Uranium Rod": {value:256, ingredients:{Uranium:3,Lead:2}},
    "Reactor Core": {value:800, ingredients:{"Uranium Rod":2,"Steel Beam":3,"Machine Parts":2}}, "Circuit Board": {value:88, ingredients:{"Copper Ingot":3,Lead:2}},
    "Flour": {value:25, ingredients:{Wheat:3}}, "Bread": {value:45, ingredients:{Flour:2,Sugar:1}}, "Cake": {value:80, ingredients:{Flour:3,Sugar:3,Wheat:2}},
    "Wine": {value:60, ingredients:{Grapes:4}}, "Canned Food": {value:48, ingredients:{Wheat:3,"Iron Ore":2}}, "Canned Fish": {value:62, ingredients:{Fish:2,"Iron Ore":2}},
    "Smoked Fish": {value:48, ingredients:{Fish:2,Coal:2}}, "Fish Stew": {value:55, ingredients:{Fish:2,Wheat:2,Salt:1}}
  };
  const SSR = {
    "Russian SFSR": {emoji:"🇷🇺",work_zone:"1538704167890329621",resources:["Coal","Iron Ore","Timber","Oil","Natural Gas","Gold"]},
    "Byelorussian SSR": {emoji:"🇧🇾",work_zone:"1538703449095676016",resources:["Timber","Peat","Potash","Wheat","Flax"]},
    "Ukrainian SSR": {emoji:"🇺🇦",work_zone:"1538703449095676016",resources:["Coal","Iron Ore","Wheat","Sunflower","Corn","Salt"]},
    "Moldavian SSR": {emoji:"🇲🇩",work_zone:"1538703449095676016",resources:["Wheat","Corn","Sunflower","Grapes","Wine"]},
    "Estonian SSR": {emoji:"🇪🇪",work_zone:"1538704231249354772",resources:["Oil Shale","Timber","Phosphorite","Peat","Fish"]},
    "Latvian SSR": {emoji:"🇱🇻",work_zone:"1538704231249354772",resources:["Timber","Peat","Limestone","Wheat","Fish"]},
    "Lithuanian SSR": {emoji:"🇱🇹",work_zone:"1538704231249354772",resources:["Timber","Peat","Clay","Limestone","Flax","Fish"]},
    "Georgian SSR": {emoji:"🇬🇪",work_zone:"1538703028524285962",resources:["Manganese","Copper","Gold","Grapes","Tea","Citrus"]},
    "Armenian SSR": {emoji:"🇦🇲",work_zone:"1538703028524285962",resources:["Copper","Gold","Molybdenum","Aluminium"]},
    "Azerbaijanian SSR": {emoji:"🇦🇿",work_zone:"1538703028524285962",resources:["Oil","Natural Gas","Iron Ore","Cotton"]},
    "Kazakh SSR": {emoji:"🇰🇿",work_zone:"1538703181733695600",resources:["Coal","Iron Ore","Copper","Gold","Uranium","Oil","Wheat"]},
    "Uzbek SSR": {emoji:"🇺🇿",work_zone:"1538703181733695600",resources:["Gold","Oil","Copper","Cotton","Natural Gas","Uranium"]},
    "Turkmen SSR": {emoji:"🇹🇲",work_zone:"1538703181733695600",resources:["Oil","Natural Gas","Cotton","Sulphur"]},
    "Nuristani SSR": {emoji:"🇹🇯",work_zone:"1538704555670245448",resources:["Aluminium","Lead","Zinc","Uranium","Gold"]},
    "Kirghiz SSR": {emoji:"🇰🇬",work_zone:"1538703181733695600",resources:["Gold","Uranium","Coal","Iron Ore","Timber"]}
  };
  const WZ={"Russian Federal Republic Region":"1538704167890329621","Western Soviet Region":"1538703449095676016","Baltic Soviet Region":"1538704231249354772","Caucasus Soviet Region":"1538703028524285962","Central Asian Soviet Region":"1538703181733695600","Nuristani Soviet Region":"1538704555670245448"};
  const now=Date.now();
  const gsi=[]; let p0=100; for(let i=0;i<100;i++){ const d=(Math.random()*2-1)*0.015 + (Math.random()<0.06?(Math.random()*0.12-0.06):0); p0=Math.max(1,Math.floor(p0*(1+d))); gsi.push({price:p0, change_percent:+(d*100).toFixed(2), recorded_at:new Date(now-(100-i)*3600000).toISOString()}); } gsi[0].change_percent=0; gsi[0].price=100;
  const infl=[]; let inf=3.1; for(let i=0;i<100;i++){ inf+=(Math.random()-0.49)*0.7; inf=Math.max(0,Math.min(42,inf)); infl.push(+inf.toFixed(2)); }
  const inflation=infl[infl.length-1];
  const money_printed=Math.floor(420000+inflation*18000+Math.random()*50000);
  const total_bank_reserves=Math.floor(900000+Math.random()*250000);
  // companies
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
  return {gsi_history:gsi,inflation_history:infl,inflation,money_printed,total_bank_reserves,companies,market_demand,market_supply,demand_history,ai_store,global_consumption,consumption_history:[],gold:{price:goldPrice,stock:goldStock,moneySupply,backing:+backing.toFixed(2),status},census,regions,ssr_regions:SSR,work_zones:WZ,resource_values:RV,crafting_recipes:Object.fromEntries(Object.entries(REC).map(([k,v])=>[k,{value:v.value,ingredients:v.ingredients,emoji:"■"}])),mines:{},factories:{},generated_at:new Date().toISOString()}
}

async function load(){
  const isPages = location.hostname.includes('github.io');
  const notice=document.getElementById('connNotice');
  const topGen=document.getElementById('topGen');
  // BUILD api list: on Pages try Vercel live first, then mock
  const vercelCandidates = [
    "https://ussr-stock.vercel.app/api/ussr/overview",
    "https://ussr-stock-hyawiigithub.vercel.app/api/ussr/overview",
    "https://ussr-stock-git-main-hyawiigithub.vercel.app/api/ussr/overview"
  ];
  const localUrl = location.origin + "/api/ussr/overview";
  const tryUrls = isPages ? vercelCandidates : [localUrl];
  let lastErr = null;
  for(const url of tryUrls){
    try{
      const r=await fetch(url,{cache:"no-store", signal:AbortSignal.timeout(3500)});
      if(!r.ok) throw new Error("http "+r.status);
      const j=await r.json();
      if(!j.gsi_history || !j.gsi_history.length) throw new Error("bad payload");
      data=j;
      if(notice) { notice.textContent="● CONNECTED — LIVE GOSPLAN FEED // "+ new Date().toLocaleTimeString() + (isPages ? " via Vercel" : ""); notice.style.background="#111"; notice.style.color="#b6e2b6"; }
      if(topGen) topGen.textContent="LIVE "+ new Date(j.generated_at).toLocaleTimeString();
      lastErr=null; break;
    }catch(e){ lastErr=e; console.warn("try",url,"failed",e.message); }
  }
  if(!data){
    console.warn("fallback mock", lastErr && lastErr.message);
    data=fallbackMock();
    if(notice) { notice.textContent="● OFFLINE MOCK — STATIC MODE (no backend, generated locally) — "+(lastErr?lastErr.message:"vercel not yet deployed"); notice.style.background="#f5e6a3"; notice.style.color="#111"; }
    if(topGen) topGen.textContent="MOCK "+ new Date(data.generated_at).toLocaleTimeString();
  }
  const genEl=document.getElementById('genAt');
  if(genEl) genEl.textContent=new Date(data.generated_at).toLocaleString();
  const foot=document.getElementById('footGen');
  if(foot) foot.textContent=new Date(data.generated_at).toLocaleString();
  renderStats(); renderGSI(); renderInfl(); renderGold(); renderAI(); renderCons(); renderDemand(); renderCompanies(); renderWorld(); renderProduction();
  setTimeout(refreshLoop, 10000);
}

function mkChart(id,cfg){
  const c=document.getElementById(id);
  if(!c) return null;
  if(charts[id]) charts[id].destroy();
  // brutal flat style defaults
  const baseOpts={
    responsive:true, maintainAspectRatio:false, animation:{duration:400},
    plugins:{legend:{labels:{color:'#111',font:{family:'IBM Plex Mono',size:9},boxWidth:12}}},
    scales:{x:{ticks:{color:'#111',font:{family:'IBM Plex Mono',size:8}},grid:{color:'#ddd'}},y:{ticks:{color:'#111',font:{family:'IBM Plex Mono',size:8}},grid:{color:'#ddd'}}}
  };
  cfg.options={...baseOpts, ...cfg.options, plugins:{...baseOpts.plugins, ...(cfg.options&&cfg.options.plugins||{})}, scales: cfg.options&&cfg.options.scales ? cfg.options.scales : baseOpts.scales };
  charts[id]=new Chart(c.getContext('2d'), cfg);
  return charts[id];
}

function renderStats(){
  const gsi=data.gsi_history[data.gsi_history.length-1];
  const prev=data.gsi_history[data.gsi_history.length-2];
  const ch= prev ? ((gsi.price-prev.price)/prev.price*100) : gsi.change_percent;
  const id=(v)=>document.getElementById(v);
  const el=document.getElementById('stats');
  if(!el) return;
  el.innerHTML=`
    <div class="stat"><b>GSI INDEX</b><strong class="mono">₽${fmt(gsi.price)}</strong><span class="badge ${ch>=0?'b-good':'b-bad'}">${ch>=0?'+':''}${ch.toFixed(2)}% · ${data.gsi_history.length} PTS</span></div>
    <div class="stat"><b>INFLATION</b><strong>${data.inflation.toFixed(2)}%</strong><span>PRINTED ₽${fmt(data.money_printed)} // RESERVES ₽${fmt(data.total_bank_reserves)}</span></div>
    <div class="stat"><b>GOLD BACKING</b><strong>${data.gold.backing.toFixed(1)}%</strong><span class="badge ${data.gold.backing>=100?'b-good':data.gold.backing>=50?'b-warn':'b-bad'}">${data.gold.status}</span></div>
    <div class="stat"><b>ENTERPRISES</b><strong>${data.companies.length}</strong><span>CAP ${money(data.companies.reduce((s,c)=>s+c.market_cap,0))} // ${data.companies.filter(c=>c.is_state_owned).length} STATE</span></div>
  `;
  // also update topGen if exists
  const topGen=document.getElementById('topGen');
  if(topGen && data.generated_at) topGen.textContent = 'UPDATED '+ new Date(data.generated_at).toLocaleTimeString();
}

function renderGSI(){
  const labels=data.gsi_history.map((_,i)=>i);
  const prices=data.gsi_history.map(x=>x.price);
  const last=data.gsi_history[data.gsi_history.length-1];
  const chEl=document.getElementById('gsiChange');
  if(chEl){ chEl.textContent=(last.change_percent>=0?'+':'')+last.change_percent.toFixed(2)+'%'; chEl.className= last.change_percent>=0?'b-good':'b-bad'; }
  const inflEl=document.getElementById('inflLabel');
  if(inflEl) inflEl.textContent=data.inflation.toFixed(2)+'%';
  mkChart('chartGSI',{type:'line',data:{labels,datasets:[{data:prices,borderColor:'#111',backgroundColor:'rgba(17,17,17,.06)',borderWidth:2,fill:false,pointRadius:0,tension:.25}]},options:{plugins:{legend:{display:false}},scales:{x:{display:false},y:{grid:{color:'#ddd'}}}}});
  mkChart('chartGSIFull',{type:'line',data:{labels,datasets:[{label:'GSI',data:prices,borderColor:'#8a0f14',backgroundColor:'rgba(138,15,20,.08)',borderWidth:2,fill:false,pointRadius:0,tension:.25}]},options:{plugins:{legend:{display:false}}}});
}
function renderInfl(){
  const labels=data.inflation_history.map((_,i)=>i);
  mkChart('chartInfl',{type:'line',data:{labels,datasets:[{data:data.inflation_history,borderColor:'#8a0f14',backgroundColor:'rgba(138,15,20,.06)',borderWidth:2,fill:false,pointRadius:0,tension:.25}]},options:{plugins:{legend:{display:false}},scales:{x:{display:false},y:{ticks:{callback:v=>v+'%'}}}}});
  mkChart('chartInflFull',{type:'line',data:{labels,datasets:[{label:'INF %',data:data.inflation_history,borderColor:'#111',borderWidth:2,fill:false,pointRadius:0,tension:.25}]},options:{plugins:{legend:{display:false}},scales:{y:{ticks:{callback:v=>v+'%'}}}}});
}
function renderGold(){
  const g=data.gold;
  const pct=Math.min(100,Math.max(0,g.backing));
  const fill=document.getElementById('goldFill');
  const bar=document.getElementById('goldBar');
  const pctEl=document.getElementById('goldPct');
  const statusEl=document.getElementById('goldStatus');
  if(fill) fill.style.width=pct+'%';
  if(pctEl) pctEl.textContent=g.backing.toFixed(1)+'%';
  if(statusEl){ statusEl.textContent=g.status; statusEl.className=g.backing>=100?'b-good':g.backing>=50?'b-warn':'b-bad'; }
  const priceEl=document.getElementById('goldPrice'); if(priceEl) priceEl.textContent='₽'+fmt(g.price);
  const stockEl=document.getElementById('goldStock'); if(stockEl) stockEl.textContent=fmt(g.stock);
  const meta=document.getElementById('goldMeta'); if(meta) meta.textContent=`SUPPLY ₽${fmt(g.moneySupply)} // BACKING ${money(g.stock*g.price)} / ${money(g.moneySupply)}`;
  // legacy circular gauge
  const gauge=document.getElementById('goldGauge'); if(gauge) gauge.style.setProperty('--pct',pct+'%');
}
function renderAI(){
  const entries=Object.entries(data.ai_store).sort((a,b)=>b[1]-a[1]).slice(0,10);
  const cnt=document.getElementById('aiCount'); if(cnt) cnt.textContent=Object.keys(data.ai_store).length+' SKUS // '+fmt(Object.values(data.ai_store).reduce((s,v)=>s+v,0))+' UNITS';
  mkChart('chartAI',{type:'bar',data:{labels:entries.map(e=>e[0].slice(0,12)),datasets:[{data:entries.map(e=>e[1]),backgroundColor:'#111',borderColor:'#111',borderWidth:1}]},options:{indexAxis:'y',plugins:{legend:{display:false}},scales:{x:{grid:{color:'#ddd'}},y:{grid:{display:false}}}}});
  const list=document.getElementById('aiList'); if(list) list.textContent=entries.map(e=>e[0]+' ×'+e[1]).join(' // ') || 'EMPTY — NO GOODS';
}
function renderCons(){
  const entries=Object.entries(data.global_consumption).sort((a,b)=>b[1]-a[1]).slice(0,10);
  mkChart('chartCons',{type:'bar',data:{labels:entries.map(e=>e[0].slice(0,10)),datasets:[{data:entries.map(e=>e[1]),backgroundColor:'#8a0f14',borderColor:'#111',borderWidth:1}]},options:{plugins:{legend:{display:false}},scales:{y:{grid:{color:'#ddd'}},x:{ticks:{maxRotation:35}}}}});
}
function renderDemand(){
  const items=Object.keys(data.market_demand).sort();
  const tabs=document.getElementById('demandTabs');
  const prodCount=document.getElementById('prodCount'); if(prodCount) prodCount.textContent=items.length+' PRODUCTS';
  if(tabs){
    tabs.innerHTML=items.slice(0,10).map((k,i)=>`<button class="${i===0?'active':''}" data-item="${k}">${k}</button>`).join('') ;
    tabs.querySelectorAll('button').forEach(b=>b.addEventListener('click',()=>{
      tabs.querySelectorAll('button').forEach(x=>x.classList.remove('active')); b.classList.add('active');
      dmItem=b.dataset.item; renderDemandTable(); renderDMChart();
    }));
  }
  dmItem=dmItem||items[0];
  renderDemandTable();
  const dmTabs=document.getElementById('dmTabs');
  if(dmTabs){
    dmTabs.innerHTML=Object.keys(data.demand_history).map((k,i)=>`<button class="${k===dmItem?'active':''}" data-item="${k}">${k}</button>`).join('');
    dmTabs.querySelectorAll('button').forEach(b=>b.addEventListener('click',()=>{ dmTabs.querySelectorAll('button').forEach(x=>x.classList.remove('active')); b.classList.add('active'); dmItem=b.dataset.item; renderDMChart(); }));
  }
  renderDMChart();
}
function renderDemandTable(){
  const table=document.getElementById('demandTable'); if(!table) return;
  const rows=Object.keys(data.market_demand).sort().map(item=>{
    const dem=data.market_demand[item]; const sup=data.market_supply[item]; const sFac=(1.35 - (Math.min(sup,120)/120)*0.75);
    const barPct=Math.round(((dem-0.6)/0.9)*100); const supPct=Math.round(((sFac-0.6)/0.8)*100);
    return `<tr><td><b>${item}</b></td><td>${(dem*100).toFixed(0)}%<div class="bar" style="margin-top:4px"><i style="width:${barPct}%"></i></div></td><td>${(sFac*100).toFixed(0)}%<div class="bar"><i style="width:${supPct}%;background:#111"></i></div></td><td>${fmt(sup)}</td><td>₽${data.crafting_recipes[item]?.value||0}</td></tr>`;
  }).join('');
  table.innerHTML=`<div class="table-wrap"><table><thead><tr><th>ITEM</th><th>DEMAND</th><th>SUPPLY FAC</th><th>SUPPLY</th><th>BASE</th></tr></thead><tbody>${rows}</tbody></table></div>`;
}
function renderDMChart(){
  const hist=data.demand_history[dmItem]; if(!hist) return;
  const lab=document.getElementById('dmLabel'); if(lab) lab.textContent=dmItem;
  mkChart('chartDM',{type:'line',data:{labels:hist.map((_,i)=>i),datasets:[{label:dmItem,data:hist.map(h=>h.demand*100),borderColor:'#111',backgroundColor:'rgba(17,17,17,.06)',borderWidth:2,fill:false,pointRadius:0,tension:.2}]},options:{plugins:{legend:{display:false}},scales:{y:{min:55,max:155,ticks:{callback:v=>v+'%'}},x:{display:false}}}});
}
function renderCompanies(){
  const compStats=document.getElementById('compStats');
  if(compStats) compStats.innerHTML=`
    <div class="stat"><b>TOTAL CAP</b><strong>${money(data.companies.reduce((s,c)=>s+c.market_cap,0))}</strong><span>${data.companies.length} CORPS</span></div>
    <div class="stat"><b>AVG PRICE</b><strong>₽${fmt(Math.round(data.companies.reduce((s,c)=>s+c.share_price,0)/data.companies.length))}</strong><span>STATE ${data.companies.filter(c=>c.is_state_owned).length}</span></div>
    <div class="stat"><b>WORKERS</b><strong>${fmt(data.companies.reduce((s,c)=>s+c.employees,0))}</strong><span>AVG WAGE ₽${(data.companies.reduce((s,c)=>s+c.wage,0)/data.companies.length).toFixed(1)}</span></div>
    <div class="stat"><b>TOP TICKER</b><strong>${data.companies.slice().sort((a,b)=>b.market_cap-a.market_cap)[0].ticker}</strong><span>${money(Math.max(...data.companies.map(c=>c.market_cap)))}</span></div>`;
  const grid=document.getElementById('compGrid'); if(grid) grid.innerHTML=data.companies.map(c=>`
    <div class="card" style="border-left:6px solid ${c.is_state_owned?'#8a0f14':'#111'}">
      <div class="card-b">
        <div style="display:flex;justify-content:space-between;gap:8px"><div><div class="mono" style="font-size:9px;letter-spacing:.08em">${c.is_state_owned?'STATE //':'PRIVATE //'} ${c.specialization||'—'}</div><div style="font:800 14px var(--font-mono);text-transform:uppercase">${c.name}</div><div class="mono" style="font-size:10px;color:var(--muted)">${c.ticker} // ${c.hq_ssr} ${data.ssr_regions[c.hq_ssr]?.emoji||''} // ${c.employees} WORKERS</div></div><span class="badge ${c.is_state_owned?'b-bad':'b-good'}">${c.is_state_owned?'STATE':'PRIVATE'}</span></div>
        <div class="grid grid-2" style="margin-top:8px"><div class="stat" style="padding:8px"><b>SHARE</b><strong>₽${fmt(c.share_price)}</strong><span>CAP ${money(c.market_cap)}</span></div><div class="stat" style="padding:8px"><b>FUNDS</b><strong>₽${fmt(c.funds)}</strong><span>WAGE ₽${c.wage}</span></div></div>
        <div class="mono" style="font-size:9px;margin-top:6px;word-break:break-word">${Object.entries(c.buildings).map(([k,v])=>k+' LV'+v.level).join(' // ')}</div>
        <div class="mono" style="font-size:9px;color:var(--muted);margin-top:4px;word-break:break-word">${Object.entries(c.inventory).slice(0,5).map(([k,v])=>k+'×'+v).join(' // ')}</div>
      </div>
    </div>`).join('');
  const sorted=data.companies.slice().sort((a,b)=>b.market_cap-a.market_cap).slice(0,10);
  mkChart('chartComps',{type:'bar',data:{labels:sorted.map(c=>c.ticker),datasets:[{label:'CAP',data:sorted.map(c=>c.market_cap),backgroundColor:sorted.map(c=> c.is_state_owned ? '#8a0f14' : '#111'),borderColor:'#111',borderWidth:1}]},options:{plugins:{legend:{display:false}},scales:{y:{ticks:{callback:v=>'₽'+(v/1000).toFixed(0)+'K'}},x:{grid:{display:false}}}}});
}
function renderWorld(){
  const regs=Object.entries(data.regions);
  const rs=document.getElementById('regionStats');
  if(rs) rs.innerHTML=`
    <div class="stat"><b>EMPIRE POP</b><strong>${fmt(Object.values(data.census).reduce((s,v)=>s+v,0))}</strong><span>15 SSRS // 6 REGIONS</span></div>
    <div class="stat"><b>FOOD STOCK</b><strong>${fmt(regs.reduce((s,[,r])=>s+r.foodStock,0))} 🍞</strong><span>UNITS</span></div>
    <div class="stat"><b>STRAINED</b><strong>${regs.filter(([,r])=>r.foodStock < r.foodDemand).length}/6</strong><span>STOCK &lt; DEMAND</span></div>`;
  const rg=document.getElementById('regionGrid');
  if(rg) rg.innerHTML=regs.map(([name,r])=>{
    const pct=Math.min(100,Math.round(r.foodStock/Math.max(1,r.foodDemand)*100)); const ok=r.foodStock>=r.foodDemand;
    return `<div class="region ${ok?'':'bad'}"><div style="display:flex;justify-content:space-between"><h4>${name}</h4><span class="badge ${ok?'b-good':'b-bad'}">${ok?'FED':'HUNGRY'}</span></div><div class="meta">${r.ssrs.length} SSRS // ${r.companies} CORPS // ${r.employees} WORKERS // POP ${r.pop}</div><div class="meta" style="margin-top:6px">${fmt(r.foodStock)} / ${fmt(r.foodDemand)} 🍞 // ${pct}%</div><div class="progress"><i style="width:${pct}%"></i></div><div class="mono" style="font-size:9px;margin-top:6px;word-break:break-word">${r.ssrs.join(' // ')}</div></div>`;
  }).join('');
  const tbody=document.getElementById('ssrTable');
  if(tbody) tbody.innerHTML=Object.entries(data.ssr_regions).map(([ssr,info])=>{
    const region=Object.entries(data.work_zones).find(([,z])=>z===info.work_zone)?.[0] || '—'; const comps=data.companies.filter(c=>c.hq_ssr===ssr).length;
    return `<tr><td>${info.emoji} <b>${ssr}</b></td><td>${region}</td><td>${fmt(data.census[ssr])}</td><td style="white-space:normal;max-width:260px">${info.resources.join(' // ')}</td><td>${comps}</td></tr>`;
  }).join('');
}
function renderProduction(){
  const fp=document.getElementById('foodPanel');
  if(fp) fp.innerHTML=Object.entries(data.regions).map(([name,r])=>{
    const pct=Math.min(100,Math.round(r.foodStock/Math.max(1,r.foodDemand)*100)); const ok=r.foodStock>=r.foodDemand;
    return `<div style="margin-bottom:10px"><div style="display:flex;justify-content:space-between"><b style="font:700 11px var(--font-mono)">${name}</b><span class="badge ${ok?'b-good':'b-bad'}">${ok?'✓ COLLECT':'✗ BLOCKED'}</span></div><div class="mono" style="font-size:10px">${fmt(r.foodStock)}🍞 / ${fmt(r.foodDemand)}🍞</div><div class="progress"><i style="width:${pct}%"></i></div></div>`;
  }).join('');
  const ct=document.getElementById('craftTable');
  if(ct) ct.innerHTML=Object.entries(data.crafting_recipes).map(([item,rec])=>{
    const inCost=Object.entries(rec.ingredients).reduce((s,[res,qty])=> s+((data.resource_values[res]||0)*qty),0);
    const margin=rec.value - inCost; const cls=margin>0?'b-good':margin<0?'b-bad':'b-warn';
    return `<tr><td><b>${item}</b></td><td style="white-space:normal;max-width:200px">${Object.entries(rec.ingredients).map(([k,v])=>k+'×'+v).join(' // ')}</td><td>₽${rec.value}</td><td><span class="badge ${cls}">${margin>=0?'+':''}₽${margin}</span></td></tr>`;
  }).join('');
  const bg=document.getElementById('buildGrid');
  if(bg){
    const all={...data.mines, ...data.factories, Store:{cost:25000, emoji:"■", produces:["Retail"], rate:3}};
    const entries=Object.entries(all);
    if(!entries.length){
      bg.innerHTML=Object.entries({ "Iron Mine":{cost:15000,produces:["Iron Ore"],rate:2}, "Coal Mine":{cost:12000,produces:["Coal"],rate:3}, "Steel Mill":{cost:50000,produces:["Steel Ingot"],rate:2}, "Farm":{cost:12000,produces:["Wheat"],rate:3} }).map(([k,m])=>`<div class="stat" style="text-align:left"><b>${k}</b><strong style="font-size:12px">${money(m.cost)}</strong><span>${m.produces.join(' // ')} // ${m.rate}/collect</span></div>`).join('');
    } else {
      bg.innerHTML=entries.map(([name,meta])=>`<div class="stat" style="text-align:left"><b>${name}</b><strong style="font-size:12px">${money(meta.cost||25000)}</strong><span>${(meta.produces||[]).join(' // ')||'—'} // ${meta.rate||3}/collect</span></div>`).join('');
    }
  }
}
async function refreshLoop(){
  if(location.hostname.includes('github.io')) return; // static pages don't poll backend
  try{
    const r=await fetch(location.origin + '/api/ussr/overview',{cache:'no-store', signal:AbortSignal.timeout(4000)});
    if(r.ok){ data=await r.json(); renderStats(); renderGSI(); renderInfl(); renderGold(); renderAI(); renderCons(); renderDemand(); renderCompanies(); renderWorld(); renderProduction(); }
  }catch{}
  setTimeout(refreshLoop,10000);
}
load().catch(e=>{
  const el=document.getElementById('stats');
  if(el) el.innerHTML=`<div class="card" style="grid-column:1/-1;padding:12px;border:3px solid #111;background:#f0b0b0">FAILED: ${String(e.message).slice(0,200)}</div>`;
});
