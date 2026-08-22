/**
 * 組合員間共同配送 API (地図中心版)
 *
 * 主な機能:
 *  - ルート CRUD (登録・編集・削除・一覧・詳細)
 *  - 経由地 CRUD
 *  - 車両位置のポーリング (POST: ドライバー / GET: 組合員・管理画面)
 *  - 完了写真アップロード (Supabase Storage)
 *  - 簡易パスワード認証 (組合員閲覧画面用)
 */
require('dotenv').config();

// Node.js 20 では WebSocket がグローバルに存在しないため、
// @supabase/supabase-js の起動時チェックで落ちることがある。
// このAPIは Supabase Realtime を使わないが、念のため ws で補完しておく。
if (typeof globalThis.WebSocket === 'undefined') {
  try {
    globalThis.WebSocket = require('ws');
  } catch (e) {
    console.warn('⚠️ ws パッケージが見つかりません。Node 22 以上なら不要です。');
  }
}

const express = require('express');
const cors = require('cors');
const multer = require('multer');
const crypto = require('crypto');
const { createClient } = require('@supabase/supabase-js');

const PORT = process.env.PORT || 10000;
const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const VIEWER_PASSWORD = process.env.VIEWER_PASSWORD || 'change-me';
const ADMIN_PASSWORD  = process.env.ADMIN_PASSWORD  || 'change-me-admin';

if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
  console.error('❌ SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY が未設定です');
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
  // このAPIは REST と Storage のみ使用。Realtime(WebSocket) は不要なので
  // 接続を張らないよう最小設定にする。
  realtime: { params: { eventsPerSecond: 1 } },
  global: { headers: { 'x-application-name': 'coop-delivery-api' } },
});

const app = express();

// CORS
const allowedOrigins = (process.env.CORS_ORIGIN || '*').split(',').map(s => s.trim());
app.use(cors({
  origin: (origin, cb) => {
    if (!origin || allowedOrigins.includes('*') || allowedOrigins.includes(origin)) return cb(null, true);
    cb(new Error(`CORS blocked: ${origin}`));
  },
}));
app.use(express.json({ limit: '1mb' }));

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 10 * 1024 * 1024 } });

// 共通エラーラッパ
const wrap = (fn) => (req, res) => Promise.resolve(fn(req, res)).catch((e) => {
  console.error(e);
  res.status(500).json({ error: e.message });
});

// ===== 組合員ログイン用のパスワードハッシュ / トークン（Node標準cryptoのみ） =====
// トークン署名鍵。未設定ならサービスキーから派生（環境間で一貫させるため固定文字列を推奨）
const SESSION_SECRET = process.env.SESSION_SECRET
  || crypto.createHash('sha256').update('coop-member-' + SUPABASE_SERVICE_KEY).digest('hex');
const MEMBER_TOKEN_TTL_MS = 30 * 24 * 60 * 60 * 1000; // 30日

