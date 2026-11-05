// MesaPronta — servidor do micro SaaS (sem dependências externas).
// SaaS (clientes, login, cobrança) → SQLite em data/app.db
// Conteúdo do site de cada restaurante → JSON em data/sites/<tenantId>.json
'use strict';
process.removeAllListeners('warning'); // silencia o aviso "SQLite is experimental"
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { DatabaseSync } = require('node:sqlite');

const PORT = Number(process.env.PORT || 3000);
const BASE_DOMAIN = process.env.BASE_DOMAIN || ''; // ex.: mesapronta.com.br → slug.mesapronta.com.br
const ROOT = __dirname;
const PUB = path.join(ROOT, 'public');
const DATA = path.join(ROOT, 'data');
const SITES = path.join(DATA, 'sites');
const UPLOADS = path.join(DATA, 'uploads');
for (const d of [DATA, SITES, UPLOADS]) fs.mkdirSync(d, { recursive: true });

const PLANS = {
  essencial:    { id: 'essencial',    name: 'Essencial',    price: 4900,  photos: 12,  sections: 1 },
  profissional: { id: 'profissional', name: 'Profissional', price: 7900,  photos: 40,  sections: 4 },
  premium:      { id: 'premium',      name: 'Premium',      price: 12900, photos: 120, sections: 10 },
};
const TRIAL_DAYS = 7;
const RESERVED = new Set(['admin', 'api', 'assets', 'painel', 'entrar', 'r', 'u', 'demo', 'www', 'app', 'site', 'mail', 'suporte']);

// ---------- Banco de dados ----------
const db = new DatabaseSync(path.join(DATA, 'app.db'));
db.exec(`
PRAGMA journal_mode = WAL;
PRAGMA foreign_keys = ON;
CREATE TABLE IF NOT EXISTS tenants (
  id TEXT PRIMARY KEY,
  slug TEXT NOT NULL UNIQUE,
  restaurant_name TEXT NOT NULL,
  plan TEXT NOT NULL DEFAULT 'profissional',
  status TEXT NOT NULL DEFAULT 'trial',          -- trial | active | overdue | suspended | canceled
  trial_ends_at TEXT,
  next_due_date TEXT,
  notes TEXT DEFAULT '',
  created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  email TEXT NOT NULL UNIQUE,
  phone TEXT,
  password_hash TEXT NOT NULL,
  last_login_at TEXT,
  created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS billing_profiles (
  tenant_id TEXT PRIMARY KEY REFERENCES tenants(id) ON DELETE CASCADE,
  legal_name TEXT DEFAULT '', document TEXT DEFAULT '', email TEXT DEFAULT '', phone TEXT DEFAULT '',
  cep TEXT DEFAULT '', street TEXT DEFAULT '', number TEXT DEFAULT '', complement TEXT DEFAULT '',
  district TEXT DEFAULT '', city TEXT DEFAULT '', state TEXT DEFAULT '',
  billing_day INTEGER DEFAULT 10, payment_method TEXT DEFAULT 'pix'
);
CREATE TABLE IF NOT EXISTS invoices (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  reference TEXT NOT NULL,           -- AAAA-MM
  description TEXT DEFAULT '',
  amount_cents INTEGER NOT NULL,
  due_date TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',   -- pending | paid | overdue | canceled
  paid_at TEXT, method TEXT,
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_invoices_tenant ON invoices(tenant_id);
CREATE TABLE IF NOT EXISTS admins (
  id TEXT PRIMARY KEY, email TEXT NOT NULL UNIQUE, password_hash TEXT NOT NULL, created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS sessions (
  token TEXT PRIMARY KEY, kind TEXT NOT NULL, subject_id TEXT NOT NULL, tenant_id TEXT, expires_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS settings (key TEXT PRIMARY KEY, value TEXT);
`);

const q = (sql) => db.prepare(sql);
const now = () => new Date().toISOString();
const today = () => new Date().toISOString().slice(0, 10);
const addDays = (d, n) => { const x = new Date(d + 'T12:00:00Z'); x.setUTCDate(x.getUTCDate() + n); return x.toISOString().slice(0, 10); };
const uid = (p) => p + '_' + crypto.randomBytes(9).toString('base64url');

