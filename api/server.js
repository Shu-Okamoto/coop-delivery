/**
 * 組合員間共同配送 API
 * Render向け / Supabase (PostgreSQL) 接続
 */
require('dotenv').config();
const express = require('express');
const cors = require('cors');
const { createClient } = require('@supabase/supabase-js');
const matching = require('./matching');

const PORT = process.env.PORT || 10000;
const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
  console.error('❌ 環境変数 SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY が未設定です');
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

const app = express();

// CORS — VercelフロントのURLを CORS_ORIGIN に設定
const allowedOrigins = (process.env.CORS_ORIGIN || '*').split(',').map(s => s.trim());
app.use(cors({
  origin: (origin, cb) => {
    if (!origin || allowedOrigins.includes('*') || allowedOrigins.includes(origin)) {
      return cb(null, true);
    }
    cb(new Error(`CORS blocked: ${origin}`));
  },
}));
app.use(express.json());

// エラーをまとめてJSONで返すラッパー
const wrap = (fn) => (req, res) => {
  Promise.resolve(fn(req, res)).catch((e) => {
    console.error(e);
    res.status(500).json({ error: e.message });
  });
};

// ===== ヘルスチェック =====
app.get('/api/health', (req, res) => res.json({ ok: true, time: new Date().toISOString() }));

// ===== 組合員 =====
app.get('/api/members', wrap(async (req, res) => {
  const { data, error } = await supabase.from('members').select('*').order('id');
  if (error) throw error;
  res.json(data);
}));

app.post('/api/members', wrap(async (req, res) => {
  const { data, error } = await supabase.from('members').insert(req.body).select().single();
  if (error) throw error;
  res.json(data);
}));

// ===== ドライバー =====
app.get('/api/drivers', wrap(async (req, res) => {
  const { data, error } = await supabase
    .from('drivers')
    .select('*, members(name)')
    .eq('active', true)
    .order('id');
  if (error) throw error;
  // members(name) を member_name にフラット化
  res.json(data.map(d => ({ ...d, member_name: d.members?.name })));
}));

app.post('/api/drivers', wrap(async (req, res) => {
  const { data, error } = await supabase.from('drivers').insert(req.body).select().single();
  if (error) throw error;
  res.json(data);
}));

// ===== 配送依頼 =====
app.get('/api/requests', wrap(async (req, res) => {
  let q = supabase
    .from('delivery_requests')
    .select(`
      *,
      shipper:members!delivery_requests_shipper_id_fkey(name,address),
      receiver:members!delivery_requests_receiver_id_fkey(name,address)
    `)
    .order('pickup_window_start');
  if (req.query.status) q = q.eq('status', req.query.status);
  const { data, error } = await q;
  if (error) throw error;
  res.json(data.map(r => ({
    ...r,
    shipper_name: r.shipper?.name,
    shipper_address: r.shipper?.address,
    receiver_name: r.receiver?.name,
    receiver_address: r.receiver?.address,
  })));
}));

app.post('/api/requests', wrap(async (req, res) => {
  const r = req.body;
  // 集荷地・配達地は所属する組合員から自動セット
  const { data: shipper, error: e1 } = await supabase.from('members').select('*').eq('id', r.shipper_id).single();
  const { data: receiver, error: e2 } = await supabase.from('members').select('*').eq('id', r.receiver_id).single();
  if (e1 || e2 || !shipper || !receiver) {
    return res.status(400).json({ error: '組合員が見つかりません' });
  }
  const code = 'REQ-' + Date.now().toString(36).toUpperCase();
  const payload = {
    request_code: code,
    shipper_id: r.shipper_id,
    receiver_id: r.receiver_id,
    pickup_address: shipper.address,
    pickup_lat: shipper.lat,
    pickup_lng: shipper.lng,
    delivery_address: receiver.address,
    delivery_lat: receiver.lat,
    delivery_lng: receiver.lng,
    pickup_window_start: r.pickup_window_start,
    pickup_window_end: r.pickup_window_end,
    delivery_deadline: r.delivery_deadline,
    weight_kg: r.weight_kg,
    volume_m3: r.volume_m3 || null,
    refrigerated: !!r.refrigerated,
    cargo_description: r.cargo_description || null,
  };
  const { data, error } = await supabase.from('delivery_requests').insert(payload).select().single();
  if (error) throw error;
  res.json(data);
}));

