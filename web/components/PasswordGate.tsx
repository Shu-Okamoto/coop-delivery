'use client';
import { useEffect, useState } from 'react';
import { checkAuth } from '@/lib/api';

type Props = {
  role: 'viewer' | 'admin';
  children: React.ReactNode;
};

/**
 * 簡易パスワード認証ゲート。
 * 認証成功すると localStorage にパスワードを保存し、
 * api.ts が X-Viewer-Password ヘッダーに自動付与する。
 */
export default function PasswordGate({ role, children }: Props) {
  const [authed, setAuthed] = useState(false);
  const [checking, setChecking] = useState(true);
  const [input, setInput] = useState('');
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const saved = localStorage.getItem('coop_password');
    const savedRole = localStorage.getItem('coop_role');
    if (saved && (savedRole === role || savedRole === 'admin')) {
      checkAuth(saved, role).then((ok) => {
        setAuthed(ok);
        setChecking(false);
      });
    } else {
      setChecking(false);
    }
  }, [role]);

  const submit = async () => {
    setError(null);
    const ok = await checkAuth(input, role);
    if (ok) {
      localStorage.setItem('coop_password', input);
      localStorage.setItem('coop_role', role);
      setAuthed(true);
    } else {
      setError('パスワードが違います');
    }
  };

  if (checking) {
    return <div style={{ padding: 40, textAlign: 'center' }}>確認中...</div>;
  }

  if (!authed) {
    return (
      <div style={{
        minHeight: '70vh', display: 'flex', alignItems: 'center', justifyContent: 'center',
      }}>
        <div className="card" style={{ maxWidth: 360, width: '100%' }}>
          <h2 style={{ marginTop: 0 }}>
            {role === 'admin' ? '🔑 管理画面ログイン' : '🔒 組合員ログイン'}
          </h2>
          <p style={{ fontSize: 13, color: '#7a8a99' }}>
            {role === 'admin'
              ? '管理者パスワードを入力してください'
              : '配送状況を見るにはパスワードが必要です'}
          </p>
          <input
            type="password"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && submit()}
            placeholder="パスワード"
            style={{
              width: '100%', padding: 10, border: '1px solid #d5dbdb',
              borderRadius: 4, fontSize: 16, marginBottom: 8,
            }}
          />
          {error && <p style={{ color: 'crimson', fontSize: 13, margin: '4px 0' }}>{error}</p>}
          <button className="btn" style={{ width: '100%' }} onClick={submit}>
            ログイン
          </button>
        </div>
      </div>
    );
  }

  return <>{children}</>;
}
