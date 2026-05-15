# デプロイ手順 (詳細版)

4つのサービスを連携させます。順序は **Google Cloud → Supabase → Render → Vercel**。

## 前提

- GitHubアカウント
- Google Cloud / Supabase / Render / Vercel の各アカウント
- Node.js 18以上（ローカル動作確認用・任意）

---

## STEP 1: Google Cloud で Maps API キーを取得

1. https://console.cloud.google.com/ でプロジェクトを作成（または既存を選択）
2. 左メニュー → **APIとサービス** → **ライブラリ**
3. 以下の2つを検索して **有効にする**:
   - **Maps JavaScript API**
   - **Directions API**（経路線の描画に使用）
4. 左メニュー → **APIとサービス** → **認証情報** → **認証情報を作成** → **APIキー**
5. 発行されたキーをメモ
6. （推奨）キーをクリックして制限を設定:
   - **アプリケーションの制限**: 「ウェブサイト」を選び、Vercel の本番URL（`https://your-app.vercel.app/*`）とローカル（`http://localhost:3000/*`）を許可
   - **API の制限**: 「キーを制限」で Maps JavaScript API と Directions API のみ許可

> ⚠️ Google Maps は従量課金です。無料枠（月 $200 相当）を超えると課金されます。本システムの利用規模なら通常は無料枠内ですが、Google Cloud で予算アラートを設定しておくと安心です。

---

## STEP 2: Supabase

### プロジェクト作成

1. https://supabase.com/dashboard でログイン → **New project**
2. 設定:
   - **Project name**: `coop-delivery`（任意）
   - **Database Password**: 強固なパスワード（メモ）
   - **Region**: `Northeast Asia (Tokyo)`
3. 作成完了まで2〜3分待つ

### スキーマ投入

1. 左メニュー → **SQL Editor** → **New query**
2. `db/schema.sql` の中身を貼り付け → **Run**
   - `members` `vehicles` `drivers` `routes` `route_stops` `vehicle_positions` テーブル、
     `vehicle_latest_positions` ビュー、`delivery-photos` Storage バケットが作成されます
3. もう一度 **New query** で `db/seed.sql` を貼り付け → **Run**（サンプルデータ投入）

### Storage バケットの確認

1. 左メニュー → **Storage**
2. `delivery-photos` バケットが存在し、**Public** になっていることを確認
   - もし無ければ手動で作成（Public バケットとして）

### キーをメモ

1. 左メニュー → **Project Settings**（歯車）→ **API**
2. 以下を控える:
   - **Project URL**: `https://xxxxx.supabase.co`
   - **service_role Key**: 「Reveal」で表示される長い文字列
     - ⚠️ **絶対に公開しない**（GitHubにpushしない・フロントに置かない）

---

## STEP 3: Render に API をデプロイ

### コードをGitHubにpush

`api/` の中身（`server.js`, `package.json`, `render.yaml`, `.env.example`）をGitHubリポジトリにpush。
モノレポ構成（`coop-delivery-cloud/` 全体）でも可。その場合は後で Root Directory を `api` に指定。

### Web Service 作成

1. https://dashboard.render.com/ → **New +** → **Web Service**
2. リポジトリを接続
3. 設定:
   - **Name**: `coop-delivery-api`
   - **Region**: `Singapore`
   - **Branch**: `main`
   - **Root Directory**: `api`（モノレポの場合。単独リポなら空欄）
   - **Runtime**: `Node`
   - **Build Command**: `npm install`
   - **Start Command**: `npm start`
   - **Instance Type**: `Free`

### 環境変数

**Environment Variables** に追加:

| Key | Value |
|-----|-------|
| `SUPABASE_URL` | (STEP 2の Project URL) |
| `SUPABASE_SERVICE_ROLE_KEY` | (STEP 2の service_role Key) |
| `CORS_ORIGIN` | `*`（後でVercelのURLに絞る） |
| `VIEWER_PASSWORD` | 組合員に配るパスワード（例 `coop2024`） |
| `ADMIN_PASSWORD` | 管理者用パスワード（例 `admin-secret-2024`） |
| `NODE_VERSION` | `20` |

### デプロイ・確認