// ===== マッチング提案 =====
app.post('/api/match/suggest', wrap(async (req, res) => {
  const { date, max_radius_km, capacity_kg, refrigerated } = req.body;

  // 指定日の pending 依頼を取得 (JST想定)
  const dayStart = `${date}T00:00:00+09:00`;
  const dayEnd   = `${date}T23:59:59+09:00`;

  const { data: requests, error } = await supabase
    .from('delivery_requests')
    .select('*')
    .eq('status', 'pending')
    .gte('pickup_window_start', dayStart)
    .lte('pickup_window_start', dayEnd);
  if (error) throw error;

  if (!requests || requests.length === 0) {
    return res.json({ groups: [], message: '対象日の未割当依頼がありません' });
  }

  const groups = matching.clusterRequests(requests, {
    maxRadiusKm: max_radius_km || 15,
    capacityKg: capacity_kg || 1000,
    refrigerated: !!refrigerated,
  });

  const proposals = groups.map((group, idx) => {
    const stops = matching.buildStopSequence(group);
    const distance = matching.estimateDistance(stops);
    const shares = matching.calcCostShares(group, distance);
    return {
      group_index: idx + 1,
      request_count: group.length,
      total_weight_kg: group.reduce((s, r) => s + Number(r.weight_kg), 0),
      estimated_distance_km: distance,
      stops,
      cost_shares: shares,
      request_ids: group.map((r) => r.id),
    };
  });

  res.json({ date, groups: proposals });
}));

// ===== ルート確定 =====
app.post('/api/routes', wrap(async (req, res) => {
  const { driver_id, scheduled_date, request_ids, stops, total_distance_km, cost_shares } = req.body;
  const code = 'RT-' + Date.now().toString(36).toUpperCase();

  // 重量集計
  const { data: reqRows, error: e0 } = await supabase
    .from('delivery_requests').select('id,weight_kg').in('id', request_ids);
  if (e0) throw e0;
  const totalWeight = reqRows.reduce((s, r) => s + Number(r.weight_kg), 0);

  // 1) routes
  const { data: route, error: e1 } = await supabase
    .from('routes')
    .insert({
      route_code: code,
      driver_id,
      scheduled_date,
      total_distance_km,
      total_weight_kg: totalWeight,
      status: 'planned',
    })
    .select()
    .single();
  if (e1) throw e1;

  // 2) route_stops
  const stopRows = stops.map((s, i) => ({
    route_id: route.id,
    stop_order: i + 1,
    stop_type: s.stop_type,
    request_id: s.request_id,
    member_id: s.member_id,
    address: s.address,
    lat: s.lat,
    lng: s.lng,
    scheduled_time: s.scheduled_time || null,
  }));
  const { error: e2 } = await supabase.from('route_stops').insert(stopRows);
  if (e2) throw e2;

  // 3) cost_shares
  if (cost_shares && cost_shares.length > 0) {
    const costRows = cost_shares.map((c) => ({
      route_id: route.id,
      request_id: c.request_id,
      shipper_id: c.shipper_id,
      weight_share: c.weight_share,
      amount_yen: c.amount_yen,
    }));
    const { error: e3 } = await supabase.from('cost_shares').insert(costRows);
    if (e3) throw e3;
  }

  // 4) 依頼ステータス更新
  const { error: e4 } = await supabase
    .from('delivery_requests')
    .update({ status: 'matched', matched_route_id: route.id })
    .in('id', request_ids);
  if (e4) throw e4;

  res.json({ route_id: route.id, route_code: code });
}));

