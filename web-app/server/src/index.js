// SlabCutPlanner API — Keycloak OIDC auth (за зразком ai-agents-ws) + Postgres storage.
import crypto from 'node:crypto';
import express from 'express';
import pg from 'pg';

const cfg = {
  port: Number(process.env.PORT || 3000),
  databaseUrl: process.env.DATABASE_URL || 'postgres://slabcut:slabcut@localhost:5432/slabcut',
  // OIDC — той самий набір змінних, що й в ai-agents-ws
  keycloakClientId: process.env.KEYCLOAK_CLIENT_ID || '',
  keycloakClientSecret: process.env.KEYCLOAK_CLIENT_SECRET || '',
  keycloakDiscoveryUrl: process.env.KEYCLOAK_DISCOVERY_URL || '',
  // Публічна база Keycloak для браузерних редиректів. У проді збігається з
  // discovery-хостом; у локальному compose discovery йде на http://keycloak:8080,
  // а браузеру потрібен http://localhost:8081.
  keycloakPublicUrl: process.env.KEYCLOAK_PUBLIC_URL || '',
  redirectUri: process.env.REDIRECT_URI || 'http://localhost:8080/api/auth/callback',
  appUrl: process.env.APP_URL || '/',
  sessionSecret: process.env.SESSION_SECRET || 'dev-insecure-secret',
  sessionTtlSec: Number(process.env.SESSION_TTL_SEC || 8 * 3600),
};

// ── Postgres ──────────────────────────────────────────────────────────
const pool = new pg.Pool({ connectionString: cfg.databaseUrl });

async function initDb(retries = 20) {
  for (let i = 0; i < retries; i++) {
    try {
      await pool.query(`
        CREATE TABLE IF NOT EXISTS projects (
          id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
          user_id text NOT NULL,
          name text NOT NULL DEFAULT '',
          data jsonb NOT NULL DEFAULT '{}'::jsonb,
          created_at timestamptz NOT NULL DEFAULT now(),
          updated_at timestamptz NOT NULL DEFAULT now()
        );
        CREATE INDEX IF NOT EXISTS projects_user_id_idx ON projects (user_id, updated_at DESC);
      `);
      return;
    } catch (err) {
      if (i === retries - 1) throw err;
      console.log(`Postgres не готовий (${err.code || err.message}), повтор через 3с...`);
      await new Promise((r) => setTimeout(r, 3000));
    }
  }
}

// ── OIDC discovery (кешується, як st.cache_data у референсі) ─────────
let oidc = null;
async function getOidcEndpoints() {
  if (oidc) return oidc;
  const r = await fetch(cfg.keycloakDiscoveryUrl);
  if (!r.ok) throw new Error(`Keycloak discovery failed: ${r.status}`);
  const d = await r.json();
  // Для браузерних URL (authorization/logout) підміняємо внутрішній хост публічним.
  const toPublic = (url) => {
    if (!cfg.keycloakPublicUrl) return url;
    const internalBase = new URL(d.issuer).origin;
    return url.replace(internalBase, cfg.keycloakPublicUrl.replace(/\/$/, ''));
  };
  oidc = {
    authorizationEndpoint: toPublic(d.authorization_endpoint),
    endSessionEndpoint: d.end_session_endpoint ? toPublic(d.end_session_endpoint) : null,
    tokenEndpoint: d.token_endpoint,      // backchannel — внутрішній хост
    userinfoEndpoint: d.userinfo_endpoint,
  };
  return oidc;
}

// ── Сесійна кука: base64url(payload).hmac ─────────────────────────────
const COOKIE = 'scp_session';

function sign(payloadB64) {
  return crypto.createHmac('sha256', cfg.sessionSecret).update(payloadB64).digest('base64url');
}

function createSession(user) {
  const payload = Buffer.from(
    JSON.stringify({ ...user, exp: Date.now() + cfg.sessionTtlSec * 1000 })
  ).toString('base64url');
  return `${payload}.${sign(payload)}`;
}

function readSession(req) {
  const raw = (req.headers.cookie || '')
    .split(';')
    .map((s) => s.trim())
    .find((s) => s.startsWith(`${COOKIE}=`));
  if (!raw) return null;
  const [payload, sig] = raw.slice(COOKIE.length + 1).split('.');
  if (!payload || !sig) return null;
  const expected = sign(payload);
  if (sig.length !== expected.length || !crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expected))) return null;
  try {
    const user = JSON.parse(Buffer.from(payload, 'base64url').toString());
    if (!user.exp || user.exp < Date.now()) return null;
    return user;
  } catch {
    return null;
  }
}

function setSessionCookie(res, value, maxAgeSec = cfg.sessionTtlSec) {
  const secure = cfg.redirectUri.startsWith('https') ? ' Secure;' : '';
  res.setHeader(
    'Set-Cookie',
    `${COOKIE}=${value}; Path=/; HttpOnly;${secure} SameSite=Lax; Max-Age=${maxAgeSec}`
  );
}

