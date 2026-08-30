import fs from 'fs';
import path from 'path';

// Shared helpers for admin APIs
export function getDataFile() {
  return path.join(process.cwd(), 'economy_data.json');
}

export function verifyPassword(req) {
  const secret = process.env.ADMIN_PASSWORD;
  if (!secret) return { ok: false, status: 500, error: 'ADMIN_PASSWORD not set on server' };
  // password can be in body.password or header x-admin-password or Authorization Bearer
  let pw = null;
  if (req.body && typeof req.body.password === 'string') pw = req.body.password;
  else if (req.headers['x-admin-password']) pw = req.headers['x-admin-password'];
  else if (req.headers['authorization']?.startsWith('Bearer ')) pw = req.headers['authorization'].slice(7);
  else if (req.query && req.query.password) pw = req.query.password;
  if (typeof pw !== 'string') return { ok: false, status: 400, error: 'Missing password' };
  if (pw !== secret) return { ok: false, status: 401, error: 'Wrong password' };
  return { ok: true };
}

export function loadEconomy() {
  const p = getDataFile();
  if (!fs.existsSync(p)) throw new Error('economy_data.json not found');
  const raw = fs.readFileSync(p, 'utf8');
  return JSON.parse(raw);
}

export function saveEconomy(data) {
  const p = getDataFile();
  fs.writeFileSync(p, JSON.stringify(data, null, 2), 'utf8');
}

export async function pushToGitHub(reason = 'admin-update') {
  const token = process.env.GITHUB_TOKEN;
  const repo = process.env.GITHUB_REPO || 'HyawiiGithub/USSR-stock';
  const branch = process.env.GITHUB_BRANCH || 'main';
  const ghPath = process.env.GITHUB_ECONOMY_PATH || 'economy_data.json';
  if (!token) {
    console.log('[github] no GITHUB_TOKEN - skip push, local file only');
    return { pushed: false, reason: 'no-token' };
  }
  try {
    const p = getDataFile();
    if (!fs.existsSync(p)) return { pushed: false, reason: 'no-file' };
    const content = fs.readFileSync(p, 'utf8');
    const b64 = Buffer.from(content, 'utf8').toString('base64');
    const apiUrl = `https://api.github.com/repos/${repo}/contents/${encodeURIComponent(ghPath)}`;
    let sha = null;
    let existingB64 = null;
    try {
      const get = await fetch(`${apiUrl}?ref=${branch}`, {
        headers: { Authorization: `Bearer ${token}`, Accept: 'application/vnd.github+json' }
      });
      if (get.ok) {
        const j = await get.json();
        sha = j.sha;
        existingB64 = (j.content || '').replace(/\n/g, '');
      } else if (get.status !== 404) {
        const t = await get.text();
        throw new Error(`GET ${get.status}: ${t.slice(0, 300)}`);
      }
    } catch (e) {
      if (!String(e.message).includes('404')) throw e;
    }
    if (existingB64 && existingB64 === b64.replace(/\n/g, '')) {
      console.log('[github] unchanged - skip push', reason);
      return { pushed: false, reason: 'unchanged' };
    }
    const put = await fetch(apiUrl, {
      method: 'PUT',
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: 'application/vnd.github+json',
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        message: `chore: admin ${reason} ${new Date().toISOString()}`,
        content: b64,
        branch,
        ...(sha ? { sha } : {})
      })
    });
    if (!put.ok) {
      const t = await put.text();
      throw new Error(`PUT ${put.status}: ${t.slice(0, 500)}`);
    }
    const j = await put.json();
    console.log('[github] pushed', j.commit.sha.slice(0, 7), reason);
    return { pushed: true, sha: j.commit.sha };
  } catch (e) {
    console.error('[github] push failed', e.message);
    return { pushed: false, error: e.message };
  }
}
