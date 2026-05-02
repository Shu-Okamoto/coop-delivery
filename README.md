# 組合員間 共同配送マッチングシステム (Cloud版)

**Vercel + Render + Supabase** の3層構成で動かすクラウド版です。社内サーバー不要で、無料枠の範囲内で立ち上げられます。

## アーキテクチャ

```
[ブラウザ]
   ↓
[Vercel] Next.js (App Router)         ← フロントエンド
   ↓ fetch (HTTPS)
[Render] Express API                   ← バックエンド (マッチングロジック含む)
   ↓ Supabase JS Client (Service Role Key)
[Supabase] PostgreSQL                  ← データベース
```

| 層 | サービス | プラン | 役割 |
|----|----------|--------|------|
| フロント | Vercel | Hobby (無料) | Next.js 14 (App Router) |
| API | Render | Free Web Service | Express + マッチングエンジン |
| DB | Supabase | Free | PostgreSQL + RLS |

## ディレクトリ構成

```
coop-delivery-cloud/
├── api/                    # Render にデプロイする Express API
│   ├── server.js
│   ├── matching.js
│   ├── package.json
│   ├── render.yaml
│   └── .env.example
├── web/                    # Vercel にデプロイする Next.js アプリ
│   ├── app/
│   │   ├── page.tsx                # トップ
│   │   ├── admin/                  # 管理画面
│   │   │   ├── layout.tsx
│   │   │   ├── page.tsx            # ダッシュボード
│   │   │   ├── requests/page.tsx
│   │   │   ├── match/page.tsx
│   │   │   ├── routes/page.tsx
│   │   │   └── members/page.tsx
│   │   ├── driver/page.tsx         # ドライバー画面
│   │   ├── globals.css
│   │   └── layout.tsx
│   ├── lib/api.ts
│   ├── package.json
│   ├── tsconfig.json
│   └── .env.example
├── db/
│   ├── schema.sql          # Supabase に流すスキーマ
│   └── seed.sql            # サンプルデータ
└── docs/
    ├── DEPLOY.md           # 詳細なデプロイ手順
    └── DESIGN.md           # 設計ドキュメント
```

## セットアップ (3つだけ)

### 1. Supabase でプロジェクト作成

1. https://supabase.com/ にサインインし新規プロジェクト作成（リージョンは Tokyo 推奨）
2. 左メニュー → **SQL Editor** を開く
3. `db/schema.sql` の内容を貼り付け → Run
4. `db/seed.sql` の内容を貼り付け → Run（サンプルデータ投入）
5. 左メニュー → **Project Settings → API** から以下をメモ:
   - `Project URL` (例: `https://xxx.supabase.co`)
   - `service_role` Key（秘密鍵 — フロントエンドには絶対に置かない）

### 2. Render に API をデプロイ

1. https://render.com/ にサインインし、GitHubに `api/` の中身をプッシュ
2. **New → Web Service** で当該リポジトリを選択
3. 以下を設定:
   - Root Directory: `api`
   - Build Command: `npm install`
   - Start Command: `npm start`
   - Plan: Free
4. **Environment** に環境変数を追加:
   - `SUPABASE_URL` = (Supabaseの Project URL)
   - `SUPABASE_SERVICE_ROLE_KEY` = (Supabaseの service_role Key)
   - `CORS_ORIGIN` = `*` (一旦全許可。後でVercelのURLに絞る)
5. Deploy 完了後、`https://xxx.onrender.com/api/health` にアクセスして `{"ok":true}` が返れば成功

> **Render Free プランの注意**: 15分アクセスがないとスリープし、起動に20〜30秒かかります。常時稼働させたい場合は Starter プラン ($7/月) へ。

### 3. Vercel に Web をデプロイ