// scrypt でパスワードをハッシュ化。保存形式は "salt:hash"（ともにhex）
function hashPassword(password) {
  const salt = crypto.randomBytes(16).toString('hex');
  const hash = crypto.scryptSync(String(password), salt, 64).toString('hex');
  return `${salt}:${hash}`;
}
function verifyPassword(password, stored) {
  if (!stored || !stored.includes(':')) return false;
  const [salt, hash] = stored.split(':');
  const candidate = crypto.scryptSync(String(password), salt, 64).toString('hex');
  const a = Buffer.from(hash, 'hex');
  const b = Buffer.from(candidate, 'hex');
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

// HMAC 署名付きトークン: base64url(payload).hmac
function signMemberToken(memberId) {
  const payload = Buffer.from(JSON.stringify({ m: memberId, exp: Date.now() + MEMBER_TOKEN_TTL_MS }))
    .toString('base64url');
  const sig = crypto.createHmac('sha256', SESSION_SECRET).update(payload).digest('base64url');
  return `${payload}.${sig}`;
}
function verifyMemberToken(token) {
  if (!token || !token.includes('.')) return null;
  const [payload, sig] = token.split('.');
  const expected = crypto.createHmac('sha256', SESSION_SECRET).update(payload).digest('base64url');
  const a = Buffer.from(sig);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;
  try {
    const data = JSON.parse(Buffer.from(payload, 'base64url').toString());
    if (!data.exp || data.exp < Date.now()) return null;
    return data.m;
  } catch {
    return null;
  }
}

// 組合員認証ミドルウェア (X-Member-Token ヘッダーで判定)
async function requireMember(req, res, next) {
  const token = req.header('X-Member-Token') || '';
  const memberId = verifyMemberToken(token);
  if (!memberId) return res.status(401).json({ error: 'ログインが必要です' });
  const { data, error } = await supabase
    .from('members').select('id,code,name,type,address,lat,lng,contact_name,phone,email')
    .eq('id', memberId).single();
  if (error || !data) return res.status(401).json({ error: 'ログインが無効です' });
  req.member = data;
  next();
}

// 組合員トークン or 管理者パスワードのどちらかで通す。
// req.actor = { kind:'member', member } または { kind:'admin' }
async function requireActor(req, res, next) {
  const token = req.header('X-Member-Token') || '';
  const memberId = verifyMemberToken(token);
  if (memberId) {
    const { data } = await supabase
      .from('members').select('id,code,name,type').eq('id', memberId).single();
    if (data) { req.actor = { kind: 'member', member: data }; return next(); }
  }
  if (checkPassword(req, 'admin')) { req.actor = { kind: 'admin' }; return next(); }
  return res.status(401).json({ error: 'ログインが必要です' });
}

// ===== 地理計算 =====
// ハバサイン距離(km)
function distanceKm(lat1, lng1, lat2, lng2) {
  const R = 6371;
  const toRad = (d) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a = Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}
// 経由地の重心（座標を持つ経由地の平均）
function centroidOfStops(stops) {
  const pts = (stops || []).filter(s => s.lat != null && s.lng != null);
  if (pts.length === 0) return null;
  const lat = pts.reduce((s, p) => s + Number(p.lat), 0) / pts.length;
  const lng = pts.reduce((s, p) => s + Number(p.lng), 0) / pts.length;
  return { lat, lng };
}
// 前日18時（JST）の締切を計算して ISO 文字列で返す
function prevDay18JST(dateStr) {
  // dateStr = 'YYYY-MM-DD'。当日18:00 JST から1日引く
  const at18 = new Date(`${dateStr}T18:00:00+09:00`);
  at18.setDate(at18.getDate() - 1);
  return at18.toISOString();
}

// ===== 認証 (簡易パスワード) =====
// X-Viewer-Password ヘッダーで viewer/driver/admin を判定
function checkPassword(req, kind) {
  const pw = req.header('X-Viewer-Password') || req.query.password || '';
  if (kind === 'admin' && pw === ADMIN_PASSWORD)  return true;
  if (kind === 'viewer' && (pw === VIEWER_PASSWORD || pw === ADMIN_PASSWORD)) return true;
  return false;
}

const requireViewer = (req, res, next) => {
  if (!checkPassword(req, 'viewer')) return res.status(401).json({ error: 'パスワードが違います' });
  next();
};
const requireAdmin = (req, res, next) => {
  if (!checkPassword(req, 'admin')) return res.status(401).json({ error: '管理者パスワードが違います' });
  next();
};

// パスワード検証専用エンドポイント
app.post('/api/auth/check', wrap(async (req, res) => {
  const { password, role } = req.body;
  if (role === 'admin' && password === ADMIN_PASSWORD) return res.json({ ok: true, role: 'admin' });
  if (role === 'viewer' && (password === VIEWER_PASSWORD || password === ADMIN_PASSWORD)) {
    return res.json({ ok: true, role: 'viewer' });
  }
  res.status(401).json({ ok: false, error: 'パスワードが違います' });
}));

// ドライバーPIN認証
app.post('/api/auth/driver', wrap(async (req, res) => {
  const { pin } = req.body;
  if (!pin) return res.status(400).json({ error: 'PINが必要です' });
  const { data, error } = await supabase
    .from('drivers').select('id,name,phone').eq('pin_code', pin).eq('active', true).single();
  if (error || !data) return res.status(401).json({ error: 'PINが違います' });
  res.json({ ok: true, driver: data });
}));

// ドライバー認証ミドルウェア (X-Driver-Pin ヘッダーで判定)
async function requireDriver(req, res, next) {
  const pin = req.header('X-Driver-Pin') || '';
  if (!pin) return res.status(401).json({ error: 'ドライバー認証が必要です' });
  const { data, error } = await supabase
    .from('drivers').select('id,name').eq('pin_code', pin).eq('active', true).single();
  if (error || !data) return res.status(401).json({ error: 'PINが無効です' });
  req.driver = data;
  next();
}

// ドライバー専用: 自分の担当ルート一覧 (本日 or 日付指定)
app.get('/api/driver/routes', requireDriver, wrap(async (req, res) => {
  const date = req.query.date || new Date().toISOString().slice(0, 10);
  const { data, error } = await supabase
    .from('routes')
    .select('*, vehicles(name,plate_number)')
    .eq('driver_id', req.driver.id)
    .eq('scheduled_date', date)
    .neq('status', 'cancelled')
    .order('planned_start_time', { ascending: true });
  if (error) throw error;
  res.json(data.map(r => ({
    ...r,
    vehicle_name: r.vehicles?.name,
    vehicle_plate: r.vehicles?.plate_number,
  })));
}));

// ドライバー専用: ルート詳細
app.get('/api/driver/routes/:id', requireDriver, wrap(async (req, res) => {
  const { data: route, error: e1 } = await supabase
    .from('routes')
    .select('*, vehicles(name,plate_number)')
    .eq('id', req.params.id)
    .eq('driver_id', req.driver.id)
    .single();
  if (e1 || !route) return res.status(404).json({ error: 'not found' });

  const { data: stops, error: e2 } = await supabase
    .from('route_stops').select('*, members(name)')
    .eq('route_id', req.params.id).order('stop_order');
  if (e2) throw e2;

  res.json({
    ...route,
    vehicle_name: route.vehicles?.name,
    vehicle_plate: route.vehicles?.plate_number,
    stops: stops.map(s => ({ ...s, member_name: s.members?.name })),
  });
}));

// ===== ヘルスチェック =====
app.get('/api/health', (req, res) => res.json({ ok: true, time: new Date().toISOString() }));

// ===== マスタ系 =====
// GET は誰でも可 (ルート登録フォーム等で使うため)。
// 一覧は ?all=1 で非アクティブも含む (管理画面用)。
// POST/PUT/DELETE は requireAdmin。

// --- 組合員 (members) ---
app.get('/api/members', wrap(async (req, res) => {
  const { data, error } = await supabase.from('members').select('*').order('id');
  if (error) throw error;
  // password_hash / login_id は公開しない。ログイン設定済みかだけ has_login で伝える。
  res.json((data || []).map(({ password_hash, login_id, ...m }) => ({
    ...m,
    has_login: !!login_id,
  })));
}));

// --- 組合員ログイン ---
// ログインID + パスワードで認証し、以降の依頼系APIで使うトークンを返す
app.post('/api/auth/member', wrap(async (req, res) => {
  const { login_id, password } = req.body || {};
  if (!login_id || !password) {
    return res.status(400).json({ error: 'ログインIDとパスワードを入力してください' });
  }
  const { data, error } = await supabase
    .from('members').select('id,code,name,type,password_hash')
    .eq('login_id', login_id).maybeSingle();
  if (error) throw error;
  if (!data || !data.password_hash || !verifyPassword(password, data.password_hash)) {
    return res.status(401).json({ error: 'ログインIDまたはパスワードが違います' });
  }
  res.json({
    ok: true,
    token: signMemberToken(data.id),
    member: { id: data.id, code: data.code, name: data.name, type: data.type },
  });
}));

// 組合員: 自分のプロフィール
app.get('/api/member/me', requireMember, wrap(async (req, res) => {
  res.json(req.member);
}));

// 管理者: 組合員のログイン情報を設定/変更（login_id と任意でパスワード）
app.put('/api/members/:id/credentials', requireAdmin, wrap(async (req, res) => {
  const { login_id, password } = req.body || {};
  const update = {};
  if (login_id !== undefined) update.login_id = login_id ? String(login_id).trim() : null;
  if (password) {
    if (String(password).length < 4) {
      return res.status(400).json({ error: 'パスワードは4文字以上にしてください' });
    }
    update.password_hash = hashPassword(password);
  }
  if (Object.keys(update).length === 0) {
    return res.status(400).json({ error: 'login_id または password を指定してください' });
  }
  // login_id 重複チェック
  if (update.login_id) {
    const { data: dup } = await supabase
      .from('members').select('id').eq('login_id', update.login_id)
      .neq('id', req.params.id).maybeSingle();
    if (dup) return res.status(409).json({ error: 'このログインIDは既に使われています' });
  }
  const { error } = await supabase.from('members').update(update).eq('id', req.params.id);
  if (error) throw error;
  res.json({ ok: true });
}));

app.post('/api/members', requireAdmin, wrap(async (req, res) => {
  const b = req.body;
  if (!b.code || !b.name || !b.type) {
    return res.status(400).json({ error: 'code, name, type は必須です' });
  }
  const { data, error } = await supabase.from('members').insert({
    code: b.code,
    name: b.name,
    type: b.type,
    address: b.address || null,
    lat: b.lat ?? null,
    lng: b.lng ?? null,
    contact_name: b.contact_name || null,
    phone: b.phone || null,
    email: b.email || null,
  }).select().single();
  if (error) throw error;
  res.json(data);
}));

app.put('/api/members/:id', requireAdmin, wrap(async (req, res) => {
  const b = req.body;
  const { data, error } = await supabase.from('members').update({
    code: b.code,
    name: b.name,
    type: b.type,
    address: b.address || null,
    lat: b.lat ?? null,
    lng: b.lng ?? null,
    contact_name: b.contact_name || null,
    phone: b.phone || null,
    email: b.email || null,
  }).eq('id', req.params.id).select().single();
  if (error) throw error;
  res.json(data);
}));

app.delete('/api/members/:id', requireAdmin, wrap(async (req, res) => {
  // 経由地から参照されている場合は削除を拒否 (整合性保護)
  const { count } = await supabase
    .from('route_stops').select('id', { count: 'exact', head: true })
    .eq('member_id', req.params.id);
  if (count && count > 0) {
    return res.status(409).json({
      error: `この組合員はルートの経由地${count}件で使用中のため削除できません`,
    });
  }
  const { error } = await supabase.from('members').delete().eq('id', req.params.id);
  if (error) throw error;
  res.json({ ok: true });
}));

// --- 車両 (vehicles) ---
app.get('/api/vehicles', wrap(async (req, res) => {
  let q = supabase.from('vehicles').select('*').order('id');
  if (!req.query.all) q = q.eq('active', true);
  const { data, error } = await q;
  if (error) throw error;
  res.json(data);
}));

app.post('/api/vehicles', requireAdmin, wrap(async (req, res) => {
  const b = req.body;
  if (!b.code || !b.name) {
    return res.status(400).json({ error: 'code, name は必須です' });
  }
  const { data, error } = await supabase.from('vehicles').insert({
    code: b.code,
    name: b.name,
    plate_number: b.plate_number || null,
    vehicle_type: b.vehicle_type || null,
    capacity_kg: b.capacity_kg ?? 1000,
    refrigerated: !!b.refrigerated,
    active: b.active === undefined ? true : !!b.active,
  }).select().single();
  if (error) throw error;
  res.json(data);
}));

app.put('/api/vehicles/:id', requireAdmin, wrap(async (req, res) => {
  const b = req.body;
  const { data, error } = await supabase.from('vehicles').update({
    code: b.code,
    name: b.name,
    plate_number: b.plate_number || null,
    vehicle_type: b.vehicle_type || null,
    capacity_kg: b.capacity_kg ?? 1000,
    refrigerated: !!b.refrigerated,
    active: b.active === undefined ? true : !!b.active,
  }).eq('id', req.params.id).select().single();
  if (error) throw error;
  res.json(data);
}));

app.delete('/api/vehicles/:id', requireAdmin, wrap(async (req, res) => {
  // ルートから参照されている場合は論理削除 (active=false)、それ以外は物理削除
  const { count } = await supabase
    .from('routes').select('id', { count: 'exact', head: true })
    .eq('vehicle_id', req.params.id);
  if (count && count > 0) {
    const { error } = await supabase.from('vehicles')
      .update({ active: false }).eq('id', req.params.id);
    if (error) throw error;
    return res.json({ ok: true, soft_deleted: true });
  }
  const { error } = await supabase.from('vehicles').delete().eq('id', req.params.id);
  if (error) throw error;
  res.json({ ok: true });
}));

// --- ドライバー (drivers) ---
app.get('/api/drivers', wrap(async (req, res) => {
  // 一覧では pin_code は返さない (セキュリティ)。?all=1 で非アクティブも含む
  let q = supabase.from('drivers').select('id,member_id,name,phone,active').order('id');
  if (!req.query.all) q = q.eq('active', true);
  const { data, error } = await q;
  if (error) throw error;
  res.json(data);
}));

app.post('/api/drivers', requireAdmin, wrap(async (req, res) => {
  const b = req.body;
  if (!b.name || !b.pin_code) {
    return res.status(400).json({ error: 'name, pin_code は必須です' });
  }
  if (!/^\d{4,6}$/.test(String(b.pin_code))) {
    return res.status(400).json({ error: 'PINは4〜6桁の数字で入力してください' });
  }
  // PIN 重複チェック
  const { data: dup } = await supabase
    .from('drivers').select('id').eq('pin_code', String(b.pin_code)).maybeSingle();
  if (dup) return res.status(409).json({ error: 'このPINは既に使われています' });

  const { data, error } = await supabase.from('drivers').insert({
    member_id: b.member_id || null,
    name: b.name,
    phone: b.phone || null,
    pin_code: String(b.pin_code),
    active: b.active === undefined ? true : !!b.active,
  }).select('id,member_id,name,phone,active').single();
  if (error) throw error;
  res.json(data);
}));

app.put('/api/drivers/:id', requireAdmin, wrap(async (req, res) => {
  const b = req.body;
  const update = {
    member_id: b.member_id || null,
    name: b.name,
    phone: b.phone || null,
    active: b.active === undefined ? true : !!b.active,
  };
  // pin_code は送られてきた時だけ更新 (空なら据え置き)
  if (b.pin_code) {
    if (!/^\d{4,6}$/.test(String(b.pin_code))) {
      return res.status(400).json({ error: 'PINは4〜6桁の数字で入力してください' });
    }
    const { data: dup } = await supabase
      .from('drivers').select('id').eq('pin_code', String(b.pin_code))
      .neq('id', req.params.id).maybeSingle();
    if (dup) return res.status(409).json({ error: 'このPINは既に使われています' });
    update.pin_code = String(b.pin_code);
  }
  const { data, error } = await supabase.from('drivers')
    .update(update).eq('id', req.params.id)
    .select('id,member_id,name,phone,active').single();
  if (error) throw error;
  res.json(data);
}));

app.delete('/api/drivers/:id', requireAdmin, wrap(async (req, res) => {
  // ルートに割当済みなら論理削除
  const { count } = await supabase
    .from('routes').select('id', { count: 'exact', head: true })
    .eq('driver_id', req.params.id);
  if (count && count > 0) {
    const { error } = await supabase.from('drivers')
      .update({ active: false }).eq('id', req.params.id);
    if (error) throw error;
    return res.json({ ok: true, soft_deleted: true });
  }
  const { error } = await supabase.from('drivers').delete().eq('id', req.params.id);
  if (error) throw error;
  res.json({ ok: true });
}));

// ===== ルート CRUD =====

// 一覧 (日付指定で絞り込み・組合員も閲覧可)
app.get('/api/routes', requireViewer, wrap(async (req, res) => {
  let q = supabase
    .from('routes')
    .select('*, drivers(name,phone), vehicles(name,plate_number,vehicle_type)')
    .order('scheduled_date', { ascending: false })
    .order('planned_start_time', { ascending: true });
  if (req.query.date) q = q.eq('scheduled_date', req.query.date);
  if (req.query.status) q = q.eq('status', req.query.status);
  const { data, error } = await q;
  if (error) throw error;
  res.json(data.map(r => ({
    ...r,
    driver_name: r.drivers?.name,
    driver_phone: r.drivers?.phone,
    vehicle_name: r.vehicles?.name,
    vehicle_plate: r.vehicles?.plate_number,
  })));
}));

// 詳細 (経由地・最新位置を含む)
app.get('/api/routes/:id', requireViewer, wrap(async (req, res) => {
  const { data: route, error: e1 } = await supabase
    .from('routes')
    .select('*, drivers(name,phone), vehicles(name,plate_number,vehicle_type,capacity_kg,refrigerated)')
    .eq('id', req.params.id).single();
  if (e1 || !route) return res.status(404).json({ error: 'not found' });

  const { data: stops, error: e2 } = await supabase
    .from('route_stops').select('*, members(name)')
    .eq('route_id', req.params.id).order('stop_order');
  if (e2) throw e2;

  const { data: latest } = await supabase
    .from('vehicle_latest_positions').select('*').eq('route_id', req.params.id).maybeSingle();

  res.json({
    ...route,
    driver_name: route.drivers?.name,
    driver_phone: route.drivers?.phone,
    vehicle_name: route.vehicles?.name,
    vehicle_plate: route.vehicles?.plate_number,
    stops: stops.map(s => ({ ...s, member_name: s.members?.name })),
    latest_position: latest || null,
  });
}));

// 作成 (ルート + 経由地)
app.post('/api/routes', requireAdmin, wrap(async (req, res) => {
  const { name, scheduled_date, driver_id, vehicle_id, planned_start_time, notes, stops } = req.body;
  if (!name || !scheduled_date || !stops || stops.length === 0) {
    return res.status(400).json({ error: 'name, scheduled_date, stops は必須です' });
  }

  const code = 'RT-' + Date.now().toString(36).toUpperCase();
  const { data: route, error: e1 } = await supabase.from('routes').insert({
    route_code: code, name, scheduled_date,
    driver_id: driver_id || null, vehicle_id: vehicle_id || null,
    planned_start_time: planned_start_time || null, notes: notes || null,
    status: 'planned',
  }).select().single();
  if (e1) throw e1;

  const stopRows = stops.map((s, i) => ({
    route_id: route.id,
    stop_order: i + 1,
    stop_type: s.stop_type,
    member_id: s.member_id || null,
    address: s.address,
    lat: s.lat,
    lng: s.lng,
    cargo_description: s.cargo_description || null,
    weight_kg: s.weight_kg || null,
    refrigerated: !!s.refrigerated,
    scheduled_time: s.scheduled_time || null,
  }));
  const { error: e2 } = await supabase.from('route_stops').insert(stopRows);
  if (e2) {
    await supabase.from('routes').delete().eq('id', route.id);
    throw e2;
  }
  res.json({ id: route.id, route_code: code });
}));

// 更新 (ルート + 経由地を全置換)
app.put('/api/routes/:id', requireAdmin, wrap(async (req, res) => {
  const id = +req.params.id;
  const { name, scheduled_date, driver_id, vehicle_id, planned_start_time, notes, status, stops } = req.body;

  const { error: e1 } = await supabase.from('routes').update({
    name, scheduled_date,
    driver_id: driver_id || null, vehicle_id: vehicle_id || null,
    planned_start_time: planned_start_time || null, notes: notes || null,
    status: status || 'planned',
    updated_at: new Date().toISOString(),
  }).eq('id', id);
  if (e1) throw e1;

  if (Array.isArray(stops)) {
    // 既存ストップを全削除して入れ直し (シンプルだが完了状態は失われる)
    // 実運用は stop_order ベースで差分更新したほうが良いが、PoCではこれで十分
    await supabase.from('route_stops').delete().eq('route_id', id);
    const stopRows = stops.map((s, i) => ({
      route_id: id,
      stop_order: i + 1,
      stop_type: s.stop_type,
      member_id: s.member_id || null,
      address: s.address,
      lat: s.lat,
      lng: s.lng,
      cargo_description: s.cargo_description || null,
      weight_kg: s.weight_kg || null,
      refrigerated: !!s.refrigerated,
      scheduled_time: s.scheduled_time || null,
      completed: !!s.completed,
      completed_at: s.completed_at || null,
      arrived_at: s.arrived_at || null,
      notes: s.notes || null,
      photo_url: s.photo_url || null,
    }));
    if (stopRows.length > 0) {
      const { error: e2 } = await supabase.from('route_stops').insert(stopRows);
      if (e2) throw e2;
    }
  }
  res.json({ ok: true });
}));

// 削除
app.delete('/api/routes/:id', requireAdmin, wrap(async (req, res) => {
  const { error } = await supabase.from('routes').delete().eq('id', req.params.id);
  if (error) throw error;
  res.json({ ok: true });
}));

// ===== 配送履歴 =====

// 履歴一覧: 完了ルートを新しい順に。経由地件数・写真件数の集計付き。
// ?from=YYYY-MM-DD & ?to=YYYY-MM-DD で期間絞り込み可。
app.get('/api/history', requireViewer, wrap(async (req, res) => {
  let q = supabase
    .from('routes')
    .select('*, drivers(name,phone), vehicles(name,plate_number), route_stops(id,stop_type,completed,photo_url,completed_at)')
    .eq('status', 'completed')
    .order('scheduled_date', { ascending: false })
    .order('end_time', { ascending: false });
  if (req.query.from) q = q.gte('scheduled_date', req.query.from);
  if (req.query.to) q = q.lte('scheduled_date', req.query.to);
  const { data, error } = await q;
  if (error) throw error;

  res.json((data || []).map(r => {
    const stops = r.route_stops || [];
    return {
      id: r.id,
      route_code: r.route_code,
      name: r.name,
      scheduled_date: r.scheduled_date,
      start_time: r.start_time,
      end_time: r.end_time,
      status: r.status,
      driver_name: r.drivers?.name,
      driver_phone: r.drivers?.phone,
      vehicle_name: r.vehicles?.name,
      vehicle_plate: r.vehicles?.plate_number,
      stops_total: stops.length,
      stops_completed: stops.filter(s => s.completed).length,
      photos_count: stops.filter(s => s.photo_url).length,
    };
  }));
}));

// 履歴詳細: 経由地(完了写真・完了時刻含む)。詳細表示は /api/routes/:id と同等だが
// 履歴用に写真・時刻を扱いやすい形で返す。
app.get('/api/history/:id', requireViewer, wrap(async (req, res) => {
  const { data: route, error: e1 } = await supabase
    .from('routes')
    .select('*, drivers(name,phone), vehicles(name,plate_number,vehicle_type,capacity_kg,refrigerated)')
    .eq('id', req.params.id).single();
  if (e1 || !route) return res.status(404).json({ error: 'not found' });

  const { data: stops, error: e2 } = await supabase
    .from('route_stops').select('*, members(name)')
    .eq('route_id', req.params.id).order('stop_order');
  if (e2) throw e2;

  res.json({
    ...route,
    driver_name: route.drivers?.name,
    driver_phone: route.drivers?.phone,
    vehicle_name: route.vehicles?.name,
    vehicle_plate: route.vehicles?.plate_number,
    stops: (stops || []).map(s => ({ ...s, member_name: s.members?.name })),
  });
}));

// ===== 経由地 (個別更新・写真アップロード等) =====

// ストップ完了 (写真任意)
app.post('/api/stops/:id/complete', upload.single('photo'), wrap(async (req, res) => {
  const stopId = +req.params.id;
  const notes = req.body?.notes || null;
  let photoUrl = null;

  if (req.file) {
    const ext = (req.file.originalname.split('.').pop() || 'jpg').toLowerCase();
    const fileName = `stop_${stopId}_${Date.now()}.${ext}`;
    const { error: upErr } = await supabase.storage
      .from('delivery-photos')
      .upload(fileName, req.file.buffer, {
        contentType: req.file.mimetype,
        upsert: true,
      });
    if (upErr) throw upErr;
    const { data: pub } = supabase.storage.from('delivery-photos').getPublicUrl(fileName);
    photoUrl = pub.publicUrl;
  }

  // ストップを完了に更新
  const { data: stop, error: e0 } = await supabase
    .from('route_stops').select('route_id').eq('id', stopId).single();
  if (e0 || !stop) return res.status(404).json({ error: 'stop not found' });

  const update = {
    completed: true,
    completed_at: new Date().toISOString(),
    arrived_at: new Date().toISOString(),
    notes,
  };
  if (photoUrl) update.photo_url = photoUrl;

  const { error: e1 } = await supabase.from('route_stops').update(update).eq('id', stopId);
  if (e1) throw e1;

  // ルート全体の完了判定
  const { count } = await supabase
    .from('route_stops').select('id', { count: 'exact', head: true })
    .eq('route_id', stop.route_id).eq('completed', false);

  if (count === 0) {
    await supabase.from('routes').update({
      status: 'completed', end_time: new Date().toISOString(),
    }).eq('id', stop.route_id);
  } else {
    // 進行中に切替 (最初のストップ完了時だけ)
    await supabase.from('routes').update({
      status: 'in_progress',
      start_time: new Date().toISOString(),
    }).eq('id', stop.route_id).eq('status', 'planned');
  }

  res.json({ ok: true, photo_url: photoUrl });
}));

// 写真だけ追加 (再撮影用)
app.post('/api/stops/:id/photo', upload.single('photo'), wrap(async (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'photoが必要です' });
  const stopId = +req.params.id;
  const ext = (req.file.originalname.split('.').pop() || 'jpg').toLowerCase();
  const fileName = `stop_${stopId}_${Date.now()}.${ext}`;
  const { error: upErr } = await supabase.storage
    .from('delivery-photos')
    .upload(fileName, req.file.buffer, { contentType: req.file.mimetype, upsert: true });
  if (upErr) throw upErr;
  const { data: pub } = supabase.storage.from('delivery-photos').getPublicUrl(fileName);
  await supabase.from('route_stops').update({ photo_url: pub.publicUrl }).eq('id', stopId);
  res.json({ ok: true, photo_url: pub.publicUrl });
}));

