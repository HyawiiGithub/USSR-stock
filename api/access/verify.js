import fs from 'fs';
import path from 'path';
import crypto from 'crypto';

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  res.setHeader('Cache-Control', 'no-store');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ ok: false, error: 'Method not allowed' });

  const { code } = req.body || {};
  if (!code || typeof code !== 'string') return res.status(400).json({ ok: false, error: 'Missing code' });
  const upper = code.trim().toUpperCase();

  // Try to read private access codes from Vercel file system (economy_data.json on server, or access_codes.json)
  // On Vercel, economy_data.json is in cwd, but public GitHub push has hashed version — we check both plain and hashed
  let found = null;
  let perms = null;

  // 1) Try reading private file (if bot hasn't filtered, this will be plain)
  try {
    const p1 = path.join(process.cwd(), 'economy_data.json');
    if (fs.existsSync(p1)) {
      const j = JSON.parse(fs.readFileSync(p1, 'utf8'));
      if (j.access_codes && j.access_codes[upper]) {
        found = j.access_codes[upper];
        perms = found.permissions;
      } else if (j.access_codes_hashed) {
        const hash = crypto.createHash('sha256').update(upper).digest('hex').slice(0, 16);
        if (j.access_codes_hashed[hash]) {
          found = j.access_codes_hashed[hash];
          perms = found.permissions;
        }
      }
    }
  } catch {}

  // 2) Try access_codes.json (private, gitignored)
  if (!found) {
    try {
      const p2 = path.join(process.cwd(), 'access_codes.json');
      if (fs.existsSync(p2)) {
        const j2 = JSON.parse(fs.readFileSync(p2, 'utf8'));
        if (j2[upper]) {
          found = j2[upper];
          perms = found.permissions;
        } else {
          const hash2 = crypto.createHash('sha256').update(upper).digest('hex').slice(0, 16);
          // check hashed keys
          for (const [k,v] of Object.entries(j2)) {
            const h = crypto.createHash('sha256').update(k).digest('hex').slice(0, 16);
            if (h === hash2 || k === hash2) { found = v; perms = v.permissions; break; }
          }
        }
      }
    } catch {}
  }

  if (!found) return res.status(401).json({ ok: false, error: 'Invalid code' });
  if (found.expiresAt && new Date(found.expiresAt).getTime() < Date.now()) return res.status(401).json({ ok: false, error: 'Code expired' });

  return res.status(200).json({ ok: true, permissions: perms, code: upper });
}
