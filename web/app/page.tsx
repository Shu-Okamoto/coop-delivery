import Link from 'next/link';

export default function Home() {
  return (
    <>
      <header className="header">
        <h1>🚚 組合員間 共同配送マップ</h1>
      </header>
      <div className="container">
        <h2>用途を選んでください</h2>
        <div className="stats">
          <Link href="/map" className="stat-card">
            <div className="value">🗺️</div>
            <div className="label">配送マップ（組合員）</div>
            <div style={{ marginTop: 8, fontSize: 13 }}>
              日付ごとの予定ルートと車両現在地を地図で確認
            </div>
          </Link>
          <Link href="/admin" className="stat-card">
            <div className="value">📋</div>
            <div className="label">管理画面</div>
            <div style={{ marginTop: 8, fontSize: 13 }}>
              ルートの登録・編集・削除
            </div>
          </Link>
          <Link href="/driver" className="stat-card">
            <div className="value">🚚</div>
            <div className="label">ドライバー画面</div>
            <div style={{ marginTop: 8, fontSize: 13 }}>
              予定ルート確認・配達記録・完了写真
            </div>
          </Link>
        </div>
      </div>
    </>
  );
}
