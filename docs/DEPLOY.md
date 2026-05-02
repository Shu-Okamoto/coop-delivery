# デプロイ手順 (詳細版)

3つのサービスを連携させます。順序は **Supabase → Render → Vercel** で固定です（後段が前段のURLを必要とするため）。

## 前提

- GitHubアカウント
- Supabase / Render / Vercel の無料アカウント
- Node.js 18以上のローカル環境（任意。動作確認用）

---

## STEP 1: Supabase

### プロジェクト作成

1. https://supabase.com/dashboard でログイン
2. **New project** をクリック
3. 設定:
   - **Project name**: `coop-delivery` （任意）
   - **Database Password**: 強固なパスワード（後で使うのでメモ）
   - **Region**: `Northeast Asia (Tokyo)`
4. プロジェクト作成完了まで2〜3分待つ

### スキーマ投入

1. 左メニュー → **SQL Editor**
2. **New query** をクリック
3. `db/schema.sql` の中身を貼り付け
4. 右下の **Run** ボタン
5. 成功メッセージを確認

### サンプルデータ投入

1. 同じく SQL Editor で **New query**
2. `db/seed.sql` の中身を貼り付け
3. **Run**
4. 左メニュー → **Table Editor** で `members` などの行が見えれば成功

### キーをメモ

1. 左メニュー → **Project Settings** (歯車) → **API**
2. 以下を控える:
   - **Project URL**: `https://xxxxx.supabase.co`
   - **service_role Key**: 「Reveal」して表示される長い文字列
     - ⚠️ これは **絶対に公開しない** こと（GitHubにpushしないこと）

---

## STEP 2: Render

### コードをGitHubにpush

`api/` ディレクトリの中身（`server.js`, `matching.js`, `package.json`, `render.yaml` 等）をGitHubのリポジトリにpushしてください。モノレポ構成にするなら `coop-delivery-cloud/` 全体でも構いません（後でRenderの Root Directory を `api` に指定すればOK）。

### Web Service 作成

1. https://dashboard.render.com/ でログイン
2. **New +** → **Web Service**
3. **Connect a repository** → 該当リポジトリを選択
4. 設定:
   - **Name**: `coop-delivery-api`
   - **Region**: `Singapore` (日本から最寄り)
   - **Branch**: `main`
   - **Root Directory**: `api`（モノレポの場合）。単独リポなら空欄
   - **Runtime**: `Node`
   - **Build Command**: `npm install`
   - **Start Command**: `npm start`
   - **Instance Type**: `Free`

### 環境変数

下にスクロールし **Environment Variables** で以下を追加:

| Key | Value |
|-----|-------|
| `SUPABASE_URL` | (STEP 1でメモしたProject URL) |
| `SUPABASE_SERVICE_ROLE_KEY` | (STEP 1でメモしたservice_role Key) |
| `CORS_ORIGIN` | `*` (とりあえず全許可。STEP 3後に絞る) |
| `NODE_VERSION` | `20` |

### デプロイ

1. **Create Web Service**
2. 初回ビルドが2〜3分走る
3. 完了したら、画面上部のURL (例: `https://coop-delivery-api.onrender.com`) をブラウザで `/api/health` を付けて開く
4. `{"ok":true,"time":"..."}` が返れば成功
5. このURLをメモ

### トラブルシューティング

- **「環境変数 SUPABASE_URL... が未設定」エラー**: Environment Variables の登録漏れ。再デプロイで反映
- **`/api/health` が500を返す**: Logsタブで確認。多くは Service Role Key の貼り間違い

---

## STEP 3: Vercel

### コードをGitHubにpush

`web/` ディレクトリの中身を別リポジトリ、または同じリポジトリのサブディレクトリにpushします。

### プロジェクト作成

1. https://vercel.com/dashboard でログイン
2. **Add New** → **Project**
3. **Import Git Repository** → 該当リポジトリを選択
4. 設定:
   - **Framework Preset**: `Next.js` （自動検出）
   - **Root Directory**: `web`（モノレポの場合）。単独リポなら空欄
   - **Build Command**: デフォルトのまま
   - **Install Command**: デフォルトのまま

### 環境変数

**Environment Variables** で追加:

| Key | Value | 環境 |
|-----|-------|------|
| `NEXT_PUBLIC_API_BASE` | (STEP 2でメモしたRenderのURL) | Production / Preview / Development |

> ⚠️ `NEXT_PUBLIC_` プレフィックスは必須。これがないと**ブラウザ側JavaScriptに環境変数が露出されません**。

### デプロイ

1. **Deploy** をクリック
2. 初回ビルドが1〜2分
3. 完了するとURLが発行される（例: `https://your-project.vercel.app`）
4. アクセスしてトップ画面が表示されればOK
5. `/admin` を開いて、ダッシュボードに「組合員数 7」「ドライバー 3」などが表示されれば**全構成成功** 🎉

---

## STEP 4: CORS を絞る (任意・推奨)

このままだと API は誰からでもアクセスできる状態です。Vercel の本番URLに限定するには:

1. Render ダッシュボードで API サービスを開く
2. **Environment** → `CORS_ORIGIN` を Vercel のURL（例: `https://your-project.vercel.app`）に変更
3. Save → 自動再デプロイ

複数のオリジンを許可したい場合は `,` 区切り:
```
https://your-project.vercel.app,https://your-custom-domain.jp
```

---

## STEP 5: Supabase の Row Level Security (本番運用時)

`schema.sql` では `service_role` のみ全権限を持つポリシーを設定しています。これは API が Service Role Key でアクセスしているため動きます。

ブラウザから直接 Supabase に接続するように切り替える場合は:
1. Supabase Auth でユーザー登録機能を実装
2. `members` テーブルに `auth_user_id UUID REFERENCES auth.users(id)` を追加
3. ユーザーが自分の組合員レコードしか見えないRLSポリシーを追加

```sql
CREATE POLICY "members can read own record" ON members
  FOR SELECT TO authenticated
  USING (auth_user_id = auth.uid());
```

---

## カスタムドメインを当てる場合

### Vercel
プロジェクトの **Settings → Domains** から追加。CNAMEまたはAレコードを案内通りに設定。

### Render
Web Service の **Settings → Custom Domains** から追加。同様にDNS設定。

カスタムドメインを使うときも `CORS_ORIGIN` の更新を忘れずに。

---

## 監視・ログ

- **Vercel**: Dashboard の **Logs / Analytics** タブ
- **Render**: Dashboard の **Logs** タブ（リアルタイム）
- **Supabase**: Dashboard の **Logs** タブ（DBクエリ・Auth等）

エラー追跡には Sentry などの外部サービス連携を推奨。
