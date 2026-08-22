# データ移行手順 — 旧プロジェクト → 新プロジェクト (同一 Supabase 内)

旧プロジェクトのDBにアクセスできなくなったため、取得済みバックアップを
**同じ Supabase アカウント上に新規作成したプロジェクト**へ復元する手順。

---

## 0. 事前準備

- Supabase ダッシュボードで **新しいプロジェクトを作成**（リージョンは旧と同じが無難）。
- 新プロジェクトの接続情報を控える:
  - ダッシュボード → Project Settings → Database → **Connection string**
  - 例: `postgresql://postgres.<ref>:<password>@aws-0-<region>.pooler.supabase.com:5432/postgres`
- 手元に `psql` / `pg_restore`（PostgreSQL クライアント）が必要。
  - macOS: `brew install libpq` → `brew link --force libpq`

バックアップの形式を確認する:
- **プレーンSQL** (`*.sql`, テキスト) → `psql` で流し込む（手順A）
- **カスタム/ダンプ形式** (`*.dump`, バイナリ) → `pg_restore` を使う（手順B）
- **テーブル単位のCSV** → まず schema.sql を適用してから `\copy`（手順C）

---

## 手順A: プレーンSQL バックアップ (`*.sql`)

Supabase の論理バックアップ（pg_dump のプレーン出力）はこれが多い。

```bash
# 新プロジェクトの接続文字列を環境変数に
export NEW_DB='postgresql://postgres.<ref>:<password>@aws-0-<region>.pooler.supabase.com:5432/postgres'

# バックアップをそのまま流し込む
psql "$NEW_DB" -v ON_ERROR_STOP=1 -f backup.sql
```

> `storage.buckets` などへの INSERT がバックアップに含まれ重複エラーになる場合は、
> `-v ON_ERROR_STOP=1` を外すか、該当行を除いて実行する。

---

## 手順B: カスタム/ダンプ形式 (`*.dump`)

```bash
export NEW_DB='postgresql://postgres.<ref>:<password>@.../postgres'

pg_restore --no-owner --no-privileges \
  --dbname "$NEW_DB" \
  backup.dump
```

- `--no-owner --no-privileges`: 旧プロジェクトのロール/権限を引きずらないため必須。
- スキーマだけ／データだけを分けたい場合は `--schema-only` / `--data-only`。

---

## 手順C: スキーマは本リポジトリ + データはCSV

バックアップがCSVのみ、またはスキーマを綺麗に作り直したい場合。

```bash
export NEW_DB='postgresql://postgres.<ref>:<password>@.../postgres'

# 1) スキーマを適用（本リポジトリの定義が正）
psql "$NEW_DB" -v ON_ERROR_STOP=1 -f db/schema.sql

# 2) データを親→子の順（FK順）で投入
#    members → vehicles → drivers → routes → route_stops → vehicle_positions
psql "$NEW_DB" -c "\copy members            FROM 'members.csv'            CSV HEADER"
psql "$NEW_DB" -c "\copy vehicles           FROM 'vehicles.csv'           CSV HEADER"
psql "$NEW_DB" -c "\copy drivers            FROM 'drivers.csv'            CSV HEADER"
psql "$NEW_DB" -c "\copy routes             FROM 'routes.csv'             CSV HEADER"
psql "$NEW_DB" -c "\copy route_stops        FROM 'route_stops.csv'        CSV HEADER"
psql "$NEW_DB" -c "\copy vehicle_positions  FROM 'vehicle_positions.csv'  CSV HEADER"
```

CSV に id 列を含めて投入した場合、シーケンスがずれるので必ずリセットする（後述）。

---

## 移行後の必須チェック

### 1) シーケンス（連番）を最大IDに合わせる
CSV等でidを明示投入したときは、次の登録で衝突しないよう更新する。

```sql
SELECT setval('members_id_seq',           COALESCE((SELECT MAX(id) FROM members),0)+1,           false);
SELECT setval('vehicles_id_seq',          COALESCE((SELECT MAX(id) FROM vehicles),0)+1,          false);
SELECT setval('drivers_id_seq',           COALESCE((SELECT MAX(id) FROM drivers),0)+1,           false);
SELECT setval('routes_id_seq',            COALESCE((SELECT MAX(id) FROM routes),0)+1,            false);
SELECT setval('route_stops_id_seq',       COALESCE((SELECT MAX(id) FROM route_stops),0)+1,       false);
SELECT setval('vehicle_positions_id_seq', COALESCE((SELECT MAX(id) FROM vehicle_positions),0)+1, false);
```

### 2) ビューが security_invoker になっているか確認
（schema.sql は対応済み。ダンプ復元時は旧定義が入る可能性があるため再適用）

```sql
ALTER VIEW vehicle_latest_positions SET (security_invoker = true);
-- daily_kpi など他のビューがあれば同様に
-- ALTER VIEW daily_kpi SET (security_invoker = true);
```

### 3) RLS ポリシー / Storage バケットの確認
- `delivery-photos` バケットが public で存在するか（schema.sql の INSERT 参照）。
- ダンプに Storage のオブジェクト実体（画像）は含まれない。写真ファイルは
  旧 Storage から別途ダウンロード → 新 Storage へ再アップロードが必要。
  `route_stops.photo_url` は旧プロジェクトのURLを指したままなので、
  新URLに置換する（下記）。

```sql
-- 例: ホスト部分を新プロジェクトの参照に置換
UPDATE route_stops
SET photo_url = REPLACE(photo_url, '<旧ref>.supabase.co', '<新ref>.supabase.co')
WHERE photo_url IS NOT NULL;
```

### 4) 件数の突合
移行前後で行数を比較して抜け漏れを確認。

```sql
SELECT 'members' t, count(*) FROM members
UNION ALL SELECT 'vehicles', count(*) FROM vehicles
UNION ALL SELECT 'drivers', count(*) FROM drivers
UNION ALL SELECT 'routes', count(*) FROM routes
UNION ALL SELECT 'route_stops', count(*) FROM route_stops
UNION ALL SELECT 'vehicle_positions', count(*) FROM vehicle_positions;
```

---

## アプリ側の切り替え

移行が完了したら、アプリの環境変数を新プロジェクトの値へ更新する。
本プロジェクトで Supabase に接続するのは **API サーバー (`api/server.js`)** のみ。
（フロントは `NEXT_PUBLIC_API_BASE` 経由で API を叩く構成なので Supabase キーは持たない）

- `SUPABASE_URL`（`https://<新ref>.supabase.co`）
- `SUPABASE_SERVICE_ROLE_KEY`（新プロジェクトの service_role キー）

Render 等 API のホスティング側でこの2つを差し替えて再デプロイすれば切り替え完了。
フロント（Vercel）の環境変数は API の URL が変わらない限り変更不要。
