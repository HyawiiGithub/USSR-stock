import { verifyPassword, loadEconomy, saveEconomy, pushToGitHub, logOwnerAction } from './_lib.js';

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Admin-Password');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ ok: false, error: 'Method not allowed' });
  const auth = verifyPassword(req);
  if (!auth.ok) return res.status(auth.status).json({ ok: false, error: auth.error });

  const { name, type, cost, produces, requires, rate } = req.body || {};
  if (!name || typeof name !== 'string' || !name.trim()) return res.status(400).json({ ok: false, error: 'name required' });
  const t = (type || 'mine').toLowerCase();
  if (!['mine','factory','store'].includes(t)) return res.status(400).json({ ok: false, error: 'type must be mine/factory/store' });
  const c = parseInt(cost);
  if (isNaN(c) || c < 0) return res.status(400).json({ ok: false, error: 'cost must be >=0' });
  let prod = produces;
  if (typeof prod === 'string') { try { prod = JSON.parse(prod); } catch { return res.status(400).json({ ok:false, error:'produces JSON invalid, e.g. [\"Canned Fish\"]' }); } }
  if (!Array.isArray(prod)) prod = prod ? [prod] : [];
  let reqs = requires;
  if (typeof reqs === 'string' && reqs.trim()) { try { reqs = JSON.parse(reqs); } catch { return res.status(400).json({ ok:false, error:'requires JSON invalid' }); } }
  if (!reqs || typeof reqs !== 'object' || Array.isArray(reqs)) reqs = {};
  const r = parseInt(rate) || 2;

  try {
    const data = loadEconomy();
    if (!data.buildings) data.buildings = {};
    // store custom buildings definition for admin visibility; bot will read buildings_data or similar if wired
    // we store in data.custom_buildings
    if (!data.custom_buildings) data.custom_buildings = {};
    data.custom_buildings[name.trim()] = { type: t, cost: c, produces: prod, requires: reqs, rate: r };
    logOwnerAction(data, 'add-building', `${name.trim()} type=${t} cost=${c}`, req.headers['x-admin-username'] || 'admin-panel');
    saveEconomy(data);
    const gh = await pushToGitHub(`add-building ${name.trim()}`);
    return res.status(200).json({ ok: true, name: name.trim(), github: gh });
  } catch (e) { return res.status(500).json({ ok: false, error: e.message }); }
}
