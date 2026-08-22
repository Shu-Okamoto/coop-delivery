-- ============================================================
-- 機能1: ルート下書き → 予定化（集荷募集）→ 集荷依頼 → 承認
-- 新プロジェクトの SQL Editor で実行してください。
-- ============================================================

-- ===== routes: 下書き・募集に対応 =====
-- 下書きは日付なしを許可
ALTER TABLE public.routes ALTER COLUMN scheduled_date DROP NOT NULL;

-- ステータスに draft（下書き）/ recruiting（集荷募集中）を追加
ALTER TABLE public.routes DROP CONSTRAINT IF EXISTS routes_status_check;
ALTER TABLE public.routes ADD CONSTRAINT routes_status_check
  CHECK (status IN ('draft','recruiting','planned','in_progress','completed','cancelled'));

-- 追加カラム
ALTER TABLE public.routes
  ADD COLUMN IF NOT EXISTS pickup_deadline      TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS radius_km            NUMERIC DEFAULT 10,
  ADD COLUMN IF NOT EXISTS created_by_member_id BIGINT REFERENCES public.members(id);

-- ===== 集荷依頼 =====
CREATE TABLE IF NOT EXISTS public.pickup_requests (
  id BIGSERIAL PRIMARY KEY,
  route_id BIGINT NOT NULL REFERENCES public.routes(id) ON DELETE CASCADE,
  requester_member_id BIGINT REFERENCES public.members(id),
  -- 集荷場所
  pickup_address TEXT,
  pickup_lat DOUBLE PRECISION,
  pickup_lng DOUBLE PRECISION,
  -- 集荷物・準備完了時間・数量・重量
  cargo_description TEXT,
  ready_time TIME,
  quantity NUMERIC,
  weight_kg NUMERIC(10,2),
  refrigerated BOOLEAN DEFAULT FALSE,
  -- 配達先
  delivery_member_id BIGINT REFERENCES public.members(id),
  delivery_address TEXT,
  delivery_lat DOUBLE PRECISION,
  delivery_lng DOUBLE PRECISION,
  -- 状態
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','approved','rejected')),
  note TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  decided_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_pickup_requests_route ON public.pickup_requests(route_id);

-- RLS（service_role のみ全許可。API は service_role キーで接続）
ALTER TABLE public.pickup_requests ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  CREATE POLICY "service_role full" ON public.pickup_requests
    FOR ALL TO service_role USING (true) WITH CHECK (true);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