1. https://vercel.com/ にサインインし、`web/` の中身を別リポジトリ(または同リポのサブディレクトリ)にプッシュ
2. **New Project** で当該リポジトリを選択
3. Root Directory: `web` (サブディレクトリの場合)
4. **Environment Variables** に追加:
   - `NEXT_PUBLIC_API_BASE` = `https://xxx.onrender.com` (RenderのURL)
5. Deploy 完了後、トップ画面が出れば成功

### 4. (任意) CORSを絞る

Renderの環境変数 `CORS_ORIGIN` を、Vercel の本番URL (例: `https://your-app.vercel.app`) に変更して再デプロイすると、API は Vercel からのリクエストのみ受け付けるようになります。複数許可は `,` 区切り。

## ローカル開発

### Supabaseは作成済みの前提で:

**API側**
```bash
cd api
npm install
cp .env.example .env
# .env を編集して SUPABASE_URL と SUPABASE_SERVICE_ROLE_KEY を入れる
npm run dev
# → http://localhost:10000
```

**Web側**
```bash
cd web
npm install
cp .env.example .env.local
# .env.local の NEXT_PUBLIC_API_BASE を http://localhost:10000 にする
npm run dev
# → http://localhost:3000
```

## 主な機能

| 画面 | パス | 機能 |
|------|------|------|
| トップ | `/` | 各画面へのエントリー |
| ダッシュボード | `/admin` | 未割当数・進行中ルート等の集計 |
| 配送依頼 | `/admin/requests` | 依頼一覧・新規登録 |
| マッチング | `/admin/match` | クラスタ半径と容量を指定して提案生成・ルート確定 |
| ルート管理 | `/admin/routes` | 確定済みルートの詳細・コスト分担 |
| 組合員 | `/admin/members` | 組合員一覧 |
| ドライバー | `/driver` | スマホでルートを順に進行 |

## マッチングロジック

`api/matching.js` に純粋関数として実装。

1. 冷蔵要件でフィルタ
2. 各依頼を seed として、集荷地または配達地が指定半径内の依頼を容量上限まで束ねる
3. グループ内で「全 pickup → 全 delivery」を最近傍法で順序付け
4. Haversine距離で総距離を概算
5. 重量比例でコストを按分（既定 80円/km）

詳細は `docs/DESIGN.md` を参照。

## API 仕様（抜粋）

| メソッド | パス | 用途 |
|----------|------|------|
| GET  | `/api/health` | ヘルスチェック |
| GET  | `/api/members` | 組合員一覧 |
| POST | `/api/members` | 組合員登録 |
| GET  | `/api/drivers` | ドライバー一覧 |
| GET  | `/api/requests?status=pending` | 配送依頼一覧 |
| POST | `/api/requests` | 配送依頼登録 |
| POST | `/api/match/suggest` | マッチング提案生成 |
| POST | `/api/routes` | ルート確定 |
| GET  | `/api/routes/:id` | ルート詳細 |
| POST | `/api/stops/:id/complete` | ストップ完了 |
| GET  | `/api/stats` | ダッシュボード集計 |

## セキュリティ上の注意

このバージョンは **PoC・社内検証用**です。本番運用前に以下を実装してください:

- **認証**: Supabase Auth でメール/パスワード認証を入れて、API側で JWT を検証する
- **RLS強化**: `members` テーブルに `auth_user_id` を持たせ、ユーザーは自社の依頼しか見えないようにする
- **HTTPSのみ**: Vercel/Render はデフォルトHTTPS
- **監査ログ**: 重要操作（ルート確定・キャンセル）を別テーブルに記録
- **Service Role Keyの管理**: Renderの環境変数のみで管理し、絶対にフロントエンドに置かない

## コスト目安

無料枠で運用可能ですが、本格運用時は:

- **Vercel Hobby**: 無料 (商用利用は Pro $20/月)
- **Render Free**: 無料 (スリープ対策に Starter $7/月)
- **Supabase Free**: 500MB / 月50,000認証ユーザー (Pro $25/月で 8GB)

合計で月 **$0〜$50** の範囲。

## ライセンス

MIT