app.get('/api/routes', wrap(async (req, res) => {
  let q = supabase
    .from('routes')
    .select('*, drivers(name,phone)')
    .order('scheduled_date', { ascending: false })
    .order('id', { ascending: false });
  if (req.query.date) q = q.eq('scheduled_date', req.query.date);
  const { data, error } = await q;
  if (error) throw error;
  res.json(data.map(r => ({
    ...r,
    driver_name: r.drivers?.name,
    driver_phone: r.drivers?.phone,
  })));
}));

app.get('/api/routes/:id', wrap(async (req, res) => {
  const { data: route, error: e1 } = await supabase
    .from('routes')
    .select('*, drivers(name,phone)')
    .eq('id', req.params.id)
    .single();
  if (e1 || !route) return res.status(404).json({ error: 'not found' });

  const { data: stops, error: e2 } = await supabase
    .from('route_stops')
    .select(`
      *,
      members(name),
      delivery_requests(cargo_description, weight_kg, refrigerated)
    `)
    .eq('route_id', req.params.id)
    .order('stop_order');
  if (e2) throw e2;

  const { data: costs, error: e3 } = await supabase
    .from('cost_shares')
    .select('*, members(name)')
    .eq('route_id', req.params.id);
  if (e3) throw e3;

  res.json({
    ...route,
    driver_name: route.drivers?.name,
    driver_phone: route.drivers?.phone,
    stops: stops.map(s => ({
      ...s,
      member_name: s.members?.name,
      cargo_description: s.delivery_requests?.cargo_description,
      weight_kg: s.delivery_requests?.weight_kg,
      refrigerated: s.delivery_requests?.refrigerated,
    })),
    cost_shares: costs.map(c => ({ ...c, shipper_name: c.members?.name })),
  });
}));

// ===== ストップ完了 =====
app.post('/api/stops/:id/complete', wrap(async (req, res) => {
  const stopId = +req.params.id;
  const { data: stop, error: e0 } = await supabase
    .from('route_stops').select('route_id').eq('id', stopId).single();
  if (e0 || !stop) return res.status(404).json({ error: 'stop not found' });

  const { error: e1 } = await supabase
    .from('route_stops')
    .update({ completed: true, actual_time: new Date().toISOString(), notes: req.body.notes || null })
    .eq('id', stopId);
  if (e1) throw e1;

  // 残ストップ確認
  const { count, error: e2 } = await supabase
    .from('route_stops')
    .select('id', { count: 'exact', head: true })
    .eq('route_id', stop.route_id)
    .eq('completed', false);
  if (e2) throw e2;

  if (count === 0) {
    // 全完了
    await supabase
      .from('routes')
      .update({ status: 'completed', end_time: new Date().toISOString() })
      .eq('id', stop.route_id);
    await supabase
      .from('delivery_requests')
      .update({ status: 'delivered' })
      .eq('matched_route_id', stop.route_id);
  } else {
    await supabase
      .from('routes')
      .update({ status: 'in_progress' })
      .eq('id', stop.route_id)
      .eq('status', 'planned');
  }
  res.json({ ok: true });
}));

// ===== ダッシュボード集計 =====
app.get('/api/stats', wrap(async (req, res) => {
  const today = new Date().toISOString().slice(0, 10);

  const counts = await Promise.all([
    supabase.from('delivery_requests').select('id', { count: 'exact', head: true }).eq('status', 'pending'),
    supabase.from('routes').select('id', { count: 'exact', head: true }).in('status', ['planned','in_progress']),
    supabase.from('routes').select('id', { count: 'exact', head: true }).eq('status', 'completed').eq('scheduled_date', today),
    supabase.from('members').select('id', { count: 'exact', head: true }),
    supabase.from('drivers').select('id', { count: 'exact', head: true }).eq('active', true),
  ]);

  res.json({
    pending_requests: counts[0].count || 0,
    active_routes:    counts[1].count || 0,
    completed_today:  counts[2].count || 0,
    total_members:    counts[3].count || 0,
    total_drivers:    counts[4].count || 0,
  });
}));

app.listen(PORT, () => {
  console.log(`🚚 API起動: ポート ${PORT}`);
  console.log(`   ヘルスチェック: /api/health`);
});