// ===== 車両位置 =====

// ドライバーが定期的に POST
app.post('/api/positions', wrap(async (req, res) => {
  const { route_id, vehicle_id, driver_id, lat, lng, heading, speed_kmh } = req.body;
  if (!route_id || lat == null || lng == null) {
    return res.status(400).json({ error: 'route_id, lat, lng は必須です' });
  }
  const { error } = await supabase.from('vehicle_positions').insert({
    route_id, vehicle_id: vehicle_id || null, driver_id: driver_id || null,
    lat, lng, heading: heading || null, speed_kmh: speed_kmh || null,
  });
  if (error) throw error;
  res.json({ ok: true });
}));

// ある日付の全ルートの最新位置 (組合員用マップ画面)
app.get('/api/positions/latest', requireViewer, wrap(async (req, res) => {
  const date = req.query.date;
  let routesQ = supabase.from('routes').select('id,route_code,name,status,driver_id,vehicle_id,drivers(name),vehicles(name)');
  if (date) routesQ = routesQ.eq('scheduled_date', date);
  const { data: routes, error: e1 } = await routesQ;
  if (e1) throw e1;
  if (!routes || routes.length === 0) return res.json([]);

  const ids = routes.map(r => r.id);
  const { data: positions, error: e2 } = await supabase
    .from('vehicle_latest_positions').select('*').in('route_id', ids);
  if (e2) throw e2;

  const merged = routes.map(r => {
    const p = positions?.find(x => x.route_id === r.id);
    return {
      route_id: r.id,
      route_code: r.route_code,
      route_name: r.name,
      status: r.status,
      driver_name: r.drivers?.name,
      vehicle_name: r.vehicles?.name,
      lat: p?.lat || null,
      lng: p?.lng || null,
      heading: p?.heading,
      recorded_at: p?.recorded_at || null,
    };
  });
  res.json(merged);
}));

