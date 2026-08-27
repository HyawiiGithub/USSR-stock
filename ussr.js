// USSR Economy frontend - FULL bot integration, smooth charts
const fmt = n => n==null||isNaN(n) ? '—' : new Intl.NumberFormat('en-US').format(n);
const money = n => '₽'+fmt(Math.round(n));
let data=null, charts={};
let dmItem=null;

function setClock(){
  const d=new Date();
  // MSK UTC+3
  const msk=new Date(d.toLocaleString('en-US',{timeZone:'Europe/Moscow'}));
  document.getElementById('clock').textContent = msk.toLocaleTimeString('en-GB',{hour12:false})+' MSK';
}
setInterval(setClock,1000); setClock();

function nav(){
  document.querySelectorAll('#nav button').forEach(b=>b.addEventListener('click',()=>{
    document.querySelectorAll('#nav button').forEach(x=>x.classList.remove('active'));
    b.classList.add('active');
    const v=b.dataset.view;
    document.querySelectorAll('[id^="view-"]').forEach(el=>el.classList.add('hidden'));
    document.getElementById('view-'+v).classList.remove('hidden');
    setTimeout(()=>{ Object.values(charts).forEach(c=>c && c.resize()); }, 80);
  }));
}
nav();

function fallbackMock(){
  // client-side fallback for GitHub Pages (no backend) — mirrors ussr-economy-data.mjs
  const RV={ Gold:150, "Iron Ore":24, Coal:16, Oil:64, "Natural Gas":48, Timber:13, Wheat:8, Fish:14, Copper:32, Lead:40, Uranium:320, Limestone:16, Clay:8, Sugar:10, Potash:56, Peat:13, Manganese:96, "Oil Shale":19, Phosphorite:40, "Aluminium Ore":64, Antimony:128, Molybdenum:160, Sunflower:12, Flax:18, Corn:10, Salt:8, Tea:30, Citrus:20, Grapes:20, Wine:60, Sulphur:25, Aluminium:80, Cotton:24 };
  const REC={ "Steel Ingot":40, "Iron Ingot":40, "Copper Ingot":48, "Gold Bar":560, "Aluminium Ingot":55, "Timber Planks":16, "Bricks":29, "Concrete":40, "Glass":32, "Steel Beam":128, "Machine Parts":72, "Fuel":64, "Refined Fuel":128, "Uranium Rod":256, "Reactor Core":800, "Circuit Board":88, "Flour":25, "Bread":45, "Cake":80, "Wine":60, "Canned Food":48, "Canned Fish":62, "Smoked Fish":48, "Fish Stew":55 };
  const now=Date.now();
  const gsi=[]; let p=100; for(let i=0;i<100;i++){ const d=(Math.random()*2-1)*0.015; p=Math.max(1,Math.floor(p*(1+d))); gsi.push({price:p, change_percent:+(d*100).toFixed(2), recorded_at:new Date(now-(100-i)*3600000).toISOString()}); } gsi[0].change_percent=0; gsi[0].price=100;
  const infl=[]; let inf=2.4; for(let i=0;i<100;i++){ inf+=(Math.random()-0.48)*0.6; inf=Math.max(0,Math.min(42,inf)); infl.push(+inf.toFixed(2)); }
  const companies=["SNE","SSW","SOG","SAG","SMC","BTH","RSS","UHI"].map((t,i)=>({id:"c"+i,name:t,ticker:t,specialization:i<2?"extraction":i<4?"agriculture":"production",hq_ssr:["Russian SFSR","Ukrainian SSR","Azerbaijanian SSR","Kazakh SSR","Nuristani SSR","Estonian SSR","Russian SFSR","Ukrainian SSR"][i],employees:8+Math.floor(Math.random()*12),funds:60000+Math.floor(Math.random()*200000),share_price:120+Math.floor(Math.random()*400),price_history:Array.from({length:100},(_,k)=>100+Math.floor(Math.random()*200)),market_cap:0,buildings:{"Store":{level:2}},inventory:{"Steel Ingot":Math.floor(Math.random()*20),"Iron Ore":10},is_state_owned:i<4,wage:18, ceo:"State"}));
  companies.forEach(c=>c.market_cap=c.share_price*1000);
  const market_demand={}, market_supply={}, demand_history={}; Object.keys(REC).forEach(k=>{ market_demand[k]=+(0.8+Math.random()*0.6).toFixed(3); market_supply[k]=Math.floor(Math.random()*80); demand_history[k]=Array.from({length:60},()=>({demand:+(0.7+Math.random()*0.6).toFixed(3), at:new Date().toISOString(), supply:20})); });
  const ai_store={}; Object.keys(REC).slice(0,8).forEach(k=>ai_store[k]=Math.floor(Math.random()*40)+1);
  const global_consumption={}; Object.keys(REC).slice(0,8).forEach(k=>global_consumption[k]=Math.floor(Math.random()*150)+10);
  return { gsi_history:gsi, inflation_history:infl, inflation:infl[infl.length-1], money_printed:500000, total_bank_reserves:900000, companies, market_demand, market_supply, demand_history, ai_store, global_consumption, consumption_history:[], gold:{price:Math.floor(RV.Gold*(1+infl[infl.length-1]/100)), stock:500, moneySupply:3000000, backing:2.5, status:"FIAT CURRENCY"}, census:{ "Russian SFSR":12, "Ukrainian SSR":10, "Kazakh SSR":8, "Estonian SSR":6, "Georgian SSR":7, "Nuristani SSR":9, "Uzbek SSR":5, "Turkmen SSR":4, "Kirghiz SSR":6, "Azerbaijanian SSR":7, "Armenian SSR":5, "Byelorussian SSR":6, "Moldavian SSR":4, "Latvian SSR":5, "Lithuanian SSR":5 }, regions:{ "Russian Federal Republic Region":{ssrs:["Russian SFSR"],pop:12,employees:20,companies:2,foodStock:80,foodDemand:50,zone:"x",foodRatio:1.6}, "Western Soviet Region":{ssrs:["Byelorussian SSR","Ukrainian SSR","Moldavian SSR"],pop:20,employees:18,companies:2,foodStock:120,foodDemand:60,zone:"x",foodRatio:2}, "Baltic Soviet Region":{ssrs:["Estonian SSR","Latvian SSR","Lithuanian SSR"],pop:16,employees:15,companies:1,foodStock:90,foodDemand:45,zone:"x",foodRatio:2}, "Caucasus Soviet Region":{ssrs:["Georgian SSR","Armenian SSR","Azerbaijanian SSR"],pop:18,employees:14,companies:1,foodStock:70,foodDemand:55,zone:"x",foodRatio:1.27}, "Central Asian Soviet Region":{ssrs:["Kazakh SSR","Uzbek SSR","Turkmen SSR","Kirghiz SSR"],pop:23,employees:22,companies:2,foodStock:110,foodDemand:70,zone:"x",foodRatio:1.57}, "Nuristani Soviet Region":{ssrs:["Nuristani SSR"],pop:9,employees:12,companies:1,foodStock:60,foodDemand:40,zone:"x",foodRatio:1.5} }, ssr_regions:{ "Russian SFSR":{emoji:"🇷🇺",work_zone:"x",resources:["Coal","Iron Ore","Timber","Oil"]}, "Ukrainian SSR":{emoji:"🇺🇦",work_zone:"x",resources:["Coal","Wheat"]}, "Kazakh SSR":{emoji:"🇰🇿",work_zone:"x",resources:["Uranium","Coal"]}, "Estonian SSR":{emoji:"🇪🇪",work_zone:"x",resources:["Fish","Timber"]}, "Nuristani SSR":{emoji:"🇹🇯",work_zone:"x",resources:["Gold","Uranium"]} }, work_zones:{}, resource_values:RV, crafting_recipes:Object.fromEntries(Object.entries(REC).map(([k,v])=> [k,{value:v,ingredients:{"Iron Ore":2},emoji:"🔩"}])), mines:{}, factories:{}, generated_at:new Date().toISOString() };
}
async function load(){
  try{
    const r=await fetch('/api/ussr/overview',{cache:'no-store'});
    if(!r.ok) throw new Error(r.status);
    data=await r.json();
  }catch(e){
    console.warn("USSR API unavailable, using client mock",e.message);
    data=fallbackMock();
  }
  document.getElementById('genAt').textContent = new Date(data.generated_at).toLocaleString();
  document.getElementById('footGen').textContent = new Date(data.generated_at).toLocaleString();
  renderStats();
  renderGSI();
  renderInfl();
  renderGold();
  renderAI();
  renderCons();
  renderDemand();
  renderCompanies();
  renderWorld();
  renderProduction();
  // auto refresh 10s smoother (preserve chart instances via update)
  setTimeout(refreshLoop, 10000);
}

