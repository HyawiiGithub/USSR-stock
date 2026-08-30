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
    const logs = (data.owner_logs || []).slice(-100).reverse();
    const comp = (data.compensation_log || []).slice(-20).reverse();
    return res.status(200).json({ ok: true, owner_logs: logs, total: (data.owner_logs||[]).length, compensation_log: comp });
  } catch (e) {
    return res.status(500).json({ ok: false, error: e.message });
  }
}
