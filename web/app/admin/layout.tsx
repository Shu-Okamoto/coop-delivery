'use client';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import PasswordGate from '@/components/PasswordGate';

function AdminNav() {
  const path = usePathname();
  const tabs = [
    { href: '/admin', label: 'ダッシュボード', exact: true },
    { href: '/admin/routes', label: 'ルート管理', exact: false },
    { href: '/admin/routes/new', label: '＋ 新規ルート', exact: true },
    { href: '/admin/schedules', label: '予定作成', exact: false },
    { href: '/admin/history', label: '配送履歴', exact: false },
    { href: '/admin/pricing', label: '料金設定', exact: false },
    { href: '/admin/masters', label: 'マスタ管理', exact: false },
  ];
  const logout = () => {
    localStorage.removeItem('coop_password');
    localStorage.removeItem('coop_role');
    location.href = '/';
  };
  const isActive = (t: { href: string; exact: boolean }) =>
    t.exact ? path === t.href : path === t.href || path.startsWith(t.href + '/');
  return (
    <header className="header">
      <h1>📋 共同配送 管理画面</h1>
      <nav className="nav">
        {tabs.map((t) => (
          <Link key={t.href} href={t.href} className={isActive(t) ? 'active' : ''}>
            {t.label}
          </Link>
        ))}
        <span className="spacer" />
        <Link href="/map">🗺️ マップ</Link>
        <button onClick={logout}>ログアウト</button>
      </nav>
    </header>
  );
}

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  return (
    <PasswordGate role="admin">
      <AdminNav />
      <div className="container">{children}</div>
    </PasswordGate>
  );
}