// ── App ───────────────────────────────────────────────────────────────
const app = express();
app.use(express.json({ limit: '50mb' })); // project.data містить полігони/текстури

function requireAuth(req, res, next) {
  const user = readSession(req);
  if (!user) return res.status(401).json({ error: 'unauthorized' });
  req.user = user;
  next();
}

app.get('/api/health', (_req, res) => res.json({ ok: true }));

// ── Auth (флоу як в ai-agents-ws/app.py) ──────────────────────────────
app.get('/api/auth/login', async (_req, res) => {
  try {
    const { authorizationEndpoint } = await getOidcEndpoints();
    const url =
      `${authorizationEndpoint}?response_type=code` +
      `&client_id=${encodeURIComponent(cfg.keycloakClientId)}` +
      `&redirect_uri=${encodeURIComponent(cfg.redirectUri)}` +
      `&scope=openid+profile+email`;
    res.redirect(url);
  } catch (e) {
    res.status(502).send(`Keycloak недоступний: ${e.message}`);
  }
});

app.get('/api/auth/callback', async (req, res) => {
  const code = req.query.code;
  if (!code) return res.status(400).send('Missing code');
  try {
    const { tokenEndpoint, userinfoEndpoint } = await getOidcEndpoints();
    const tokenResp = await fetch(tokenEndpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        grant_type: 'authorization_code',
        code,
        redirect_uri: cfg.redirectUri,
        client_id: cfg.keycloakClientId,
        client_secret: cfg.keycloakClientSecret,
      }),
    });
    if (!tokenResp.ok) throw new Error(`token exchange failed: ${await tokenResp.text()}`);
    const token = await tokenResp.json();

    const uiResp = await fetch(userinfoEndpoint, {
      headers: { Authorization: `Bearer ${token.access_token}` },
    });
    if (!uiResp.ok) throw new Error(`userinfo failed: ${uiResp.status}`);
    const info = await uiResp.json();

    setSessionCookie(res, createSession({
      id: info.sub,
      email: info.email || null,
      name: info.name || info.preferred_username || null,
    }));
    res.redirect(cfg.appUrl);
  } catch (e) {
    console.error('OIDC callback error:', e);
    res.status(502).send(`Помилка обміну токена: ${e.message}`);
  }
});

app.get('/api/auth/me', (req, res) => {
  const user = readSession(req);
  if (!user) return res.status(401).json({ user: null });
  const { exp, ...publicUser } = user;
  res.json({ user: publicUser });
});

app.post('/api/auth/logout', async (req, res) => {
  setSessionCookie(res, '', 0);
  let logoutUrl = null;
  try {
    const { endSessionEndpoint } = await getOidcEndpoints();
    if (endSessionEndpoint) logoutUrl = endSessionEndpoint;
  } catch { /* keycloak недоступний — просто чистимо куку */ }
  res.json({ ok: true, logoutUrl });
});

// ── Projects CRUD (усі запити жорстко скоупляться на user_id) ─────────
app.get('/api/projects', requireAuth, async (req, res) => {
  const { rows } = await pool.query(
    'SELECT id, name, updated_at FROM projects WHERE user_id = $1 ORDER BY updated_at DESC',
    [req.user.id]
  );
  res.json(rows);
});

app.post('/api/projects', requireAuth, async (req, res) => {
  const { name = '', data = {} } = req.body || {};
  const { rows } = await pool.query(
    'INSERT INTO projects (user_id, name, data) VALUES ($1, $2, $3) RETURNING id, name, updated_at',
    [req.user.id, name, data]
  );
  res.status(201).json(rows[0]);
});

app.get('/api/projects/:id', requireAuth, async (req, res) => {
  const { rows } = await pool.query(
    'SELECT id, name, data, updated_at FROM projects WHERE id = $1 AND user_id = $2',
    [req.params.id, req.user.id]
  );
  if (!rows.length) return res.status(404).json({ error: 'not found' });
  res.json(rows[0]);
});

app.put('/api/projects/:id', requireAuth, async (req, res) => {
  const { name, data } = req.body || {};
  const { rows } = await pool.query(
    `UPDATE projects SET
       name = COALESCE($3, name),
       data = COALESCE($4, data),
       updated_at = now()
     WHERE id = $1 AND user_id = $2
     RETURNING id, name, updated_at`,
    [req.params.id, req.user.id, name ?? null, data ?? null]
  );
  if (!rows.length) return res.status(404).json({ error: 'not found' });
  res.json(rows[0]);
});

app.delete('/api/projects/:id', requireAuth, async (req, res) => {
  const { rowCount } = await pool.query(
    'DELETE FROM projects WHERE id = $1 AND user_id = $2',
    [req.params.id, req.user.id]
  );
  if (!rowCount) return res.status(404).json({ error: 'not found' });
  res.json({ ok: true });
});

// eslint-disable-next-line no-unused-vars
app.use((err, _req, res, _next) => {
  console.error('Unhandled error:', err);
  res.status(500).json({ error: 'internal error' });
});

await initDb();
app.listen(cfg.port, () => console.log(`API listening on :${cfg.port}`));
