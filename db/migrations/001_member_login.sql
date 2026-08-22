-- ============================================================
-- 機能3: 組合員ログイン用カラムを members に追加
-- 新プロジェクトの SQL Editor で実行してください。
-- ============================================================

ALTER TABLE public.members
  ADD COLUMN IF NOT EXISTS login_id      TEXT,
  ADD COLUMN IF NOT EXISTS password_hash TEXT;

-- ログインIDは一意（NULL は複数可）
CREATE UNIQUE INDEX IF NOT EXISTS idx_members_login_id
  ON public.members (login_id)
  WHERE login_id IS NOT NULL;
