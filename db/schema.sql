-- ============================================================
-- 組合員間共同配送マッチングシステム — Supabaseスキーマ
-- 実行: Supabaseダッシュボード → SQL Editor に貼り付けて Run
-- ============================================================

-- ===== 組合員 =====
CREATE TABLE IF NOT EXISTS members (
  id BIGSERIAL PRIMARY KEY,
  code TEXT UNIQUE NOT NULL,
  name TEXT NOT NULL,
  type TEXT NOT NULL CHECK (type IN ('store','wholesaler','farmer','manufacturer')),
  address TEXT,
  lat DOUBLE PRECISION,
  lng DOUBLE PRECISION,
  contact_name TEXT,
  phone TEXT,
  email TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ===== ドライバー =====
CREATE TABLE IF NOT EXISTS drivers (
  id BIGSERIAL PRIMARY KEY,
  member_id BIGINT REFERENCES members(id),
  name TEXT NOT NULL,
  phone TEXT,
  vehicle_type TEXT,
  vehicle_capacity_kg INTEGER DEFAULT 1000,
  refrigerated BOOLEAN DEFAULT FALSE,
  active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ===== 配送ルート =====
CREATE TABLE IF NOT EXISTS routes (
  id BIGSERIAL PRIMARY KEY,
  route_code TEXT UNIQUE NOT NULL,
  driver_id BIGINT REFERENCES drivers(id),
  scheduled_date DATE NOT NULL,
  start_time TIMESTAMPTZ,
  end_time TIMESTAMPTZ,
  status TEXT NOT NULL DEFAULT 'planned'
    CHECK (status IN ('planned','in_progress','completed','cancelled')),
  total_weight_kg NUMERIC(10,2) DEFAULT 0,
  total_distance_km NUMERIC(10,2),
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ===== 配送依頼 =====
CREATE TABLE IF NOT EXISTS delivery_requests (
  id BIGSERIAL PRIMARY KEY,
  request_code TEXT UNIQUE NOT NULL,
  shipper_id BIGINT NOT NULL REFERENCES members(id),
  receiver_id BIGINT NOT NULL REFERENCES members(id),
  pickup_address TEXT NOT NULL,
  pickup_lat DOUBLE PRECISION,
  pickup_lng DOUBLE PRECISION,
  delivery_address TEXT NOT NULL,
  delivery_lat DOUBLE PRECISION,
  delivery_lng DOUBLE PRECISION,
  pickup_window_start TIMESTAMPTZ NOT NULL,
  pickup_window_end TIMESTAMPTZ NOT NULL,
  delivery_deadline TIMESTAMPTZ NOT NULL,
  weight_kg NUMERIC(10,2) NOT NULL,
  volume_m3 NUMERIC(10,2),
  refrigerated BOOLEAN DEFAULT FALSE,
  cargo_description TEXT,
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending','matched','picked_up','delivered','cancelled')),
  matched_route_id BIGINT REFERENCES routes(id),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ===== ルート上のストップ =====
CREATE TABLE IF NOT EXISTS route_stops (
  id BIGSERIAL PRIMARY KEY,
  route_id BIGINT NOT NULL REFERENCES routes(id) ON DELETE CASCADE,
  stop_order INTEGER NOT NULL,
  stop_type TEXT NOT NULL CHECK (stop_type IN ('pickup','delivery')),
  request_id BIGINT NOT NULL REFERENCES delivery_requests(id),
  member_id BIGINT NOT NULL REFERENCES members(id),
  address TEXT NOT NULL,
  lat DOUBLE PRECISION,
  lng DOUBLE PRECISION,
  scheduled_time TIMESTAMPTZ,
  actual_time TIMESTAMPTZ,
  completed BOOLEAN DEFAULT FALSE,
  notes TEXT
);

-- ===== コスト分担 =====
CREATE TABLE IF NOT EXISTS cost_shares (
  id BIGSERIAL PRIMARY KEY,
  route_id BIGINT NOT NULL REFERENCES routes(id),
  request_id BIGINT NOT NULL REFERENCES delivery_requests(id),
  shipper_id BIGINT NOT NULL REFERENCES members(id),
  weight_share NUMERIC(5,4),
  distance_share_km NUMERIC(10,2),
  amount_yen INTEGER,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ===== インデックス =====
CREATE INDEX IF NOT EXISTS idx_requests_status ON delivery_requests(status);
CREATE INDEX IF NOT EXISTS idx_requests_pickup_date ON delivery_requests(pickup_window_start);
CREATE INDEX IF NOT EXISTS idx_routes_date ON routes(scheduled_date);
CREATE INDEX IF NOT EXISTS idx_stops_route ON route_stops(route_id);

-- ============================================================
-- Row Level Security (RLS)
-- 初期は全許可。本番運用ではSupabase Authと組み合わせて制限する。
-- ============================================================
ALTER TABLE members           ENABLE ROW LEVEL SECURITY;
ALTER TABLE drivers           ENABLE ROW LEVEL SECURITY;
ALTER TABLE delivery_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE routes            ENABLE ROW LEVEL SECURITY;
ALTER TABLE route_stops       ENABLE ROW LEVEL SECURITY;
ALTER TABLE cost_shares       ENABLE ROW LEVEL SECURITY;

-- service_role（API側）は全権限
CREATE POLICY "service_role full access" ON members
  FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "service_role full access" ON drivers
  FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "service_role full access" ON delivery_requests
  FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "service_role full access" ON routes
  FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "service_role full access" ON route_stops
  FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "service_role full access" ON cost_shares
  FOR ALL TO service_role USING (true) WITH CHECK (true);