function renderStats(){
  const gsi=data.gsi_history[data.gsi_history.length-1];
  const prev=data.gsi_history[data.gsi_history.length-2];
  const ch = prev ? ((gsi.price-prev.price)/prev.price*100).toFixed(2) : gsi.change_percent.toFixed(2);
  const infl=data.inflation;
  const comps=data.companies.length;
  const totalMcap=data.companies.reduce((s,c)=>s+c.market_cap,0);
  document.getElementById('stats').innerHTML = `
    <div class="stat"><b>GSI Index</b><strong class="mono">₽${fmt(gsi.price)}</strong><span class="${ch>=0?'b-good':'b-bad'}" style="padding:2px 8px;border-radius:999px;border:1px solid">${ch>=0?'+':''}${ch}% · ${data.gsi_history.length} pts</span></div>
    <div class="stat"><b>Inflation</b><strong>${infl.toFixed(2)}%</strong><span>printed ₽${fmt(data.money_printed)} · reserves ₽${fmt(data.total_bank_reserves)}</span></div>
    <div class="stat"><b>Gold Backing</b><strong>${data.gold.backing.toFixed(1)}%</strong><span class="badge ${data.gold.backing>=100?'b-good':data.gold.backing>=50?'b-warn':'b-bad'}">${data.gold.status}</span></div>
    <div class="stat"><b>Companies</b><strong>${comps}</strong><span>cap ${money(totalMcap)} · ${data.companies.filter(c=>c.is_state_owned).length} state</span></div>
  `;
}

