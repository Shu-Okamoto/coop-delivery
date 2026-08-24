'use client';
import { useEffect, useState } from 'react';
import { apiGet, apiPut } from '@/lib/api';

type Rule = {
  id?: number; name: string;
  base_fee: number; per_stop_fee: number; per_km_fee: number; per_kg_fee: number;
  refrigerated_mode: 'none' | 'rate' | 'flat'; refrigerated_value: number;
  min_fee: number; rounding: 'ceil' | 'round' | 'floor';
};

const empty: Rule = {
  name: '標準', base_fee: 0, per_stop_fee: 300, per_km_fee: 0, per_kg_fee: 0,
  refrigerated_mode: 'none', refrigerated_value: 0, min_fee: 0, rounding: 'ceil',
};

export default function PricingPage() {
  const [rule, setRule] = useState<Rule>(empty);
  const [msg, setMsg] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    apiGet<Rule | null>('/api/pricing').then((r) => { if (r) setRule({ ...empty, ...r }); }).catch(() => {});
  }, []);

  const num = (v: string) => (v === '' ? 0 : Number(v));

  const save = async () => {
    setMsg(null); setError(null); setSaving(true);
    try {
      const saved = await apiPut<Rule>('/api/pricing', rule);
      setRule({ ...empty, ...saved });
      setMsg('料金設定を保存しました。');
    } catch (e: any) {
      setError(e.message);
    } finally {
      setSaving(false);
    }
  };

  // プレビュー: 例（2地点・5km・10kg・冷蔵あり）
  const preview = (() => {
    const stops = 2, dist = 5, kg = 10;
    let sub = rule.base_fee + rule.per_stop_fee * stops + rule.per_km_fee * dist + rule.per_kg_fee * kg;
    if (rule.refrigerated_mode === 'rate') sub += sub * rule.refrigerated_value;
    else if (rule.refrigerated_mode === 'flat') sub += rule.refrigerated_value;
    sub = Math.max(sub, rule.min_fee);
    const total = rule.rounding === 'floor' ? Math.floor(sub) : rule.rounding === 'round' ? Math.round(sub) : Math.ceil(sub);
    return total;
  })();

  return (
    <>
      <h2>料金設定</h2>
      <p style={{ fontSize: 13, color: '#7a8a99' }}>
        各単価を 0 にするとその要素は無料になります。<br />
        例）「1か所いくら」→ 立ち寄り料だけ設定。「従量」→ 距離・重量・冷蔵も設定。
      </p>
      {error && <div className="error-box">{error}</div>}
      {msg && <div className="card" style={{ background: '#eafaf1', color: '#1e7e46' }}>{msg}</div>}

      <div className="card">
        <div className="form-grid">
          <label>プラン名
            <input value={rule.name} onChange={(e) => setRule({ ...rule, name: e.target.value })} />
          </label>
          <label>基本料金（円/依頼）
            <input type="number" value={rule.base_fee}
                   onChange={(e) => setRule({ ...rule, base_fee: num(e.target.value) })} />
          </label>
          <label>立ち寄り料（円/地点）
            <input type="number" value={rule.per_stop_fee}
                   onChange={(e) => setRule({ ...rule, per_stop_fee: num(e.target.value) })} />
          </label>
          <label>距離単価（円/km）
            <input type="number" step="0.1" value={rule.per_km_fee}
                   onChange={(e) => setRule({ ...rule, per_km_fee: num(e.target.value) })} />
          </label>
          <label>重量単価（円/kg）
            <input type="number" step="0.1" value={rule.per_kg_fee}
                   onChange={(e) => setRule({ ...rule, per_kg_fee: num(e.target.value) })} />
          </label>
          <label>最低料金（円）
            <input type="number" value={rule.min_fee}
                   onChange={(e) => setRule({ ...rule, min_fee: num(e.target.value) })} />
          </label>
          <label>冷蔵割増の方式
            <select value={rule.refrigerated_mode}
                    onChange={(e) => setRule({ ...rule, refrigerated_mode: e.target.value as Rule['refrigerated_mode'] })}>
              <option value="none">なし</option>
              <option value="rate">率（例: 0.2 = +20%）</option>
              <option value="flat">定額（例: 500 = +500円）</option>
            </select>
          </label>
          <label>冷蔵割増の値
            <input type="number" step="0.01" value={rule.refrigerated_value}
                   disabled={rule.refrigerated_mode === 'none'}
                   onChange={(e) => setRule({ ...rule, refrigerated_value: num(e.target.value) })} />
          </label>
          <label>端数処理
            <select value={rule.rounding}
                    onChange={(e) => setRule({ ...rule, rounding: e.target.value as Rule['rounding'] })}>
              <option value="ceil">切り上げ</option>
              <option value="round">四捨五入</option>
              <option value="floor">切り捨て</option>
            </select>
          </label>
        </div>

        <div style={{ marginTop: 12, padding: 10, background: '#f7f9fa', borderRadius: 6, fontSize: 13 }}>
          試算例（2地点・5km・10kg・冷蔵あり）: <b>¥{preview.toLocaleString()}</b>
        </div>

        <button className="btn" style={{ marginTop: 12 }} onClick={save} disabled={saving}>
          {saving ? '保存中...' : '保存'}
        </button>
      </div>
    </>
  );
}
