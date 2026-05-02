'use client';
import Link from 'next/link';
import { usePathname } from 'next/navigation';

const tabs = [
  { href: '/admin', label: 'ダッシュボード' },
  { href: '/admin/requests', label: '配送依頼' },
  { href: '/admin/match', label: 'マッチング' },
  { href: '/admin/routes', label: 'ルート管理' },
  { href: '/admin/members', label: '組合員' },
];

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  const path = usePathname();
  return (
    <>
      <header className="header">
        <h1>🚚 組合員間 共同配送マッチング</h1>
        <nav className="nav">
          {tabs.map((t) => (
            <Link
              key={t.href}
              href={t.href}
              className={path === t.href ? 'active' : ''}
            >
              {t.label}
            </Link>
          ))}
        </nav>
      </header>
      <div className="container">{children}</div>
    </>
  );
}
