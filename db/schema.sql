-- ============================================================
-- 組合員間共同配送 — Supabaseスキーマ (地図中心版)
-- 実行: Supabase ダッシュボード → SQL Editor で順に貼り付けて Run
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

-- ===== 車両 =====
CREATE TABLE IF NOT EXISTS vehicles (
  id BIGSERIAL PRIMARY KEY,
  code TEXT UNIQUE NOT NULL,
  name TEXT NOT NULL,
  plate_number TEXT,
  vehicle_type TEXT,
  capacity_kg INTEGER DEFAULT 1000,
  refrigerated BOOLEAN DEFAULT FALSE,
  active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ===== ドライバー =====
CREATE TABLE IF NOT EXISTS drivers (
  id BIGSERIAL PRIMARY KEY,
  member_id BIGINT REFERENCES members(id),
  name TEXT NOT NULL,
  phone TEXT,
  pin_code TEXT,             -- ドライバー画面ログイン用 (4桁数字想定)
  active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ===== ルート =====
-- 1日分の配送計画。複数の経由地(stops)を含む
CREATE TABLE IF NOT EXISTS routes (
  id BIGSERIAL PRIMARY KEY,
  route_code TEXT UNIQUE NOT NULL,
  name TEXT NOT NULL,                      -- "午前便A" など
  scheduled_date DATE,                     -- 下書き(draft)は日付なしを許可
  driver_id BIGINT REFERENCES drivers(id),
  vehicle_id BIGINT REFERENCES vehicles(id),
  start_time TIMESTAMPTZ,                  -- 実際の開始時刻
  end_time TIMESTAMPTZ,                    -- 実際の終了時刻
  planned_start_time TIME,                 -- 計画開始時刻
  status TEXT NOT NULL DEFAULT 'planned'
    CHECK (status IN ('draft','recruiting','planned','in_progress','completed','cancelled')),
  pickup_deadline TIMESTAMPTZ,             -- 集荷募集の締切(前日18時)
  radius_km NUMERIC DEFAULT 10,            -- 集荷受付の半径(重心から)
  created_by_member_id BIGINT REFERENCES members(id), -- 予定作成者(組合員)
  capacity_kg NUMERIC,                     -- トラック最大積載量
  initial_load_kg NUMERIC DEFAULT 0,       -- 出発時の自社積載
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_routes_date ON routes(scheduled_date);

-- ===== 経由地 (Route Stop) =====
CREATE TABLE IF NOT EXISTS route_stops (
  id BIGSERIAL PRIMARY KEY,
  route_id BIGINT NOT NULL REFERENCES routes(id) ON DELETE CASCADE,
  stop_order INTEGER NOT NULL,
  stop_type TEXT NOT NULL CHECK (stop_type IN ('pickup','delivery')),
  member_id BIGINT REFERENCES members(id),
  address TEXT NOT NULL,
  lat DOUBLE PRECISION NOT NULL,
  lng DOUBLE PRECISION NOT NULL,
  cargo_description TEXT,
  weight_kg NUMERIC(10,2),
  refrigerated BOOLEAN DEFAULT FALSE,
  scheduled_time TIME,
  arrived_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  completed BOOLEAN DEFAULT FALSE,
  notes TEXT,
  photo_url TEXT,                         -- Supabase Storage の公開URL
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_stops_route ON route_stops(route_id);

-- ===== 組合員ログイン (機能3) =====
ALTER TABLE members
  ADD COLUMN IF NOT EXISTS login_id      TEXT,
  ADD COLUMN IF NOT EXISTS password_hash TEXT;
CREATE UNIQUE INDEX IF NOT EXISTS idx_members_login_id
  ON members (login_id) WHERE login_id IS NOT NULL;

-- ===== 集荷依頼 (機能1) =====
CREATE TABLE IF NOT EXISTS pickup_requests (
  id BIGSERIAL PRIMARY KEY,
  route_id BIGINT NOT NULL REFERENCES routes(id) ON DELETE CASCADE,
  requester_member_id BIGINT REFERENCES members(id),
  pickup_address TEXT,
  pickup_lat DOUBLE PRECISION,
  pickup_lng DOUBLE PRECISION,
  cargo_description TEXT,
  ready_time TIME,
  quantity NUMERIC,
  weight_kg NUMERIC(10,2),
  refrigerated BOOLEAN DEFAULT FALSE,
  delivery_member_id BIGINT REFERENCES members(id),
  delivery_address TEXT,
  delivery_lat DOUBLE PRECISION,
  delivery_lng DOUBLE PRECISION,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','approved','rejected')),
  note TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  decided_at TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS idx_pickup_requests_route ON pickup_requests(route_id);

-- ===== 課金 (フェーズA) =====
CREATE TABLE IF NOT EXISTS pricing_rules (
  id BIGSERIAL PRIMARY KEY,
  name TEXT NOT NULL DEFAULT '標準',
  active BOOLEAN NOT NULL DEFAULT TRUE,
  base_fee INTEGER NOT NULL DEFAULT 0,
  per_stop_fee INTEGER NOT NULL DEFAULT 0,
  per_km_fee NUMERIC NOT NULL DEFAULT 0,
  per_kg_fee NUMERIC NOT NULL DEFAULT 0,
  refrigerated_mode TEXT NOT NULL DEFAULT 'none' CHECK (refrigerated_mode IN ('none','rate','flat')),
  refrigerated_value NUMERIC NOT NULL DEFAULT 0,
  min_fee INTEGER NOT NULL DEFAULT 0,
  rounding TEXT NOT NULL DEFAULT 'ceil' CHECK (rounding IN ('ceil','round','floor')),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);
INSERT INTO pricing_rules (name, active, per_stop_fee, rounding)
SELECT '標準', true, 300, 'ceil'
WHERE NOT EXISTS (SELECT 1 FROM pricing_rules);

ALTER TABLE pickup_requests
  ADD COLUMN IF NOT EXISTS distance_km     NUMERIC,
  ADD COLUMN IF NOT EXISTS stop_count      INTEGER,
  ADD COLUMN IF NOT EXISTS estimated_fee   INTEGER,
  ADD COLUMN IF NOT EXISTS final_fee       INTEGER,
  ADD COLUMN IF NOT EXISTS fee_breakdown   JSONB,
  ADD COLUMN IF NOT EXISTS pricing_rule_id BIGINT REFERENCES pricing_rules(id);

-- ===== 車両位置ログ =====
-- ドライバー画面が30秒ごとに送信する位置情報
CREATE TABLE IF NOT EXISTS vehicle_positions (
  id BIGSERIAL PRIMARY KEY,
  route_id BIGINT REFERENCES routes(id) ON DELETE CASCADE,
  vehicle_id BIGINT REFERENCES vehicles(id),
  driver_id BIGINT REFERENCES drivers(id),
  lat DOUBLE PRECISION NOT NULL,
  lng DOUBLE PRECISION NOT NULL,
  heading DOUBLE PRECISION,               -- 進行方向 0-359 (任意)
  speed_kmh DOUBLE PRECISION,             -- 速度 (任意)
  recorded_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_positions_route ON vehicle_positions(route_id, recorded_at DESC);

-- 最新位置だけを高速取得するビュー
-- security_invoker=true: クエリ実行ユーザーのRLSポリシーを適用させる
CREATE OR REPLACE VIEW vehicle_latest_positions
  WITH (security_invoker = true)
AS
SELECT DISTINCT ON (route_id)
  route_id, vehicle_id, driver_id, lat, lng, heading, speed_kmh, recorded_at
FROM vehicle_positions
ORDER BY route_id, recorded_at DESC;

-- ===== Storage バケット =====
-- 完了写真用バケットを作成 (公開設定)
INSERT INTO storage.buckets (id, name, public)
  VALUES ('delivery-photos', 'delivery-photos', true)
ON CONFLICT (id) DO NOTHING;

-- バケットへのアップロードポリシー (service_role なら全許可)
DO $$ BEGIN
  CREATE POLICY "service_role can manage delivery-photos" ON storage.objects
    FOR ALL TO service_role USING (true) WITH CHECK (true);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- 公開バケットなので誰でも読める (バケット作成時に public=true 済み)

-- ============================================================
-- Row Level Security
-- ============================================================
ALTER TABLE members            ENABLE ROW LEVEL SECURITY;
ALTER TABLE vehicles           ENABLE ROW LEVEL SECURITY;
ALTER TABLE drivers            ENABLE ROW LEVEL SECURITY;
ALTER TABLE routes             ENABLE ROW LEVEL SECURITY;
ALTER TABLE route_stops        ENABLE ROW LEVEL SECURITY;
ALTER TABLE vehicle_positions  ENABLE ROW LEVEL SECURITY;
ALTER TABLE pickup_requests    ENABLE ROW LEVEL SECURITY;
ALTER TABLE pricing_rules      ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN CREATE POLICY "service_role full" ON pricing_rules     FOR ALL TO service_role USING (true) WITH CHECK (true); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE POLICY "service_role full" ON pickup_requests   FOR ALL TO service_role USING (true) WITH CHECK (true); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE POLICY "service_role full" ON members           FOR ALL TO service_role USING (true) WITH CHECK (true); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE POLICY "service_role full" ON vehicles          FOR ALL TO service_role USING (true) WITH CHECK (true); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE POLICY "service_role full" ON drivers           FOR ALL TO service_role USING (true) WITH CHECK (true); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE POLICY "service_role full" ON routes            FOR ALL TO service_role USING (true) WITH CHECK (true); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE POLICY "service_role full" ON route_stops       FOR ALL TO service_role USING (true) WITH CHECK (true); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE POLICY "service_role full" ON vehicle_positions FOR ALL TO service_role USING (true) WITH CHECK (true); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