// あるルートの位置履歴 (ルート再生用)
app.get('/api/positions/history/:routeId', requireViewer, wrap(async (req, res) => {
  const { data, error } = await supabase
    .from('vehicle_positions').select('lat,lng,recorded_at')
    .eq('route_id', req.params.routeId)
    .order('recorded_at', { ascending: true });
  if (error) throw error;
  res.json(data);
}));

// ============================================================
// 機能1: ルート下書き → 予定化（集荷募集）→ 集荷依頼 → 承認
// ============================================================

// 経由地から重心・半径を付けて返す共通処理
async function loadScheduleWithGeo(routeId) {
  const { data: route, error } = await supabase
    .from('routes')
    .select('*, drivers(name), vehicles(name), members:created_by_member_id(name)')
    .eq('id', routeId).single();
  if (error || !route) return null;
  const { data: stops } = await supabase
    .from('route_stops').select('*').eq('route_id', routeId).order('stop_order');
  const center = centroidOfStops(stops);
  return {
    ...route,
    creator_name: route.members?.name || null,
    driver_name: route.drivers?.name || null,
    vehicle_name: route.vehicles?.name || null,
    stops: stops || [],
    center,
  };
}

// 下書きルート作成（日付なし）。組合員 or 管理者。
app.post('/api/schedules/draft', requireActor, wrap(async (req, res) => {
  const { name, stops, notes } = req.body || {};
  if (!name || !Array.isArray(stops) || stops.length === 0) {
    return res.status(400).json({ error: 'name と stops は必須です' });
  }
  const code = 'RT-' + Date.now().toString(36).toUpperCase();
  const { data: route, error: e1 } = await supabase.from('routes').insert({
    route_code: code, name,
    scheduled_date: null, status: 'draft',
    notes: notes || null,
    created_by_member_id: req.actor.kind === 'member' ? req.actor.member.id : null,
  }).select().single();
  if (e1) throw e1;

  const stopRows = stops.map((s, i) => ({
    route_id: route.id, stop_order: i + 1,
    stop_type: s.stop_type || 'delivery',
    member_id: s.member_id || null,
    address: s.address, lat: s.lat, lng: s.lng,
    cargo_description: s.cargo_description || null,
    weight_kg: s.weight_kg || null,
    refrigerated: !!s.refrigerated,
    scheduled_time: s.scheduled_time || null,
  }));
  const { error: e2 } = await supabase.from('route_stops').insert(stopRows);
  if (e2) { await supabase.from('routes').delete().eq('id', route.id); throw e2; }
  res.json({ id: route.id, route_code: code });
}));

