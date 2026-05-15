'use client';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import PasswordGate from '@/components/PasswordGate';

function AdminNav() {
  const path = usePathname();
  const tabs = [
    { href: '/admin', label: 'ダッシュボード' },
    { href: '/admin/routes', label: 'ルート管理' },
    { href: '/admin/routes/new', label: '＋ 新規ルート' },
  ];
  const logout = () => {
    localStorage.removeItem('coop_password');
    localStorage.removeItem('coop_role');
    location.href = '/';
  };
  return (
    <header className="header">
      <h1>📋 共同配送 管理画面</h1>
      <nav className="nav">
        {tabs.map((t) => (
          <Link key={t.href} href={t.href} className={path === t.href ? 'active' : ''}>
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