function mkChart(id, cfg){
  const canvas=document.getElementById(id);
  if(!canvas) return null;
  if(charts[id]) charts[id].destroy();
  charts[id]=new Chart(canvas.getContext('2d'), cfg);
  return charts[id];
}

function renderGSI(){
  const labels=data.gsi_history.map((x,i)=>i);
  const prices=data.gsi_history.map(x=>x.price);
  const last=data.gsi_history[data.gsi_history.length-1];
  document.getElementById('gsiChange').textContent = (last.change_percent>=0?'+':'')+last.change_percent.toFixed(2)+'%';
  document.getElementById('gsiChange').className = last.change_percent>=0 ? 'b-good' : 'b-bad';
  mkChart('chartGSI',{
    type:'line',
    data:{labels, datasets:[{data:prices, borderColor:'#efc94c', backgroundColor:'rgba(239,201,76,.14)', borderWidth:2, fill:true, tension:.32, pointRadius:0}]},
    options:{responsive:true,maintainAspectRatio:false,animation:{duration:600},plugins:{legend:{display:false},tooltip:{callbacks:{label:c=>' ₽'+c.parsed.y}}},scales:{x:{display:false},y:{ticks:{color:'#6e6656',font:{size:10}},grid:{color:'rgba(0,0,0,.06)'}}}}
  });
  // full copy
  mkChart('chartGSIFull',{
    type:'line',
    data:{labels, datasets:[{label:'GSI', data:prices, borderColor:'#7a0f0f', backgroundColor:'rgba(122,15,15,.08)', fill:true, tension:.32, pointRadius:0}]},
    options:{responsive:true,maintainAspectRatio:false,plugins:{legend:{display:false}},scales:{y:{ticks:{color:'#6e6656'}},x:{ticks:{color:'#6e6656', maxTicksLimit:8}}}}
  });
}