// 下書きを予定化 → 集荷募集開始。日付・半径を決め、締切を前日18時に設定。
app.post('/api/schedules/:id/publish', requireActor, wrap(async (req, res) => {
  const id = +req.params.id;
  const { scheduled_date, radius_km } = req.body || {};
  if (!scheduled_date) return res.status(400).json({ error: 'scheduled_date は必須です' });

  const { data: route } = await supabase.from('routes').select('*').eq('id', id).single();
  if (!route) return res.status(404).json({ error: 'not found' });
  if (req.actor.kind === 'member' && route.created_by_member_id !== req.actor.member.id) {
    return res.status(403).json({ error: '作成者のみ予定化できます' });
  }

  const { error } = await supabase.from('routes').update({
    scheduled_date,
    status: 'recruiting',
    radius_km: radius_km != null ? Number(radius_km) : 10,
    pickup_deadline: prevDay18JST(scheduled_date),
    updated_at: new Date().toISOString(),
  }).eq('id', id);
  if (error) throw error;
  res.json({ ok: true });
}));

// 集荷募集中の予定一覧（組合員が依頼先を探す用）。重心・半径付き。
app.get('/api/schedules', requireActor, wrap(async (req, res) => {
  const status = req.query.status || 'recruiting';
  const { data: routes, error } = await supabase
    .from('routes').select('*, members:created_by_member_id(name)')
    .eq('status', status)
    .order('scheduled_date', { ascending: true });
  if (error) throw error;

  const result = [];
  for (const r of routes || []) {
    const { data: stops } = await supabase
      .from('route_stops').select('lat,lng').eq('route_id', r.id);
    result.push({
      id: r.id, route_code: r.route_code, name: r.name,
      scheduled_date: r.scheduled_date, status: r.status,
      radius_km: r.radius_km, pickup_deadline: r.pickup_deadline,
      creator_name: r.members?.name || null,
      center: centroidOfStops(stops),
    });
  }
  res.json(result);
}));

