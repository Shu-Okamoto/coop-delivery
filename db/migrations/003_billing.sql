-- ============================================================
-- 課金制度（フェーズA）: 料金マスタ ＋ 依頼への料金カラム
-- 新プロジェクトの SQL Editor で実行してください。
-- ============================================================

-- ===== 料金マスタ =====
CREATE TABLE IF NOT EXISTS public.pricing_rules (
  id BIGSERIAL PRIMARY KEY,
  name TEXT NOT NULL DEFAULT '標準',
  active BOOLEAN NOT NULL DEFAULT TRUE,
  base_fee INTEGER NOT NULL DEFAULT 0,          -- 基本料金(円/依頼)
  per_stop_fee INTEGER NOT NULL DEFAULT 0,      -- 立ち寄り料(円/地点)
  per_km_fee NUMERIC NOT NULL DEFAULT 0,        -- 距離単価(円/km)
  per_kg_fee NUMERIC NOT NULL DEFAULT 0,        -- 重量単価(円/kg)
  refrigerated_mode TEXT NOT NULL DEFAULT 'none' CHECK (refrigerated_mode IN ('none','rate','flat')),
  refrigerated_value NUMERIC NOT NULL DEFAULT 0,-- rate=0.2(+20%) / flat=500(+500円)
  min_fee INTEGER NOT NULL DEFAULT 0,           -- 最低料金(円)
  rounding TEXT NOT NULL DEFAULT 'ceil' CHECK (rounding IN ('ceil','round','floor')),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 既定プラン（簡易: 1か所300円）を1件だけ投入
INSERT INTO public.pricing_rules (name, active, per_stop_fee, rounding)
SELECT '標準', true, 300, 'ceil'
WHERE NOT EXISTS (SELECT 1 FROM public.pricing_rules);

ALTER TABLE public.pricing_rules ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  CREATE POLICY "service_role full" ON public.pricing_rules
    FOR ALL TO service_role USING (true) WITH CHECK (true);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ===== 集荷依頼に料金カラムを追加 =====
ALTER TABLE public.pickup_requests
  ADD COLUMN IF NOT EXISTS distance_km     NUMERIC,
  ADD COLUMN IF NOT EXISTS stop_count      INTEGER,
  ADD COLUMN IF NOT EXISTS estimated_fee   INTEGER,
  ADD COLUMN IF NOT EXISTS final_fee       INTEGER,
  ADD COLUMN IF NOT EXISTS fee_breakdown   JSONB,
  ADD COLUMN IF NOT EXISTS pricing_rule_id BIGINT REFERENCES public.pricing_rules(id);
