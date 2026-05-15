'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { apiGet } from '@/lib/api';

type Stats = {
  today_routes: number;
  today_active: number;
  today_completed: number;
  total_members: number;
  total_drivers: number;
  total_vehicles: number;
};

export default function AdminDashboard() {
  const [stats, setStats] = useState<Stats | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    apiGet<Stats>('/api/stats').then(setStats).catch((e) => setError(e.message));
  }, []);

  return (
    <>
      <h2>本日の状況</h2>
      {error && <div className="error-box">API接続エラー: {error}</div>}
      {!stats && !error && <p>読込中...</p>}
      {stats && (
        <div className="stats">
          <div className="stat-card"><div className="value">{stats.today_routes}</div><div className="label">本日のルート</div></div>
          <div className="stat-card"><div className="value">{stats.today_active}</div><div className="label">進行中/予定</div></div>
          <div className="stat-card"><div className="value">{stats.today_completed}</div><div className="label">本日完了</div></div>
          <div className="stat-card"><div className="value">{stats.total_members}</div><div className="label">組合員数</div></div>
          <div className="stat-card"><div className="value">{stats.total_drivers}</div><div className="label">ドライバー</div></div>
          <div className="stat-card"><div className="value">{stats.total_vehicles}</div><div className="label">車両</div></div>
        </div>
      )}
      <div style={{ display: 'flex', gap: 12, marginTop: 24, flexWrap: 'wrap' }}>
        <Link href="/admin/routes/new" className="btn">＋ 新規ルートを登録</Link>
        <Link href="/admin/routes" className="btn secondary">ルート一覧</Link>
        <Link href="/admin/masters" className="btn secondary">マスタ管理</Link>
        <Link href="/map" className="btn secondary">配送マップを見る</Link>
      </div>
      {stats && stats.total_members === 0 && (
        <div className="card" style={{ marginTop: 16, borderLeft: '4px solid #e67e22' }}>
          <strong>はじめに</strong>
          <p style={{ fontSize: 14, margin: '8px 0 0' }}>
            組合員・車両・ドライバーがまだ登録されていません。
            「マスタ管理」から登録するとルートが作れるようになります。
          </p>
        </div>
      )}
    </>
  );
}