// 予定詳細（重心・経由地・承認済み含む）
app.get('/api/schedules/:id', requireActor, wrap(async (req, res) => {
  const schedule = await loadScheduleWithGeo(+req.params.id);
  if (!schedule) return res.status(404).json({ error: 'not found' });
  res.json(schedule);
}));

// 自分が作成した予定・下書き一覧（マイページ用）
app.get('/api/my/schedules', requireMember, wrap(async (req, res) => {
  const { data, error } = await supabase
    .from('routes').select('*')
    .eq('created_by_member_id', req.member.id)
    .order('created_at', { ascending: false });
  if (error) throw error;
  res.json(data || []);
}));

// 集荷依頼を作成（組合員）。半径内・締切前のみ受付。
app.post('/api/schedules/:id/requests', requireMember, wrap(async (req, res) => {
  const routeId = +req.params.id;
  const b = req.body || {};
  const schedule = await loadScheduleWithGeo(routeId);
  if (!schedule) return res.status(404).json({ error: 'not found' });
  if (schedule.status !== 'recruiting') {
    return res.status(409).json({ error: 'この予定は現在集荷募集中ではありません' });
  }
  if (schedule.pickup_deadline && new Date(schedule.pickup_deadline) < new Date()) {
    return res.status(409).json({ error: '締切（前日18時）を過ぎています' });
  }
  if (b.pickup_lat == null || b.pickup_lng == null) {
    return res.status(400).json({ error: '集荷場所の座標が必要です' });
  }
  // 半径判定（経由地の重心から radius_km 以内）
  if (schedule.center) {
    const d = distanceKm(schedule.center.lat, schedule.center.lng, Number(b.pickup_lat), Number(b.pickup_lng));
    const limit = Number(schedule.radius_km || 10);
    if (d > limit) {
      return res.status(422).json({
        error: `集荷場所がルート範囲外です（中心から約${d.toFixed(1)}km / 上限${limit}km）`,
      });
    }
  }
  const { data, error } = await supabase.from('pickup_requests').insert({
    route_id: routeId,
    requester_member_id: req.member.id,
    pickup_address: b.pickup_address || null,
    pickup_lat: Number(b.pickup_lat),
    pickup_lng: Number(b.pickup_lng),
    cargo_description: b.cargo_description || null,
    ready_time: b.ready_time || null,
    quantity: b.quantity != null && b.quantity !== '' ? Number(b.quantity) : null,
    weight_kg: b.weight_kg != null && b.weight_kg !== '' ? Number(b.weight_kg) : null,
    refrigerated: !!b.refrigerated,
    delivery_member_id: b.delivery_member_id || null,
    delivery_address: b.delivery_address || null,
    delivery_lat: b.delivery_lat != null ? Number(b.delivery_lat) : null,
    delivery_lng: b.delivery_lng != null ? Number(b.delivery_lng) : null,
    note: b.note || null,
  }).select().single();
  if (error) throw error;
  res.json({ ok: true, id: data.id });
}));