function renderInfl(){
  const labels=data.inflation_history.map((_,i)=>i);
  mkChart('chartInfl',{
    type:'line',
    data:{labels, datasets:[{data:data.inflation_history, borderColor:'#b82020', backgroundColor:'rgba(184,32,32,.10)', borderWidth:2, fill:true, tension:.3, pointRadius:0}]},
    options:{responsive:true,maintainAspectRatio:false,animation:{duration:600},plugins:{legend:{display:false},tooltip:{callbacks:{label:c=>c.parsed.y.toFixed(2)+'%'}}},scales:{x:{display:false},y:{ticks:{callback:v=>v+'%',color:'#6e6656'},grid:{color:'rgba(0,0,0,.06)'}}}}
  });
  mkChart('chartInflFull',{
    type:'line',
    data:{labels, datasets:[{label:'Inflation %', data:data.inflation_history, borderColor:'#b82020', fill:false, tension:.3, pointRadius:0}]},
    options:{responsive:true,maintainAspectRatio:false,plugins:{legend:{display:false}},scales:{y:{ticks:{callback:v=>v+'%'}},x:{ticks:{maxTicksLimit:8}}}}
  });
}

function renderGold(){
  const g=data.gold;
  const pct=Math.min(100, Math.max(0, g.backing));
  // gauge uses 0-100% visual, but label shows actual (can exceed 100)
  document.getElementById('goldGauge').style.setProperty('--pct', pct+'%');
  document.getElementById('goldPct').textContent = g.backing.toFixed(1)+'%';
  document.getElementById('goldStatus').textContent = g.status;
  document.getElementById('goldStatus').className = g.backing>=100?'b-good':g.backing>=50?'b-warn':'b-bad';
  document.getElementById('goldPrice').textContent = '₽'+fmt(g.price);
  document.getElementById('goldStock').textContent = fmt(g.stock);
  document.getElementById('goldMeta').textContent = `Money supply ₽${fmt(g.moneySupply)} · backing ${money(g.stock * g.price)} / ${money(g.moneySupply)}`;
}

function renderAI(){
  const entries=Object.entries(data.ai_store).sort((a,b)=>b[1]-a[1]).slice(0,10);
  document.getElementById('aiCount').textContent = Object.keys(data.ai_store).length+' SKUs · '+fmt(Object.values(data.ai_store).reduce((s,v)=>s+v,0))+' units';
  mkChart('chartAI',{
    type:'bar',
    data:{labels:entries.map(e=>e[0].slice(0,12)), datasets:[{data:entries.map(e=>e[1]), backgroundColor:'#2d7a48'}]},
    options:{indexAxis:'y',responsive:true,maintainAspectRatio:false,animation:{duration:600},plugins:{legend:{display:false}},scales:{x:{ticks:{color:'#6e6656'}},y:{ticks:{color:'#6e6656',font:{size:10}}}}}
  });
  document.getElementById('aiList').textContent = entries.map(e=>e[0]+' ×'+e[1]).join(' · ') || 'Store empty — waiting for factory goods.';
}

function renderCons(){
  const entries=Object.entries(data.global_consumption).sort((a,b)=>b[1]-a[1]).slice(0,10);
  mkChart('chartCons',{
    type:'bar',
    data:{labels:entries.map(e=>e[0].slice(0,12)), datasets:[{data:entries.map(e=>e[1]), backgroundColor:'#7a0f0f'}]},
    options:{responsive:true,maintainAspectRatio:false,animation:{duration:600},plugins:{legend:{display:false}},scales:{y:{ticks:{color:'#6e6656'}},x:{ticks:{color:'#6e6656',font:{size:9},maxRotation:30}}}}
  });
}

