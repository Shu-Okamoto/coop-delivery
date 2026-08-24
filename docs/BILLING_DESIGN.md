# 課金制度 設計提案（共同配送）

## 方針
料金マスタ1つで「簡易（1か所いくら）」と「従量課金（距離・重量・冷蔵）」を**設定で切替**できる方式にする。
各単価を 0 にすればその要素は無効になるため、モデルを分岐させず1つの計算式で両対応する。

課金対象の単位 = **集荷依頼（`pickup_requests`）の成立**。
（依頼作成時に「概算」、承認時に「確定」を計算・保存）

---

## 1. データモデル

### 料金マスタ `pricing_rules`
| カラム | 型 | 説明 |
|---|---|---|
| id | bigserial PK | |
| name | text | 料金プラン名（例:「2026年度」） |
| active | boolean | 有効な料金プラン（同時に有効は1つ想定） |
| base_fee | integer | 基本料金（依頼1件あたり・円） |
| per_stop_fee | integer | 立ち寄り料（1地点あたり・円） |
| per_km_fee | numeric | 距離単価（円/km） |
| per_kg_fee | numeric | 重量単価（円/kg） |
| refrigerated_mode | text | 冷蔵割増の方式 `rate`(率) / `flat`(定額) / `none` |
| refrigerated_value | numeric | 割増値（rate=0.2で+20%、flat=500で+500円） |
| min_fee | integer | 最低料金（円） |
| rounding | text | 端数処理 `ceil`/`round`/`floor`（円単位） |
| updated_at | timestamptz | |

- **簡易モード例**: `per_stop_fee=300`、他の単価=0 → 「1か所300円」
- **従量モード例**: `base_fee=500, per_km_fee=30, per_kg_fee=10, refrigerated_mode=rate, refrigerated_value=0.2`

### 集荷依頼 `pickup_requests` に追加
| カラム | 型 | 説明 |
|---|---|---|
| distance_km | numeric | 集荷→配達の距離（自動計算） |
| stop_count | integer | 課金対象地点数（集荷＋配達） |
| estimated_fee | integer | 概算料金（依頼作成時） |
| final_fee | integer | 確定料金（承認時） |
| fee_breakdown | jsonb | 内訳（各要素の金額） |
| pricing_rule_id | bigint | 適用した料金プラン |

---

## 2. 計算式

```
distance_km = ハバサイン距離(集荷座標, 配達座標)   ※配達座標が無ければ 0
stop_count  = 1(集荷) + (配達先ありなら 1)

subtotal = base_fee
         + per_stop_fee * stop_count
         + per_km_fee   * distance_km
         + per_kg_fee    * weight_kg

冷蔵の場合:
  rate なら subtotal *= (1 + refrigerated_value)
  flat なら subtotal += refrigerated_value

fee = 端数処理( max(subtotal, min_fee) )
```

内訳 `fee_breakdown` 例:
```json
{
  "base": 500, "stops": 600, "distance": 360, "weight": 120,
  "refrigerated": 316, "subtotal": 1896, "min_applied": false, "total": 1900
}
```

---

## 3. API

| メソッド/パス | 認証 | 説明 |
|---|---|---|
| `GET /api/pricing` | actor | 有効な料金プランを取得（フォームの単価表示・見積りに使用） |
| `PUT /api/pricing` | admin | 料金プランを設定・更新 |
| `POST /api/pricing/quote` | member/actor | パラメータ（座標・重量・冷蔵）から概算料金を返す（フォームのリアルタイム表示用） |

- 依頼作成（`POST /api/schedules/:id/requests`）… 作成時に `estimated_fee` と内訳を計算して保存
- 依頼承認（`POST /api/requests/:id/approve`）… `final_fee` を再計算して確定保存

料金計算は共通関数 `calcFee(rule, {distanceKm, stopCount, weightKg, refrigerated})` に集約。

---

## 4. 画面

- **料金設定**（管理画面・新規タブ「料金設定」）… `pricing_rules` の編集フォーム
- **依頼フォーム**（`/member/recruiting`）… 入力に応じて「概算料金 ¥1,900」をリアルタイム表示（`/api/pricing/quote`）
- **依頼一覧・承認**（管理／作成者）… 各依頼に概算・確定料金と内訳を表示
- **配送履歴 詳細**（`/admin/history/[id]`）… 成立依頼の料金内訳を表示
- **（任意・後続）月次集計**… 組合員ごとの請求額サマリ（依頼者別 / 期間別合計）

---

## 5. 実装フェーズ案
1. **フェーズA**: 料金マスタ＋計算関数＋料金設定画面＋依頼時の概算保存・表示（コア）
2. **フェーズB**: 承認時の確定料金、依頼一覧・履歴での内訳表示
3. **フェーズC（任意）**: 月次集計・CSV出力・按分精算

---

## 6. 要確認事項（実装前に決めたい点）
- **通貨・税**: 円・税込/税抜どちらで扱うか（消費税を別途計算するか）
- **支払者**: 依頼者が支払う前提でよいか（参加者間の按分精算は将来対応でよいか）
- **距離の基準**: 集荷↔配達の直線距離でよいか（実走行距離は地図APIが必要）
- **料金プラン**: 常に1つ（全体共通）でよいか、組合員種別ごとに変えるか
- **無料条件**: 半径内は無料、など特例は必要か

---

この設計で問題なければ、まず**フェーズA**から実装します。修正したい点（単価項目の増減、対象単位、支払者など）があれば教えてください。