function hashPassword(pw) {
  const salt = crypto.randomBytes(16);
  const h = crypto.scryptSync(pw, salt, 64);
  return 'scrypt$' + salt.toString('hex') + '$' + h.toString('hex');
}
function checkPassword(pw, stored) {
  const [, salt, h] = String(stored).split('$');
  if (!salt || !h) return false;
  const a = crypto.scryptSync(pw, Buffer.from(salt, 'hex'), 64);
  const b = Buffer.from(h, 'hex');
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

// Primeiro admin: vem de ADMIN_EMAIL / ADMIN_PASSWORD ou é gerado e salvo em data/ADMIN_CREDENTIALS.txt
if (!q('SELECT 1 FROM admins LIMIT 1').get()) {
  const email = (process.env.ADMIN_EMAIL || 'admin@mesapronta.local').toLowerCase();
  const pw = process.env.ADMIN_PASSWORD || crypto.randomBytes(9).toString('base64url');
  q('INSERT INTO admins (id,email,password_hash,created_at) VALUES (?,?,?,?)').run(uid('adm'), email, hashPassword(pw), now());
  if (!process.env.ADMIN_PASSWORD) {
    fs.writeFileSync(path.join(DATA, 'ADMIN_CREDENTIALS.txt'), `Acesso /admin\nE-mail: ${email}\nSenha: ${pw}\n\nTroque pelo painel ou apague este arquivo depois de anotar.\n`);
  }
  console.log(`Admin criado: ${email} (senha em data/ADMIN_CREDENTIALS.txt)`);
}
const defaultSettings = { company_name: 'MesaPronta', pix_key: '', support_whatsapp: '', billing_note: 'Pagamento via PIX. Envie o comprovante pelo WhatsApp do suporte.' };
for (const [k, v] of Object.entries(defaultSettings)) q('INSERT OR IGNORE INTO settings (key,value) VALUES (?,?)').run(k, v);
const getSettings = () => Object.fromEntries(q('SELECT key,value FROM settings').all().map(r => [r.key, r.value]));

// Atualiza status: faturas vencidas → overdue; trial vencido sem pagamento → overdue
function refreshStatuses() {
  const t = today();
  q(`UPDATE invoices SET status='overdue' WHERE status='pending' AND due_date < ?`).run(t);
  q(`UPDATE tenants SET status='overdue' WHERE status IN ('active','trial') AND id IN (SELECT tenant_id FROM invoices WHERE status='overdue')`).run();
  q(`UPDATE tenants SET status='active' WHERE status='overdue' AND id NOT IN (SELECT tenant_id FROM invoices WHERE status='overdue')`).run();
}
refreshStatuses();
setInterval(refreshStatuses, 60 * 60 * 1000).unref();

// ---------- Conteúdo do site (JSON por tenant) ----------
const sitePath = (tenantId) => path.join(SITES, tenantId.replace(/[^\w-]/g, '') + '.json');
function readSite(tenantId) {
  try { return JSON.parse(fs.readFileSync(sitePath(tenantId), 'utf8')); } catch { return null; }
}
function writeSite(tenantId, data) {
  const tmp = sitePath(tenantId) + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(data, null, 1));
  fs.renameSync(tmp, sitePath(tenantId));
}
const starterSite = require('./public/assets/starter-site.js');

// ---------- HTTP helpers ----------
const MIME = { '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp', '.ico': 'image/x-icon', '.txt': 'text/plain; charset=utf-8' };
const SEC_HEADERS = { 'X-Content-Type-Options': 'nosniff', 'Referrer-Policy': 'strict-origin-when-cross-origin', 'X-Frame-Options': 'SAMEORIGIN' };

