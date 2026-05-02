# 設計ドキュメント (Cloud版)

## なぜこの構成か

### Vercel + Render + Supabase に分けた理由

3つに分けることで、それぞれの強みを活かしつつ、それぞれの**ロックイン**も最小化できます。

| 層 | 選定理由 | 代替候補 |
|----|----------|----------|
| Vercel (フロント) | Next.js の本家。プレビューデプロイが秒速 | Netlify, Cloudflare Pages |
| Render (API) | 無料Dockerホスティング。MCP連携も容易 | Fly.io, Railway, Heroku |
| Supabase (DB+α) | Postgres + Auth + Realtime + Storage が無料枠で揃う | Neon, PlanetScale |

API層を Vercel Functions ではなく Render に切り出した理由:
- マッチングロジックを将来重くしたとき（OSRM呼び出し・最適化ソルバ）に **タイムアウト 10秒制限** に引っかかりにくい
- 常時接続のWebSocketや cron 処理を後で足したくなったとき柔軟
- DB接続を Service Role Key で持つので、サーバーサイドで完結させたい

## ドメインモデル

前回のSQLite版と同一。エンティティは:
- **Member**: 組合員（小売・卸・農家・製造）
- **Driver**: ドライバー（車両容量・冷蔵対応有無）
- **DeliveryRequest**: 配送依頼
- **Route**: 確定済みの1便分の運行
- **RouteStop**: ルート上のストップ
- **CostShare**: 重量按分による組合員別の運行費負担

PostgreSQLへの移行で変えた点:
- `INTEGER` → `BIGSERIAL` / `BIGINT` (Postgres流)
- `TEXT DEFAULT (datetime('now'))` → `TIMESTAMPTZ DEFAULT NOW()`
- `BOOLEAN` 型を `INTEGER 0/1` の代わりに使用
- 外部キー名を Supabase が自動推論できるよう明示的な命名規則に従う

## マッチングアルゴリズム

`api/matching.js` に純粋関数として実装。DBやSupabaseに依存しないため、ユニットテストもしやすく、将来 Vercel Edge Functions に移したくなったときも転用可能です。

### 入力
- 対象日の `pending` 依頼
- パラメータ: クラスタ半径(km)・車両容量(kg)・冷蔵要件

### 手順
1. 冷蔵要件でフィルタ
2. 各依頼を seed としてグループ生成（容量を超えない範囲で半径内の依頼を吸収）
3. グループ内で「全 pickup → 全 delivery」を最近傍法で順序付け
4. Haversine距離で総距離を概算
5. 重量比例で運行費を按分（既定 80円/km）

### 既知の限界
- 時間窓を制約として使っていない
- 複数車両の同時最適化はできない
- 直線距離ベース（実走行距離ではない）

これらは順次 OSRM API 連携や OR-Tools ベースのソルバに置き換えていく前提です。

## データフロー (マッチング → ルート確定)

```
[ユーザー]
  ↓ POST /api/match/suggest { date, max_radius_km, capacity_kg }
[Render API]
  ↓ Supabase: SELECT pending requests for date
[Supabase]
  ↓ 配送依頼一覧
[Render API: matching.js]
  - clusterRequests
  - buildStopSequence
  - estimateDistance
  - calcCostShares
  ↓ proposals[]
[ユーザー: 提案を確認しドライバー選択]
  ↓ POST /api/routes
[Render API]
  - routes に INSERT
  - route_stops に INSERT
  - cost_shares に INSERT
  - delivery_requests を status='matched' に UPDATE
[Supabase] (上記4つ; Postgres トランザクションで実行可能だが現状は逐次)
```

> **注**: 現状はSupabase JS Clientの仕様上、複数テーブルにまたがるトランザクションを単一APIで実現できないため、エラー発生時の整合性回復は呼び出し元での再試行に依存しています。本番運用前に Supabase の `rpc()` (Postgres関数) を使ったトランザクション化を推奨。

## セキュリティ

### 現在の構成
- API は Render の環境変数に Service Role Key を保持し、フロントエンドにはこの鍵を渡さない
- フロントエンド (Vercel) は HTTPS で API (Render) を呼び出す
- Supabase 側は Row Level Security 有効化済み・`service_role` のみ全権限

### 本番化の追加要件
1. **認証**: Supabase Auth でログイン → API側で JWT 検証 → ユーザーIDを `members.auth_user_id` と紐付け
2. **RLS強化**: ユーザーは自社の依頼のみ閲覧・編集可、ドライバーは自分のルートのみ閲覧
3. **CORS厳格化**: `CORS_ORIGIN` を本番URLのみ許可
4. **監査ログ**: ルート確定・キャンセルの操作履歴を別テーブルに記録
5. **シークレット管理**: Render/Vercel の Environment Variables を Vault系ツールに移すことも検討

## 拡張ロードマップ

### Phase 1 (現在 — PoC)
- 基本的な依頼登録・マッチング・ルート管理・ドライバー画面

### Phase 2
- Supabase Auth による認証 / 組合員ごとのアクセス制御
- 時間窓制約の厳密化
- ルートをドラッグ＆ドロップで微調整できるUI
- OSRM (オープンソース経路エンジン) で実走行距離・時間に切替

### Phase 3
- LINE/SMS 通知（依頼登録・ルート確定・ドライバー出発）
- ドライバー画面の PWA化（オフラインでも閲覧可能）
- 月次清算CSV出力（組合員間の振替伝票自動生成）
- POS連携で在庫から自動発注 → 自動配送依頼

### Phase 4
- 機械学習による需要予測（曜日・季節・天候）
- 多目的最適化（コスト・CO2・労働時間のトレードオフ）
- 周辺の協同組合と相互乗り入れ（マルチテナント化）

## 運用コスト試算

無料枠で稼働可能ですが、本格運用時の目安:

| サービス | 無料枠 | 有料移行目安 |
|----------|--------|--------------|
| Vercel | Hobby (個人/非商用) | Pro $20/月 (商用利用時必須) |
| Render | Free (15分でスリープ) | Starter $7/月 (常時稼働) |
| Supabase | Free (DB 500MB / 帯域 5GB) | Pro $25/月 (DB 8GB / バックアップ7日) |

**月コスト想定: $0〜$52** (規模・要件次第)

## 障害対応

### Renderがスリープする問題 (Free Plan)

15分アクセスがないと Render Free はスリープし、コールドスタートに 20〜30秒かかります。対策:

- **Starter プランへ昇格** ($7/月): 常時稼働
- **外部からのヘルスチェック** (UptimeRobot など): 5分おきに `/api/health` を叩く

### Supabase の Realtime 機能を使うか

ドライバーがストップを完了したとき、管理者画面に即座に反映したい場合は Supabase Realtime を活用できます。Phase 2 以降で検討。
