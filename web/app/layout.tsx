import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: '組合員間 共同配送マッチング',
  description: '地域組合員の配送便を束ねるマッチングシステム',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ja">
      <body>{children}</body>
    </html>
  );
}
