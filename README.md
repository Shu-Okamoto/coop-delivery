# 組合員間 共同配送マップ (地図中心版)

配達車両の現在地とルートを **Google Maps 上で確認** できる共同配送システムです。
**Vercel + Render + Supabase** の3層構成で、無料枠の範囲内で立ち上げられます。

## できること

| 利用者 | 画面 | 機能 |
|--------|------|------|
| 組合員 | `/map` | 日付を指定するとその日の予定ルートを地図＋一覧で表示。車両の現在地が30秒ごとに更新される |
| 管理者 | `/admin` | ルートの登録・編集・削除。経由地は組合員を選ぶと座標が自動入力。地図プレビュー付き |
| ドライバー | `/driver` | PINでログイン → 担当ルート表示 → GPS送信 → 配達記録・完了写真アップロード・配達時刻保存 |

## アーキテクチャ

```
[ブラウザ]
   ↓
[Vercel] Next.js (App Router)          ← フロントエンド (web/)
   ↓ fetch (HTTPS)
[Render] Express API                    ← バックエンド (api/)
   ↓ Supabase JS Client
[Supabase] PostgreSQL + Storage          ← DB + 完了写真 (db/)
   ↑
[Google Maps API]  ← フロントから直接利用 (地図表示・経路描画)
```

| 層 | サービス | プラン | 役割 |
|----|----------|--------|------|
| フロント | Vercel | Hobby (無料) | Next.js 14・地図表示 |
| API | Render | Free Web Service | Express・ルートCRUD・位置記録・写真アップロード |
| DB | Supabase | Free | PostgreSQL + Storage (完了写真) |
| 地図 | Google Maps | 従量課金 (無料枠あり) | Maps JavaScript API + Directions API |

## ディレクトリ構成

```
coop-delivery-cloud/
├── api/                          # Render にデプロイする Express API
│   ├── server.js                 # APIサーバー本体
│   ├── package.json
│   ├── render.yaml
│   └── .env.example
├── web/                          # Vercel にデプロイする Next.js アプリ
│   ├── app/
│   │   ├── page.tsx              # トップ (各画面への入口)
│   │   ├── map/page.tsx          # 配送マップ (組合員向け)
│   │   ├── admin/
│   │   │   ├── layout.tsx        # 管理画面レイアウト + パスワード認証
│   │   │   ├── page.tsx          # ダッシュボード
│   │   │   └── routes/
│   │   │       ├── page.tsx      # ルート一覧
│   │   │       ├── new/page.tsx  # 新規登録
│   │   │       └── [id]/page.tsx # 編集
│   │   ├── driver/page.tsx       # ドライバー画面
│   │   ├── layout.tsx
│   │   └── globals.css
│   ├── components/
│   │   ├── RouteMap.tsx          # Google Maps 表示コンポーネント
│   │   ├── RouteForm.tsx         # ルート登録・編集フォーム (共用)
│   │   └── PasswordGate.tsx      # 簡易パスワード認証ゲート
│   ├── lib/
│   │   ├── api.ts                # API クライアント
│   │   ├── maps.ts               # Google Maps ローダー (npm依存なし)
│   │   └── types.ts              # 共通型定義
│   ├── types/
│   │   └── google-maps-shim.d.ts # Google Maps 最小型定義
│   ├── package.json
│   ├── tsconfig.json
│   ├── next.config.js
│   └── .env.example
├── db/
│   ├── schema.sql                # Supabase スキーマ
│   └── seed.sql                  # サンプルデータ
└── docs/
    ├── DEPLOY.md                 # 詳細なデプロイ手順
    └── DESIGN.md                 # 設計ドキュメント
```

## セットアップ概要

詳細は `docs/DEPLOY.md` を参照。大まかな流れは:

1. **Google Cloud** で Maps JavaScript API と Directions API を有効化し、APIキーを取得
2. **Supabase** でプロジェクト作成 → `db/schema.sql` と `db/seed.sql` を SQL Editor で実行
3. **Render** に `api/` をデプロイ → 環境変数（Supabase URL/Key・パスワード）を設定
4. **Vercel** に `web/` をデプロイ → 環境変数（API URL・Google Maps キー）を設定

## ローカル開発