function renderDemand(){
  const items=Object.keys(data.market_demand).sort();
  const tabs=document.getElementById('demandTabs');
  tabs.innerHTML = items.slice(0,10).map((k,i)=>`<button class="${i===0?'active':''}" data-item="${k}">${k}</button>`).join('') + `<span class="mono" style="font-size:10px;color:var(--muted);margin-left:8px">${items.length} products</span>`;
  tabs.querySelectorAll('button').forEach(b=>b.addEventListener('click',()=>{
    tabs.querySelectorAll('button').forEach(x=>x.classList.remove('active'));
    b.classList.add('active');
    dmItem=b.dataset.item;
    renderDemandTable();
    renderDMChart();
  }));
  dmItem = dmItem || items[0];
  renderDemandTable();
  // dm tabs
  const dmTabs=document.getElementById('dmTabs');
  dmTabs.innerHTML = Object.keys(data.demand_history).map((k,i)=>`<button class="${k===dmItem?'active':''}" data-item="${k}">${k}</button>`).join('');
  dmTabs.querySelectorAll('button').forEach(b=>b.addEventListener('click',()=>{
    dmTabs.querySelectorAll('button').forEach(x=>x.classList.remove('active'));
    b.classList.add('active');
    dmItem=b.dataset.item;
    renderDMChart();
  }));
  renderDMChart();
}

function renderDemandTable(){
  const rows=Object.keys(data.market_demand).sort().map(item=>{
    const dem=data.market_demand[item];
    const sup=data.market_supply[item];
    const pct=Math.round(dem*100);
    const sFac=(1.35 - (Math.min(sup,120)/120)*0.75);
    const barPct=Math.round(((dem-0.6)/0.9)*100);
    const supPct=Math.round(((sFac-0.6)/0.8)*100);
    return `<tr><td><strong>${item}</strong></td><td><span class="mono">${pct}%</span><div class="bar" style="margin-top:4px"><i style="width:${barPct}%"></i></div></td><td><span class="mono">${(sFac*100).toFixed(0)}%</span><div class="bar"><i style="width:${supPct}%;background:linear-gradient(90deg,#2a4a6a,#4a8a68)"></i></div></td><td class="mono">${fmt(sup)}</td><td class="mono">${money(data.crafting_recipes[item]?.value || 0)}</td></tr>`;
  }).join('');
  document.getElementById('demandTable').innerHTML = `<div class="table-wrap"><table><thead><tr><th>Item</th><th>Demand</th><th>Supply factor</th><th>Supply units</th><th>Base value</th></tr></thead><tbody>${rows}</tbody></table></div>`;
}

function renderDMChart(){
  if(!dmItem || !data.demand_history[dmItem]) {
    // fallback simple
    const items=Object.keys(data.demand_history);
    dmItem=items[0];
  }
  const hist=data.demand_history[dmItem] || [];
  mkChart('chartDM',{
    type:'line',
    data:{labels:hist.map((_,i)=>i), datasets:[{label:dmItem, data:hist.map(h=>h.demand*100), borderColor:'#efc94c', backgroundColor:'rgba(239,201,76,.12)', fill:true, tension:.32, pointRadius:0}]},
    options:{responsive:true,maintainAspectRatio:false,animation:{duration:500},plugins:{legend:{display:false},tooltip:{callbacks:{label:c=>c.parsed.y.toFixed(1)+'%' }}},scales:{y:{min:55,max:155,ticks:{callback:v=>v+'%'}},x:{display:false}}}
  });
}

