'use client';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { apiGet, apiPost } from '@/lib/api';
import type { Member } from '@/lib/types';

type StopRow = { member_id: number; stop_type: 'pickup' | 'delivery' };

export default function AdminNewRoutePage() {
  const router = useRouter();
  const [members, setMembers] = useState<Member[]>([]);
  const [name, setName] = useState('');
  const [notes, setNotes] = useState('');
  const [stops, setStops] = useState<StopRow[]>([
    { member_id: 0, stop_type: 'delivery' },
    { member_id: 0, stop_type: 'delivery' },
  ]);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    apiGet<Member[]>('/api/members').then(setMembers).catch(() => {});
  }, []);

  const withCoords = members.filter((m) => m.lat != null && m.lng != null);
  const update = (i: number, patch: Partial<StopRow>) =>
    setStops((prev) => prev.map((s, idx) => (idx === i ? { ...s, ...patch } : s)));
  const addStop = () => setStops((prev) => [...prev, { member_id: 0, stop_type: 'delivery' }]);
  const removeStop = (i: number) => setStops((prev) => prev.filter((_, idx) => idx !== i));

  const save = async () => {
    setError(null);
    if (!name.trim()) { setError('ルート名を入力してください'); return; }
    const valid = stops
      .map((s) => ({ s, m: members.find((x) => x.id === s.member_id) }))
      .filter((x) => x.m && x.m.lat != null && x.m.lng != null);
    if (valid.length < 2) { setError('経由地（座標のある組合員）を2件以上選んでください'); return; }
    setSaving(true);
    try {
      await apiPost('/api/schedules/draft', {
        name: name.trim(),
        notes: notes.trim() || null,
        stops: valid.map(({ s, m }) => ({
          stop_type: s.stop_type,
          member_id: m!.id, address: m!.address, lat: m!.lat, lng: m!.lng,
        })),
      });
      router.push('/admin/schedules');
    } catch (e: any) {
      setError(e.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <>
      <div style={{ marginBottom: 12 }}>
        <Link href="/admin/schedules" style={{ color: '#7a8a99', fontSize: 13 }}>← 予定作成に戻る</Link>
      </div>
      <h2>ルート作成</h2>
      {error && <div className="error-box">{error}</div>}

      <div className="card">
        <div className="form-grid">
          <label>ルート名 *
            <input value={name} onChange={(e) => setName(e.target.value)}
                   placeholder="例: 午前便（岩国→周南）" />
          </label>
          <label>備考
            <input value={notes} onChange={(e) => setNotes(e.target.value)} />
          </label>
        </div>
      </div>

      <div className="card">
        <h3 style={{ marginTop: 0 }}>経由地（{stops.length}件）</h3>
        <p style={{ fontSize: 12, color: '#7a8a99' }}>
          座標のある組合員を選んでください。半径判定はこれら経由地の重心が中心になります。
        </p>
        {stops.map((s, i) => (
          <div key={i} style={{ display: 'flex', gap: 6, marginBottom: 8, flexWrap: 'wrap' }}>
            <select value={s.stop_type}
                    onChange={(e) => update(i, { stop_type: e.target.value as 'pickup' | 'delivery' })}>
              <option value="pickup">🟠 集荷</option>
              <option value="delivery">🟢 配達</option>
            </select>
            <select style={{ flex: 1, minWidth: 160 }} value={s.member_id}
                    onChange={(e) => update(i, { member_id: +e.target.value })}>
              <option value={0}>組合員を選択...</option>
              {withCoords.map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
            </select>
            <button className="btn danger small" onClick={() => removeStop(i)}>✕</button>
          </div>
        ))}
        <button className="btn secondary small" onClick={addStop}>＋ 経由地を追加</button>
      </div>

      <div style={{ display: 'flex', gap: 8, marginBottom: 40 }}>
        <button className="btn" onClick={save} disabled={saving}>{saving ? '保存中...' : 'ルートを保存'}</button>
        <button className="btn secondary" onClick={() => router.push('/admin/schedules')}>キャンセル</button>
      </div>
    </>
  );
}
