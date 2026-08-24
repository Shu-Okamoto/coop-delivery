-- ============================================================
-- 経由地ごとの自社荷下ろし量: route_stops に own_unload_kg を追加
-- 新プロジェクトの SQL Editor で実行してください。
-- ============================================================

ALTER TABLE public.route_stops
  ADD COLUMN IF NOT EXISTS own_unload_kg NUMERIC DEFAULT 0;  -- その地点で下ろす自社の荷(kg)
