import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: '組合員間 共同配送マップ',
  description: '配達車両の現在地とルートを地図で確認',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ja">
      <body>{children}</body>
    </html>
  );
}