// 予定に紐づく依頼一覧（作成者 or 管理者）
app.get('/api/schedules/:id/requests', requireActor, wrap(async (req, res) => {
  const routeId = +req.params.id;
  const { data: route } = await supabase.from('routes').select('created_by_member_id').eq('id', routeId).single();
  if (!route) return res.status(404).json({ error: 'not found' });
  if (req.actor.kind === 'member' && route.created_by_member_id !== req.actor.member.id) {
    return res.status(403).json({ error: '作成者のみ閲覧できます' });
  }
  const { data, error } = await supabase
    .from('pickup_requests')
    .select('*, requester:requester_member_id(name), delivery:delivery_member_id(name)')
    .eq('route_id', routeId)
    .order('created_at', { ascending: true });
  if (error) throw error;
  res.json((data || []).map(r => ({
    ...r,
    requester_name: r.requester?.name || null,
    delivery_name: r.delivery?.name || null,
  })));
}));

// 自分の依頼一覧（依頼者マイページ用）
app.get('/api/my/requests', requireMember, wrap(async (req, res) => {
  const { data, error } = await supabase
    .from('pickup_requests').select('*, routes:route_id(name,scheduled_date,status)')
    .eq('requester_member_id', req.member.id)
    .order('created_at', { ascending: false });
  if (error) throw error;
  res.json((data || []).map(r => ({
    ...r,
    route_name: r.routes?.name || null,
    route_date: r.routes?.scheduled_date || null,
  })));
}));

