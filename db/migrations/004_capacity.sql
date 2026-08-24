-- ============================================================
-- 積載状況: 予定(ルート)にトラックの容量と初期積載を追加
-- 新プロジェクトの SQL Editor で実行してください。
-- ============================================================

ALTER TABLE public.routes
  ADD COLUMN IF NOT EXISTS capacity_kg     NUMERIC,   -- トラックの最大積載量(kg)
  ADD COLUMN IF NOT EXISTS initial_load_kg NUMERIC DEFAULT 0;  -- 出発時点の自社積載(kg)
