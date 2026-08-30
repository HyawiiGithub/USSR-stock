import { verifyPassword, loadEconomy } from './_lib.js';

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Admin-Password');
  res.setHeader('Cache-Control', 'no-store');
  if (req.method === 'OPTIONS') return res.status(200).end();
  const auth = verifyPassword(req);
  if (!auth.ok) return res.status(auth.status).json({ ok: false, error: auth.error });

  try {
    const data = loadEconomy();
    const users = data.users || {};
    const list = Object.entries(users).map(([id, u]) => ({
      id,
      username: u.username || id.slice(0,6),
      cash: u.cash || 0,
      bank: u.bank || 0,
      total: (u.cash||0)+(u.bank||0),
      ssr_region: u.ssr_region || null,
      employed_at: u.employed_at || null,
      is_employed: !!u.is_employed,
      work_count: u.work_count || 0,
      is_state_director: !!u.is_state_director,
      director_of: u.director_of || null
    })).sort((a,b)=> b.total - a.total).slice(0,30);
    return res.status(200).json({ ok: true, users: list, total_users: Object.keys(users).length });
  } catch (e) {
    return res.status(500).json({ ok: false, error: e.message });
  }
}