1. **Create Web Service** → 初回ビルド2〜3分
2. 発行されたURL（例 `https://coop-delivery-api.onrender.com`）に `/api/health` を付けてアクセス
3. `{"ok":true,...}` が返れば成功。このURLをメモ

---

## STEP 4: Vercel に Web をデプロイ

### コードをGitHubにpush

`web/` の中身をリポジトリにpush（モノレポなら同じリポジトリでOK）。

### プロジェクト作成

1. https://vercel.com/dashboard → **Add New** → **Project**
2. リポジトリを選択
3. 設定:
   - **Framework Preset**: `Next.js`（自動検出）
   - **Root Directory**: `web`（モノレポの場合。単独リポなら空欄）

### 環境変数

**Environment Variables** に追加（Production / Preview / Development すべてにチェック）:

| Key | Value |
|-----|-------|
| `NEXT_PUBLIC_API_BASE` | (STEP 3の Render URL) |
| `NEXT_PUBLIC_GOOGLE_MAPS_KEY` | (STEP 1の Google Maps APIキー) |

> ⚠️ `NEXT_PUBLIC_` プレフィックスは必須。これがないとブラウザ側に値が渡りません。

### デプロイ・確認

1. **Deploy** → 初回ビルド1〜2分
2. 発行されたURL（例 `https://your-app.vercel.app`）にアクセス
3. トップ画面が表示されたら:
   - `/map` を開く → 組合員パスワード（`VIEWER_PASSWORD`）でログイン → 本日の日付でデモルートが地図表示されれば成功
   - `/admin` → 管理者パスワード（`ADMIN_PASSWORD`）でログイン → ダッシュボードに数字が出れば成功
   - `/driver` → デモPIN `1234`（山田 健太）でログイン → 本日の担当ルートが出れば成功 🎉

---

## STEP 5: CORS を絞る（推奨）

1. Render ダッシュボードで API サービス → **Environment**
2. `CORS_ORIGIN` を Vercel の本番URL（`https://your-app.vercel.app`）に変更
3. Save → 自動再デプロイ

複数オリジン許可は `,` 区切り:
```
https://your-app.vercel.app,https://your-custom-domain.jp
```

---

## STEP 6: Google Maps キーの制限を本番URLに更新

STEP 1 で仮設定した「ウェブサイトの制限」を、確定した Vercel 本番URLに更新します。
カスタムドメインを使う場合はそのドメインも追加してください。

---

## デモ用ログイン情報（seed.sql 投入時）

| 画面 | ログイン情報 |
|------|------------|
| `/map`（組合員） | `VIEWER_PASSWORD` に設定した値 |
| `/admin`（管理） | `ADMIN_PASSWORD` に設定した値 |
| `/driver`（ドライバー） | PIN `1234`（山田 健太）/ `2345`（鈴木 大介）/ `3456`（佐藤 隆） |

本番運用前に `drivers` テーブルの `pin_code` を必ず変更してください。

---

## トラブルシューティング

### 地図が表示されず「読み込みに失敗」と出る
- `NEXT_PUBLIC_GOOGLE_MAPS_KEY` が未設定、または間違い
- Google Cloud で Maps JavaScript API が有効化されていない
- APIキーのウェブサイト制限が厳しすぎて Vercel のURLが弾かれている
- ブラウザのコンソールで具体的なエラー（`ApiNotActivatedMapError` 等）を確認

### 経路線が出ない（マーカーは出る）
- Directions API が有効化されていない → STEP 1 で有効化
- 有効化しても出ない場合、`RouteMap` は自動で直線表示にフォールバックします

### `/map` で「認証エラー」
- Render の `VIEWER_PASSWORD` とログインで入れたパスワードが不一致
- ブラウザの localStorage をクリアして再ログイン

### ドライバー画面で「本日あなた担当のルートはありません」
- `routes.driver_id` がそのドライバーのIDになっているか確認
- `routes.scheduled_date` が今日の日付か確認（seed.sql は実行日を今日として投入）

### 写真アップロードが失敗する
- Supabase の `delivery-photos` バケットが存在し Public か確認
- `schema.sql` の Storage ポリシー部分が実行されているか確認

### Render がスリープして遅い（Free Plan）
- 15分アクセスがないとスリープ。UptimeRobot 等で5分おきに `/api/health` を叩くか、Starter プラン（$7/月）へ
