'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { apiGet } from '@/lib/api';

type Stats = {
  pending_requests: number;
  active_routes: number;
  completed_today: number;
  total_members: number;
  total_drivers: number;
};

export default function Dashboard() {
  const [stats, setStats] = useState<Stats | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    apiGet<Stats>('/api/stats')
      .then(setStats)
      .catch((e) => setError(e.message));
  }, []);

  return (
    <>
      <h2>本日の状況</h2>
      {error && <p style={{ color: 'crimson' }}>API接続エラー: {error}</p>}
      {!stats && !error && <p>読込中...</p>}
      {stats && (
        <div className="stats">
          <div className="stat-card"><div className="value">{stats.pending_requests}</div><div className="label">未割当依頼</div></div>
          <div className="stat-card"><div className="value">{stats.active_routes}</div><div className="label">進行中ルート</div></div>
          <div className="stat-card"><div className="value">{stats.completed_today}</div><div className="label">本日完了</div></div>
          <div className="stat-card"><div className="value">{stats.total_members}</div><div className="label">組合員数</div></div>
          <div className="stat-card"><div className="value">{stats.total_drivers}</div><div className="label">ドライバー</div></div>
        </div>
      )}
      <div style={{ display: 'flex', gap: 12, marginTop: 24 }}>
        <Link href="/admin/requests" className="btn">＋ 新規依頼を登録</Link>
        <Link href="/admin/match" className="btn">マッチング提案を生成</Link>
      </div>
    </>
  );
}