function send(res, status, body, headers = {}) {
  res.writeHead(status, { ...SEC_HEADERS, ...headers });
  res.end(body);
}
const json = (res, status, obj, headers = {}) => send(res, status, JSON.stringify(obj), { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', ...headers });
const fail = (res, status, msg) => json(res, status, { error: msg });

function readBody(req, limit) {
  return new Promise((resolve, reject) => {
    const chunks = []; let size = 0;
    req.on('data', (c) => { size += c.length; if (size > limit) { reject(Object.assign(new Error('Arquivo muito grande'), { status: 413 })); req.destroy(); } else chunks.push(c); });
    req.on('end', () => resolve(Buffer.concat(chunks)));
    req.on('error', reject);
  });
}
async function readJson(req, limit = 1_000_000) {
  if (!String(req.headers['content-type'] || '').startsWith('application/json')) throw Object.assign(new Error('Envie JSON.'), { status: 415 });
  const buf = await readBody(req, limit);
  if (!buf.length) return {};
  try { return JSON.parse(buf.toString('utf8')); } catch { throw Object.assign(new Error('JSON inválido'), { status: 400 }); }
}
function cookies(req) {
  return Object.fromEntries(String(req.headers.cookie || '').split(';').map(c => c.trim().split('=')).filter(p => p[0]).map(([k, ...v]) => [k, decodeURIComponent(v.join('='))]));
}
function setCookie(name, value, maxAge) {
  return `${name}=${value}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${maxAge}${process.env.NODE_ENV === 'production' ? '; Secure' : ''}`;
}

// ---------- Sessões ----------
const SESSION_DAYS = 14;
function createSession(kind, subjectId, tenantId) {
  const token = crypto.randomBytes(32).toString('base64url');
  q('INSERT INTO sessions (token,kind,subject_id,tenant_id,expires_at) VALUES (?,?,?,?,?)').run(token, kind, subjectId, tenantId || null, Date.now() + SESSION_DAYS * 864e5);
  return token;
}
function getSession(req, kind) {
  const token = cookies(req)[kind === 'admin' ? 'aid' : 'sid'];
  if (!token) return null;
  const s = q('SELECT * FROM sessions WHERE token=? AND kind=?').get(token, kind);
  if (!s || s.expires_at < Date.now()) return null;
  return s;
}
q('DELETE FROM sessions WHERE expires_at < ?').run(Date.now());

// Limite simples de tentativas de login por IP
const attempts = new Map();
function tooMany(req) {
  const ip = req.socket.remoteAddress || '';
  const a = attempts.get(ip) || { n: 0, t: Date.now() };
  if (Date.now() - a.t > 10 * 60e3) { a.n = 0; a.t = Date.now(); }
  a.n++; attempts.set(ip, a);
  return a.n > 15;
}
const loginOk = (req) => attempts.delete(req.socket.remoteAddress || '');

// ---------- Validação ----------
const SLUG_RE = /^[a-z0-9](?:[a-z0-9-]{1,38}[a-z0-9])$/;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const str = (v, max = 200) => String(v ?? '').trim().slice(0, max);
const digits = (v) => String(v ?? '').replace(/\D/g, '');
function slugOk(slug) {
  if (!SLUG_RE.test(slug) || RESERVED.has(slug)) return 'Use de 3 a 40 letras minúsculas, números ou hífens.';
  if (q('SELECT 1 FROM tenants WHERE slug=?').get(slug)) return 'Esse endereço já está em uso.';
  return null;
}

// ---------- Visões públicas de dados ----------
function tenantView(t) {
  if (!t) return null;
  const plan = PLANS[t.plan] || PLANS.profissional;
  return { id: t.id, slug: t.slug, restaurantName: t.restaurant_name, plan: t.plan, planInfo: plan, status: t.status, trialEndsAt: t.trial_ends_at, nextDueDate: t.next_due_date, createdAt: t.created_at };
}
function siteUrl(slug, req) {
  if (BASE_DOMAIN) return `https://${slug}.${BASE_DOMAIN}`;
  return `http://${req.headers.host}/r/${slug}`;
}

// ---------- API do cliente ----------
async function apiClient(req, res, url) {
  const p = url.pathname;
  const m = req.method;

  if (p === '/api/plans' && m === 'GET') return json(res, 200, { plans: Object.values(PLANS), trialDays: TRIAL_DAYS });

  if (p === '/api/slug-check' && m === 'GET') {
    const slug = str(url.searchParams.get('slug'), 60).toLowerCase();
    const err = slugOk(slug);
    return json(res, 200, { available: !err, message: err || 'Disponível!' });
  }

  if (p === '/api/signup' && m === 'POST') {
    if (tooMany(req)) return fail(res, 429, 'Muitas tentativas. Aguarde alguns minutos.');
    const b = await readJson(req);
    const name = str(b.name, 120), email = str(b.email, 160).toLowerCase(), phone = digits(b.phone).slice(0, 15);
    const restaurant = str(b.restaurant, 120), slug = str(b.slug, 60).toLowerCase(), password = String(b.password || '');
    const plan = PLANS[b.plan] ? b.plan : 'profissional';
    const theme = ['elegante', 'moderno', 'industrial', 'minimalista'].includes(b.theme) ? b.theme : 'elegante';
    if (!name || !restaurant) return fail(res, 400, 'Preencha seu nome e o nome do restaurante.');
    if (!EMAIL_RE.test(email)) return fail(res, 400, 'E-mail inválido.');
    if (phone.length < 10) return fail(res, 400, 'Informe um WhatsApp com DDD.');
    if (password.length < 8) return fail(res, 400, 'A senha precisa ter pelo menos 8 caracteres.');
    const se = slugOk(slug); if (se) return fail(res, 400, se);
    if (q('SELECT 1 FROM users WHERE email=?').get(email)) return fail(res, 400, 'Já existe uma conta com esse e-mail.');

    const tenantId = uid('tnt'), userId = uid('usr'), t0 = today();
    const trialEnd = addDays(t0, TRIAL_DAYS);
    db.exec('BEGIN');
    try {
      q('INSERT INTO tenants (id,slug,restaurant_name,plan,status,trial_ends_at,next_due_date,created_at) VALUES (?,?,?,?,?,?,?,?)').run(tenantId, slug, restaurant, plan, 'trial', trialEnd, trialEnd, now());
      q('INSERT INTO users (id,tenant_id,name,email,phone,password_hash,created_at) VALUES (?,?,?,?,?,?,?)').run(userId, tenantId, name, email, phone, hashPassword(password), now());
      q('INSERT INTO billing_profiles (tenant_id,legal_name,email,phone) VALUES (?,?,?,?)').run(tenantId, restaurant, email, phone);
      q('INSERT INTO invoices (id,tenant_id,reference,description,amount_cents,due_date,status,created_at) VALUES (?,?,?,?,?,?,?,?)')
        .run(uid('inv'), tenantId, trialEnd.slice(0, 7), `Plano ${PLANS[plan].name} — 1ª mensalidade`, PLANS[plan].price, trialEnd, 'pending', now());
      writeSite(tenantId, starterSite({ restaurant, theme, whatsapp: phone, email }));
      db.exec('COMMIT');
    } catch (e) { db.exec('ROLLBACK'); throw e; }
    const token = createSession('client', userId, tenantId);
    return json(res, 201, { ok: true, redirect: '/painel' }, { 'Set-Cookie': setCookie('sid', token, SESSION_DAYS * 86400) });
  }

  if (p === '/api/login' && m === 'POST') {
    if (tooMany(req)) return fail(res, 429, 'Muitas tentativas. Aguarde alguns minutos.');
    const b = await readJson(req);
    const u = q('SELECT * FROM users WHERE email=?').get(str(b.email, 160).toLowerCase());
    if (!u || !checkPassword(String(b.password || ''), u.password_hash)) return fail(res, 401, 'E-mail ou senha incorretos.');
    loginOk(req);
    q('UPDATE users SET last_login_at=? WHERE id=?').run(now(), u.id);
    const token = createSession('client', u.id, u.tenant_id);
    return json(res, 200, { ok: true, redirect: '/painel' }, { 'Set-Cookie': setCookie('sid', token, SESSION_DAYS * 86400) });
  }

  if (p === '/api/logout' && m === 'POST') {
    const t = cookies(req).sid; if (t) q('DELETE FROM sessions WHERE token=?').run(t);
    return json(res, 200, { ok: true }, { 'Set-Cookie': setCookie('sid', '', 0) });
  }

  // ---- Daqui para baixo: exige login do cliente. tenant_id SEMPRE vem da sessão. ----
  const s = getSession(req, 'client');
  if (!s) return fail(res, 401, 'Faça login para continuar.');
  const tenantId = s.tenant_id;
  const tenant = q('SELECT * FROM tenants WHERE id=?').get(tenantId);
  if (!tenant) return fail(res, 401, 'Conta não encontrada.');

  if (p === '/api/me' && m === 'GET') {
    const u = q('SELECT id,name,email,phone,last_login_at FROM users WHERE id=?').get(s.subject_id);
    const st = getSettings();
    return json(res, 200, { user: u, tenant: tenantView(tenant), siteUrl: siteUrl(tenant.slug, req), support: { whatsapp: st.support_whatsapp, pixKey: st.pix_key, note: st.billing_note, company: st.company_name } });
  }

  if (p === '/api/site' && m === 'GET') return json(res, 200, { site: readSite(tenantId) });
  if (p === '/api/site' && m === 'PUT') {
    const b = await readJson(req, 2_000_000);
    if (!b.site || typeof b.site !== 'object') return fail(res, 400, 'Conteúdo inválido.');
    const plan = PLANS[tenant.plan] || PLANS.profissional;
    const photos = (b.site.gallery?.items || []).length;
    if (photos > plan.photos) return fail(res, 400, `Seu plano permite até ${plan.photos} fotos na galeria.`);
    if ((b.site.sections || []).length > plan.sections) return fail(res, 400, `Seu plano permite até ${plan.sections} seção(ões) livre(s).`);
    b.site.updatedAt = now();
    writeSite(tenantId, b.site);
    return json(res, 200, { ok: true, updatedAt: b.site.updatedAt });
  }

  if (p === '/api/upload' && m === 'POST') {
    const buf = await readBody(req, 4_000_000);
    const sig = buf.subarray(0, 12).toString('hex');
    const ext = sig.startsWith('ffd8ff') ? '.jpg' : sig.startsWith('89504e47') ? '.png' : (sig.startsWith('52494646') && buf.subarray(8, 12).toString() === 'WEBP') ? '.webp' : null;
    if (!ext) return fail(res, 400, 'Envie uma imagem JPG, PNG ou WEBP.');
    const dir = path.join(UPLOADS, tenantId); fs.mkdirSync(dir, { recursive: true });
    const name = crypto.randomBytes(10).toString('hex') + ext;
    fs.writeFileSync(path.join(dir, name), buf);
    return json(res, 201, { url: `/u/${tenantId}/${name}` });
  }

  if (p === '/api/account' && m === 'GET') {
    const u = q('SELECT name,email,phone FROM users WHERE id=?').get(s.subject_id);
    const bp = q('SELECT * FROM billing_profiles WHERE tenant_id=?').get(tenantId) || {};
    delete bp.tenant_id;
    return json(res, 200, { user: u, billing: bp, restaurantName: tenant.restaurant_name });
  }
  if (p === '/api/account' && m === 'PUT') {
    const b = await readJson(req);
    const u = b.user || {}, bp = b.billing || {};
    const email = str(u.email, 160).toLowerCase();
    if (!str(u.name)) return fail(res, 400, 'Informe seu nome.');
    if (!EMAIL_RE.test(email)) return fail(res, 400, 'E-mail inválido.');
    if (q('SELECT 1 FROM users WHERE email=? AND id<>?').get(email, s.subject_id)) return fail(res, 400, 'Esse e-mail já está em uso.');
    q('UPDATE users SET name=?, email=?, phone=? WHERE id=?').run(str(u.name, 120), email, digits(u.phone).slice(0, 15), s.subject_id);
    if (str(b.restaurantName)) q('UPDATE tenants SET restaurant_name=? WHERE id=?').run(str(b.restaurantName, 120), tenantId);
    const day = Math.min(28, Math.max(1, parseInt(bp.billing_day, 10) || 10));
    q(`UPDATE billing_profiles SET legal_name=?, document=?, email=?, phone=?, cep=?, street=?, number=?, complement=?, district=?, city=?, state=?, billing_day=?, payment_method=? WHERE tenant_id=?`)
      .run(str(bp.legal_name, 160), digits(bp.document).slice(0, 14), str(bp.email, 160), digits(bp.phone).slice(0, 15), digits(bp.cep).slice(0, 8), str(bp.street, 160), str(bp.number, 20), str(bp.complement, 80), str(bp.district, 80), str(bp.city, 80), str(bp.state, 2).toUpperCase(), day, ['pix', 'boleto', 'cartao'].includes(bp.payment_method) ? bp.payment_method : 'pix', tenantId);
    return json(res, 200, { ok: true });
  }
  if (p === '/api/password' && m === 'PUT') {
    const b = await readJson(req);
    const u = q('SELECT password_hash FROM users WHERE id=?').get(s.subject_id);
    if (!checkPassword(String(b.current || ''), u.password_hash)) return fail(res, 400, 'Senha atual incorreta.');
    if (String(b.next || '').length < 8) return fail(res, 400, 'A nova senha precisa ter pelo menos 8 caracteres.');
    q('UPDATE users SET password_hash=? WHERE id=?').run(hashPassword(String(b.next)), s.subject_id);
    return json(res, 200, { ok: true });
  }
  if (p === '/api/invoices' && m === 'GET') {
    return json(res, 200, { invoices: q('SELECT id,reference,description,amount_cents,due_date,status,paid_at,method FROM invoices WHERE tenant_id=? ORDER BY due_date DESC').all(tenantId) });
  }
  if (p === '/api/plan' && m === 'PUT') {
    const b = await readJson(req);
    if (!PLANS[b.plan]) return fail(res, 400, 'Plano inválido.');
    const site = readSite(tenantId) || {};
    if ((site.gallery?.items || []).length > PLANS[b.plan].photos) return fail(res, 400, `Esse plano permite ${PLANS[b.plan].photos} fotos. Remova algumas da galeria antes.`);
    q('UPDATE tenants SET plan=? WHERE id=?').run(b.plan, tenantId);
    q(`UPDATE invoices SET amount_cents=?, description=? WHERE tenant_id=? AND status='pending'`).run(PLANS[b.plan].price, `Plano ${PLANS[b.plan].name}`, tenantId);
    return json(res, 200, { ok: true });
  }
  return fail(res, 404, 'Rota não encontrada.');
}

// ---------- API do admin do SaaS ----------
async function apiAdmin(req, res, url) {
  const p = url.pathname.replace('/api/admin', '') || '/';
  const m = req.method;

  if (p === '/login' && m === 'POST') {
    if (tooMany(req)) return fail(res, 429, 'Muitas tentativas. Aguarde alguns minutos.');
    const b = await readJson(req);
    const a = q('SELECT * FROM admins WHERE email=?').get(str(b.email, 160).toLowerCase());
    if (!a || !checkPassword(String(b.password || ''), a.password_hash)) return fail(res, 401, 'Credenciais inválidas.');
    loginOk(req);
    const token = createSession('admin', a.id);
    return json(res, 200, { ok: true }, { 'Set-Cookie': setCookie('aid', token, 12 * 3600) });
  }
  if (p === '/logout' && m === 'POST') {
    const t = cookies(req).aid; if (t) q('DELETE FROM sessions WHERE token=?').run(t);
    return json(res, 200, { ok: true }, { 'Set-Cookie': setCookie('aid', '', 0) });
  }
  const s = getSession(req, 'admin');
  if (!s) return fail(res, 401, 'Não autorizado.');
  refreshStatuses();

  if (p === '/me' && m === 'GET') return json(res, 200, { admin: q('SELECT id,email FROM admins WHERE id=?').get(s.subject_id) });

  if (p === '/stats' && m === 'GET') {
    const byStatus = Object.fromEntries(q('SELECT status, COUNT(*) n FROM tenants GROUP BY status').all().map(r => [r.status, r.n]));
    const mrr = q(`SELECT plan, COUNT(*) n FROM tenants WHERE status IN ('active','overdue') GROUP BY plan`).all().reduce((sum, r) => sum + (PLANS[r.plan]?.price || 0) * r.n, 0);
    const month = today().slice(0, 7);
    const received = q(`SELECT COALESCE(SUM(amount_cents),0) v FROM invoices WHERE status='paid' AND substr(paid_at,1,7)=?`).get(month).v;
    const overdue = q(`SELECT COALESCE(SUM(amount_cents),0) v, COUNT(*) n FROM invoices WHERE status='overdue'`).get();
    const pending = q(`SELECT COALESCE(SUM(amount_cents),0) v, COUNT(*) n FROM invoices WHERE status='pending'`).get();
    const recent = q('SELECT id,slug,restaurant_name,plan,status,created_at FROM tenants ORDER BY created_at DESC LIMIT 6').all();
    const total = q('SELECT COUNT(*) n FROM tenants').get().n;
    return json(res, 200, { total, byStatus, mrrCents: mrr, receivedThisMonthCents: received, overdue, pending, recent, plans: Object.values(PLANS) });
  }

  if (p === '/tenants' && m === 'GET') {
    const search = '%' + str(url.searchParams.get('q'), 80).toLowerCase() + '%';
    const status = str(url.searchParams.get('status'), 20);
    const rows = q(`SELECT t.*, u.name owner_name, u.email owner_email, u.phone owner_phone, u.last_login_at,
        (SELECT COUNT(*) FROM invoices i WHERE i.tenant_id=t.id AND i.status='overdue') overdue_count
      FROM tenants t LEFT JOIN users u ON u.tenant_id=t.id
      WHERE (lower(t.restaurant_name) LIKE ? OR lower(t.slug) LIKE ? OR lower(u.email) LIKE ?) AND (?='' OR t.status=?)
      ORDER BY t.created_at DESC`).all(search, search, search, status, status);
    return json(res, 200, { tenants: rows });
  }

  const tm = p.match(/^\/tenants\/([\w-]+)(\/invoices)?$/);
  if (tm) {
    const t = q('SELECT * FROM tenants WHERE id=?').get(tm[1]);
    if (!t) return fail(res, 404, 'Cliente não encontrado.');
    if (!tm[2] && m === 'GET') {
      const site = readSite(t.id) || {};
      return json(res, 200, {
        tenant: t,
        owner: q('SELECT id,name,email,phone,last_login_at,created_at FROM users WHERE tenant_id=?').get(t.id),
        billing: q('SELECT * FROM billing_profiles WHERE tenant_id=?').get(t.id),
        invoices: q('SELECT * FROM invoices WHERE tenant_id=? ORDER BY due_date DESC').all(t.id),
        site: { theme: site.theme?.preset, photos: (site.gallery?.items || []).length, updatedAt: site.updatedAt, url: siteUrl(t.slug, req) },
      });
    }
    if (!tm[2] && m === 'PATCH') {
      const b = await readJson(req);
      const plan = PLANS[b.plan] ? b.plan : t.plan;
      const status = ['trial', 'active', 'overdue', 'suspended', 'canceled'].includes(b.status) ? b.status : t.status;
      const due = /^\d{4}-\d{2}-\d{2}$/.test(b.next_due_date || '') ? b.next_due_date : t.next_due_date;
      const notes = b.notes !== undefined ? str(b.notes, 2000) : t.notes;
      q('UPDATE tenants SET plan=?, status=?, next_due_date=?, notes=? WHERE id=?').run(plan, status, due, notes, t.id);
      if (plan !== t.plan) q(`UPDATE invoices SET amount_cents=?, description=? WHERE tenant_id=? AND status IN ('pending','overdue') AND description LIKE 'Plano %'`).run(PLANS[plan].price, `Plano ${PLANS[plan].name}`, t.id);
      return json(res, 200, { ok: true });
    }
    if (!tm[2] && m === 'DELETE') {
      q('DELETE FROM tenants WHERE id=?').run(t.id);
      fs.rmSync(sitePath(t.id), { force: true });
      fs.rmSync(path.join(UPLOADS, t.id), { recursive: true, force: true });
      return json(res, 200, { ok: true });
    }
    if (tm[2] && m === 'POST') {
      const b = await readJson(req);
      const due = /^\d{4}-\d{2}-\d{2}$/.test(b.due_date || '') ? b.due_date : addDays(today(), 7);
      const amount = Math.round(Number(b.amount_cents ?? PLANS[t.plan].price));
      if (!(amount > 0)) return fail(res, 400, 'Valor inválido.');
      const id = uid('inv');
      q('INSERT INTO invoices (id,tenant_id,reference,description,amount_cents,due_date,status,created_at) VALUES (?,?,?,?,?,?,?,?)')
        .run(id, t.id, str(b.reference, 7) || due.slice(0, 7), str(b.description, 200) || `Plano ${PLANS[t.plan].name}`, amount, due, 'pending', now());
      return json(res, 201, { ok: true, id });
    }
  }

  const im = p.match(/^\/invoices\/([\w-]+)$/);
  if (im && m === 'PATCH') {
    const inv = q('SELECT * FROM invoices WHERE id=?').get(im[1]);
    if (!inv) return fail(res, 404, 'Fatura não encontrada.');
    const b = await readJson(req);
    if (b.status === 'paid') {
      q(`UPDATE invoices SET status='paid', paid_at=?, method=? WHERE id=?`).run(now(), str(b.method, 20) || 'pix', inv.id);
      const t = q('SELECT * FROM tenants WHERE id=?').get(inv.tenant_id);
      // Pagou: ativa e agenda a próxima mensalidade (se não houver outra em aberto)
      const open = q(`SELECT MIN(due_date) d FROM invoices WHERE tenant_id=? AND status IN ('pending','overdue')`).get(t.id).d;
      let nextDue = open;
      if (!open) {
        nextDue = addDays(inv.due_date, 30);
        q('INSERT INTO invoices (id,tenant_id,reference,description,amount_cents,due_date,status,created_at) VALUES (?,?,?,?,?,?,?,?)')
          .run(uid('inv'), t.id, nextDue.slice(0, 7), `Plano ${PLANS[t.plan].name}`, PLANS[t.plan].price, nextDue, 'pending', now());
      }
      q(`UPDATE tenants SET status=CASE WHEN status IN ('trial','overdue') THEN 'active' ELSE status END, next_due_date=? WHERE id=?`).run(nextDue, t.id);
    } else if (['pending', 'canceled'].includes(b.status)) {
      q('UPDATE invoices SET status=?, paid_at=NULL, method=NULL WHERE id=?').run(b.status, inv.id);
    } else return fail(res, 400, 'Status inválido.');
    refreshStatuses();
    return json(res, 200, { ok: true });
  }

  if (p === '/settings' && m === 'GET') return json(res, 200, { settings: getSettings() });
  if (p === '/settings' && m === 'PUT') {
    const b = await readJson(req);
    for (const k of Object.keys(defaultSettings)) if (b[k] !== undefined) q('UPDATE settings SET value=? WHERE key=?').run(str(b[k], 500), k);
    return json(res, 200, { ok: true });
  }
  if (p === '/password' && m === 'PUT') {
    const b = await readJson(req);
    const a = q('SELECT * FROM admins WHERE id=?').get(s.subject_id);
    if (!checkPassword(String(b.current || ''), a.password_hash)) return fail(res, 400, 'Senha atual incorreta.');
    if (String(b.next || '').length < 10) return fail(res, 400, 'Use pelo menos 10 caracteres.');
    q('UPDATE admins SET password_hash=? WHERE id=?').run(hashPassword(String(b.next)), a.id);
    return json(res, 200, { ok: true });
  }
  return fail(res, 404, 'Rota não encontrada.');
}

// ---------- Páginas ----------
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const safeJson = (o) => JSON.stringify(o).replace(/</g, '\\u003c');

function sitePage(site, opts = {}) {
  const title = site.seo?.title || site.brand?.name || 'Restaurante';
  const desc = site.seo?.description || site.hero?.subtitle || '';
  return `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<title>${esc(title)}</title><meta name="description" content="${esc(desc)}"><meta property="og:title" content="${esc(title)}"><meta property="og:description" content="${esc(desc)}">${site.hero?.image ? `<meta property="og:image" content="${esc(site.hero.image)}">` : ''}
<link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="/assets/site.css"></head><body><div id="app"></div>
<script>window.__SITE__=${safeJson(site)};window.__OPTS__=${safeJson(opts)};</script><script src="/assets/site.js"></script></body></html>`;
}
function unavailablePage(name) {
  return `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>${esc(name || 'Site')} — em breve</title>
<style>body{margin:0;min-height:100vh;display:grid;place-items:center;background:#f6f3ee;color:#2a221c;font:16px/1.6 system-ui,sans-serif;text-align:center;padding:24px}h1{font:500 2rem Georgia,serif;margin:0 0 8px}</style></head>
<body><div><h1>${esc(name || 'Este site')}</h1><p>Estamos preparando novidades. Volte em breve.</p></div></body></html>`;
}
function serveSiteBySlug(res, slug, opts) {
  const t = q('SELECT * FROM tenants WHERE slug=?').get(slug);
  if (!t) return send(res, 404, unavailablePage(''), { 'Content-Type': 'text/html; charset=utf-8' });
  if (['suspended', 'canceled'].includes(t.status)) return send(res, 200, unavailablePage(t.restaurant_name), { 'Content-Type': 'text/html; charset=utf-8' });
  const site = readSite(t.id);
  if (!site) return send(res, 404, unavailablePage(t.restaurant_name), { 'Content-Type': 'text/html; charset=utf-8' });
  return send(res, 200, sitePage(site, opts), { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-cache' });
}

function serveFile(res, file, cache = 'no-cache') {
  fs.stat(file, (err, st) => {
    if (err || !st.isFile()) return send(res, 404, 'Não encontrado', { 'Content-Type': 'text/plain; charset=utf-8' });
    res.writeHead(200, { ...SEC_HEADERS, 'Content-Type': MIME[path.extname(file).toLowerCase()] || 'application/octet-stream', 'Content-Length': st.size, 'Cache-Control': cache });
    fs.createReadStream(file).pipe(res);
  });
}
function safeJoin(base, rel) {
  const full = path.normalize(path.join(base, rel));
  return full.startsWith(base + path.sep) ? full : null;
}

// ---------- Roteador ----------
const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, 'http://x');
  const p = decodeURIComponent(url.pathname);
  try {
    // Subdomínio do cliente: slug.BASE_DOMAIN → site do restaurante
    const host = String(req.headers.host || '').split(':')[0];
    if (BASE_DOMAIN && host.endsWith('.' + BASE_DOMAIN)) {
      const sub = host.slice(0, -BASE_DOMAIN.length - 1);
      if (sub !== 'www' && !p.startsWith('/assets/') && !p.startsWith('/u/')) return serveSiteBySlug(res, sub, {});
    }
    if (p.startsWith('/api/') && !['GET', 'HEAD'].includes(req.method)) {
      const origin = req.headers.origin;
      if (origin && new URL(origin).host !== req.headers.host) return fail(res, 403, 'Origem não permitida.');
    }
    if (p.startsWith('/api/admin')) return await apiAdmin(req, res, url);
    if (p.startsWith('/api/')) return await apiClient(req, res, url);

    if (p === '/admin' || p === '/admin/') return serveFile(res, path.join(ROOT, 'private', 'admin.html'));
    if (p === '/painel' || p === '/painel/') return serveFile(res, path.join(PUB, 'painel.html'));
    if (p === '/entrar' || p === '/entrar/') return serveFile(res, path.join(PUB, 'entrar.html'));

    let m;
    if ((m = p.match(/^\/r\/([a-z0-9-]+)\/?$/))) return serveSiteBySlug(res, m[1], {});
    if ((m = p.match(/^\/demo\/(elegante|moderno|industrial|minimalista)\/?$/))) {
      return send(res, 200, sitePage(starterSite({ demo: true, theme: m[1] }), { demo: true }), { 'Content-Type': 'text/html; charset=utf-8' });
    }
    // Pré-visualização do painel: carrega o site do tenant logado (recebe rascunho via postMessage)
    if (p === '/preview') {
      const s = getSession(req, 'client');
      if (!s) return send(res, 401, 'Faça login', { 'Content-Type': 'text/plain; charset=utf-8' });
      return send(res, 200, sitePage(readSite(s.tenant_id) || {}, { preview: true }), { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' });
    }
    if ((m = p.match(/^\/u\/(tnt_[\w-]+)\/([\w.-]+)$/))) {
      const f = safeJoin(UPLOADS, path.join(m[1], m[2]));
      return f ? serveFile(res, f, 'public, max-age=31536000, immutable') : send(res, 404, '');
    }
    if (req.method !== 'GET' && req.method !== 'HEAD') return fail(res, 405, 'Método não permitido.');
    const rel = p === '/' ? 'index.html' : p.slice(1);
    const f = safeJoin(PUB, rel);
    if (!f) return send(res, 404, '');
    return serveFile(res, f);
  } catch (e) {
    if (!e.status) console.error(e);
    if (!res.headersSent) fail(res, e.status || 500, e.status ? e.message : 'Erro interno. Tente novamente.');
  }
});
server.listen(PORT, () => console.log(`MesaPronta rodando em http://localhost:${PORT}  (admin: /admin)`));
