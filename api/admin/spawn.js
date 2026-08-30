import { verifyPassword, loadEconomy, saveEconomy, pushToGitHub } from './_lib.js';

const SSR_LIST = ["Russian SFSR","Byelorussian SSR","Ukrainian SSR","Moldavian SSR","Estonian SSR","Latvian SSR","Lithuanian SSR","Georgian SSR","Armenian SSR","Azerbaijanian SSR","Kazakh SSR","Uzbek SSR","Turkmen SSR","Nuristani SSR","Kirghiz SSR"];

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Admin-Password');
  if (req.method === 'OPTIONS') return res.status(200).end();

  // GET = list current per-SSR weights (requires auth)
  if (req.method === 'GET') {
    const auth = verifyPassword(req);
    if (!auth.ok) return res.status(auth.status).json({ ok: false, error: auth.error });
    try {
      const data = loadEconomy();
      return res.status(200).json({ ok: true, ssr_resource_weights: data.ssr_resource_weights || {}, global_weights: data.resource_weights || null });
    } catch (e) { return res.status(500).json({ ok: false, error: e.message }); }
  }

  const auth = verifyPassword(req);
  if (!auth.ok) return res.status(auth.status).json({ ok: false, error: auth.error });

  if (req.method === 'DELETE') {
    // body: { ssr, resource, password } OR query
    const { ssr, resource } = req.body || req.query || {};
    if (!ssr || !resource) return res.status(400).json({ ok: false, error: 'ssr and resource required' });
    if (!SSR_LIST.includes(ssr)) return res.status(400).json({ ok: false, error: `Invalid SSR. Valid: ${SSR_LIST.join(', ')}` });
    try {
      const data = loadEconomy();
      if (!data.ssr_resource_weights) data.ssr_resource_weights = {};
      if (!data.ssr_resource_weights[ssr] || data.ssr_resource_weights[ssr][resource] === undefined) {
        return res.status(404).json({ ok: false, error: 'No override for that SSR/resource' });
      }
      delete data.ssr_resource_weights[ssr][resource];
      if (Object.keys(data.ssr_resource_weights[ssr]).length === 0) delete data.ssr_resource_weights[ssr];
      saveEconomy(data);
      const gh = await pushToGitHub(`reset-spawn ${ssr} ${resource}`);
      return res.status(200).json({ ok: true, deleted: true, ssr, resource, github: gh });
    } catch (e) { return res.status(500).json({ ok: false, error: e.message }); }
  }

  if (req.method !== 'POST') return res.status(405).json({ ok: false, error: 'Method not allowed' });

  const { ssr, resource, weight } = req.body || {};
  if (!ssr || !resource || weight === undefined) return res.status(400).json({ ok: false, error: 'ssr, resource, weight required' });
  if (!SSR_LIST.includes(ssr)) return res.status(400).json({ ok: false, error: `Invalid SSR. Valid: ${SSR_LIST.join(', ')}` });
  const w = parseInt(weight);
  if (isNaN(w) || w < 0 || w > 50) return res.status(400).json({ ok: false, error: 'weight 0-50 required' });
  // allow any resource string, but trim
  const resName = String(resource).trim();
  if (!resName) return res.status(400).json({ ok: false, error: 'invalid resource' });

  try {
    const data = loadEconomy();
    if (!data.ssr_resource_weights || typeof data.ssr_resource_weights !== 'object') data.ssr_resource_weights = {};
    if (!data.ssr_resource_weights[ssr]) data.ssr_resource_weights[ssr] = {};
    const old = data.ssr_resource_weights[ssr][resName];
    data.ssr_resource_weights[ssr][resName] = w;
    saveEconomy(data);
    const gh = await pushToGitHub(`set-spawn ${ssr} ${resName} ${w}`);
    return res.status(200).json({ ok: true, ssr, resource: resName, weight: w, old: old ?? null, github: gh });
  } catch (e) {
    return res.status(500).json({ ok: false, error: e.message });
  }
}