// 依頼を承認 → route_stops に集荷/配達地点を追加。作成者 or 管理者。
app.post('/api/requests/:id/approve', requireActor, wrap(async (req, res) => {
  const reqId = +req.params.id;
  const { data: pr } = await supabase.from('pickup_requests').select('*').eq('id', reqId).single();
  if (!pr) return res.status(404).json({ error: 'not found' });
  if (pr.status !== 'pending') return res.status(409).json({ error: '既に処理済みの依頼です' });

  const { data: route } = await supabase.from('routes').select('created_by_member_id').eq('id', pr.route_id).single();
  if (req.actor.kind === 'member' && route?.created_by_member_id !== req.actor.member.id) {
    return res.status(403).json({ error: '作成者のみ承認できます' });
  }

  // 現在の最大 stop_order を取得して末尾に追加
  const { data: existing } = await supabase
    .from('route_stops').select('stop_order').eq('route_id', pr.route_id)
    .order('stop_order', { ascending: false }).limit(1);
  let order = existing && existing.length ? existing[0].stop_order : 0;

  const rows = [{
    route_id: pr.route_id, stop_order: ++order, stop_type: 'pickup',
    member_id: pr.requester_member_id || null,
    address: pr.pickup_address || '（集荷場所）',
    lat: pr.pickup_lat, lng: pr.pickup_lng,
    cargo_description: pr.cargo_description || null,
    weight_kg: pr.weight_kg || null,
    refrigerated: !!pr.refrigerated,
    scheduled_time: pr.ready_time || null,
  }];
  // 配達先の座標があれば配達地点も追加
  if (pr.delivery_lat != null && pr.delivery_lng != null) {
    rows.push({
      route_id: pr.route_id, stop_order: ++order, stop_type: 'delivery',
      member_id: pr.delivery_member_id || null,
      address: pr.delivery_address || '（配達先）',
      lat: pr.delivery_lat, lng: pr.delivery_lng,
      cargo_description: pr.cargo_description || null,
      weight_kg: pr.weight_kg || null,
      refrigerated: !!pr.refrigerated,
      scheduled_time: null,
    });
  }
  const { error: e2 } = await supabase.from('route_stops').insert(rows);
  if (e2) throw e2;

  const { error: e3 } = await supabase.from('pickup_requests')
    .update({ status: 'approved', decided_at: new Date().toISOString() }).eq('id', reqId);
  if (e3) throw e3;
  res.json({ ok: true });
}));

// 依頼を却下
app.post('/api/requests/:id/reject', requireActor, wrap(async (req, res) => {
  const reqId = +req.params.id;
  const { data: pr } = await supabase.from('pickup_requests').select('route_id,status').eq('id', reqId).single();
  if (!pr) return res.status(404).json({ error: 'not found' });
  if (pr.status !== 'pending') return res.status(409).json({ error: '既に処理済みの依頼です' });
  const { data: route } = await supabase.from('routes').select('created_by_member_id').eq('id', pr.route_id).single();
  if (req.actor.kind === 'member' && route?.created_by_member_id !== req.actor.member.id) {
    return res.status(403).json({ error: '作成者のみ却下できます' });
  }
  const { error } = await supabase.from('pickup_requests')
    .update({ status: 'rejected', decided_at: new Date().toISOString() }).eq('id', reqId);
  if (error) throw error;
  res.json({ ok: true });
}));

// ===== 集計 =====
app.get('/api/stats', requireViewer, wrap(async (req, res) => {
  const today = new Date().toISOString().slice(0, 10);
  const counts = await Promise.all([
    supabase.from('routes').select('id', { count: 'exact', head: true }).eq('scheduled_date', today),
    supabase.from('routes').select('id', { count: 'exact', head: true }).eq('scheduled_date', today).in('status', ['planned','in_progress']),
    supabase.from('routes').select('id', { count: 'exact', head: true }).eq('scheduled_date', today).eq('status', 'completed'),
    supabase.from('members').select('id', { count: 'exact', head: true }),
    supabase.from('drivers').select('id', { count: 'exact', head: true }).eq('active', true),
    supabase.from('vehicles').select('id', { count: 'exact', head: true }).eq('active', true),
  ]);
  res.json({
    today_routes:    counts[0].count || 0,
    today_active:    counts[1].count || 0,
    today_completed: counts[2].count || 0,
    total_members:   counts[3].count || 0,
    total_drivers:   counts[4].count || 0,
    total_vehicles:  counts[5].count || 0,
  });
}));

app.listen(PORT, () => {
  console.log(`🚚 API起動: ポート ${PORT}`);
});
