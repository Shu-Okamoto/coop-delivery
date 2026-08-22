'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { memberLogin, memberLogout, getMemberSession, memberGet } from '@/lib/api';

type MemberProfile = {
  id: number; code: string; name: string; type: string;
  address?: string; phone?: string; email?: string; contact_name?: string;
};

const typeLabel: Record<string, string> = {
  store: '小売店', wholesaler: '卸売', farmer: '生産者', manufacturer: '製造',
};

export default function MemberPage() {
  const [loggedIn, setLoggedIn] = useState(false);
  const [loginId, setLoginId] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [profile, setProfile] = useState<MemberProfile | null>(null);

  useEffect(() => {
    if (getMemberSession()) {
      setLoggedIn(true);
      memberGet<MemberProfile>('/api/member/me').then(setProfile).catch(() => {
        // トークン失効時はログアウト状態へ
        memberLogout();
        setLoggedIn(false);
      });
    }
  }, []);

  const login = async () => {
    setError(null);
    setBusy(true);
    try {
      await memberLogin(loginId.trim(), password);
      setLoggedIn(true);
      setProfile(await memberGet<MemberProfile>('/api/member/me'));
      setPassword('');
    } catch (e: any) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  };

  const logout = () => {
    memberLogout();
    setLoggedIn(false);
    setProfile(null);
    setLoginId('');
  };

  if (!loggedIn) {
    return (
      <div className="driver-body">
        <header className="header"><h1>🥬 組合員ログイン</h1></header>
        <div style={{ maxWidth: 380, margin: '40px auto', padding: '0 16px' }}>
          <div className="card">
            <h2 style={{ marginTop: 0 }}>ログイン</h2>
            <p style={{ fontSize: 13, color: '#7a8a99' }}>
              管理者から発行されたログインIDとパスワードを入力してください。
            </p>
            <label style={{ display: 'block', marginBottom: 8 }}>ログインID
              <input value={loginId} onChange={(e) => setLoginId(e.target.value)}
                     style={{ width: '100%', padding: 10, marginTop: 4, border: '1px solid #d5dbdb', borderRadius: 6 }} />
            </label>
            <label style={{ display: 'block', marginBottom: 8 }}>パスワード
              <input type="password" value={password} onChange={(e) => setPassword(e.target.value)}
                     onKeyDown={(e) => e.key === 'Enter' && login()}
                     style={{ width: '100%', padding: 10, marginTop: 4, border: '1px solid #d5dbdb', borderRadius: 6 }} />
            </label>
            {error && <p style={{ color: 'crimson', fontSize: 13 }}>{error}</p>}
            <button className="btn" style={{ width: '100%' }} onClick={login} disabled={busy}>
              {busy ? 'ログイン中...' : 'ログイン'}
            </button>
          </div>
          <div style={{ textAlign: 'center', marginTop: 16 }}>
            <Link href="/" style={{ color: '#7a8a99', fontSize: 13 }}>← トップに戻る</Link>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="driver-body">
      <header className="header">
        <h1>🥬 組合員マイページ</h1>
        <nav className="nav">
          <span style={{ fontSize: 14 }}>👤 {profile?.name || ''}</span>
          <span className="spacer" />
          <button onClick={logout}>ログアウト</button>
        </nav>
      </header>
      <main className="driver-main">
        <div className="card">
          <h3 style={{ marginTop: 0 }}>プロフィール</h3>
          {profile ? (
            <div className="form-grid">
              <div><b>名称</b><br />{profile.name}</div>
              <div><b>コード</b><br />{profile.code}</div>
              <div><b>種別</b><br />{typeLabel[profile.type] || profile.type}</div>
              <div><b>担当者</b><br />{profile.contact_name || '—'}</div>
              <div className="full"><b>住所</b><br />{profile.address || '—'}</div>
              <div><b>電話</b><br />{profile.phone || '—'}</div>
              <div><b>メール</b><br />{profile.email || '—'}</div>
            </div>
          ) : <p>読込中...</p>}
        </div>

        <div className="card">
          <h3 style={{ marginTop: 0 }}>メニュー</h3>
          <div style={{ display: 'grid', gap: 8 }}>
            <Link className="btn" href="/member/recruiting">🔎 集荷募集中の予定を見る・依頼する</Link>
            <Link className="btn secondary" href="/member/schedules">🗂 ルート作成・予定作成・依頼承認</Link>
            <Link className="btn secondary" href="/member/requests">📨 自分が出した集荷依頼</Link>
          </div>
        </div>

        <div style={{ textAlign: 'center', marginTop: 12 }}>
          <Link href="/" style={{ color: '#7a8a99', fontSize: 13 }}>← トップに戻る</Link>
        </div>
      </main>
    </div>
  );
}
