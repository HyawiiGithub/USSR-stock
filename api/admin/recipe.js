import { verifyPassword, loadEconomy, saveEconomy, pushToGitHub } from './_lib.js';

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Admin-Password');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ ok: false, error: 'Method not allowed' });
  const auth = verifyPassword(req);
  if (!auth.ok) return res.status(auth.status).json({ ok: false, error: auth.error });

  const { name, value, emoji, ingredients } = req.body || {};
  if (!name || typeof name !== 'string' || !name.trim()) return res.status(400).json({ ok: false, error: 'name required' });
  const v = parseInt(value);
  if (isNaN(v) || v < 1) return res.status(400).json({ ok: false, error: 'value must be >=1' });
  let ing = ingredients;
  if (typeof ing === 'string') { try { ing = JSON.parse(ing); } catch { return res.status(400).json({ ok: false, error: 'ingredients JSON invalid' }); } }
  if (!ing || typeof ing !== 'object' || Array.isArray(ing)) return res.status(400).json({ ok: false, error: 'ingredients must be object e.g. {"Fish":2}' });

  try {
    const data = loadEconomy();
    // store in crafting_recipes if exists, else create custom_recipes
    if (!data.crafting_recipes) data.crafting_recipes = {};
    // also ensure market_demand entry exists so it shows in graphs
    data.crafting_recipes[name.trim()] = { value: v, ingredients: ing, emoji: emoji || '📦' };
    if (!data.market_demand) data.market_demand = {};
    if (data.market_demand[name.trim()] === undefined) data.market_demand[name.trim()] = 1.0;
    saveEconomy(data);
    const gh = await pushToGitHub(`add-recipe ${name.trim()}`);
    return res.status(200).json({ ok: true, name: name.trim(), github: gh });
  } catch (e) { return res.status(500).json({ ok: false, error: e.message }); }
}