**API側**
```bash
cd api
npm install
cp .env.example .env
# .env を編集 (SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, VIEWER_PASSWORD, ADMIN_PASSWORD)
npm run dev          # → http://localhost:10000
```

**Web側**
```bash
cd web
npm install
cp .env.example .env.local
# .env.local を編集 (NEXT_PUBLIC_API_BASE, NEXT_PUBLIC_GOOGLE_MAPS_KEY)
npm run dev          # → http://localhost:3000
```

## 認証の仕組み (簡易版)

本バージョンは PoC・社内検証用のため、簡易パスワード認証です。

- **組合員画面** (`/map`): `VIEWER_PASSWORD` で保護
- **管理画面** (`/admin`): `ADMIN_PASSWORD` で保護（VIEWER でもアクセス可だが、CRUD は ADMIN のみ）
- **ドライバー画面** (`/driver`): ドライバーごとの4桁 PIN（`drivers.pin_code`）

パスワードは API 側の環境変数で管理し、フロントは `localStorage` に保持して各リクエストの `X-Viewer-Password` / `X-Driver-Pin` ヘッダーに付与します。

本番運用前には Supabase Auth による正式な認証への移行を推奨します（`docs/DESIGN.md` 参照）。

## 車両位置トラッキングの仕組み

1. ドライバー画面で「GPS送信を開始」を押すと、`navigator.geolocation.watchPosition` で現在地を監視
2. 30秒ごとに `POST /api/positions` で Render API に座標を送信
3. `vehicle_positions` テーブルに追記され、`vehicle_latest_positions` ビューが各ルートの最新位置を保持
4. 組合員の `/map` 画面が30秒ごとに `GET /api/positions/latest` をポーリングして地図に反映

リアルタイム性は「30秒粒度」です。秒単位の追跡が必要になったら Supabase Realtime への移行を検討してください。

## API 仕様（抜粋）

| メソッド | パス | 認証 | 用途 |
|----------|------|------|------|
| GET  | `/api/health` | なし | ヘルスチェック |
| POST | `/api/auth/check` | なし | viewer/admin パスワード検証 |
| POST | `/api/auth/driver` | なし | ドライバー PIN 検証 |
| GET  | `/api/members` | なし | 組合員一覧 |
| GET  | `/api/vehicles` | なし | 車両一覧 |
| GET  | `/api/drivers` | なし | ドライバー一覧 |
| GET  | `/api/routes?date=YYYY-MM-DD` | viewer | ルート一覧（日付フィルタ） |
| GET  | `/api/routes/:id` | viewer | ルート詳細（経由地・最新位置含む） |
| POST | `/api/routes` | admin | ルート登録 |
| PUT  | `/api/routes/:id` | admin | ルート更新 |
| DELETE | `/api/routes/:id` | admin | ルート削除 |
| GET  | `/api/driver/routes` | driver PIN | 自分の担当ルート一覧 |
| GET  | `/api/driver/routes/:id` | driver PIN | 自分の担当ルート詳細 |
| POST | `/api/stops/:id/complete` | なし※ | 経由地完了（写真・メモ・時刻記録） |
| POST | `/api/stops/:id/photo` | なし※ | 完了写真の差し替え |
| POST | `/api/positions` | なし※ | 車両位置の記録 |
| GET  | `/api/positions/latest?date=` | viewer | 指定日の全車両の最新位置 |
| GET  | `/api/positions/history/:routeId` | viewer | ルートの位置履歴 |
| GET  | `/api/stats` | viewer | ダッシュボード集計 |

※ ドライバー画面から呼ばれる前提で、簡易版では認証必須にしていません。本番では `X-Driver-Pin` 必須化を推奨。

## 既知の制約

- ルート更新（PUT）は経由地を「全削除して入れ直し」する実装のため、ドライバーが記録済みの完了状態が編集時に失われる可能性があります。フォーム側で既存の完了情報を保持して送り返すことで緩和していますが、本番では `stop_order` ベースの差分更新が望ましいです。
- 複数テーブルにまたがる更新が単一トランザクションになっていません（Supabase JS Client の制約）。本番では Postgres 関数（`rpc`）化を推奨。
- Render Free プランは15分でスリープし、コールドスタートに20〜30秒かかります。

## ライセンス

MIT