function renderCompanies(){
  document.getElementById('compStats').innerHTML = `
    <div class="stat"><b>Total Market Cap</b><strong>${money(data.companies.reduce((s,c)=>s+c.market_cap,0))}</strong><span>${data.companies.length} corps</span></div>
    <div class="stat"><b>Avg Share Price</b><strong>₽${fmt(Math.round(data.companies.reduce((s,c)=>s+c.share_price,0)/data.companies.length))}</strong><span>state ${data.companies.filter(c=>c.is_state_owned).length}</span></div>
    <div class="stat"><b>Total Employees</b><strong>${fmt(data.companies.reduce((s,c)=>s+c.employees,0))}</strong><span>avg wage ₽${(data.companies.reduce((s,c)=>s+c.wage,0)/data.companies.length).toFixed(1)}</span></div>
    <div class="stat"><b>Top Cap</b><strong>${data.companies.slice().sort((a,b)=>b.market_cap-a.market_cap)[0].ticker}</strong><span>${money(Math.max(...data.companies.map(c=>c.market_cap)))}</span></div>
  `;
  document.getElementById('compGrid').innerHTML = data.companies.map(c=>`
    <div class="card" style="border-top:4px solid ${c.is_state_owned?'#b82020':'#2d7a48'}">
      <div class="card-b">
        <div style="display:flex;justify-content:space-between;gap:8px;align-items:start">
          <div><div class="mono" style="font-size:10px;color:var(--muted);letter-spacing:.08em">${c.is_state_owned?'STATE ·':'PRIVATE ·'} ${c.specialization?.toUpperCase()||'—'}</div><div style="font:800 16px var(--font-display);color:var(--red-deep)">${c.name}</div><div class="mono" style="font-size:11px;color:var(--muted)">${c.ticker} · ${c.hq_ssr} ${data.ssr_regions[c.hq_ssr]?.emoji||''} · ${c.employees} workers</div></div>
          <span class="badge ${c.is_state_owned?'b-bad':'b-good'}">${c.is_state_owned?'STATE':'PRIVATE'}</span>
        </div>
        <div class="grid grid-2" style="margin-top:10px">
          <div class="stat" style="padding:8px"><b>Share</b><strong class="mono" style="font-size:16px">₽${fmt(c.share_price)}</strong><span>cap ${money(c.market_cap)}</span></div>
          <div class="stat" style="padding:8px"><b>Funds</b><strong class="mono" style="font-size:16px">₽${fmt(c.funds)}</strong><span>wage ₽${c.wage}</span></div>
        </div>
        <div class="mono" style="font-size:10px;color:var(--muted);margin-top:8px">${Object.entries(c.buildings).map(([k,v])=>k+' Lv'+v.level).join(' · ')}</div>
        <div class="mono" style="font-size:10px;color:var(--muted);margin-top:4px;white-space:normal">${Object.entries(c.inventory).slice(0,5).map(([k,v])=>k+'×'+v).join(' · ')}</div>
      </div>
    </div>
  `).join('');
  const sorted=data.companies.slice().sort((a,b)=>b.market_cap-a.market_cap).slice(0,10);
  mkChart('chartComps',{
    type:'bar',
    data:{labels:sorted.map(c=>c.ticker), datasets:[{label:'Market Cap', data:sorted.map(c=>c.market_cap), backgroundColor:sorted.map(c=>c.is_state_owned?'#b82020':'#2d7a48')}]},
    options:{responsive:true,maintainAspectRatio:false,animation:{duration:600},plugins:{legend:{display:false}},scales:{y:{ticks:{callback:v=>'₽'+(v/1000).toFixed(0)+'k'}},x:{ticks:{color:'#6e6656'}}}}
  });
}

function renderWorld(){
  const regs=Object.entries(data.regions);
  document.getElementById('regionStats').innerHTML = `
    <div class="stat"><b>Empire Pop</b><strong>${fmt(Object.values(data.census).reduce((s,v)=>s+v,0))}</strong><span>15 SSRs · 6 regions</span></div>
    <div class="stat"><b>Food Stock</b><strong>${fmt(regs.reduce((s,[,r])=>s+r.foodStock,0))} 🍞</strong><span>units</span></div>
    <div class="stat"><b>Regions Strained</b><strong>${regs.filter(([,r])=>r.foodStock < r.foodDemand).length}/6</strong><span>stock &lt; demand</span></div>
  `;
  document.getElementById('regionGrid').innerHTML = regs.map(([name,r])=>{
    const pct=Math.min(100, Math.round(r.foodStock / Math.max(1,r.foodDemand)*100));
    const ok=r.foodStock >= r.foodDemand;
    return `<div class="region" style="border-left-color:${ok?'#2d7a48':'#b82020'}">
      <div style="display:flex;justify-content:space-between;align-items:center"><h4>${name}</h4><span class="badge ${ok?'b-good':'b-bad'}">${ok?'FED':'HUNGRY'}</span></div>
      <div class="meta">${r.ssrs.length} SSRs · ${r.companies} corps · ${r.employees} workers · pop ${r.pop}</div>
      <div class="meta" style="margin-top:6px">Food ${fmt(r.foodStock)} / ${fmt(r.foodDemand)} 🍞 · ${pct}%</div>
      <div class="progress"><i style="width:${pct}%"></i></div>
      <div class="mono" style="font-size:10px;color:var(--muted);margin-top:6px;white-space:normal">${r.ssrs.join(' · ')}</div>
    </div>`;
  }).join('');
  document.getElementById('ssrTable').innerHTML = Object.entries(data.ssr_regions).map(([ssr,info])=>{
    const region=Object.entries(data.work_zones).find(([,z])=>z===info.work_zone)?.[0] || '—';
    const comps=data.companies.filter(c=>c.hq_ssr===ssr).length;
    return `<tr><td>${info.emoji} <strong>${ssr}</strong></td><td>${region}</td><td class="mono">${fmt(data.census[ssr])}</td><td style="white-space:normal;max-width:280px">${info.resources.join(' · ')}</td><td class="mono">${comps}</td></tr>`;
  }).join('');
}

