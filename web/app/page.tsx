import Link from 'next/link';

export default function Home() {
  return (
    <>
      <header className="header">
        <h1>🚚 組合員間 共同配送マッチング</h1>
      </header>
      <div className="container">
        <h2>ようこそ</h2>
        <p>用途に応じて画面を選んでください。</p>
        <div className="stats">
          <Link href="/admin" className="stat-card">
            <div className="value">📋</div>
            <div className="label">管理画面</div>
            <div style={{ marginTop: 8, fontSize: 13 }}>
              依頼登録・マッチング・ルート管理
            </div>
          </Link>
          <Link href="/driver" className="stat-card">
            <div className="value">🚚</div>
            <div className="label">ドライバー画面</div>
            <div style={{ marginTop: 8, fontSize: 13 }}>
              当日のルート進行
            </div>
          </Link>
        </div>
      </div>
    </>
  );
}
