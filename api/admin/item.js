import { verifyPassword, loadEconomy, saveEconomy, pushToGitHub } from './_lib.js';

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Admin-Password');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ ok: false, error: 'Method not allowed' });
  const auth = verifyPassword(req);
  if (!auth.ok) return res.status(auth.status).json({ ok: false, error: auth.error });

  const { name, value, food, weight } = req.body || {};
  if (!name || typeof name !== 'string' || !name.trim()) return res.status(400).json({ ok: false, error: 'name required' });
  const v = parseInt(value);
  if (isNaN(v) || v < 1) return res.status(400).json({ ok: false, error: 'value must be >=1' });
  const fv = food !== undefined ? parseInt(food) : 0;
  const w = weight !== undefined ? parseInt(weight) : 5;
  if (isNaN(w) || w < 0 || w > 50) return res.status(400).json({ ok: false, error: 'weight 0-50' });

  try {
    const data = loadEconomy();
    // resource_values global fallback
    if (!data.resource_values) data.resource_values = {};
    data.resource_values[name.trim()] = v;
    // also store food value if relevant: create custom field resource_food
    if (fv > 0) {
      if (!data.resource_food) data.resource_food = {};
      data.resource_food[name.trim()] = fv;
    }
    // global weights stored separately? bot uses RESOURCE_WEIGHTS constant, but we persist in resource_weights
    if (!data.resource_weights) data.resource_weights = {};
    data.resource_weights[name.trim()] = w;
    saveEconomy(data);
    const gh = await pushToGitHub(`add-item ${name.trim()}`);
    return res.status(200).json({ ok: true, name: name.trim(), github: gh });
  } catch (e) { return res.status(500).json({ ok: false, error: e.message }); }
}