function renderProduction(){
  // food panel
  document.getElementById('foodPanel').innerHTML = Object.entries(data.regions).map(([name,r])=>{
    const pct=Math.min(100, Math.round(r.foodStock / Math.max(1,r.foodDemand)*100));
    const ok=r.foodStock >= r.foodDemand;
    return `<div style="margin-bottom:10px"><div style="display:flex;justify-content:space-between;align-items:center"><strong style="font-size:13px">${name}</strong><span class="badge ${ok?'b-good':'b-bad'}">${ok?'✓ Collect':'✗ Blocked'}</span></div><div class="mono" style="font-size:11px;color:var(--muted)">${fmt(r.foodStock)}🍞 / ${fmt(r.foodDemand)}🍞</div><div class="progress"><i style="width:${pct}%"></i></div></div>`;
  }).join('');

  // crafting
  document.getElementById('craftTable').innerHTML = Object.entries(data.crafting_recipes).map(([item, rec])=>{
    const inCost=Object.entries(rec.ingredients).reduce((s,[res,qty])=>s+(data.resource_values[res]||0)*qty, 0);
    const margin=rec.value - inCost;
    const cls=margin>0?'b-good':margin<0?'b-bad':'b-warn';
    return `<tr><td>${rec.emoji} <strong>${item}</strong></td><td class="mono" style="white-space:normal;max-width:220px">${Object.entries(rec.ingredients).map(([k,v])=>k+'×'+v).join(' · ')}</td><td class="mono">₽${rec.value}</td><td><span class="badge ${cls}">${margin>=0?'+':''}₽${margin}</span></td></tr>`;
  }).join('');

  // buildings
  const allBuildings={...data.mines, ...data.factories, Store:{cost:25000, emoji:'🏪', produces:['Retail'], rate:3}};
  document.getElementById('buildGrid').innerHTML = Object.entries(allBuildings).map(([name, meta])=>`
    <div class="stat" style="text-align:left;padding:12px"><div style="font:700 13px var(--font-display)">${meta.emoji} ${name}</div><div class="mono" style="font-size:11px;color:var(--muted)">cost ${money(meta.cost)} · rate ${meta.rate}/collect</div><div class="mono" style="font-size:10px;color:var(--muted);margin-top:4px">${(meta.produces||[]).join(' · ') || '—'}</div></div>
  `).join('');
}

async function refreshLoop(){
  try{
    const r=await fetch('/api/ussr/overview',{cache:'no-store'});
    const next=await r.json();
    data=next;
    document.getElementById('genAt').textContent = new Date(data.generated_at).toLocaleString();
    document.getElementById('footGen').textContent = new Date(data.generated_at).toLocaleString();
    renderStats(); renderGSI(); renderInfl(); renderGold(); renderAI(); renderCons(); renderDemand(); renderCompanies(); renderWorld(); renderProduction();
  }catch(e){ /* silent */ }
  setTimeout(refreshLoop, 10000);
}

load().catch(e=>{
  document.getElementById('stats').innerHTML = `<div class="card" style="grid-column:1/-1;padding:16px;color:#6b0c0c">Failed to load USSR economy: ${e.message}</div>`;
});
