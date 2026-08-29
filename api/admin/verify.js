// Vercel Serverless — verifies admin password via secret env, never exposes it to GitHub
// Set ADMIN_PASSWORD in Vercel Dashboard → Settings → Environment Variables (all envs)
// Also set locally in .env file for `vercel dev`
export default function handler(req, res) {
  // CORS for static site
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ ok: false, error: 'Method not allowed' });

  const secret = process.env.ADMIN_PASSWORD;
  if (!secret) {
    // No secret configured — fallback to allow local dev via localStorage (admin.html handles it)
    return res.status(500).json({ ok: false, error: 'ADMIN_PASSWORD not set on server' });
  }
  const { password } = req.body || {};
  if (typeof password !== 'string') return res.status(400).json({ ok: false, error: 'Missing password' });

  const ok = password === secret;
  // Optional: rate-limit / log failures here
  if (!ok) return res.status(401).json({ ok: false });

  return res.status(200).json({ ok: true });
}
