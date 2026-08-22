'use client';
import { useEffect, useState } from 'react';
import { apiGet, apiPost, apiPut, apiDelete } from '@/lib/api';
import { geocodeAddress } from '@/lib/maps';
import type { Member, MemberType } from '@/lib/types';

const TYPE_LABELS: Record<MemberType, string> = {
  store: '小売店',
  wholesaler: '卸売',
  farmer: '生産者',
  manufacturer: '製造',
};

type FormState = {
  id?: number;
  code: string;
  name: string;
  type: MemberType;
  address: string;
  lat: number | '';
  lng: number | '';
  contact_name: string;
  phone: string;
  email: string;
};

const emptyForm: FormState = {
  code: '',
  name: '',
  type: 'store',
  address: '',
  lat: '',
  lng: '',
  contact_name: '',
  phone: '',
  email: '',
};

export default function MembersManager() {
  const [rows, setRows] = useState<Member[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [form, setForm] = useState<FormState>(emptyForm);
  const [editing, setEditing] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [geocoding, setGeocoding] = useState(false);
  const [geoMsg, setGeoMsg] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      setRows(await apiGet<Member[]>('/api/members'));
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  const openNew = () => {
    setForm(emptyForm);
    setEditing(false);
    setShowForm(true);
    setGeoMsg(null);
  };

  const openEdit = (m: Member) => {
    setForm({
      id: m.id,
      code: m.code,
      name: m.name,
      type: m.type,
      address: m.address || '',
      lat: m.lat ?? '',
      lng: m.lng ?? '',
      contact_name: m.contact_name || '',
      phone: m.phone || '',
      email: m.email || '',
    });
    setEditing(true);
    setShowForm(true);
    setGeoMsg(null);
  };

  const runGeocode = async () => {
    if (!form.address.trim()) {
      setGeoMsg('住所を入力してください');
      return;
    }
    setGeocoding(true);
    setGeoMsg(null);
    try {
      const result = await geocodeAddress(form.address);
      if (result) {
        setForm((f) => ({ ...f, lat: result.lat, lng: result.lng }));
        setGeoMsg(`座標を取得しました: ${result.formatted}`);
      } else {
        setGeoMsg('住所から座標が見つかりませんでした。手入力してください');
      }
    } catch (e: any) {
      setGeoMsg('座標取得に失敗: ' + e.message);
    } finally {
      setGeocoding(false);
    }
  };

  const save = async () => {
    if (!form.code.trim() || !form.name.trim()) {
      setError('コードと名称は必須です');
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const payload = {
        code: form.code.trim(),
        name: form.name.trim(),
        type: form.type,
        address: form.address.trim() || null,
        lat: form.lat === '' ? null : Number(form.lat),
        lng: form.lng === '' ? null : Number(form.lng),
        contact_name: form.contact_name.trim() || null,
        phone: form.phone.trim() || null,
        email: form.email.trim() || null,
      };
      if (editing && form.id) {
        await apiPut(`/api/members/${form.id}`, payload);
      } else {
        await apiPost('/api/members', payload);
      }
      setShowForm(false);
      load();
    } catch (e: any) {
      setError(e.message);
    } finally {
      setSaving(false);
    }
  };

  const del = async (m: Member) => {
    if (!confirm(`「${m.name}」を削除しますか？`)) return;
    try {
      await apiDelete(`/api/members/${m.id}`);
      load();
    } catch (e: any) {
      alert('削除できません: ' + e.message);
    }
  };

  // ログインID・パスワードの設定/変更（機能3: 組合員ログイン）
  const setCreds = async (m: Member) => {
    const loginId = window.prompt(
      `「${m.name}」のログインIDを入力してください`,
      m.code || ''
    );
    if (loginId === null) return;
    const password = window.prompt(
      'パスワードを入力してください（4文字以上）。\n空欄のままにすると、ログインIDのみ更新します。'
    );
    if (password === null) return;
    try {
      const payload: any = { login_id: loginId.trim() };
      if (password) payload.password = password;
      await apiPut(`/api/members/${m.id}/credentials`, payload);
      alert('ログイン情報を保存しました');
      load();
    } catch (e: any) {
      alert('保存できません: ' + e.message);
    }
  };

  return (
    <div>
      <div className="toolbar">
        <button className="btn small" onClick={openNew}>＋ 新規登録</button>
        <button className="btn secondary small" onClick={load}>再読込</button>
        <span style={{ color: '#7a8a99', fontSize: 13 }}>{rows.length}件</span>
      </div>

      {error && <div className="error-box">{error}</div>}

      {showForm && (
        <div className="card">
          <h3 style={{ marginTop: 0 }}>{editing ? '組合員・業者を編集' : '組合員・業者を新規登録'}</h3>
          <div className="form-grid">
            <label>コード *
              <input value={form.code} onChange={(e) => setForm({ ...form, code: e.target.value })}
                     placeholder="例: M008" />
            </label>
            <label>名称 *
              <input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })}
                     placeholder="例: 岩国八百屋3号店" />
            </label>
            <label>種別 *
              <select value={form.type}
                      onChange={(e) => setForm({ ...form, type: e.target.value as MemberType })}>
                <option value="store">小売店</option>
                <option value="wholesaler">卸売</option>
                <option value="farmer">生産者</option>
                <option value="manufacturer">製造</option>
              </select>
            </label>
            <label>担当者名
              <input value={form.contact_name}
                     onChange={(e) => setForm({ ...form, contact_name: e.target.value })} />
            </label>
            <label className="full">住所
              <div style={{ display: 'flex', gap: 8, marginTop: 4 }}>
                <input style={{ flex: 1 }} value={form.address}
                       onChange={(e) => setForm({ ...form, address: e.target.value })}
                       placeholder="山口県岩国市..." />
                <button className="btn small" type="button"
                        onClick={runGeocode} disabled={geocoding}>
                  {geocoding ? '取得中...' : '住所から座標取得'}
                </button>
              </div>
            </label>
            {geoMsg && (
              <div className="full" style={{ fontSize: 12, color: '#2c5f2d' }}>{geoMsg}</div>
            )}
            <label>緯度 (lat)
              <input type="number" step="0.000001" value={form.lat}
                     onChange={(e) => setForm({ ...form, lat: e.target.value === '' ? '' : Number(e.target.value) })} />
            </label>
            <label>経度 (lng)
              <input type="number" step="0.000001" value={form.lng}
                     onChange={(e) => setForm({ ...form, lng: e.target.value === '' ? '' : Number(e.target.value) })} />
            </label>
            <label>電話番号
              <input value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} />
            </label>
            <label>メールアドレス
              <input value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
            </label>
          </div>
          <p style={{ fontSize: 12, color: '#7a8a99', marginTop: 8 }}>
            ※ 座標はルート地図表示に使います。「住所から座標取得」ボタンで自動入力できます。
          </p>
          <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
            <button className="btn" onClick={save} disabled={saving}>
              {saving ? '保存中...' : editing ? '更新' : '登録'}
            </button>
            <button className="btn secondary" onClick={() => setShowForm(false)}>キャンセル</button>
          </div>
        </div>
      )}

      {loading ? (
        <p>読込中...</p>
      ) : rows.length === 0 ? (
        <p className="empty">組合員・業者がまだ登録されていません</p>
      ) : (
        <table>
          <thead>
            <tr>
              <th>コード</th><th>名称</th><th>種別</th><th>住所</th>
              <th>座標</th><th>連絡先</th><th>ログイン</th><th></th>
            </tr>
          </thead>
          <tbody>
            {rows.map((m) => (
              <tr key={m.id}>
                <td>{m.code}</td>
                <td>{m.name}</td>
                <td>{TYPE_LABELS[m.type]}</td>
                <td style={{ fontSize: 12 }}>{m.address || '—'}</td>
                <td style={{ fontSize: 12 }}>
                  {m.lat != null && m.lng != null
                    ? `${Number(m.lat).toFixed(4)}, ${Number(m.lng).toFixed(4)}`
                    : <span style={{ color: '#c0392b' }}>未設定</span>}
                </td>
                <td style={{ fontSize: 12 }}>
                  {m.contact_name || ''}{m.phone ? ` / ${m.phone}` : ''}
                </td>
                <td style={{ fontSize: 12 }}>
                  {m.has_login
                    ? <span style={{ color: '#27ae60' }}>✓ 設定済</span>
                    : <span style={{ color: '#95a5a6' }}>未設定</span>}
                </td>
                <td style={{ whiteSpace: 'nowrap' }}>
                  <button className="btn small" onClick={() => openEdit(m)}>編集</button>{' '}
                  <button className="btn secondary small" onClick={() => setCreds(m)}>ログイン設定</button>{' '}
                  <button className="btn danger small" onClick={() => del(m)}>削除</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
